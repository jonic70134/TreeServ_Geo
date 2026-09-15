import { z } from 'zod';

export const invitationLifetime = 8 * 60 * 60 * 1000;
export const documentId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const assignment = z.object({
  personnelId: documentId,
  role: z.string(),
  nameSnapshot: z.string().optional(),
});
export const dispatchRecordSchema = z.object({
  locationId: documentId,
  title: z.string().max(500),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().optional(),
  scheduleStatus: z.string().optional(),
  siteLead: assignment.nullish(),
  crewAssignments: z.array(assignment).max(100).optional(),
  scheduleSlot: z.string().optional(),
  startDaySlot: z.string().optional(),
  endDaySlot: z.string().optional(),
  meetingTime: z.string().optional(),
  meetingPlace: z.string().optional(),
  workDetails: z.string().optional(),
  safetyNotes: z.string().optional(),
});
export type DispatchRecord = z.infer<typeof dispatchRecordSchema>;
export const invitationSchema = z.object({
  recordId: documentId,
  personnelId: documentId,
  personnelName: z.string(),
  attemptId: z.string().uuid(),
  status: z.enum([
    'sending',
    'pending',
    'accepted',
    'declined',
    'failed',
    'uncertain',
    'cancelled',
    'expired',
  ]),
  startedAt: z.number(),
  expiresAt: z.number(),
  createdBy: z.string(),
  contextKey: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;
export function taipeiDate(now: number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function isDispatchable(record: DispatchRecord, now: number) {
  const parsed = Date.parse(`${record.workDate}T00:00:00+08:00`);
  return (
    Number.isFinite(parsed) &&
    taipeiDate(parsed) === record.workDate &&
    record.workDate >= taipeiDate(now) &&
    !['已完成', '取消'].includes(record.scheduleStatus ?? '')
  );
}
export function dispatchContext(record: DispatchRecord, personId: string) {
  const roles = [record.siteLead, ...(record.crewAssignments ?? [])]
    .filter((item) => item?.personnelId === personId)
    .map((item) => item!.role);
  return JSON.stringify([
    record.locationId,
    record.title,
    record.workDate,
    record.endDate ?? '',
    record.startDaySlot ?? record.scheduleSlot ?? '',
    record.endDaySlot ?? '',
    record.meetingTime ?? '',
    record.meetingPlace ?? '',
    record.workDetails ?? '',
    record.safetyNotes ?? '',
    [...new Set(roles)].sort(),
  ]);
}
export function isAssigned(record: DispatchRecord, personId: string) {
  return [record.siteLead, ...(record.crewAssignments ?? [])].some(
    (item) => item?.personnelId === personId,
  );
}
export function invitationStatus(invitation: Invitation, now: number) {
  return ['sending', 'pending', 'uncertain'].includes(invitation.status) &&
    now >= invitation.expiresAt
    ? 'expired'
    : invitation.status;
}
export const invitationLabels = {
  sending: '傳送結果待確認',
  pending: '待回覆',
  accepted: '已接受',
  declined: '已拒絕・需另找人員',
  failed: '傳送失敗',
  uncertain: '傳送結果待確認',
  cancelled: '已取消',
  expired: '已失效・需另找人員',
};
