import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export type DriveConnection = {
  accessToken: string;
  email: string;
};

export type DriveItem = {
  id: string;
  name: string;
  webViewLink?: string;
};

function driveError(status: number) {
  if (status === 401) return new Error('Google Drive 連線已過期，請重新連線後再試。');
  if (status === 403) return new Error('Google Drive API 尚未啟用，或帳號未授權檔案存取。');
  return new Error(`Google Drive 儲存失敗（${status}）。`);
}

async function driveFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) throw driveError(response.status);
  return response.json() as Promise<T>;
}

export async function connectGoogleDrive(): Promise<DriveConnection> {
  if (!auth) throw new Error('Firebase 尚未設定，無法連接 Google Drive。');
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);
  provider.setCustomParameters({
    include_granted_scopes: 'true',
    ...(auth.currentUser?.email ? { login_hint: auth.currentUser.email } : {}),
  });
  const result = await signInWithPopup(auth, provider);
  const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!accessToken) throw new Error('Google 未回傳 Drive 存取權，請重新授權。');
  return { accessToken, email: result.user.email ?? '' };
}

export async function ensureProjectFolder(accessToken: string, folderName: string): Promise<DriveItem> {
  const safeName = folderName.trim() || 'TreeServ Geo 計畫書';
  const query = `name = '${safeName.replaceAll("'", "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const fields = encodeURIComponent('files(id,name,webViewLink)');
  const found = await driveFetch<{ files: DriveItem[] }>(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&spaces=drive&fields=${fields}&pageSize=10`,
    accessToken,
  );
  if (found.files[0]) return found.files[0];
  return driveFetch<DriveItem>(`${DRIVE_API}?fields=${encodeURIComponent('id,name,webViewLink')}`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: safeName, mimeType: 'application/vnd.google-apps.folder' }),
  });
}

export async function uploadDriveFile(
  accessToken: string,
  folderId: string,
  name: string,
  file: Blob,
): Promise<DriveItem> {
  const boundary = `treeserv_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify({ name, parents: [folderId] }),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  return driveFetch<DriveItem>(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent('id,name,webViewLink')}`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}
