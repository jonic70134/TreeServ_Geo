import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch, limit, getDocs, startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getRuntimeConfig } from './runtime-config';

const config = getRuntimeConfig()?.firebase ?? {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(config.apiKey && config.projectId && config.authDomain);
const app = firebaseReady ? (getApps()[0] ?? initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const ownerEmail = 'jonic70134@gmail.com';

export type AccessRole = 'owner' | 'admin' | 'user';
export type MemberProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: Exclude<AccessRole, 'owner'>;
  status: 'active' | 'disabled';
};

export class AccessDeniedError extends Error {
  constructor(message = '此 Google 帳號尚未收到 TreeServ Geo 邀請。') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase('en-US');
export const isOwnerAccount = (user: User | null) =>
  Boolean(user?.emailVerified && normalizeEmail(user.email ?? '') === ownerEmail);

export async function googleSignIn() {
  if (!auth) throw new Error('Firebase 尚未設定');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function authorizeAccount(account: User): Promise<AccessRole> {
  if (!db || !account.email || !account.emailVerified) throw new AccessDeniedError('請使用已驗證的 Google 帳號登入。');
  if (isOwnerAccount(account)) return 'owner';

  const email = normalizeEmail(account.email);
  const memberRef = doc(db, 'members', account.uid);
  const member = await getDoc(memberRef);
  if (member.exists()) {
    const data = member.data() as MemberProfile;
    if (data.status === 'active' && normalizeEmail(data.email) === email && ['admin', 'user'].includes(data.role)) return data.role;
    throw new AccessDeniedError('此帳號的 TreeServ Geo 存取權目前已停用。');
  }

  const inviteRef = doc(db, 'accessInvites', email);
  const invite = await getDoc(inviteRef);
  const data = invite.data();
  if (!invite.exists() || data?.status !== 'pending' || data?.email !== email || !['admin', 'user'].includes(data?.role)) {
    throw new AccessDeniedError();
  }

  const batch = writeBatch(db);
  const auditRef = doc(collection(db, 'activityLogs'));
  batch.set(memberRef, {
    uid: account.uid,
    email,
    displayName: account.displayName ?? '',
    role: data.role,
    status: 'active',
    invitedBy: data.invitedBy,
    invitedAt: data.invitedAt,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(inviteRef, { status: 'accepted', acceptedBy: account.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(auditRef, auditData(account, 'invite_accept', account.uid, email));
  await batch.commit();
  return data.role as AccessRole;
}

export type AuditAction =
  | 'login' | 'logout' | 'create' | 'edit' | 'update' | 'delete'
  | 'plan_image_save' | 'plan_pdf_save'
  | 'invite_create' | 'invite_revoke' | 'invite_accept'
  | 'member_role' | 'member_enable' | 'member_disable';

export function auditData(account: User, action: AuditAction, recordId = '', recordTitle = '') {
  return {
    actorId: account.uid,
    actorEmail: normalizeEmail(account.email || ''),
    actorName: account.displayName || '',
    action,
    recordId,
    recordTitle,
    timestamp: serverTimestamp(),
  };
}

export async function logActivity(account: User, action: AuditAction, recordId = '', recordTitle = '') {
  if (!db) return;
  await addDoc(collection(db, 'activityLogs'), auditData(account, action, recordId, recordTitle));
}

export {
  signOut, onAuthStateChanged, addDoc, collection, deleteDoc, doc, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, limit, getDocs, startAfter,
};
export type { QueryDocumentSnapshot, User };
