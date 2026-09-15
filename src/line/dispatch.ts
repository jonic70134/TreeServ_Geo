import type {
  BindingStore,
  StoredDocument,
  StoreWrite,
} from './firestore-rest.ts';
import {
  dispatchRecordSchema,
  dispatchContext,
  invitationSchema,
  invitationStatus,
  invitationLifetime,
  isAssigned,
  isDispatchable,
} from './dispatch-model.ts';
import { hashBindingCode } from './bindings.ts';
import { workRoleLabels, type WorkRole } from '../types.ts';

type Get = (path: string) => Promise<StoredDocument | undefined>;
type DispatchInput = {
  recordId: string;
  personnelId: string;
  requestId: string;
  action: 'send' | 'retry' | 'cancel';
};
const textValue = (value: unknown) => (typeof value === 'string' ? value : '');
const stamp = (
  path: string,
  data: Record<string, unknown>,
  create = false,
): StoreWrite => ({
  path,
  data,
  mask: Object.keys(data),
  timestampFields: create ? ['createdAt', 'updatedAt'] : ['updatedAt'],
});
async function context(
  get: Get,
  recordId: string,
  personId: string,
  now: number,
) {
  const record = dispatchRecordSchema.safeParse(
    (await get(`workRecords/${recordId}`))?.data,
  );
  if (
    !record.success ||
    !isAssigned(record.data, personId) ||
    !isDispatchable(record.data, now)
  )
    throw new Error('工作日期、人員或紀錄已變更，請先儲存有效的派工資料。');
  const person = (await get(`personnel/${personId}`))?.data;
  const binding = (await get(`lineBindings/${personId}`))?.data;
  if (
    person?.status !== 'active' ||
    person.lineStatus !== 'bound' ||
    typeof binding?.userId !== 'string' ||
    !/^U[0-9a-f]{32}$/.test(binding.userId)
  )
    throw new Error('人員尚未綁定 LINE、已封鎖或已封存。');
  return {
    record: record.data,
    person,
    userId: binding.userId,
    key: dispatchContext(record.data, personId),
  };
}
export async function dispatchInvitation(
  input: DispatchInput,
  actorId: string,
  store: BindingStore,
  token: string,
  send: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  const slotId = await hashBindingCode(
    `${input.recordId}\0${input.personnelId}`,
  );
  const slotPath = `dispatchInvitations/${slotId}`;
  const prepared = await store.transact(async (get) => {
    const existing = invitationSchema.safeParse((await get(slotPath))?.data);
    if (input.action === 'cancel') {
      if (!existing.success || existing.data.attemptId !== input.requestId)
        throw new Error('邀請已更新，請重新確認。');
      await get(`dispatchAttempts/${input.requestId}`);
      return {
        value: undefined,
        writes: [
          stamp(slotPath, { status: 'cancelled' }),
          stamp(`dispatchAttempts/${input.requestId}`, {
            status: 'cancelled',
            cancelledBy: actorId,
          }),
        ],
      };
    }
    const now = clock();
    const current = await context(get, input.recordId, input.personnelId, now);
    const attemptPath = `dispatchAttempts/${input.requestId}`;
    const oldAttempt = (await get(attemptPath))?.data;
    if (oldAttempt) {
      if (
        !existing.success ||
        existing.data.attemptId !== input.requestId ||
        oldAttempt.recordId !== input.recordId ||
        oldAttempt.personnelId !== input.personnelId
      )
        throw new Error('邀請已更新，請重新確認。');
      if (
        oldAttempt.contextKey !== current.key ||
        oldAttempt.userId !== current.userId
      )
        throw new Error('派工或綁定資料已變更，請取消舊邀請後重新發送。');
      const status = invitationStatus(existing.data, now);
      if (
        status === 'pending' ||
        status === 'accepted' ||
        status === 'declined'
      )
        return { value: undefined, writes: [] };
      if (!['sending', 'uncertain'].includes(status))
        throw new Error('這份邀請不能重試，請重新發送新邀請。');
      // 首次請求仍可能執行中；重試必須明確操作並間隔至少 30 秒。
      if (
        input.action !== 'retry' ||
        now - Number(oldAttempt.lastTryAt) < 30_000
      )
        throw new Error('請等待 30 秒後，再確認傳送結果。');
      return {
        value: {
          message: String(oldAttempt.messageJson),
          attemptPath,
          requestId: input.requestId,
        },
        writes: [stamp(attemptPath, { lastTryAt: now })],
      };
    }
    if (input.action !== 'send') throw new Error('找不到可重試的邀請。');
    if (
      existing.success &&
      ['sending', 'pending', 'uncertain', 'accepted'].includes(
        invitationStatus(existing.data, now),
      )
    )
      throw new Error('已有邀請，請先確認回覆，或取消舊邀請再重發。');
    const location = (await get(`locations/${current.record.locationId}`))
      ?.data;
    if (!location)
      throw new Error(
        '案場文件不存在，請先儲存案場紀錄；若是舊示範資料，請開啟後重新儲存一次。',
      );
    const expiresAt = now + invitationLifetime;
    const name = textValue(current.person.name) || input.personnelId;
    const deadline = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(expiresAt);
    const record = current.record;
    const roles = [
      ...new Set(
        [record.siteLead, ...(record.crewAssignments ?? [])]
          .filter((item) => item?.personnelId === input.personnelId)
          .map(
            (item) => workRoleLabels[item!.role as WorkRole] ?? '其他支援人員',
          ),
      ),
    ].join('、');
    const message = JSON.stringify({
      to: current.userId,
      messages: [
        {
          type: 'text',
          text: `${name.slice(0, 160)}，您有一份工作邀請\n案場：${textValue(location.name).slice(0, 300)}\n工作：${record.title}\n角色：${roles}\n日期：${record.workDate}${record.endDate && record.endDate !== record.workDate ? `～${record.endDate.slice(0, 10)}` : ''} ${(record.startDaySlot ?? record.scheduleSlot ?? '').slice(0, 10)}\n集合：${(record.meetingTime || '待確認').slice(0, 20)} ${(record.meetingPlace ?? '').slice(0, 500)}\n地址：${textValue(location.address).slice(0, 500)}\n${(record.workDetails ?? '').slice(0, 1000)}\n安全注意：${(record.safetyNotes ?? '').slice(0, 500)}\n請於 ${deadline}（台灣時間）前回覆；發出 8 小時後失效。`.slice(
            0,
            4900,
          ),
        },
        {
          type: 'template',
          altText: '工作邀請：請於 8 小時內接受或拒絕',
          template: {
            type: 'confirm',
            text: '是否參加這次工作？逾時、取消或資料變更後，舊邀請將無法接受。',
            actions: [
              {
                type: 'postback',
                label: '接受工作',
                data: `dispatch:accept:${input.requestId}`,
              },
              {
                type: 'postback',
                label: '無法參加',
                data: `dispatch:decline:${input.requestId}`,
              },
            ],
          },
        },
      ],
    });
    const invitation = {
      recordId: input.recordId,
      personnelId: input.personnelId,
      personnelName: name,
      attemptId: input.requestId,
      status: 'sending',
      startedAt: now,
      expiresAt,
      createdBy: actorId,
      contextKey: current.key,
      respondedAt: 0,
    };
    return {
      value: { message, attemptPath, requestId: input.requestId },
      writes: [
        stamp(slotPath, invitation, !existing.success),
        stamp(
          attemptPath,
          {
            ...invitation,
            slotId,
            userId: current.userId,
            messageJson: message,
            lastTryAt: now,
          },
          true,
        ),
      ],
    };
  });
  if (!prepared) return;
  let status = 'uncertain';
  try {
    const result = await send('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': prepared.requestId,
      },
      body: prepared.message,
      signal: AbortSignal.timeout(8000),
    });
    if (
      result.ok ||
      (result.status === 409 &&
        result.headers.has('x-line-accepted-request-id'))
    )
      status = 'pending';
    else if (
      result.status >= 400 &&
      result.status < 500 &&
      result.status !== 409
    )
      status = 'failed';
  } catch {
    /* 保留不確定狀態，只允許使用相同訊息與 retry key 手動確認。 */
  }
  await store.transact(async (get) => {
    const slot = (await get(slotPath))?.data;
    const attempt = (await get(prepared.attemptPath))?.data;
    if (
      slot?.attemptId !== prepared.requestId ||
      !['sending', 'uncertain'].includes(String(slot.status)) ||
      !attempt
    )
      return { value: undefined, writes: [] };
    return {
      value: undefined,
      writes: [
        stamp(slotPath, { status }),
        stamp(prepared.attemptPath, { status }),
      ],
    };
  });
}

