'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Divider, Link, Paper, Slider, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AddPhotoAlternateRounded from '@mui/icons-material/AddPhotoAlternateRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { connectGoogleDrive, ensureProjectFolder, uploadDriveFile, type DriveItem } from './google-drive';
import { logActivity, type User } from './firebase';

type Point = { x: number; y: number };
type Tool = 'brush' | 'arc' | 'arrow' | 'circle';
type Mark = { tool: Tool; points: Point[]; color: string; width: number; bend: number };
type PlanPhoto = { id: string; name: string; source: string; annotated: string; title: string; notes: string; marks: Mark[]; driveLink: string };

const toolLabels: Record<Tool, string> = { brush: '畫筆', arc: '弧線', arrow: '箭頭', circle: '圈選' };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

export default function PlanBook({ account, onBack }: { account: User; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const imageCache = useRef(new Map<string, HTMLImageElement>());
  const activeMark = useRef<Mark | undefined>(undefined);
  const [photos, setPhotos] = useState<PlanPhoto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [tool, setTool] = useState<Tool>('arc');
  const [color, setColor] = useState('#ffe000');
  const [lineWidth, setLineWidth] = useState(10);
  const [curveBend, setCurveBend] = useState(-45);
  const [drawing, setDrawing] = useState(false);
  const [driveToken, setDriveToken] = useState('');
  const [driveFolder, setDriveFolder] = useState<DriveItem>();
  const [pdfLink, setPdfLink] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState({
    planNo: `TS-${today.replaceAll('-', '')}`, projectName: '', clientName: '', clientPhone: '',
    locationName: '', address: '', surveyDate: today, workDate: '', workTime: '08:00–17:00',
    siteLead: '', siteLeadPhone: '', assistants: '', personnel: '', equipment: '', target: '',
    description: '', siteConditions: '', folderName: `TreeServ Geo 計畫書 ${today.slice(0, 7)}`,
  });
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? photos[0];
  const photoPairs = useMemo(() => {
    const items = photos.map((photo) => ({ ...photo, printable: photo.annotated || photo.source }));
    return Array.from({ length: Math.ceil(items.length / 2) }, (_item, index) => items.slice(index * 2, index * 2 + 2));
  }, [photos]);

  const setField = (field: keyof typeof plan) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPlan((current) => ({ ...current, [field]: event.target.value }));
  const notify = (value: string) => { setMessage(value); window.setTimeout(() => setMessage((current) => current === value ? '' : current), 4000); };
  const safeName = (value: string) => (value.trim() || 'TreeServ-Geo-計畫書').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');

  function updatePhoto(id: string, patch: Partial<PlanPhoto>) {
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...patch } : photo));
  }

  async function addPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, 20);
    const added: PlanPhoto[] = [];
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) { notify(`${file.name} 超過 15 MB，已略過。`); continue; }
      const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('照片格式不支援')); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      added.push({ id: crypto.randomUUID(), name: file.name, source, annotated: '', title: '', notes: '', marks: [], driveLink: '' });
    }
    setPhotos((current) => [...current, ...added]);
    if (added.at(-1)) setSelectedId(added.at(-1)!.id);
    event.target.value = '';
  }

  function curveControl(start: Point, end: Point, bend: number): Point {
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.max(1, Math.hypot(dx, dy));
    return { x: (start.x + end.x) / 2 - dy / length * bend / 100 * length, y: (start.y + end.y) / 2 + dx / length * bend / 100 * length };
  }
  function arrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, mark: Mark) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x), size = Math.max(18, mark.width * 3.2);
    ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6)); ctx.stroke();
  }
  function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
    if (mark.points.length < 2) return;
    const start = mark.points[0], end = mark.points.at(-1)!;
    ctx.save(); ctx.strokeStyle = mark.color; ctx.lineWidth = mark.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (mark.tool === 'brush') { ctx.moveTo(start.x, start.y); mark.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); }
    else if (mark.tool === 'arc') { const control = curveControl(start, end, mark.bend); ctx.moveTo(start.x, start.y); ctx.quadraticCurveTo(control.x, control.y, end.x, end.y); }
    else if (mark.tool === 'arrow') { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
    else ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke(); if (mark.tool === 'arc') arrowHead(ctx, curveControl(start, end, mark.bend), end, mark); if (mark.tool === 'arrow') arrowHead(ctx, start, end, mark); ctx.restore();
  }
  function redraw(photo = selectedPhoto, preview?: Mark) {
    const canvas = canvasRef.current, image = photo ? imageCache.current.get(photo.id) : undefined;
    if (!canvas || !photo || !image) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); photo.marks.forEach((mark) => drawMark(ctx, mark)); if (preview) drawMark(ctx, preview);
  }
  async function loadEditor(photo = selectedPhoto) {
    const canvas = canvasRef.current; if (!canvas || !photo) return;
    let image = imageCache.current.get(photo.id);
    if (!image) { image = new Image(); image.decoding = 'async'; await new Promise<void>((resolve, reject) => { image!.onload = () => resolve(); image!.onerror = () => reject(new Error('照片無法載入')); image!.src = photo.source; }); imageCache.current.set(photo.id, image); }
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); redraw(photo);
  }
  useEffect(() => { void loadEditor(); }, [selectedId, photos.length]);
  useEffect(() => { if (activeMark.current) { activeMark.current = { ...activeMark.current, width: lineWidth, bend: curveBend }; redraw(undefined, activeMark.current); } }, [lineWidth, curveBend]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height }; }
  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!selectedPhoto) return; event.currentTarget.setPointerCapture(event.pointerId); const start = point(event);
    const mark: Mark = { tool, points: tool === 'brush' ? [start] : [start, start], color, width: lineWidth, bend: curveBend };
    activeMark.current = mark; setDrawing(true); redraw(undefined, mark);
  }
  function moveDrawing(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing || !activeMark.current) return; const next = point(event); activeMark.current = { ...activeMark.current, points: activeMark.current.tool === 'brush' ? [...activeMark.current.points, next] : [activeMark.current.points[0], next] }; redraw(undefined, activeMark.current); }
  function endDrawing(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing || !selectedPhoto || !activeMark.current) return; event.currentTarget.releasePointerCapture(event.pointerId); const completed = activeMark.current; redraw(undefined, completed); updatePhoto(selectedPhoto.id, { annotated: event.currentTarget.toDataURL('image/png'), marks: [...selectedPhoto.marks, completed] }); activeMark.current = undefined; setDrawing(false); }
  function undo() { if (!selectedPhoto?.marks.length) return; const next = { ...selectedPhoto, marks: selectedPhoto.marks.slice(0, -1) }; redraw(next); updatePhoto(selectedPhoto.id, { marks: next.marks, annotated: canvasRef.current?.toDataURL('image/png') ?? '' }); }
  function clearMarks() { if (!selectedPhoto?.marks.length) return; const next = { ...selectedPhoto, marks: [] }; redraw(next); updatePhoto(selectedPhoto.id, { marks: [], annotated: canvasRef.current?.toDataURL('image/png') ?? '' }); }

  async function ensureConnection() {
    let token = driveToken, folder = driveFolder;
    if (!token) { const connection = await connectGoogleDrive(); token = connection.accessToken; setDriveToken(token); }
    if (!folder) { folder = await ensureProjectFolder(token, plan.folderName); setDriveFolder(folder); }
    return { token, folder };
  }
  async function connectDrive() { if (busy) return; setBusy('drive'); try { setDriveToken(''); setDriveFolder(undefined); const { folder } = await ensureConnection(); notify(`已連接 Google Drive：${folder.name}`); } catch (error) { notify(error instanceof Error ? error.message : 'Google Drive 連線失敗。'); } finally { setBusy(''); } }
  async function canvasBlob() { const canvas = canvasRef.current; if (!canvas || !selectedPhoto) throw new Error('請先加入現場照片。'); redraw(); return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('無法產生標註圖片')), 'image/png')); }
  async function savePhoto() { if (!selectedPhoto || busy) return; setBusy('photo'); try { const { token, folder } = await ensureConnection(); const blob = await canvasBlob(); const result = await uploadDriveFile(token, folder.id, `${safeName(plan.projectName || plan.locationName)}-${safeName(selectedPhoto.title || selectedPhoto.name)}-標註.png`, blob); updatePhoto(selectedPhoto.id, { driveLink: result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`, annotated: canvasRef.current!.toDataURL('image/png') }); await logActivity(account, 'plan_image_save', '', plan.projectName || plan.locationName); notify('標註圖片已獨立儲存到 Google Drive。'); } catch (error) { notify(error instanceof Error ? error.message : '圖片儲存失敗。'); } finally { setBusy(''); } }
  async function generatePdf() { if (!pdfRef.current) throw new Error('計畫書版面尚未準備完成。'); const pages = Array.from(pdfRef.current.querySelectorAll<HTMLElement>('.pdf-page')); const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }); for (let index = 0; index < pages.length; index += 1) { const rendered = await html2canvas(pages[index], { scale: 1.6, backgroundColor: '#fff', useCORS: true, logging: false }); if (index) pdf.addPage('a4', 'portrait'); pdf.addImage(rendered.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST'); } return pdf.output('blob'); }
  async function savePdf() { if (busy) return; if (!plan.projectName.trim() || !plan.locationName.trim() || !plan.address.trim() || !plan.clientPhone.trim() || !plan.siteLeadPhone.trim() || !plan.target.trim()) { notify('請填寫計畫名稱、地點、地址、兩組聯絡電話與主要修剪目標。'); return; } setBusy('pdf'); try { const { token, folder } = await ensureConnection(); const result = await uploadDriveFile(token, folder.id, `${safeName(plan.planNo)}-${safeName(plan.projectName)}-修剪計畫書.pdf`, await generatePdf()); setPdfLink(result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`); await logActivity(account, 'plan_pdf_save', '', plan.projectName); notify('計畫書 PDF 已存入 Google Drive。'); } catch (error) { notify(error instanceof Error ? error.message : '計畫書儲存失敗。'); } finally { setBusy(''); } }

  const fields: Array<{ key: keyof typeof plan; label: string; multiline?: boolean; required?: boolean; type?: string }> = [
    { key: 'projectName', label: '計畫名稱', required: true }, { key: 'clientName', label: '業主／單位' }, { key: 'clientPhone', label: '業主聯絡電話', required: true },
    { key: 'locationName', label: '案場名稱', required: true }, { key: 'address', label: '案場地址', required: true }, { key: 'surveyDate', label: '現勘日期', type: 'date' },
    { key: 'workDate', label: '預定施工日期', type: 'date' }, { key: 'workTime', label: '預定作業時間' }, { key: 'siteLead', label: '案場負責人' },
    { key: 'siteLeadPhone', label: '負責人聯絡電話', required: true }, { key: 'assistants', label: '相關協助人員與聯絡方式', multiline: true },
    { key: 'personnel', label: '預計作業人員與分工', multiline: true }, { key: 'target', label: '主要修剪目標', multiline: true, required: true },
    { key: 'description', label: '業主描述與需求', multiline: true }, { key: 'siteConditions', label: '現場環境與限制', multiline: true }, { key: 'equipment', label: '主要標的與設備', multiline: true },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Paper square elevation={0} sx={{ position: 'sticky', top: 0, zIndex: 1100, borderBottom: 1, borderColor: 'divider', px: { xs: 1.5, md: 3 }, py: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Button startIcon={<ArrowBackRounded />} onClick={onBack}>返回案場地圖</Button><Divider flexItem orientation="vertical" /><Box><Typography variant="caption" color="primary">TreeServ Geo</Typography><Typography variant="h5">樹木修剪計畫書</Typography></Box></Stack><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<CloudUploadRounded />} disabled={Boolean(busy)} onClick={connectDrive}>{driveFolder ? 'Drive 已連接' : '連接 Drive'}</Button><Button variant="contained" startIcon={<PictureAsPdfRounded />} disabled={Boolean(busy)} onClick={savePdf}>{busy === 'pdf' ? '製作中…' : '儲存 PDF'}</Button></Stack></Stack>
      </Paper>
      <Box sx={{ p: { xs: 1.5, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, 440px) 1fr' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" gutterBottom>計畫基本資料</Typography><Stack spacing={2}>{fields.map((field) => <TextField key={field.key} label={field.label} required={field.required} type={field.type} multiline={field.multiline} minRows={field.multiline ? 3 : undefined} value={plan[field.key]} onChange={setField(field.key)} slotProps={field.type === 'date' ? { inputLabel: { shrink: true } } : undefined} />)}<Divider /><Typography variant="h6">Google Drive 存檔位置</Typography><TextField label="指定專案資料夾名稱" value={plan.folderName} onChange={(event) => { setField('folderName')(event); setDriveFolder(undefined); }} /><Typography variant="caption" color="text.secondary">系統不會建立公開分享權限；連結仍需獲授權的 Google 帳號登入。</Typography>{pdfLink && <Link href={pdfLink} target="_blank" rel="noopener noreferrer">開啟已儲存的計畫書 PDF</Link>}</Stack></Paper>
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, p: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText' }}><Box><Typography variant="overline">照片標註工作台</Typography><Typography variant="h5">直接畫出修剪範圍</Typography></Box><Button component="label" color="inherit" variant="outlined" startIcon={<AddPhotoAlternateRounded />}>加入照片<input hidden type="file" accept="image/*" multiple onChange={addPhotos} /></Button></Stack>
          {photos.length > 0 ? <Box><Stack direction="row" spacing={1} sx={{ p: 1.5, overflowX: 'auto', borderBottom: 1, borderColor: 'divider' }}>{photos.map((photo, index) => <Button key={photo.id} variant={photo.id === selectedPhoto?.id ? 'contained' : 'outlined'} onClick={() => setSelectedId(photo.id)} sx={{ whiteSpace: 'nowrap' }}>{index + 1}. {photo.title || photo.name}</Button>)}</Stack>{selectedPhoto && <Box sx={{ p: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, mb: 2 }}><ButtonGroup size="small">{Object.entries(toolLabels).map(([key, label]) => <Button key={key} variant={tool === key ? 'contained' : 'outlined'} onClick={() => setTool(key as Tool)}>{label}</Button>)}</ButtonGroup><TextField label="線條顏色" type="color" size="small" value={color} onChange={(event) => setColor(event.target.value)} sx={{ width: 92 }} /><Box sx={{ minWidth: 130 }}><Typography variant="caption">粗細</Typography><Slider size="small" min={3} max={28} value={lineWidth} onChange={(_event, value) => setLineWidth(value as number)} /></Box>{tool === 'arc' && <Box sx={{ minWidth: 130 }}><Typography variant="caption">弧度</Typography><Slider size="small" min={-90} max={90} value={curveBend} onChange={(_event, value) => setCurveBend(value as number)} /></Box>}<Button startIcon={<UndoRounded />} disabled={!selectedPhoto.marks.length} onClick={undo}>復原</Button><Button color="warning" startIcon={<DeleteSweepRounded />} disabled={!selectedPhoto.marks.length} onClick={clearMarks}>清除</Button></Stack><Box className="canvas-frame"><canvas ref={canvasRef} aria-label="現場照片標註畫布" onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={endDrawing} onPointerCancel={endDrawing} /></Box><Stack spacing={2} sx={{ mt: 2 }}><TextField label="圖面標題" value={selectedPhoto.title} onChange={(event) => updatePhoto(selectedPhoto.id, { title: event.target.value })} /><TextField label="圖面說明" multiline minRows={3} value={selectedPhoto.notes} onChange={(event) => updatePhoto(selectedPhoto.id, { notes: event.target.value })} /><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Button color="error" onClick={() => { imageCache.current.delete(selectedPhoto.id); setPhotos((current) => current.filter((photo) => photo.id !== selectedPhoto.id)); setSelectedId(photos.find((photo) => photo.id !== selectedPhoto.id)?.id ?? ''); }}>移除照片</Button><Button variant="contained" startIcon={<CloudUploadRounded />} disabled={Boolean(busy)} onClick={savePhoto}>{busy === 'photo' ? '儲存中…' : '儲存標註圖片'}</Button></Stack>{selectedPhoto.driveLink && <Link href={selectedPhoto.driveLink} target="_blank" rel="noopener noreferrer">開啟這張標註圖片</Link>}</Stack></Box>}</Box> : <Stack spacing={1} sx={{ alignItems: 'center', py: 12, px: 3 }}><AddPhotoAlternateRounded sx={{ fontSize: 56, color: 'text.disabled' }} /><Typography variant="h6">加入第一張現場照片</Typography><Typography color="text.secondary" align="center">每張照片都能使用弧線、箭頭、畫筆與圈選工具。</Typography></Stack>}
        </Paper>
      </Box>
      <Box ref={pdfRef} className="pdf-stack" aria-hidden="true"><article className="pdf-page"><header><span>TreeServ Geo｜樹木工作規劃</span><strong>{plan.planNo}</strong></header><h1>{plan.projectName || '樹木修剪計畫書'}</h1><p>{plan.locationName}　{plan.address}</p><section className="pdf-grid"><div><span>業主／單位</span><strong>{plan.clientName || '—'}</strong><small>{plan.clientPhone || '—'}</small></div><div><span>案場負責人</span><strong>{plan.siteLead || '—'}</strong><small>{plan.siteLeadPhone || '—'}</small></div><div><span>現勘日期</span><strong>{plan.surveyDate || '—'}</strong></div><div><span>預定施工</span><strong>{plan.workDate || '日期待確認'}</strong><small>{plan.workTime}</small></div></section><section className="pdf-section emphasis"><h2>主要修剪目標</h2><p>{plan.target || '—'}</p></section><section className="pdf-section"><h2>業主描述與需求</h2><p>{plan.description || '—'}</p></section><section className="pdf-columns"><div className="pdf-section"><h2>現場環境與限制</h2><p>{plan.siteConditions || '—'}</p></div><div className="pdf-section"><h2>主要標的與設備</h2><p>{plan.equipment || '—'}</p></div></section><section className="pdf-columns"><div className="pdf-section"><h2>作業人員與分工</h2><p>{plan.personnel || '—'}</p></div><div className="pdf-section"><h2>協助人員與聯絡方式</h2><p>{plan.assistants || '—'}</p></div></section></article>{photoPairs.map((pair, pageIndex) => <article className="pdf-page pdf-photo-page" key={pageIndex}><header><span>{plan.projectName || '樹木修剪計畫書'}｜現場修剪圖面</span><strong>{pageIndex + 2} / {photoPairs.length + 1}</strong></header>{pair.map((photo, index) => <section className="pdf-photo" key={photo.id}><h2>圖 {pageIndex * 2 + index + 1}｜{photo.title || photo.name}</h2><img src={photo.printable} alt="" /><p>{photo.notes || '依圖示範圍進行修剪，實際作業依現場樹況及安全條件調整。'}</p></section>)}</article>)}</Box>
      {message && <Alert className="floating-message" severity="info">{message}</Alert>}
    </Box>
  );
}
