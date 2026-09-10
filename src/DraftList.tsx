'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { deleteDraftWithAssets, type DraftDocument } from './drafts';

function updatedLabel(value: any) {
  const date = value?.toDate?.() as Date | undefined;
  if (!date) return '剛剛儲存';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DraftList({
  onOpen,
  notify,
}: {
  onOpen: (draft: DraftDocument) => void;
  notify: (message: string) => void;
}) {
  const [drafts, setDrafts] = useState<DraftDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<DraftDocument>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'drafts'), orderBy('updatedAt', 'desc')),
      (snapshot) => {
        setDrafts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as DraftDocument));
        setLoading(false);
      },
      () => { setLoading(false); notify('草稿列表暫時無法同步。'); },
    );
  }, []);

  const totalBytes = useMemo(() => drafts.reduce((sum, draft) => sum + (draft.sizeBytes || 0), 0), [drafts]);

  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await deleteDraftWithAssets(removing.id);
      notify('草稿與草稿照片已刪除。');
      setRemoving(undefined);
    } catch { notify('草稿刪除失敗，請稍後再試。'); }
    finally { setBusy(false); }
  }

  return <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1100, mx: 'auto' }}>
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="primary">管理者專用</Typography>
        <Typography variant="h4">草稿列表</Typography>
        <Typography color="text.secondary">共 {drafts.length} 份草稿，估計使用 {sizeLabel(totalBytes)}。照片只有開啟計畫書草稿時才會下載。</Typography>
      </Box>
      <Alert severity="info">草稿存放於 Firebase Firestore，不占用網站主機磁碟；系統只在內容變更後寫入，避免每 30 秒重複傳送相同資料。</Alert>
      {loading ? <Typography color="text.secondary">正在載入草稿…</Typography> : drafts.length === 0 ?
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><EditNoteRounded sx={{ fontSize: 52, color: 'text.disabled' }} /><Typography variant="h6">目前沒有草稿</Typography><Typography color="text.secondary">在計畫書或工作紀錄編輯畫面按「儲存草稿」後會顯示於此。</Typography></Paper>
        : <Stack spacing={1.5}>{drafts.map((draft) => <Paper variant="outlined" sx={{ p: 2.2 }} key={draft.id}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flex: 'none' }}><DescriptionRounded /></Box>
              <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }} noWrap>{draft.title || '未命名草稿'}</Typography><Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Chip size="small" label={draft.kind === 'pruning_plan' ? '修剪計畫書' : '案場工作紀錄'} /><Typography variant="caption" color="text.secondary">{updatedLabel(draft.updatedAt)}・{draft.updatedByName || draft.createdByName}・{sizeLabel(draft.sizeBytes || 0)}</Typography></Stack></Box>
            </Stack>
            <Stack direction="row" spacing={1}><Button variant="contained" onClick={() => onOpen(draft)}>繼續編輯</Button><Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setRemoving(draft)}>刪除</Button></Stack>
          </Stack>
        </Paper>)}</Stack>}
    </Stack>
    <Dialog open={Boolean(removing)} onClose={() => !busy && setRemoving(undefined)}>
      <DialogTitle>刪除草稿？</DialogTitle><DialogContent><DialogContentText>「{removing?.title}」與其中的草稿照片都會刪除，無法復原。</DialogContentText></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setRemoving(undefined)}>取消</Button><Button disabled={busy} color="error" variant="contained" onClick={remove}>{busy ? '刪除中…' : '刪除草稿'}</Button></DialogActions>
    </Dialog>
  </Box>;
}
