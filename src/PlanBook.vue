<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { User } from 'firebase/auth';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { connectGoogleDrive, ensureProjectFolder, uploadDriveFile, type DriveItem } from './google-drive';
import { logActivity } from './firebase';

type Point = { x: number; y: number };
type Tool = 'brush' | 'arc' | 'arrow' | 'circle';
type Mark = { tool: Tool; points: Point[]; color: string; width: number; bend: number };
type PlanPhoto = {
  id: string;
  name: string;
  source: string;
  annotated: string;
  title: string;
  notes: string;
  marks: Mark[];
  driveLink: string;
};

const props = defineProps<{ account: User }>();
const emit = defineEmits<{ back: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const pdfStack = ref<HTMLElement | null>(null);
const photos = ref<PlanPhoto[]>([]);
const selectedId = ref('');
const tool = ref<Tool>('arc');
const color = ref('#ffe600');
const lineWidth = ref(10);
const curveBend = ref(-45);
const drawing = ref(false);
const activeMark = ref<Mark | null>(null);
const driveToken = ref('');
const driveEmail = ref('');
const driveFolder = ref<DriveItem | null>(null);
const pdfLink = ref('');
const busy = ref('');
const message = ref('');
const imageCache = new Map<string, HTMLImageElement>();

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const plan = reactive({
  planNo: `TS-${today.replaceAll('-', '')}`,
  projectName: '',
  clientName: '',
  clientPhone: '',
  locationName: '',
  address: '',
  surveyDate: today,
  workDate: '',
  workTime: '08:00–17:00',
  siteLead: '',
  siteLeadPhone: '',
  assistants: '',
  personnel: '',
  equipment: '',
  target: '',
  description: '',
  siteConditions: '',
  folderName: `TreeServ Geo 計畫書 ${today.slice(0, 7)}`,
});

const selectedPhoto = computed(() => photos.value.find((photo) => photo.id === selectedId.value) ?? photos.value[0]);
const photoPairs = computed(() => {
  const items = photos.value.map((photo) => ({ ...photo, printable: photo.annotated || photo.source }));
  return Array.from({ length: Math.ceil(items.length / 2) }, (_, index) => items.slice(index * 2, index * 2 + 2));
});
const toolLabels: Record<Tool, string> = { brush: '畫筆', arc: '弧線', arrow: '箭頭', circle: '圈選' };

function notify(value: string) {
  message.value = value;
  window.setTimeout(() => { if (message.value === value) message.value = ''; }, 3600);
}

function safeName(value: string) {
  return (value.trim() || 'TreeServ-Geo-計畫書').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
}

async function addPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
  for (const file of files) {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const photo: PlanPhoto = { id: crypto.randomUUID(), name: file.name, source, annotated: '', title: '', notes: '', marks: [], driveLink: '' };
    photos.value.push(photo);
    selectedId.value = photo.id;
  }
  input.value = '';
  await nextTick();
  await loadEditor();
}

function removePhoto(photo: PlanPhoto) {
  if (!window.confirm(`移除「${photo.name}」及目前標註？`)) return;
  imageCache.delete(photo.id);
  photos.value = photos.value.filter((item) => item.id !== photo.id);
  selectedId.value = photos.value[0]?.id ?? '';
}

function resizeCanvasForImage(image: HTMLImageElement) {
  if (!canvas.value) return;
  const max = 1600;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.value.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.value.height = Math.max(1, Math.round(image.naturalHeight * scale));
}

async function loadEditor() {
  const photo = selectedPhoto.value;
  if (!canvas.value || !photo) return;
  let image = imageCache.get(photo.id);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image!.onload = () => resolve();
      image!.onerror = () => reject(new Error('照片無法載入'));
      image!.src = photo.source;
    });
    imageCache.set(photo.id, image);
  }
  resizeCanvasForImage(image);
  redraw();
}

function pointFromEvent(event: PointerEvent): Point {
  const target = canvas.value!;
  const rect = target.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * target.width / rect.width,
    y: (event.clientY - rect.top) * target.height / rect.height,
  };
}

