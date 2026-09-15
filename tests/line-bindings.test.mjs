import assert from 'node:assert/strict';
import test from 'node:test';
import { hashBindingCode, processBindingEvent } from '../src/line/bindings.ts';

const userId = `U${'1'.repeat(32)}`;
const random = 'a'.repeat(32);
const event = (extra = {}) => ({ type: 'message', timestamp: 100, webhookEventId: 'event1', source: { type: 'user', userId }, message: { type: 'text', text: `綁定 person1.${random}` }, ...extra });
async function setup(extra = {}) {
  const documents = new Map(Object.entries({
    'personnel/person1': { name: '測試人員', status: 'active' },
    'lineBindingRequests/person1': { codeHash: await hashBindingCode(random), createdBy: 'admin', expiresAt: 2000 }, ...extra,
  }));
  let committed = 0;
  return { documents, get committed() { return committed; }, async transact(operation) {
    const result = await operation(async (path) => documents.has(path) ? { data: { ...documents.get(path) } } : undefined);
    if (result.writes.length) committed++;
    for (const write of result.writes) {
      if (!write.data) documents.delete(write.path);
      else documents.set(write.path, write.mask ? { ...documents.get(write.path), ...write.data } : { ...write.data });
    }
    return result.value;
  } };
}

test('綁定使用固定人員 ID、消耗一次性碼、只公開狀態並保留稽核', async () => {
  const store = await setup();
  assert.match(await processBindingEvent(event(), store, 1000), /綁定完成/);
  assert.equal(store.documents.get('personnel/person1').lineStatus, 'bound');
  assert.equal(store.documents.get('personnel/person1').userId, undefined);
  assert.equal(store.documents.get('lineBindings/person1').userId, userId);
  assert.equal(store.documents.has('lineBindingRequests/person1'), false);
  assert.equal(store.documents.get('lineBindingAudit/event1').requestedBy, 'admin');
  assert.equal(await processBindingEvent(event(), store, 1000), undefined);
  assert.equal(store.committed, 1);
});

test('錯誤、逾時、封存、重複對應與已用過的綁定碼均不能改寫', async () => {
  for (const [extra, now, message] of [
    [{}, 2000, /失效/],
    [{ 'personnel/person1': { status: 'archived' } }, 1000, /封存/],
    [{ 'lineBindingRequests/person1': { codeHash: 'wrong', expiresAt: 2000 } }, 1000, /失效/],
    [{ [`lineAccounts/${userId}`]: { personnelId: 'person2', lastEventAt: 1 } }, 1000, /其他綁定/],
    [{ 'lineBindings/person1': { userId: `U${'2'.repeat(32)}` } }, 1000, /其他綁定/],
  ]) {
    const store = await setup(extra);
    assert.match(await processBindingEvent(event(), store, now), message);
    assert.equal(store.committed, 0);
  }
});

test('封鎖、解除封鎖、過期事件與解除綁定維持狀態一致', async () => {
  const store = await setup();
  await processBindingEvent(event(), store, 1000);
  await processBindingEvent(event({ type: 'unfollow', message: undefined, timestamp: 300, webhookEventId: 'block' }), store, 1000);
  assert.equal(store.documents.get('personnel/person1').lineStatus, 'blocked');
  await processBindingEvent(event({ type: 'follow', message: undefined, timestamp: 200, webhookEventId: 'late' }), store, 1000);
  assert.equal(store.documents.get('personnel/person1').lineStatus, 'blocked');
  await processBindingEvent(event({ type: 'follow', message: undefined, timestamp: 400, webhookEventId: 'follow' }), store, 1000);
  assert.equal(store.documents.get('personnel/person1').lineStatus, 'bound');
  assert.match(await processBindingEvent(event({ message: { type: 'text', text: '解除綁定' }, timestamp: 500, webhookEventId: 'unlink' }), store, 1000), /已解除/);
  assert.equal(store.documents.get('personnel/person1').lineStatus, 'unbound');
  assert.equal(store.documents.has(`lineAccounts/${userId}`), false);
  assert.equal(store.documents.has('lineBindings/person1'), false);
});
