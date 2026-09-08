<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import type { User } from 'firebase/auth';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, firebaseReady, googleSignIn, onAuthStateChanged, signOut, userRole, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, writeBatch, auditData, logActivity } from './firebase';
import { getRuntimeConfig } from './runtime-config';
import { crewOptions, demoLocations } from './demo-data';
import RouteMap, { type RoutePoint } from './RouteMap.vue';
import ActivityLog from './ActivityLog.vue';
import PlanBook from './PlanBook.vue';

type WorkRecord = { authorId?:string; routePoints?:RoutePoint[]; routeNotes?:string; sourceImported?:boolean; id:string; locationId:string; title:string; notes:string; imageUrls:string[]; youtubeUrls:string[]; fileUrls:string[]; authorName:string; createdAt?:any; dateLabel?:string; workDate?:string; endDate?:string; crew?:string[]; meetingTime?:string; meetingPlace?:string; mapUrl?:string; weather?:string; hospitalName?:string; hospitalPhone?:string; hospitalDistance?:string; hospitalTravelTime?:string; workDetails?:string; assignments?:string; crane?:string; disposal?:string; parking?:string; roadPermit?:string; equipment?:string; safetyNotes?:string };
type Location = { id: string; name: string; address: string; lat: number; lng: number; status: string; attention: string; aliases: string[]; records?: WorkRecord[]; isDemo?: boolean; updatedAt?: any };
type SearchSuggestion = { location: Location; context: string; score: number };

const demos = ref<Location[]>(demoLocations as Location[]);

const locations = ref<Location[]>([]);
const records = ref<WorkRecord[]>([]);
const activeId = ref('import-zhishan');
const activeRecordId = ref('');
const searchText = ref('');
const searchOpen = ref(false);
const focusedSuggestion = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const showCreate = ref(false);
const editing = ref<WorkRecord | null>(null);
const saving = ref(false);
const showLogs = ref(false);
const showPlan = ref(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'plan');
const formLocationId = ref('');
const routePoints = ref<RoutePoint[]>([]);
const routeNotes = ref('');
const routeRecord = ref<WorkRecord | null>(null);

const creatingForActive = ref(false);
const user = ref<User | null>(null);
const toast = ref('');
const mapEl = ref<HTMLElement | null>(null);
const map = shallowRef<any>(null);
const mapProvider = ref<'google'|'leaflet'>('leaflet');
const markers = shallowRef<any[]>([]);
const markerByLocation = new Map<string, { open: () => void }>();
const weatherLoading = ref(false);
const cleanupLoading = ref(false);
const importedDeleted = ref<string[]>([]);
let importedStop: undefined | (()=>void);
let authStop: undefined | (() => void);
let locationsStop: undefined | (() => void);
let recordsStop: undefined | (() => void);

