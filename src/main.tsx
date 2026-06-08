import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import { IconoirProvider } from 'iconoir-react';
import { theme } from './theme';
import { App } from './App';
import { store } from './core/store';
import { cloudEnabled } from './cloud/config';
import { sampleProject } from './core/sample';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-700.css';
import './index.css';

// First run: seed a worked sample so the app opens on something real.
if (!store.loadLocal()) {
  store.state.library.projects.push(sampleProject());
  store.saveLocal();
}

// Autosave (the container is ephemeral; keep work between reloads).
let saveTimer: ReturnType<typeof setTimeout> | undefined;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveLocal(), 350);
});

// Expose for debugging / the browser smoke test. Cloud is opt-in: with no
// Supabase env vars `cloudEnabled` is false and no cloud code is loaded at all.
// The auth/supabase handles attach lazily only when cloud is on, so the
// local-only build never even downloads the Supabase SDK.
const tw: Record<string, unknown> = { store, cloudEnabled };
(window as unknown as { threadwick: unknown }).threadwick = tw;
if (cloudEnabled) {
  void Promise.all([import('./cloud/auth'), import('./cloud/client')]).then(
    ([auth, client]) => { tw.auth = auth; tw.supabase = client.supabase; },
  );
}

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={theme}>
    <AntApp>
      <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.8 }}>
        <App />
      </IconoirProvider>
    </AntApp>
  </ConfigProvider>,
);
