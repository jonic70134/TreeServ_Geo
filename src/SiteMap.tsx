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
  const markers = useRef(new Map<string, L.Marker>());

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
    const markerStore = markers.current;
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      markerStore.clear();
      instance.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const visibleIds = new Set(locations.map((location) => location.id));
    markers.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
    locations.forEach((location) => {
      const count = location.recordCount ?? location.records?.length;
      const icon = L.divIcon({
        className: `leaflet-tree-marker${location.id === activeId ? ' active' : ''}`,
        html: `<span>${count ?? '•'}</span>`,
        iconSize: [40, 40],
        iconAnchor: [20, 36],
      });
      let marker = markers.current.get(location.id);
      if (!marker) {
        marker = L.marker([location.lat, location.lng], { icon }).addTo(instance);
        markers.current.set(location.id, marker);
      } else {
        marker.setLatLng([location.lat, location.lng]);
        marker.setIcon(icon);
      }
      const tooltip = document.createElement('span');
      tooltip.textContent = location.name;
      marker.unbindTooltip();
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -30] });
      marker.off('click');
      marker.on('click', () => onSelect(location));
    });
  }, [locations, activeId, onSelect]);

  useEffect(() => {
    const active = locations.find((location) => location.id === activeId);
    if (active)
      map.current?.setView([active.lat, active.lng], 16, { animate: true });
  }, [activeId, locations]);

  return (
    <div ref={host} className="site-map" aria-label="TreeServ Geo 案場地圖" />
  );
}
