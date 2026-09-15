import type { BindingStore, StoreWrite } from './firestore-rest.ts';

export type BindingEvent = {
  type: string; timestamp: number; webhookEventId: string;
  source: { type: 'user'; userId: string };
  message?: { type: string; text?: string };
};

export async function hashBindingCode(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, '0')).join('');
}

export async function processBindingEvent(event: BindingEvent, store: BindingStore, now = Date.now()): Promise<string | undefined> {
  const userId = event.source.userId;
  const text = event.message?.text?.trim() ?? '';
  const match = /^綁定\s+([A-Za-z0-9_-]{1,128})\.([a-f0-9]{32})$/.exec(text);
  const isUnlink = text === '解除綁定';
  if (!match && !isUnlink && !['follow', 'unfollow'].includes(event.type)) {
    return text.startsWith('綁定') ? '綁定碼格式不正確，請完整貼上管理者提供的「綁定 …」訊息。' : undefined;
  }
  const codeHash = match ? await hashBindingCode(match[2]) : '';
  return store.transact(async (get) => {
    const account = await get(`lineAccounts/${userId}`);
    const personnelId = match?.[1] ?? account?.data.personnelId;
    if (typeof personnelId !== 'string') return { value: isUnlink ? '這個 LINE 帳號尚未綁定工作人員。' : undefined, writes: [] };
    const person = await get(`personnel/${personnelId}`);
    const binding = await get(`lineBindings/${personnelId}`);
    const challenge = match || isUnlink ? await get(`lineBindingRequests/${personnelId}`) : undefined;
    if (binding?.data.lastEventId === event.webhookEventId) return { value: undefined, writes: [] };
    if (account && typeof account.data.lastEventAt === 'number' && account.data.lastEventAt >= event.timestamp) return { value: undefined, writes: [] };
    if (match) {
      if (!person || person.data.status !== 'active') return { value: '此人員已封存或不存在，無法綁定。請聯絡管理者。', writes: [] };
      if (!challenge || challenge.data.codeHash !== codeHash || typeof challenge.data.expiresAt !== 'number' || challenge.data.expiresAt <= now) return { value: '綁定碼已失效、已使用或不正確，請管理者重新產生。', writes: [] };
      if ((account && account.data.personnelId !== personnelId) || (binding && binding.data.userId !== userId)) return { value: 'LINE 帳號或人員已有其他綁定。請先由原 LINE 帳號私訊「解除綁定」，再重新操作。', writes: [] };
    } else if (!binding || binding.data.userId !== userId || !person) {
      return { value: undefined, writes: [] };
    }
    const status = isUnlink ? 'unbound' : event.type === 'unfollow' ? 'blocked' : 'bound';
    const writes: StoreWrite[] = [
      { path: `personnel/${personnelId}`, data: { lineStatus: status }, mask: ['lineStatus'], timestampFields: ['lineUpdatedAt'] },
      { path: `lineBindingAudit/${event.webhookEventId}`, data: { personnelId, action: isUnlink ? 'unlink' : match ? 'bind' : event.type, ...(match ? { requestedBy: String(challenge!.data.createdBy) } : {}) }, timestampFields: ['timestamp'] },
    ];
    if (isUnlink) {
      writes.push({ path: `lineBindings/${personnelId}` }, { path: `lineAccounts/${userId}` }, { path: `lineBindingRequests/${personnelId}` });
    } else {
      writes.push(
        { path: `lineBindings/${personnelId}`, data: { userId, lastEventId: event.webhookEventId, lastEventAt: event.timestamp }, timestampFields: ['updatedAt'] },
        { path: `lineAccounts/${userId}`, data: { personnelId, lastEventAt: event.timestamp }, timestampFields: ['updatedAt'] },
      );
      if (match) writes.push({ path: `lineBindingRequests/${personnelId}` });
    }
    return { value: match ? 'LINE 綁定完成，管理者現在可以在派工畫面看到你的綁定狀態。派工邀請功能尚未啟用。' : isUnlink ? '已解除綁定，之後不會透過此綁定寄送工作通知。' : undefined, writes };
  });
}
