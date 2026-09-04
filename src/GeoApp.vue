<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { User } from 'firebase/auth';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db, firebaseReady, googleSignIn, onAuthStateChanged, signOut, userRole, addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from './firebase';
import { getRuntimeConfig } from './runtime-config';
import { crewOptions, demoLocations } from './demo-data';

type WorkRecord = { id:string; locationId:string; title:string; notes:string; imageUrls:string[]; youtubeUrls:string[]; fileUrls:string[]; authorName:string; createdAt?:any; dateLabel?:string; workDate?:string; endDate?:string; crew?:string[]; meetingTime?:string; meetingPlace?:string; mapUrl?:string; weather?:string; hospitalName?:string; hospitalPhone?:string; hospitalDistance?:string; hospitalTravelTime?:string; workDetails?:string; assignments?:string; crane?:string; disposal?:string; parking?:string; roadPermit?:string; equipment?:string; safetyNotes?:string };
type Location = { id: string; name: string; address: string; lat: number; lng: number; status: string; attention: string; aliases: string[]; records?: WorkRecord[]; isDemo?: boolean; updatedAt?: any };
type SearchSuggestion = { location: Location; context: string; score: number };

const demos = ref<Location[]>(demoLocations as Location[]);

const locations = ref<Location[]>([]);
const records = ref<WorkRecord[]>([]);
const activeId = ref('import-zhishan');
const searchText = ref('');
const searchOpen = ref(false);
const focusedSuggestion = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const showCreate = ref(false);
const editing = ref<WorkRecord | null>(null);
const creatingForActive = ref(false);
const user = ref<User | null>(null);
const toast = ref('');
const mapEl = ref<HTMLElement | null>(null);
const map = ref<any>(null);
const mapProvider = ref<'google'|'leaflet'>('leaflet');
const markers = ref<any[]>([]);
const markerByLocation = new Map<string, { open: () => void }>();
const weatherLoading = ref(false);
let authStop: undefined | (() => void);
let locationsStop: undefined | (() => void);
let recordsStop: undefined | (() => void);

