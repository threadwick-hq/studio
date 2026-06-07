// projectsView.js — the dashboard: every project as a card, with create /
// import / open / export / duplicate / delete.

import { chartToSVG, glyphSVG } from './render.js';
import { exportProjectFile, importProjectFile } from './files.js';
import { escapeHTML } from './util.js';
import { openModal } from './app.js';

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

// A small, chrome-free chart preview for a card (or a placeholder glyph).
export function thumb(pattern) {
  if (pattern && pattern.stitches && pattern.stitches.length) {
    return chartToSVG(pattern, { legend: false, title: '', background: null, padding: 12 });
  }
  return `<div class="thumb-empty">${glyphSVG('mr', 40, '#c8bfae')}</div>`;
}

export function createProjectsView(store, container) {
  function show() { container.hidden = false; render(); }
  function update() { render(); }
  function hide() { container.hidden = true; container.innerHTML = ''; }

  function render() {
    const projects = store.state.library.projects;
    container.innerHTML = `
      <header class="home-top">
        <div class="brand"><span class="brand-mark">✿</span> stitchgrid <em>studio</em></div>
        <div class="spacer"></div>
        <button class="btn ghost" id="home-import">Import…</button>
        <button class="btn primary" id="home-new">+ New project</button>
      </header>
      <div class="home-body">
        <p class="tagline">Your crochet workshop — one folder per project, for patterns, yarns, links and notes. Design granny squares the way you crochet them.</p>
        ${projects.length ? `<div class="card-grid">${projects.map(card).join('')}</div>` : emptyState()}
      </div>
      <footer class="home-foot">Saved in your browser · export any project to a file to back it up or share it</footer>`;
    wire();
  }

  function card(p) {
    const first = p.patterns[0];
    const patCount = p.patterns.length;
    return `
      <article class="card" data-id="${p.id}">
        <button class="card-open" data-id="${p.id}" aria-label="Open ${escapeHTML(p.name)}">
          <div class="card-thumb">${thumb(first)}</div>
          <div class="card-body">
            <h3>${escapeHTML(p.name)}</h3>
            <p class="card-meta">${patCount} pattern${patCount === 1 ? '' : 's'} · ${fmtDate(p.updatedAt)}</p>
          </div>
        </button>
        <div class="card-acts">
          <button class="mini" data-act="export" data-id="${p.id}" title="Export to file">⇩</button>
          <button class="mini" data-act="dup" data-id="${p.id}" title="Duplicate">⧉</button>
          <button class="mini danger" data-act="del" data-id="${p.id}" title="Delete">×</button>
        </div>
      </article>`;
  }

  function emptyState() {
    return `<div class="empty">
      <div class="empty-art">${glyphSVG('dc', 60, '#d8b8a8')}${glyphSVG('mr', 60, '#b9d0c0')}${glyphSVG('tr', 60, '#c9bce0')}</div>
      <h2>Start your first project</h2>
      <p>A project is your folder for everything: patterns, the yarns you used, video links and notes.</p>
      <button class="btn primary big" id="empty-new">+ New project</button>
    </div>`;
  }

  function wire() {
    const $ = (s) => container.querySelector(s);
    container.querySelectorAll('#home-new, #empty-new').forEach((b) => { b.onclick = promptNewProject; });
    $('#home-import').onclick = async () => {
      const obj = await importProjectFile();
      if (obj) store.openProject(store.importProject(obj));
      else if (obj === null) {/* cancelled or invalid: ignore */ }
    };
    container.querySelectorAll('.card-open').forEach((b) => { b.onclick = () => store.openProject(b.dataset.id); });
    container.querySelectorAll('.card-acts [data-act]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.id, act = b.dataset.act;
        if (act === 'export') exportProjectFile(store.getProject(id));
        else if (act === 'dup') store.duplicateProject(id);
        else if (act === 'del') { const p = store.getProject(id); if (confirm(`Delete “${p.name}” and all its patterns? This can't be undone.`)) store.deleteProject(id); }
      };
    });
  }

  function promptNewProject() {
    const form = document.createElement('div');
    form.innerHTML = `
      <h2>New project</h2>
      <label class="field">Name <input id="np-name" placeholder="e.g. Spring blanket" value="" /></label>
      <label class="field">Description <textarea id="np-desc" rows="2" placeholder="Optional"></textarea></label>
      <div class="form-acts"><button class="btn primary" id="np-create">Create</button></div>`;
    const m = openModal(form);
    const create = () => {
      const name = form.querySelector('#np-name').value.trim() || 'Untitled project';
      const desc = form.querySelector('#np-desc').value.trim();
      const id = store.createProject(name);
      if (desc) store.updateProject(id, { description: desc });
      m.close();
      store.openProject(id);
    };
    form.querySelector('#np-create').onclick = create;
    form.querySelector('#np-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  }

  return { show, hide, update };
}
