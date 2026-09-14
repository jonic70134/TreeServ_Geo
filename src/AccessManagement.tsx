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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  limit,
  normalizeEmail,
  onSnapshot,
  orderBy,
  query,
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
  invitedAt?: unknown;
};
type Member = {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  acceptedAt?: unknown;
};
type MemberRole = Member['role'];

const memberRoleOptions: { value: MemberRole; label: string }[] = [
  { value: 'user', label: '一般使用者' },
  { value: 'admin', label: '系統管理者' },
];

const permissionRows = [
  {
    scope: '案場與工作紀錄',
    owner: '可管理全部資料',
    admin: '可管理全部資料',
    user: '可查看全部、建立資料，並編輯自己建立的內容',
  },
  {
    scope: '刪除案場與工作紀錄',
    owner: '可以刪除',
    admin: '可以刪除',
    user: '不可刪除',
  },
  {
    scope: '工作人員與公裝',
    owner: '建立、編輯及封存',
    admin: '建立、編輯及封存',
    user: '僅可查看與選用',
  },
  {
    scope: '派工、草稿與計畫書',
    owner: '可查看與管理',
    admin: '可查看與管理',
    user: '不開放管理頁面',
  },
  {
    scope: '邀請帳號',
    owner: '建立、複製及撤銷邀請',
    admin: '可查看名單',
    user: '不可查看',
  },
  {
    scope: '調整帳號角色',
    owner: '可在管理者與一般使用者之間調整',
    admin: '不可調整',
    user: '不可調整',
  },
  {
    scope: '啟用或停用帳號',
    owner: '可管理所有受邀帳號',
    admin: '僅可管理一般使用者，不能管理自己',
    user: '不可調整',
  },
  {
    scope: '操作紀錄',
    owner: '可查看',
    admin: '可查看',
    user: '不可查看',
  },
  {
    scope: 'Owner 身分與系統設定',
    owner: '固定由系統設定帳號持有',
    admin: '不可變更',
    user: '不可變更',
  },
] as const;

const roleLabel = (role: string) =>
  role === 'admin' ? '系統管理者' : '一般使用者';
