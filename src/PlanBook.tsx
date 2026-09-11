'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Link, MenuItem, Paper, Slider, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AddPhotoAlternateRounded from '@mui/icons-material/AddPhotoAlternateRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { connectGoogleDrive, ensureProjectFolder, uploadDriveFile, type DriveItem } from './google-drive';
import { logActivity, type User } from './firebase';
import {
  estimateBytes,
  loadDraftAssets,
  removeDraftAsset,
  saveDraft,
  saveDraftAsset,
  savedTimeLabel,
  type DraftDocument,
} from './drafts';

type Point = { x: number; y: number };
type Tool = 'brush' | 'arc' | 'arrow' | 'circle';
type Mark = { tool: Tool; points: Point[]; color: string; width: number; bend: number };
type PhotoLayout = 'one' | 'two' | 'four';
type PlanPhoto = { id: string; name: string; source: string; annotated: string; caption: string; marks: Mark[]; driveLink: string; hasAsset?: boolean };
type TreePlan = { id: string; number: string; treeName: string; conditions: string; pruningPlan: string; layout: PhotoLayout; photos: PlanPhoto[] };
type CoverData = { areaName: string; siteName: string; title: string; description: string; surveyDate: string; evaluator: string; coverPhoto: string };
export type PlanDraftData = {
  cover: Omit<CoverData, 'coverPhoto'> & { hasCoverPhoto?: boolean };
  items: Array<Omit<TreePlan, 'photos'> & { photos: Array<Pick<PlanPhoto, 'id' | 'name' | 'caption' | 'driveLink'> & { hasAsset?: boolean }> }>;
  folderName: string;
};

const toolLabels: Record<Tool, string> = { brush: '畫筆', arc: '弧線', arrow: '箭頭', circle: '圈選' };
const layoutLabels: Record<PhotoLayout, string> = { one: '單張照片', two: '左右兩張', four: '四宮格' };
const layoutCounts: Record<PhotoLayout, number> = { one: 1, two: 2, four: 4 };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

function emptyPhoto(): PlanPhoto {
  return { id: crypto.randomUUID(), name: '', source: '', annotated: '', caption: '', marks: [], driveLink: '', hasAsset: false };
}

function emptyTreePlan(index: number): TreePlan {
  return {
    id: crypto.randomUUID(), number: String(index).padStart(2, '0'), treeName: '', conditions: '', pruningPlan: '', layout: 'two',
    photos: [emptyPhoto(), emptyPhoto()],
  };
}

function listLines(value: string) {
  return value.split(/\n+/).map((line) => line.replace(/^[●•・\-\s]+/, '').trim()).filter(Boolean);
}

