'use client';

import { useEffect, useRef } from 'react';
import { createApp, type App as VueApp } from 'vue';
import GeoApp from '../src/GeoApp.vue';

export default function VueShell() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const app: VueApp = createApp(GeoApp);
    app.mount(host.current);
    return () => app.unmount();
  }, []);

  return <div ref={host} id="treeserv-geo" />;
}
