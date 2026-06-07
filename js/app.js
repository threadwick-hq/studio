// app.js — bootstrap: the router between Projects / Project / Editor screens,
// the modal system, autosave, and first-run seeding.

import { store } from './store.js';
import { createProjectsView } from './projectsView.js';
import { createProjectView } from './projectView.js';
import { createEditorView } from './editorView.js';
import { sampleProject } from './sample.js';

// ---- modal -----------------------------------------------------------------
export function openModal(content, opts = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal' + (opts.wide ? ' wide' : '');
  if (typeof content === 'string') modal.innerHTML = content;
  else modal.appendChild(content);
  const close = document.createElement('button');
  close.className = 'modal-close'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
  modal.prepend(close);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
  const dismiss = () => { backdrop.remove(); window.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } };
  close.onclick = dismiss;
  backdrop.onclick = (e) => { if (e.target === backdrop) dismiss(); };
  window.addEventListener('keydown', onEsc);
  // focus the first input for quick entry
  requestAnimationFrame(() => { const f = modal.querySelector('input,textarea,select,button:not(.modal-close)'); if (f) f.focus(); });
  return { close: dismiss, modal };
}

// ---- views + router --------------------------------------------------------
const views = {
  projects: createProjectsView(store, document.getElementById('view-projects')),
  project: createProjectView(store, document.getElementById('view-project')),
  editor: createEditorView(store, document.getElementById('view-editor')),
};
let active = null;

function route() {
  const v = store.state.ui.view;
  if (v !== active) {
    if (active && views[active].hide) views[active].hide();
    active = v;
    if (views[v].show) views[v].show();
  } else if (views[v].update) {
    views[v].update();
  }
}
store.subscribe(route);

// ---- autosave (the container is ephemeral; keep work between reloads) -------
let saveTimer = null;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveLocal(), 350);
});

// ---- boot ------------------------------------------------------------------
if (!store.loadLocal()) {
  store.state.library.projects.push(sampleProject());
  store.saveLocal();
}
route();

// expose for debugging / console use
window.stitchgrid = { store };
