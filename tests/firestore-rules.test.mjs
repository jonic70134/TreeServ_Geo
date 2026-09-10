import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
let owner, admin, member, other, disabled, invitee, guest;
const identity = {
  owner: 'jonic70134@gmail.com',
  admin: 'admin@example.com',
  member: 'member@example.com',
  other: 'other@example.com',
  disabled: 'disabled@example.com',
  invitee: 'invitee@example.com',
};

const entry = (uid, action, recordId = '', title = 'Test record') => ({
  actorId: uid,
  actorEmail: identity[uid],
  actorName: uid,
  action,
  recordId,
  recordTitle: title,
  timestamp: serverTimestamp(),
});

const memberData = (uid, role = 'user', status = 'active') => ({
  uid,
  email: identity[uid],
  displayName: uid,
  role,
  status,
  invitedBy: 'owner',
  invitedAt: Timestamp.fromMillis(1),
  acceptedAt: Timestamp.fromMillis(2),
  updatedAt: Timestamp.fromMillis(2),
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-treeserv',
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await env.clearFirestore();
  owner = env.authenticatedContext('owner', { email: identity.owner, email_verified: true }).firestore();
  admin = env.authenticatedContext('admin', { email: identity.admin, email_verified: true }).firestore();
  member = env.authenticatedContext('member', { email: identity.member, email_verified: true }).firestore();
  other = env.authenticatedContext('other', { email: identity.other, email_verified: true }).firestore();
  disabled = env.authenticatedContext('disabled', { email: identity.disabled, email_verified: true }).firestore();
  invitee = env.authenticatedContext('invitee', { email: identity.invitee, email_verified: true }).firestore();
  guest = env.unauthenticatedContext().firestore();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'members', 'admin'), memberData('admin', 'admin'));
    await setDoc(doc(store, 'members', 'member'), memberData('member'));
    await setDoc(doc(store, 'members', 'other'), memberData('other'));
    await setDoc(doc(store, 'members', 'disabled'), memberData('disabled', 'user', 'disabled'));
    await setDoc(doc(store, 'accessInvites', identity.invitee), {
      email: identity.invitee,
      role: 'user',
      status: 'pending',
      invitedBy: 'owner',
      invitedByEmail: identity.owner,
      invitedAt: Timestamp.fromMillis(3),
      updatedAt: Timestamp.fromMillis(3),
    });
    for (const id of ['existing', 'delete-me', 'delete-by-admin', 'immutable', 'no-log']) {
      await setDoc(doc(store, 'workRecords', id), {
        authorId: 'member', authorName: 'Original author', locationId: 'site',
        title: 'Test record', createdAt: Timestamp.fromMillis(0), notes: 'Original',
      });
    }
  });
});

after(async () => { await env?.cleanup(); });

function updateRecord(db, uid, id, extra = {}) {
  const batch = writeBatch(db);
  const audit = doc(collection(db, 'activityLogs'));
  batch.update(doc(db, 'workRecords', id), {
    notes: 'Updated', title: 'Test record', updatedAt: serverTimestamp(), lastAuditId: audit.id, ...extra,
  });
  batch.set(audit, entry(uid, 'update', id));
  return batch.commit();
}

test('anonymous, uninvited, and disabled accounts cannot read project data', async () => {
  await assertFails(getDoc(doc(guest, 'workRecords', 'existing')));
  const stranger = env.authenticatedContext('stranger', { email: 'stranger@example.com', email_verified: true }).firestore();
  await assertFails(getDoc(doc(stranger, 'workRecords', 'existing')));
  await assertFails(getDoc(doc(disabled, 'workRecords', 'existing')));
});