export default function PlanBook({
  account,
  onBack,
  initialDraft,
}: {
  account: User;
  onBack: () => void;
  initialDraft?: DraftDocument<PlanDraftData>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const imageCache = useRef(new Map<string, HTMLImageElement>());
  const activeMark = useRef<Mark | undefined>(undefined);
  const defaultCover: CoverData = {
    areaName: '', siteName: '', title: '樹木修剪計畫書', description: '', surveyDate: today,
    evaluator: '職人樹藝有限公司', coverPhoto: '',
  };
  const [cover, setCover] = useState<CoverData>({ ...defaultCover, ...(initialDraft?.data.cover ?? {}), coverPhoto: '' });
  const [coverHasAsset, setCoverHasAsset] = useState(Boolean(initialDraft?.data.cover.hasCoverPhoto));
  const [items, setItems] = useState<TreePlan[]>(
    initialDraft?.data.items?.length
      ? initialDraft.data.items.map((item) => ({
          ...item,
          photos: item.photos.map((photo) => ({ ...photo, source: '', annotated: '', marks: [] })),
        }))
      : [emptyTreePlan(1)],
  );
  const [selectedPhotoId, setSelectedPhotoId] = useState('');
  const [tool, setTool] = useState<Tool>('arc');
  const [color, setColor] = useState('#f52222');
  const [lineWidth, setLineWidth] = useState(10);
  const [curveBend, setCurveBend] = useState(-45);
  const [drawing, setDrawing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [driveToken, setDriveToken] = useState('');
  const [driveFolder, setDriveFolder] = useState<DriveItem>();
  const [folderName, setFolderName] = useState(initialDraft?.data.folderName || `TreeServ Geo 計畫書 ${today.slice(0, 7)}`);
  const [pdfLink, setPdfLink] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState('');
  const [draftId] = useState(initialDraft?.id ?? crypto.randomUUID());
  const draftDirty = useRef(false);
  const draftInitialized = useRef(false);
  const lastSavedSignature = useRef('');
  const assetDirty = useRef(new Set<string>());
  const removedAssetIds = useRef(new Set<string>());
  const assetBytes = useRef(new Map<string, number>());
  const savePlanDraftRef = useRef<(mode: 'manual' | 'auto') => Promise<void>>(async () => {});

  const selectedPhoto = useMemo(
    () => items.flatMap((item) => item.photos).find((photo) => photo.id === selectedPhotoId),
    [items, selectedPhotoId],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.photos.some((photo) => photo.id === selectedPhotoId)),
    [items, selectedPhotoId],
  );

  const draftData = useMemo<PlanDraftData>(() => ({
    cover: {
      areaName: cover.areaName,
      siteName: cover.siteName,
      title: cover.title,
      description: cover.description,
      surveyDate: cover.surveyDate,
      evaluator: cover.evaluator,
      hasCoverPhoto: coverHasAsset,
    },
    items: items.map((item) => ({
      id: item.id,
      number: item.number,
      treeName: item.treeName,
      conditions: item.conditions,
      pruningPlan: item.pruningPlan,
      layout: item.layout,
      photos: item.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        caption: photo.caption,
        driveLink: photo.driveLink,
        hasAsset: photo.hasAsset ?? Boolean(photo.source),
      })),
    })),
    folderName,
  }), [cover, coverHasAsset, items, folderName]);
  const draftSignature = useMemo(() => JSON.stringify(draftData), [draftData]);

  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 4500);
  };
  const safeName = (value: string) => (value.trim() || '樹木修剪計畫書').replace(/[\\/:*?\"<>|]/g, '-').replace(/\s+/g, '-');
  const setCoverField = (field: keyof typeof cover, value: string) => setCover((current) => ({ ...current, [field]: value }));

  function updateItem(id: string, patch: Partial<TreePlan>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updatePhoto(photoId: string, patch: Partial<PlanPhoto>) {
    setItems((current) => current.map((item) => ({
      ...item,
      photos: item.photos.map((photo) => photo.id === photoId ? { ...photo, ...patch } : photo),
    })));
  }

  function setPhotoLayout(item: TreePlan, layout: PhotoLayout) {
    const count = layoutCounts[layout];
    const photos = Array.from({ length: count }, (_entry, index) => item.photos[index] ?? emptyPhoto());
    item.photos.slice(count).forEach((photo) => {
      imageCache.current.delete(photo.id);
      removedAssetIds.current.add(photo.id);
      assetBytes.current.delete(photo.id);
    });
    if (!photos.some((photo) => photo.id === selectedPhotoId)) setSelectedPhotoId('');
    updateItem(item.id, { layout, photos });
  }

  async function readImage(file?: File) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔案。');
    if (file.size > 15 * 1024 * 1024) throw new Error('圖片請勿超過 15 MB。');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('照片格式不支援。'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function compressDraftImage(source: string) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('草稿照片無法處理。'));
      image.src = source;
    });
    let maxEdge = 1280;
    let quality = 0.76;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/jpeg', quality);
      if (estimateBytes(result) < 650_000) return result;
      maxEdge *= 0.78;
      quality -= 0.12;
    }
    throw new Error('照片壓縮後仍過大，請改用尺寸較小的照片。');
  }

  async function addCoverPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      const source = await readImage(event.target.files?.[0]);
      if (source) {
        setCoverField('coverPhoto', source);
        setCoverHasAsset(true);
        assetDirty.current.add('cover');
      }
    } catch (error) { notify(error instanceof Error ? error.message : '封面照片無法讀取。'); }
    event.target.value = '';
  }

  async function addPhoto(photo: PlanPhoto, event: React.ChangeEvent<HTMLInputElement>) {
    try {
      const file = event.target.files?.[0];
      const source = await readImage(file);
      if (source && file) {
        imageCache.current.delete(photo.id);
        updatePhoto(photo.id, { name: file.name, source, annotated: '', marks: [], driveLink: '', hasAsset: true });
        assetDirty.current.add(photo.id);
        setSelectedPhotoId(photo.id);
      }
    } catch (error) { notify(error instanceof Error ? error.message : '照片無法讀取。'); }
    event.target.value = '';
  }

  function curveControl(start: Point, end: Point, bend: number): Point {
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.max(1, Math.hypot(dx, dy));
    return { x: (start.x + end.x) / 2 - dy / length * bend / 100 * length, y: (start.y + end.y) / 2 + dx / length * bend / 100 * length };
  }

  function arrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, mark: Mark) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x), size = Math.max(18, mark.width * 3.2);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
    if (mark.points.length < 2) return;
    const start = mark.points[0], end = mark.points.at(-1)!;
    ctx.save(); ctx.strokeStyle = mark.color; ctx.lineWidth = mark.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (mark.tool === 'brush') { ctx.moveTo(start.x, start.y); mark.points.slice(1).forEach((next) => ctx.lineTo(next.x, next.y)); }
    else if (mark.tool === 'arc') { const control = curveControl(start, end, mark.bend); ctx.moveTo(start.x, start.y); ctx.quadraticCurveTo(control.x, control.y, end.x, end.y); }
    else if (mark.tool === 'arrow') { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
    else ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (mark.tool === 'arc') arrowHead(ctx, curveControl(start, end, mark.bend), end, mark);
    if (mark.tool === 'arrow') arrowHead(ctx, start, end, mark);
    ctx.restore();
  }

  function redraw(photo = selectedPhoto, preview?: Mark) {
    const canvas = canvasRef.current, image = photo ? imageCache.current.get(photo.id) : undefined;
    if (!canvas || !photo || !image) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    photo.marks.forEach((mark) => drawMark(ctx, mark)); if (preview) drawMark(ctx, preview);
  }

  async function loadEditor(photo = selectedPhoto) {
    const canvas = canvasRef.current; if (!canvas || !photo?.source) return;
    let image = imageCache.current.get(photo.id);
    if (!image) {
      image = new Image(); image.decoding = 'async';
      await new Promise<void>((resolve, reject) => { image!.onload = () => resolve(); image!.onerror = () => reject(new Error('照片無法載入。')); image!.src = photo.source; });
      imageCache.current.set(photo.id, image);
    }
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); redraw(photo);
  }

  useEffect(() => { void loadEditor(); }, [selectedPhotoId, selectedPhoto?.source]);
  useEffect(() => {
    if (activeMark.current) { activeMark.current = { ...activeMark.current, width: lineWidth, bend: curveBend }; redraw(undefined, activeMark.current); }
  }, [lineWidth, curveBend]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => {
    if (!initialDraft) return;
    let active = true;
    void loadDraftAssets(initialDraft.id).then((assets) => {
      if (!active) return;
      assets.forEach((value, key) => assetBytes.current.set(key, estimateBytes(value)));
      const coverPhoto = assets.get('cover');
      if (coverPhoto) { setCover((current) => ({ ...current, coverPhoto })); setCoverHasAsset(true); }
      setItems((current) => current.map((item) => ({
        ...item,
        photos: item.photos.map((photo) => {
          const source = assets.get(photo.id);
          return source ? { ...photo, source, annotated: '', marks: [], hasAsset: true } : photo;
        }),
      })));
    }).catch(() => notify('草稿文字已載入，但部分照片暫時無法下載。'));
    return () => { active = false; };
  }, [initialDraft?.id]);
  useEffect(() => {
    if (!draftInitialized.current) {
      draftInitialized.current = true;
      lastSavedSignature.current = draftSignature;
      return;
    }
    draftDirty.current = draftSignature !== lastSavedSignature.current;
  }, [draftSignature]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (draftDirty.current || assetDirty.current.size || removedAssetIds.current.size) {
        void savePlanDraftRef.current('auto');
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!draftDirty.current && !assetDirty.current.size) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  }
  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!selectedPhoto?.source) return;
    event.currentTarget.setPointerCapture(event.pointerId); const start = point(event);
    const mark: Mark = { tool, points: tool === 'brush' ? [start] : [start, start], color, width: lineWidth, bend: curveBend };
    activeMark.current = mark; setDrawing(true); redraw(undefined, mark);
  }
  function moveDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !activeMark.current) return; const next = point(event);
    activeMark.current = { ...activeMark.current, points: activeMark.current.tool === 'brush' ? [...activeMark.current.points, next] : [activeMark.current.points[0], next] };
    redraw(undefined, activeMark.current);
  }
  function endDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !selectedPhoto || !activeMark.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId); const completed = activeMark.current; redraw(undefined, completed);
    updatePhoto(selectedPhoto.id, { annotated: event.currentTarget.toDataURL('image/png'), marks: [...selectedPhoto.marks, completed] });
    assetDirty.current.add(selectedPhoto.id);
    activeMark.current = undefined; setDrawing(false);
  }
  function undo() {
    if (!selectedPhoto?.marks.length) return; const next = { ...selectedPhoto, marks: selectedPhoto.marks.slice(0, -1) }; redraw(next);
    updatePhoto(selectedPhoto.id, { marks: next.marks, annotated: canvasRef.current?.toDataURL('image/png') ?? '' });
    assetDirty.current.add(selectedPhoto.id);
  }
  function clearMarks() {
    if (!selectedPhoto?.marks.length) return; const next = { ...selectedPhoto, marks: [] }; redraw(next);
    updatePhoto(selectedPhoto.id, { marks: [], annotated: canvasRef.current?.toDataURL('image/png') ?? '' });
    assetDirty.current.add(selectedPhoto.id);
  }

  async function savePlanDraft(mode: 'manual' | 'auto') {
    if (draftSaving) return;
    if (mode === 'auto' && !draftDirty.current && !assetDirty.current.size && !removedAssetIds.current.size) return;
    setDraftSaving(true);
    try {
      const sources = new Map<string, string>();
      if (cover.coverPhoto) sources.set('cover', cover.coverPhoto);
      items.forEach((item) => item.photos.forEach((photo) => {
        if (photo.source) sources.set(photo.id, photo.annotated || photo.source);
      }));
      const dirtyAssets = [...assetDirty.current];
      for (const assetId of dirtyAssets) {
        const source = sources.get(assetId);
        if (!source) continue;
        const compressed = await compressDraftImage(source);
        await saveDraftAsset(draftId, assetId, compressed);
        assetBytes.current.set(assetId, estimateBytes(compressed));
      }
      const removed = [...removedAssetIds.current];
      for (const assetId of removed) {
        await removeDraftAsset(draftId, assetId);
        assetBytes.current.delete(assetId);
      }
      await saveDraft({
        id: draftId,
        kind: 'pruning_plan',
        title: [cover.areaName, cover.siteName, cover.title].filter(Boolean).join(' ') || '未命名修剪計畫書',
        data: draftData,
        account,
        mode,
        createdBy: initialDraft?.createdBy,
        createdByName: initialDraft?.createdByName,
        assetCount: (draftData.cover.hasCoverPhoto ? 1 : 0) + draftData.items.flatMap((item) => item.photos).filter((photo) => photo.hasAsset).length,
        assetBytes: [...assetBytes.current.values()].reduce((sum, bytes) => sum + bytes, 0),
      });
      dirtyAssets.forEach((assetId) => assetDirty.current.delete(assetId));
      removed.forEach((assetId) => removedAssetIds.current.delete(assetId));
      lastSavedSignature.current = draftSignature;
      draftDirty.current = false;
      const time = savedTimeLabel();
      if (mode === 'auto') setAutoSavedAt(`${time} 已自動存入草稿`);
      else notify(`${time} 已儲存草稿。`);
    } catch (error) {
      if (mode === 'manual') notify(error instanceof Error ? error.message : '草稿儲存失敗。');
      else setAutoSavedAt('自動儲存失敗，請按「儲存草稿」重試');
    } finally {
      setDraftSaving(false);
    }
  }
  savePlanDraftRef.current = savePlanDraft;

  async function ensureConnection() {
    let token = driveToken, folder = driveFolder;
    if (!token) { const connection = await connectGoogleDrive(); token = connection.accessToken; setDriveToken(token); }
    if (!folder) { folder = await ensureProjectFolder(token, folderName); setDriveFolder(folder); }
    return { token, folder };
  }
  async function connectDrive() {
    if (busy) return; setBusy('drive');
    try { setDriveToken(''); setDriveFolder(undefined); const { folder } = await ensureConnection(); notify(`已連接 Google Drive：${folder.name}`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Google Drive 連線失敗。'); }
    finally { setBusy(''); }
  }
  async function savePhoto() {
    if (!selectedPhoto?.source || busy) return; setBusy('photo');
    try {
      const { token, folder } = await ensureConnection(); redraw();
      const blob = await new Promise<Blob>((resolve, reject) => canvasRef.current?.toBlob((value) => value ? resolve(value) : reject(new Error('無法產生標註圖片。')), 'image/png'));
      const result = await uploadDriveFile(token, folder.id, `${safeName(cover.siteName)}-${safeName(selectedItem?.treeName ?? '')}-${safeName(selectedPhoto.caption || selectedPhoto.name)}-標註.png`, blob);
      updatePhoto(selectedPhoto.id, { driveLink: result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`, annotated: canvasRef.current!.toDataURL('image/png') });
      await logActivity(account, 'plan_image_save', '', cover.siteName || cover.title); notify('標註圖片已儲存到 Google Drive。');
    } catch (error) { notify(error instanceof Error ? error.message : '圖片儲存失敗。'); }
    finally { setBusy(''); }
  }

  function validatePlan() {
    if (!cover.siteName.trim() || !cover.title.trim() || !cover.description.trim() || !cover.surveyDate || !cover.evaluator.trim()) return '請先填妥封面的案場名稱、計畫說明、會勘日期與評估單位。';
    const incomplete = items.find((item) => !item.treeName.trim() || !item.pruningPlan.trim());
    return incomplete ? `請填妥第 ${incomplete.number || '—'} 項的樹木名稱與修剪計畫。` : '';
  }
  async function generatePdf() {
    if (!exportRef.current) throw new Error('計畫書版面尚未準備完成。');
    const pages = Array.from(exportRef.current.querySelectorAll<HTMLElement>('.plan-document-page'));
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const rendered = await html2canvas(pages[index], { scale: 1.8, backgroundColor: '#fff', useCORS: true, logging: false });
      if (index) pdf.addPage('a4', 'portrait');
      pdf.addImage(rendered.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    return pdf.output('blob');
  }
  async function createPdf() {
    if (busy) return; const problem = validatePlan(); if (problem) { notify(problem); return; } setBusy('pdf');
    try {
      const blob = await generatePdf();
      const filename = `${safeName(cover.areaName)}-${safeName(cover.siteName)}-${safeName(cover.title)}.pdf`;
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const url = URL.createObjectURL(blob); setDownloadUrl(url); setDownloadName(filename);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
      if (driveToken || driveFolder) {
        const { token, folder } = await ensureConnection(); const result = await uploadDriveFile(token, folder.id, filename, blob);
        setPdfLink(result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`);
      }
      await logActivity(account, 'plan_pdf_save', '', cover.siteName || cover.title);
      notify(driveToken || driveFolder ? 'PDF 已下載，並儲存到 Google Drive。' : 'PDF 已產生並下載。');
    } catch (error) { notify(error instanceof Error ? error.message : '計畫書產生失敗。'); }
    finally { setBusy(''); }
  }

  function renderBullets(value: string) {
    const lines = listLines(value);
    return lines.length ? <ul>{lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul> : <span className="plan-empty-value">—</span>;
  }

  function documentPages() {
    return <>
      <article className={`plan-document-page plan-cover-page${cover.coverPhoto ? ' has-photo' : ''}`}>
        <div className="plan-cover-bands" />
        {cover.coverPhoto && <div className="plan-cover-image-wrap"><img src={cover.coverPhoto} alt="" /></div>}
        <div className="plan-cover-title">
          {cover.areaName && <span>{cover.areaName}</span>}
          <span>{cover.siteName || '案場名稱'}</span>
          <strong>{cover.title || '樹木修剪計畫書'}</strong>
        </div>
        <div className="plan-cover-summary">
          <h2>計畫說明</h2>
          <p>{cover.description || '請填寫本次樹木修剪的範圍、數量與評估重點。'}</p>
          <dl>
            <div><dt>會勘日期：</dt><dd>{cover.surveyDate.replaceAll('-', '.')}</dd></div>
            <div><dt>評估單位：</dt><dd>{cover.evaluator || '—'}</dd></div>
          </dl>
        </div>
      </article>
      {items.map((item) => <article className="plan-document-page plan-item-page" key={item.id}>
        <section className="plan-item-sheet">
          <div className="plan-table-row plan-title-row"><strong>編號/樹木名稱</strong><b>{item.number || '—'}/{item.treeName || '樹木名稱'}</b></div>
          {item.conditions.trim() && <div className="plan-table-row"><span>樹木概況</span><div>{renderBullets(item.conditions)}</div></div>}
          <div className="plan-table-row"><span>修剪計畫</span><div>{renderBullets(item.pruningPlan)}</div></div>
          <h2>照片說明</h2>
          <div className={`plan-photo-grid layout-${item.layout}`}>
            {item.photos.map((photo, index) => <div className="plan-photo-cell" key={photo.id}>
              {photo.source ? <img src={photo.annotated || photo.source} alt="" /> : <div className="plan-photo-placeholder">照片 {index + 1}</div>}
              {photo.caption && <span>{photo.caption}</span>}
            </div>)}
          </div>
        </section>
      </article>)}
    </>;
  }

  return <Box className="plan-studio">
    <Paper square elevation={0} className="plan-studio-header">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button startIcon={<ArrowBackRounded />} onClick={onBack}>返回案場地圖</Button><Divider flexItem orientation="vertical" />
          <Box><Typography variant="caption" color="primary">TreeServ Geo</Typography><Typography variant="h5">製作樹木修剪計畫書</Typography>{autoSavedAt && <Typography variant="caption" color={autoSavedAt.includes('失敗') ? 'error' : 'text.secondary'}>{autoSavedAt}</Typography>}</Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<SaveRounded />} disabled={draftSaving} onClick={() => void savePlanDraft('manual')}>{draftSaving ? '儲存中…' : '儲存草稿'}</Button>
          <Button variant="outlined" startIcon={<CloudUploadRounded />} disabled={Boolean(busy)} onClick={connectDrive}>{driveFolder ? 'Drive 已連接' : '連接 Drive'}</Button>
          <Button variant="contained" startIcon={<VisibilityRounded />} onClick={() => setPreviewOpen(true)}>預覽計畫書</Button>
        </Stack>
      </Stack>
    </Paper>

    <Box className="plan-form-shell">
      <Alert severity="info" className="plan-scope-note">產出內容只包含封面、各樹木修剪計畫與照片說明，不會加入「樹木修剪施工準則」。</Alert>

      <Paper variant="outlined" className="plan-form-section">
        <Box className="plan-section-heading"><div><Typography variant="overline">第 1 頁</Typography><Typography variant="h6">封面與計畫說明</Typography></div><Typography color="text.secondary">欄位順序依範本編排</Typography></Box>
        <Box className="plan-cover-fields">
          <TextField label="縣市／行政區" placeholder="例如：桃園市蘆竹區" value={cover.areaName} onChange={(event) => setCoverField('areaName', event.target.value)} />
          <TextField required label="案場／單位名稱" placeholder="例如：龍安國民小學" value={cover.siteName} onChange={(event) => setCoverField('siteName', event.target.value)} />
          <TextField required label="文件名稱" value={cover.title} onChange={(event) => setCoverField('title', event.target.value)} />
          <TextField required type="date" label="會勘日期" value={cover.surveyDate} onChange={(event) => setCoverField('surveyDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField required label="計畫說明" multiline minRows={5} value={cover.description} onChange={(event) => setCoverField('description', event.target.value)} className="plan-full-field" helperText="可填寫修剪樹種、數量、現場考量與本計畫評估範圍。" />
          <TextField required label="評估單位" value={cover.evaluator} onChange={(event) => setCoverField('evaluator', event.target.value)} />
          <Box className="plan-cover-upload">
            <Button component="label" variant="outlined" startIcon={<AddPhotoAlternateRounded />}>{cover.coverPhoto ? '更換封面照片' : '加入封面照片（選填）'}<input hidden type="file" accept="image/*" onChange={addCoverPhoto} /></Button>
            {cover.coverPhoto && <Button color="error" onClick={() => { setCoverField('coverPhoto', ''); setCoverHasAsset(false); removedAssetIds.current.add('cover'); assetBytes.current.delete('cover'); }}>移除</Button>}
          </Box>
        </Box>
      </Paper>

      {items.map((item, itemIndex) => <Paper variant="outlined" className="plan-form-section" key={item.id}>
        <Box className="plan-section-heading">
          <div><Typography variant="overline">樹木項目 {itemIndex + 1}</Typography><Typography variant="h6">{item.treeName || '尚未填寫樹木名稱'}</Typography></div>
          {items.length > 1 && <IconButton color="error" aria-label={`刪除樹木項目 ${itemIndex + 1}`} onClick={() => { item.photos.forEach((photo) => { imageCache.current.delete(photo.id); removedAssetIds.current.add(photo.id); assetBytes.current.delete(photo.id); }); setItems((current) => current.filter((entry) => entry.id !== item.id)); }}><DeleteOutlineRounded /></IconButton>}
        </Box>
        <Box className="plan-item-fields">
          <TextField label="編號" value={item.number} onChange={(event) => updateItem(item.id, { number: event.target.value })} />
          <TextField required label="樹木名稱與數量" placeholder="例如：冷卻水塔旁 龍眼 1 棵" value={item.treeName} onChange={(event) => updateItem(item.id, { treeName: event.target.value })} />
          <TextField label="樹木概況（選填）" multiline minRows={3} value={item.conditions} onChange={(event) => updateItem(item.id, { conditions: event.target.value })} className="plan-full-field" helperText="每行一點；未填寫時，預覽與 PDF 會自動省略此列。" />
          <TextField required label="修剪計畫" multiline minRows={3} value={item.pruningPlan} onChange={(event) => updateItem(item.id, { pruningPlan: event.target.value })} className="plan-full-field" helperText="每行一點，輸出時自動排成條列。" />
          <TextField select label="照片版位" value={item.layout} onChange={(event) => setPhotoLayout(item, event.target.value as PhotoLayout)}>
            {Object.entries(layoutLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
        </Box>
        <Box className={`plan-photo-input-grid layout-${item.layout}`}>
          {item.photos.map((photo, photoIndex) => <Paper variant="outlined" className="plan-photo-input" key={photo.id}>
            <Typography variant="subtitle2">照片 {photoIndex + 1}</Typography>
            {photo.source ? <button type="button" className={`plan-photo-thumb${selectedPhotoId === photo.id ? ' selected' : ''}`} onClick={() => setSelectedPhotoId(photo.id)}><img src={photo.annotated || photo.source} alt="" /><span>選取並標註</span></button>
              : <Button component="label" variant="outlined" className="plan-photo-add" startIcon={<AddPhotoAlternateRounded />}>選擇照片<input hidden type="file" accept="image/*" onChange={(event) => addPhoto(photo, event)} /></Button>}
            <TextField size="small" label="圖號／照片說明（選填）" placeholder={`例如：圖${photoIndex + 1}`} value={photo.caption} onChange={(event) => updatePhoto(photo.id, { caption: event.target.value })} />
            {photo.source && <Stack direction="row" spacing={1}>
              <Button component="label" size="small" variant="outlined" sx={{ flex: 1 }}>更換<input hidden type="file" accept="image/*" onChange={(event) => addPhoto(photo, event)} /></Button>
              <Button size="small" color="error" onClick={() => { imageCache.current.delete(photo.id); removedAssetIds.current.add(photo.id); assetDirty.current.delete(photo.id); assetBytes.current.delete(photo.id); updatePhoto(photo.id, { name: '', source: '', annotated: '', marks: [], driveLink: '', hasAsset: false }); if (selectedPhotoId === photo.id) setSelectedPhotoId(''); }}>清除</Button>
            </Stack>}
          </Paper>)}
        </Box>
      </Paper>)}

      <Button variant="outlined" size="large" startIcon={<AddRounded />} onClick={() => setItems((current) => [...current, emptyTreePlan(current.length + 1)])} className="plan-add-item">新增樹木項目</Button>

      {selectedPhoto?.source && <Paper variant="outlined" className="plan-annotation-section">
        <Box className="plan-section-heading"><div><Typography variant="overline">照片標註</Typography><Typography variant="h6">{selectedItem?.number}/{selectedItem?.treeName || '樹木項目'}</Typography></div>{selectedPhoto.driveLink && <Link href={selectedPhoto.driveLink} target="_blank" rel="noopener noreferrer">開啟 Drive 圖片</Link>}</Box>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, mb: 2 }}>
          <ButtonGroup size="small">{Object.entries(toolLabels).map(([key, label]) => <Button key={key} variant={tool === key ? 'contained' : 'outlined'} onClick={() => setTool(key as Tool)}>{label}</Button>)}</ButtonGroup>
          <TextField label="線條顏色" type="color" size="small" value={color} onChange={(event) => setColor(event.target.value)} sx={{ width: 100 }} />
          <Box sx={{ minWidth: 130 }}><Typography variant="caption">粗細</Typography><Slider size="small" min={3} max={28} value={lineWidth} onChange={(_event, value) => setLineWidth(value as number)} /></Box>
          {tool === 'arc' && <Box sx={{ minWidth: 130 }}><Typography variant="caption">弧度</Typography><Slider size="small" min={-90} max={90} value={curveBend} onChange={(_event, value) => setCurveBend(value as number)} /></Box>}
          <Button startIcon={<UndoRounded />} disabled={!selectedPhoto.marks.length} onClick={undo}>復原</Button>
          <Button color="warning" startIcon={<DeleteSweepRounded />} disabled={!selectedPhoto.marks.length} onClick={clearMarks}>清除標註</Button>
        </Stack>
        <Box className="canvas-frame"><canvas ref={canvasRef} aria-label="現場照片標註畫布" onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={endDrawing} onPointerCancel={endDrawing} /></Box>
        <Box className="plan-save-photo-row"><Typography color="text.secondary">標註會立即套用到預覽與 PDF；連接 Drive 後可另存這張圖片。</Typography><Button variant="contained" startIcon={<CloudUploadRounded />} disabled={Boolean(busy)} onClick={savePhoto}>{busy === 'photo' ? '儲存中…' : '儲存標註圖片'}</Button></Box>
      </Paper>}

      <Paper variant="outlined" className="plan-output-section">
        <Typography variant="h6">PDF 與 Google Drive</Typography>
        <TextField label="Drive 專案資料夾名稱" value={folderName} onChange={(event) => { setFolderName(event.target.value); setDriveFolder(undefined); }} />
        <Typography color="text.secondary">PDF 不會在編輯時產生。請先按「預覽計畫書」，確認所有頁面後再產生檔案。</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button size="large" variant="contained" startIcon={<VisibilityRounded />} onClick={() => setPreviewOpen(true)}>預覽計畫書</Button>
          {downloadUrl && <Button size="large" variant="outlined" component="a" href={downloadUrl} download={downloadName}>再次下載 PDF</Button>}
          {pdfLink && <Button size="large" variant="outlined" component="a" href={pdfLink} target="_blank" rel="noopener noreferrer">開啟 Drive PDF</Button>}
        </Stack>
      </Paper>
    </Box>

    <Dialog open={previewOpen} onClose={() => !busy && setPreviewOpen(false)} maxWidth="lg" fullWidth className="plan-preview-dialog">
      <DialogTitle>計畫書預覽・共 {items.length + 1} 頁<Typography component="span" color="text.secondary" sx={{ ml: 1 }}>不含施工準則附件</Typography></DialogTitle>
      <DialogContent dividers className="plan-preview-content"><div className="plan-preview-pages">{documentPages()}</div></DialogContent>
      <DialogActions><Button disabled={Boolean(busy)} onClick={() => setPreviewOpen(false)}>返回修改</Button><Button variant="contained" startIcon={<PictureAsPdfRounded />} disabled={Boolean(busy)} onClick={createPdf}>{busy === 'pdf' ? '正在產生…' : '確認並產生 PDF'}</Button></DialogActions>
    </Dialog>

    <div ref={exportRef} className="plan-export-stack" aria-hidden="true">{documentPages()}</div>
    {message && <Alert className="floating-message" severity="info">{message}</Alert>}
  </Box>;
}
