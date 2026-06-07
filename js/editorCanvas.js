// editorCanvas.js — the interactive WYSIWYG surface for the granny-square editor.
//
// It renders the chart through the shared renderer and drives the procedural
// insert workflow described in the mental model:
//
//   • Every new stitch comes out of an ORIGIN (light blue) and is worked into a
//     BASE — a stitch head or a computed SPACE (orange dots).
//   • Insert is two clicks: pick the base, then click to set the head; the
//     bottom of the marker is the base, the top is where you click.
//   • Alt/Cmd-click re-anchors the origin mid-round; the stitch worked out of it
//     ("next stitch") turns purple and everything after it greys out, so you can
//     see exactly where you're splicing in.

import { clamp, round } from './util.js';
import {
  buildStitchShapes, shapesMarkup, stitchToSVG, topOfStitch, contentBounds,
} from './render.js';
import {
  pickBase, basePoint, nearestStitch, spacesForRound, successorInRound,
  chainFrom, defaultOriginId,
} from './connectivity.js';
import { isStart } from './symbols.js';

const NS = 'http://www.w3.org/2000/svg';
const GHOST = '#2f7bff';
const ORIGIN = '#5cb3ff';  // light blue — where the stitch comes from
const SPACE = '#e8830c';   // orange — a space / base you can work into
const NEXT = '#a259ff';    // purple — the next stitch an insert pushes forward
const SELECT = '#2f7bff';

function mark(pt, color, r = 4) {
  return `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="${r}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1.6"/>`;
}
function ring(pt, color, r = 4.5) {
  return `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.6"/>`;
}
function link(a, b, color, dash = '4 3') {
  return `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}" opacity="0.85"/>`;
}

