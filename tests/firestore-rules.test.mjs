import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

let env;
let owner, member, other, guest;
const identity = { owner: 'jonic70134@gmail.com', member: 'member@example.com', other: 'other@example.com' };
const entry = (uid, action, recordId = '', title = 'Test record') => ({ actorId: uid, actorEmail: identity[uid], actorName: uid, action, recordId, recordTitle: title, timestamp: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-treeserv', firestore: { host: '127.0.0.1', port: 8088, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  await env.clearFirestore();
  owner = env.authenticatedContext('owner', { email: identity.owner, email_verified: true }).firestore();
  member = env.authenticatedContext('member', { email: identity.member, email_verified: true }).firestore();
  other = env.authenticatedContext('other', { email: identity.other, email_verified: true }).firestore();
  guest = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async ctx => {
    for (const id of ['existing', 'delete-me', 'immutable', 'no-log']) await setDoc(doc(ctx.firestore(), 'workRecords', id), { authorId: 'member', authorName: 'Original author', locationId: 'site', title: 'Test record', createdAt: new Date(0), notes: 'Original' });
  });
});
after(async () => { await env?.cleanup(); });

function update(db, uid, id, extra = {}) {
  const batch = writeBatch(db), audit = doc(collection(db, 'activityLogs'));
  batch.update(doc(db, 'workRecords', id), { notes: 'Updated', updatedAt: serverTimestamp(), lastAuditId: audit.id, ...extra });
  batch.set(audit, entry(uid, 'update', id));
  return batch.commit();
}
test('guests can read work records but cannot write', async () => {
  await assertSucceeds(getDoc(doc(guest, 'workRecords', 'existing')));
  await assertFails(updateDoc(doc(guest, 'workRecords', 'existing'), { notes: 'bad' }));
});
test('owner can update another author without changing attribution', async () => {
  await assertSucceeds(update(owner, 'owner', 'existing'));
  assert.equal((await getDoc(doc(owner, 'workRecords', 'existing'))).data().authorId, 'member');
});
test('members can update their own record only', async () => {
  await assertSucceeds(update(member, 'member', 'existing'));
  await assertFails(update(other, 'other', 'existing'));
});
test('updates cannot change original author or omit audit', async () => {
  await assertFails(update(owner, 'owner', 'immutable', { authorId: 'owner' }));
  await assertFails(updateDoc(doc(owner, 'workRecords', 'no-log'), { notes: 'unlogged' }));
});
test('create stores route and audit in one batch', async () => {
  const batch = writeBatch(member), audit = doc(collection(member, 'activityLogs'));
  const routePoints = [{ lat: 25.06, lng: 121.6 }, { lat: 25.061, lng: 121.601 }, { lat: 25.062, lng: 121.602 }];
  batch.set(doc(member, 'locations', 'new-site'), { createdBy: 'member', name: 'New site' });
  batch.set(doc(member, 'workRecords', 'new-record'), { authorId: 'member', authorName: 'Member', locationId: 'new-site', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), title: 'Route', routePoints, routeNotes: 'Use main road', lastAuditId: audit.id });
  batch.set(audit, entry('member', 'create', 'new-record'));
  await assertSucceeds(batch.commit());
  assert.deepEqual((await getDoc(doc(guest, 'workRecords', 'new-record'))).data().routePoints, routePoints);
});
test('activity logs are owner-only, append-only and use server time and real actor', async () => {
  const ref = doc(collection(member, 'activityLogs'));
  await assertSucceeds(setDoc(ref, entry('member', 'login')));
  await assertSucceeds(getDocs(collection(owner, 'activityLogs')));
  await assertFails(getDocs(collection(member, 'activityLogs')));
  await assertFails(getDocs(collection(guest, 'activityLogs')));
  await assertFails(updateDoc(doc(owner, 'activityLogs', ref.id), { action: 'logout' }));
  await assertFails(deleteDoc(doc(owner, 'activityLogs', ref.id)));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), entry('owner', 'login')));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), { ...entry('member', 'login'), timestamp: new Date(0) }));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), entry('member', 'update', 'existing')));
});
test('owner delete requires an atomic deletion receipt and activity record', async () => {
  await assertFails(deleteDoc(doc(member, 'workRecords', 'delete-me')));
  await assertFails(deleteDoc(doc(owner, 'workRecords', 'delete-me')));
  const batch = writeBatch(owner), audit = doc(collection(owner, 'activityLogs'));
  batch.delete(doc(owner, 'workRecords', 'delete-me'));
  batch.set(doc(owner, 'recordDeletions', 'delete-me'), { ...entry('owner', 'delete', 'delete-me'), auditId: audit.id });
  batch.set(audit, entry('owner', 'delete', 'delete-me'));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(owner, 'workRecords', 'delete-me'))).exists(), false);
  assert.equal((await getDoc(audit)).data().action, 'delete');
});
test('unverified owner email cannot gain owner access', async () => {
  const unverified = env.authenticatedContext('unverified', { email: identity.owner, email_verified: false }).firestore();
  await assertFails(getDocs(collection(unverified, 'activityLogs')));
});
