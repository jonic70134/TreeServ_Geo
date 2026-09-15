import { z } from 'zod';

export type LineWebhookConfig = {
  channelSecret?: string;
  channelAccessToken?: string;
};

const maxBodyBytes = 256 * 1024;
const webhookSchema = z.object({
  destination: z.string().regex(/^U[0-9a-f]{32}$/),
  events: z.array(z.object({
    type: z.string(),
    replyToken: z.string().optional(),
    message: z.object({ type: z.string(), text: z.string().optional() }).passthrough().optional(),
  }).passthrough()).max(100),
});

function response(status: number, code: string) {
  return Response.json({ code }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function verifySignature(body: Uint8Array<ArrayBuffer>, signature: string, secret: string) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, signatureBytes, body);
}

/** 連線測試接收端；尚未啟用派工、人員綁定或排程。 */
export async function handleLineWebhook(
  request: Request,
  config: LineWebhookConfig,
  sendRequest: typeof fetch = fetch,
) {
  if (request.method !== 'POST') return response(405, 'method_not_allowed');
  if (!config.channelSecret) return response(503, 'line_not_configured');
  const signature = request.headers.get('x-line-signature');
  if (!signature) return response(401, 'invalid_signature');

  let body: Uint8Array<ArrayBuffer> | undefined;
  try {
    body = await readBody(request);
  } catch {
    return response(400, 'invalid_body');
  }
  if (!body) return response(413, 'body_too_large');
  if (!await verifySignature(body, signature, config.channelSecret)) return response(401, 'invalid_signature');

  // LINE 的簽章涵蓋原始位元組，驗證前不得解析或重新序列化 JSON。
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return response(400, 'invalid_payload');
  }
  const payload = webhookSchema.safeParse(input);
  if (!payload.success) return response(400, 'invalid_payload');

  // LINE 後台 Verify 會傳入空 events；通過簽章即可確認接收端。
  // 未實作的派工按鈕不回傳假成功，讓後續正式流程能接續處理。
  if (payload.data.events.some((event) => event.type === 'postback' || event.type === 'accountLink')) {
    return response(503, 'dispatch_not_enabled');
  }
  const testEvents = payload.data.events.filter((event) =>
    event.type === 'message' && event.message?.type === 'text' && event.message.text === '串接測試',
  );
  if (testEvents.length && !config.channelAccessToken) return response(503, 'line_reply_not_configured');
  for (const event of testEvents) {
    if (!event.replyToken) return response(400, 'missing_reply_token');
    try {
      const result = await sendRequest('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.channelAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'TreeServ Geo 已收到串接測試。這是連線測試，派工邀請與回覆功能尚未啟用。' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      // Reply token 只能使用一次；不自動重送，也不改用計費的 Push API。
      if (!result.ok) return response(502, 'line_reply_failed');
    } catch {
      return response(502, 'line_reply_failed');
    }
  }
  return response(200, 'ok');
}