test('pending invite can only be accepted by the matching verified Google account', async () => {
  await assertFails(getDoc(doc(invitee, 'workRecords', 'existing')));
  const batch = writeBatch(invitee);
  const audit = doc(collection(invitee, 'activityLogs'));
  const inviteRef = doc(invitee, 'accessInvites', identity.invitee);
  const seededInvite = (await getDoc(inviteRef)).data();
  batch.set(doc(invitee, 'members', 'invitee'), {
    uid: 'invitee', email: identity.invitee, displayName: 'Invitee', role: 'user', status: 'active',
    invitedBy: seededInvite.invitedBy, invitedAt: seededInvite.invitedAt,
    acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  batch.update(inviteRef, { status: 'accepted', acceptedBy: 'invitee', acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(audit, entry('invitee', 'invite_accept', 'invitee', identity.invitee));
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(invitee, 'workRecords', 'existing')));
});

test('only owner can invite users or administrators', async () => {
  async function invite(db, uid, email, role) {
    const batch = writeBatch(db);
    const audit = doc(collection(db, 'activityLogs'));
    batch.set(doc(db, 'accessInvites', email), {
      email, role, status: 'pending', invitedBy: uid, invitedByEmail: identity[uid],
      invitedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(audit, entry(uid, 'invite_create', email, email));
    return batch.commit();
  }
  await assertFails(invite(admin, 'admin', 'new-user@example.com', 'user'));
  await assertFails(invite(admin, 'admin', 'new-admin@example.com', 'admin'));
  await assertSucceeds(invite(owner, 'owner', 'owner-admin@example.com', 'admin'));
});

test('owner and admin can update another author without changing attribution', async () => {
  await assertSucceeds(updateRecord(owner, 'owner', 'existing'));
  await assertSucceeds(updateRecord(admin, 'admin', 'existing'));
  assert.equal((await getDoc(doc(owner, 'workRecords', 'existing'))).data().authorId, 'member');
});

test('members can update their own record only', async () => {
  await assertSucceeds(updateRecord(member, 'member', 'existing'));
  await assertFails(updateRecord(other, 'other', 'existing'));
});

test('updates cannot change original author or omit audit', async () => {
  await assertFails(updateRecord(owner, 'owner', 'immutable', { authorId: 'owner' }));
  await assertFails(updateDoc(doc(owner, 'workRecords', 'no-log'), { notes: 'unlogged' }));
});

test('create stores route and audit in one batch', async () => {
  const batch = writeBatch(member);
  const audit = doc(collection(member, 'activityLogs'));
  const routePoints = [{ lat: 25.06, lng: 121.6 }, { lat: 25.061, lng: 121.601 }, { lat: 25.062, lng: 121.602 }];
  batch.set(doc(member, 'locations', 'new-site'), { createdBy: 'member', name: 'New site' });
  batch.set(doc(member, 'workRecords', 'new-record'), {
    authorId: 'member', authorName: 'Member', locationId: 'new-site',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), title: 'Route',
    routePoints, routeNotes: 'Use main road', lastAuditId: audit.id,
  });
  batch.set(audit, entry('member', 'create', 'new-record'));
  await assertSucceeds(batch.commit());
  assert.deepEqual((await getDoc(doc(member, 'workRecords', 'new-record'))).data().routePoints, routePoints);
});

test('activity logs are admin-readable, append-only, and actor-bound', async () => {
  const ref = doc(collection(member, 'activityLogs'));
  await assertSucceeds(setDoc(ref, entry('member', 'login')));
  await assertSucceeds(getDocs(collection(owner, 'activityLogs')));
  await assertSucceeds(getDocs(collection(admin, 'activityLogs')));
  await assertFails(getDocs(collection(member, 'activityLogs')));
  await assertFails(getDocs(collection(guest, 'activityLogs')));
  await assertFails(updateDoc(doc(owner, 'activityLogs', ref.id), { action: 'logout' }));
  await assertFails(deleteDoc(doc(owner, 'activityLogs', ref.id)));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), entry('owner', 'login')));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), { ...entry('member', 'login'), timestamp: new Date(0) }));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), entry('member', 'update', 'existing')));
});

test('owner and admin can append plan image and PDF export activity', async () => {
  await assertSucceeds(setDoc(doc(collection(owner, 'activityLogs')), entry('owner', 'plan_image_save', '', 'Community pruning plan')));
  await assertSucceeds(setDoc(doc(collection(owner, 'activityLogs')), entry('owner', 'plan_pdf_save', '', 'Community pruning plan')));
  await assertSucceeds(setDoc(doc(collection(admin, 'activityLogs')), entry('admin', 'plan_pdf_save', '', 'Community pruning plan')));
  await assertFails(setDoc(doc(collection(member, 'activityLogs')), entry('member', 'plan_pdf_save', '', 'Community pruning plan')));
});

