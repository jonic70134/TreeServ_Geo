'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuRounded from '@mui/icons-material/MenuRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import Google from '@mui/icons-material/Google';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import {
  AccessDeniedError,
  auditData,
  auth,
  authorizeAccount,
  collection,
  db,
  doc,
  firebaseReady,
  googleSignIn,
  logActivity,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  authErrorMessage,
  serverTimestamp,
  signOut,
  writeBatch,
  type AccessRole,
  type User,
} from './firebase';
import { crewOptions, demoLocations } from './demo-data';
import type { RoutePoint, SiteLocation, WorkRecord } from './types';
import SiteMap from './SiteMap';
import RouteMap from './RouteMap';
import HospitalRoute from './HospitalRoute';
import ActivityLog from './ActivityLog';
import AccessManagement from './AccessManagement';
import PlanBook, { type PlanDraftData } from './PlanBook';
import DraftList from './DraftList';
import {
  deleteDraftWithAssets,
  saveDraft,
  savedTimeLabel,
  type DraftDocument,
} from './drafts';

type View = 'map' | 'access' | 'logs' | 'plan' | 'drafts';
type RecordForm = {
  siteName: string;
  address: string;
  status: string;
  attention: string;
  title: string;
  notes: string;
  workDate: string;
  endDate: string;
  crew: string[];
  meetingTime: string;
  meetingPlace: string;
  mapUrl: string;
  weather: string;
  hospitalName: string;
  hospitalPhone: string;
  hospitalDistance: string;
  hospitalTravelTime: string;
  workDetails: string;
  assignments: string;
  crane: string;
  disposal: string;
  parking: string;
  roadPermit: string;
  equipment: string;
  safetyNotes: string;
  imageUrls: string;
  youtubeUrls: string;
  fileUrls: string;
  lat: number;
  lng: number;
};
type WorkRecordDraftData = {
  form: RecordForm;
  routePoints: RoutePoint[];
  routeNotes: string;
  newSite: boolean;
  editingId?: string;
  editingLocationId?: string;
};

const demos = demoLocations as SiteLocation[];
const emptyForm: RecordForm = {
  siteName: '',
  address: '',
  status: '進行中',
  attention: '',
  title: '',
  notes: '',
  workDate: '',
  endDate: '',
  crew: [],
  meetingTime: '07:30',
  meetingPlace: '',
  mapUrl: '',
  weather: '',
  hospitalName: '',
  hospitalPhone: '',
  hospitalDistance: '',
  hospitalTravelTime: '',
  workDetails: '',
  assignments: '',
  crane: '',
  disposal: '',
  parking: '',
  roadPermit: '',
  equipment: '',
  safetyNotes: '',
  imageUrls: '',
  youtubeUrls: '',
  fileUrls: '',
  lat: 25.0684,
  lng: 121.6158,
};
const cleanUrls = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item))
    .slice(0, 20);
const normalizeSearch = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const youtubeId = (url: string) =>
  url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/,
  )?.[1] ?? '';

function parseRecordDate(value?: string) {
  if (!value) return undefined;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const short = value.match(/^(\d{1,2})\/(\d{1,2})(?:\D.*)?$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (short)
    return new Date(
      new Date().getFullYear(),
      Number(short[1]) - 1,
      Number(short[2]),
    );
  return undefined;
}
function fullDate(value?: string) {
  const date = parseRecordDate(value);
  return date
    ? new Intl.DateTimeFormat('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : (value ?? '');
}
function locationStatus(location: SiteLocation) {
  if (location.status === '已完成') return '已完成';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ranges = (location.records ?? [])
    .map((record) => ({
      start: parseRecordDate(record.workDate || record.dateLabel),
      end: parseRecordDate(
        record.endDate || record.workDate || record.dateLabel,
      ),
    }))
    .filter((range) => range.start);
  if (!ranges.length)
    return ['進行中', '待驗收', '待複查'].includes(location.status)
      ? location.status
      : '待排程';
  if (
    ranges.some(
      ({ start, end }) =>
        start!.getTime() <= today.getTime() &&
        (end ?? start)!.getTime() >= today.getTime(),
    )
  )
    return '進行中';
  if (ranges.some(({ start }) => start!.getTime() > today.getTime()))
    return '即將開始';
  return location.status === '待複查' ? '待複查' : '待驗收';
}
function locationOrder(location: SiteLocation) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = (location.records ?? [])
    .map((record) => parseRecordDate(record.workDate || record.dateLabel))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  const upcoming = dates.find((date) => date.getTime() >= today.getTime());
  return upcoming
    ? [0, upcoming.getTime()]
    : dates.length
      ? [1, -dates.at(-1)!.getTime()]
      : [2, 0];
}
function calendarUrl(location: SiteLocation, record: WorkRecord) {
  const start = parseRecordDate(record.workDate || record.dateLabel);
  if (!start) return '';
  const end =
    parseRecordDate(record.endDate || record.workDate || record.dateLabel) ??
    start;
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  const stamp = (date: Date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const details = [
    record.notes,
    record.meetingTime && `集合時間：${record.meetingTime}`,
    record.meetingPlace && `集合地點：${record.meetingPlace}`,
    record.mapUrl,
  ]
    .filter(Boolean)
    .join('\n');
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: `${location.name}｜${record.title}`, dates: `${stamp(start)}/${stamp(exclusiveEnd)}`, details, location: location.address })}`;
}
async function geocodeAddress(address: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&q=${encodeURIComponent(address)}`,
    { headers: { 'Accept-Language': 'zh-TW' } },
  );
  const result = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!result[0]) throw new Error('address-not-found');
  return { lat: Number(result[0].lat), lng: Number(result[0].lon) };
}

