'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import {
  auditData,
  collection,
  db,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type User,
} from './firebase';
import {
  equipmentPackageLabels,
  workRoleLabels,
  type EquipmentCatalogItem,
  type EquipmentPackage,
  type Personnel,
  type SiteLocation,
  type WorkRole,
} from './types';
import { demoLocations } from './demo-data';
import { generatedDemoLocations } from './generated-demo-data';

type Props = { account: User; notify: (message: string) => void };
type PersonnelForm = Omit<Personnel, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;
type EquipmentForm = Omit<EquipmentCatalogItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

const emptyPersonnel: PersonnelForm = {
  name: '', code: '', jobTitle: '', note: '', skills: [], allowedRoles: [], status: 'active',
};
const emptyEquipment: EquipmentForm = {
  name: '', unit: '組', defaultQuantity: 1, packages: ['general'], note: '', status: 'active',
};

const defaultPersonnelNames = [...new Set(
  ([...demoLocations, ...generatedDemoLocations] as SiteLocation[])
    .flatMap((location) => location.records ?? [])
    .flatMap((record) => record.crew ?? []),
)].sort((left, right) => left.localeCompare(right, 'zh-TW'));

const defaultEquipment: Array<Pick<EquipmentCatalogItem, 'name' | 'unit' | 'defaultQuantity' | 'packages' | 'note'>> = [
  ['安全帽', '頂', 8, ['general'], '含下巴帶，作業前檢查帽體與扣具。'],
  ['護目鏡', '副', 8, ['general'], '鏈鋸、碎屑與粉塵作業使用。'],
  ['聽力防護耳罩', '副', 6, ['general'], '鏈鋸與碎木機操作人員使用。'],
  ['防割手套', '雙', 8, ['general'], '依作業內容選用合適等級。'],
  ['鏈鋸防護褲', '件', 4, ['pruning', 'removal', 'climbing'], '鏈鋸操作人員使用。'],
  ['高可視反光背心', '件', 8, ['general'], '道路與人車混流區使用。'],
  ['急救箱', '箱', 1, ['general'], '含止血與基礎創傷處理用品。'],
  ['三角錐', '支', 12, ['general'], '建立施工與落枝管制區。'],
  ['警示帶', '捲', 4, ['general'], '搭配三角錐封閉作業範圍。'],
  ['無線電', '支', 6, ['general'], '樹上、地面與場控保持通訊。'],
  ['攀樹安全吊帶', '套', 3, ['climbing'], '使用前依製造商規範檢查。'],
  ['攀樹主繩', '條', 4, ['climbing'], '依作業系統與樹高配置。'],
  ['工作定位繩', '條', 4, ['climbing'], '攀樹人員個人定位使用。'],
  ['拋繩袋與拋繩線', '組', 3, ['climbing'], '建立攀樹繩路徑。'],
  ['上升器', '組', 3, ['climbing'], '依核准攀樹系統搭配使用。'],
  ['下降器', '組', 3, ['climbing'], '依繩徑與製造商規範使用。'],
  ['攀樹救援繩組', '組', 1, ['climbing'], '須可立即取用，不與主作業繩混用。'],
  ['樹上鏈鋸', '台', 2, ['pruning', 'removal', 'climbing'], '僅限受訓人員操作。'],
  ['地面鏈鋸', '台', 2, ['pruning', 'removal'], '含備用鏈條與維護工具。'],
  ['高枝鋸', '支', 3, ['pruning'], '地面修剪與小枝處理。'],
  ['高枝剪', '支', 2, ['pruning'], '細枝修剪使用。'],
  ['Rigging 繩', '條', 3, ['pruning', 'removal', 'climbing'], '依預估負載選擇繩徑與長度。'],
  ['Rigging 滑輪', '組', 3, ['pruning', 'removal', 'climbing'], '含連接器與固定扁帶。'],
  ['摩擦煞車器', '組', 2, ['pruning', 'removal', 'climbing'], '地面控制吊枝速度與張力。'],
  ['固定扁帶', '條', 8, ['pruning', 'removal', 'climbing'], '依承載需求分色管理。'],
  ['伐木楔', '組', 2, ['removal'], '輔助控制伐倒方向。'],
  ['牽引器', '組', 1, ['removal'], '必要時建立受控牽引。'],
  ['太空包', '個', 8, ['pruning', 'removal'], '集中細枝、葉材與現場廢棄物。'],
  ['吹葉機', '台', 2, ['general'], '完工後清理路面與作業區。'],
  ['碎木機', '台', 1, ['pruning', 'removal'], '須設置進料安全區並由指定人員操作。'],
].map(([name, unit, defaultQuantity, packages, note]) => ({
  name: name as string,
  unit: unit as string,
  defaultQuantity: defaultQuantity as number,
  packages: packages as EquipmentPackage[],
  note: note as string,
}));

