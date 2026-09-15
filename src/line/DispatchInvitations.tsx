'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  collection,
  db,
  limit,
  onSnapshot,
  query,
  where,
  type User,
} from '../firebase';
import type { Personnel, WorkRecord } from '../types';
import {
  dispatchContext,
  dispatchRecordSchema,
  invitationLabels,
  invitationSchema,
  invitationStatus,
  isDispatchable,
  type Invitation,
} from './dispatch-model';
import LineStatusChip from './LineStatusChip';

type Props = {
  account: User;
  record: WorkRecord;
  personnel: Personnel[];
  isPersisted: boolean;
};
type Action = {
  personnelId: string;
  name: string;
  requestId: string;
  action: 'send' | 'retry' | 'cancel';
};
export default function DispatchInvitations({
  account,
  record,
  personnel,
  isPersisted,
}: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Action>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(
        collection(db, 'dispatchInvitations'),
        where('recordId', '==', record.id),
        limit(100),
      ),
      (snapshot) => {
        const parsed = snapshot.docs.map((item) =>
          invitationSchema.safeParse(item.data()),
        );
        if (parsed.some((item) => !item.success) || snapshot.size >= 100) {
          setLoadError('邀請資料需要確認，暫停發送以避免重複通知。');
          return;
        }
        setInvitations(
          parsed.flatMap((item) => (item.success ? [item.data] : [])),
        );
        setLoaded(true);
        setLoadError('');
      },
      () =>
        setLoadError(
          '無法讀取邀請狀態，請確認網路與管理員權限後重新開啟紀錄。',
        ),
    );
  }, [record.id]);
  const parsedRecord = dispatchRecordSchema.safeParse(record);
  const canSend =
    isPersisted &&
    parsedRecord.success &&
    isDispatchable(parsedRecord.data, now) &&
    loaded &&
    !loadError &&
    !busy;
  const assigned = [
    ...new Map(
      [record.siteLead, ...(record.crewAssignments ?? [])]
        .filter((item) => !!item)
        .map((item) => [item!.personnelId, item!]),
    ).values(),
  ];
  async function execute() {
    if (!confirm || busy) return;
    const action = confirm;
    setBusy(true);
    setNotice('');
    try {
      const token = await account.getIdToken();
      const result = await fetch('/api/line/dispatch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordId: record.id,
          personnelId: action.personnelId,
          requestId: action.requestId,
          action: action.action,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = (await result.json()) as { message?: string };
      setNotice(body.message ?? '無法確認結果，請查看最新邀請狀態。');
    } catch {
      setNotice(
        '連線中斷，請先查看最新狀態。若顯示「結果待確認」，請等 30 秒後按「確認傳送結果」，不要直接重發。',
      );
    } finally {
      setBusy(false);
      setConfirm(undefined);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 800 }}>LINE 個別派工邀請</Typography>
        <Typography color="text.secondary">
          儲存紀錄不會自動通知。邀請發出後 8
          小時失效；本版不會在到期時主動提醒管理者，請在此查看回覆。
        </Typography>
        {!isPersisted && (
          <Alert severity="info">
            請先編輯並儲存這份工作紀錄，再發送邀請。
          </Alert>
        )}
        {isPersisted &&
          (!parsedRecord.success ||
            !isDispatchable(parsedRecord.data, now)) && (
            <Alert severity="info">
              請設定今天或以後的工作日期；已完成或取消的工作不能發送邀請。
            </Alert>
          )}
        {!loaded && !loadError && (
          <Typography component="output">正在讀取邀請狀態…</Typography>
        )}
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {notice && (
          <Alert severity="info" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}
        {!assigned.length && (
          <Alert severity="info">
            請先在人力配置中選擇名單內的人員。舊版文字姓名不能直接寄送 LINE。
          </Alert>
        )}
        {assigned.map((assignment) => {
          const person = personnel.find(
            (item) => item.id === assignment.personnelId,
          );
          const name = `${person?.name ?? assignment.nameSnapshot}${person?.code ? ` · ${person.code}` : ''}`;
          const invitation = invitations.find(
            (item) => item.personnelId === assignment.personnelId,
          );
          const status = invitation
            ? invitationStatus(invitation, now)
            : undefined;
          const changed =
            invitation &&
            parsedRecord.success &&
            invitation.contextKey !==
              dispatchContext(parsedRecord.data, assignment.personnelId);
          const bound =
            person?.status === 'active' && person.lineStatus === 'bound';
          const open =
            status &&
            ['sending', 'pending', 'uncertain', 'accepted'].includes(status);
          const retry =
            invitation &&
            ['sending', 'uncertain'].includes(status ?? '') &&
            now - invitation.startedAt >= 30_000 &&
            !changed;
          return (
            <Box
              key={assignment.personnelId}
              sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}
            >
              <Stack
                direction="row"
                sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              >
                <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
                {person ? (
                  <LineStatusChip person={person} />
                ) : (
                  <Chip label="人員資料未載入或已封存" />
                )}
                {loaded && (
                  <Chip
                    label={
                      changed && open
                        ? '派工已變更・請取消後重邀'
                        : status
                          ? invitationLabels[status]
                          : '尚未邀請'
                    }
                    color={
                      status === 'accepted' && !changed
                        ? 'success'
                        : [
                              'expired',
                              'declined',
                              'failed',
                              'uncertain',
                            ].includes(status ?? '') || changed
                          ? 'warning'
                          : 'default'
                    }
                  />
                )}
              </Stack>
              {invitation && (
                <Typography
                  sx={{ mt: 1, fontSize: '0.875rem' }}
                  color="text.secondary"
                >
                  回覆期限：
                  {new Date(invitation.expiresAt).toLocaleString('zh-TW', {
                    timeZone: 'Asia/Taipei',
                    hour12: false,
                  })}
                  （台灣時間）
                </Typography>
              )}
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {!open && (
                  <Button
                    variant="outlined"
                    disabled={!canSend || !bound}
                    onClick={() =>
                      setConfirm({
                        personnelId: assignment.personnelId,
                        name,
                        requestId: crypto.randomUUID(),
                        action: 'send',
                      })
                    }
                  >
                    {invitation ? '發送新邀請' : '發送 LINE 邀請'}
                  </Button>
                )}
                {retry && (
                  <Button
                    disabled={!canSend || !bound}
                    onClick={() =>
                      setConfirm({
                        personnelId: assignment.personnelId,
                        name,
                        requestId: invitation.attemptId,
                        action: 'retry',
                      })
                    }
                  >
                    確認傳送結果
                  </Button>
                )}
                {open && invitation && (
                  <Button
                    color="warning"
                    disabled={busy || !!loadError}
                    onClick={() =>
                      setConfirm({
                        personnelId: assignment.personnelId,
                        name,
                        requestId: invitation.attemptId,
                        action: 'cancel',
                      })
                    }
                  >
                    取消邀請
                  </Button>
                )}
              </Stack>
            </Box>
          );
        })}
        {invitations
          .filter(
            (item) =>
              !assigned.some(
                (person) => person.personnelId === item.personnelId,
              ),
          )
          .map((item) => (
            <Alert key={item.personnelId} severity="info">
              {item.personnelName} 已從人力配置移除，舊邀請不能再接受。
            </Alert>
          ))}
        <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
          「待回覆」只代表 LINE
          已受理，不保證送達。未綁定人員仍可排班，請另外聯絡。
        </Typography>
      </Stack>
      <Dialog
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(undefined);
        }}
        aria-labelledby="dispatch-confirm-title"
      >
        <DialogTitle id="dispatch-confirm-title">
          {confirm?.action === 'cancel'
            ? '取消這份邀請？'
            : '確認個別 LINE 通知'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {confirm?.name} — {record.title}
          </Typography>
          <Typography sx={{ mt: 1 }}>
            {confirm?.action === 'cancel'
              ? '舊訊息不會消失，但按鈕將無法接受。此操作不會另外發送 LINE，請視需要聯絡夥伴。'
              : confirm?.action === 'retry'
                ? '使用同一份邀請確認結果，不延長期限，也不重複寄送已受理的訊息。'
                : '只傳給這位夥伴，不會發到群組。邀請有效 8 小時；此通知會使用官方帳號的訊息額度。'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(undefined)}>
            返回
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void execute()}
          >
            {busy ? '處理中…' : '確認'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
