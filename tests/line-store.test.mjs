import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { createBindingStore } from '../src/line/firestore-rest.ts';
import { hashBindingCode, processBindingEvent } from '../src/line/bindings.ts';
import { dispatchInvitation, respondToInvitation } from '../src/line/dispatch.ts';

test('LINE REST 後端在 Emulator 中以受限身分原子綁定、封鎖與解除', async () => {
  const projectId = 'demo-line-rest';
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8088, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  try {
    await env.clearFirestore();
    const random = 'f'.repeat(32);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'personnel', 'rest-test'), { name: 'REST 測試', status: 'active', skills: ['攀樹'] });
      await setDoc(doc(ctx.firestore(), 'lineBindingRequests', 'rest-test'), { codeHash: await hashBindingCode(random), createdBy: 'admin', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    });
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: 'none' })}.${encode({ sub: 'treeserv-line-bot', user_id: 'treeserv-line-bot', aud: projectId, iss: `https://securetoken.google.com/${projectId}`, iat: now, exp: now + 3600, auth_time: now, lineService: true, firebase: { sign_in_provider: 'custom', identities: {} } })}.`;
    let injectConflict = false;
    const store = createBindingStore({ projectId, apiKey: 'test-key', refreshToken: 'test-refresh' }, async (url, options) => {
      if (url.startsWith('https://securetoken.googleapis.com/')) return Response.json({ id_token: token, user_id: 'treeserv-line-bot', expires_in: '3600' });
      assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/demo-line-rest/'));
      if (url.endsWith(':commit')) {
        const payload = JSON.parse(options.body);
        assert.ok(payload.writes.every((write) => write.currentDocument), '每項寫入必須比對讀取版本或確認文件不存在');
        if (injectConflict) {
          injectConflict = false;
          await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'personnel', 'rest-test'), { status: 'archived' }, { merge: true }); });
        }
      }
      return fetch(url.replace('https://firestore.googleapis.com', 'http://127.0.0.1:8088'), options);
    });
    const event = { type: 'message', timestamp: Date.now(), webhookEventId: 'rest-bind', source: { type: 'user', userId: `U${'4'.repeat(32)}` }, message: { type: 'text', text: `綁定 rest-test.${random}` } };
    assert.match(await processBindingEvent(event, store), /綁定完成/);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const data = (await getDoc(doc(ctx.firestore(), 'personnel', 'rest-test'))).data();
      assert.deepEqual(data.skills, ['攀樹']);
      assert.equal(data.lineStatus, 'bound');
      assert.ok(data.lineUpdatedAt instanceof Timestamp);
      assert.equal((await getDoc(doc(ctx.firestore(), 'lineBindingRequests', 'rest-test'))).exists(), false);
    });
    await processBindingEvent({ ...event, type: 'unfollow', message: undefined, timestamp: event.timestamp + 1, webhookEventId: 'rest-block' }, store);
    await processBindingEvent({ ...event, message: { type: 'text', text: '解除綁定' }, timestamp: event.timestamp + 2, webhookEventId: 'rest-unlink' }, store);
    await env.withSecurityRulesDisabled(async (ctx) => {
      assert.equal((await getDoc(doc(ctx.firestore(), 'personnel', 'rest-test'))).data().lineStatus, 'unbound');
      assert.equal((await getDoc(doc(ctx.firestore(), 'lineBindings', 'rest-test'))).exists(), false);
      await setDoc(doc(ctx.firestore(), 'lineBindingRequests', 'rest-test'), { codeHash: await hashBindingCode(random), createdBy: 'admin', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    });
    injectConflict = true;
    await assert.rejects(processBindingEvent({ ...event, timestamp: event.timestamp + 3, webhookEventId: 'rest-race' }, store), /line_storage_conflict/);
    await env.withSecurityRulesDisabled(async (ctx) => {
      assert.equal((await getDoc(doc(ctx.firestore(), 'personnel', 'rest-test'))).data().lineStatus, 'unbound');
      assert.equal((await getDoc(doc(ctx.firestore(), 'lineBindings', 'rest-test'))).exists(), false);
      assert.equal((await getDoc(doc(ctx.firestore(), 'lineBindingRequests', 'rest-test'))).exists(), true);
    });
    // 同一個 REST adapter 必須正確解碼巢狀人員配置，並原子保存私密邀請及公開摘要。
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'workRecords', 'dispatch-rest'), { locationId: 'site', title: '測試邀請', workDate: '2099-01-01', crewAssignments: [{ personnelId: 'rest-test', role: 'ground' }] });
      await setDoc(doc(ctx.firestore(), 'locations', 'site'), { name: '測試案場', address: '測試地址', lat: 25.1 });
      await setDoc(doc(ctx.firestore(), 'personnel', 'rest-test'), { name: '測試人員', status: 'active', lineStatus: 'bound' });
      await setDoc(doc(ctx.firestore(), 'lineBindings', 'rest-test'), { userId: `U${'4'.repeat(32)}` });
    });
    const request = { recordId: 'dispatch-rest', personnelId: 'rest-test', requestId: crypto.randomUUID(), action: 'send' };
    let sent = 0;
    await dispatchInvitation(request, 'admin', store, 'test-token', async () => { sent++; return new Response('{}'); });
    assert.equal(sent, 1);
    assert.match(await respondToInvitation(`dispatch:accept:${request.requestId}`, `U${'4'.repeat(32)}`, store), /已確認參加/);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const data = (await getDoc(doc(ctx.firestore(), 'dispatchAttempts', request.requestId))).data();
      assert.equal(data.status, 'accepted');
      assert.ok(data.updatedAt instanceof Timestamp);
      const summary = (await getDoc(doc(ctx.firestore(), 'dispatchInvitations', data.slotId))).data();
      assert.equal(summary.status, 'accepted');
      assert.equal(summary.userId, undefined);
    });
  } finally { await env.cleanup(); }
});
