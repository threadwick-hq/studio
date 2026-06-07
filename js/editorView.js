// editorView.js — the granny-square editor screen: top bar, toolbar, stitch
// palette, side panels, and all wiring between the DOM, the canvas controller
// and the store.

import { initCanvas } from './editorCanvas.js';
import { glyphSVG, INK } from './render.js';
import { chainOrder } from './connectivity.js';
import { startRoundId } from './model.js';
import { STITCH_ORDER, START_ORDER, STITCHES, STITCH_KEYS, isStart, isRealStitch } from './symbols.js';
import { summarizeRound } from './files.js';
import { exportPatternSVG, exportPatternPNG, printProject } from './files.js';
import { escapeHTML } from './util.js';

const KEY_TO_TYPE = Object.fromEntries(Object.entries(STITCH_KEYS).map(([t, k]) => [k, t]));

export function createEditorView(store, container) {
  let canvas = null, onKey = null, onKeyUp = null, lastSelSig = '', closeExportMenu = null;

  function show() {
    container.hidden = false;
    build();
    const svg = container.querySelector('#ed-canvas');
    canvas = initCanvas(store, svg, { onChange: refreshChrome });
    wire();
    refreshData();
    requestAnimationFrame(() => canvas && canvas.fit());
  }
  function update() {
    if (!canvas) return;
    refreshData();
    canvas.invalidate();
  }
  function hide() {
    if (closeExportMenu) closeExportMenu(); closeExportMenu = null;
    if (onKey) window.removeEventListener('keydown', onKey);
    if (onKeyUp) window.removeEventListener('keyup', onKeyUp);
    if (canvas) canvas.destroy(); canvas = null;
    lastSelSig = '';
    container.hidden = true;
    container.innerHTML = '';
  }

  // ---- static shell --------------------------------------------------------
  function build() {
    container.innerHTML = `
    <div class="editor">
      <header class="ed-top">
        <button class="btn ghost" id="ed-back">← Project</button>
        <input class="name-input" id="ed-name" aria-label="Pattern name" />
        <span class="badge">Granny square</span>
        <div class="spacer"></div>
        <div class="btn-group">
          <button class="icon-btn" id="ed-undo" title="Undo (Ctrl+Z)">↶</button>
          <button class="icon-btn" id="ed-redo" title="Redo (Ctrl+Shift+Z)">↷</button>
        </div>
        <div class="menu-wrap">
          <button class="btn" id="ed-export" title="Export this pattern / project">Export ▾</button>
          <div class="menu" id="ed-export-menu" hidden>
            <button data-exp="svg">SVG image</button>
            <button data-exp="png">PNG image</button>
            <button data-exp="pdf">PDF document…</button>
          </div>
        </div>
        <button class="btn ghost" id="ed-help" title="How it works">?</button>
      </header>

      <div class="ed-toolbar">
        <div class="tgroup">
          <span class="tlabel">Mode</span>
          <div class="seg" id="ed-mode">
            <button data-mode="select" class="seg-btn">Select</button>
            <button data-mode="insert" class="seg-btn">Insert</button>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="tgroup">
          <button class="btn small" id="ed-even" title="Fan the current row out evenly">Even out row</button>
        </div>
        <div class="tgroup">
          <span class="tlabel">View</span>
          <button class="icon-btn" id="ed-zoomout">−</button>
          <button class="btn small" id="ed-fit">Fit</button>
          <button class="icon-btn" id="ed-zoomin">+</button>
        </div>
      </div>

      <div class="ed-body">
        <aside class="ed-left">
          <section class="panel">
            <h3>Start</h3>
            <div class="chips" id="ed-starts"></div>
          </section>
          <section class="panel">
            <h3>Stitches</h3>
            <div class="chips" id="ed-stitches"></div>
          </section>
          <section class="panel hintbox">
            <h3>How it works</h3>
            <ol class="howto">
              <li>Pick a <b>start</b>, then a <b>row</b>.</li>
              <li>Hit <b>Insert</b> (or a stitch key).</li>
              <li>Click a <b>base</b> — a stitch or an <span class="dot-space"></span> space.</li>
              <li>Click again to set the <b>head</b>.</li>
              <li><kbd>Alt</kbd>/<kbd>⌘</kbd>-click a stitch to work out of it (insert after).</li>
            </ol>
          </section>
        </aside>

        <div class="ed-canvas-wrap">
          <svg id="ed-canvas" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="ed-toast" id="ed-toast" hidden></div>
          <div class="ed-hint" id="ed-hint"></div>
        </div>

        <aside class="ed-right">
          <section class="panel rows-panel">
            <div class="panel-head"><h3>Rows</h3><button class="btn small" id="ed-addrow">+ Row</button></div>
            <div id="ed-rounds" class="rounds"></div>
          </section>
          <div class="ed-right-scroll">
            <section class="panel">
              <h3>Selection</h3>
              <div id="ed-inspector"></div>
            </section>
            <section class="panel">
              <h3>Legend</h3>
              <div id="ed-legend" class="legend"></div>
            </section>
          </div>
        </aside>
      </div>
    </div>`;

    // palette glyphs (static)
    const starts = container.querySelector('#ed-starts');
    starts.innerHTML = START_ORDER.map((t) =>
      `<button class="chip start-chip" data-start="${t}" title="${escapeHTML(STITCHES[t].name)}">${glyphSVG(t, 34)}<span>${escapeHTML(STITCHES[t].abbr)}</span></button>`).join('');
    const stitchesEl = container.querySelector('#ed-stitches');
    stitchesEl.innerHTML = STITCH_ORDER.map((t) => {
      const key = STITCH_KEYS[t] ? `<kbd>${STITCH_KEYS[t].toUpperCase()}</kbd>` : '';
      return `<button class="chip stitch-chip" data-stitch="${t}" title="${escapeHTML(STITCHES[t].name)}">${glyphSVG(t, 34)}<span>${escapeHTML(STITCHES[t].abbr)}</span>${key}</button>`;
    }).join('');
  }

  // ---- wiring --------------------------------------------------------------
  function wire() {
    const $ = (s) => container.querySelector(s);
    $('#ed-back').onclick = () => store.backToProject();
    const nameInput = $('#ed-name');
    nameInput.oninput = () => store.renamePattern(store.currentPattern().id, nameInput.value);

    $('#ed-undo').onclick = () => store.undo();
    $('#ed-redo').onclick = () => store.redo();
    $('#ed-help').onclick = showHelp;
    wireExportMenu();

    $('#ed-mode').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) canvas.setMode(b.dataset.mode); };
    $('#ed-addrow').onclick = () => { store.addRound(); canvas.resetInsert(); };
    $('#ed-even').onclick = () => store.evenRound(store.currentPattern().activeRound);
    $('#ed-zoomin').onclick = () => canvas.zoomIn();
    $('#ed-zoomout').onclick = () => canvas.zoomOut();
    $('#ed-fit').onclick = () => canvas.fit();

    $('#ed-starts').onclick = (e) => {
      const b = e.target.closest('[data-start]'); if (!b) return;
      store.setStart(b.dataset.start);
      canvas.setArmed('dc'); // ready to work straight away
    };
    $('#ed-stitches').onclick = (e) => {
      const b = e.target.closest('[data-stitch]'); if (!b) return;
      canvas.setArmed(b.dataset.stitch);
    };

    // keyboard (scoped to the editor while it's mounted)
    onKey = (e) => handleKey(e);
    onKeyUp = (e) => { if (e.key === ' ' && canvas) canvas.setSpace(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
  }

  function wireExportMenu() {
    const btn = container.querySelector('#ed-export');
    const menu = container.querySelector('#ed-export-menu');
    const close = () => { menu.hidden = true; document.removeEventListener('click', onDoc); };
    const onDoc = (e) => { if (!menu.contains(e.target) && e.target !== btn) close(); };
    closeExportMenu = close; // so hide() can detach the document listener on unmount
    btn.onclick = (e) => {
      e.stopPropagation();
      if (menu.hidden) { menu.hidden = false; setTimeout(() => document.addEventListener('click', onDoc), 0); }
      else close();
    };
    menu.onclick = (e) => {
      const b = e.target.closest('[data-exp]'); if (!b) return;
      const p = store.currentPattern();
      if (b.dataset.exp === 'svg') exportPatternSVG(p, p.name);
      else if (b.dataset.exp === 'png') exportPatternPNG(p, p.name);
      else if (b.dataset.exp === 'pdf') printProject(store.currentProject());
      close();
    };
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function handleKey(e) {
    if (isTyping(e)) return;
    const meta = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (meta && k === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (meta && k === 'y') { e.preventDefault(); store.redo(); return; }
    if (meta && k === 's') { e.preventDefault(); return; } // work autosaves; swallow the browser dialog
    if (meta) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.deleteSelection(); return; }
    if (e.key === 'Escape') { if (canvas && !canvas.escape()) store.clearSelection(); return; }
    if (e.key === ' ') { e.preventDefault(); canvas && canvas.setSpace(true); return; }
    if (k === 'v') { canvas.setMode('select'); return; }
    if (k === 'i') { canvas.setMode('insert'); return; }
    if (KEY_TO_TYPE[k]) { canvas.setArmed(KEY_TO_TYPE[k]); return; }
    if (k === 'r') { store.rotateSelectionBy(e.shiftKey ? -15 : 15); return; }
    const n = e.shiftKey ? 8 : 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); store.moveSelectionBy(-n, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); store.moveSelectionBy(n, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); store.moveSelectionBy(0, -n); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); store.moveSelectionBy(0, n); }
  }

  // ---- chrome refresh (mode / armed / step toast / undo state) -------------
  function refreshChrome() {
    if (!canvas) return;
    const mode = canvas.getMode(), armed = canvas.getArmed(), phase = canvas.getPhase();
    container.querySelectorAll('#ed-mode .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    container.querySelectorAll('.stitch-chip').forEach((b) => b.classList.toggle('on', mode === 'insert' && b.dataset.stitch === armed));
    const cur = store.currentPattern();
    container.querySelectorAll('.start-chip').forEach((b) => b.classList.toggle('on', cur && cur.start === b.dataset.start));

    const toast = container.querySelector('#ed-toast');
    const hint = container.querySelector('#ed-hint');
    if (mode === 'insert') {
      const name = (STITCHES[armed] && STITCHES[armed].name) || 'stitch';
      toast.hidden = false;
      if (armed === 'ch') {
        // chains flow out of the origin in one click — no base to pick
        toast.textContent = `Click to place a ${name} flowing off the origin`;
        hint.textContent = 'Chains flow out of the origin (light blue) · Alt/⌘-click a stitch to work out of it · Esc to leave Insert';
      } else {
        const inserting = !!canvas.getNextStitchId();
        toast.textContent = phase === 'head'
          ? 'Click to set the head'
          : (inserting ? `Inserting ${name} — pick a base` : `Pick a base for ${name} — a stitch or a space`);
        hint.textContent = phase === 'head'
          ? 'The bottom sits in the base; the top follows your cursor · Esc to redo the base'
          : 'Click a stitch head or an orange space · Alt/⌘-click a stitch to work out of it (insert after) · Esc to leave Insert';
      }
    } else {
      toast.hidden = true;
      hint.textContent = 'Drag to move · drag empty space to box-select · scroll to zoom · hold Space to pan · press a stitch key to start';
    }
    const u = container.querySelector('#ed-undo'), r = container.querySelector('#ed-redo');
    if (u) u.disabled = !store.undoStack.length;
    if (r) r.disabled = !store.redoStack.length;
  }

  // ---- data refresh (rows, inspector, legend, name) -----------------------
  function refreshData() {
    const pat = store.currentPattern();
    if (!pat) return;
    const nameInput = container.querySelector('#ed-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = pat.name;
    refreshRounds(pat);
    refreshLegend(pat);
    refreshInspector(pat);
    refreshChrome();
  }

  function refreshRounds(pat) {
    const el = container.querySelector('#ed-rounds');
    const startId = startRoundId(pat);
    const working = pat.rounds.filter((r) => r.id !== startId);
    let html = '';
    if (startId) {
      const startName = (STITCHES[pat.start] && STITCHES[pat.start].name) || 'start marker';
      // Round 0 is the start marker's own row — read-only, can't be worked into.
      html += `<div class="round-row start-row"><span class="round-pick static"><b>Round 0</b><small>${escapeHTML(startName)} · centre</small></span></div>`;
    }
    html += working.map((r) => {
      const count = chainOrder(pat.stitches, r.id).filter((s) => !isStart(s.type)).length;
      const summary = summarizeRound(pat, r.id);
      return `<div class="round-row${r.id === pat.activeRound ? ' on' : ''}" data-round="${r.id}">
        <button class="round-pick" data-round="${r.id}"><b>${escapeHTML(r.name)}</b><small>${count ? escapeHTML(summary) : 'empty'}</small></button>
        <span class="round-acts">
          <button class="mini" data-act="rename" data-round="${r.id}" title="Rename">✎</button>
          ${working.length > 1 ? `<button class="mini" data-act="del" data-round="${r.id}" title="Delete row">×</button>` : ''}
        </span>
      </div>`;
    }).join('');
    el.innerHTML = html;
    el.onclick = (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const id = act.dataset.round;
        if (act.dataset.act === 'rename') { const r = pat.rounds.find((x) => x.id === id); const name = prompt('Row name', r.name); if (name) store.renameRound(id, name); }
        else if (act.dataset.act === 'del') { if (confirm('Delete this row and its stitches?')) { store.removeRound(id); canvas.resetInsert(); } }
        return;
      }
      const pick = e.target.closest('[data-round]');
      if (pick) { store.setActiveRound(pick.dataset.round); canvas.resetInsert(); }
    };
  }

  function refreshLegend(pat) {
    const el = container.querySelector('#ed-legend');
    const seen = [], set = new Set();
    for (const s of pat.stitches) if (!set.has(s.type)) { set.add(s.type); seen.push(s.type); }
    if (!seen.length) { el.innerHTML = '<p class="muted">Place a stitch to build the legend.</p>'; return; }
    el.innerHTML = seen.map((t) => {
      const d = STITCHES[t] || { name: t, abbr: '' };
      return `<div class="legend-row">${glyphSVG(t, 26)}<span>${escapeHTML(d.name)}${d.abbr ? ` (${escapeHTML(d.abbr)})` : ''}</span></div>`;
    }).join('');
  }

  function refreshInspector(pat) {
    const el = container.querySelector('#ed-inspector');
    const sel = [...store.selection];
    const sig = sel.slice().sort().join(',');
    // don't rebuild while the user is interacting with an inspector field
    if (sig === lastSelSig && el.contains(document.activeElement)) return;
    lastSelSig = sig;

    if (!sel.length) {
      el.innerHTML = '<p class="muted">Nothing selected. In <b>Select</b> mode, click a stitch or drag a box. Selected stitches show their origin (blue), base (orange) and head.</p>';
      return;
    }
    const items = sel.map((id) => pat.stitches.find((s) => s.id === id)).filter(Boolean);
    const first = items[0];
    const sameType = items.every((s) => s.type === first.type);
    const post = isRealStitch(first.type) && first.type !== 'ch';
    const chains = items.filter((s) => s.type === 'ch');
    const allAuto = chains.length > 0 && chains.every((s) => s.auto !== false);
    const typeOpts = [...STITCH_ORDER].map((t) => `<option value="${t}"${sameType && t === first.type ? ' selected' : ''}>${escapeHTML(STITCHES[t].name)}</option>`).join('');
    el.innerHTML = `
      <p class="muted">${items.length} stitch${items.length > 1 ? 'es' : ''} selected</p>
      <label class="field">Type
        <select id="insp-type">${sameType ? '' : '<option value="">(mixed)</option>'}${typeOpts}</select>
      </label>
      <label class="field">Colour
        <span class="colorwrap"><input type="color" id="insp-color" value="${first.color || INK}" /><button class="mini" id="insp-color-clear" title="Reset to ink">⟲</button></span>
      </label>
      ${post ? `<label class="field">Length <input type="range" id="insp-len" min="10" max="70" value="${Math.round(first.len || STITCHES[first.type].build().height)}" /></label>` : ''}
      ${chains.length ? `<label class="field check"><input type="checkbox" id="insp-auto" ${allAuto ? 'checked' : ''}/> Auto-position chain${chains.length > 1 ? 's' : ''}</label>` : ''}
      <label class="field check"><input type="checkbox" id="insp-mirror" ${first.mirror ? 'checked' : ''}/> Mirror</label>
      <div class="insp-acts">
        <button class="btn small" id="insp-rotL" title="Rotate -15°">⟲</button>
        <button class="btn small" id="insp-rotR" title="Rotate +15°">⟳</button>
        ${items.length === 1 ? '<button class="btn small" id="insp-origin">Set as origin</button>' : ''}
        <button class="btn small danger" id="insp-del">Delete</button>
      </div>`;

    const q = (s) => el.querySelector(s);
    q('#insp-type').onchange = (e) => { if (e.target.value) store.updateSelection({ type: e.target.value }); };
    q('#insp-color').oninput = (e) => store.updateSelection({ color: e.target.value });
    q('#insp-color-clear').onclick = () => store.updateSelection({ color: null });
    if (q('#insp-len')) q('#insp-len').oninput = (e) => store.updateSelection({ len: +e.target.value });
    if (q('#insp-auto')) q('#insp-auto').onchange = (e) => store.setChainAuto(e.target.checked);
    q('#insp-mirror').onchange = (e) => store.updateSelection({ mirror: e.target.checked });
    q('#insp-rotL').onclick = () => store.rotateSelectionBy(-15);
    q('#insp-rotR').onclick = () => store.rotateSelectionBy(15);
    if (q('#insp-origin')) q('#insp-origin').onclick = () => { canvas.setMode('insert'); canvas.setOrigin && canvas.setOrigin(first.id); };
    q('#insp-del').onclick = () => store.deleteSelection();
  }

  function showHelp() {
    import('./app.js').then((m) => m.openModal(helpHTML()));
  }
  function helpHTML() {
    return `<h2>Designing a granny square</h2>
      <p>This editor recreates your crochet work. Every stitch <b>comes out of</b> an origin and is <b>worked into</b> a base — a stitch head or the space between two stitches. Build on even bases and the chart stays even, no symmetry maths required.</p>
      <ol>
        <li><b>Start:</b> pick a centre (magic ring, etc.). It drops in the middle.</li>
        <li><b>Row:</b> choose which row you're working in the Rows panel (top-right).</li>
        <li><b>Insert:</b> press <kbd>I</kbd> or a stitch key (<kbd>D</kbd>=dc). The origin is highlighted <span class="swatch" style="background:#5cb3ff"></span> light blue.</li>
        <li><b>Base:</b> orange dots <span class="swatch" style="background:#e8830c"></span> mark spaces. Click a space or a stitch head.</li>
        <li><b>Head:</b> click again to place the top. Keep clicking to chain stitches.</li>
        <li><b>Chains:</b> flow out of the origin in a single click — string several to fill the gap between stitches.</li>
        <li><b>Insert after:</b> <kbd>Alt</kbd>/<kbd>⌘</kbd>-click a stitch to set it as origin; the new stitch comes out of it. The next stitch turns <span class="swatch" style="background:#a259ff"></span> purple and everything after greys out — you can see exactly where you're splicing in.</li>
      </ol>
      <h3>Keys</h3>
      <table class="keys">
        <tr><td><kbd>V</kbd> / <kbd>I</kbd></td><td>Select / Insert mode</td></tr>
        <tr><td><kbd>S H D T E</kbd></td><td>arm sc / hdc / dc / tr / dtr</td></tr>
        <tr><td><kbd>C</kbd> / <kbd>L</kbd></td><td>arm chain / slip stitch</td></tr>
        <tr><td><kbd>R</kbd> / <kbd>⇧R</kbd></td><td>rotate selection ±15°</td></tr>
        <tr><td>Arrows</td><td>nudge selection</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>step back / deselect</td></tr>
        <tr><td><kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd></td><td>undo / redo</td></tr>
      </table>`;
  }

  return { show, hide, update };
}