const toggleValue = <T extends string>(values: T[], value: T) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export default function ResourceManagement({ account, notify }: Props) {
  const [section, setSection] = useState<'personnel' | 'equipment'>('personnel');
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [equipment, setEquipment] = useState<EquipmentCatalogItem[]>([]);
  const [personnelForm, setPersonnelForm] = useState<PersonnelForm>();
  const [equipmentForm, setEquipmentForm] = useState<EquipmentForm>();
  const [editingPersonnelId, setEditingPersonnelId] = useState('');
  const [editingEquipmentId, setEditingEquipmentId] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [personnelLoaded, setPersonnelLoaded] = useState(false);
  const [equipmentLoaded, setEquipmentLoaded] = useState(false);
  const seedStarted = useRef(false);

  useEffect(() => {
    if (!db) return;
    const stopPersonnel = onSnapshot(
      query(collection(db, 'personnel'), orderBy('updatedAt', 'desc'), limit(100)),
      (snapshot) => { setPersonnel(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Personnel)); setPersonnelLoaded(true); },
      () => notify('工作人員名單載入失敗。'),
    );
    const stopEquipment = onSnapshot(
      query(collection(db, 'equipmentCatalog'), orderBy('updatedAt', 'desc'), limit(100)),
      (snapshot) => { setEquipment(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as EquipmentCatalogItem)); setEquipmentLoaded(true); },
      () => notify('公裝器材列表載入失敗。'),
    );
    return () => { stopPersonnel(); stopEquipment(); };
  }, [account.uid, notify]);

  const shouldSeedDefaults = useMemo(
    () => personnelLoaded && equipmentLoaded && (!personnel.length || !equipment.length),
    [personnelLoaded, equipmentLoaded, personnel.length, equipment.length],
  );

  useEffect(() => {
    if (!db || !shouldSeedDefaults || seedStarted.current) return;
    seedStarted.current = true;
    const seed = async () => {
      const batch = writeBatch(db!);
      if (!personnel.length) defaultPersonnelNames.forEach((name, index) => {
        const itemRef = doc(db!, 'personnel', `starter-person-${String(index + 1).padStart(2, '0')}`);
        const auditRef = doc(collection(db!, 'activityLogs'));
        batch.set(itemRef, {
          name, code: '', jobTitle: '樹木工作夥伴', note: '由既有工作紀錄名單建立，可自行補充技能與角色。',
          skills: [], allowedRoles: [], status: 'active', createdBy: account.uid,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAuditId: auditRef.id,
        });
        batch.set(auditRef, auditData(account, 'personnel_create', itemRef.id, name));
      });
      if (!equipment.length) defaultEquipment.forEach((item, index) => {
        const itemRef = doc(db!, 'equipmentCatalog', `starter-equipment-${String(index + 1).padStart(2, '0')}`);
        const auditRef = doc(collection(db!, 'activityLogs'));
        batch.set(itemRef, {
          ...item, status: 'active', createdBy: account.uid,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastAuditId: auditRef.id,
        });
        batch.set(auditRef, auditData(account, 'equipment_create', itemRef.id, item.name));
      });
      await batch.commit();
      notify('已依既有紀錄建立工作夥伴，並加入常用樹木作業公裝。');
    };
    void seed().catch(() => {
      seedStarted.current = false;
      notify('預設工作夥伴與公裝建立失敗，請稍後重新開啟此頁。');
    });
  }, [account, equipment.length, personnel.length, shouldSeedDefaults, notify]);

  function startPersonnel(item?: Personnel) {
    setEditingPersonnelId(item?.id ?? '');
    setPersonnelForm(item ? {
      name: item.name, code: item.code, jobTitle: item.jobTitle, note: item.note,
      skills: [...item.skills], allowedRoles: [...item.allowedRoles], status: item.status,
    } : { ...emptyPersonnel, skills: [], allowedRoles: [] });
    setSkillsText(item?.skills.join('、') ?? '');
  }

  function startEquipment(item?: EquipmentCatalogItem) {
    setEditingEquipmentId(item?.id ?? '');
    setEquipmentForm(item ? {
      name: item.name, unit: item.unit, defaultQuantity: item.defaultQuantity,
      packages: [...item.packages], note: item.note, status: item.status,
    } : { ...emptyEquipment, packages: [...emptyEquipment.packages] });
  }

  async function savePersonnel() {
    if (!db || !personnelForm?.name.trim()) return notify('請填寫人員姓名。');
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const itemRef = editingPersonnelId
        ? doc(db, 'personnel', editingPersonnelId)
        : doc(collection(db, 'personnel'));
      const auditRef = doc(collection(db, 'activityLogs'));
      const payload = {
        ...personnelForm,
        name: personnelForm.name.trim(),
        code: personnelForm.code.trim(),
        jobTitle: personnelForm.jobTitle.trim(),
        note: personnelForm.note.trim(),
        skills: skillsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20),
        updatedAt: serverTimestamp(),
        lastAuditId: auditRef.id,
      };
      if (editingPersonnelId) batch.update(itemRef, payload);
      else batch.set(itemRef, { ...payload, createdBy: account.uid, createdAt: serverTimestamp() });
      batch.set(auditRef, auditData(account, editingPersonnelId ? 'personnel_update' : 'personnel_create', itemRef.id, payload.name));
      await batch.commit();
      setPersonnelForm(undefined);
      notify(editingPersonnelId ? '工作人員資料已更新。' : '工作人員已加入名單。');
    } catch {
      notify('工作人員資料儲存失敗。');
    } finally { setSaving(false); }
  }

  async function saveEquipment() {
    if (!db || !equipmentForm?.name.trim()) return notify('請填寫器材名稱。');
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const itemRef = editingEquipmentId
        ? doc(db, 'equipmentCatalog', editingEquipmentId)
        : doc(collection(db, 'equipmentCatalog'));
      const auditRef = doc(collection(db, 'activityLogs'));
      const payload = {
        ...equipmentForm,
        name: equipmentForm.name.trim(),
        unit: equipmentForm.unit.trim() || '組',
        defaultQuantity: Math.max(0.5, Number(equipmentForm.defaultQuantity) || 1),
        note: equipmentForm.note.trim(),
        updatedAt: serverTimestamp(),
        lastAuditId: auditRef.id,
      };
      if (editingEquipmentId) batch.update(itemRef, payload);
      else batch.set(itemRef, { ...payload, createdBy: account.uid, createdAt: serverTimestamp() });
      batch.set(auditRef, auditData(account, editingEquipmentId ? 'equipment_update' : 'equipment_create', itemRef.id, payload.name));
      await batch.commit();
      setEquipmentForm(undefined);
      notify(editingEquipmentId ? '公裝器材資料已更新。' : '公裝器材已加入列表。');
    } catch {
      notify('公裝器材資料儲存失敗。');
    } finally { setSaving(false); }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">工作夥伴及公裝清單</Typography>
          <Typography color="text.secondary">由管理員維護全域名單；封存只會停止新紀錄選用，不影響舊紀錄。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant={section === 'personnel' ? 'contained' : 'outlined'} onClick={() => setSection('personnel')}>工作夥伴</Button>
          <Button variant={section === 'equipment' ? 'contained' : 'outlined'} onClick={() => setSection('equipment')}>公裝清單</Button>
        </Stack>
        {section === 'personnel' ? (
          <>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">工作人員名單（{personnel.length}）</Typography>
              <Button variant="contained" startIcon={<AddRounded />} onClick={() => startPersonnel()}>新增人員</Button>
            </Stack>
            {!personnel.length && <Alert severity="info">尚未建立人員。建立後，案場工作紀錄會直接引用這份名單。</Alert>}
            {personnel.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 2, opacity: item.status === 'archived' ? 0.68 : 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="h6">{item.name}</Typography>
                      {item.code && <Chip size="small" label={item.code} />}
                      {item.jobTitle && <Chip size="small" variant="outlined" label={item.jobTitle} />}
                      {item.status === 'archived' && <Chip size="small" label="已封存" />}
                    </Stack>
                    <Typography color="text.secondary">{item.skills.length ? `技能：${item.skills.join('、')}` : '尚未設定技能'}</Typography>
                    <Typography variant="body2">可擔任：{item.allowedRoles.length ? item.allowedRoles.map((role) => workRoleLabels[role]).join('、') : '未限制'}</Typography>
                    {item.note && <Typography variant="body2">備註：{item.note}</Typography>}
                  </Box>
                  <Button startIcon={item.status === 'archived' ? <RestoreRounded /> : <EditRounded />} onClick={() => startPersonnel(item)}>編輯</Button>
                </Stack>
              </Paper>
            ))}
          </>
        ) : (
          <>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">公裝器材列表（{equipment.length}）</Typography>
              <Button variant="contained" startIcon={<AddRounded />} onClick={() => startEquipment()}>新增器材</Button>
            </Stack>
            {!equipment.length && <Alert severity="info">尚未建立器材。可為器材指定預設套裝，供工作紀錄一鍵帶入。</Alert>}
            {equipment.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 2, opacity: item.status === 'archived' ? 0.68 : 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="h6">{item.name}</Typography>
                      <Chip size="small" label={`預設 ${item.defaultQuantity} ${item.unit}`} />
                      {item.status === 'archived' && <Chip size="small" label="已封存" />}
                    </Stack>
                    <Typography color="text.secondary">套裝：{item.packages.map((name) => equipmentPackageLabels[name]).join('、') || '不自動帶入'}</Typography>
                    {item.note && <Typography variant="body2">{item.note}</Typography>}
                  </Box>
                  <Button startIcon={<EditRounded />} onClick={() => startEquipment(item)}>編輯</Button>
                </Stack>
              </Paper>
            ))}
          </>
        )}
      </Stack>

      <Dialog open={Boolean(personnelForm)} onClose={() => !saving && setPersonnelForm(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{editingPersonnelId ? '編輯工作人員' : '新增工作人員'}</DialogTitle>
        {personnelForm && <DialogContent dividers><Stack spacing={2}>
          <Alert severity="info">人員 ID 建立後不會改變。若有同名，請使用編號、職務或備註區分。</Alert>
          <TextField required label="姓名" value={personnelForm.name} onChange={(event) => setPersonnelForm({ ...personnelForm, name: event.target.value })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label="辨識編號" placeholder="例如：小陳 1 號" value={personnelForm.code} onChange={(event) => setPersonnelForm({ ...personnelForm, code: event.target.value })} />
            <TextField fullWidth label="職務" value={personnelForm.jobTitle} onChange={(event) => setPersonnelForm({ ...personnelForm, jobTitle: event.target.value })} />
          </Stack>
          <TextField label="技能" helperText="以頓號或逗號分隔，例如：攀樹、吊車操作、駕照" value={skillsText} onChange={(event) => setSkillsText(event.target.value)} />
          <Box><Typography sx={{ mb: 1 }}>可擔任角色</Typography><Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>{(Object.entries(workRoleLabels) as [WorkRole, string][]).map(([role, label]) => <Chip key={role} clickable color={personnelForm.allowedRoles.includes(role) ? 'primary' : 'default'} label={label} onClick={() => setPersonnelForm({ ...personnelForm, allowedRoles: toggleValue(personnelForm.allowedRoles, role) })} />)}</Stack></Box>
          <TextField multiline minRows={2} label="備註" value={personnelForm.note} onChange={(event) => setPersonnelForm({ ...personnelForm, note: event.target.value })} />
          {editingPersonnelId && <><Divider /><Button color={personnelForm.status === 'archived' ? 'primary' : 'warning'} startIcon={personnelForm.status === 'archived' ? <RestoreRounded /> : <ArchiveRounded />} onClick={() => setPersonnelForm({ ...personnelForm, status: personnelForm.status === 'archived' ? 'active' : 'archived' })}>{personnelForm.status === 'archived' ? '恢復使用' : '封存人員'}</Button></>}
        </Stack></DialogContent>}
        <DialogActions><Button onClick={() => setPersonnelForm(undefined)}>取消</Button><Button variant="contained" disabled={saving} onClick={savePersonnel}>{saving ? '儲存中…' : '儲存'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(equipmentForm)} onClose={() => !saving && setEquipmentForm(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{editingEquipmentId ? '編輯公裝器材' : '新增公裝器材'}</DialogTitle>
        {equipmentForm && <DialogContent dividers><Stack spacing={2}>
          <TextField required label="器材名稱" value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} />
          <Stack direction="row" spacing={2}><TextField fullWidth type="number" label="預設數量" value={equipmentForm.defaultQuantity} slotProps={{ htmlInput: { min: 0.5, step: 0.5 } }} onChange={(event) => setEquipmentForm({ ...equipmentForm, defaultQuantity: Number(event.target.value) })} /><TextField fullWidth label="單位" value={equipmentForm.unit} onChange={(event) => setEquipmentForm({ ...equipmentForm, unit: event.target.value })} /></Stack>
          <Box><Typography sx={{ mb: 1 }}>預設套裝</Typography><Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>{(Object.entries(equipmentPackageLabels) as [EquipmentPackage, string][]).map(([name, label]) => <Chip key={name} clickable color={equipmentForm.packages.includes(name) ? 'secondary' : 'default'} label={label} onClick={() => setEquipmentForm({ ...equipmentForm, packages: toggleValue(equipmentForm.packages, name) })} />)}</Stack></Box>
          <TextField multiline minRows={2} label="備註" value={equipmentForm.note} onChange={(event) => setEquipmentForm({ ...equipmentForm, note: event.target.value })} />
          {editingEquipmentId && <><Divider /><Button color={equipmentForm.status === 'archived' ? 'primary' : 'warning'} startIcon={equipmentForm.status === 'archived' ? <RestoreRounded /> : <ArchiveRounded />} onClick={() => setEquipmentForm({ ...equipmentForm, status: equipmentForm.status === 'archived' ? 'active' : 'archived' })}>{equipmentForm.status === 'archived' ? '恢復使用' : '封存器材'}</Button></>}
        </Stack></DialogContent>}
        <DialogActions><Button onClick={() => setEquipmentForm(undefined)}>取消</Button><Button variant="contained" disabled={saving} onClick={saveEquipment}>{saving ? '儲存中…' : '儲存'}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
