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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import {
  auditData,
  collection,
  db,
  doc,
  normalizeEmail,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type AccessRole,
  type User,
} from './firebase';

type Invite = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'accepted' | 'revoked';
  invitedByEmail?: string;
  invitedAt?: any;
};
type Member = {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  acceptedAt?: any;
};

const roleLabel = (role: string) =>
  role === 'admin' ? '系統管理者' : '一般使用者';
const dateLabel = (value: any) =>
  value?.toDate ? value.toDate().toLocaleString('zh-TW') : '同步中';

export default function AccessManagement({
  account,
  role,
  notify,
}: {
  account: User;
  role: AccessRole;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    run: () => Promise<void>;
  }>();
  const canInvite = role === 'owner';

  useEffect(() => {
    if (!db) return;
    const stopInvites = onSnapshot(
      collection(db, 'accessInvites'),
      (snapshot) =>
        setInvites(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Invite,
          ),
        ),
      () => setError('無法載入邀請名單。'),
    );
    const stopMembers = onSnapshot(
      collection(db, 'members'),
      (snapshot) =>
        setMembers(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Member,
          ),
        ),
      () => setError('無法載入使用者名單。'),
    );
    return () => {
      stopInvites();
      stopMembers();
    };
  }, []);

  const sortedInvites = useMemo(
    () => [...invites].sort((a, b) => a.email.localeCompare(b.email)),
    [invites],
  );
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.email.localeCompare(b.email)),
    [members],
  );

  async function createInvite() {
    if (!db || busy || !canInvite) return;
    const target = normalizeEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setError('請輸入完整的 Google 帳號電子郵件。');
      return;
    }
    if (target === normalizeEmail(account.email ?? '')) {
      setError('目前登入帳號不需要邀請。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const batch = writeBatch(db);
      const auditRef = doc(collection(db, 'activityLogs'));
      batch.set(doc(db, 'accessInvites', target), {
        email: target,
        role: inviteRole,
        status: 'pending',
        invitedBy: account.uid,
        invitedByEmail: normalizeEmail(account.email ?? ''),
        invitedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        auditRef,
        auditData(
          account,
          'invite_create',
          target,
          `${target}（${roleLabel(inviteRole)}）`,
        ),
      );
      await batch.commit();
      setEmail('');
      setInviteRole('user');
      notify('邀請已建立，請將邀請連結傳給對方。');
    } catch {
      setError('邀請建立失敗，請確認帳號權限後重試。');
    } finally {
      setBusy(false);
    }
  }

  function inviteLink(target: string) {
    const url = new URL(window.location.origin);
    url.searchParams.set('invite', target);
    return url.toString();
  }

  async function copyInvite(target: string) {
    await navigator.clipboard.writeText(inviteLink(target));
    notify('邀請連結已複製；對方必須使用同一個 Google 帳號登入。');
  }

  function revokeInvite(invite: Invite) {
    setConfirm({
      title: '撤銷邀請？',
      body: `撤銷 ${invite.email} 的邀請後，尚未登入的對方將無法進入系統。`,
      run: async () => {
        if (!db) return;
        const batch = writeBatch(db),
          auditRef = doc(collection(db, 'activityLogs'));
        batch.update(doc(db, 'accessInvites', invite.id), {
          status: 'revoked',
          updatedAt: serverTimestamp(),
        });
        batch.set(
          auditRef,
          auditData(account, 'invite_revoke', invite.email, invite.email),
        );
        await batch.commit();
        notify('邀請已撤銷。');
      },
    });
  }

  function changeMember(member: Member, action: 'role' | 'status') {
    const nextRole = member.role === 'admin' ? 'user' : 'admin';
    const nextStatus = member.status === 'active' ? 'disabled' : 'active';
    if (role !== 'owner' && member.role === 'admin') {
      notify('系統管理者不能變更其他管理者。');
      return;
    }
    if (action === 'role' && role !== 'owner') {
      notify('只有 Owner 可以調整管理者角色。');
      return;
    }
    setConfirm({
      title:
        action === 'role'
          ? '變更帳號角色？'
          : `${nextStatus === 'disabled' ? '停用' : '啟用'}帳號？`,
      body:
        action === 'role'
          ? `${member.email} 將變更為${roleLabel(nextRole)}。`
          : `${member.email} 將${nextStatus === 'disabled' ? '立即失去' : '重新取得'}系統存取權。`,
      run: async () => {
        if (!db) return;
        const batch = writeBatch(db),
          auditRef = doc(collection(db, 'activityLogs'));
        batch.update(
          doc(db, 'members', member.id),
          action === 'role'
            ? { role: nextRole, updatedAt: serverTimestamp() }
            : { status: nextStatus, updatedAt: serverTimestamp() },
        );
        batch.set(
          auditRef,
          auditData(
            account,
            action === 'role'
              ? 'member_role'
              : nextStatus === 'active'
                ? 'member_enable'
                : 'member_disable',
            member.uid,
            `${member.email}（${action === 'role' ? roleLabel(nextRole) : nextStatus}）`,
          ),
        );
        await batch.commit();
        notify('帳號權限已更新。');
      },
    });
  }

  async function runConfirmed() {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      await confirm.run();
      setConfirm(undefined);
    } catch {
      setError('權限更新失敗，請重新整理後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1180, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        權限管理
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        只有邀請名單中的 Google 帳號可以進入。僅 jonic70134@gmail.com
        可建立或撤銷邀請；系統管理者可協助管理一般使用者。
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {canInvite && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              fullWidth
              label="受邀 Google 帳號"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>角色</InputLabel>
              <Select
                label="角色"
                value={inviteRole}
                onChange={(event) =>
                  setInviteRole(event.target.value as 'admin' | 'user')
                }
              >
                <MenuItem value="user">一般使用者</MenuItem>
                <MenuItem value="admin">系統管理者</MenuItem>
              </Select>
            </FormControl>
            <Button
              sx={{ minWidth: 150, height: 56 }}
              variant="contained"
              startIcon={<PersonAddAlt1Rounded />}
              disabled={busy}
              onClick={createInvite}
            >
              建立邀請
            </Button>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.5 }}
          >
            系統會建立專屬邀請資格；請複製連結傳給對方。登入電子郵件必須與受邀帳號完全相同。
          </Typography>
        </Paper>
      )}

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_event, value) => setTab(value)}>
          <Tab label={`邀請名單 ${invites.length}`} />
          <Tab label={`已加入帳號 ${members.length}`} />
        </Tabs>
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
          {tab === 0 &&
            sortedInvites.map((invite) => (
              <Stack
                key={invite.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{
                  justifyContent: 'space-between',
                  alignItems: { sm: 'center' },
                  p: 2,
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 750 }}>
                    {invite.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {roleLabel(invite.role)}・{dateLabel(invite.invitedAt)}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Chip
                    size="small"
                    color={
                      invite.status === 'pending'
                        ? 'warning'
                        : invite.status === 'accepted'
                          ? 'success'
                          : 'default'
                    }
                    label={
                      invite.status === 'pending'
                        ? '等待登入'
                        : invite.status === 'accepted'
                          ? '已接受'
                          : '已撤銷'
                    }
                  />
                  {invite.status === 'pending' && canInvite && (
                    <Tooltip title="複製邀請連結">
                      <IconButton onClick={() => copyInvite(invite.email)}>
                        <ContentCopyRounded />
                      </IconButton>
                    </Tooltip>
                  )}
                  {invite.status === 'pending' && canInvite && (
                    <Button
                      color="error"
                      size="small"
                      startIcon={<BlockRounded />}
                      onClick={() => revokeInvite(invite)}
                    >
                      撤銷
                    </Button>
                  )}
                </Stack>
              </Stack>
            ))}
          {tab === 0 && !sortedInvites.length && (
            <Typography sx={{ p: 4 }} align="center" color="text.secondary">
              尚未建立邀請。
            </Typography>
          )}
          {tab === 1 &&
            sortedMembers.map((member) => (
              <Stack
                key={member.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{
                  justifyContent: 'space-between',
                  alignItems: { sm: 'center' },
                  p: 2,
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 750 }}>
                    {member.displayName || member.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {member.email}・{roleLabel(member.role)}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Chip
                    size="small"
                    color={member.status === 'active' ? 'success' : 'default'}
                    label={member.status === 'active' ? '使用中' : '已停用'}
                  />
                  {role === 'owner' && (
                    <Button
                      size="small"
                      onClick={() => changeMember(member, 'role')}
                    >
                      改為
                      {roleLabel(member.role === 'admin' ? 'user' : 'admin')}
                    </Button>
                  )}
                  {(role === 'owner' || member.role === 'user') && (
                    <Button
                      color={member.status === 'active' ? 'error' : 'success'}
                      size="small"
                      startIcon={
                        member.status === 'active' ? (
                          <BlockRounded />
                        ) : (
                          <CheckCircleRounded />
                        )
                      }
                      onClick={() => changeMember(member, 'status')}
                    >
                      {member.status === 'active' ? '停用' : '啟用'}
                    </Button>
                  )}
                </Stack>
              </Stack>
            ))}
          {tab === 1 && !sortedMembers.length && (
            <Typography sx={{ p: 4 }} align="center" color="text.secondary">
              尚無受邀帳號完成登入。
            </Typography>
          )}
        </Stack>
      </Paper>

      <Dialog
        open={Boolean(confirm)}
        onClose={() => !busy && setConfirm(undefined)}
      >
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(undefined)}>
            取消
          </Button>
          <Button
            disabled={busy}
            color="error"
            variant="contained"
            onClick={runConfirmed}
          >
            確認
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
