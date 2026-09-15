'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { runTransaction, Timestamp } from 'firebase/firestore';
import { db, doc, onSnapshot, serverTimestamp, setDoc, type User } from '../firebase';
import type { Personnel } from '../types';
import { hashBindingCode } from './bindings';
import LineStatusChip from './LineStatusChip';

export default function BindingDialog({ person, account, onClose }: { person: Personnel; account: User; onClose: () => void }) {
  const [invitation, setInvitation] = useState<{ text: string; expiresAt: number; codeHash: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [invalidated, setInvalidated] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!invitation || !db) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const stop = onSnapshot(doc(db, 'lineBindingRequests', person.id), (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites) setInvalidated(snapshot.data()?.codeHash !== invitation.codeHash);
    }, () => { setError('綁定碼狀態同步中斷，請關閉後重新開啟確認。'); setInvalidated(true); });
    return () => { clearInterval(timer); stop(); };
  }, [invitation, person.id]);
  const expired = invitation && now >= invitation.expiresAt;
  async function generate() {
    if (!db) return;
    setBusy(true); setError(''); setCopied(false); setInvitation(undefined);
    try {
      const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const codeHash = await hashBindingCode(random);
      const expiresAt = Date.now() + 30 * 60_000;
      await setDoc(doc(db, 'lineBindingRequests', person.id), { codeHash, createdBy: account.uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAt) });
      setInvalidated(false); setNow(Date.now());
      setInvitation({ text: `綁定 ${person.id}.${random}`, expiresAt, codeHash });
    } catch { setError('無法產生綁定碼，請確認管理員權限或稍後再試。'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!db) return;
    setBusy(true); setError('');
    try {
      const reference = doc(db, 'lineBindingRequests', person.id);
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(reference);
        if (current.data()?.codeHash === invitation?.codeHash) transaction.delete(reference);
      });
      setInvitation(undefined);
    }
    catch { setError('取消失敗，請稍後再試；原綁定碼仍可能有效。'); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
    <DialogTitle>綁定 LINE：{person.name}{person.code ? ` · ${person.code}` : ''}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <LineStatusChip person={person} />
      <Typography>請先確認夥伴身分，再將綁定碼私下交給本人。夥伴加入官方帳號 @604msveq 後，將整段綁定訊息貼到與 Bot 的個別聊天室，不要貼到群組。</Typography>
      <Button component="a" href="https://line.me/R/ti/p/@604msveq" target="_blank" rel="noopener noreferrer">開啟 LINE 官方帳號</Button>
      <Alert severity="info">綁定碼 30 分鐘後失效，只能使用一次；重新產生會讓上一組失效。綁定只建立通知管道，不代表接受工作。更換帳號前，請原帳號私訊「解除綁定」。</Alert>
      {person.lineStatus === 'blocked' && <Alert severity="warning">此帳號已封鎖 Bot，請夥伴先解除封鎖。</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {invitation && <>
        <TextField label="傳給夥伴的綁定訊息" value={invitation.text} multiline slotProps={{ input: { readOnly: true } }} />
        <Typography component="output" aria-live="polite" color="text.secondary">{invalidated ? '這組綁定碼已使用、取消或被更新，請以人員綁定狀態為準。' : expired ? '已逾時，請重新產生綁定碼。' : `有效至 ${new Date(invitation.expiresAt).toLocaleTimeString('zh-TW')}；尚餘 ${Math.ceil((invitation.expiresAt - now) / 60_000)} 分鐘`}</Typography>
        <Stack direction="row" spacing={1}>
          <Button disabled={Boolean(expired || invalidated || busy)} onClick={async () => { try { await navigator.clipboard.writeText(invitation.text); setCopied(true); } catch { setError('無法自動複製，請手動選取上方訊息。'); } }}>{copied ? '已複製' : '複製綁定訊息'}</Button>
          <Button disabled={busy || invalidated} color="warning" onClick={cancel}>取消此綁定碼</Button>
        </Stack>
      </>}
    </Stack></DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={onClose}>關閉</Button>
      <Button variant="contained" disabled={busy || person.status === 'archived' || person.lineStatus === 'bound' || person.lineStatus === 'blocked'} onClick={generate}>{busy ? '處理中…' : invitation ? '重新產生綁定碼' : '產生綁定碼'}</Button>
    </DialogActions>
  </Dialog>;
}
