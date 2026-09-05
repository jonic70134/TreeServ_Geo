<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import type { User } from 'firebase/auth';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, firebaseReady, googleSignIn, onAuthStateChanged, signOut, userRole, collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch, auditData, logActivity } from './firebase';
import { getRuntimeConfig } from './runtime-config';
import RouteMap, { type RoutePoint } from './RouteMap.vue';
import ActivityLog from './ActivityLog.vue';

type WorkRecord = { id: string; locationId: string; title: string; notes: string; imageUrls: string[]; youtubeUrls: string[]; fileUrls: string[]; authorName: string; authorId?: string; routePoints?: RoutePoint[]; routeNotes?: string; createdAt?: any; dateLabel?: string };
type Location = { id: string; name: string; address: string; lat: number; lng: number; status: string; attention: string; aliases: string[]; records?: WorkRecord[]; updatedAt?: any };

const demos = ref<Location[]>([
  { id:'donghu-elementary', name:'東湖國小', address:'台北市內湖區東湖路 115 號', lat:25.0684, lng:121.6158, status:'施工中', attention:'西側管道間訊號較弱，請先下載圖面。下午四點後由警衛室側門進出。', aliases:['東湖','國小'], records:[
    { id:'r1', locationId:'donghu-elementary', title:'設備巡檢完成', notes:'確認三樓機房電源與線路，溫度維持正常。已將新線路貼上黃色識別標籤。', imageUrls:['https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=900&q=80'], youtubeUrls:['https://www.youtube.com/watch?v=dQw4w9WgXcQ'], fileUrls:['https://example.com/maintenance-report.pdf'], authorName:'Jonic Huang', dateLabel:'今天 14:30' },
    { id:'r2', locationId:'donghu-elementary', title:'光纖線路標記', notes:'新增弱電箱走線說明，供下次施工人員參考。', imageUrls:[], youtubeUrls:[], fileUrls:[], authorName:'林技師', dateLabel:'8 月 18 日' }
  ]},
  { id:'donghu-junior', name:'東湖國中', address:'台北市內湖區康樂街 131 號', lat:25.0713, lng:121.6176, status:'待複查', attention:'地下室進場需先向總務處借用門禁卡。', aliases:['東湖','國中'], records:[{id:'r3',locationId:'donghu-junior',title:'配線盤點',notes:'B1 弱電間尚有兩條未標示線路。',imageUrls:[],youtubeUrls:[],fileUrls:[],authorName:'王工程師',dateLabel:'8 月 28 日'}]},
  { id:'nangang-room', name:'南港機房', address:'台北市南港區經貿二路 1 號', lat:25.0588, lng:121.6152, status:'注意事項', attention:'冷通道地板局部鬆動，搬運設備時請避開紅色警示區。', aliases:['南港','機房'], records:[{id:'r4',locationId:'nangang-room',title:'冷卻系統檢查',notes:'二號機溫差偏高，已通知維運團隊追蹤。',imageUrls:[],youtubeUrls:[],fileUrls:['https://example.com/site-drawing.pdf'],authorName:'Jonic Huang',dateLabel:'8 月 21 日'}]}
]);

const locations = ref<Location[]>([]);
const records = ref<WorkRecord[]>([]);
const activeId = ref('donghu-elementary');
const searchText = ref('');
const searchOpen = ref(false);
const showCreate = ref(false);
const editing = ref<WorkRecord | null>(null);
const saving = ref(false);
const showLogs = ref(false);
const formLocationId = ref('');
const routePoints = ref<RoutePoint[]>([]);
const routeNotes = ref('');
const routeRecord = ref<WorkRecord | null>(null);
const user = ref<User | null>(null);
const toast = ref('');
const mapEl = ref<HTMLElement | null>(null);
const map = shallowRef<any>(null);
const mapProvider = ref<'google'|'leaflet'>('leaflet');
const markers = shallowRef<any[]>([]);
let authStop: undefined | (() => void);
let locationsStop: undefined | (() => void);
let recordsStop: undefined | (() => void);

