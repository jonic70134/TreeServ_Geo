import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import test from 'node:test';
import { dispatchInvitation, respondToInvitation } from '../src/line/dispatch.ts';
import { invitationLifetime, invitationStatus, isDispatchable } from '../src/line/dispatch-model.ts';
import { authorizeDispatch, handleDispatchRequest } from '../src/line/dispatch-api.ts';
import { handleLineWebhook } from '../src/line/webhook.ts';

const start = Date.parse('2026-09-15T09:00:00+08:00');
const userId = `U${'1'.repeat(32)}`;
const record = { locationId: 'site', title: '測試工作', workDate: '2026-09-16', scheduleStatus: '已排程', crewAssignments: [{ personnelId: 'person', role: 'ground' }] };
function setup() {
  const documents = new Map(Object.entries({ 'workRecords/record': structuredClone(record), 'locations/site': { name: '測試案場', address: '測試地址' }, 'personnel/person': { name: '測試人員', status: 'active', lineStatus: 'bound' }, 'lineBindings/person': { userId } }));
  return { documents, async transact(operation) {
    const result = await operation(async (path) => documents.has(path) ? { data: structuredClone(documents.get(path)) } : undefined);
    for (const write of result.writes) documents.set(write.path, write.mask ? { ...documents.get(write.path), ...write.data } : { ...write.data });
    return result.value;
  } };
}
const input = () => ({ action: 'send', recordId: 'record', personnelId: 'person', requestId: randomUUID() });
const summary = (store) => [...store.documents.entries()].find(([path]) => path.startsWith('dispatchInvitations/'))[1];
const accepted = async () => new Response('{}');

test('只通知已指派且已綁定的本人；保留固定期限、私密識別與去重', async () => {
  const store = setup(); const request = input(); let count = 0;
  store.documents.get('workRecords/record').siteLead = null;
  const send = async (url, options) => {
    count++; assert.match(url, /message\/push$/); assert.equal(options.headers['X-Line-Retry-Key'], request.requestId);
    const payload = JSON.parse(options.body); assert.equal(payload.to, userId);
    assert.match(payload.messages[1].template.actions[0].data, new RegExp(request.requestId));
    return accepted();
  };
  await dispatchInvitation(request, 'admin', store, 'token', send, () => start);
  await dispatchInvitation(request, 'admin', store, 'token', send, () => start + 1000);
  assert.equal(count, 1); assert.equal(summary(store).expiresAt, start + invitationLifetime);
  assert.equal(summary(store).userId, undefined); assert.equal(summary(store).messageJson, undefined);
  await assert.rejects(dispatchInvitation(input(), 'admin', store, 'token', send, () => start), /已有邀請/);
  assert.equal(count, 1);
});

test('8 小時整立即失效，不依賴排程或畫面開啟；接受與拒絕不可翻轉', async () => {
  for (const [elapsed, expected] of [[invitationLifetime - 1, 'accepted'], [invitationLifetime, 'pending']]) {
    const store = setup(); const request = input();
    await dispatchInvitation(request, 'admin', store, 'token', accepted, () => start);
    const reply = await respondToInvitation(`dispatch:accept:${request.requestId}`, userId, store, () => start + elapsed);
    assert.equal(summary(store).status, expected);
    assert.match(reply, expected === 'accepted' ? /已確認參加/ : /失效/);
    assert.equal(invitationStatus(summary(store), start + invitationLifetime), expected === 'accepted' ? 'accepted' : 'expired');
  }
  const store = setup(); const request = input();
  await dispatchInvitation(request, 'admin', store, 'token', accepted, () => start);
  await respondToInvitation(`dispatch:decline:${request.requestId}`, userId, store, () => start + 1);
  await respondToInvitation(`dispatch:accept:${request.requestId}`, userId, store, () => start + 2);
  assert.equal(summary(store).status, 'declined');
});

test('錯誤帳號、封存、封鎖、移除人員、改期與取消不能接受舊邀請', async () => {
  for (const alter of [
    (store) => store.documents.get('personnel/person').status = 'archived',
    (store) => store.documents.get('personnel/person').lineStatus = 'blocked',
    (store) => store.documents.get('workRecords/record').crewAssignments = [],
    (store) => store.documents.get('workRecords/record').workDate = '2026-09-17',
    (store) => store.documents.get('workRecords/record').scheduleStatus = '取消',
    (store) => store.documents.get('lineBindings/person').userId = `U${'2'.repeat(32)}`,
  ]) {
    const store = setup(); const request = input();
    await dispatchInvitation(request, 'admin', store, 'token', accepted, () => start);
    alter(store);
    assert.match(await respondToInvitation(`dispatch:accept:${request.requestId}`, userId, store, () => start + 1), /失效/);
    assert.equal(summary(store).status, 'pending');
  }
  const store = setup(); const request = input();
  await dispatchInvitation(request, 'admin', store, 'token', accepted, () => start);
  assert.match(await respondToInvitation(`dispatch:accept:${request.requestId}`, `U${'3'.repeat(32)}`, store, () => start), /不屬於您/);
  await dispatchInvitation({ ...request, action: 'cancel' }, 'admin', store, 'token', accepted, () => start);
  await dispatchInvitation(input(), 'admin', store, 'token', accepted, () => start + 1);
  assert.match(await respondToInvitation(`dispatch:accept:${request.requestId}`, userId, store, () => start + 2), /失效/);
});

