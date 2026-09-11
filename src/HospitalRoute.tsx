'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from './types';

export default function HospitalRoute({
  origin,
  hospitalName,
}: {
  origin: RoutePoint;
  hospitalName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${encodeURIComponent(hospitalName)}&travelmode=driving`;

  useEffect(() => {
    if (!open || !host.current || map.current) return;
    let cancelled = false;
    const instance = L.map(host.current).setView([origin.lat, origin.lng], 13);
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(instance);
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const geoResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&q=${encodeURIComponent(`${hospitalName} 台灣`)}`,
          { headers: { 'Accept-Language': 'zh-TW' } },
        );
        const geo = (await geoResponse.json()) as Array<{ lat: string; lon: string }>;
        if (!geo[0]) throw new Error('hospital-not-found');
        const destination = {
          lat: Number(geo[0].lat),
          lng: Number(geo[0].lon),
        };
        const routeResponse = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`,
        );
        const route = (await routeResponse.json()) as { routes?: Array<{ geometry?: GeoJSON.LineString }> };
        if (cancelled || !route.routes?.[0]?.geometry) return;
        const line = L.geoJSON(route.routes[0].geometry, {
          style: { color: '#ef6c26', weight: 6, opacity: 0.9 },
        }).addTo(instance);
        L.marker([origin.lat, origin.lng]).bindTooltip('案場').addTo(instance);
        L.marker([destination.lat, destination.lng])
          .bindTooltip(hospitalName)
          .addTo(instance);
        instance.fitBounds(line.getBounds(), { padding: [32, 32] });
      } catch {
        if (!cancelled) setError('暫時無法取得開車路線，請改用外部導航。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      cancelled = true;
      resize.disconnect();
      instance.remove();
      map.current = undefined;
    };
  }, [open, hospitalName, origin.lat, origin.lng]);

  return (
    <Stack spacing={1.2} sx={{ mt: 1.2 }}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            loading ? <CircularProgress size={16} /> : <DirectionsCarRounded />
          }
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收合開車路線' : '在地圖顯示開車路線'}
        </Button>
        <Button
          size="small"
          component="a"
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewRounded />}
        >
          開啟導航
        </Button>
      </Stack>
      {error && <Alert severity="warning">{error}</Alert>}
      {open && (
        <Box
          ref={host}
          className="hospital-route-map"
          aria-label={`案場開車前往${hospitalName}的路線`}
        />
      )}
    </Stack>
  );
}
