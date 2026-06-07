// projectView.js — a single project: its patterns and its shared resources
// (yarns, links, notes, variations). This is the "folder" of the app.

import { thumb } from './projectsView.js';
import { exportProjectFile, printProject } from './files.js';
import { PATTERN_TYPES } from './model.js';
import { escapeHTML } from './util.js';
import { openModal } from './app.js';

const RES = {
  yarns: { title: 'Yarns', add: 'Add yarn', empty: 'Track the yarns you used — brand, weight, colour.' },
  links: { title: 'Links & videos', add: 'Add link', empty: 'Tutorial videos and reference links.' },
  notes: { title: 'Notes & tips', add: 'Add note', empty: 'Gotchas, gauge, hooks, anything worth remembering.' },
  variations: { title: 'Variations', add: 'Add variation', empty: 'Colourways and tweaks of this project.' },
};

export function createProjectView(store, container) {
  function show() { container.hidden = false; build(); wire(); refresh(); }
  function update() { refresh(); }
  function hide() { container.hidden = true; container.innerHTML = ''; }

  function build() {
    container.innerHTML = `
      <header class="proj-top">
        <button class="btn ghost" id="pv-back">← All projects</button>
        <div class="spacer"></div>
        <button class="btn" id="pv-export" title="Export this project to a file">Export</button>
        <button class="btn" id="pv-pdf" title="Compose a print / PDF document">Compose PDF</button>
        <button class="btn ghost danger" id="pv-del">Delete</button>
      </header>
      <div class="proj-body">
        <input class="proj-name" id="pv-name" aria-label="Project name" />
        <textarea class="proj-desc" id="pv-desc" rows="2" placeholder="Add a description…"></textarea>

        <section class="proj-section">
          <div class="section-head"><h2>Patterns</h2><button class="btn primary" id="pv-newpat">+ New pattern</button></div>
          <div class="card-grid pat-grid" id="pv-patterns"></div>
        </section>

        <section class="proj-section">
          <div class="section-head"><h2>Resources</h2></div>
          <div class="res-grid">
            ${Object.keys(RES).map((k) => `
              <div class="res-col" data-kind="${k}">
                <div class="res-head"><h3>${RES[k].title}</h3><button class="btn small" data-add="${k}">${RES[k].add}</button></div>
                <div class="res-list" id="pv-${k}"></div>
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  }

  function wire() {
    const $ = (s) => container.querySelector(s);
    $('#pv-back').onclick = () => store.goProjects();
    $('#pv-export').onclick = () => exportProjectFile(store.currentProject());
    $('#pv-pdf').onclick = () => printProject(store.currentProject());
    $('#pv-del').onclick = () => { const p = store.currentProject(); if (p && confirm(`Delete “${p.name}” and all its patterns?`)) store.deleteProject(p.id); };
    const name = $('#pv-name'), desc = $('#pv-desc');
    name.oninput = () => store.renameProject(store.currentProject().id, name.value);
    desc.oninput = () => store.updateProject(store.currentProject().id, { description: desc.value });
    $('#pv-newpat').onclick = promptNewPattern;
    container.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => resourceModal(b.dataset.add, null); });
  }

  function refresh() {
    const p = store.currentProject();
    if (!p) return;
    const name = container.querySelector('#pv-name'), desc = container.querySelector('#pv-desc');
    if (name && document.activeElement !== name) name.value = p.name;
    if (desc && document.activeElement !== desc) desc.value = p.description || '';
    renderPatterns(p);
    for (const k of Object.keys(RES)) renderResource(p, k);
  }

  function renderPatterns(p) {
    const el = container.querySelector('#pv-patterns');
    const cards = p.patterns.map((pat) => `
      <article class="card pat-card" data-id="${pat.id}">
        <button class="card-open" data-id="${pat.id}">
          <div class="card-thumb">${thumb(pat)}</div>
          <div class="card-body"><h3>${escapeHTML(pat.name)}</h3><p class="card-meta">${escapeHTML((PATTERN_TYPES[pat.type] || {}).name || pat.type)} · ${pat.stitches.length} stitches</p></div>
        </button>
        <div class="card-acts">
          <button class="mini" data-act="dup" data-id="${pat.id}" title="Duplicate">⧉</button>
          <button class="mini danger" data-act="del" data-id="${pat.id}" title="Delete">×</button>
        </div>
      </article>`).join('');
    el.innerHTML = cards + `<button class="card card-new" id="pv-addpat">＋<span>New pattern</span></button>`;
    el.querySelectorAll('.card-open').forEach((b) => { b.onclick = () => store.openPattern(p.id, b.dataset.id); });
    el.querySelector('#pv-addpat').onclick = promptNewPattern;
    el.querySelectorAll('.card-acts [data-act]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset.act === 'dup') store.duplicatePattern(p.id, b.dataset.id);
        else if (b.dataset.act === 'del') { const pat = p.patterns.find((x) => x.id === b.dataset.id); if (confirm(`Delete pattern “${pat.name}”?`)) store.deletePattern(p.id, b.dataset.id); }
      };
    });
  }

  function renderResource(p, kind) {
    const el = container.querySelector('#pv-' + kind);
    const items = p.resources[kind] || [];
    if (!items.length) { el.innerHTML = `<p class="muted small">${RES[kind].empty}</p>`; return; }
    el.innerHTML = items.map((it) => `
      <div class="res-item" data-id="${it.id}">
        <div class="res-text">${resourceLine(kind, it)}</div>
        <div class="res-acts"><button class="mini" data-act="edit" data-id="${it.id}">✎</button><button class="mini danger" data-act="del" data-id="${it.id}">×</button></div>
      </div>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'edit') resourceModal(kind, items.find((x) => x.id === b.dataset.id));
      else if (b.dataset.act === 'del') store.removeResource(p.id, kind, b.dataset.id);
    };
  }

  function resourceLine(kind, it) {
    if (kind === 'yarns') {
      const head = [it.name, it.brand].filter(Boolean).join(' · ') || 'Yarn';
      const sub = [it.weight, it.color].filter(Boolean).join(' · ');
      const sw = it.hex ? `<span class="swatch" style="background:${escapeHTML(it.hex)}"></span>` : '';
      return `${sw}<b>${escapeHTML(head)}</b>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}${it.notes ? `<small>${escapeHTML(it.notes)}</small>` : ''}`;
    }
    if (kind === 'links') {
      const label = it.title || it.url || 'Link';
      const href = it.url ? escapeHTML(it.url) : '';
      return `<b>${escapeHTML(label)}</b>${href ? `<a class="res-url" href="${href}" target="_blank" rel="noopener">${href}</a>` : ''}`;
    }
    return `<b>${escapeHTML(it.title || 'Untitled')}</b>${it.body ? `<small>${escapeHTML(it.body)}</small>` : ''}`;
  }

  // ---- modals --------------------------------------------------------------
  function promptNewPattern() {
    const form = document.createElement('div');
    const types = Object.values(PATTERN_TYPES).map((t) => `
      <label class="type-opt${t.available ? '' : ' disabled'}">
        <input type="radio" name="pt-type" value="${t.id}" ${t.id === 'granny' ? 'checked' : ''} ${t.available ? '' : 'disabled'}/>
        <span><b>${escapeHTML(t.name)}</b><small>${escapeHTML(t.worked)}${t.available ? '' : ' · coming soon'}</small></span>
      </label>`).join('');
    form.innerHTML = `
      <h2>New pattern</h2>
      <label class="field">Name <input id="pt-name" placeholder="e.g. Centre motif" /></label>
      <div class="type-list">${types}</div>
      <div class="form-acts"><button class="btn primary" id="pt-create">Create</button></div>`;
    const m = openModal(form);
    form.querySelector('#pt-create').onclick = () => {
      const name = form.querySelector('#pt-name').value.trim() || 'Untitled pattern';
      const type = form.querySelector('input[name="pt-type"]:checked').value;
      const p = store.currentProject();
      const id = store.createPattern(p.id, name, type);
      m.close();
      if (id) store.openPattern(p.id, id);
    };
  }

  function resourceModal(kind, item) {
    const isEdit = !!item;
    const v = (k, d = '') => escapeHTML(item ? (item[k] ?? d) : d);
    const fields = {
      yarns: `
        <label class="field">Name <input id="r-name" value="${v('name')}" placeholder="e.g. Cotton 8/4" /></label>
        <label class="field">Brand <input id="r-brand" value="${v('brand')}" /></label>
        <div class="field-row">
          <label class="field">Weight <input id="r-weight" value="${v('weight')}" placeholder="DK, worsted…" /></label>
          <label class="field">Colour name <input id="r-color" value="${v('color')}" /></label>
        </div>
        <label class="field">Swatch <input type="color" id="r-hex" value="${item && item.hex ? escapeHTML(item.hex) : '#d8b8a8'}" /></label>
        <label class="field">Notes <textarea id="r-notes" rows="2">${v('notes')}</textarea></label>`,
      links: `
        <label class="field">Title <input id="r-title" value="${v('title')}" placeholder="e.g. Magic ring tutorial" /></label>
        <label class="field">URL <input id="r-url" value="${v('url')}" placeholder="https://…" /></label>
        <label class="field">Kind
          <select id="r-kind">
            ${['video', 'article', 'link'].map((o) => `<option value="${o}" ${item && item.kind === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </label>`,
      notes: `
        <label class="field">Title <input id="r-title" value="${v('title')}" /></label>
        <label class="field">Note <textarea id="r-body" rows="4">${v('body')}</textarea></label>`,
      variations: `
        <label class="field">Title <input id="r-title" value="${v('title')}" placeholder="e.g. Winter palette" /></label>
        <label class="field">Details <textarea id="r-body" rows="4">${v('body')}</textarea></label>`,
    };
    const form = document.createElement('div');
    form.innerHTML = `<h2>${isEdit ? 'Edit' : 'Add'} ${RES[kind].title.toLowerCase().replace(/s$| & videos$/,'')}</h2>${fields[kind]}<div class="form-acts"><button class="btn primary" id="r-save">${isEdit ? 'Save' : 'Add'}</button></div>`;
    const m = openModal(form);
    form.querySelector('#r-save').onclick = () => {
      const g = (id) => { const e = form.querySelector(id); return e ? e.value.trim() : ''; };
      let data;
      if (kind === 'yarns') data = { name: g('#r-name'), brand: g('#r-brand'), weight: g('#r-weight'), color: g('#r-color'), hex: g('#r-hex'), notes: g('#r-notes') };
      else if (kind === 'links') data = { title: g('#r-title'), url: g('#r-url'), kind: g('#r-kind') };
      else data = { title: g('#r-title'), body: g('#r-body') };
      const p = store.currentProject();
      if (isEdit) store.updateResource(p.id, kind, item.id, data);
      else store.addResource(p.id, kind, data);
      m.close();
    };
  }

  return { show, hide, update };
}
