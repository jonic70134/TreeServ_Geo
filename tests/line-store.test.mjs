import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { createBindingStore } from '../src/line/firestore-rest.ts';
import { hashBindingCode, processBindingEvent } from '../src/line/bindings.ts';

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
    const store = createBindingStore({ projectId, apiKey: 'test-key', refreshToken: 'test-refresh' }, async (url, options) => {
      if (url.startsWith('https://securetoken.googleapis.com/')) return Response.json({ id_token: token, user_id: 'treeserv-line-bot', expires_in: '3600' });
      assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/demo-line-rest/'));
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
    });
  } finally { await env.cleanup(); }
});
