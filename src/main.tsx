import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import { theme } from './theme';
import { App } from './App';
import { store } from './core/store';
import { sampleProject } from './core/sample';
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

// Expose for debugging / the browser smoke test.
(window as unknown as { stitchgrid: unknown }).stitchgrid = { store };

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={theme}>
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>,
);
