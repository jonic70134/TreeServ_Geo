import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type DraftKind = 'work_record' | 'pruning_plan';

export type DraftDocument<T = Record<string, unknown>> = {
  id: string;
  kind: DraftKind;
  title: string;
  data: T;
  createdBy: string;
  createdByName: string;
  createdAt?: any;
  updatedBy: string;
  updatedByName: string;
  updatedAt?: any;
  saveMode: 'manual' | 'auto';
  sizeBytes: number;
  assetCount: number;
};

export function estimateBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function savedTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export async function saveDraft<T>({
  id,
  kind,
  title,
  data,
  account,
  mode,
  createdBy,
  createdByName,
  assetCount = 0,
  assetBytes = 0,
}: {
  id: string;
  kind: DraftKind;
  title: string;
  data: T;
  account: User;
  mode: 'manual' | 'auto';
  createdBy?: string;
  createdByName?: string;
  assetCount?: number;
  assetBytes?: number;
}) {
  if (!db) throw new Error('草稿資料庫尚未連線。');
  const payload = {
    kind,
    title: title.trim().slice(0, 500) || '未命名草稿',
    data,
    createdBy: createdBy || account.uid,
    createdByName: createdByName || account.displayName || account.email || '管理者',
    updatedBy: account.uid,
    updatedByName: account.displayName || account.email || '管理者',
    updatedAt: serverTimestamp(),
    saveMode: mode,
    sizeBytes: estimateBytes(data) + assetBytes,
    assetCount,
  };
  await setDoc(
    doc(db, 'drafts', id),
    payload,
    { merge: true },
  );
}

export async function saveDraftAsset(draftId: string, assetId: string, dataUrl: string) {
  if (!db) throw new Error('草稿資料庫尚未連線。');
  await setDoc(doc(db, 'drafts', draftId, 'assets', assetId), {
    dataUrl,
    sizeBytes: new TextEncoder().encode(dataUrl).byteLength,
    updatedAt: serverTimestamp(),
  });
}

export async function loadDraftAssets(draftId: string) {
  if (!db) return new Map<string, string>();
  const snapshot = await getDocs(collection(db, 'drafts', draftId, 'assets'));
  return new Map(snapshot.docs.map((entry) => [entry.id, String(entry.data().dataUrl || '')]));
}

export async function removeDraftAsset(draftId: string, assetId: string) {
  if (!db) return;
  await deleteDoc(doc(db, 'drafts', draftId, 'assets', assetId));
}

export async function deleteDraftWithAssets(draftId: string) {
  if (!db) return;
  const assets = await getDocs(collection(db, 'drafts', draftId, 'assets'));
  const batch = writeBatch(db);
  assets.docs.forEach((entry) => batch.delete(entry.ref));
  batch.delete(doc(db, 'drafts', draftId));
  await batch.commit();
}