function LinkifiedText({ children }: { children?: string }) {
  if (!children) return null;
  const parts = children.split(/(https?:\/\/[^\s]+)/gi);
  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//i.test(part) ? (
          <a
            key={index}
            href={part.replace(/[),.;，。！!？?]+$/, '')}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export default function TreeServApp() {
  const [account, setAccount] = useState<User>();
  const [role, setRole] = useState<AccessRole>();
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState('');
  const [view, setView] = useState<View>('map');
  const [storedLocations, setStoredLocations] = useState<SiteLocation[]>([]);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [deletedImports, setDeletedImports] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(demos[0]?.id ?? '');
  const [activeRecordId, setActiveRecordId] = useState('');
  const [search, setSearch] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement>();
  const [recordOpen, setRecordOpen] = useState(false);
  const [newSite, setNewSite] = useState(false);
  const [editing, setEditing] = useState<WorkRecord>();
  const [form, setForm] = useState<RecordForm>(emptyForm);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeNotes, setRouteNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [planDraft, setPlanDraft] = useState<DraftDocument<PlanDraftData>>();
  const [recordDraftId, setRecordDraftId] = useState('');
  const [recordDraftOwner, setRecordDraftOwner] = useState<{ uid?: string; name?: string }>({});
  const [draftSaving, setDraftSaving] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState('');
  const recordDraftDirty = useRef(false);
  const recordDraftInitialized = useRef(false);
  const lastRecordDraftSignature = useRef('');
  const recordDraftPayloadRef = useRef<WorkRecordDraftData>();
  const saveRecordDraftRef = useRef<(mode: 'manual' | 'auto') => Promise<void>>(async () => {});
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    color?: 'error' | 'primary';
    confirmLabel?: string;
    alternateLabel?: string;
    alternateRun?: () => Promise<void>;
    run: () => Promise<void>;
  }>();

  const notify = (message: string) => setToast(message);

  useEffect(() => {
    if (!auth) {
      setAuthBusy(false);
      return;
    }
    return onAuthStateChanged(auth, async (next) => {
      setAuthBusy(true);
      if (!next) {
        setAccount(undefined);
        setRole(undefined);
        setView('map');
        setAuthBusy(false);
        return;
      }
      try {
        const accessRole = await authorizeAccount(next);
        setAccount(next);
        setRole(accessRole);
        setAuthError('');
        await logActivity(next, 'login');
      } catch (error) {
        setAccount(undefined);
        setRole(undefined);
        setAuthError(
          error instanceof AccessDeniedError
            ? error.message
            : '無法確認邀請資格，請稍後再試。',
        );
        await signOut(auth!);
      } finally {
        setAuthBusy(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!db || !account || !role) {
      setStoredLocations([]);
      setRecords([]);
      setDeletedImports([]);
      return;
    }
    const stopLocations = onSnapshot(
      query(collection(db, 'locations'), orderBy('updatedAt', 'desc')),
      (snapshot) =>
        setStoredLocations(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as SiteLocation,
          ),
        ),
      () => notify('案場同步暫時中斷。'),
    );
    const stopRecords = onSnapshot(
      query(collection(db, 'workRecords'), orderBy('createdAt', 'desc')),
      (snapshot) =>
        setRecords(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as WorkRecord,
          ),
        ),
      () => notify('工作紀錄同步暫時中斷。'),
    );
    const stopDeleted = onSnapshot(
      collection(db, 'importedRecordStates'),
      (snapshot) =>
        setDeletedImports(
          snapshot.docs
            .filter((item) => item.data().deleted)
            .map((item) => item.id),
        ),
      () => notify('匯入資料同步暫時中斷。'),
    );
    return () => {
      stopLocations();
      stopRecords();
      stopDeleted();
    };
  }, [account?.uid, role]);

  const locations = useMemo(
    () => [
      ...storedLocations,
      ...demos.filter(
        (demo) => !storedLocations.some((item) => item.id === demo.id),
      ),
    ],
    [storedLocations],
  );
  function locationRecords(location: SiteLocation) {
    const synced = records.filter(
      (record) => record.locationId === location.id,
    );
    const originals =
      demos.find((demo) => demo.id === location.id)?.records ?? [];
    return [
      ...synced.filter(
        (record) => !originals.some((original) => original.id === record.id),
      ),
      ...originals
        .filter((record) => !deletedImports.includes(record.id))
        .map(
          (record) => synced.find((item) => item.id === record.id) ?? record,
        ),
    ];
  }
  const mapLocations = useMemo(
    () =>
      locations.map((location) => ({
        ...location,
        records: locationRecords(location),
      })),
    [locations, records, deletedImports],
  );
  const sortedLocations = useMemo(
    () =>
      [...mapLocations].sort((a, b) => {
        const aa = locationOrder(a),
          bb = locationOrder(b);
        return (
          aa[0] - bb[0] ||
          aa[1] - bb[1] ||
          a.name.localeCompare(b.name, 'zh-TW')
        );
      }),
    [mapLocations],
  );
  const activeLocation =
    sortedLocations.find((location) => location.id === activeId) ??
    sortedLocations[0];
  const activeRecords = activeLocation?.records ?? [];
  const activeRecord =
    activeRecords.find((record) => record.id === activeRecordId) ??
    activeRecords[0];
  useEffect(() => {
    setActiveRecordId(activeRecords[0]?.id ?? '');
  }, [activeId, activeRecords.map((record) => record.id).join(',')]);

  const filteredLocations = useMemo(() => {
    const needle = normalizeSearch(search);
    if (!needle) return sortedLocations;
    return sortedLocations.filter((location) =>
      normalizeSearch(
        [
          location.name,
          location.address,
          location.attention,
          ...(location.aliases ?? []),
          ...location.records!.flatMap((record) => [
            record.title,
            record.notes,
            record.workDetails ?? '',
            record.safetyNotes ?? '',
          ]),
        ].join(' '),
      ).includes(needle),
    );
  }, [sortedLocations, search]);

  async function login() {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      await googleSignIn();
    } catch (error) {
      setAuthError(authErrorMessage(error));
      setAuthBusy(false);
    }
  }
  async function logout() {
    if (!auth) return;
    try {
      if (account) await logActivity(account, 'logout');
    } finally {
      await signOut(auth);
      setMenuAnchor(undefined);
    }
  }
  const canManage = role === 'owner' || role === 'admin';
  const recordDraftPayload = useMemo<WorkRecordDraftData>(() => ({
    form,
    routePoints,
    routeNotes,
    newSite,
    ...(editing?.id ? { editingId: editing.id, editingLocationId: editing.locationId } : {}),
  }), [form, routePoints, routeNotes, newSite, editing?.id, editing?.locationId]);
  const recordDraftSignature = useMemo(() => JSON.stringify(recordDraftPayload), [recordDraftPayload]);
  recordDraftPayloadRef.current = recordDraftPayload;

  useEffect(() => {
    if (!recordOpen || !canManage) return;
    if (!recordDraftInitialized.current) {
      recordDraftInitialized.current = true;
      lastRecordDraftSignature.current = recordDraftSignature;
      return;
    }
    recordDraftDirty.current = recordDraftSignature !== lastRecordDraftSignature.current;
  }, [recordDraftSignature, recordOpen, canManage]);
  useEffect(() => {
    if (!recordOpen || !canManage) return;
    const timer = window.setInterval(() => {
      if (recordDraftDirty.current) void saveRecordDraftRef.current('auto');
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [recordOpen, canManage]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!recordOpen || !canManage || !recordDraftDirty.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recordOpen, canManage]);
  const isImported = (record: WorkRecord) =>
    demos.some((location) =>
      location.records?.some((item) => item.id === record.id),
    );
  const canEdit = (record: WorkRecord) =>
    role === 'owner' || role === 'admin' || record.authorId === account?.uid;

  async function saveRecordDraft(mode: 'manual' | 'auto') {
    if (!canManage || !account || !recordOpen || draftSaving || !recordDraftId) return;
    if (mode === 'auto' && !recordDraftDirty.current) return;
    setDraftSaving(true);
    try {
      const data = recordDraftPayloadRef.current ?? recordDraftPayload;
      await saveDraft({
        id: recordDraftId,
        kind: 'work_record',
        title: form.title || form.siteName || '未命名案場工作紀錄',
        data,
        account,
        mode,
        createdBy: recordDraftOwner.uid,
        createdByName: recordDraftOwner.name,
      });
      lastRecordDraftSignature.current = JSON.stringify(data);
      recordDraftDirty.current = false;
      const time = savedTimeLabel();
      if (mode === 'auto') setAutoSavedAt(`${time} 已自動存入草稿`);
      else notify(`${time} 已儲存草稿。`);
    } catch {
      if (mode === 'auto') setAutoSavedAt('自動儲存失敗，請按「儲存草稿」重試');
      else notify('草稿儲存失敗，請稍後再試。');
    } finally {
      setDraftSaving(false);
    }
  }
  saveRecordDraftRef.current = saveRecordDraft;

  function openCreate(forCurrentSite: boolean) {
    const current = activeLocation;
    setEditing(undefined);
    setNewSite(!forCurrentSite);
    setForm({
      ...emptyForm,
      siteName: forCurrentSite ? (current?.name ?? '') : '',
      address: forCurrentSite ? (current?.address ?? '') : '',
      lat: forCurrentSite ? (current?.lat ?? emptyForm.lat) : emptyForm.lat,
      lng: forCurrentSite ? (current?.lng ?? emptyForm.lng) : emptyForm.lng,
    });
    setRoutePoints([]);
    setRouteNotes('');
    setRecordDraftId(crypto.randomUUID());
    setRecordDraftOwner({});
    setAutoSavedAt('');
    recordDraftInitialized.current = false;
    recordDraftDirty.current = false;
    setRecordOpen(true);
  }
  async function openEdit(record: WorkRecord) {
    if (!canEdit(record)) return;
    const location = mapLocations.find((item) => item.id === record.locationId);
    setEditing(record);
    setNewSite(false);
    setForm({
      ...emptyForm,
      ...record,
      siteName: location?.name ?? '',
      address: location?.address ?? '',
      lat: location?.lat ?? emptyForm.lat,
      lng: location?.lng ?? emptyForm.lng,
      crew: [...(record.crew ?? [])],
      imageUrls: (record.imageUrls ?? []).join('\n'),
      youtubeUrls: (record.youtubeUrls ?? []).join('\n'),
      fileUrls: (record.fileUrls ?? []).join('\n'),
    });
    setRoutePoints((record.routePoints ?? []).map((point) => ({ ...point })));
    setRouteNotes(record.routeNotes ?? '');
    setRecordDraftId(crypto.randomUUID());
    setRecordDraftOwner({});
    setAutoSavedAt('');
    recordDraftInitialized.current = false;
    recordDraftDirty.current = false;
    setRecordOpen(true);
    if (account)
      await logActivity(account, 'edit', record.id, record.title).catch(() =>
        notify('操作紀錄寫入失敗。'),
      );
  }

  function openWorkDraft(draft: DraftDocument<WorkRecordDraftData>) {
    const data = draft.data;
    const sourceRecord = data.editingId ? records.find((record) => record.id === data.editingId) : undefined;
    setEditing(sourceRecord);
    setNewSite(Boolean(data.newSite));
    setForm({ ...emptyForm, ...data.form, crew: [...(data.form.crew ?? [])] });
    setRoutePoints((data.routePoints ?? []).map((point) => ({ ...point })));
    setRouteNotes(data.routeNotes ?? '');
    setRecordDraftId(draft.id);
    setRecordDraftOwner({ uid: draft.createdBy, name: draft.createdByName });
    setAutoSavedAt('');
    recordDraftInitialized.current = false;
    recordDraftDirty.current = false;
    setRecordOpen(true);
  }
  const setField =
    (key: keyof RecordForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function persistRecord(mergeLocationId?: string) {
    if (!db || !account || !role) return;
    if (!form.title.trim() || !form.notes.trim()) {
      notify('請填寫紀錄標題與工作內容。');
      return;
    }
    if (routePoints.length === 1) {
      notify('請加上 B 終點，或清除未完成路線。');
      return;
    }
    if (newSite && (!form.siteName.trim() || !form.address.trim())) {
      notify('請填寫案場名稱與地址。');
      return;
    }
    if (form.workDate && form.endDate && form.endDate < form.workDate) {
      notify('施工結束日期不可早於起始日期。');
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db),
        auditRef = doc(collection(db, 'activityLogs'));
      const recordId = editing?.id ?? doc(collection(db, 'workRecords')).id;
      let locationId = editing?.locationId ?? activeLocation?.id;
      if (!editing && newSite && mergeLocationId) locationId = mergeLocationId;
      if (!editing && newSite && !mergeLocationId) {
        const point = await geocodeAddress(form.address.trim());
        const locationRef = doc(collection(db, 'locations'));
        locationId = locationRef.id;
        batch.set(locationRef, {
          name: form.siteName.trim(),
          address: form.address.trim(),
          status: form.status.trim(),
          attention: form.attention.trim(),
          aliases: [],
          lat: point.lat,
          lng: point.lng,
          createdBy: account.uid,
          updatedAt: serverTimestamp(),
        });
      }
      const payload = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        workDate: form.workDate,
        endDate: form.endDate,
        crew: form.crew,
        meetingTime: form.meetingTime.trim(),
        meetingPlace: form.meetingPlace.trim(),
        mapUrl: form.mapUrl.trim(),
        weather: form.weather.trim(),
        hospitalName: form.hospitalName.trim(),
        hospitalPhone: form.hospitalPhone.trim(),
        hospitalDistance: form.hospitalDistance.trim(),
        hospitalTravelTime: form.hospitalTravelTime.trim(),
        workDetails: form.workDetails.trim(),
        assignments: form.assignments.trim(),
        crane: form.crane.trim(),
        disposal: form.disposal.trim(),
        parking: form.parking.trim(),
        roadPermit: form.roadPermit.trim(),
        equipment: form.equipment.trim(),
        safetyNotes: form.safetyNotes.trim(),
        imageUrls: cleanUrls(form.imageUrls),
        youtubeUrls: cleanUrls(form.youtubeUrls),
        fileUrls: cleanUrls(form.fileUrls),
        routePoints,
        routeNotes: routeNotes.trim(),
        updatedAt: serverTimestamp(),
        lastAuditId: auditRef.id,
      };
      if (editing) {
        if (
          isImported(editing) &&
          !records.some((item) => item.id === editing.id)
        )
          batch.set(doc(db, 'workRecords', editing.id), {
            ...payload,
            locationId: editing.locationId,
            authorId: account.uid,
            authorName: editing.authorName,
            dateLabel: editing.dateLabel ?? '',
            createdAt: serverTimestamp(),
            sourceImported: true,
          });
        else batch.update(doc(db, 'workRecords', editing.id), payload);
      } else
        batch.set(doc(db, 'workRecords', recordId), {
          ...payload,
          locationId,
          authorId: account.uid,
          authorName: account.displayName || account.email || '使用者',
          createdAt: serverTimestamp(),
        });
      batch.set(
        auditRef,
        auditData(
          account,
          editing ? 'update' : 'create',
          recordId,
          payload.title,
        ),
      );
      await batch.commit();
      if (canManage && recordDraftId) await deleteDraftWithAssets(recordDraftId).catch(() => undefined);
      setRecordOpen(false);
      setRecordDraftId('');
      recordDraftDirty.current = false;
      notify(editing ? '工作紀錄已更新。' : '工作紀錄已建立。');
    } catch (error) {
      notify(
        error instanceof Error && error.message === 'address-not-found'
          ? '找不到這個地址，請補充縣市、區域或門牌後再試。'
          : '儲存失敗，請確認帳號權限；輸入內容仍保留。',
      );
    } finally {
      setSaving(false);
    }
  }
  function requestSave() {
    if (editing) {
      setConfirm({
        title: '更新工作紀錄？',
        body: `確定以目前內容更新「${editing.title}」？`,
        run: () => persistRecord(),
      });
      return;
    }
    const duplicate = newSite
      ? sortedLocations.find(
          (location) =>
            normalizeSearch(location.name) === normalizeSearch(form.siteName) ||
            normalizeSearch(location.address) === normalizeSearch(form.address),
        )
      : undefined;
    if (duplicate) {
      setConfirm({
        title: '合併到現有案場？',
        body: `已找到「${duplicate.name}」。你可以合併為同一案場，或另外建立新案場。`,
        confirmLabel: '合併紀錄',
        alternateLabel: '建立新案場',
        run: () => persistRecord(duplicate.id),
        alternateRun: () => persistRecord(),
      });
      return;
    }
    void persistRecord();
  }
  function requestDelete(record: WorkRecord) {
    if (role !== 'owner') return;
    setConfirm({
      title: '刪除工作紀錄？',
      body: `確定刪除「${record.title}」？此動作無法復原。`,
      color: 'error',
      run: async () => {
        if (!db || !account) return;
        const batch = writeBatch(db),
          auditRef = doc(collection(db, 'activityLogs'));
        const removeLocation =
          activeRecords.length === 1 &&
          storedLocations.some((location) => location.id === record.locationId);
        if (
          !isImported(record) ||
          records.some((item) => item.id === record.id)
        )
          batch.delete(doc(db, 'workRecords', record.id));
        if (isImported(record))
          batch.set(doc(db, 'importedRecordStates', record.id), {
            deleted: true,
            updatedAt: serverTimestamp(),
            auditId: auditRef.id,
          });
        if (removeLocation)
          batch.delete(doc(db, 'locations', record.locationId));
        batch.set(doc(db, 'recordDeletions', record.id), {
          ...auditData(account, 'delete', record.id, record.title),
          auditId: auditRef.id,
        });
        batch.set(
          auditRef,
          auditData(account, 'delete', record.id, record.title),
        );
        await batch.commit();
        if (removeLocation) setActiveId(sortedLocations.find((location) => location.id !== record.locationId)?.id ?? '');
        notify(removeLocation ? '紀錄與空案場地標已刪除。' : '紀錄已刪除。');
      },
    });
  }
  async function runConfirm() {
    if (!confirm) return;
    setSaving(true);
    try {
      await confirm.run();
      setConfirm(undefined);
    } catch {
      notify('操作失敗，請重新整理後再試。');
    } finally {
      setSaving(false);
    }
  }
  async function runAlternate() {
    if (!confirm?.alternateRun) return;
    setSaving(true);
    try {
      await confirm.alternateRun();
      setConfirm(undefined);
    } catch {
      notify('操作失敗，請重新整理後再試。');
    } finally {
      setSaving(false);
    }
  }

  if (authBusy)
    return (
      <Stack
        spacing={2}
        sx={{
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
        <Typography color="text.secondary">
          正在確認 Google 帳號與邀請資格…
        </Typography>
      </Stack>
    );
  if (!account || !role)
    return (
      <Box className="login-stage">
        <Paper
          variant="outlined"
          sx={{ width: 'min(440px, calc(100% - 32px))', p: { xs: 3, md: 5 } }}
        >
          <Stack spacing={3}>
            <Box>
              <Avatar
                sx={{ bgcolor: 'primary.main', width: 56, height: 56, mb: 2 }}
              >
                <MapRounded />
              </Avatar>
              <Typography variant="h4" gutterBottom>
                TreeServ Geo
              </Typography>
              <Typography color="text.secondary">
                僅限收到 Owner 邀請的 Google 帳號登入。
              </Typography>
            </Box>
            {new URLSearchParams(window.location.search).get('invite') && (
              <Alert severity="info">
                請使用收到邀請的 Google 帳號登入；帳號必須與邀請信箱相同。
              </Alert>
            )}
            {authError && <Alert severity="error">{authError}</Alert>}
            <Button
              size="large"
              variant="contained"
              startIcon={<Google />}
              disabled={!firebaseReady || authBusy}
              loading={authBusy}
              onClick={login}
            >
              使用受邀 Google 帳號登入
            </Button>
            <Typography variant="caption" color="text.secondary">
              Google 只確認帳號身分；TreeServ Geo 會再核對邀請與帳號狀態。
            </Typography>
          </Stack>
        </Paper>
      </Box>
    );
  if (view === 'plan' && canManage)
    return <PlanBook account={account} initialDraft={planDraft} onBack={() => { setPlanDraft(undefined); setView('map'); }} />;

  const labels: Array<[keyof RecordForm, string, boolean?]> = [
    ['title', '紀錄標題'],
    ['notes', '工作內容', true],
    ['workDate', '施工起始日期'],
    ['endDate', '施工結束日期'],
    ['meetingTime', '集合時間'],
    ['meetingPlace', '集合地點'],
    ['mapUrl', '地圖連結'],
    ['weather', '天氣'],
    ['hospitalName', '鄰近醫院'],
    ['hospitalPhone', '醫院電話'],
    ['hospitalDistance', '醫院距離'],
    ['hospitalTravelTime', '車程'],
    ['workDetails', '詳細工作內容', true],
    ['assignments', '人員分組／協力', true],
    ['crane', '吊車'],
    ['disposal', '清運'],
    ['parking', '停車／卸裝備', true],
    ['roadPermit', '路權'],
    ['equipment', '裝備與工具', true],
    ['safetyNotes', '安全與進場注意', true],
    ['imageUrls', '圖片網址（每行一個）', true],
    ['youtubeUrls', 'YouTube 網址（每行一個）', true],
    ['fileUrls', '檔案網址（每行一個）', true],
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <Stack
            direction="row"
            spacing={1.2}
            sx={{
              alignItems: 'center',
              minWidth: { md: 210 },
              cursor: 'pointer',
            }}
            onClick={() => setView('map')}
          >
            <Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}>
              <MapRounded />
            </Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontWeight: 850, lineHeight: 1 }}>
                TreeServ Geo
              </Typography>
              <Typography variant="caption" color="text.secondary">
                案場工作紀錄
              </Typography>
            </Box>
          </Stack>
          <TextField
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋地點、地址或紀錄…"
            sx={{ flex: 1, maxWidth: 620 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            variant="contained"
            startIcon={<AddRounded />}
            onClick={() => openCreate(false)}
          >
            建立工作紀錄
          </Button>
          {canManage && (
            <Button
              sx={{ display: { xs: 'none', lg: 'inline-flex' } }}
              color="secondary"
              variant="contained"
              startIcon={<DescriptionRounded />}
              onClick={() => { setPlanDraft(undefined); setView('plan'); }}
            >
              製作計畫書
            </Button>
          )}
          <Tooltip title="開啟選單">
            <IconButton
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              aria-label="開啟功能選單"
            >
              <MenuRounded />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(undefined)}
        slotProps={{ paper: { sx: { minWidth: 280 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Avatar src={account.photoURL ?? undefined}>
              {account.displayName?.[0]}
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 750 }}>
                {account.displayName || 'Google 使用者'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {account.email}
              </Typography>
              <Typography
                variant="caption"
                color="primary"
                sx={{ display: 'block' }}
              >
                {role === 'owner'
                  ? 'Owner'
                  : role === 'admin'
                    ? '系統管理者'
                    : '一般使用者'}
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            openCreate(false);
            setMenuAnchor(undefined);
          }}
        >
          <AddRounded sx={{ mr: 1.5 }} />
          建立工作紀錄
        </MenuItem>
        <MenuItem
          onClick={() => {
            setView('map');
            setMenuAnchor(undefined);
          }}
        >
          <MapRounded sx={{ mr: 1.5 }} />
          案場地圖
        </MenuItem>
        {canManage && (
          <MenuItem
            onClick={() => {
              setView('drafts');
              setMenuAnchor(undefined);
            }}
          >
            <EditNoteRounded sx={{ mr: 1.5 }} />
            草稿列表
          </MenuItem>
        )}
        {canManage && (
          <MenuItem
            onClick={() => {
              setView('access');
              setMenuAnchor(undefined);
            }}
          >
            <AdminPanelSettingsRounded sx={{ mr: 1.5 }} />
            權限管理
          </MenuItem>
        )}
        {canManage && (
          <MenuItem
            onClick={() => {
              setView('logs');
              setMenuAnchor(undefined);
            }}
          >
            <HistoryRounded sx={{ mr: 1.5 }} />
            操作紀錄
          </MenuItem>
        )}
        {canManage && (
          <MenuItem
            onClick={() => {
              setPlanDraft(undefined);
              setView('plan');
              setMenuAnchor(undefined);
            }}
          >
            <DescriptionRounded sx={{ mr: 1.5 }} />
            製作計畫書
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={logout}>
          <LogoutRounded sx={{ mr: 1.5 }} />
          登出
        </MenuItem>
      </Menu>

      {view === 'drafts' && canManage ? (
        <DraftList
          notify={notify}
          onOpen={(draft) => {
            if (draft.kind === 'pruning_plan') {
              setPlanDraft(draft as DraftDocument<PlanDraftData>);
              setView('plan');
            } else {
              setView('map');
              openWorkDraft(draft as DraftDocument<WorkRecordDraftData>);
            }
          }}
        />
      ) : view === 'access' && canManage ? (
        <AccessManagement account={account} role={role} notify={notify} />
      ) : view === 'logs' && canManage ? (
        <ActivityLog />
      ) : (
        <Box className="mui-workspace">
          <Paper square variant="outlined" className="mui-place-list">
            <Box sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                工作地點
              </Typography>
              <Typography variant="h6">
                {filteredLocations.length} 個案場
              </Typography>
            </Box>
            <Divider />
            <Box className="mobile-site-select" sx={{ p: 2 }}>
              <TextField
                select
                fullWidth
                label="切換案場"
                value={activeLocation?.id ?? ''}
                onChange={(event) => setActiveId(event.target.value)}
              >
                {filteredLocations.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <List disablePadding className="desktop-site-list">
              {filteredLocations.map((location) => (
                <ListItemButton
                  key={location.id}
                  selected={location.id === activeLocation?.id}
                  onClick={() => setActiveId(location.id)}
                >
                  <ListItemText
                    primary={location.name}
                    secondary={`${location.records?.length ?? 0} 筆紀錄 · ${locationStatus(location)}`}
                  />
                </ListItemButton>
              ))}
            </List>
            <Box sx={{ mt: 'auto', p: 2 }}>
              <Alert severity="success" icon={<AdminPanelSettingsRounded />}>
                邀請制已啟用；資料只提供已授權帳號。
              </Alert>
            </Box>
          </Paper>
          <Paper square variant="outlined" className="mui-record-panel">
            {activeLocation ? (
              <Stack spacing={2.2}>
                <Box>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between' }}
                  >
                    <Typography variant="overline" color="text.secondary">
                      案場紀錄
                    </Typography>
                    <Chip size="small" label={locationStatus(activeLocation)} />
                  </Stack>
                  <Typography variant="h4">{activeLocation.name}</Typography>
                  <Typography color="text.secondary">
                    <LinkifiedText>{activeLocation.address}</LinkifiedText>
                  </Typography>
                </Box>
                {activeLocation.attention && (
                  <Alert severity="warning">
                    <strong>進場與安全注意</strong>
                    <br />
                    {activeLocation.attention}
                  </Alert>
                )}
                <Stack
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography sx={{ fontWeight: 750 }}>
                    {activeRecords.length} 筆工作紀錄
                  </Typography>
                  <Button
                    startIcon={<AddRounded />}
                    onClick={() => openCreate(true)}
                  >
                    新增
                  </Button>
                </Stack>
                {activeRecords.length > 1 && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ overflowX: 'auto', pb: 0.5 }}
                  >
                    {activeRecords.map((record, index) => (
                      <Chip
                        key={record.id}
                        clickable
                        color={
                          record.id === activeRecord?.id ? 'primary' : 'default'
                        }
                        label={
                          fullDate(record.workDate || record.dateLabel) ||
                          `第 ${index + 1} 天`
                        }
                        onClick={() => setActiveRecordId(record.id)}
                      />
                    ))}
                  </Stack>
                )}
                {activeRecord ? (
                  <Paper variant="outlined" sx={{ p: 2.2 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {fullDate(
                            activeRecord.workDate || activeRecord.dateLabel,
                          ) || '最近更新'}
                          {activeRecord.endDate
                            ? ` 至 ${fullDate(activeRecord.endDate)}`
                            : ''}
                        </Typography>
                        <Typography variant="h6">
                          {activeRecord.title}
                        </Typography>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                          <LinkifiedText>{activeRecord.notes}</LinkifiedText>
                        </Typography>
                        <Stack
                          direction="row"
                          useFlexGap
                          sx={{ flexWrap: 'wrap', gap: 1, mt: 1.5 }}
                        >
                          {calendarUrl(activeLocation, activeRecord) && (
                            <Button
                              component="a"
                              href={calendarUrl(activeLocation, activeRecord)}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="small"
                              variant="outlined"
                              startIcon={<EventRounded />}
                            >
                              加入行事曆
                            </Button>
                          )}
                          {activeRecord.mapUrl && (
                            <Button
                              component="a"
                              href={activeRecord.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="small"
                              variant="outlined"
                              endIcon={<OpenInNewRounded />}
                            >
                              案場地圖
                            </Button>
                          )}
                        </Stack>
                      </Box>
                      {activeRecord.safetyNotes && (
                        <Alert severity="warning">
                          {activeRecord.safetyNotes}
                        </Alert>
                      )}
                      {[
                        [
                          '集合',
                          [activeRecord.meetingTime, activeRecord.meetingPlace]
                            .filter(Boolean)
                            .join('　'),
                        ],
                        ['天氣', activeRecord.weather],
                        ['工作內容', activeRecord.workDetails],
                        ['人員分組／協力', activeRecord.assignments],
                        ['吊車', activeRecord.crane],
                        ['清運', activeRecord.disposal],
                        ['停車／卸裝備', activeRecord.parking],
                        ['路權', activeRecord.roadPermit],
                        ['裝備與工具', activeRecord.equipment],
                      ]
                        .filter((item) => item[1])
                        .map((item) => (
                          <Box key={item[0] as string}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {item[0]}
                            </Typography>
                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                              <LinkifiedText>{item[1] as string}</LinkifiedText>
                            </Typography>
                          </Box>
                        ))}
                      {activeRecord.hospitalName && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            鄰近醫院
                          </Typography>
                          <Typography>
                            {[
                              activeRecord.hospitalName,
                              activeRecord.hospitalPhone,
                              activeRecord.hospitalDistance,
                              activeRecord.hospitalTravelTime,
                            ]
                              .filter(Boolean)
                              .join('　')}
                          </Typography>
                          <HospitalRoute
                            origin={{
                              lat: activeLocation.lat,
                              lng: activeLocation.lng,
                            }}
                            hospitalName={activeRecord.hospitalName}
                          />
                        </Box>
                      )}
                      {(activeRecord.routePoints?.length ?? 0) > 1 && (
                        <Box>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center', mb: 1 }}
                          >
                            <RouteRounded color="secondary" />
                            <Typography sx={{ fontWeight: 750 }}>
                              指定進場路線
                            </Typography>
                          </Stack>
                          <RouteMap
                            value={activeRecord.routePoints!}
                            center={activeRecord.routePoints![0]}
                          />
                        </Box>
                      )}
                      {activeRecord.imageUrls?.length > 0 && (
                        <Box className="mui-image-grid">
                          {activeRecord.imageUrls.map((url) => (
                            <img
                              key={url}
                              src={url}
                              alt="工作紀錄"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ))}
                        </Box>
                      )}
                      {activeRecord.youtubeUrls?.map(
                        (url) =>
                          youtubeId(url) && (
                            <Box key={url} className="mui-video">
                              <iframe
                                src={`https://www.youtube-nocookie.com/embed/${youtubeId(url)}`}
                                title="工作紀錄影片"
                                loading="lazy"
                              />
                            </Box>
                          ),
                      )}
                      {activeRecord.fileUrls?.map((url) => (
                        <Button
                          key={url}
                          component="a"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          endIcon={<OpenInNewRounded />}
                        >
                          開啟附件
                        </Button>
                      ))}
                      <Divider />
                      <Stack
                        direction="row"
                        sx={{
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          由 {activeRecord.authorName} 記錄
                        </Typography>
                        {canEdit(activeRecord) && (
                          <Stack direction="row">
                            <Button
                              size="small"
                              startIcon={<EditRounded />}
                              onClick={() => openEdit(activeRecord)}
                            >
                              編輯
                            </Button>
                            {role === 'owner' && (
                              <Button
                                size="small"
                                color="error"
                                startIcon={<DeleteRounded />}
                                onClick={() => requestDelete(activeRecord)}
                              >
                                刪除
                              </Button>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                ) : (
                  <Typography color="text.secondary">
                    此案場尚無工作紀錄。
                  </Typography>
                )}
              </Stack>
            ) : null}
          </Paper>
          <Box className="mui-map-panel">
            <SiteMap
              locations={sortedLocations.filter(
                (location) => (location.records?.length ?? 0) > 0,
              )}
              activeId={activeId}
              onSelect={(location) => setActiveId(location.id)}
            />
            <Chip
              className="map-provider-chip"
              color="success"
              label="OpenStreetMap · Firestore 即時同步"
            />
          </Box>
        </Box>
      )}

      <Dialog
        open={recordOpen}
        onClose={() => !saving && setRecordOpen(false)}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
            <span>{editing ? '編輯工作紀錄' : '建立工作紀錄'}</span>
            {canManage && autoSavedAt && <Typography variant="caption" color={autoSavedAt.includes('失敗') ? 'error' : 'text.secondary'}>{autoSavedAt}</Typography>}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.2} sx={{ pt: 0.5 }}>
            {newSite && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 750, mb: 2 }}>
                  新案場資料
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    required
                    label="案場名稱"
                    value={form.siteName}
                    onChange={setField('siteName')}
                  />
                  <TextField
                    required
                    label="地址"
                    value={form.address}
                    onChange={setField('address')}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      select
                      label="案件狀態"
                      value={form.status}
                      onChange={setField('status')}
                      fullWidth
                    >
                      {['進行中', '待驗收', '待複查', '已完成'].map(
                        (status) => (
                          <MenuItem key={status} value={status}>
                            {status}
                          </MenuItem>
                        ),
                      )}
                    </TextField>
                    <TextField
                      label="注意事項"
                      value={form.attention}
                      onChange={setField('attention')}
                      fullWidth
                    />
                  </Stack>
                </Stack>
              </Paper>
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
              工作內容
            </Typography>
            {labels.map(([key, label, multiline]) => (
              <TextField
                key={key}
                required={key === 'title' || key === 'notes'}
                label={label}
                type={key === 'workDate' || key === 'endDate' ? 'date' : 'text'}
                multiline={multiline}
                minRows={multiline ? 3 : undefined}
                value={form[key] as string}
                onChange={setField(key)}
                slotProps={
                  key === 'workDate' || key === 'endDate'
                    ? {
                        inputLabel: { shrink: true },
                        htmlInput:
                          key === 'workDate'
                            ? { max: form.endDate || undefined }
                            : { min: form.workDate || undefined },
                      }
                    : undefined
                }
              />
            ))}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 750, mb: 1 }}>
                參與人員
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {crewOptions.map((name) => (
                  <Chip
                    key={name}
                    clickable
                    color={form.crew.includes(name) ? 'primary' : 'default'}
                    label={name}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        crew: current.crew.includes(name)
                          ? current.crew.filter((item) => item !== name)
                          : [...current.crew, name],
                      }))
                    }
                  />
                ))}
              </Stack>
            </Box>
            <Divider />
            <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
              A → B 指定進場路線
            </Typography>
            <RouteMap
              editable
              value={routePoints}
              onChange={setRoutePoints}
              center={{ lat: form.lat, lng: form.lng }}
            />
            <TextField
              label="路線文字說明"
              multiline
              minRows={2}
              value={routeNotes}
              onChange={(event) => setRouteNotes(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setRecordOpen(false)}>
            取消
          </Button>
          {canManage && (
            <Button disabled={saving || draftSaving} startIcon={<SaveRounded />} variant="outlined" onClick={() => void saveRecordDraft('manual')}>
              {draftSaving ? '儲存中…' : '儲存草稿'}
            </Button>
          )}
          <Button disabled={saving} variant="contained" onClick={requestSave}>
            {saving ? '儲存中…' : editing ? '更新紀錄' : '建立紀錄'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(confirm)}
        onClose={() => !saving && setConfirm(undefined)}
      >
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setConfirm(undefined)}>
            取消
          </Button>
          {confirm?.alternateRun && (
            <Button disabled={saving} variant="outlined" onClick={runAlternate}>
              {confirm.alternateLabel}
            </Button>
          )}
          <Button
            disabled={saving}
            color={confirm?.color ?? 'primary'}
            variant="contained"
            onClick={runConfirm}
          >
            {confirm?.confirmLabel ?? '確認'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4200}
        onClose={() => setToast('')}
        message={toast}
      />
    </Box>
  );
}
