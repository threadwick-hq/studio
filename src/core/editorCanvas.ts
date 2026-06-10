// The interactive WYSIWYG surface for the granny-square editor. An imperative
// controller that draws the chart into an <svg> and drives the procedural insert
// workflow (origin -> base -> head; alt/cmd-click to work out of a stitch;
// one-click chains that flow off the origin). React mounts it via a ref.

import { clamp, round } from './util';
import { rotatePoint } from './geometry';
import { buildStitchShapes, shapesMarkup, stitchToSVG, topOfStitch, contentBounds } from './render';
import { INK, GHOST, ORIGIN, SPACE, NEXT, SELECT } from './colors';
import {
  pickBase, basePoint, nearestStitch, spacesForRound, successorInRound,
  chainFrom, defaultOriginId, stitchWithinRect,
} from './connectivity';
import { isStart } from './symbols';
import { hasStart, isStartRow } from './model';
import type { Store } from './store';
import type { Stitch, StitchType, Base, BaseHit, Point } from './types';

const NS = 'http://www.w3.org/2000/svg';

export type Mode = 'select' | 'insert' | 'pan';
type Phase = 'base' | 'head';

export interface CanvasController {
  render(): void;
  invalidate(): void;
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  getMode(): Mode;
  setMode(m: Mode): void;
  getArmed(): StitchType;
  setArmed(type: StitchType): void;
  getOriginId(): string | null;
  setOrigin(id: string): void;
  getPhase(): Phase;
  getNextStitchId(): string | null;
  resetInsert(): void;
  escape(): boolean;
  setSpace(v: boolean): void;
  syncView(): void;
  destroy(): void;
}

interface View { scale: number; panX: number; panY: number; }
interface Drag { leadId: string; ox: number; oy: number; startU: Point; moved: boolean; shift: boolean; }
interface Marquee { startU: Point; cur: Point; additive: boolean; base: Set<string>; moved: boolean; }
// Dragging a selected stitch's head/base dot moves that endpoint only; the
// head captured at gesture start stays the pin for base drags (no drift).
interface EndpointDrag { id: string; which: 'head' | 'base'; startU: Point; headAtStart: Point; moved: boolean; }

// Point indicators (heads, bases, spaces) are points: simple filled dots, no
// tinted halo or outline ring.
function mark(pt: Point, color: string, r = 3.2): string {
  return `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="${r}" fill="${color}"/>`;
}
function link(a: Point, b: Point, color: string, dash = '4 3'): string {
  return `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}" opacity="0.85"/>`;
}