export async function respondToInvitation(
  data: string,
  userId: string,
  store: BindingStore,
  clock: () => number = Date.now,
) {
  const match =
    /^dispatch:(accept|decline):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
      data,
    );
  if (!match) return '無法辨識此邀請，請聯絡管理者。';
  return store.transact(async (get) => {
    const path = `dispatchAttempts/${match[2]}`;
    const attempt = (await get(path))?.data;
    const invalid = {
      value: '此邀請已失效或不屬於您，請聯絡管理者。',
      writes: [] as StoreWrite[],
    };
    if (
      !attempt ||
      attempt.userId !== userId ||
      typeof attempt.slotId !== 'string'
    )
      return invalid;
    const slotPath = `dispatchInvitations/${attempt.slotId}`;
    const slot = invitationSchema.safeParse((await get(slotPath))?.data);
    if (!slot.success || slot.data.attemptId !== match[2]) return invalid;
    const now = clock();
    const status = invitationStatus(slot.data, now);
    if (['expired', 'cancelled', 'failed'].includes(status)) return invalid;
    // 紀錄刪除、日期更改、人員移除或重新綁定，都不能沿用舊按鈕。
    try {
      const current = await context(
        get,
        slot.data.recordId,
        slot.data.personnelId,
        now,
      );
      if (current.key !== slot.data.contextKey || current.userId !== userId)
        return invalid;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('line_'))
        throw error;
      return invalid;
    }
    if (status === 'accepted' || status === 'declined')
      return {
        value:
          status === 'accepted'
            ? '您已接受這份工作邀請。若需變更，請聯絡管理者。'
            : '您已回覆無法參加。若需變更，請聯絡管理者。',
        writes: [],
      };
    if (clock() >= slot.data.expiresAt) return invalid;
    const decision = match[1] === 'accept' ? 'accepted' : 'declined';
    return {
      value:
        decision === 'accepted'
          ? '已確認參加，謝謝您的回覆。'
          : '已記錄無法參加，管理者可在派工畫面查看。',
      writes: [
        stamp(slotPath, { status: decision, respondedAt: now }),
        stamp(path, { status: decision, respondedAt: now }),
      ],
    };
  });
}