const emptyRecordFields = { workDate:'', endDate:'', crew:[] as string[], meetingTime:'07:30', meetingPlace:'', mapUrl:'', weather:'', hospitalName:'', hospitalPhone:'', hospitalDistance:'', hospitalTravelTime:'', workDetails:'', assignments:'', crane:'', disposal:'', parking:'', roadPermit:'', equipment:'', safetyNotes:'' };
const form = reactive({ name:'', address:'', status:'進行中', attention:'', title:'', notes:'', imageUrls:'', youtubeUrls:'', fileUrls:'', lat:25.0684, lng:121.6158, ...structuredClone(emptyRecordFields) });
const role = computed(() => userRole(user.value));
const legacyLocationCount = computed(() => locations.value.filter(location=>!location.isDemo && records.value.some(r=>r.locationId===location.id) && records.value.filter(r=>r.locationId===location.id).every(r=>!('workDate' in r))).length);
const routeCenter = computed(() => ({lat:form.lat,lng:form.lng}));
function isImported(record:WorkRecord){return demoLocations.some(place=>place.records?.some(r=>r.id===record.id));}
function canEdit(record:WorkRecord){return role.value==='owner' || Boolean(user.value && record.authorId===user.value.uid);}
function mergeLocations(stored:Location[]){return [...stored,...demos.value.filter(d=>!stored.some(p=>p.id===d.id))];}
const activeLocation = computed(() => locations.value.find((item) => item.id === activeId.value) ?? locations.value[0]);
const activeRecords = computed(() => activeLocation.value ? locationRecords(activeLocation.value) : []);
const activeRecord = computed(() => activeRecords.value.find((record)=>record.id===activeRecordId.value) ?? activeRecords.value[0]);
function locationRecords(location:Location){
  const synced=records.value.filter(record=>record.locationId===location.id);
  const original=demos.value.find(d=>d.id===location.id)?.records || [];
  return [...synced.filter(r=>!original.some(o=>o.id===r.id)),...original.filter(r=>!importedDeleted.value.includes(r.id)).map(r=>synced.find(s=>s.id===r.id) || r)];
}
function normalizeSearch(value:string){
  return value.normalize('NFKC').toLocaleLowerCase('zh-TW').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
const suggestions = computed(() => {
  const needle = normalizeSearch(searchText.value);
  if (!needle) return locations.value.slice(0,6).map((location,index)=>({location,context:location.address,score:100-index}));
  const terms = needle.split(/\s+/).filter(Boolean);
  return locations.value.map((location):SearchSuggestion | null=>{
    const linkedRecords = locationRecords(location);
    const normalizedName = normalizeSearch(location.name);
    const normalizedAddress = normalizeSearch(location.address);
    const normalizedAliases = (location.aliases ?? []).map(normalizeSearch);
    const normalizedAttention = normalizeSearch(location.attention ?? '');
    const recordTexts = linkedRecords.map((record)=>({
      record,
      text:normalizeSearch([record.title,record.notes,record.authorName,record.workDate,record.crew?.join(' '),record.meetingPlace,record.weather,record.hospitalName,record.workDetails,record.assignments,record.crane,record.disposal,record.parking,record.roadPermit,record.equipment,record.safetyNotes].filter(Boolean).join(' '))
    }));
    const searchable = [normalizedName,normalizedAddress,...normalizedAliases,normalizedAttention,...recordTexts.map((entry)=>entry.text)].join(' ');
    if(!terms.every((term)=>searchable.includes(term))) return null;

    let score=10;
    if(normalizedName===needle) score=120;
    else if(normalizedName.startsWith(needle)) score=100;
    else if(normalizedName.includes(needle)) score=90;
    else if(normalizedAliases.some((alias)=>alias===needle)) score=80;
    else if(normalizedAliases.some((alias)=>alias.includes(needle))) score=70;
    else if(normalizedAddress.includes(needle)) score=60;
    else if(normalizedAttention.includes(needle)) score=40;
    const matchedRecord = recordTexts.find((entry)=>terms.every((term)=>entry.text.includes(term)))?.record;
    const context = matchedRecord
      ? `紀錄：${matchedRecord.title}${matchedRecord.notes ? ` · ${matchedRecord.notes}` : ''}`
      : normalizedAttention.includes(needle) ? `注意：${location.attention}` : location.address;
    return {location,context,score};
  }).filter((item):item is SearchSuggestion=>Boolean(item)).sort((a,b)=>b.score-a.score || a.location.name.localeCompare(b.location.name,'zh-TW')).slice(0,8);
});
const preferredMapProvider = getRuntimeConfig()?.mapProvider || import.meta.env.VITE_MAP_PROVIDER || 'openstreetmap';
const googleMapsApiKey = getRuntimeConfig()?.googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const googleMapId = getRuntimeConfig()?.googleMapId || import.meta.env.VITE_GOOGLE_MAP_ID;
const isGoogleReady = computed(() => preferredMapProvider === 'google' && Boolean(googleMapsApiKey));

function notify(message:string){ toast.value=message; window.setTimeout(()=>{ if(toast.value===message) toast.value=''; },2600); }
function cleanUrls(value:string){ return value.split(/\n|,/).map((v)=>v.trim()).filter((v)=>/^https?:\/\//i.test(v)); }
function escapeHtml(value:string){ return value.replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character] ?? character)); }
function linkify(value?:string){
  if(!value) return '';
  const pattern=/https?:\/\/[^\s]+/gi; let output=''; let lastIndex=0;
  for(const match of value.matchAll(pattern)){
    const start=match.index ?? 0; let url=match[0]; let trailing='';
    while(/[),.;，。！!？?]$/.test(url)){trailing=url.slice(-1)+trailing;url=url.slice(0,-1);}
    output+=escapeHtml(value.slice(lastIndex,start));
    output+=`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
    lastIndex=start+match[0].length;
  }
  return output+escapeHtml(value.slice(lastIndex));
}
function recordTabLabel(record:WorkRecord,index:number){ return record.workDate || record.dateLabel || `第 ${index+1} 天`; }
function combinedSafety(record:WorkRecord){ return [activeLocation.value?.attention,record.safetyNotes].filter(Boolean).join('\n'); }
function youtubeId(url:string){ const match=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/); return match?.[1] ?? ''; }
function fileName(url:string){ try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '開啟附件'); } catch { return '開啟附件'; } }
function locationRecordCount(place:Location){ return locationRecords(place).length; }
function createPopupContent(place:Location){
  const content=document.createElement('div'); content.className='map-popup-content';
  const title=document.createElement('strong'); title.textContent=place.name; content.appendChild(title);
  const address=document.createElement('p'); address.textContent=place.address; content.appendChild(address);
  const meta=document.createElement('span'); meta.textContent=`${locationRecordCount(place)} 筆紀錄 · ${place.status}`; content.appendChild(meta);
  if(place.attention){ const attention=document.createElement('small'); attention.textContent=`注意：${place.attention}`; content.appendChild(attention); }
  return content;
}
function selectLocation(place:Location){
  activeId.value=place.id; searchText.value=place.name; searchOpen.value=false;
  if(mapProvider.value==='leaflet') map.value?.setView?.([place.lat,place.lng],16,{animate:true});
  else { map.value?.panTo?.({lat:place.lat,lng:place.lng}); map.value?.setZoom?.(16); }
  markerByLocation.get(place.id)?.open();
}
function onSearchInput(){ searchOpen.value=true; focusedSuggestion.value=0; }
function moveSuggestion(direction:number){
  if(!searchOpen.value) searchOpen.value=true;
  if(!suggestions.value.length) return;
  focusedSuggestion.value=(focusedSuggestion.value+direction+suggestions.value.length)%suggestions.value.length;
}
function chooseFocusedSuggestion(){ const item=suggestions.value[focusedSuggestion.value]; if(item) selectLocation(item.location); }
function closeSearch(event:FocusEvent){
  const next=event.relatedTarget as Node | null;
  if(!next || !(event.currentTarget as HTMLElement).contains(next)) searchOpen.value=false;
}
function handleSearchShortcut(event:KeyboardEvent){
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault(); searchInput.value?.focus(); searchInput.value?.select(); searchOpen.value=true;
  }
}

async function initMap(){
  if(!mapEl.value) return;
  if(!isGoogleReady.value){
    mapProvider.value='leaflet';
    map.value=L.map(mapEl.value,{zoomControl:false,attributionControl:true}).setView([25.06,121.50],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(map.value);
    drawMarkers();
    return;
  }
  try{
    setOptions({key:googleMapsApiKey,v:'weekly',language:'zh-TW',region:'TW'});
    const {Map}=await importLibrary('maps') as any;
    mapProvider.value='google';
    map.value=new Map(mapEl.value,{center:{lat:25.06,lng:121.50},zoom:11,mapId:googleMapId || 'DEMO_MAP_ID',disableDefaultUI:false,zoomControl:true,gestureHandling:'greedy'});
    drawMarkers();
  }catch{ notify('Google Maps 載入失敗，已切換為預覽地圖'); }
}
async function drawMarkers(){
  if(!map.value) return;
  markers.value.forEach((marker)=>marker.setMap?.(null) ?? marker.remove?.()); markers.value=[]; markerByLocation.clear();
  if(mapProvider.value==='leaflet'){
    locations.value.forEach((place)=>{
      const count=locationRecordCount(place);
      const marker=L.marker([place.lat,place.lng],{icon:L.divIcon({className:'leaflet-tree-marker',html:`<span>${count}</span>`,iconSize:[38,38],iconAnchor:[19,36]})}).addTo(map.value);
      marker.bindTooltip(place.name,{direction:'top',offset:[0,-32]}); marker.bindPopup(createPopupContent(place),{offset:[0,-28]}); marker.on('click',()=>selectLocation(place)); markers.value.push(marker); markerByLocation.set(place.id,{open:()=>marker.openPopup()});
    });
    return;
  }
  const {Marker}=await importLibrary('marker') as any;
  const {InfoWindow}=await importLibrary('maps') as any;
  locations.value.forEach((place)=>{
    const marker=new Marker({map:map.value,position:{lat:place.lat,lng:place.lng},title:place.name,label:String(locationRecordCount(place))});
    const info=new InfoWindow({content:createPopupContent(place)});
    marker.addListener('click',()=>selectLocation(place)); markers.value.push(marker); markerByLocation.set(place.id,{open:()=>info.open({anchor:marker,map:map.value})});
  });
}
function locateMe(){ navigator.geolocation?.getCurrentPosition(({coords})=>{ map.value?.panTo({lat:coords.latitude,lng:coords.longitude}); map.value?.setZoom(16); notify('已移動到目前位置'); },()=>notify('無法取得位置，請檢查瀏覽器權限')); }
async function geocodeAddress(){
  if(!form.address) return;
  try{
    if(isGoogleReady.value){ const {Geocoder}=await importLibrary('geocoding') as any; const result=await new Geocoder().geocode({address:form.address,region:'TW'}); const point=result.results[0]?.geometry.location; if(point){form.lat=point.lat();form.lng=point.lng();notify('已自動定位地點');if(form.workDate)await fetchWeather();return;} }
    else { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&q=${encodeURIComponent(form.address)}`,{headers:{'Accept-Language':'zh-TW'}}); const result=await response.json() as {lat:string;lon:string}[]; if(result[0]){form.lat=Number(result[0].lat);form.lng=Number(result[0].lon);map.value?.setView?.([form.lat,form.lng],16);notify('已自動定位地點');if(form.workDate)await fetchWeather();return;} }
    notify('找不到這個地址，請確認後再試');
  }catch{ notify('找不到這個地址，請確認後再試'); }
}