test('owner and admin deletion require an atomic receipt and activity record', async () => {
  await assertFails(deleteDoc(doc(member, 'workRecords', 'delete-me')));
  await assertFails(deleteDoc(doc(owner, 'workRecords', 'delete-me')));
  const batch = writeBatch(owner);
  const audit = doc(collection(owner, 'activityLogs'));
  batch.delete(doc(owner, 'workRecords', 'delete-me'));
  batch.set(doc(owner, 'recordDeletions', 'delete-me'), { ...entry('owner', 'delete', 'delete-me'), auditId: audit.id });
  batch.set(audit, entry('owner', 'delete', 'delete-me'));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(owner, 'workRecords', 'delete-me'))).exists(), false);

  const adminBatch = writeBatch(admin);
  const adminAudit = doc(collection(admin, 'activityLogs'));
  adminBatch.delete(doc(admin, 'workRecords', 'delete-by-admin'));
  adminBatch.set(doc(admin, 'recordDeletions', 'delete-by-admin'), { ...entry('admin', 'delete', 'delete-by-admin'), auditId: adminAudit.id });
  adminBatch.set(adminAudit, entry('admin', 'delete', 'delete-by-admin'));
  await assertSucceeds(adminBatch.commit());
  assert.equal((await getDoc(doc(owner, 'workRecords', 'delete-by-admin'))).exists(), false);
});

test('owner and admin manage other member roles and status, but admin cannot alter itself', async () => {
  const ownerBatch = writeBatch(owner);
  const ownerAudit = doc(collection(owner, 'activityLogs'));
  ownerBatch.update(doc(owner, 'members', 'other'), { role: 'admin', updatedAt: serverTimestamp() });
  ownerBatch.set(ownerAudit, entry('owner', 'member_role', 'other', identity.other));
  await assertSucceeds(ownerBatch.commit());

  const adminBatch = writeBatch(admin);
  const adminAudit = doc(collection(admin, 'activityLogs'));
  adminBatch.update(doc(admin, 'members', 'member'), { status: 'disabled', updatedAt: serverTimestamp() });
  adminBatch.set(adminAudit, entry('admin', 'member_disable', 'member', identity.member));
  await assertSucceeds(adminBatch.commit());
  const otherAdminBatch = writeBatch(admin);
  const otherAdminAudit = doc(collection(admin, 'activityLogs'));
  otherAdminBatch.update(doc(admin, 'members', 'other'), { status: 'disabled', updatedAt: serverTimestamp() });
  otherAdminBatch.set(otherAdminAudit, entry('admin', 'member_disable', 'other', identity.other));
  await assertSucceeds(otherAdminBatch.commit());
  await assertFails(updateDoc(doc(admin, 'members', 'admin'), { status: 'disabled', updatedAt: serverTimestamp() }));
});

test('unverified owner email cannot gain owner access', async () => {
  const unverified = env.authenticatedContext('unverified', { email: identity.owner, email_verified: false }).firestore();
  await assertFails(getDocs(collection(unverified, 'activityLogs')));
  await assertFails(getDoc(doc(unverified, 'workRecords', 'existing')));
});

test('owner and admin can persist edits to imported static records; members cannot', async () => {
  async function persist(db, uid, id) {
    const batch = writeBatch(db);
    const audit = doc(collection(db, 'activityLogs'));
    batch.set(doc(db, 'workRecords', id), {
      authorId: uid, authorName: 'Original imported author', locationId: 'import-site',
      sourceImported: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      lastAuditId: audit.id, title: 'Imported', notes: 'Updated imported work',
    });
    batch.set(audit, entry(uid, 'update', id));
    return batch.commit();
  }
  await assertSucceeds(persist(owner, 'owner', 'import-record'));
  await assertSucceeds(persist(admin, 'admin', 'import-record-admin'));
  await assertFails(persist(member, 'member', 'import-not-owner'));
});

test('deleting an unpersisted import is private to authorized accounts', async () => {
  const batch = writeBatch(owner);
  const audit = doc(collection(owner, 'activityLogs'));
  batch.set(doc(owner, 'importedRecordStates', 'import-delete'), { deleted: true, updatedAt: serverTimestamp(), auditId: audit.id });
  batch.set(doc(owner, 'recordDeletions', 'import-delete'), { ...entry('owner', 'delete', 'import-delete'), auditId: audit.id });
  batch.set(audit, entry('owner', 'delete', 'import-delete'));
  await assertSucceeds(batch.commit());
  const marker = (await assertSucceeds(getDoc(doc(owner, 'importedRecordStates', 'import-delete')))).data();
  assert.equal(marker.deleted, true);
  assert.equal(marker.actorEmail, undefined);
  await assertFails(getDoc(doc(guest, 'importedRecordStates', 'import-delete')));
  await assertFails(setDoc(doc(member, 'importedRecordStates', 'illegal'), { deleted: true, updatedAt: serverTimestamp(), auditId: 'fake' }));
});