const dateLabel = (value: unknown) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('toDate' in value) ||
    typeof value.toDate !== 'function'
  )
    return '同步中';
  return value.toDate().toLocaleString('zh-TW');
};

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
  const [pendingMemberRoles, setPendingMemberRoles] = useState<
    Record<string, MemberRole>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel?: string;
    run: () => Promise<void>;
  }>();
  const isOwner = role === 'owner';

  useEffect(() => {
    if (!db) return;
    const stopInvites = onSnapshot(
      query(collection(db, 'accessInvites'), orderBy('email'), limit(100)),
      (snapshot) =>
        setInvites(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Invite,
          ),
        ),
      () => setError('無法載入邀請名單。'),
    );
    const stopMembers = onSnapshot(
      query(collection(db, 'members'), orderBy('email'), limit(100)),
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
    if (!db || busy || !isOwner) return;
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

  function selectMemberRole(member: Member, nextRole: MemberRole) {
    setPendingMemberRoles((current) => {
      const next = { ...current };
      if (nextRole === member.role) delete next[member.id];
      else next[member.id] = nextRole;
      return next;
    });
  }

  function changeMemberRole(member: Member) {
    if (!isOwner) {
      notify('只有 Owner 可以調整帳號角色。');
      return;
    }
    const nextRole = pendingMemberRoles[member.id] ?? member.role;
    if (nextRole === member.role) return;
    setConfirm({
      title: '確認變更帳號角色？',
      body: `${member.email} 將從${roleLabel(member.role)}變更為${roleLabel(nextRole)}。確認後立即套用新的權限範圍。`,
      confirmLabel: '確認變更',
      run: async () => {
        if (!db) return;
        const batch = writeBatch(db),
          auditRef = doc(collection(db, 'activityLogs'));
        batch.update(doc(db, 'members', member.id), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
        batch.set(
          auditRef,
          auditData(
            account,
            'member_role',
            member.uid,
            `${member.email}（${roleLabel(nextRole)}）`,
          ),
        );
        await batch.commit();
        setPendingMemberRoles((current) => {
          const next = { ...current };
          delete next[member.id];
          return next;
        });
        notify('帳號角色已更新。');
      },
    });
  }

  function changeMemberStatus(member: Member) {
    const nextStatus = member.status === 'active' ? 'disabled' : 'active';
    if (role !== 'owner' && member.role === 'admin') {
      notify('系統管理者不能變更其他管理者。');
      return;
    }
    setConfirm({
      title: `${nextStatus === 'disabled' ? '停用' : '啟用'}帳號？`,
      body: `${member.email} 將${nextStatus === 'disabled' ? '立即失去' : '重新取得'}系統存取權。`,
      run: async () => {
        if (!db) return;
        const batch = writeBatch(db),
          auditRef = doc(collection(db, 'activityLogs'));
        batch.update(doc(db, 'members', member.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
        batch.set(
          auditRef,
          auditData(
            account,
            nextStatus === 'active' ? 'member_enable' : 'member_disable',
            member.uid,
            `${member.email}（${nextStatus}）`,
          ),
        );
        await batch.commit();
        notify(`帳號已${nextStatus === 'active' ? '啟用' : '停用'}。`);
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
        只有邀請名單中的 Google 帳號可以進入。Owner
        可管理邀請與帳號角色；系統管理者可協助啟用或停用一般使用者。
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {isOwner && (
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
          {isOwner && <Tab label="權限範圍" />}
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
                  {invite.status === 'pending' && isOwner && (
                    <Tooltip title="複製邀請連結">
                      <IconButton onClick={() => copyInvite(invite.email)}>
                        <ContentCopyRounded />
                      </IconButton>
                    </Tooltip>
                  )}
                  {invite.status === 'pending' && isOwner && (
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
                    {member.email}・目前為{roleLabel(member.role)}
                  </Typography>
                </Box>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { xs: 'stretch', md: 'center' } }}
                >
                  <Chip
                    size="small"
                    color={member.status === 'active' ? 'success' : 'default'}
                    label={member.status === 'active' ? '使用中' : '已停用'}
                    sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}
                  />
                  {isOwner && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center' }}
                    >
                      <FormControl size="small" sx={{ minWidth: 156 }}>
                        <InputLabel id={`member-role-${member.id}`}>
                          帳號角色
                        </InputLabel>
                        <Select
                          labelId={`member-role-${member.id}`}
                          label="帳號角色"
                          disabled={busy}
                          value={pendingMemberRoles[member.id] ?? member.role}
                          onChange={(event) =>
                            selectMemberRole(
                              member,
                              event.target.value as MemberRole,
                            )
                          }
                        >
                          {memberRoleOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={
                          busy ||
                          !pendingMemberRoles[member.id] ||
                          pendingMemberRoles[member.id] === member.role
                        }
                        onClick={() => changeMemberRole(member)}
                      >
                        確定
                      </Button>
                    </Stack>
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
                      onClick={() => changeMemberStatus(member)}
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
          {tab === 2 && isOwner && (
            <Box sx={{ p: { xs: 2, md: 3 } }}>
              <Box
                sx={{
                  borderLeft: 5,
                  borderColor: 'primary.main',
                  bgcolor: 'primary.light',
                  px: 2.5,
                  py: 2,
                  mb: 3,
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.75 }}>
                  三種角色，一條清楚的責任界線
                </Typography>
                <Typography color="text.secondary">
                  Owner
                  掌握帳號與角色；系統管理者負責營運資料；一般使用者專注現場紀錄。Owner
                  身分綁定系統設定帳號，不能透過下拉選單轉移。
                </Typography>
              </Box>

              <Stack
                direction={{ xs: 'column', md: 'row' }}
                sx={{ mb: 3, border: 1, borderColor: 'divider' }}
              >
                {[
                  [
                    'Owner',
                    '完整管理',
                    '帳號邀請、角色調整與全部營運權限',
                    'primary.main',
                    'primary.light',
                  ],
                  [
                    '系統管理者',
                    '營運管理',
                    '管理案場、人員、公裝、工作紀錄與一般使用者狀態',
                    'warning.dark',
                    'warning.light',
                  ],
                  [
                    '一般使用者',
                    '日常使用',
                    '建立案場與工作紀錄，管理自己建立的內容',
                    'text.secondary',
                    'action.hover',
                  ],
                ].map(
                  ([title, label, description, color, background], index) => (
                    <Box
                      key={title}
                      sx={{
                        flex: 1,
                        p: 2.25,
                        bgcolor: background,
                        borderLeft: { md: index ? 1 : 0 },
                        borderTop: { xs: index ? 1 : 0, md: 0 },
                        borderColor: 'divider',
                      }}
                    >
                      <Typography sx={{ color, fontWeight: 850 }}>
                        {title}
                      </Typography>
                      <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
                        {label}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {description}
                      </Typography>
                    </Box>
                  ),
                )}
              </Stack>

              <TableContainer sx={{ border: 1, borderColor: 'divider' }}>
                <Table
                  aria-label="TreeServ Geo 角色權限比較表"
                  sx={{ minWidth: 760 }}
                >
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 800 }}>功能範圍</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Owner</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>系統管理者</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>一般使用者</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {permissionRows.map((item) => (
                      <TableRow key={item.scope}>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{ fontWeight: 750 }}
                        >
                          {item.scope}
                        </TableCell>
                        <TableCell>{item.owner}</TableCell>
                        <TableCell>{item.admin}</TableCell>
                        <TableCell>{item.user}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1.5 }}
              >
                權限變更會立即套用；受影響帳號的已開啟頁面會同步調整可用功能，帳號停用後則會自動登出。
              </Typography>
            </Box>
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
            {confirm?.confirmLabel ?? '確認'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