function curveControl(start: Point, end: Point, bend: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: (start.x + end.x) / 2 - dy / length * bend / 100 * length, y: (start.y + end.y) / 2 + dx / length * bend / 100 * length };
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, mark: Mark) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(18, mark.width * 3.2);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
  if (mark.points.length < 2) return;
  const start = mark.points[0];
  const end = mark.points.at(-1)!;
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.lineWidth = mark.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (mark.tool === 'brush') {
    ctx.moveTo(start.x, start.y);
    mark.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  } else if (mark.tool === 'arc') {
    const control = curveControl(start, end, mark.bend);
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  } else if (mark.tool === 'arrow') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  } else {
    ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  if (mark.tool === 'arc') arrowHead(ctx, curveControl(start, end, mark.bend), end, mark);
  if (mark.tool === 'arrow') arrowHead(ctx, start, end, mark);
  ctx.restore();
}

function redraw() {
  const target = canvas.value;
  const photo = selectedPhoto.value;
  if (!target || !photo) return;
  const image = imageCache.get(photo.id);
  if (!image) return;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(image, 0, 0, target.width, target.height);
  photo.marks.forEach((mark) => drawMark(ctx, mark));
}

function startDrawing(event: PointerEvent) {
  const photo = selectedPhoto.value;
  if (!canvas.value || !photo) return;
  canvas.value.setPointerCapture(event.pointerId);
  const start = pointFromEvent(event);
  const mark: Mark = { tool: tool.value, points: [start, start], color: color.value, width: lineWidth.value, bend: curveBend.value };
  if (tool.value === 'brush') mark.points = [start];
  photo.marks.push(mark);
  photo.annotated = '';
  activeMark.value = mark;
  drawing.value = true;
}

function moveDrawing(event: PointerEvent) {
  if (!drawing.value || !activeMark.value) return;
  const point = pointFromEvent(event);
  if (activeMark.value.tool === 'brush') activeMark.value.points.push(point);
  else activeMark.value.points.splice(1, 1, point);
  redraw();
}

function endDrawing(event: PointerEvent) {
  if (!drawing.value) return;
  canvas.value?.releasePointerCapture(event.pointerId);
  drawing.value = false;
  activeMark.value = null;
  redraw();
  if (canvas.value && selectedPhoto.value) selectedPhoto.value.annotated = canvas.value.toDataURL('image/png');
}

function undo() {
  const photo = selectedPhoto.value;
  if (!photo?.marks.length) return;
  photo.marks.pop();
  redraw();
  if (canvas.value) photo.annotated = canvas.value.toDataURL('image/png');
}

function clearMarks() {
  const photo = selectedPhoto.value;
  if (!photo?.marks.length || !window.confirm('清除這張照片上的所有標註？')) return;
  photo.marks = [];
  redraw();
  if (canvas.value) photo.annotated = canvas.value.toDataURL('image/png');
}

async function canvasBlob(): Promise<Blob> {
  redraw();
  const photo = selectedPhoto.value;
  if (!canvas.value || !photo) throw new Error('請先加入現場照片。');
  photo.annotated = canvas.value.toDataURL('image/png');
  return new Promise((resolve, reject) => canvas.value!.toBlob((blob) => blob ? resolve(blob) : reject(new Error('無法產生標註圖片')), 'image/png'));
}

async function ensureConnection() {
  if (!driveToken.value) {
    const connection = await connectGoogleDrive();
    driveToken.value = connection.accessToken;
    driveEmail.value = connection.email;
  }
  if (!driveFolder.value) driveFolder.value = await ensureProjectFolder(driveToken.value, plan.folderName);
  return { token: driveToken.value, folder: driveFolder.value };
}

async function connectDrive() {
  if (busy.value) return;
  busy.value = 'drive';
  try {
    driveToken.value = '';
    driveFolder.value = null;
    const { folder } = await ensureConnection();
    notify(`已連接 Google Drive：${folder.name}`);
  } catch (error) { notify(error instanceof Error ? error.message : 'Google Drive 連線失敗。'); }
  finally { busy.value = ''; }
}

