'use client';

import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import MapRounded from '@mui/icons-material/MapRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import type { Personnel, SiteLocation, WorkRecord } from './types';
import { localIsoDate, recordDayRange, recordPersonnel, recordsOverlap } from './scheduling';

type Props = {
  records: WorkRecord[];
  locations: SiteLocation[];
  personnel: Personnel[];
  onOpen: (record: WorkRecord) => void;
};
type Mode = 'day' | 'week' | 'month';

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};
const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

export default function DispatchOverview({ records, locations, personnel, onOpen }: Props) {
  const today = localIsoDate();
  const [mode, setMode] = useState<Mode>('week');
  const [focusDate, setFocusDate] = useState(today);
  const days = useMemo(() => {
    const focus = new Date(`${focusDate}T12:00:00`);
    if (mode === 'day') return [focus];
    if (mode === 'week') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(focus), index));
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
    return Array.from({ length: new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate() }, (_, index) => addDays(first, index));
  }, [mode, focusDate]);
  const activeRecords = records.filter((record) => ['已排程', '進行中'].includes(record.scheduleStatus ?? ''));
  const conflicts = useMemo(() => {
    const ids = new Set<string>();
    activeRecords.forEach((left, index) => activeRecords.slice(index + 1).forEach((right) => {
      if (!recordsOverlap(left, right)) return;
      const rightIds = new Set(recordPersonnel(right).map((item) => item.personnelId));
      recordPersonnel(left).forEach((item) => { if (rightIds.has(item.personnelId)) ids.add(`${left.id}:${right.id}:${item.personnelId}`); });
    }));
    return ids;
  }, [activeRecords]);
  const conflictedPersonnel = new Set([...conflicts].map((item) => item.split(':')[2]));
  const locationName = (record: WorkRecord) => locations.find((item) => item.id === record.locationId)?.name ?? '未載入案場';
  const recordsOnDay = (date: Date) => {
    const target = dayNumber(date);
    return activeRecords.filter((record) => {
      const range = recordDayRange(record);
      return range && range.start <= target && range.end >= target;
    });
  };
  const visiblePersonnel = personnel.filter((item) => item.status === 'active' || activeRecords.some((record) => recordPersonnel(record).some((person) => person.personnelId === item.id)));

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box><Typography variant="h4">派工總覽與案場行事曆</Typography><Typography color="text.secondary">僅「已排程」與「進行中」納入衝突提示；提示不會阻擋儲存。</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Stack direction="row" spacing={1}>{(['day', 'week', 'month'] as Mode[]).map((item) => <Button key={item} variant={mode === item ? 'contained' : 'outlined'} onClick={() => setMode(item)}>{{ day: '每日', week: '每週', month: '每月' }[item]}</Button>)}</Stack>
          <TextField size="small" type="date" label="查看日期" value={focusDate} onChange={(event) => setFocusDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        {conflictedPersonnel.size > 0 && <Alert severity="warning" icon={<WarningAmberRounded />}>目前有 {conflictedPersonnel.size} 位人員在重疊時段被安排到不同工作紀錄，已在姓名旁標示。</Alert>}
        {mode === 'week' ? (
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 980, display: 'grid', gridTemplateColumns: '180px repeat(7, minmax(110px, 1fr))', borderTop: 1, borderLeft: 1, borderColor: 'divider' }}>
              <Box sx={{ p: 1.5, borderRight: 1, borderBottom: 1, borderColor: 'divider', fontWeight: 750 }}>工作人員</Box>
              {days.map((date) => {
                const isPast = localIsoDate(date) < today;
                return <Box key={localIsoDate(date)} sx={{ p: 1.5, borderRight: 1, borderBottom: 1, borderColor: 'divider', fontWeight: 750, bgcolor: isPast ? 'action.disabledBackground' : undefined }}>{date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })}{isPast && <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">已過日期</Typography>}</Box>;
              })}
              {visiblePersonnel.map((person) => <Box key={person.id} sx={{ display: 'contents' }}>
                <Box sx={{ p: 1.5, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: person.status === 'archived' ? 'action.disabledBackground' : undefined }}><Typography sx={{ fontWeight: 700 }}>{person.name} {person.code}</Typography>{conflictedPersonnel.has(person.id) && <Chip size="small" color="warning" label="重複派工" />}</Box>
                {days.map((date) => {
                  const isPast = localIsoDate(date) < today;
                  const assigned = recordsOnDay(date).filter((record) => recordPersonnel(record).some((item) => item.personnelId === person.id));
                  return <Box key={localIsoDate(date)} sx={{ p: 1, minHeight: 74, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: isPast ? 'action.disabledBackground' : undefined }}>{assigned.map((record) => <Button key={record.id} size="small" fullWidth sx={{ mb: 0.5, justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onOpen(record)}>{locationName(record)} · {record.scheduleSlot ?? '全天'}</Button>)}</Box>;
                })}
              </Box>)}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: mode === 'month' ? { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } : '1fr', gap: 1.5 }}>
            {days.map((date) => {
              const isPast = localIsoDate(date) < today;
              const dayRecords = recordsOnDay(date);
              return <Paper key={localIsoDate(date)} variant="outlined" sx={{ p: 2, minHeight: 130, bgcolor: isPast ? 'action.disabledBackground' : undefined }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>{date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}</Typography>
                {!dayRecords.length && <Typography color="text.secondary">{isPast ? '已過日期' : '尚無排定工作'}</Typography>}
                {dayRecords.map((record) => <Paper key={record.id} variant="outlined" sx={{ p: 1.25, mb: 1, bgcolor: 'action.hover' }}>
                  <Typography sx={{ fontWeight: 750 }}>{locationName(record)}</Typography>
                  <Typography variant="body2">{record.scheduleSlot ?? '全天'} · {recordPersonnel(record).map((item) => item.nameSnapshot).join('、') || '尚未派工'}</Typography>
                  <Button size="small" startIcon={<MapRounded />} onClick={() => onOpen(record)}>開啟地圖與紀錄</Button>
                </Paper>)}
              </Paper>;
            })}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
