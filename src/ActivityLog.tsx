'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { collection, db, getDocs, limit, orderBy, query, startAfter, type QueryDocumentSnapshot } from './firebase';

const labels: Record<string, string> = {
  login: '登入', logout: '登出', create: '建立紀錄', edit: '開啟編輯', update: '更新紀錄', delete: '刪除紀錄',
  plan_image_save: '儲存計畫圖面', plan_pdf_save: '儲存計畫書 PDF', invite_create: '發出邀請',
  invite_revoke: '撤銷邀請', invite_accept: '接受邀請', member_role: '調整角色', member_enable: '啟用帳號', member_disable: '停用帳號',
  personnel_create: '新增工作人員', personnel_update: '更新工作人員',
  equipment_create: '新增公裝器材', equipment_update: '更新公裝器材',
};

function formatTime(value: any) {
  return value?.toDate
    ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value.toDate())
    : '時間同步中';
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(true);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot>();

  async function load(reset = false) {
    if (!db || busy) return;
    setBusy(true); setError('');
    try {
      const result = await getDocs(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), ...(!reset && cursor ? [startAfter(cursor)] : []), limit(50)));
      const rows = result.docs.map((item) => ({ id: item.id, ...item.data() }));
      setEntries((current) => reset ? rows : [...current, ...rows]);
      setCursor(result.docs.at(-1));
      setMore(result.size === 50);
    } catch {
      setError('無法讀取操作紀錄，請確認目前帳號具有 Owner 或系統管理者權限。');
    } finally { setBusy(false); }
  }

  useEffect(() => { void load(true); }, []);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 3 }}>
        <Box><Typography variant="h4">登入與操作紀錄</Typography><Typography color="text.secondary">台灣時間（UTC+8），每次載入 50 筆</Typography></Box>
        <Button variant="outlined" startIcon={busy ? <CircularProgress size={16} /> : <RefreshRounded />} disabled={busy} onClick={() => load(true)}>重新整理</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead><TableRow><TableCell>時間</TableCell><TableCell>登入者</TableCell><TableCell>操作</TableCell><TableCell>對象</TableCell></TableRow></TableHead>
          <TableBody>
            {entries.map((entry) => <TableRow key={entry.id} hover><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(entry.timestamp)}</TableCell><TableCell>{entry.actorName || '—'}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{entry.actorEmail}</Typography></TableCell><TableCell><Chip size="small" label={labels[entry.action] || entry.action} /></TableCell><TableCell>{entry.recordTitle || '—'}{entry.recordId && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{entry.recordId}</Typography>}</TableCell></TableRow>)}
            {!entries.length && !busy && <TableRow><TableCell colSpan={4} align="center">尚無登入或操作紀錄。</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      {more && entries.length > 0 && <Button sx={{ mt: 2 }} disabled={busy} onClick={() => load(false)}>載入更早紀錄</Button>}
    </Box>
  );
}