async function savePhoto() {
  const photo = selectedPhoto.value;
  if (!photo || busy.value) return;
  busy.value = 'photo';
  try {
    const { token, folder } = await ensureConnection();
    const blob = await canvasBlob();
    const result = await uploadDriveFile(token, folder.id, `${safeName(plan.projectName || plan.locationName)}-${safeName(photo.title || photo.name)}-標註.png`, blob);
    photo.driveLink = result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`;
    await logActivity(props.account, 'plan_image_save', '', plan.projectName || plan.locationName);
    notify('標註圖片已獨立儲存到 Google Drive。');
  } catch (error) { notify(error instanceof Error ? error.message : '圖片儲存失敗。'); }
  finally { busy.value = ''; }
}

async function generatePdf(): Promise<Blob> {
  if (!pdfStack.value) throw new Error('計畫書版面尚未準備完成。');
  photos.value.forEach((photo) => {
    if (photo.id === selectedPhoto.value?.id && canvas.value) photo.annotated = canvas.value.toDataURL('image/png');
  });
  await nextTick();
  await document.fonts.ready;
  const pages = Array.from(pdfStack.value.querySelectorAll<HTMLElement>('.pdf-page'));
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    const rendered = await html2canvas(pages[index], { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false });
    if (index) pdf.addPage('a4', 'portrait');
    pdf.addImage(rendered.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  return pdf.output('blob');
}

async function savePlanPdf() {
  if (busy.value) return;
  if (!plan.projectName.trim() || !plan.locationName.trim() || !plan.address.trim() || !plan.clientPhone.trim() || !plan.siteLeadPhone.trim() || !plan.target.trim()) {
    notify('請先填寫計畫名稱、地點、地址、兩組聯絡電話與主要修剪目標。');
    return;
  }
  busy.value = 'pdf';
  try {
    const { token, folder } = await ensureConnection();
    const pdf = await generatePdf();
    const result = await uploadDriveFile(token, folder.id, `${safeName(plan.planNo)}-${safeName(plan.projectName)}-修剪計畫書.pdf`, pdf);
    pdfLink.value = result.webViewLink ?? `https://drive.google.com/open?id=${result.id}`;
    await logActivity(props.account, 'plan_pdf_save', '', plan.projectName);
    notify('計畫書 PDF 已存入 Google Drive；連結僅供已授權帳號開啟。');
  } catch (error) { notify(error instanceof Error ? error.message : '計畫書儲存失敗。'); }
  finally { busy.value = ''; }
}

watch(selectedId, (_newId, oldId) => {
  const previous = photos.value.find((photo) => photo.id === oldId);
  if (previous && canvas.value) previous.annotated = canvas.value.toDataURL('image/png');
  nextTick().then(loadEditor);
});
watch([lineWidth, curveBend], () => { if (activeMark.value) { activeMark.value.width = lineWidth.value; activeMark.value.bend = curveBend.value; redraw(); } });
onMounted(() => {
  if (new URLSearchParams(window.location.search).get('view') !== 'plan') {
    window.history.pushState({ view: 'plan' }, '', '?view=plan');
  }
});
</script>

