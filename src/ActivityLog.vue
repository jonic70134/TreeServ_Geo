<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { db, collection, query, orderBy, limit, getDocs, startAfter, type QueryDocumentSnapshot } from './firebase';
const entries = ref<any[]>([]);
const busy = ref(false);
const error = ref('');
const more = ref(true);
let cursor: QueryDocumentSnapshot | undefined;
const labels: Record<string, string> = { login: '登入', logout: '登出', create: '建立紀錄', edit: '開啟編輯', update: '更新紀錄', delete: '刪除紀錄' };
function formatTime(value: any) {
  return value?.toDate ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value.toDate()) : '時間同步中';
}
async function load(reset = false) {
  if (!db || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const result = await getDocs(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), ...(!reset && cursor ? [startAfter(cursor)] : []), limit(50)));
    entries.value = [...(reset ? [] : entries.value), ...result.docs.map(d => ({ id: d.id, ...d.data() }))];
    cursor = result.docs.at(-1); more.value = result.size === 50;
  } catch { error.value = '無法讀取操作紀錄，請確認 Owner 帳號及資料庫權限後重試。'; }
  finally { busy.value = false; }
}
onMounted(() => load(true));
</script>
<template>
  <section class="audit-page">
    <div class="audit-heading"><div><h1>登入與操作紀錄</h1><p>台灣時間（UTC+8）・每次載入 50 筆</p></div><button :disabled="busy" @click="load(true)">重新整理</button></div>
    <p>「開啟編輯」表示進入編輯畫面；「更新紀錄」表示變更已成功儲存。此頁保留啟用後的紀錄。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="audit-table"><table><thead><tr><th>時間（年月日時分秒）</th><th>登入者</th><th>操作</th><th>工作紀錄</th></tr></thead><tbody><tr v-for="entry in entries" :key="entry.id"><td>{{ formatTime(entry.timestamp) }}</td><td>{{ entry.actorName }}<br>{{ entry.actorEmail }}</td><td>{{ labels[entry.action] || entry.action }}</td><td>{{ entry.recordTitle || '—' }}<small v-if="entry.recordId">{{ entry.recordId }}</small></td></tr></tbody></table></div>
    <p v-if="!entries.length && !busy && !error">尚無登入或操作紀錄。</p>
    <p v-if="busy" role="status">載入中…</p>
    <button v-if="more && entries.length" :disabled="busy" @click="load()">載入更早紀錄</button>
  </section>
</template>