export function initCanvas(store, svg, opts = {}) {
  const onChange = opts.onChange || (() => {});
  const cursorLayer = document.createElementNS(NS, 'g');
  cursorLayer.setAttribute('pointer-events', 'none');

  const pat0 = store.currentPattern();
  let view = pat0 ? { ...pat0.view } : { scale: 1.4, panX: 0, panY: 0 };

  let mode = 'select';
  let armed = 'dc';
  let originId = null;     // current working origin
  let phase = 'base';      // 'base' -> 'head'
  let pendingBase = null;  // base chosen on the first click

  let drag = null, panning = null, marquee = null, spaceDown = false;
  let lastU = { x: 0, y: 0 };
  let saveTimer = null;

  const pat = () => store.currentPattern();
  const stitches = () => (pat() ? pat().stitches : []);
  const activeRound = () => (pat() ? pat().activeRound : null);

  // ---- coordinate transforms ----------------------------------------------
  const rect = () => svg.getBoundingClientRect();
  function toUser(cx, cy) {
    const r = rect();
    return { x: view.panX + (cx - (r.left + r.width / 2)) / view.scale, y: view.panY + (cy - (r.top + r.height / 2)) / view.scale };
  }
  function applyViewBox() {
    const r = rect();
    const w = Math.max(1, r.width) / view.scale, h = Math.max(1, r.height) / view.scale;
    svg.setAttribute('viewBox', `${view.panX - w / 2} ${view.panY - h / 2} ${w} ${h}`);
    const p = pat(); if (p) p.view = { ...view };
    scheduleSave();
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.saveLocal(), 500); }

  // ---- insert-state helpers ------------------------------------------------
  function resetInsert() {
    const p = pat();
    originId = p ? defaultOriginId(p.stitches, p.rounds, p.activeRound) : null;
    phase = 'base';
    pendingBase = null;
    onChange();
  }
  function setOrigin(id) {
    if (store.byIdMap().has(id)) { originId = id; phase = 'base'; pendingBase = null; onChange(); scheduleRender(); }
  }
  // the "next stitch" (purple) for the current origin, within the active round
  function nextStitch() { return successorInRound(stitches(), originId, activeRound()); }

  // ---- chart rendering -----------------------------------------------------
  function styleMap() {
    // per-stitch visual overrides. The active row is the focus: stitches in
    // every other row fade back so the row you're working on stands out.
    const m = new Map();
    const active = activeRound();
    const sel = store.selection;
    for (const s of stitches()) {
      if (s.round !== active && !sel.has(s.id)) m.set(s.id, { opacity: 0.28 });
    }
    if (mode !== 'insert') return m;
    // origin (where the next stitch comes from) — light blue, kept fully visible
    if (originId && store.byIdMap().has(originId)) m.set(originId, { color: ORIGIN });
    const nx = nextStitch();
    if (nx) {
      // grey everything from the next stitch onward; tint the next stitch purple
      for (const s of chainFrom(stitches(), nx.id, active)) {
        const cur = m.get(s.id) || {};
        m.set(s.id, { ...cur, opacity: 0.32 });
      }
      m.set(nx.id, { color: NEXT });
    }
    return m;
  }

  function render() {
    applyViewBox();
    const sm = styleMap();
    let out = guidesMarkup();
    out += '<g class="stitches">';
    for (const st of stitches()) {
      const sty = sm.get(st.id) || {};
      out += stitchToSVG(st, { interactive: true, color: sty.color, opacity: sty.opacity });
    }
    out += '</g>';
    out += selectionMarkup();
    svg.innerHTML = out;
    svg.appendChild(cursorLayer);
    drawCursor(lastU);
  }

  function guidesMarkup() {
    // a faint centre crosshair so the middle of the work is always findable
    return '<g pointer-events="none" stroke="#d9d2c4" stroke-width="1">' +
      '<line x1="-9" y1="0" x2="9" y2="0"/><line x1="0" y1="-9" x2="0" y2="9"/>' +
      '<circle cx="0" cy="0" r="2" fill="#c8bfae" stroke="none"/></g>';
  }

  function selectionMarkup() {
    const sel = store.selection;
    if (!sel.size) return '';
    const byId = store.byIdMap();
    let out = '<g pointer-events="none">';
    for (const st of stitches()) {
      if (!sel.has(st.id)) continue;
      out += `<circle cx="${round(st.x)}" cy="${round(st.y)}" r="10" fill="${SELECT}" fill-opacity="0.16" stroke="${SELECT}" stroke-width="1.4"/>`;
      // reveal the framework: origin link (blue), base (orange), head (blue)
      const head = topOfStitch(st);
      out += mark({ x: st.x, y: st.y }, SPACE, 3.2);
      out += mark(head, SELECT, 3.2);
      if (st.origin && byId.get(st.origin)) {
        const oh = topOfStitch(byId.get(st.origin));
        out += link(oh, { x: st.x, y: st.y }, ORIGIN);
      }
    }
    return out + '</g>';
  }

  // ---- cursor / ghost layer (no full re-render on move) --------------------
  function clearCursor() { cursorLayer.innerHTML = ''; }
  function originGlyph() {
    const o = store.byIdMap().get(originId);
    if (!o) return '';
    const { shapes } = buildStitchShapes(o.type, o.len);
    const m = o.mirror ? ' scale(-1,1)' : '';
    return `<g transform="translate(${round(o.x)} ${round(o.y)}) rotate(${round(o.rot || 0)})${m}">${shapesMarkup(shapes, ORIGIN)}</g>`;
  }
  function ghostStitch(base, len, rot) {
    const { shapes } = buildStitchShapes(armed, len);
    return `<g transform="translate(${round(base.x)} ${round(base.y)}) rotate(${round(rot)})" opacity="0.62">${shapesMarkup(shapes, GHOST)}</g>`;
  }
  function spaceDots(emphasis) {
    let out = '';
    for (const sp of spacesForRound(stitches(), activeRound())) {
      const isHit = emphasis && emphasis.kind === 'space' && emphasis.ids[0] === sp.ids[0] && emphasis.ids[1] === sp.ids[1];
      out += `<circle cx="${round(sp.point.x)}" cy="${round(sp.point.y)}" r="${isHit ? 5 : 3}" fill="${SPACE}" fill-opacity="${isHit ? 0.5 : 0.22}" stroke="${SPACE}" stroke-width="${isHit ? 1.6 : 1}"/>`;
    }
    return out;
  }

  function drawCursor(u) {
    lastU = u;
    if (mode !== 'insert' || drag || marquee || panning) { clearCursor(); return; }
    const og = originGlyph();
    if (armed === 'ch') {
      // chain ghost: flows off the origin head toward the cursor
      const o = store.byIdMap().get(originId);
      if (!o) { cursorLayer.innerHTML = ''; return; }
      const oh = topOfStitch(o);
      const rot = (Math.atan2(u.x - oh.x, -(u.y - oh.y)) * 180) / Math.PI;
      cursorLayer.innerHTML = og + ghostStitch(oh, null, rot);
      return;
    }
    if (phase === 'base') {
      const base = pickBase(stitches(), u.x, u.y);
      let out = og + spaceDots(base);
      out += ring(u, SPACE, 3);
      if (base && base.kind === 'stitch') out += mark(base.point, SPACE, 5);
      cursorLayer.innerHTML = out;
      return;
    }
    // head phase: base locked; draw the new stitch from base to the cursor
    const bp = basePoint(store.byIdMap(), pendingBase) || pendingBase?.point;
    if (!bp) { cursorLayer.innerHTML = og; return; }
    const dx = u.x - bp.x, dy = u.y - bp.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const o = store.byIdMap().get(originId);
    const linkLine = o ? link(topOfStitch(o), bp, ORIGIN) : '';
    cursorLayer.innerHTML = linkLine + og + ghostStitch(bp, len, rot) + mark(bp, SPACE, 4.5);
  }

  // ---- pointer interaction -------------------------------------------------
  function onDown(e) {
    if (e.button === 1 || mode === 'pan' || spaceDown) { startPan(e); return; }
    const u = toUser(e.clientX, e.clientY);
    if (mode === 'insert') return insertDown(e, u);
    selectDown(e, u);
  }

  function insertDown(e, u) {
    // alt / cmd click re-anchors the origin (the new stitch comes out of it)
    if (e.altKey || e.metaKey) {
      const hit = e.target.closest('[data-id]');
      const id = hit ? hit.getAttribute('data-id') : (nearestStitch(stitches(), u.x, u.y, 60) || {}).id;
      if (id) { setOrigin(id); return; }
    }
    // Chains are special: they flow OUT of the origin in a single click. The
    // base (right point) buffers off the origin's head; the head (left point)
    // points at the cursor, so a string of chains lies between the stitches.
    if (armed === 'ch') {
      const o = store.byIdMap().get(originId);
      if (!o) return; // a chain needs something to come out of
      const oh = topOfStitch(o);
      const rot = (Math.atan2(u.x - oh.x, -(u.y - oh.y)) * 180) / Math.PI;
      const newId = store.placeStitch({ type: 'ch', base: { kind: 'stitch', id: originId }, x: oh.x, y: oh.y, rot, len: null, originId });
      originId = newId; phase = 'base'; pendingBase = null;
      onChange(); drawCursor(u);
      return;
    }
    if (phase === 'base') {
      const base = pickBase(stitches(), u.x, u.y);
      if (!base) return; // nothing to work into yet
      pendingBase = base; phase = 'head'; onChange(); drawCursor(u); return;
    }
    // head phase -> commit the stitch
    const bp = basePoint(store.byIdMap(), pendingBase) || pendingBase.point;
    const dx = u.x - bp.x, dy = u.y - bp.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const newId = store.placeStitch({ type: armed, base: pendingBase, x: bp.x, y: bp.y, rot, len, originId });
    originId = newId; phase = 'base'; pendingBase = null;
    onChange();
    drawCursor(u);
  }

  function selectDown(e, u) {
    const hit = e.target.closest('[data-id]');
    if (hit) {
      const id = hit.getAttribute('data-id');
      const st = store.byIdMap().get(id);
      if (st && isStart(st.type)) return; // the start marker can't be selected or moved
      if (e.shiftKey) store.toggleSelection(id, true);
      else if (!store.selection.has(id)) store.setSelection([id]);
      const lead = store.byIdMap().get(id);
      drag = { leadId: id, ox: u.x - lead.x, oy: u.y - lead.y, startU: u, moved: false, shift: e.shiftKey };
      svg.setPointerCapture(e.pointerId);
    } else {
      marquee = { startU: u, additive: e.shiftKey, base: e.shiftKey ? new Set(store.selection) : new Set(), moved: false };
      svg.setPointerCapture(e.pointerId);
    }
  }

  function startPan(e) { panning = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); }

  function onMove(e) {
    if ((drag || panning || marquee) && e.buttons === 0) { endGesture(e); return; }
    const u = toUser(e.clientX, e.clientY);
    if (panning) {
      view.panX -= (e.clientX - panning.x) / view.scale;
      view.panY -= (e.clientY - panning.y) / view.scale;
      panning = { x: e.clientX, y: e.clientY };
      applyViewBox();
      return;
    }
    if (marquee) {
      marquee.moved = true;
      const x0 = Math.min(marquee.startU.x, u.x), y0 = Math.min(marquee.startU.y, u.y);
      const w = Math.abs(u.x - marquee.startU.x), h = Math.abs(u.y - marquee.startU.y);
      cursorLayer.innerHTML = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${GHOST}" fill-opacity="0.08" stroke="${GHOST}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      const ids = new Set(marquee.base);
      for (const st of stitches()) if (!isStart(st.type) && st.x >= x0 && st.x <= x0 + w && st.y >= y0 && st.y <= y0 + h) ids.add(st.id);
      store.setSelection([...ids]);
      return;
    }
    if (drag) {
      if (!drag.moved) {
        if (Math.hypot(u.x - drag.startU.x, u.y - drag.startU.y) * view.scale < 3) return;
        drag.moved = true;
        store.dragBegin();
      }
      const tx = u.x - drag.ox, ty = u.y - drag.oy;
      const lead = store.byIdMap().get(drag.leadId);
      if (lead) store.dragBy(tx - lead.x, ty - lead.y);
      return;
    }
    drawCursor(u);
  }

  function endGesture(e) {
    if (drag && !drag.moved && !drag.shift) store.setSelection([drag.leadId]);
    if (marquee && !marquee.moved && !marquee.additive) store.clearSelection();
    if (marquee || drag) clearCursor();
    panning = null; drag = null; marquee = null;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    drawCursor(toUser(e.clientX, e.clientY));
  }

  function onWheel(e) {
    e.preventDefault();
    const r = rect();
    const cxPix = e.clientX - (r.left + r.width / 2), cyPix = e.clientY - (r.top + r.height / 2);
    const u0x = view.panX + cxPix / view.scale, u0y = view.panY + cyPix / view.scale;
    view.scale = clamp(view.scale * Math.exp(-e.deltaY * 0.0012), 0.15, 9);
    view.panX = u0x - cxPix / view.scale;
    view.panY = u0y - cyPix / view.scale;
    applyViewBox();
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', endGesture);
  svg.addEventListener('pointercancel', endGesture);
  svg.addEventListener('pointerleave', () => { if (!marquee && !drag && !panning) clearCursor(); });
  svg.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(() => applyViewBox());
  ro.observe(svg);

  // Coalesce re-renders into one per frame (so a live drag, which fires every
  // pointermove, doesn't rebuild the chart repeatedly). The editor view calls
  // invalidate() on store changes; canvas-local state changes call it directly.
  let renderQueued = false;
  const raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (f) => setTimeout(f, 16);
  function scheduleRender() { if (renderQueued) return; renderQueued = true; raf(() => { renderQueued = false; render(); }); }

  // ---- view helpers --------------------------------------------------------
  function fit() {
    const b = contentBounds(stitches());
    const r = rect();
    const bw = b.maxX - b.minX + 90, bh = b.maxY - b.minY + 90;
    view.scale = clamp(Math.min(r.width / bw, r.height / bh), 0.15, 6);
    view.panX = (b.minX + b.maxX) / 2; view.panY = (b.minY + b.maxY) / 2;
    render();
  }

  // ---- public API ----------------------------------------------------------
  resetInsert();
  render();

  return {
    render,
    invalidate: scheduleRender,
    fit,
    zoomIn: () => { view.scale = clamp(view.scale * 1.2, 0.15, 9); applyViewBox(); },
    zoomOut: () => { view.scale = clamp(view.scale / 1.2, 0.15, 9); applyViewBox(); },
    getMode: () => mode,
    setMode(m) {
      if (m === mode) return;
      mode = m;
      if (m === 'insert') resetInsert(); else clearCursor();
      onChange(); scheduleRender();
    },
    getArmed: () => armed,
    setArmed(type) { armed = type; if (mode !== 'insert') { mode = 'insert'; resetInsert(); } onChange(); scheduleRender(); drawCursor(lastU); },
    getOriginId: () => originId,
    setOrigin: (id) => setOrigin(id),
    getPhase: () => phase,
    getNextStitchId: () => { const n = nextStitch(); return n ? n.id : null; },
    resetInsert() { resetInsert(); scheduleRender(); },
    escape() {
      if (mode !== 'insert') return false;
      if (phase === 'head') { phase = 'base'; pendingBase = null; onChange(); drawCursor(lastU); return true; }
      // already at base: leave insert mode
      this.setMode('select');
      return true;
    },
    setSpace(v) { spaceDown = v; },
    syncView() { const p = pat(); if (p) view = { ...p.view }; applyViewBox(); },
    destroy() {
      try { ro.disconnect(); } catch {}
      clearTimeout(saveTimer);
      svg.replaceWith(svg.cloneNode(false)); // drop all listeners
    },
  };
}
