'use client';

import { useEffect, useRef } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from './types';

export default function RouteMap({
  value,
  onChange,
  center,
  editable = false,
}: {
  value: RoutePoint[];
  onChange?: (points: RoutePoint[]) => void;
  center: RoutePoint;
  editable?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | undefined>(undefined);
  const layer = useRef<L.LayerGroup | undefined>(undefined);
  const valueRef = useRef(value);
  const editableRef = useRef(editable);
  valueRef.current = value;
  editableRef.current = editable;

  function draw() {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const points = valueRef.current;
    if (points.length > 1) L.polyline(points, { color: '#e25a32', weight: 5 }).addTo(layer.current);
    points.forEach((point, index) => {
      const label = index === 0 ? 'A' : index === points.length - 1 ? 'B' : String(index);
      const marker = L.marker(point, {
        draggable: editableRef.current,
        icon: L.divIcon({ className: 'route-pin', html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).addTo(layer.current!);
      marker.bindTooltip(index === 0 ? 'A 出發點' : index === points.length - 1 ? 'B 終點' : `途經點 ${index}`);
      marker.on('dragend', () => {
        const current = valueRef.current;
        onChange?.(current.map((item, i) => i === index ? { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng } : item));
      });
      if (index === 0) return;
      const a = map.current!.latLngToLayerPoint(points[index - 1]);
      const b = map.current!.latLngToLayerPoint(point);
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const count = Math.max(1, Math.min(30, Math.floor(a.distanceTo(b) / 70)));
      for (let i = 0; i < count; i += 1) {
        const mid = map.current!.layerPointToLatLng(a.add(b.subtract(a).multiplyBy((i + 0.5) / count)));
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({ className: 'route-arrow', html: `<span style="transform:rotate(${angle}deg)">➤</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
        }).addTo(layer.current!);
      }
    });
  }

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current).setView(center, 16);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      if (editableRef.current && valueRef.current.length < 100) onChange?.([...valueRef.current, { lat: event.latlng.lat, lng: event.latlng.lng }]);
    });
    instance.on('zoomend', draw);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    draw();
    return () => { resize.disconnect(); instance.remove(); map.current = undefined; };
  }, []);

  useEffect(() => {
    draw();
    if (value.length > 1 && map.current) map.current.fitBounds(L.latLngBounds(value), { padding: [32, 32], maxZoom: 17 });
    else if (!value.length) map.current?.setView(center, 16);
  }, [value, editable, center.lat, center.lng]);

  return (
    <Stack spacing={1.5}>
      {editable && <Typography variant="body2">依序點選 A 出發點、轉彎途經點，最後一點為 B 終點；標記可拖曳調整。</Typography>}
      <Box ref={host} className="route-map" aria-label="A 到 B 進場路線地圖" />
      {editable && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" startIcon={<UndoRounded />} disabled={!value.length} onClick={() => onChange?.(value.slice(0, -1))}>撤銷最後一點</Button>
          <Button size="small" color="warning" variant="outlined" startIcon={<DeleteSweepRounded />} disabled={!value.length} onClick={() => onChange?.([])}>清除路線</Button>
          <Typography variant="caption">{value.length} / 100 點</Typography>
        </Stack>
      )}
      {value.length > 0 && <Typography variant="body2" sx={{ fontWeight: 700 }}>A 出發點 → {Math.max(0, value.length - 2)} 個途經點 → B 終點</Typography>}
      <Typography variant="caption" color="text.secondary">手動進場指引不會自動貼齊道路，請確認實際路寬、限高與通行條件。</Typography>
    </Stack>
  );
}