const form = reactive({ name:'', address:'', status:'進行中', attention:'', title:'', notes:'', imageUrls:'', youtubeUrls:'', fileUrls:'', lat:25.0684, lng:121.6158 });
const role = computed(() => userRole(user.value));
const activeLocation = computed(() => locations.value.find((item) => item.id === activeId.value) ?? locations.value[0]);
const activeRecords = computed(() => firebaseReady || records.value.length ? records.value.filter((item) => item.locationId === activeLocation.value?.id) : activeLocation.value?.records ?? []);
const routeCenter = computed(() => ({ lat: form.lat, lng: form.lng }));
function canEdit(record: WorkRecord) { return role.value === 'owner' || Boolean(user.value && record.authorId === user.value.uid); }
const suggestions = computed(() => {
  const needle = searchText.value.trim().toLowerCase();
  if (!needle) return locations.value.slice(0,5);
  return locations.value.filter((item) => [item.name,item.address,...(item.aliases||[])].join(' ').toLowerCase().includes(needle)).slice(0,6);
});
const preferredMapProvider = getRuntimeConfig()?.mapProvider || import.meta.env.VITE_MAP_PROVIDER || 'openstreetmap';
const googleMapsApiKey = getRuntimeConfig()?.googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const googleMapId = getRuntimeConfig()?.googleMapId || import.meta.env.VITE_GOOGLE_MAP_ID;
const isGoogleReady = computed(() => preferredMapProvider === 'google' && Boolean(googleMapsApiKey));

function notify(message:string){ toast.value=message; window.setTimeout(()=>{ if(toast.value===message) toast.value=''; },2600); }
function cleanUrls(value:string){ return value.split(/\n|,/).map((v)=>v.trim()).filter((v)=>/^https?:\/\//i.test(v)); }
function youtubeId(url:string){ const match=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/); return match?.[1] ?? ''; }
function fileName(url:string){ try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '開啟附件'); } catch { return '開啟附件'; } }
function selectLocation(place:Location){ activeId.value=place.id; searchText.value=place.name; searchOpen.value=false; map.value?.panTo({lat:place.lat,lng:place.lng}); map.value?.setZoom(16); }

