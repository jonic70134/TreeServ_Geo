'use client';

import { Chip, Tooltip } from '@mui/material';
import type { Personnel } from '../types';

export function lineStatusLabel(person: Pick<Personnel, 'lineStatus'>) {
  if (person.lineStatus === 'bound') return '已綁定 LINE';
  if (person.lineStatus === 'blocked') return 'LINE 已封鎖';
  if (!person.lineStatus || person.lineStatus === 'unbound') return '未綁定 LINE';
  return 'LINE 狀態待確認';
}

export default function LineStatusChip({ person }: { person: Personnel }) {
  const archived = person.status === 'archived';
  const bound = person.lineStatus === 'bound';
  const label = archived && bound ? '已綁定 LINE · 已封存' : lineStatusLabel(person);
  return <Tooltip title={archived ? '已封存人員不接受新的派工通知。' : bound ? '已完成帳號綁定；不代表已接受工作或保證訊息送達。' : person.lineStatus === 'blocked' ? '已收到封鎖事件；請夥伴解除封鎖。' : '尚未完成綁定，仍可排班，但不能透過 LINE 通知。'}>
    <Chip size="small" variant="outlined" label={label} color={!archived && bound ? 'success' : person.lineStatus === 'blocked' ? 'warning' : 'default'} sx={{ fontSize: '0.875rem', maxWidth: '100%' }} />
  </Tooltip>;
}
