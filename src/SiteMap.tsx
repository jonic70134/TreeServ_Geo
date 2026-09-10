'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SiteLocation } from './types';

export default function SiteMap({
  locations,
  activeId,
  onSelect,
}: {
  locations: SiteLocation[];
  activeId: string;
  onSelect: (location: SiteLocation) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | undefined>(undefined);
  const markers = useRef<L.LayerGroup | undefined>(undefined);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { zoomControl: true }).setView(
      [25.06, 121.5],
      11,
    );
    map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '© OpenStreetMap contributors',
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    locations.forEach((location) => {
      const count = location.records?.length ?? 0;
      const marker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
          className: `leaflet-tree-marker${location.id === activeId ? ' active' : ''}`,
          html: `<span>${count}</span>`,
          iconSize: [40, 40],
          iconAnchor: [20, 36],
        }),
      }).addTo(markers.current!);
      marker.bindTooltip(location.name, { direction: 'top', offset: [0, -30] });
      marker.on('click', () => onSelect(location));
    });
  }, [locations, activeId]);

  useEffect(() => {
    const active = locations.find((location) => location.id === activeId);
    if (active)
      map.current?.setView([active.lat, active.lng], 16, { animate: true });
  }, [activeId]);

  return (
    <div ref={host} className="site-map" aria-label="TreeServ Geo 案場地圖" />
  );
}
