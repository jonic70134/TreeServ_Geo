import { z } from 'zod';
import { documentId } from './dispatch-model.ts';
import { dispatchInvitation } from './dispatch.ts';
import type { BindingStore } from './firestore-rest.ts';

type Config = {
  apiKey?: string;
  projectId?: string;
  channelAccessToken?: string;
  store: () => BindingStore;
};
const inputSchema = z
  .object({
    recordId: documentId,
    personnelId: documentId,
    requestId: z.string().uuid(),
    action: z.enum(['send', 'retry', 'cancel']),
  })
  .strict();
export async function authorizeDispatch(
  request: Request,
  config: Config,
  send: typeof fetch = fetch,
) {
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(
    request.headers.get('authorization') ?? '',
  )?.[1];
  if (!token || token.length > 8192) return undefined;
  const lookup = await send(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey!)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!lookup.ok) return undefined;
  const result = z
    .object({
      users: z
        .array(
          z.object({
            localId: documentId,
            email: z.string().email(),
            emailVerified: z.boolean().optional(),
            disabled: z.boolean().optional(),
          }),
        )
        .length(1),
    })
    .safeParse(await lookup.json());
  if (!result.success) return undefined;
  const user = result.data.users[0];
  if (!user.emailVerified || user.disabled) return undefined;
  if (user.email === 'jonic70134@gmail.com') return user.localId;
  // 使用呼叫者自己的 token 查成員資料，不擴大 LINE 服務對成員的權限。
  const member = await send(
    `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/members/${user.localId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!member.ok) return undefined;
  const body = (await member.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  const fields = body.fields;
  return fields?.uid?.stringValue === user.localId &&
    fields.email?.stringValue === user.email &&
    fields.status?.stringValue === 'active' &&
    fields.role?.stringValue === 'admin'
    ? user.localId
    : undefined;
}
export async function handleDispatchRequest(
  request: Request,
  config: Config,
  send: typeof fetch = fetch,
) {
  const reply = (status: number, message: string) =>
    Response.json(
      { message, serverNow: Date.now() },
      {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  if (request.method !== 'POST') return reply(405, '不支援的操作。');
  if (!config.apiKey || !config.projectId || !config.channelAccessToken)
    return reply(503, '通知服務尚未設定完成。');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return reply(415, '請使用派工介面發送。');
  try {
    const actorId = await authorizeDispatch(request, config, send);
    if (!actorId) return reply(403, '請使用管理員帳號重新登入。');
    const reader = request.body?.getReader();
    if (!reader) return reply(400, '缺少邀請資料。');
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return reply(413, '邀請資料過大。');
        }
        parts.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return reply(400, '邀請資料格式不正確。');
    }
    const input = inputSchema.safeParse(raw);
    if (!input.success) return reply(400, '邀請資料格式不正確。');
    await dispatchInvitation(
      input.data,
      actorId,
      config.store(),
      config.channelAccessToken,
      send,
    );
    return reply(200, '操作已處理，請查看最新邀請狀態。');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // 只記錄不含 token、訊息內容或個資的錯誤代碼，方便定位正式站問題。
    console.error(
      'line_dispatch_failure',
      message.slice(0, 160) || 'unknown_error',
    );
    const isDomainError = /^[\u3400-\u9fff]/.test(message);
    const safeCode = /^[a-z][a-z0-9_]{0,63}$/.test(message)
      ? message
      : 'upstream_error';
    return reply(
      isDomainError ? 409 : 503,
      isDomainError
        ? message
        : `通知服務暫時無法完成（${safeCode}），請稍後再試；若顯示結果待確認，請勿直接重發。`,
    );
  }
}
