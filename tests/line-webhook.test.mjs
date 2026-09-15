import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { handleLineWebhook } from '../src/line/webhook.ts';

const secret = 'local-test-secret';
const config = { channelSecret: secret, channelAccessToken: 'local-test-token' };
const destination = `U${'0'.repeat(32)}`;
const bodyFor = (events = []) => JSON.stringify({ destination, events });
const signatureFor = (body) => createHmac('sha256', secret).update(body).digest('base64');
const requestFor = (body, signature = signatureFor(body)) => new Request('https://example.test/api/line/webhook', {
  method: 'POST', body, headers: { 'x-line-signature': signature },
});
const neverSend = async () => { assert.fail('此案例不得對外發送訊息'); };

test('LINE Verify 空事件通過簽章後成功，不發送訊息', async () => {
  const result = await handleLineWebhook(requestFor(bodyFor()), { channelSecret: secret }, neverSend);
  assert.equal(result.status, 200);
});

test('缺少設定、簽章、偽造或遭修改的內容皆拒絕', async () => {
  const body = bodyFor();
  assert.equal((await handleLineWebhook(requestFor(body), {}, neverSend)).status, 503);
  assert.equal((await handleLineWebhook(new Request('https://example.test', { method: 'POST', body }), config, neverSend)).status, 401);
  assert.equal((await handleLineWebhook(requestFor(body, 'invalid'), config, neverSend)).status, 401);
  assert.equal((await handleLineWebhook(requestFor(`${body} `, signatureFor(body)), config, neverSend)).status, 401);
});

test('限制請求大小，並拒絕有正確簽章但格式錯誤的 JSON', async () => {
  assert.equal((await handleLineWebhook(requestFor('x'.repeat(256 * 1024 + 1)), config, neverSend)).status, 413);
  for (const body of ['{', '{}', JSON.stringify({ destination, events: {} })]) {
    assert.equal((await handleLineWebhook(requestFor(body), config, neverSend)).status, 400);
  }
});

test('一般群組談話不觸發回覆，未啟用的派工按鈕不會假成功', async () => {
  assert.equal((await handleLineWebhook(requestFor(bodyFor([{ type: 'message', message: { type: 'text', text: '明天見' } }])), config, neverSend)).status, 200);
  assert.equal((await handleLineWebhook(requestFor(bodyFor([{ type: 'postback', replyToken: 'test', postback: { data: 'accept' } }])), config, neverSend)).status, 503);
});

const testMessage = { type: 'message', replyToken: 'test-reply', message: { type: 'text', text: '串接測試' } };
test('測試指令只使用 Reply API，內容明確表示尚未啟用派工', async () => {
  let calls = 0;
  const send = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(options.headers.Authorization, 'Bearer local-test-token');
    const payload = JSON.parse(options.body);
    assert.equal(payload.replyToken, 'test-reply');
    assert.match(payload.messages[0].text, /尚未啟用/);
    return new Response('{}', { status: 200 });
  };
  assert.equal((await handleLineWebhook(requestFor(bodyFor([testMessage])), config, send)).status, 200);
  assert.equal(calls, 1);
});

test('回覆失敗不改用主動推播，亦不洩漏上游回應與憑證', async () => {
  let calls = 0;
  const result = await handleLineWebhook(requestFor(bodyFor([testMessage])), config, async () => {
    calls++;
    return new Response('sensitive upstream response', { status: 401 });
  });
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { code: 'line_reply_failed' });
  assert.equal(calls, 1);
  assert.equal((await handleLineWebhook(requestFor(bodyFor([testMessage])), { channelSecret: secret }, neverSend)).status, 503);
});
