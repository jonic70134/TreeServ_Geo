import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, limit, getDocs, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
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
export const userRole = (user: User | null) => user?.emailVerified && user.email === ownerEmail ? 'owner' : user ? 'user' : 'guest';

export async function googleSignIn() {
  if (!auth) throw new Error('Firebase 尚未設定');
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export type AuditAction = 'login' | 'logout' | 'create' | 'edit' | 'update' | 'delete' | 'plan_image_save' | 'plan_pdf_save';
export function auditData(account: User, action: AuditAction, recordId = '', recordTitle = '') {
  return { actorId: account.uid, actorEmail: account.email || '', actorName: account.displayName || '', action, recordId, recordTitle, timestamp: serverTimestamp() };
}
export async function logActivity(account: User, action: AuditAction, recordId = '', recordTitle = '') {
  if (!db) return;
  await addDoc(collection(db, 'activityLogs'), auditData(account, action, recordId, recordTitle));
}
export { signOut, onAuthStateChanged, addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, limit, getDocs, startAfter };
export type { QueryDocumentSnapshot };
