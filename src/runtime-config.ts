export type TreeServRuntimeConfig = {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  googleMapsApiKey: string;
  googleMapId: string;
};

declare global {
  interface Window {
    __TREESERV_CONFIG__?: TreeServRuntimeConfig;
  }
}

export function getRuntimeConfig(): TreeServRuntimeConfig | undefined {
  return typeof window === 'undefined' ? undefined : window.__TREESERV_CONFIG__;
}