export function initCanvas(store: Store, svg: SVGSVGElement, opts: { onChange?: () => void } = {}): CanvasController {
  const onChange = opts.onChange || (() => {});
  const cursorLayer = document.createElementNS(NS, 'g');
  cursorLayer.setAttribute('pointer-events', 'none');

  const pat0 = store.currentPattern();
  let view: View = pat0 ? { ...pat0.view } : { scale: 1.4, panX: 0, panY: 0 };

  let mode: Mode = 'select';
  let armed: StitchType = 'dc';
  let originId: string | null = null;
  let phase: Phase = 'base';
  let pendingBase: BaseHit | null = null;

  let drag: Drag | null = null, panning: { x: number; y: number } | null = null, marquee: Marquee | null = null, spaceDown = false;
  let endpointDrag: EndpointDrag | null = null;
  let lastU: Point = { x: 0, y: 0 };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const pat = () => store.currentPattern();
  const stitches = (): Stitch[] => { const p = pat(); return p ? p.stitches : []; };
  const activeRound = (): string => { const p = pat(); return p ? p.activeRound : ''; };
  const editable = (): boolean => store.currentVersion()?.status === 'draft';

  const rect = () => svg.getBoundingClientRect();
  function toUser(cx: number, cy: number): Point {
    const r = rect();
    return { x: view.panX + (cx - (r.left + r.width / 2)) / view.scale, y: view.panY + (cy - (r.top + r.height / 2)) / view.scale };
  }
  function applyViewBox(): void {
    const r = rect();
    const w = Math.max(1, r.width) / view.scale, h = Math.max(1, r.height) / view.scale;
    svg.setAttribute('viewBox', `${view.panX - w / 2} ${view.panY - h / 2} ${w} ${h}`);
    const p = pat(); if (p) p.view = { ...view };
    scheduleSave();
  }
  function scheduleSave(): void { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.saveLocal(), 500); }

  function resetInsert(): void {
    const p = pat();
    originId = p ? defaultOriginId(p.stitches, p.rounds, p.activeRound) : null;
    phase = 'base'; pendingBase = null;
    onChange();
  }
  function setOrigin(id: string): void {
    if (store.byIdMap().has(id)) { originId = id; phase = 'base'; pendingBase = null; onChange(); scheduleRender(); }
  }
  function nextStitch(): Stitch | null { return successorInRound(stitches(), originId, activeRound()); }

  function styleMap(): Map<string, { color?: string; opacity?: number }> {
    const m = new Map<string, { color?: string; opacity?: number }>();
    const active = activeRound();
    const sel = store.selection;
    for (const s of stitches()) if (s.round !== active && !sel.has(s.id)) m.set(s.id, { opacity: 0.28 });
    if (mode !== 'insert') return m;
    if (originId && store.byIdMap().has(originId)) m.set(originId, { color: ORIGIN });
    const nx = nextStitch();
    if (nx) {
      for (const s of chainFrom(stitches(), nx.id, active)) {
        const cur = m.get(s.id) || {};
        m.set(s.id, { ...cur, opacity: 0.32 });
      }
      m.set(nx.id, { color: NEXT });
    }
    return m;
  }

  function render(): void {
    applyViewBox();
    const sm = styleMap();
    let out = guidesMarkup();
    const pp = pat();
    if (pp && !hasStart(pp)) out += emptyHintMarkup();
    out += '<g class="stitches">';
    // Bucket stitches by opacity tier and apply the opacity ONCE per bucket:
    // group opacity composites the tier as a whole, so overlapping dimmed
    // stitches don't stack alpha (and darken) at their intersections. Dimmer
    // tiers paint first, so full-opacity stitches stay on top.
    const tiers = new Map<number, string>();
    for (const st of stitches()) {
      const sty = sm.get(st.id) || {};
      const op = sty.opacity ?? 1;
      tiers.set(op, (tiers.get(op) || '') + stitchToSVG(st, { interactive: true, color: sty.color }));
    }
    for (const op of [...tiers.keys()].sort((a, b) => a - b)) {
      out += op < 1 ? `<g opacity="${op}">${tiers.get(op)!}</g>` : tiers.get(op)!;
    }
    out += '</g>';
    out += selectionMarkup();
    svg.innerHTML = out;
    svg.appendChild(cursorLayer);
    drawCursor(lastU);
    applyCursor();
  }

  function guidesMarkup(): string {
    return '<g pointer-events="none" stroke="#d9d2c4" stroke-width="1">' +
      '<line x1="-9" y1="0" x2="9" y2="0"/><line x1="0" y1="-9" x2="0" y2="9"/>' +
      '<circle cx="0" cy="0" r="2" fill="#c8bfae" stroke="none"/></g>';
  }

  // a gentle prompt drawn in the empty canvas before a start is chosen
  function emptyHintMarkup(): string {
    return '<g pointer-events="none" opacity="0.55" text-anchor="middle" '
      + 'font-family="system-ui,Segoe UI,Arial">'
      + '<circle cx="0" cy="-30" r="16" fill="none" stroke="#cbb6a6" stroke-width="2.4"/>'
      + '<text x="0" y="6" font-size="15" font-weight="600" fill="#b1a48f">Pick a starting stitch</text>'
      + '<text x="0" y="28" font-size="12" fill="#bcae99">every stitch is worked out from the centre</text></g>';
  }

  function selectionMarkup(): string {
    const sel = store.selection;
    if (!sel.size) return '';
    const byId = store.byIdMap();
    const canEdit = editable();
    let out = '<g pointer-events="none">';
    let handles = '';
    for (const st of stitches()) {
      if (!sel.has(st.id)) continue;
      const head = topOfStitch(st);
      const origin = st.origin ? byId.get(st.origin) : undefined;
      if (origin) out += link(topOfStitch(origin), { x: st.x, y: st.y }, ORIGIN);
      if (canEdit && !isStart(st.type) && st.type !== 'slst') {
        // the base/head dots double as drag handles (a slip stitch is a single
        // point — head, base and body coincide — so it only moves as a whole)
        handles += handle(st.id, 'base', { x: st.x, y: st.y }, SPACE);
        handles += handle(st.id, 'head', head, SELECT);
      } else {
        out += mark({ x: st.x, y: st.y }, SPACE, 3.4);
        out += mark(head, SELECT, 3.4);
      }
    }
    out += '</g>';
    return out + (handles ? `<g class="handles">${handles}</g>` : '');
  }
  function handle(id: string, which: 'head' | 'base', pt: Point, color: string): string {
    return `<g class="handle" data-id="${id}" data-handle="${which}">`
      + `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="9" fill="transparent" pointer-events="all"/>`
      + mark(pt, color, 3.4) + '</g>';
  }

  function clearCursor(): void { cursorLayer.innerHTML = ''; }
  function applyCursor(): void {
    svg.style.cursor = panning ? 'grabbing'
      : (spaceDown || mode === 'pan') ? 'grab'
      : mode === 'insert' ? 'crosshair'
      : 'default';
  }
  function originGlyph(): string {
    const o = originId ? store.byIdMap().get(originId) : undefined;
    if (!o) return '';
    const { shapes } = buildStitchShapes(o.type, o.len);
    const m = o.mirror ? ' scale(-1,1)' : '';
    return `<g transform="translate(${round(o.x)} ${round(o.y)}) rotate(${round(o.rot || 0)})${m}">${shapesMarkup(shapes, ORIGIN)}</g>`;
  }
  function ghostStitch(base: Point, len: number | null, rot: number): string {
    // a faded version of the real stitch (ink at 50%), not a recoloured one
    const { shapes } = buildStitchShapes(armed, len);
    return `<g transform="translate(${round(base.x)} ${round(base.y)}) rotate(${round(rot)})" opacity="0.5">${shapesMarkup(shapes, INK)}</g>`;
  }
  function spaceDots(emphasis: BaseHit | null): string {
    let out = '';
    for (const sp of spacesForRound(stitches(), activeRound())) {
      const isHit = !!emphasis && emphasis.kind === 'space' && emphasis.ids[0] === sp.ids[0] && emphasis.ids[1] === sp.ids[1];
      out += `<circle cx="${round(sp.point.x)}" cy="${round(sp.point.y)}" r="${isHit ? 5 : 3}" fill="${SPACE}" fill-opacity="${isHit ? 1 : 0.5}"/>`;
    }
    return out;
  }

  // The marquee window pane. Drawn from drawCursor too, so the re-renders that
  // selection changes trigger mid-gesture can't wipe it off the cursor layer.
  function marqueeMarkup(): string {
    if (!marquee) return '';
    const { startU: a, cur: b } = marquee;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${GHOST}" fill-opacity="0.08" stroke="${GHOST}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  }

  function drawCursor(u: Point): void {
    lastU = u;
    if (marquee) { cursorLayer.innerHTML = marqueeMarkup(); return; }
    if (mode !== 'insert' || drag || panning) { clearCursor(); return; }
    const p = pat();
    if (!p || isStartRow(p, p.activeRound) || !hasStart(p)) { clearCursor(); return; }
    const og = originGlyph();
    if (armed === 'ch') {
      const o = originId ? store.byIdMap().get(originId) : undefined;
      if (!o) { cursorLayer.innerHTML = ''; return; }
      const oh = topOfStitch(o);
      const rot = (Math.atan2(u.x - oh.x, -(u.y - oh.y)) * 180) / Math.PI;
      cursorLayer.innerHTML = og + ghostStitch(oh, null, rot);
      return;
    }
    if (phase === 'base') {
      const base = pickBase(stitches(), u.x, u.y);
      let out = og + spaceDots(base);
      out += mark(u, SPACE, 2.6);
      if (base && base.kind === 'stitch') out += mark(base.point, SPACE, 5);
      cursorLayer.innerHTML = out;
      return;
    }
    const bp = pendingBase ? (basePoint(store.byIdMap(), toBaseDesc(pendingBase)) || pendingBase.point) : null;
    if (!bp) { cursorLayer.innerHTML = og; return; }
    const dx = u.x - bp.x, dy = u.y - bp.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const o = originId ? store.byIdMap().get(originId) : undefined;
    const linkLine = o ? link(topOfStitch(o), bp, ORIGIN) : '';
    cursorLayer.innerHTML = linkLine + og + ghostStitch(bp, len, rot) + mark(bp, SPACE, 4.5);
  }

  function toBaseDesc(hit: BaseHit): Base {
    return hit.kind === 'stitch' ? { kind: 'stitch', id: hit.id } : { kind: 'space', ids: hit.ids };
  }

  // ---- pointer interaction -------------------------------------------------
  function onDown(e: PointerEvent): void {
    if (e.button === 1 || mode === 'pan' || spaceDown) { startPan(e); return; }
    const u = toUser(e.clientX, e.clientY);
    if (mode === 'insert') { insertDown(e, u); return; }
    selectDown(e, u);
  }

  function insertDown(e: PointerEvent, u: Point): void {
    const p = pat();
    if (!p) return;
    if (isStartRow(p, p.activeRound) || !hasStart(p)) return; // the Start row holds only the start (placed via the palette); nothing else until one exists
    if (e.altKey || e.metaKey) {
      const hit = (e.target as Element).closest('[data-id]');
      const id = hit ? hit.getAttribute('data-id') : (nearestStitch(stitches(), u.x, u.y, 60)?.id ?? null);
      if (id) { setOrigin(id); return; }
    }
    if (armed === 'ch') {
      const o = originId ? store.byIdMap().get(originId) : undefined;
      if (!o) return;
      const oh = topOfStitch(o);
      const rot = (Math.atan2(u.x - oh.x, -(u.y - oh.y)) * 180) / Math.PI;
      const newId = store.placeStitch({ type: 'ch', base: { kind: 'stitch', id: originId! }, x: oh.x, y: oh.y, rot, len: null, originId });
      originId = newId; phase = 'base'; pendingBase = null;
      onChange(); drawCursor(u);
      return;
    }
    if (phase === 'base') {
      const base = pickBase(stitches(), u.x, u.y);
      if (!base) return;
      pendingBase = base; phase = 'head'; onChange(); drawCursor(u); return;
    }
    if (!pendingBase) { resetInsert(); drawCursor(u); return; }
    const bp = basePoint(store.byIdMap(), toBaseDesc(pendingBase)) || pendingBase.point;
    const dx = u.x - bp.x, dy = u.y - bp.y;
    const len = Math.max(2, Math.hypot(dx, dy));
    const rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const newId = store.placeStitch({ type: armed, base: toBaseDesc(pendingBase), x: bp.x, y: bp.y, rot, len, originId });
    originId = newId; phase = 'base'; pendingBase = null;
    onChange(); drawCursor(u);
  }

  // Geometry for dragging a head/base handle. A head drag pins the base (length
  // and rotation follow the cursor); a base drag pins the head. Chains are
  // fixed-size, so EITHER handle rotates them — around the pinned base (head
  // handle) or the pinned head (base handle); only a body drag translates one.
  function endpointPatch(st: Stitch, which: 'head' | 'base', head0: Point, u: Point): { x?: number; y?: number; rot?: number; len?: number } {
    const aim = (x0: number, y0: number, x1: number, y1: number) => (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
    if (st.type === 'ch') {
      if (which === 'head') return { rot: aim(st.x, st.y, u.x, u.y) };
      const rot = aim(u.x, u.y, head0.x, head0.y);
      const built = buildStitchShapes('ch');
      const lh = built.head ?? { x: 0, y: -built.height };
      const off = rotatePoint(lh.x, lh.y, rot);
      return { rot, x: head0.x - off.x, y: head0.y - off.y };
    }
    if (which === 'head') return { len: Math.max(2, Math.hypot(u.x - st.x, u.y - st.y)), rot: aim(st.x, st.y, u.x, u.y) };
    return { x: u.x, y: u.y, len: Math.max(2, Math.hypot(head0.x - u.x, head0.y - u.y)), rot: aim(u.x, u.y, head0.x, head0.y) };
  }

  function selectDown(e: PointerEvent, u: Point): void {
    const hb = (e.target as Element).closest('[data-handle]');
    if (hb) {
      const id = hb.getAttribute('data-id')!;
      const st = store.byIdMap().get(id);
      if (st) {
        endpointDrag = { id, which: hb.getAttribute('data-handle') as 'head' | 'base', startU: u, headAtStart: topOfStitch(st), moved: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = (e.target as Element).closest('[data-id]');
    if (hit) {
      const id = hit.getAttribute('data-id')!;
      const st = store.byIdMap().get(id);
      if (st && isStart(st.type)) return; // the start marker can't be selected or moved
      if (e.shiftKey) store.toggleSelection(id, true);
      else if (!store.selection.has(id)) store.setSelection([id]);
      const lead = store.byIdMap().get(id)!;
      drag = { leadId: id, ox: u.x - lead.x, oy: u.y - lead.y, startU: u, moved: false, shift: e.shiftKey };
      svg.setPointerCapture(e.pointerId);
    } else {
      marquee = { startU: u, cur: u, additive: e.shiftKey, base: e.shiftKey ? new Set(store.selection) : new Set(), moved: false };
      svg.setPointerCapture(e.pointerId);
    }
  }

  function startPan(e: PointerEvent): void { panning = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); applyCursor(); }

  function onMove(e: PointerEvent): void {
    if ((drag || panning || marquee || endpointDrag) && e.buttons === 0) { endGesture(e); return; }
    const u = toUser(e.clientX, e.clientY);
    if (panning) {
      view.panX -= (e.clientX - panning.x) / view.scale;
      view.panY -= (e.clientY - panning.y) / view.scale;
      panning = { x: e.clientX, y: e.clientY };
      applyViewBox(); return;
    }
    if (marquee) {
      marquee.moved = true;
      marquee.cur = u;
      cursorLayer.innerHTML = marqueeMarkup();
      const x0 = Math.min(marquee.startU.x, u.x), y0 = Math.min(marquee.startU.y, u.y);
      const x1 = Math.max(marquee.startU.x, u.x), y1 = Math.max(marquee.startU.y, u.y);
      const ids = new Set(marquee.base);
      // window-pane selection: only stitches FULLY inside (head + base) make it
      for (const st of stitches()) if (!isStart(st.type) && stitchWithinRect(st, x0, y0, x1, y1)) ids.add(st.id);
      store.setSelection([...ids]); return;
    }
    if (endpointDrag) {
      const st = store.byIdMap().get(endpointDrag.id);
      if (!st) { endpointDrag = null; return; }
      if (!endpointDrag.moved) {
        if (Math.hypot(u.x - endpointDrag.startU.x, u.y - endpointDrag.startU.y) * view.scale < 3) return;
        endpointDrag.moved = true; store.dragBegin();
      }
      store.adjustStitch(st.id, endpointPatch(st, endpointDrag.which, endpointDrag.headAtStart, u));
      scheduleRender();
      return;
    }
    if (drag) {
      if (!drag.moved) {
        if (Math.hypot(u.x - drag.startU.x, u.y - drag.startU.y) * view.scale < 3) return;
        drag.moved = true; store.dragBegin();
      }
      const tx = u.x - drag.ox, ty = u.y - drag.oy;
      const lead = store.byIdMap().get(drag.leadId);
      if (lead) { store.dragBy(tx - lead.x, ty - lead.y); scheduleRender(); } // canvas redraws; React flushes at gesture end
      return;
    }
    drawCursor(u);
  }

  function endGesture(e: PointerEvent): void {
    const wasDrag = !!(drag && drag.moved) || !!(endpointDrag && endpointDrag.moved);
    if (drag && !drag.moved && !drag.shift) store.setSelection([drag.leadId]);
    if (marquee && !marquee.moved && !marquee.additive) store.clearSelection();
    if (marquee || drag) clearCursor();
    panning = null; drag = null; marquee = null; endpointDrag = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (wasDrag) store.commitGesture(); // one React/autosave flush after a move-drag
    drawCursor(toUser(e.clientX, e.clientY));
    applyCursor();
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = rect();
    const cxPix = e.clientX - (r.left + r.width / 2), cyPix = e.clientY - (r.top + r.height / 2);
    const u0x = view.panX + cxPix / view.scale, u0y = view.panY + cyPix / view.scale;
    view.scale = clamp(view.scale * Math.exp(-e.deltaY * 0.0012), 0.15, 9);
    view.panX = u0x - cxPix / view.scale;
    view.panY = u0y - cyPix / view.scale;
    applyViewBox();
  }

  const onLeave = () => { if (!marquee && !drag && !panning) clearCursor(); };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', endGesture);
  svg.addEventListener('pointercancel', endGesture);
  svg.addEventListener('pointerleave', onLeave);
  svg.addEventListener('wheel', onWheel, { passive: false });
  const ro = new ResizeObserver(() => applyViewBox());
  ro.observe(svg);

  let rafId = 0;
  function scheduleRender(): void {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; render(); });
  }

  function fit(): void {
    const b = contentBounds(stitches());
    const r = rect();
    const bw = b.maxX - b.minX + 90, bh = b.maxY - b.minY + 90;
    view.scale = clamp(Math.min(r.width / bw, r.height / bh), 0.15, 6);
    view.panX = (b.minX + b.maxX) / 2; view.panY = (b.minY + b.maxY) / 2;
    render();
  }

  resetInsert();
  render();

  return {
    render,
    invalidate: scheduleRender,
    fit,
    zoomIn: () => { view.scale = clamp(view.scale * 1.2, 0.15, 9); applyViewBox(); },
    zoomOut: () => { view.scale = clamp(view.scale / 1.2, 0.15, 9); applyViewBox(); },
    getMode: () => mode,
    setMode(m: Mode) {
      if (m === mode) return;
      mode = m;
      if (m === 'insert') resetInsert(); else clearCursor();
      applyCursor();
      onChange(); scheduleRender();
    },
    getArmed: () => armed,
    setArmed(type: StitchType) { armed = type; if (mode !== 'insert') { mode = 'insert'; resetInsert(); } onChange(); scheduleRender(); drawCursor(lastU); },
    getOriginId: () => originId,
    setOrigin: (id: string) => setOrigin(id),
    getPhase: () => phase,
    getNextStitchId: () => { const n = nextStitch(); return n ? n.id : null; },
    resetInsert() { resetInsert(); scheduleRender(); },
    escape() {
      // Select is the resting mode: Esc steps any other mode back toward it.
      if (mode === 'pan') { this.setMode('select'); return true; }
      if (mode !== 'insert') return false;
      if (phase === 'head') { phase = 'base'; pendingBase = null; onChange(); drawCursor(lastU); return true; }
      this.setMode('select');
      return true;
    },
    setSpace(v: boolean) { spaceDown = v; applyCursor(); },
    syncView() { const p = pat(); if (p) view = { ...p.view }; applyViewBox(); },
    destroy() {
      try { ro.disconnect(); } catch { /* gone */ }
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(saveTimer);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', endGesture);
      svg.removeEventListener('pointercancel', endGesture);
      svg.removeEventListener('pointerleave', onLeave);
      svg.removeEventListener('wheel', onWheel);
      svg.innerHTML = '';
    },
  };
}