test('斷線重試保留相同訊息及 retry key；409 視為受理、不延長有效期', async () => {
  const store = setup(); const request = input(); const calls = [];
  const send = async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new Error('timeout');
    return new Response('{}', { status: 409, headers: { 'x-line-accepted-request-id': 'original' } });
  };
  await dispatchInvitation(request, 'admin', store, 'token', send, () => start);
  assert.equal(summary(store).status, 'uncertain');
  await assert.rejects(dispatchInvitation({ ...request, action: 'retry' }, 'admin', store, 'token', send, () => start + 1), /30 秒/);
  await dispatchInvitation({ ...request, action: 'retry' }, 'admin', store, 'token', send, () => start + 30_000);
  assert.equal(summary(store).status, 'pending'); assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['X-Line-Retry-Key'], calls[1].headers['X-Line-Retry-Key']);
  assert.equal(summary(store).expiresAt, start + invitationLifetime);
});

test('過去日期及不存在人員不發送；4xx 不假報成功；回覆競態不遭覆蓋', async () => {
  assert.equal(isDispatchable({ ...record, workDate: '2026-09-14' }, start), false);
  assert.equal(isDispatchable({ ...record, workDate: '2026-02-30' }, start), false);
  const store = setup(); const request = input();
  await assert.rejects(dispatchInvitation({ ...request, personnelId: 'other' }, 'admin', store, 'token', () => assert.fail(), () => start));
  await dispatchInvitation(request, 'admin', store, 'token', async () => new Response('{}', { status: 429 }), () => start);
  assert.equal(summary(store).status, 'failed');
  const retry = input();
  await dispatchInvitation(retry, 'admin', store, 'token', async () => {
    await respondToInvitation(`dispatch:accept:${retry.requestId}`, userId, store, () => start + 1);
    return accepted();
  }, () => start);
  assert.equal(summary(store).status, 'accepted');
});

test('驗證 Firebase 身分與管理員角色；不接受未驗證、停用、一般或匿名帳號', async () => {
  const config = { apiKey: 'test', projectId: 'demo', channelAccessToken: 'token', store: () => assert.fail('未授權不可存取服務資料') };
  const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
  for (const [email, verified, disabled, role, status, allowed] of [
    ['jonic70134@gmail.com', true, false, '', '', true],
    ['jonic70134@gmail.com', false, false, '', '', false],
    ['admin@example.com', true, false, 'admin', 'active', true],
    ['admin@example.com', true, false, 'admin', 'disabled', false],
    ['member@example.com', true, false, 'user', 'active', false],
    ['admin@example.com', true, true, 'admin', 'active', false],
  ]) {
    const send = async (url) => url.includes('accounts:lookup') ? Response.json({ users: [{ localId: 'user', email, emailVerified: verified, disabled }] }) : Response.json({ fields: Object.fromEntries(Object.entries({ uid: 'user', email, role, status }).map(([key, value]) => [key, { stringValue: value }])) });
    assert.equal(await authorizeDispatch(request(), config, send), allowed ? 'user' : undefined);
    if (!allowed) assert.equal((await handleDispatchRequest(request(), config, send)).status, 403);
  }
  assert.equal((await handleDispatchRequest(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), config, () => assert.fail())).status, 403);
});

test('簽章正確的個別 postback 才能回覆；群組不讀資料、不發訊息', async () => {
  const store = setup(); const request = input();
  const clockStart = Date.now(); store.documents.get('workRecords/record').workDate = '2099-09-15';
  await dispatchInvitation(request, 'admin', store, 'token', accepted, () => clockStart);
  const secret = 'secret';
  for (const type of ['group', 'user']) {
    const body = JSON.stringify({ destination: `U${'0'.repeat(32)}`, events: [{ type: 'postback', source: { type, userId }, postback: { data: `dispatch:accept:${request.requestId}` } }] });
    const signed = new Request('https://example.test', { method: 'POST', body, headers: { 'x-line-signature': createHmac('sha256', secret).update(body).digest('base64') } });
    assert.equal((await handleLineWebhook(signed, { channelSecret: secret, channelAccessToken: 'token', bindingStore: () => type === 'group' ? assert.fail() : store }, () => assert.fail())).status, 200);
    assert.equal(summary(store).status, type === 'group' ? 'pending' : 'accepted');
  }
});