async function initMap(){
  if(!mapEl.value) return;
  if(!isGoogleReady.value){
    mapProvider.value='leaflet';
    map.value=L.map(mapEl.value,{zoomControl:false,attributionControl:true}).setView([25.066,121.615],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(map.value);
    drawMarkers();
    return;
  }
  try{
    setOptions({key:googleMapsApiKey,v:'weekly',language:'zh-TW',region:'TW'});
    const {Map}=await importLibrary('maps') as any;
    mapProvider.value='google';
    map.value=new Map(mapEl.value,{center:{lat:25.066,lng:121.615},zoom:14,mapId:googleMapId || 'DEMO_MAP_ID',disableDefaultUI:false,zoomControl:true,gestureHandling:'greedy'});
    drawMarkers();
  }catch{ notify('Google Maps 載入失敗，已切換為預覽地圖'); }
}
async function drawMarkers(){
  if(!map.value) return;
  markers.value.forEach((marker)=>marker.setMap?.(null) ?? marker.remove?.()); markers.value=[];
  if(mapProvider.value==='leaflet'){
    locations.value.forEach((place)=>{
      const count=records.value.filter(r=>r.locationId===place.id).length || place.records?.length || 1;
      const marker=L.marker([place.lat,place.lng],{icon:L.divIcon({className:'leaflet-tree-marker',html:`<span>${count}</span>`,iconSize:[38,38],iconAnchor:[19,36]})}).addTo(map.value);
      marker.bindTooltip(place.name,{direction:'top',offset:[0,-32]}); marker.on('click',()=>selectLocation(place)); markers.value.push(marker);
    });
    return;
  }
  const {Marker}=await importLibrary('marker') as any;
  locations.value.forEach((place)=>{
    const marker=new Marker({map:map.value,position:{lat:place.lat,lng:place.lng},title:place.name,label:String((records.value.filter(r=>r.locationId===place.id).length || place.records?.length || 1))});
    marker.addListener('click',()=>selectLocation(place)); markers.value.push(marker);
  });
}
function locateMe(){ navigator.geolocation?.getCurrentPosition(({coords})=>{ map.value?.panTo({lat:coords.latitude,lng:coords.longitude}); map.value?.setZoom(16); notify('已移動到目前位置'); },()=>notify('無法取得位置，請檢查瀏覽器權限')); }
async function geocodeAddress(){
  if(!form.address) return;
  try{
    if(isGoogleReady.value){ const {Geocoder}=await importLibrary('geocoding') as any; const result=await new Geocoder().geocode({address:form.address,region:'TW'}); const point=result.results[0]?.geometry.location; if(point){form.lat=point.lat();form.lng=point.lng();notify('已自動定位地點');return;} }
    else { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&q=${encodeURIComponent(form.address)}`,{headers:{'Accept-Language':'zh-TW'}}); const result=await response.json(); if(result[0]){form.lat=Number(result[0].lat);form.lng=Number(result[0].lon);map.value?.setView?.([form.lat,form.lng],16);notify('已自動定位地點');return;} }
    notify('找不到這個地址，請確認後再試');
  }catch{ notify('找不到這個地址，請確認後再試'); }
}

function resetForm(){ Object.assign(form,{name:'',address:'',status:'進行中',attention:'',title:'',notes:'',imageUrls:'',youtubeUrls:'',fileUrls:'',lat:activeLocation.value?.lat ?? 25.0684,lng:activeLocation.value?.lng ?? 121.6158}); editing.value=null; routePoints.value=[]; routeNotes.value=''; formLocationId.value=activeLocation.value?.id || ''; }
function closeForm(){ if(!saving.value) showCreate.value=false; }
function openCreate(){ if(firebaseReady && !user.value){ notify('登入後即可建立工作紀錄'); return; } resetForm(); showCreate.value=true; }
async function openEdit(record:WorkRecord){
  if (!canEdit(record)) return;
  resetForm(); editing.value=record; formLocationId.value=record.locationId;
  const place=locations.value.find(p=>p.id===record.locationId);
  Object.assign(form,{title:record.title,notes:record.notes,imageUrls:(record.imageUrls || []).join('\n'),youtubeUrls:(record.youtubeUrls || []).join('\n'),fileUrls:(record.fileUrls || []).join('\n'),lat:place?.lat ?? form.lat,lng:place?.lng ?? form.lng});
  routePoints.value=(record.routePoints || []).map(p=>({...p})); routeNotes.value=record.routeNotes || ''; showCreate.value=true;
  if(user.value) try { await logActivity(user.value,'edit',record.id,record.title); } catch { notify('已開啟編輯，但操作紀錄寫入失敗'); }
}

async function saveRecord(){
  if(saving.value) return;
  if(firebaseReady && !user.value) { notify('請先登入'); return; }
  if(editing.value && !canEdit(editing.value)) { notify('你沒有修改這筆紀錄的權限'); return; }
  if(!form.title.trim() || !form.notes.trim()){ notify('請填寫紀錄標題與工作內容'); return; }
  if(routePoints.value.length===1){ notify('請加上 B 終點，或清除未完成的路線'); return; }
  if(!editing.value && !form.name.trim() && !formLocationId.value){ notify('請填寫新案場名稱'); return; }
  if(editing.value && !window.confirm(`確定更新「${editing.value.title}」？確認後會儲存目前的工作內容與路線。`)) return;
  saving.value=true;
  const payload={title:form.title.trim(),notes:form.notes.trim(),imageUrls:cleanUrls(form.imageUrls),youtubeUrls:cleanUrls(form.youtubeUrls),fileUrls:cleanUrls(form.fileUrls),routePoints:routePoints.value.map(p=>({lat:p.lat,lng:p.lng})),routeNotes:routeNotes.value.trim(),updatedAt:serverTimestamp()};
  try{
    const batch=db?writeBatch(db):null;
    const auditRef=db?doc(collection(db,'activityLogs')):null;
    let recordId=editing.value?.id || crypto.randomUUID();
    if(editing.value){
      if(db && batch) batch.update(doc(db,'workRecords',editing.value.id),{...payload,lastAuditId:auditRef!.id});
      else Object.assign(editing.value,payload);
    }else{
      let locationId=formLocationId.value;
      if(form.name.trim()){
        locationId=crypto.randomUUID();
        const locationPayload={name:form.name.trim(),address:form.address.trim(),lat:form.lat,lng:form.lng,status:form.status,attention:form.attention.trim(),aliases:[],createdBy:user.value?.uid ?? 'demo',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
        if(db && batch) batch.set(doc(db,'locations',locationId),locationPayload);
        else locations.value.unshift({id:locationId,...locationPayload,records:[]} as Location);
      }
      const recordPayload={...payload,locationId,authorId:user.value?.uid ?? 'demo',authorName:user.value?.displayName || user.value?.email || '示範使用者',createdAt:serverTimestamp()};
      if(db && batch) batch.set(doc(db,'workRecords',recordId),{...recordPayload,lastAuditId:auditRef!.id});
      else records.value.unshift({id:crypto.randomUUID(),...recordPayload,dateLabel:'剛剛'} as WorkRecord);
      if(locationId) activeId.value=locationId;
    }
    if(batch && auditRef && user.value){ batch.set(auditRef,auditData(user.value,editing.value?'update':'create',recordId,payload.title)); await batch.commit(); }
    notify(editing.value?'工作紀錄已更新':'工作紀錄已建立');
    showCreate.value=false; resetForm(); await nextTick(); drawMarkers();
  }catch{ notify('儲存失敗，請確認登入帳號及資料庫權限；你的輸入仍保留。'); }
  finally { saving.value=false; }
}
async function removeRecord(record:WorkRecord){
  if(role.value!=='owner' || saving.value) return;
  if(!window.confirm(`確定刪除「${record.title}」？刪除後無法復原。`)) return;
  saving.value=true;
  try {
    if(db && user.value){
      const batch=writeBatch(db);
      const auditRef=doc(collection(db,'activityLogs'));
      batch.delete(doc(db,'workRecords',record.id));
      batch.set(doc(db,'recordDeletions',record.id),{...auditData(user.value,'delete',record.id,record.title),auditId:auditRef.id});
      batch.set(auditRef,auditData(user.value,'delete',record.id,record.title));
      await batch.commit();
    } else records.value=records.value.filter((item)=>item.id!==record.id);
    notify('紀錄已刪除');
  } catch { notify('刪除失敗，請確認 Owner 帳號與資料庫權限。'); }
  finally { saving.value=false; }
}
async function login(){ try{ await googleSignIn(); notify('已使用 Google 帳號登入'); }catch(error){ notify(error instanceof Error?error.message:'登入失敗'); } }
async function logout(){ if(auth){try { if(user.value) await logActivity(user.value,'logout'); } catch { notify('登出紀錄寫入失敗'); } await signOut(auth);showLogs.value=false;showCreate.value=false;notify('已登出');} }

onMounted(async()=>{
  locations.value=firebaseReady?[]:demos.value;
  if(auth) authStop=onAuthStateChanged(auth,(account)=>{const previous=user.value?.uid;user.value=account;if(!account){showLogs.value=false;showCreate.value=false;}if(account && account.uid!==previous) logActivity(account,'login').catch(()=>notify('登入成功，但登入紀錄寫入失敗，請檢查資料庫權限'));});
  if(db){
    locationsStop=onSnapshot(query(collection(db,'locations'),orderBy('updatedAt','desc')),(snapshot)=>{locations.value=snapshot.docs.map((d)=>({id:d.id,...d.data()} as Location));if(!activeId.value&&locations.value[0])activeId.value=locations.value[0].id;drawMarkers();},()=>{notify('案場讀取失敗，請檢查連線與資料庫權限');});
    recordsStop=onSnapshot(query(collection(db,'workRecords'),orderBy('createdAt','desc')),(snapshot)=>{records.value=snapshot.docs.map((d)=>({id:d.id,...d.data()} as WorkRecord));},()=>notify('工作紀錄同步暫時中斷'));
  }
  await nextTick(); initMap();
});
onUnmounted(()=>{authStop?.();locationsStop?.();recordsStop?.();map.value?.remove?.();});
watch(()=>locations.value.length,()=>drawMarkers());
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <button class="brand" @click="activeId=locations[0]?.id"><span class="brand-pin">⌖</span><span><strong>TreeServ Geo</strong><small>案場工作紀錄</small></span></button>
      <div class="search-wrap">
        <label class="global-search"><span>⌕</span><input v-model="searchText" @focus="searchOpen=true" @keydown.escape="searchOpen=false" placeholder="搜尋地點、案場或紀錄…" aria-label="搜尋已記錄地點"><kbd>⌘ K</kbd></label>
        <div v-if="searchOpen" class="suggestions"><button v-for="item in suggestions" :key="item.id" @click="selectLocation(item)"><span class="mini-pin">⌖</span><span><strong>{{item.name}}</strong><small>{{item.address}}</small></span><em>{{item.records?.length || records.filter(r=>r.locationId===item.id).length}} 筆</em></button><p v-if="!suggestions.length">找不到相符地點</p></div>
      </div>
      <button v-if="role==='owner'" class="audit-nav" @click="showLogs=!showLogs">{{showLogs?'返回地圖':'操作紀錄'}}</button>
      <button class="primary-action" @click="openCreate"><span>＋</span>建立工作紀錄</button>
      <button v-if="!user" class="login-button" @click="login">使用 Google 登入</button>
      <button v-else class="account-button" @click="logout" :title="`${user.email}（點擊登出）`">{{user.displayName?.slice(0,1) || user.email?.slice(0,1)}}<span>{{role==='owner'?'Owner':'User'}}</span></button>
    </header>

    <ActivityLog v-if="showLogs && role==='owner'" />
    <section v-show="!showLogs" class="workspace">
      <aside class="places-panel">
        <div class="panel-heading"><div><small>工作地點</small><strong>{{locations.length}} 個案場</strong></div><span class="sync-state"><i/>{{firebaseReady?'即時同步':'示範模式'}}</span></div>
        <div class="place-list"><button v-for="(place,index) in locations" :key="place.id" :class="['place-row',{active:place.id===activeLocation?.id,warn:place.status.includes('注意')} ]" @click="selectLocation(place)"><span class="place-index">{{String(index+1).padStart(2,'0')}}</span><span><strong>{{place.name}}</strong><small>{{records.filter(r=>r.locationId===place.id).length || place.records?.length || 0}} 筆紀錄 · {{place.status}}</small></span><b v-if="place.status.includes('注意')">!</b></button></div>
        <div class="permission-card"><strong>權限說明</strong><p><b>訪客</b> 可查看；<b>User</b> 可建立與編輯；<b>Owner</b> 可完整管理與刪除。</p></div>
      </aside>

      <div class="map-stage">
        <div ref="mapEl" class="google-map"></div>
        <div class="map-tools"><button @click="map?.setZoom((map?.getZoom()||14)+1)">＋</button><button @click="map?.setZoom((map?.getZoom()||14)-1)">−</button><button @click="locateMe" title="移動到目前位置">◎</button></div>
        <div class="map-legend"><i/> {{isGoogleReady?'Google Maps':'OpenStreetMap 備援地圖'}} · {{firebaseReady?'Firestore 即時同步':'示範資料'}}</div>
      </div>

      <aside v-if="activeLocation" class="record-panel">
        <div class="record-head"><small>目前位置</small><span>{{activeLocation.status}}</span></div><h1>{{activeLocation.name}}</h1><p class="address">{{activeLocation.address}}</p><div class="record-summary"><span>{{activeRecords.length}} 筆紀錄</span><button v-if="role!=='guest'" @click="openCreate">＋ 新增</button></div>
        <div v-if="activeLocation.attention" class="attention"><b>!</b><div><strong>進場前注意</strong><p>{{activeLocation.attention}}</p></div></div>
        <div class="timeline-title"><strong>工作時間軸</strong><small>最新在前</small></div>
        <div v-if="activeRecords.length" class="timeline">
          <article v-for="record in activeRecords" :key="record.id"><i/><time>{{record.dateLabel || record.createdAt?.toDate?.().toLocaleString('zh-TW') || '最近更新'}}</time><strong>{{record.title}}</strong><p>{{record.notes}}</p><div v-if="record.imageUrls?.length" class="image-grid"><img v-for="url in record.imageUrls" :key="url" :src="url" :alt="`${record.title} 現場照片`" loading="lazy"></div><div v-for="url in record.youtubeUrls" :key="url" class="video"><iframe v-if="youtubeId(url)" :src="`https://www.youtube-nocookie.com/embed/${youtubeId(url)}`" title="工作紀錄影片" loading="lazy" allowfullscreen/></div><div class="files"><a v-for="url in record.fileUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer"><span>↗</span>{{fileName(url)}}</a></div><button v-if="record.routePoints?.length" class="route-view-button" @click="routeRecord=record">查看 A → B 進場路線</button><div class="record-meta"><span>由 {{record.authorName}} 記錄</span><div v-if="canEdit(record)"><button :disabled="saving" @click="openEdit(record)">編輯</button><button v-if="role==='owner'" class="danger" :disabled="saving" @click="removeRecord(record)">刪除</button></div></div></article>
        </div><div v-else class="empty-state"><span>⌖</span><strong>尚無工作紀錄</strong><p>登入後新增第一筆，讓下一位到場的人少走冤枉路。</p></div>
      </aside>
    </section>

    <div v-if="showCreate" class="modal-layer" @mousedown.self="closeForm"><form class="record-modal" @submit.prevent="saveRecord"><div class="modal-head"><div><small>{{editing?'更新紀錄':'新增案場紀錄'}}</small><h2>{{editing?'編輯工作內容':'建立工作紀錄'}}</h2></div><button type="button" @click="closeForm">×</button></div><div class="form-scroll"><fieldset :disabled="saving" class="record-fields"><template v-if="!editing"><label>地點名稱<input v-model="form.name"  :placeholder="activeLocation ? `留空使用目前案場：${activeLocation.name}` : '例如：東湖國小'"></label><div class="field-action"><label>地址<input v-model="form.address" placeholder="輸入地址後自動定位" @blur="geocodeAddress"></label><button type="button" @click="geocodeAddress">定位</button></div><div class="form-row"><label>狀態<select v-model="form.status"><option>進行中</option><option>待複查</option><option>已完成</option><option>注意事項</option></select></label><label>座標<input :value="`${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`" readonly></label></div><label>進場前注意<textarea v-model="form.attention" rows="2" placeholder="門禁、危險區域、聯絡窗口…"/></label></template><label>紀錄標題<input v-model="form.title" required placeholder="例如：設備巡檢完成"></label><label>工作內容<textarea v-model="form.notes" required rows="4" placeholder="完成了什麼、發現什麼、下一位需要知道什麼…"/></label><div class="route-section"><h3>A → B 進場路線</h3><RouteMap v-model="routePoints" :editable="!saving" :center="routeCenter" /><label>進場說明<textarea v-model="routeNotes" rows="2" placeholder="例如：由大馬路右轉進場，禁止走北側小巷。"/></label></div><label>圖片網址 <small>一行一個或以逗號分隔</small><textarea v-model="form.imageUrls" rows="2" placeholder="https://example.com/photo.jpg"/></label><label>YouTube 網址<textarea v-model="form.youtubeUrls" rows="2" placeholder="https://youtube.com/watch?v=..."/></label><label>檔案網址<textarea v-model="form.fileUrls" rows="2" placeholder="https://example.com/report.pdf"/></label></fieldset></div><div class="modal-actions"><button type="button" @click="closeForm">取消</button><button class="save" type="submit" :disabled="saving">{{saving?'儲存中…':editing?'儲存變更':'建立紀錄'}}</button></div></form></div>
    <div v-if="routeRecord" class="modal-layer" @mousedown.self="routeRecord=null"><section class="record-modal" role="dialog" aria-modal="true" aria-label="進場路線"><div class="modal-head"><h2>{{routeRecord.title}} · 進場路線</h2><button @click="routeRecord=null" aria-label="關閉路線">×</button></div><div class="form-scroll"><RouteMap :model-value="routeRecord.routePoints || []" :center="routeRecord.routePoints?.[0] || {lat:25.0684,lng:121.6158}" /><p class="route-instructions">{{routeRecord.routeNotes || '請依箭頭方向進場。'}}</p></div></section></div>
    <div v-if="toast" class="toast" role="status">{{toast}}</div>
  </main>
</template>