<template>
  <section class="plan-book">
    <header class="plan-header">
      <button class="plan-back" type="button" @click="emit('back')">← 返回案場地圖</button>
      <div><span>TreeServ Geo</span><h1>樹木修剪計畫書</h1></div>
      <div class="plan-actions">
        <button class="drive-connect" type="button" :disabled="Boolean(busy)" @click="connectDrive">{{driveFolder ? 'Drive 已連接' : '連接 Google Drive'}}</button>
        <button class="plan-save" type="button" :disabled="Boolean(busy)" @click="savePlanPdf">{{busy==='pdf'?'製作 PDF 中…':'儲存計畫書 PDF'}}</button>
      </div>
    </header>

    <div class="plan-layout">
      <form class="plan-form" @submit.prevent="savePlanPdf">
        <section class="plan-form-intro"><strong>{{plan.planNo}}</strong><p>先把業主需求、現場條件與執行資源整理完整，再於照片上標示修剪範圍。</p></section>
        <fieldset :disabled="Boolean(busy)">
          <h2>計畫基本資料</h2>
          <label>計畫名稱<input v-model="plan.projectName" required placeholder="例如：社區中庭喬木修剪"></label>
          <div class="plan-form-row"><label>業主／單位<input v-model="plan.clientName" placeholder="業主姓名或單位"></label><label>業主聯絡電話<input v-model="plan.clientPhone" required inputmode="tel" placeholder="0912-345-678"></label></div>
          <div class="plan-form-row"><label>案場名稱<input v-model="plan.locationName" required placeholder="例如：○○社區"></label><label>現勘日期<input v-model="plan.surveyDate" type="date"></label></div>
          <label>案場地址<input v-model="plan.address" required placeholder="縣市、區、路段與門牌"></label>
          <div class="plan-form-row"><label>預定施工日期<input v-model="plan.workDate" type="date"></label><label>預定作業時間<input v-model="plan.workTime" placeholder="08:00–17:00"></label></div>

          <h2>人員與聯絡窗口</h2>
          <div class="plan-form-row"><label>案場負責人<input v-model="plan.siteLead" placeholder="姓名／職稱"></label><label>負責人聯絡電話<input v-model="plan.siteLeadPhone" required inputmode="tel" placeholder="0912-345-678"></label></div>
          <label>相關協助人員與聯絡方式<textarea v-model="plan.assistants" rows="3" placeholder="警衛、管理委員會、里長、其他現場窗口…"></textarea></label>
          <label>預計作業人員與分工<textarea v-model="plan.personnel" rows="3" placeholder="攀樹、地勤、交維、吊車操作等"></textarea></label>

          <h2>修剪目標與現場條件</h2>
          <label>主要修剪目標<textarea v-model="plan.target" required rows="4" placeholder="例如：降低建物側枝條、清除枯枝並維持樹冠平衡"></textarea></label>
          <label>業主描述與需求<textarea v-model="plan.description" rows="5" placeholder="逐項記錄業主希望改善的問題、保留範圍及驗收重點"></textarea></label>
          <label>現場環境與限制<textarea v-model="plan.siteConditions" rows="4" placeholder="人車動線、建物、電線、出入口、鄰房、施工時段限制…"></textarea></label>
          <label>主要標的與設備<textarea v-model="plan.equipment" rows="3" placeholder="樹種／棵數、吊車、Rigging、鏈鋸、交維器材…"></textarea></label>

          <h2>Google Drive 存檔位置</h2>
          <label>指定專案資料夾名稱<input v-model="plan.folderName" @change="driveFolder=null" placeholder="TreeServ Geo 計畫書 2026-09"></label>
          <p class="field-help">系統只會建立及管理由 TreeServ Geo 建立的檔案；不會公開分享。Drive 連結仍需以獲授權的 Google 帳號登入。</p>
          <a v-if="pdfLink" class="drive-result" :href="pdfLink" target="_blank" rel="noopener noreferrer">開啟已儲存的計畫書 PDF ↗</a>
        </fieldset>
      </form>

      <section class="photo-studio">
        <div class="studio-heading"><div><span>照片標註工作台</span><h2>在樹冠上直接畫出修剪範圍</h2></div><label class="photo-add">＋ 加入現場照片<input type="file" accept="image/*" multiple @change="addPhotos"></label></div>

        <div v-if="photos.length" class="photo-tabs" aria-label="現場照片清單">
          <button v-for="(photo,index) in photos" :key="photo.id" type="button" :class="{active:photo.id===selectedPhoto?.id}" @click="selectedId=photo.id"><span>{{String(index+1).padStart(2,'0')}}</span>{{photo.title || photo.name}}</button>
        </div>

        <div v-if="selectedPhoto" class="canvas-workspace">
          <div class="drawing-toolbar" role="toolbar" aria-label="照片標註工具">
            <button v-for="(label,key) in toolLabels" :key="key" type="button" :class="{active:tool===key}" @click="tool=key as Tool">{{label}}</button>
            <label class="color-tool">線條顏色<input v-model="color" type="color"></label>
            <label class="range-tool">粗細<input v-model.number="lineWidth" type="range" min="3" max="28"></label>
            <label v-if="tool==='arc'" class="range-tool">弧度<input v-model.number="curveBend" type="range" min="-90" max="90"></label>
            <button type="button" :disabled="!selectedPhoto.marks.length" @click="undo">復原</button>
            <button type="button" :disabled="!selectedPhoto.marks.length" @click="clearMarks">清除</button>
          </div>
          <div class="canvas-frame"><canvas ref="canvas" aria-label="現場照片標註畫布" @pointerdown.prevent="startDrawing" @pointermove.prevent="moveDrawing" @pointerup.prevent="endDrawing" @pointercancel.prevent="endDrawing"></canvas></div>
          <div class="photo-detail-row"><label>圖面標題<input v-model="selectedPhoto.title" placeholder="例如：全樹照－建物側"></label><button type="button" class="remove-photo" @click="removePhoto(selectedPhoto)">移除照片</button></div>
          <label class="photo-note">圖面說明<textarea v-model="selectedPhoto.notes" rows="3" placeholder="說明縮剪高度、退縮幅度、保留範圍與施工方式"></textarea></label>
          <div class="studio-save-row"><span>拖曳即可繪製；弧線工具會依弧度設定自動產生曲線與方向箭頭。</span><button type="button" :disabled="Boolean(busy)" @click="savePhoto">{{busy==='photo'?'儲存中…':'儲存標註圖片到 Drive'}}</button></div>
          <a v-if="selectedPhoto.driveLink" class="drive-result" :href="selectedPhoto.driveLink" target="_blank" rel="noopener noreferrer">開啟這張標註圖片 ↗</a>
        </div>
        <div v-else class="studio-empty"><span>⌁</span><h2>加入第一張現場照片</h2><p>支援一次選取多張照片；每張都能獨立畫弧線、箭頭、自由線與圈選範圍。</p></div>
      </section>
    </div>

    <div ref="pdfStack" class="pdf-stack" aria-hidden="true">
      <article class="pdf-page pdf-cover">
        <header><span>TreeServ Geo｜樹木工作規劃</span><strong>{{plan.planNo}}</strong></header>
        <h1>{{plan.projectName || '樹木修剪計畫書'}}</h1><p class="pdf-address">{{plan.locationName}}　{{plan.address}}</p>
        <section class="pdf-grid"><div><span>業主／單位</span><strong>{{plan.clientName || '—'}}</strong><small>{{plan.clientPhone || '—'}}</small></div><div><span>案場負責人</span><strong>{{plan.siteLead || '—'}}</strong><small>{{plan.siteLeadPhone || '—'}}</small></div><div><span>現勘日期</span><strong>{{plan.surveyDate || '—'}}</strong></div><div><span>預定施工</span><strong>{{plan.workDate || '日期待確認'}}</strong><small>{{plan.workTime}}</small></div></section>
        <section class="pdf-section emphasis"><h2>主要修剪目標</h2><p>{{plan.target || '—'}}</p></section>
        <section class="pdf-section"><h2>業主描述與需求</h2><p>{{plan.description || '—'}}</p></section>
        <section class="pdf-columns"><div class="pdf-section"><h2>現場環境與限制</h2><p>{{plan.siteConditions || '—'}}</p></div><div class="pdf-section"><h2>主要標的與設備</h2><p>{{plan.equipment || '—'}}</p></div></section>
        <section class="pdf-columns"><div class="pdf-section"><h2>作業人員與分工</h2><p>{{plan.personnel || '—'}}</p></div><div class="pdf-section"><h2>協助人員與聯絡方式</h2><p>{{plan.assistants || '—'}}</p></div></section>
        <footer>本計畫依現勘及業主需求製作；施工前仍應確認樹況、天候、路權與現場安全條件。</footer>
      </article>
      <article v-for="(pair,pageIndex) in photoPairs" :key="pageIndex" class="pdf-page pdf-photo-page">
        <header><span>{{plan.projectName || '樹木修剪計畫書'}}｜現場修剪圖面</span><strong>{{pageIndex+2}} / {{photoPairs.length+1}}</strong></header>
        <section v-for="(photo,index) in pair" :key="photo.id" class="pdf-photo"><h2>圖 {{pageIndex*2+index+1}}｜{{photo.title || photo.name}}</h2><img :src="photo.printable" alt=""><p>{{photo.notes || '依圖示範圍進行修剪，實際作業依現場樹況及安全條件調整。'}}</p></section>
        <footer>{{plan.planNo}}｜{{plan.locationName}}｜{{plan.workDate || plan.surveyDate}}</footer>
      </article>
    </div>
    <div v-if="message" class="plan-toast" role="status">{{message}}</div>
  </section>
</template>
