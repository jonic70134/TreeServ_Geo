<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type RoutePoint = { lat: number; lng: number };
const props = defineProps<{ modelValue: RoutePoint[]; editable?: boolean; center: RoutePoint }>();
const emit = defineEmits<{ 'update:modelValue': [points: RoutePoint[]] }>();
const el = ref<HTMLElement>();
let map: L.Map | undefined;
let layer: L.LayerGroup;
let resize: ResizeObserver;
function draw() {
  if (!map || !layer) return;
  layer.clearLayers();
  const points = props.modelValue;
  if (points.length > 1) L.polyline(points, { color: '#d54f20', weight: 5 }).addTo(layer);
  points.forEach((point, i) => {
    const label = i === 0 ? 'A' : i === points.length - 1 ? 'B' : String(i);
    const marker = L.marker(point, {
      draggable: props.editable,
      icon: L.divIcon({ className: 'route-pin', html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
    }).addTo(layer);
    marker.bindTooltip(i === 0 ? 'A 出發點' : i === points.length - 1 ? 'B 終點' : `途經點 ${i}`);
    marker.on('dragend', () => {
      emit('update:modelValue', points.map((p, index) => index === i ? { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng } : p));
    });
    if (i === 0) return;
    const a = map!.latLngToLayerPoint(points[i - 1]);
    const b = map!.latLngToLayerPoint(point);
    const length = a.distanceTo(b);
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    for (let j = 0, n = Math.max(1, Math.min(30, Math.floor(length / 70))); j < n; j++) {
      const mid = map!.layerPointToLatLng(a.add(b.subtract(a).multiplyBy((j + 0.5) / n)));
      L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'route-arrow', html: `<span style="transform:rotate(${angle}deg)">➤</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(layer);
    }
  });
}
onMounted(() => {
  map = L.map(el.value!).setView(props.center, 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  if (props.modelValue.length > 1) map.fitBounds(L.latLngBounds(props.modelValue), { padding: [32, 32], maxZoom: 17 });
  map.on('click', (event: L.LeafletMouseEvent) => {
    if (props.editable && props.modelValue.length < 100) emit('update:modelValue', [...props.modelValue, { lat: event.latlng.lat, lng: event.latlng.lng }]);
  });
  map.on('zoomend', draw);
  resize = new ResizeObserver(() => map?.invalidateSize());
  resize.observe(el.value!);
  draw();
});
watch(() => props.modelValue, draw, { deep: true });
watch(() => props.editable, draw);
watch(() => [props.center.lat, props.center.lng], () => { if (!props.modelValue.length) map?.setView(props.center, 16); });
onUnmounted(() => { resize?.disconnect(); map?.remove(); });
</script>

<template>
  <section class="route-planner">
    <p v-if="editable">依序點選 A 出發點、途經點，最後一點為 B 終點。沿指定道路的轉彎處加點；可拖曳調整位置。</p>
    <div ref="el" class="route-map" aria-label="A 到 B 進場路線地圖"></div>
    <div v-if="editable" class="route-controls">
      <button type="button" :disabled="!modelValue.length" @click="emit('update:modelValue', modelValue.slice(0, -1))">撤銷最後一點</button>
      <button type="button" :disabled="!modelValue.length" @click="emit('update:modelValue', [])">清除路線</button>
      <span>{{ modelValue.length }} / 100 點</span>
    </div>
    <p v-if="modelValue.length">A 出發點 → {{ Math.max(0, modelValue.length - 2) }} 個途經點 → B 終點</p>
    <small>手動進場指引，不會自動貼齊道路。請確認實際路寬、限高與通行條件。</small>
  </section>
</template>