function weatherDescription(code:number){
  if(code===0)return '晴朗'; if(code<=3)return '晴時多雲'; if(code===45||code===48)return '有霧';
  if(code>=51&&code<=57)return '毛毛雨'; if(code>=61&&code<=67)return '有雨'; if(code>=71&&code<=77)return '降雪';
  if(code>=80&&code<=82)return '陣雨'; if(code>=85&&code<=86)return '陣雪'; if(code>=95)return '雷雨'; return '天氣變化';
}
async function fetchWeather(){
  if(!form.workDate){notify('請先選擇施工日期');return;}
  const target=new Date(`${form.workDate}T12:00:00`); const today=new Date(); today.setHours(0,0,0,0); const limit=new Date(today); limit.setDate(limit.getDate()+16);
  if(target<today||target>limit){notify('預報僅提供未來 16 天，請手動填寫天氣');return;}
  weatherLoading.value=true;
  try{
    const fields='weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,wind_speed_10m_max';
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${form.lat}&longitude=${form.lng}&daily=${fields}&timezone=Asia%2FTaipei&start_date=${form.workDate}&end_date=${form.workDate}`;
    const response=await fetch(url); if(!response.ok)throw new Error('weather'); const data=await response.json() as {daily?:Record<string,number[]>};
    const daily=data.daily; const value=(key:string)=>daily?.[key]?.[0]; if(value('weather_code')===undefined)throw new Error('weather');
    form.weather=`${weatherDescription(Number(value('weather_code')))}，${value('temperature_2m_min')}–${value('temperature_2m_max')}°C，體感最高 ${value('apparent_temperature_max')}°C，降雨機率 ${value('precipitation_probability_max')}%，最大風速 ${value('wind_speed_10m_max')} km/h。`;
    notify('已取得案場當日天氣預報');
  }catch{notify('暫時無法取得預報，仍可手動填寫');}finally{weatherLoading.value=false;}
}

function resetForm(){ Object.assign(form,{name:'',address:'',status:'進行中',attention:'',title:'',notes:'',imageUrls:'',youtubeUrls:'',fileUrls:'',lat:activeLocation.value?.lat ?? 25.0684,lng:activeLocation.value?.lng ?? 121.6158,...structuredClone(emptyRecordFields)}); editing.value=null; creatingForActive.value=false; routePoints.value=[]; routeNotes.value=''; formLocationId.value=activeLocation.value?.id || ''; }
function closeForm(){ if(!saving.value) showCreate.value=false; }
function openCreate(forActive=false){ if(firebaseReady && !user.value){notify('登入後即可建立工作紀錄');return;} resetForm(); creatingForActive.value=forActive; if(!forActive)formLocationId.value=''; showCreate.value=true; }
function openPlan(){ if(role.value!=='owner'){notify('請先以 Owner 帳號登入後製作計畫書');return;} showLogs.value=false;showPlan.value=true; }
async function closePlan(){ showPlan.value=false;window.history.pushState({},'',window.location.pathname);await nextTick();map.value?.invalidateSize?.(); }
function handlePopState(){ showPlan.value=new URLSearchParams(window.location.search).get('view')==='plan'&&role.value==='owner'; }
async function openEdit(record:WorkRecord){
  if (!canEdit(record)) return;
  resetForm(); editing.value=record; formLocationId.value=record.locationId;
  const place=locations.value.find(p=>p.id===record.locationId);
  Object.assign(form,{...structuredClone(emptyRecordFields),...record,crew:[...(record.crew || [])],title:record.title,notes:record.notes,imageUrls:(record.imageUrls || []).join('\n'),youtubeUrls:(record.youtubeUrls || []).join('\n'),fileUrls:(record.fileUrls || []).join('\n'),lat:place?.lat ?? form.lat,lng:place?.lng ?? form.lng});
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
  const payload={title:form.title.trim(),notes:form.notes.trim(),workDate:form.workDate,endDate:form.endDate,crew:[...form.crew],meetingTime:form.meetingTime.trim(),meetingPlace:form.meetingPlace.trim(),mapUrl:form.mapUrl.trim(),weather:form.weather.trim(),hospitalName:form.hospitalName.trim(),hospitalPhone:form.hospitalPhone.trim(),hospitalDistance:form.hospitalDistance.trim(),hospitalTravelTime:form.hospitalTravelTime.trim(),workDetails:form.workDetails.trim(),assignments:form.assignments.trim(),crane:form.crane.trim(),disposal:form.disposal.trim(),parking:form.parking.trim(),roadPermit:form.roadPermit.trim(),equipment:form.equipment.trim(),safetyNotes:form.safetyNotes.trim(),imageUrls:cleanUrls(form.imageUrls),youtubeUrls:cleanUrls(form.youtubeUrls),fileUrls:cleanUrls(form.fileUrls),routePoints:routePoints.value.map(p=>({lat:p.lat,lng:p.lng})),routeNotes:routeNotes.value.trim(),updatedAt:serverTimestamp()};
  try{
    const batch=db?writeBatch(db):null;
    const auditRef=db?doc(collection(db,'activityLogs')):null;
    let recordId=editing.value?.id || crypto.randomUUID();
    if(editing.value){
      if(db && batch) {
        if(isImported(editing.value) && !records.value.some(r=>r.id===editing.value!.id)){
          batch.set(doc(db,'workRecords',editing.value.id),{...payload,locationId:editing.value.locationId,authorId:user.value!.uid,authorName:editing.value.authorName,dateLabel:editing.value.dateLabel || '',createdAt:serverTimestamp(),sourceImported:true,lastAuditId:auditRef!.id});
        }else batch.update(doc(db,'workRecords',editing.value.id),{...payload,lastAuditId:auditRef!.id});
      }
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
      if(!isImported(record) || records.value.some(r=>r.id===record.id)) batch.delete(doc(db,'workRecords',record.id));
      if(isImported(record)) batch.set(doc(db,'importedRecordStates',record.id),{deleted:true,updatedAt:serverTimestamp(),auditId:auditRef.id});
      batch.set(doc(db,'recordDeletions',record.id),{...auditData(user.value,'delete',record.id,record.title),auditId:auditRef.id});
      batch.set(auditRef,auditData(user.value,'delete',record.id,record.title));
      await batch.commit();
    } else { records.value=records.value.filter((item)=>item.id!==record.id); if(isImported(record)) importedDeleted.value.push(record.id); }
    notify('紀錄已刪除');
  } catch { notify('刪除失敗，請確認 Owner 帳號與資料庫權限。'); }
  finally { saving.value=false; }
}
async function purgeLegacyData(){
  if(role.value!=='owner'||!db||cleanupLoading.value)return;
  if(!window.confirm(`即將永久刪除 ${legacyLocationCount.value} 個舊格式案場及所有舊工作紀錄，確定繼續？`))return;
  cleanupLoading.value=true;
  try{
    const [locationSnapshot,recordSnapshot]=await Promise.all([getDocs(collection(db,'locations')),getDocs(collection(db,'workRecords'))]);
    const legacy=locationSnapshot.docs.filter(d=>!demoLocations.some(p=>p.id===d.id) && recordSnapshot.docs.some(r=>r.data().locationId===d.id) && recordSnapshot.docs.filter(r=>r.data().locationId===d.id).every(r=>!('workDate' in r.data())));
    const ids=new Set(legacy.map(d=>d.id));
    for(const item of recordSnapshot.docs.filter(d=>ids.has(d.data().locationId))){
      const batch=writeBatch(db), auditRef=doc(collection(db,'activityLogs'));
      const data=auditData(user.value!,'delete',item.id,item.data().title || '');
      batch.delete(item.ref); batch.set(doc(db,'recordDeletions',item.id),{...data,auditId:auditRef.id}); batch.set(auditRef,data); await batch.commit();
    }
    for(const item of legacy){const batch=writeBatch(db);batch.delete(item.ref);await batch.commit();}
    notify('舊格式案場已清除，刪除的工作紀錄已寫入操作紀錄');
  }catch(error){notify(error instanceof Error?error.message:'舊資料清理失敗');}finally{cleanupLoading.value=false;}
}

async function login(){ try{ await googleSignIn(); notify('已使用 Google 帳號登入'); }catch(error){ notify(error instanceof Error?error.message:'登入失敗'); } }
async function logout(){ if(auth){try { if(user.value) await logActivity(user.value,'logout'); } catch { notify('登出紀錄寫入失敗'); } await signOut(auth);showLogs.value=false;showCreate.value=false;showPlan.value=false;notify('已登出');} }

onMounted(async()=>{
  window.addEventListener('keydown',handleSearchShortcut);
  window.addEventListener('popstate',handlePopState);
  locations.value=demos.value;
  if(auth) authStop=onAuthStateChanged(auth,(account)=>{const previous=user.value?.uid;user.value=account;if(!account){showLogs.value=false;showCreate.value=false;showPlan.value=false;}else if(userRole(account)!=='owner'){showPlan.value=false;}if(account && account.uid!==previous) logActivity(account,'login').catch(()=>notify('登入成功，但登入紀錄寫入失敗，請檢查資料庫權限'));});
  if(db){
    importedStop=onSnapshot(collection(db,'importedRecordStates'), snapshot=>{importedDeleted.value=snapshot.docs.filter(d=>d.data().deleted).map(d=>d.id);},()=>notify('匯入紀錄同步失敗，請重新整理'));
    locationsStop=onSnapshot(query(collection(db,'locations'),orderBy('updatedAt','desc')),(snapshot)=>{const stored=snapshot.docs.map((d)=>({id:d.id,...d.data()} as Location));locations.value=mergeLocations(stored);if(!activeId.value&&locations.value[0])activeId.value=locations.value[0].id;drawMarkers();},()=>{locations.value=demos.value;notify('目前顯示展示資料');});
    recordsStop=onSnapshot(query(collection(db,'workRecords'),orderBy('createdAt','desc')),(snapshot)=>{records.value=snapshot.docs.map((d)=>({id:d.id,...d.data()} as WorkRecord));},()=>notify('工作紀錄同步暫時中斷'));
  }
  await nextTick(); initMap();
});
onUnmounted(()=>{window.removeEventListener('keydown',handleSearchShortcut);window.removeEventListener('popstate',handlePopState);authStop?.();locationsStop?.();recordsStop?.();importedStop?.();map.value?.remove?.();});
watch([()=>locations.value.length,()=>records.value.length],()=>drawMarkers());
watch(()=>`${activeId.value}:${activeRecords.value.map((record)=>record.id).join(',')}`,()=>{activeRecordId.value=activeRecords.value[0]?.id ?? '';},{immediate:true});
</script>

<template>
  <main class="app-shell">
    <PlanBook v-if="showPlan && role==='owner'" :account="user!" @back="closePlan" />
    <header v-else class="topbar">
      <button class="brand" @click="activeId=locations[0]?.id"><span class="brand-pin">⌖</span><span><strong>TreeServ Geo</strong><small>案場工作紀錄</small></span></button>
      <div class="search-wrap" @focusout="closeSearch">
        <label class="global-search"><span>⌕</span><input ref="searchInput" v-model="searchText" @focus="searchOpen=true" @input="onSearchInput" @keydown.down.prevent="moveSuggestion(1)" @keydown.up.prevent="moveSuggestion(-1)" @keydown.enter.prevent="chooseFocusedSuggestion" @keydown.escape="searchOpen=false" placeholder="搜尋地點、地址、注意事項或紀錄…" aria-label="搜尋已記錄地點" role="combobox" aria-autocomplete="list" :aria-expanded="searchOpen" aria-controls="location-result"><kbd>⌘ K</kbd></label>
        <div v-if="searchOpen" id="location-result" class="suggestions" role="listbox"><button v-for="(item,index) in suggestions" :key="item.location.id" :class="{focused:index===focusedSuggestion}" role="option" :aria-selected="index===focusedSuggestion" @mouseenter="focusedSuggestion=index" @click="selectLocation(item.location)"><span class="mini-pin">⌖</span><span><strong>{{item.location.name}}</strong><small>{{item.context}}</small></span><em>{{locationRecordCount(item.location)}} 筆</em></button><p v-if="!suggestions.length">找不到符合「{{searchText.trim()}}」的地點或紀錄</p></div>
      </div>
      <button v-if="role==='owner'" class="audit-nav" @click="showLogs=!showLogs">{{showLogs?'返回地圖':'操作紀錄'}}</button>
      <button class="primary-action" @click="openCreate(false)"><span>＋</span>建立工作紀錄</button>
      <button class="plan-action" @click="openPlan"><span>＋</span>製作計畫書</button>
      <button v-if="!user" class="login-button" @click="login">使用 Google 登入</button>
      <button v-else class="account-button" @click="logout" :title="`${user.email}（點擊登出）`">{{user.displayName?.slice(0,1) || user.email?.slice(0,1)}}<span>{{role==='owner'?'Owner':'User'}}</span></button>
    </header>

    <ActivityLog v-if="!showPlan && showLogs && role==='owner'" />
    <section v-show="!showPlan && !showLogs" class="workspace">
      <aside class="places-panel">
        <div class="panel-heading"><div><small>工作地點</small><strong>{{locations.length}} 個案場</strong></div><span class="sync-state"><i/>{{firebaseReady?'即時同步':'離線預覽'}}</span></div>
        <div class="place-list"><button v-for="(place,index) in locations" :key="place.id" :class="['place-row',{active:place.id===activeLocation?.id,warn:place.status.includes('注意')} ]" @click="selectLocation(place)"><span class="place-index">{{String(index+1).padStart(2,'0')}}</span><span><strong>{{place.name}}</strong><small>{{locationRecordCount(place)}} 筆紀錄 · {{place.status}}</small></span><b v-if="place.status.includes('注意')">!</b></button></div>
        <div class="permission-card"><strong>權限說明</strong><p><b>訪客</b> 可查看；<b>User</b> 可建立與編輯；<b>Owner</b> 可完整管理與刪除。</p><button v-if="role==='owner'&&legacyLocationCount" class="cleanup-button" :disabled="cleanupLoading" @click="purgeLegacyData">{{cleanupLoading?'清理中…':`清除 ${legacyLocationCount} 個舊格式案場`}}</button></div>
      </aside>

      <div class="map-stage">
        <div ref="mapEl" class="google-map"></div>
        <div class="map-tools"><button @click="map?.setZoom((map?.getZoom()||14)+1)">＋</button><button @click="map?.setZoom((map?.getZoom()||14)-1)">−</button><button @click="locateMe" title="移動到目前位置">◎</button></div>
        <div class="map-legend"><i/> {{isGoogleReady?'Google Maps':'OpenStreetMap'}} · {{firebaseReady?'Firestore 即時同步':'離線預覽'}}</div>
      </div>

      <aside v-if="activeLocation" class="record-panel">
        <div class="record-head"><small>案場紀錄</small><span>{{activeLocation.status}}</span></div>
        <h1>{{activeLocation.name}}</h1>
        <p class="address" v-html="linkify(activeLocation.address)"></p>
        <div class="record-summary"><span>{{activeRecords.length}} 天紀錄</span><button v-if="role!=='guest'" @click="openCreate(true)">＋ 新增</button></div>

        <div v-if="activeRecords.length>1" class="day-tabs" role="tablist" aria-label="選擇施工日期">
          <button v-for="(record,index) in activeRecords" :key="record.id" type="button" role="tab" :aria-selected="record.id===activeRecord?.id" :class="{active:record.id===activeRecord?.id}" @click="activeRecordId=record.id"><span>{{recordTabLabel(record,index)}}</span><small>第 {{index+1}} 天</small></button>
        </div>

        <article v-if="activeRecord" class="record-sheet">
          <header class="record-title"><time>{{activeRecord.workDate || activeRecord.dateLabel || activeRecord.createdAt?.toDate?.().toLocaleString('zh-TW') || '最近更新'}}<template v-if="activeRecord.endDate"> 至 {{activeRecord.endDate}}</template></time><h2>{{activeRecord.title}}</h2><p v-html="linkify(activeRecord.notes)"></p></header>
          <div class="record-lines">
            <div v-if="combinedSafety(activeRecord)" class="record-line safety-line"><strong>安全與進場注意</strong><p v-html="linkify(combinedSafety(activeRecord))"></p></div>
            <div v-if="activeRecord.meetingTime||activeRecord.meetingPlace||activeRecord.mapUrl" class="record-line"><strong>集合</strong><p><b>{{activeRecord.meetingTime||'時間待確認'}}</b><template v-if="activeRecord.meetingPlace">　<span v-html="linkify(activeRecord.meetingPlace)"></span></template><br v-if="activeRecord.mapUrl"><a v-if="activeRecord.mapUrl" :href="activeRecord.mapUrl" target="_blank" rel="noopener noreferrer">開啟地圖定位</a></p></div>
            <div v-if="activeRecord.crew?.length" class="record-line"><strong>出席人員</strong><p class="crew-inline"><span v-for="member in activeRecord.crew" :key="member">{{member}}</span></p></div>
            <div v-if="activeRecord.weather" class="record-line"><strong>當日天氣</strong><p v-html="linkify(activeRecord.weather)"></p></div>
            <div v-if="activeRecord.hospitalName" class="record-line"><strong>緊急醫療</strong><p><b>{{activeRecord.hospitalName}}</b><template v-if="activeRecord.hospitalPhone">　{{activeRecord.hospitalPhone}}</template><br><span>{{[activeRecord.hospitalDistance,activeRecord.hospitalTravelTime].filter(Boolean).join('　')}}</span></p></div>
            <div v-if="activeRecord.workDetails" class="record-line"><strong>工作內容</strong><p v-html="linkify(activeRecord.workDetails)"></p></div>
            <div v-if="activeRecord.assignments" class="record-line"><strong>人員分組／協力</strong><p v-html="linkify(activeRecord.assignments)"></p></div>
            <div v-if="activeRecord.crane" class="record-line"><strong>吊車</strong><p v-html="linkify(activeRecord.crane)"></p></div>
            <div v-if="activeRecord.disposal" class="record-line"><strong>清運</strong><p v-html="linkify(activeRecord.disposal)"></p></div>
            <div v-if="activeRecord.parking" class="record-line"><strong>停車／卸裝備</strong><p v-html="linkify(activeRecord.parking)"></p></div>
            <div v-if="activeRecord.roadPermit" class="record-line"><strong>路權</strong><p v-html="linkify(activeRecord.roadPermit)"></p></div>
            <div v-if="activeRecord.equipment" class="record-line"><strong>裝備與工具</strong><p v-html="linkify(activeRecord.equipment)"></p></div>
          </div>
          <div v-if="activeRecord.imageUrls?.length" class="image-grid"><img v-for="url in activeRecord.imageUrls" :key="url" :src="url" :alt="`${activeRecord.title} 現場照片`" loading="lazy"></div>
          <div v-for="url in activeRecord.youtubeUrls" :key="url" class="video"><iframe v-if="youtubeId(url)" :src="`https://www.youtube-nocookie.com/embed/${youtubeId(url)}`" title="工作紀錄影片" loading="lazy" allowfullscreen/></div>
          <div class="files"><a v-for="url in activeRecord.fileUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer"><span>↗</span>{{fileName(url)}}</a></div>
          <button v-if="activeRecord.routePoints?.length" class="route-view-button" @click="routeRecord=activeRecord">查看 A → B 進場路線</button>
          <div class="record-meta"><span>由 {{activeRecord.authorName}} 記錄</span><div v-if="canEdit(activeRecord)"><button :disabled="saving" @click="openEdit(activeRecord)">編輯</button><button v-if="role==='owner'" class="danger" :disabled="saving" @click="removeRecord(activeRecord)">刪除</button></div><span v-else-if="activeLocation?.isDemo" class="demo-readonly">匯入紀錄 · Owner 可管理</span></div>
        </article>
        <div v-else class="empty-state"><span>⌖</span><strong>尚無工作紀錄</strong><p>登入後新增第一筆，讓下一位到場的人少走冤枉路。</p></div>
      </aside>
    </section>

    <div v-if="showCreate && !showPlan" class="modal-layer" @mousedown.self="closeForm">
      <form class="record-modal" @submit.prevent="saveRecord">
        <div class="modal-head"><div><small>{{editing?'更新紀錄':'新增案場紀錄'}}</small><h2>{{editing?'編輯工作內容':'建立工作紀錄'}}</h2></div><button type="button" @click="closeForm">×</button></div>
        <div class="form-scroll"><fieldset class="record-fields" :disabled="saving">
          <section v-if="!editing&&!creatingForActive" class="form-section"><h3>案場位置</h3><label>地點名稱<input v-model="form.name" required placeholder="例如：東湖國小"></label><div class="field-action"><label>地址<input v-model="form.address" required placeholder="輸入地址後自動定位" @blur="geocodeAddress"></label><button type="button" @click="geocodeAddress">定位</button></div><div class="form-row"><label>狀態<select v-model="form.status"><option>進行中</option><option>待複查</option><option>已完成</option><option>注意事項</option></select></label><label>座標<input :value="`${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`" readonly></label></div><label>Google Maps 分享網址<input v-model="form.mapUrl" type="url" placeholder="https://maps.app.goo.gl/..."></label><label>案場固定注意事項<textarea v-model="form.attention" rows="2" placeholder="門禁、危險區域、聯絡窗口…"/></label></section>

          <section class="form-section"><h3>日期、集合與人員</h3><div class="form-row"><label>施工日期<input v-model="form.workDate" type="date"></label><label>結束日期 <small>連續施工時填寫</small><input v-model="form.endDate" type="date"></label></div><div class="form-row"><label>集合時間<input v-model="form.meetingTime" placeholder="07:30"></label><label>集合地點<input v-model="form.meetingPlace" placeholder="校門、側門或卸裝備點"></label></div><label v-if="editing||creatingForActive">Google Maps 分享網址<input v-model="form.mapUrl" type="url" placeholder="https://maps.app.goo.gl/..."></label><fieldset class="crew-field"><legend>出席人員 <small>已整理群組中出現的 21 位縮寫</small></legend><div class="crew-grid"><label v-for="member in crewOptions" :key="member" :class="{checked:form.crew.includes(member)}"><input v-model="form.crew" type="checkbox" :value="member"><span>{{member}}</span></label></div></fieldset><label>人員分組／協力廠商<textarea v-model="form.assignments" rows="3" placeholder="例如：吊車組：丸、肯、修；外部團隊：stone 哥團隊"/></label></section>

          <section class="form-section"><h3>天氣與緊急醫療</h3><div class="weather-field"><label>當日天氣預報<textarea v-model="form.weather" rows="2" placeholder="定位並選擇未來 16 天內日期，可自動取得預報"/></label><button type="button" :disabled="weatherLoading" @click="fetchWeather">{{weatherLoading?'取得中…':'依定位取得預報'}}</button></div><div class="form-row"><label>最近醫院<input v-model="form.hospitalName" placeholder="醫院名稱"></label><label>醫院電話<input v-model="form.hospitalPhone" inputmode="tel" placeholder="02-12345678"></label></div><div class="form-row"><label>距離<input v-model="form.hospitalDistance" placeholder="例如：3.2 公里"></label><label>車程<input v-model="form.hospitalTravelTime" placeholder="例如：10 分鐘"></label></div></section>

          <section class="form-section"><h3>工作安排</h3><label>紀錄標題<input v-model="form.title" required placeholder="例如：榕樹局部退縮與微疏枝"></label><label>工作摘要<textarea v-model="form.notes" required rows="3" placeholder="本次任務重點，用一至三句話摘要"/></label><label>詳細工作內容<textarea v-model="form.workDetails" rows="5" placeholder="樹種、棵數、修剪或伐除方式、計畫書重點…"/></label><div class="form-row"><label>吊車安排<textarea v-model="form.crane" rows="2" placeholder="車輛、人員、進場時間"></textarea></label><label>清運安排<textarea v-model="form.disposal" rows="2" placeholder="小夾／大夾、時間、堆置方式"></textarea></label></div><label>停車／卸裝備動線<textarea v-model="form.parking" rows="3" placeholder="進場門、卸裝備點、停車位置及步行距離"/></label><label>路權<textarea v-model="form.roadPermit" rows="2" placeholder="路權日期、範圍或限制"/></label><label>裝備與工具<textarea v-model="form.equipment" rows="4" placeholder="攀樹裝備、PPE、Rigging、鏈鋸、角錐、警示帶…"/></label><label>安全與注意事項<textarea v-model="form.safetyNotes" rows="4" placeholder="學生與行人動線、雨天、高溫、玻璃設施、其他廠商…"/></label></section>

          <section class="form-section"><h3>A → B 進場路線</h3><RouteMap v-model="routePoints" :editable="!saving" :center="routeCenter" /><label>進場說明<textarea v-model="routeNotes" rows="2" placeholder="例如：由大馬路右轉進場，禁止走北側小巷。"/></label></section>
          <section class="form-section"><h3>媒體與附件</h3><label>圖片網址 <small>一行一個或以逗號分隔</small><textarea v-model="form.imageUrls" rows="2" placeholder="https://example.com/photo.jpg"/></label><label>YouTube 網址<textarea v-model="form.youtubeUrls" rows="2" placeholder="https://youtube.com/watch?v=..."/></label><label>檔案網址<textarea v-model="form.fileUrls" rows="2" placeholder="https://example.com/report.pdf"/></label></section>
        </fieldset></div>
        <div class="modal-actions"><button type="button" @click="closeForm">取消</button><button class="save" type="submit" :disabled="saving">{{saving?'儲存中…':editing?'儲存變更':'建立紀錄'}}</button></div>
      </form>
    </div>
    <div v-if="routeRecord && !showPlan" class="modal-layer" @mousedown.self="routeRecord=null"><section class="record-modal" role="dialog" aria-modal="true" aria-label="進場路線"><div class="modal-head"><h2>{{routeRecord.title}} · 進場路線</h2><button @click="routeRecord=null" aria-label="關閉路線">×</button></div><div class="form-scroll"><RouteMap :model-value="routeRecord.routePoints || []" :center="routeRecord.routePoints?.[0] || {lat:25.0684,lng:121.6158}" /><p class="route-instructions">{{routeRecord.routeNotes || '請依箭頭方向進場。'}}</p></div></section></div>
    <div v-if="toast" class="toast" role="status">{{toast}}</div>
  </main>
</template>