const emptyRecordFields = { workDate:'', endDate:'', crew:[] as string[], meetingTime:'07:30', meetingPlace:'', mapUrl:'', weather:'', hospitalName:'', hospitalPhone:'', hospitalDistance:'', hospitalTravelTime:'', workDetails:'', assignments:'', crane:'', disposal:'', parking:'', roadPermit:'', equipment:'', safetyNotes:'' };
const form = reactive({ name:'', address:'', status:'進行中', attention:'', title:'', notes:'', imageUrls:'', youtubeUrls:'', fileUrls:'', lat:25.0684, lng:121.6158, ...structuredClone(emptyRecordFields) });
const role = computed(() => userRole(user.value));
const activeLocation = computed(() => locations.value.find((item) => item.id === activeId.value) ?? locations.value[0]);
const activeRecords = computed(() => activeLocation.value ? locationRecords(activeLocation.value) : []);
function locationRecords(location:Location){
  if(location.isDemo) return location.records ?? [];
  const synced = records.value.filter((record) => record.locationId === location.id);
  return synced;
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
    else { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&q=${encodeURIComponent(form.address)}`,{headers:{'Accept-Language':'zh-TW'}}); const result=await response.json(); if(result[0]){form.lat=Number(result[0].lat);form.lng=Number(result[0].lon);map.value?.setView?.([form.lat,form.lng],16);notify('已自動定位地點');if(form.workDate)await fetchWeather();return;} }
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
    const response=await fetch(url); if(!response.ok)throw new Error('weather'); const data=await response.json();
    const daily=data.daily; const value=(key:string)=>daily?.[key]?.[0]; if(value('weather_code')===undefined)throw new Error('weather');
    form.weather=`${weatherDescription(Number(value('weather_code')))}，${value('temperature_2m_min')}–${value('temperature_2m_max')}°C，體感最高 ${value('apparent_temperature_max')}°C，降雨機率 ${value('precipitation_probability_max')}%，最大風速 ${value('wind_speed_10m_max')} km/h。`;
    notify('已取得案場當日天氣預報');
  }catch{notify('暫時無法取得預報，仍可手動填寫');}finally{weatherLoading.value=false;}
}

function resetForm(){ Object.assign(form,{name:'',address:'',status:'進行中',attention:'',title:'',notes:'',imageUrls:'',youtubeUrls:'',fileUrls:'',lat:25.0684,lng:121.6158,...structuredClone(emptyRecordFields)}); editing.value=null; creatingForActive.value=false; }
function openCreate(forActive=false){
  if(firebaseReady && !user.value){ notify('登入後即可建立工作紀錄'); return; }
  if(forActive && activeLocation.value?.isDemo){ notify('群組匯入紀錄為唯讀，請從上方建立新案場'); return; }
  resetForm();
  creatingForActive.value=forActive;
  if(forActive&&activeLocation.value){Object.assign(form,{name:'',address:activeLocation.value.address,lat:activeLocation.value.lat,lng:activeLocation.value.lng,mapUrl:''});}
  showCreate.value=true;
}
function openEdit(record:WorkRecord){
  if(activeLocation.value?.isDemo){ notify('群組匯入紀錄為唯讀資料'); return; }
  creatingForActive.value=false; editing.value=record; Object.assign(form,{...structuredClone(emptyRecordFields),...record,crew:[...(record.crew??[])],imageUrls:record.imageUrls.join('\n'),youtubeUrls:record.youtubeUrls.join('\n'),fileUrls:record.fileUrls.join('\n')}); showCreate.value=true;
}

async function saveRecord(){
  if(!form.title.trim() || !form.notes.trim()){ notify('請填寫紀錄標題與工作內容'); return; }
  const payload={title:form.title.trim(),notes:form.notes.trim(),workDate:form.workDate,endDate:form.endDate,crew:[...form.crew],meetingTime:form.meetingTime.trim(),meetingPlace:form.meetingPlace.trim(),mapUrl:form.mapUrl.trim(),weather:form.weather.trim(),hospitalName:form.hospitalName.trim(),hospitalPhone:form.hospitalPhone.trim(),hospitalDistance:form.hospitalDistance.trim(),hospitalTravelTime:form.hospitalTravelTime.trim(),workDetails:form.workDetails.trim(),assignments:form.assignments.trim(),crane:form.crane.trim(),disposal:form.disposal.trim(),parking:form.parking.trim(),roadPermit:form.roadPermit.trim(),equipment:form.equipment.trim(),safetyNotes:form.safetyNotes.trim(),imageUrls:cleanUrls(form.imageUrls),youtubeUrls:cleanUrls(form.youtubeUrls),fileUrls:cleanUrls(form.fileUrls),authorId:user.value?.uid ?? 'demo',authorName:user.value?.displayName || user.value?.email || '示範使用者',updatedAt:serverTimestamp()};
  try{
    if(editing.value){
      if(db) await updateDoc(doc(db,'workRecords',editing.value.id),payload);
      else Object.assign(editing.value,payload);
      notify('工作紀錄已更新');
    }else{
      let locationId=activeLocation.value?.id;
      if(form.name.trim()){
        locationId=crypto.randomUUID();
        const locationPayload={name:form.name.trim(),address:form.address.trim(),lat:form.lat,lng:form.lng,status:form.status,attention:form.attention.trim(),aliases:[],createdBy:user.value?.uid ?? 'demo',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
        if(db) await setDoc(doc(db,'locations',locationId),locationPayload);
        else locations.value.unshift({id:locationId,...locationPayload,records:[]} as Location);
      }
      const recordPayload={...payload,locationId,createdAt:serverTimestamp()};
      if(db) await addDoc(collection(db,'workRecords'),recordPayload);
      else records.value.unshift({id:crypto.randomUUID(),...recordPayload,dateLabel:'剛剛'} as WorkRecord);
      if(locationId) activeId.value=locationId;
      notify('工作紀錄已建立');
    }
    showCreate.value=false; resetForm(); await nextTick(); drawMarkers();
  }catch(error){ notify(error instanceof Error ? error.message : '儲存失敗，請稍後再試'); }
}
async function removeRecord(record:WorkRecord){
  if(role.value!=='owner') return;
  if(!window.confirm(`確定刪除「${record.title}」？`)) return;
  if(db) await deleteDoc(doc(db,'workRecords',record.id)); else records.value=records.value.filter((item)=>item.id!==record.id);
  notify('紀錄已刪除');
}
async function login(){ try{ await googleSignIn(); notify('已使用 Google 帳號登入'); }catch(error){ notify(error instanceof Error?error.message:'登入失敗'); } }
async function logout(){ if(auth){await signOut(auth);notify('已登出');} }

onMounted(async()=>{
  window.addEventListener('keydown',handleSearchShortcut);
  locations.value=demos.value;
  if(auth) authStop=onAuthStateChanged(auth,(account)=>{user.value=account;});
  if(db){
    locationsStop=onSnapshot(query(collection(db,'locations'),orderBy('updatedAt','desc')),(snapshot)=>{const stored=snapshot.docs.map((d)=>({id:d.id,...d.data()} as Location));locations.value=[...stored,...demos.value];if(!activeId.value&&locations.value[0])activeId.value=locations.value[0].id;drawMarkers();},()=>{locations.value=demos.value;notify('目前顯示展示資料');});
    recordsStop=onSnapshot(query(collection(db,'workRecords'),orderBy('createdAt','desc')),(snapshot)=>{records.value=snapshot.docs.map((d)=>({id:d.id,...d.data()} as WorkRecord));},()=>notify('工作紀錄同步暫時中斷'));
  }
  await nextTick(); initMap();
});
onUnmounted(()=>{window.removeEventListener('keydown',handleSearchShortcut);authStop?.();locationsStop?.();recordsStop?.();});
watch([()=>locations.value.length,()=>records.value.length],()=>drawMarkers());
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <button class="brand" @click="activeId=locations[0]?.id"><span class="brand-pin">⌖</span><span><strong>TreeServ Geo</strong><small>案場工作紀錄</small></span></button>
      <div class="search-wrap" @focusout="closeSearch">
        <label class="global-search"><span>⌕</span><input ref="searchInput" v-model="searchText" @focus="searchOpen=true" @input="onSearchInput" @keydown.down.prevent="moveSuggestion(1)" @keydown.up.prevent="moveSuggestion(-1)" @keydown.enter.prevent="chooseFocusedSuggestion" @keydown.escape="searchOpen=false" placeholder="搜尋地點、地址、注意事項或紀錄…" aria-label="搜尋已記錄地點" role="combobox" aria-autocomplete="list" :aria-expanded="searchOpen" aria-controls="location-result"><kbd>⌘ K</kbd></label>
        <div v-if="searchOpen" id="location-result" class="suggestions" role="listbox"><button v-for="(item,index) in suggestions" :key="item.location.id" :class="{focused:index===focusedSuggestion}" role="option" :aria-selected="index===focusedSuggestion" @mouseenter="focusedSuggestion=index" @click="selectLocation(item.location)"><span class="mini-pin">⌖</span><span><strong>{{item.location.name}}</strong><small>{{item.context}}</small></span><em>{{locationRecordCount(item.location)}} 筆</em></button><p v-if="!suggestions.length">找不到符合「{{searchText.trim()}}」的地點或紀錄</p></div>
      </div>
      <button class="primary-action" @click="openCreate(false)"><span>＋</span>建立工作紀錄</button>
      <button v-if="!user" class="login-button" @click="login">使用 Google 登入</button>
      <button v-else class="account-button" @click="logout" :title="`${user.email}（點擊登出）`">{{user.displayName?.slice(0,1) || user.email?.slice(0,1)}}<span>{{role==='owner'?'Owner':'User'}}</span></button>
    </header>

    <section class="workspace">
      <aside class="places-panel">
        <div class="panel-heading"><div><small>工作地點</small><strong>{{locations.length}} 個案場</strong></div><span class="sync-state"><i/>{{firebaseReady?'即時同步':'離線預覽'}}</span></div>
        <div class="place-list"><button v-for="(place,index) in locations" :key="place.id" :class="['place-row',{active:place.id===activeLocation?.id,warn:place.status.includes('注意')} ]" @click="selectLocation(place)"><span class="place-index">{{String(index+1).padStart(2,'0')}}</span><span><strong>{{place.name}}</strong><small><i v-if="place.isDemo" class="demo-tag">群組匯入</i>{{locationRecordCount(place)}} 筆紀錄 · {{place.status}}</small></span><b v-if="place.status.includes('注意')">!</b></button></div>
        <div class="permission-card"><strong>權限說明</strong><p><b>訪客</b> 可查看；<b>User</b> 可建立與編輯；<b>Owner</b> 可完整管理與刪除。</p></div>
      </aside>

      <div class="map-stage">
        <div ref="mapEl" class="google-map"></div>
        <div class="map-tools"><button @click="map?.setZoom((map?.getZoom()||14)+1)">＋</button><button @click="map?.setZoom((map?.getZoom()||14)-1)">−</button><button @click="locateMe" title="移動到目前位置">◎</button></div>
        <div class="map-legend"><i/> {{isGoogleReady?'Google Maps':'OpenStreetMap'}} · {{firebaseReady?'Firestore 即時同步':'離線預覽'}}</div>
      </div>

      <aside v-if="activeLocation" class="record-panel">
        <div class="record-head"><small>目前位置{{activeLocation.isDemo?' · 群組匯入紀錄':''}}</small><span>{{activeLocation.status}}</span></div><h1>{{activeLocation.name}}</h1><p class="address">{{activeLocation.address}}</p><div class="record-summary"><span>{{activeRecords.length}} 筆紀錄</span><button v-if="role!=='guest'" @click="openCreate(true)">＋ 新增</button></div>
        <div v-if="activeLocation.attention" class="attention"><b>!</b><div><strong>進場前注意</strong><p>{{activeLocation.attention}}</p></div></div>
        <div class="timeline-title"><strong>工作時間軸</strong><small>最新在前</small></div>
        <div v-if="activeRecords.length" class="timeline">
          <article v-for="record in activeRecords" :key="record.id"><i/><time>{{record.workDate || record.dateLabel || record.createdAt?.toDate?.().toLocaleString('zh-TW') || '最近更新'}}<template v-if="record.endDate"> — {{record.endDate}}</template></time><strong>{{record.title}}</strong><p>{{record.notes}}</p>
            <div v-if="record.meetingTime||record.meetingPlace||record.mapUrl" class="brief-grid"><div><small>集合</small><b>{{record.meetingTime||'時間待確認'}}</b><span>{{record.meetingPlace||'地點待確認'}}</span></div><a v-if="record.mapUrl" :href="record.mapUrl" target="_blank" rel="noopener noreferrer">開啟定位 ↗</a></div>
            <div v-if="record.crew?.length" class="record-block"><small>出席人員 · {{record.crew.length}} 人</small><div class="crew-chips"><span v-for="member in record.crew" :key="member">{{member}}</span></div></div>
            <div v-if="record.weather" class="info-callout weather-card"><small>當日天氣</small><p>{{record.weather}}</p></div>
            <div v-if="record.hospitalName" class="info-callout hospital-card"><small>緊急醫療</small><b>{{record.hospitalName}}<template v-if="record.hospitalPhone"> · {{record.hospitalPhone}}</template></b><span>{{[record.hospitalDistance,record.hospitalTravelTime].filter(Boolean).join(' · ')}}</span></div>
            <div v-if="record.workDetails" class="record-block"><small>工作內容</small><p>{{record.workDetails}}</p></div>
            <div v-if="record.assignments" class="record-block"><small>人員分組／協力廠商</small><p>{{record.assignments}}</p></div>
            <div v-if="record.crane||record.disposal" class="detail-pair"><div v-if="record.crane"><small>吊車</small><p>{{record.crane}}</p></div><div v-if="record.disposal"><small>清運</small><p>{{record.disposal}}</p></div></div>
            <div v-if="record.parking" class="record-block"><small>停車／卸裝備動線</small><p>{{record.parking}}</p></div>
            <div v-if="record.roadPermit" class="record-block"><small>路權</small><p>{{record.roadPermit}}</p></div>
            <div v-if="record.equipment" class="record-block"><small>裝備與工具</small><p>{{record.equipment}}</p></div>
            <div v-if="record.safetyNotes" class="info-callout safety-card"><small>安全與注意事項</small><p>{{record.safetyNotes}}</p></div>
            <div v-if="record.imageUrls?.length" class="image-grid"><img v-for="url in record.imageUrls" :key="url" :src="url" :alt="`${record.title} 現場照片`" loading="lazy"></div><div v-for="url in record.youtubeUrls" :key="url" class="video"><iframe v-if="youtubeId(url)" :src="`https://www.youtube-nocookie.com/embed/${youtubeId(url)}`" title="工作紀錄影片" loading="lazy" allowfullscreen/></div><div class="files"><a v-for="url in record.fileUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer"><span>↗</span>{{fileName(url)}}</a></div><div class="record-meta"><span>由 {{record.authorName}} 記錄</span><div v-if="role!=='guest'&&!activeLocation?.isDemo"><button @click="openEdit(record)">編輯</button><button v-if="role==='owner'" class="danger" @click="removeRecord(record)">刪除</button></div><span v-else-if="activeLocation?.isDemo" class="demo-readonly">群組匯入 · 唯讀</span></div>
          </article>
        </div><div v-else class="empty-state"><span>⌖</span><strong>尚無工作紀錄</strong><p>登入後新增第一筆，讓下一位到場的人少走冤枉路。</p></div>
      </aside>
    </section>

    <div v-if="showCreate" class="modal-layer" @mousedown.self="showCreate=false">
      <form class="record-modal" @submit.prevent="saveRecord">
        <div class="modal-head"><div><small>{{editing?'更新紀錄':'新增案場紀錄'}}</small><h2>{{editing?'編輯工作內容':'建立工作紀錄'}}</h2></div><button type="button" @click="showCreate=false">×</button></div>
        <div class="form-scroll">
          <section v-if="!editing&&!creatingForActive" class="form-section"><h3>案場位置</h3><label>地點名稱<input v-model="form.name" required placeholder="例如：東湖國小"></label><div class="field-action"><label>地址<input v-model="form.address" required placeholder="輸入地址後自動定位" @blur="geocodeAddress"></label><button type="button" @click="geocodeAddress">定位</button></div><div class="form-row"><label>狀態<select v-model="form.status"><option>進行中</option><option>待複查</option><option>已完成</option><option>注意事項</option></select></label><label>座標<input :value="`${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`" readonly></label></div><label>Google Maps 分享網址<input v-model="form.mapUrl" type="url" placeholder="https://maps.app.goo.gl/..."></label><label>案場固定注意事項<textarea v-model="form.attention" rows="2" placeholder="門禁、危險區域、聯絡窗口…"/></label></section>

          <section class="form-section"><h3>日期、集合與人員</h3><div class="form-row"><label>施工日期<input v-model="form.workDate" type="date"></label><label>結束日期 <small>連續施工時填寫</small><input v-model="form.endDate" type="date"></label></div><div class="form-row"><label>集合時間<input v-model="form.meetingTime" placeholder="07:30"></label><label>集合地點<input v-model="form.meetingPlace" placeholder="校門、側門或卸裝備點"></label></div><label v-if="editing||creatingForActive">Google Maps 分享網址<input v-model="form.mapUrl" type="url" placeholder="https://maps.app.goo.gl/..."></label><fieldset class="crew-field"><legend>出席人員 <small>已整理群組中出現的 21 位縮寫</small></legend><div class="crew-grid"><label v-for="member in crewOptions" :key="member" :class="{checked:form.crew.includes(member)}"><input v-model="form.crew" type="checkbox" :value="member"><span>{{member}}</span></label></div></fieldset><label>人員分組／協力廠商<textarea v-model="form.assignments" rows="3" placeholder="例如：吊車組：丸、肯、修；外部團隊：stone 哥團隊"/></label></section>

          <section class="form-section"><h3>天氣與緊急醫療</h3><div class="weather-field"><label>當日天氣預報<textarea v-model="form.weather" rows="2" placeholder="定位並選擇未來 16 天內日期，可自動取得預報"/></label><button type="button" :disabled="weatherLoading" @click="fetchWeather">{{weatherLoading?'取得中…':'依定位取得預報'}}</button></div><div class="form-row"><label>最近醫院<input v-model="form.hospitalName" placeholder="醫院名稱"></label><label>醫院電話<input v-model="form.hospitalPhone" inputmode="tel" placeholder="02-12345678"></label></div><div class="form-row"><label>距離<input v-model="form.hospitalDistance" placeholder="例如：3.2 公里"></label><label>車程<input v-model="form.hospitalTravelTime" placeholder="例如：10 分鐘"></label></div></section>

          <section class="form-section"><h3>工作安排</h3><label>紀錄標題<input v-model="form.title" required placeholder="例如：榕樹局部退縮與微疏枝"></label><label>工作摘要<textarea v-model="form.notes" required rows="3" placeholder="本次任務重點，用一至三句話摘要"/></label><label>詳細工作內容<textarea v-model="form.workDetails" rows="5" placeholder="樹種、棵數、修剪或伐除方式、計畫書重點…"/></label><div class="form-row"><label>吊車安排<textarea v-model="form.crane" rows="2" placeholder="車輛、人員、進場時間"></textarea></label><label>清運安排<textarea v-model="form.disposal" rows="2" placeholder="小夾／大夾、時間、堆置方式"></textarea></label></div><label>停車／卸裝備動線<textarea v-model="form.parking" rows="3" placeholder="進場門、卸裝備點、停車位置及步行距離"/></label><label>路權<textarea v-model="form.roadPermit" rows="2" placeholder="路權日期、範圍或限制"/></label><label>裝備與工具<textarea v-model="form.equipment" rows="4" placeholder="攀樹裝備、PPE、Rigging、鏈鋸、角錐、警示帶…"/></label><label>安全與注意事項<textarea v-model="form.safetyNotes" rows="4" placeholder="學生與行人動線、雨天、高溫、玻璃設施、其他廠商…"/></label></section>

          <section class="form-section"><h3>媒體與附件</h3><label>圖片網址 <small>一行一個或以逗號分隔</small><textarea v-model="form.imageUrls" rows="2" placeholder="https://example.com/photo.jpg"/></label><label>YouTube 網址<textarea v-model="form.youtubeUrls" rows="2" placeholder="https://youtube.com/watch?v=..."/></label><label>檔案網址<textarea v-model="form.fileUrls" rows="2" placeholder="https://example.com/report.pdf"/></label></section>
        </div>
        <div class="modal-actions"><button type="button" @click="showCreate=false">取消</button><button class="save" type="submit">{{editing?'儲存變更':'建立紀錄'}}</button></div>
      </form>
    </div>
    <div v-if="toast" class="toast" role="status">{{toast}}</div>
  </main>
</template>
