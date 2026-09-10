'use client';

import { useEffect, useState } from 'react';
import { CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { TreeServRuntimeConfig } from '../src/runtime-config';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#285a45', dark: '#17382c', light: '#dfece5', contrastText: '#ffffff' },
    secondary: { main: '#df5b32', dark: '#a63d21', light: '#ffebe3', contrastText: '#ffffff' },
    warning: { main: '#b76816' },
    background: { default: '#f3f5f1', paper: '#ffffff' },
    text: { primary: '#17231d', secondary: '#5d6b63' },
    divider: '#dbe1dc',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    h4: { fontWeight: 850, letterSpacing: '-0.035em' },
    h5: { fontWeight: 800, letterSpacing: '-0.025em' },
    h6: { fontWeight: 780 },
    button: { fontWeight: 750, letterSpacing: 0, textTransform: 'none' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 12 } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
  },
});

export default function MaterialShell({ runtimeConfig }: { runtimeConfig: TreeServRuntimeConfig }) {
  const [App, setApp] = useState<React.ComponentType>();
  useEffect(() => {
    window.__TREESERV_CONFIG__ = runtimeConfig;
    void import('../src/TreeServApp').then(({ default: Component }) => setApp(() => Component));
  }, [runtimeConfig]);
  return <ThemeProvider theme={theme}><CssBaseline />{App ? <App /> : null}</ThemeProvider>;
}
