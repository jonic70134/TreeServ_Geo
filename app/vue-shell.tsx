'use client';

import { useEffect, useRef } from 'react';
import { createApp, type App as VueApp } from 'vue';
import type { TreeServRuntimeConfig } from '../src/runtime-config';

export default function VueShell({ runtimeConfig }: { runtimeConfig: TreeServRuntimeConfig }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    let app: VueApp | undefined;
    let cancelled = false;
    window.__TREESERV_CONFIG__ = runtimeConfig;

    void import('../src/GeoApp.vue').then(({ default: GeoApp }) => {
      if (cancelled || !host.current) return;
      app = createApp(GeoApp);
      app.mount(host.current);
    });

    return () => {
      cancelled = true;
      app?.unmount();
    };
  }, [runtimeConfig]);

  return <div ref={host} id="treeserv-geo" />;
}
