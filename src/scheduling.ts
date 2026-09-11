import type { PersonnelAssignment, WorkRecord, WorkScheduleSlot } from './types';

const dayNumber = (value?: string) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
    : undefined;
};

export function localIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isPastDate(value?: string, today = localIsoDate()) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value < today);
}

export function recordDayRange(record: Pick<WorkRecord, 'workDate' | 'endDate' | 'estimatedDays'>) {
  const start = dayNumber(record.workDate);
  if (start === undefined) return undefined;
  const explicitEnd = dayNumber(record.endDate);
  const durationEnd = start + Math.max(0, Math.ceil(record.estimatedDays ?? 1) - 1);
  return { start, end: explicitEnd === undefined ? durationEnd : Math.max(start, explicitEnd) };
}

function slotsOverlap(left: WorkScheduleSlot = '全天', right: WorkScheduleSlot = '全天') {
  return left === '全天' || right === '全天' || left === right;
}

export function recordsOverlap(left: WorkRecord, right: WorkRecord) {
  const leftRange = recordDayRange(left);
  const rightRange = recordDayRange(right);
  if (!leftRange || !rightRange || leftRange.end < rightRange.start || rightRange.end < leftRange.start)
    return false;
  const sameSingleDay =
    leftRange.start === leftRange.end &&
    rightRange.start === rightRange.end &&
    leftRange.start === rightRange.start;
  return !sameSingleDay || slotsOverlap(left.scheduleSlot, right.scheduleSlot);
}

export function recordPersonnel(record: WorkRecord): PersonnelAssignment[] {
  const assignments = [...(record.crewAssignments ?? [])];
  if (record.siteLead && !assignments.some((item) => item.personnelId === record.siteLead!.personnelId))
    assignments.unshift(record.siteLead);
  return assignments;
}

export function conflictPersonnelIds(record: WorkRecord, scheduledRecords: WorkRecord[]) {
  if (!['已排程', '進行中'].includes(record.scheduleStatus ?? '')) return [];
  const selectedIds = new Set(recordPersonnel(record).map((item) => item.personnelId));
  const conflicts = new Set<string>();
  scheduledRecords.forEach((scheduled) => {
    if (scheduled.id === record.id || !recordsOverlap(record, scheduled)) return;
    recordPersonnel(scheduled).forEach((item) => {
      if (selectedIds.has(item.personnelId)) conflicts.add(item.personnelId);
    });
  });
  return [...conflicts];
}
