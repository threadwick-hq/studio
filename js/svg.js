// svg.js — the one and only renderer.
//
// It turns chart state into SVG *markup strings*. There is intentionally no
// DOM here: the live editor injects the inner markup via innerHTML (and reads
// back data-id attributes for hit-testing), while SVG/PNG/PDF export reuse the
// exact same output. One renderer => the editor is a true WYSIWYG preview of
// what gets exported.

import { STITCHES, getStitch, isRealStitch } from './stitches.js';
import { buildCluster } from './clusters.js';
import { rotatePoint } from './geometry.js';
import { round, escapeXML } from './util.js';

export const INK = '#1c1c1c';
const SW = 2.4; // stroke width in user units (scales with the view)

// ---- shape -> markup -------------------------------------------------------

function shapeToSVG(s, color) {
  const stroke = `stroke="${color}" stroke-width="${SW}" stroke-linecap="round" fill="none"`;
  switch (s.k) {
    case 'line':
      return `<line x1="${round(s.x1)}" y1="${round(s.y1)}" x2="${round(s.x2)}" y2="${round(s.y2)}" ${stroke}/>`;
    case 'ellipse':
      return `<ellipse cx="${round(s.cx)}" cy="${round(s.cy)}" rx="${round(s.rx)}" ry="${round(s.ry)}" ${stroke}/>`;
    case 'circle':
      return `<circle cx="${round(s.cx)}" cy="${round(s.cy)}" r="${round(s.r)}" ${stroke}/>`;
    case 'dot':
      return `<circle cx="${round(s.cx)}" cy="${round(s.cy)}" r="${round(s.r)}" fill="${color}"/>`;
    case 'path':
      return s.fill
        ? `<path d="${s.d}" fill="${color}"/>`
        : `<path d="${s.d}" ${stroke}/>`;
    case 'group':
      return `<g transform="rotate(${round(s.rot)})">${s.shapes.map((x) => shapeToSVG(x, color)).join('')}</g>`;
    default:
      return '';
  }
}

export function shapesMarkup(shapes, color = INK) {
  return shapes.map((s) => shapeToSVG(s, color)).join('');
}

// ---- resolving a stitch type to primitives --------------------------------

export function buildStitchShapes(type, clusterMap, len) {
  if (STITCHES[type]) return STITCHES[type].build(len);
  const def = clusterMap && clusterMap[type];
  if (def) return buildCluster(def);
  return STITCHES.dc.build(len);
}

// ---- connectivity geometry ------------------------------------------------
// A stitch's HEAD: the end of its line (top bar / dot / 2nd chain point), in
// world space. Its BASE is simply its anchor (st.x, st.y).
export function topOfStitch(st, clusterMap) {
  const h = buildStitchShapes(st.type, clusterMap, st.len).height || 0;
  const p = rotatePoint(0, -h, st.rot || 0);
  return { x: st.x + p.x, y: st.y + p.y };
}

// Resolve a point to the base it should attach to: the nearest stitch HEAD, or
// the SPACE between the two nearest *real* stitch heads (chains/slip-stitches
// excluded). Returns { kind:'stitch', id } | { kind:'space', ids:[a,b] } | null.
export function pickBase(stitches, x, y, clusterMap, maxD = 90) {
  const tops = stitches
    .map((s) => { const pt = topOfStitch(s, clusterMap); return { s, pt, d: Math.hypot(pt.x - x, pt.y - y) }; })
    .sort((a, b) => a.d - b.d);
  if (!tops.length) return null;
  const head = tops[0].d <= maxD ? tops[0] : null;
  let space = null;
  const real = tops.filter((t) => isRealStitch(t.s.type));
  if (real.length >= 2) {
    const a = real[0], b = real[1];
    if (Math.hypot(a.pt.x - b.pt.x, a.pt.y - b.pt.y) <= maxD) {
      const mx = (a.pt.x + b.pt.x) / 2, my = (a.pt.y + b.pt.y) / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d <= maxD) space = { ids: [a.s.id, b.s.id], d };
    }
  }
  if (space && (!head || space.d <= head.d)) return { kind: 'space', ids: space.ids };
  if (head) return { kind: 'stitch', id: head.s.id };
  return null;
}

// Nearest stitch (by head) to a point — used to pick the origin.
export function nearestStitch(stitches, x, y, clusterMap, maxD = Infinity) {
  let best = null, bd = Infinity;
  for (const s of stitches) {
    const pt = topOfStitch(s, clusterMap);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best && bd <= maxD ? best : null;
}

export function labelFor(type, clusterMap) {
  if (STITCHES[type]) {
    const s = STITCHES[type];
    return { name: s.name, abbr: s.abbr };
  }
  const def = clusterMap && clusterMap[type];
  if (def) return { name: def.name || 'Custom cluster', abbr: def.abbr || '' };
  return { name: type, abbr: '' };
}

// ---- a single placed stitch ----------------------------------------------

function stitchToSVG(st, clusterMap, { interactive } = {}) {
  const { shapes, height } = buildStitchShapes(st.type, clusterMap, st.len);
  const color = st.color || INK;
  const inner = shapes.map((s) => shapeToSVG(s, color)).join('');
  const mirror = st.mirror ? ' scale(-1,1)' : '';
  const tf = `translate(${round(st.x)} ${round(st.y)}) rotate(${round(st.rot || 0)})${mirror}`;
  if (!interactive) return `<g transform="${tf}">${inner}</g>`;
  // Self-contained invisible hit target (fill:none + pointer-events:all needs no
  // CSS): a slim capsule along the post so dense rings of tall stitches don't
  // overlap and steal each other's clicks.
  const hit = height > 4
    ? `<rect class="hit" x="-8" y="${round(-height - 6)}" width="16" height="${round(height + 12)}" rx="8" fill="none" pointer-events="all"/>`
    : `<circle class="hit" cx="0" cy="0" r="11" fill="none" pointer-events="all"/>`;
  return `<g data-id="${st.id}" class="stitch" transform="${tf}">${hit}${inner}</g>`;
}

// ---- glyphs (palette + legend) -------------------------------------------

// A square viewBox centred on the glyph's actual geometry, so every symbol
// (tall posts, low ovals, the magic ring) renders centred and undistorted in a
// square palette/legend cell.
function glyphViewBox(shapes, height) {
  let b = shapesBBox(shapes);
  if (b.minX > b.maxX) b = { minX: -10, minY: -Math.max(height, 12), maxX: 10, maxY: 6 };
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 8) + 14;
  return `${round(cx - size / 2)} ${round(cy - size / 2)} ${round(size)} ${round(size)}`;
}

export function glyphSVG(type, clusterMap, px = 42, color = INK) {
  const { shapes, height } = buildStitchShapes(type, clusterMap);
  const inner = shapes.map((s) => shapeToSVG(s, color)).join('');
  return `<svg class="glyph" width="${px}" height="${px}" viewBox="${glyphViewBox(shapes, height)}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// ---- bounds ---------------------------------------------------------------

function expandBox(b, x, y) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

// Local bounding box of a shape-descriptor list, including nested rotated
// groups (cluster legs) and curved paths (bobbles). Conservative — control
// points of curves are included, which only over-estimates slightly.
function shapesBBox(shapes) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of shapes) {
    switch (s.k) {
      case 'line': expandBox(b, s.x1, s.y1); expandBox(b, s.x2, s.y2); break;
      case 'ellipse': expandBox(b, s.cx - s.rx, s.cy - s.ry); expandBox(b, s.cx + s.rx, s.cy + s.ry); break;
      case 'circle':
      case 'dot': expandBox(b, s.cx - s.r, s.cy - s.r); expandBox(b, s.cx + s.r, s.cy + s.r); break;
      case 'path': {
        const nums = (s.d.match(/-?\d*\.?\d+/g) || []).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) expandBox(b, nums[i], nums[i + 1]);
        break;
      }
      case 'group': {
        const cb = shapesBBox(s.shapes);
        if (cb.minX <= cb.maxX) {
          for (const [cx, cy] of [[cb.minX, cb.minY], [cb.maxX, cb.minY], [cb.maxX, cb.maxY], [cb.minX, cb.maxY]]) {
            const p = rotatePoint(cx, cy, s.rot || 0);
            expandBox(b, p.x, p.y);
          }
        }
        break;
      }
    }
  }
  return b;
}

// World-space bounds of a placed stitch: its true local bbox (so wide shells
// and decreases are measured correctly), transformed by mirror + rotation.
function stitchExtent(st, clusterMap) {
  const { shapes, height } = buildStitchShapes(st.type, clusterMap, st.len);
  let lb = shapesBBox(shapes);
  if (lb.minX > lb.maxX) lb = { minX: -8, minY: -Math.max(height, 12), maxX: 8, maxY: 6 };
  const rot = st.rot || 0;
  const sx = st.mirror ? -1 : 1;
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [cx, cy] of [[lb.minX, lb.minY], [lb.maxX, lb.minY], [lb.maxX, lb.maxY], [lb.minX, lb.maxY]]) {
    const p = rotatePoint(cx * sx, cy, rot);
    expandBox(out, st.x + p.x, st.y + p.y);
  }
  const pad = 5;
  return { minX: out.minX - pad, minY: out.minY - pad, maxX: out.maxX + pad, maxY: out.maxY + pad };
}

export function contentBounds(stitches, clusterMap) {
  if (!stitches.length) return { minX: -200, minY: -200, maxX: 200, maxY: 200 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const st of stitches) {
    const e = stitchExtent(st, clusterMap);
    if (e.minX < minX) minX = e.minX;
    if (e.minY < minY) minY = e.minY;
    if (e.maxX > maxX) maxX = e.maxX;
    if (e.maxY > maxY) maxY = e.maxY;
  }
  return { minX, minY, maxX, maxY };
}

// ---- guides (editor only) -------------------------------------------------

function guidesSVG(opts) {
  const {
    rings = [],
    spokeCount = 0,
    spokeMax = 260,
    showGrid = false,
    gridStep = 24,
    gridExtent = 280,
    showCenter = true,
  } = opts;
  let out = '<g class="guides" fill="none" stroke="#cfd8e3" stroke-width="1">';
  if (showGrid) {
    for (let x = -gridExtent; x <= gridExtent; x += gridStep) {
      out += `<line x1="${x}" y1="${-gridExtent}" x2="${x}" y2="${gridExtent}" stroke="#e7edf4"/>`;
    }
    for (let y = -gridExtent; y <= gridExtent; y += gridStep) {
      out += `<line x1="${-gridExtent}" y1="${y}" x2="${gridExtent}" y2="${y}" stroke="#e7edf4"/>`;
    }
  }
  for (const r of rings) {
    out += `<circle cx="0" cy="0" r="${round(r)}" stroke="#d6deea" stroke-dasharray="3 4"/>`;
  }
  if (spokeCount > 0) {
    for (let k = 0; k < spokeCount; k++) {
      const a = (k * 360) / spokeCount;
      const p = rotatePoint(spokeMax, 0, a);
      out += `<line x1="0" y1="0" x2="${round(p.x)}" y2="${round(p.y)}" stroke="#e1e8f1" stroke-dasharray="2 5"/>`;
    }
  }
  if (showCenter) {
    out += '<circle cx="0" cy="0" r="2.4" fill="#9fb0c4" stroke="none"/>';
  }
  return out + '</g>';
}

function anchorsSVG(stitches) {
  let out = '<g class="anchors" stroke="none" fill="#f06a3a">';
  for (const st of stitches) {
    out += `<circle cx="${round(st.x)}" cy="${round(st.y)}" r="2" opacity="0.8"/>`;
  }
  return out + '</g>';
}

function selectionSVG(stitches, selection) {
  if (!selection || !selection.size) return '';
  let out = '<g class="selection" fill="none">';
  for (const st of stitches) {
    if (!selection.has(st.id)) continue;
    out += `<circle cx="${round(st.x)}" cy="${round(st.y)}" r="9" fill="#2f7bff" fill-opacity="0.18" stroke="#2f7bff" stroke-width="1.4"/>`;
  }
  return out + '</g>';
}

// For each selected stitch, reveal its origin (light blue, with a link), base
// (orange, its anchor) and head (blue, its end) — the framework made visible.
function connectionsSVG(stitches, selection, clusterMap) {
  if (!selection || !selection.size) return '';
  const byId = new Map(stitches.map((s) => [s.id, s]));
  const mk = (pt, color, label) =>
    `<circle cx="${round(pt.x)}" cy="${round(pt.y)}" r="3.5" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="1.6"/>` +
    `<text x="${round(pt.x) + 6}" y="${round(pt.y) + 3}" font-size="9" font-weight="700" fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="2.5">${label}</text>`;
  let out = '<g class="connections" pointer-events="none">';
  for (const st of stitches) {
    if (!selection.has(st.id)) continue;
    const base = { x: st.x, y: st.y };
    const head = topOfStitch(st, clusterMap);
    const origin = st.origin && byId.get(st.origin);
    if (origin) {
      const oh = topOfStitch(origin, clusterMap);
      out += `<line x1="${round(oh.x)}" y1="${round(oh.y)}" x2="${round(base.x)}" y2="${round(base.y)}" stroke="#5cb3ff" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.8"/>`;
      out += mk(oh, '#5cb3ff', 'origin');
    }
    out += mk(base, '#e8830c', 'base');
    out += mk(head, '#2f7bff', 'head');
  }
  return out + '</g>';
}

// ---- legend ---------------------------------------------------------------

function usedTypes(stitches) {
  const seen = new Set();
  const order = [];
  for (const st of stitches) {
    if (!seen.has(st.type)) {
      seen.add(st.type);
      order.push(st.type);
    }
  }
  return order;
}

function legendSVG(stitches, clusterMap, x, y, color) {
  const types = usedTypes(stitches);
  const rowH = 34;
  let out = `<g class="legend" transform="translate(${round(x)} ${round(y)})">`;
  out += `<text x="0" y="-12" font-family="system-ui,Segoe UI,Arial" font-size="15" font-weight="700" fill="${color}">Legend</text>`;
  types.forEach((type, i) => {
    const ry = i * rowH;
    const { shapes, height } = buildStitchShapes(type, clusterMap);
    const inner = shapes.map((s) => shapeToSVG(s, color)).join('');
    const lbl = labelFor(type, clusterMap);
    const text = lbl.abbr ? `${lbl.name} (${lbl.abbr})` : lbl.name;
    out += `<svg x="0" y="${ry}" width="30" height="30" viewBox="${glyphViewBox(shapes, height)}">${inner}</svg>`;
    out += `<text x="40" y="${ry + 20}" font-family="system-ui,Segoe UI,Arial" font-size="14" fill="${color}">${escapeXML(text)}</text>`;
  });
  return { markup: out + '</g>', height: types.length * rowH + 12, count: types.length };
}

// Estimated pixel width of the legend block (glyph + widest label), so the
// export viewBox can be widened to avoid clipping long labels on the right.
function legendWidth(stitches, clusterMap) {
  const types = usedTypes(stitches);
  if (!types.length) return 0;
  let maxChars = 7;
  for (const t of types) {
    const l = labelFor(t, clusterMap);
    const s = l.abbr ? `${l.name} (${l.abbr})` : l.name;
    if (s.length > maxChars) maxChars = s.length;
  }
  return 40 + maxChars * 7.6 + 16;
}

// ---- assembly -------------------------------------------------------------

// Inner markup only — used by the live editor (svgEl.innerHTML = chartInner()).
export function chartInner(state, opts = {}) {
  const clusterMap = state.clusterMap || {};
  let out = '';
  if (opts.includeGuides) out += guidesSVG(opts.guides || {});
  out += '<g class="stitches">';
  for (const st of state.stitches) out += stitchToSVG(st, clusterMap, { interactive: true });
  out += '</g>';
  if (opts.showAnchors) out += anchorsSVG(state.stitches);
  out += selectionSVG(state.stitches, opts.selection);
  out += connectionsSVG(state.stitches, opts.selection, clusterMap);
  return out;
}

// Full standalone <svg> — used by SVG/PNG/PDF export.
export function chartToSVG(state, opts = {}) {
  const clusterMap = state.clusterMap || {};
  const {
    padding = 28,
    background = '#ffffff',
    legend = true,
    title = state.title || '',
    color = INK,
    scale = 1,
  } = opts;

  const showLegend = legend && state.stitches.length > 0;
  const b = contentBounds(state.stitches, clusterMap);
  let minX = b.minX - padding;
  let minY = b.minY - padding;
  let maxX = b.maxX + padding;
  let maxY = b.maxY + padding;

  const titleH = title ? 52 : 0;
  minY -= titleH;

  // Widen horizontally so a long legend label or a centred title can't fall
  // outside the viewBox and get clipped.
  if (showLegend) maxX = Math.max(maxX, minX + padding + legendWidth(state.stitches, clusterMap));
  if (title) {
    const titleW = title.length * 14.5 + 24;
    const span = maxX - minX;
    if (titleW > span) { const g = (titleW - span) / 2; minX -= g; maxX += g; }
  }

  let stitchesMarkup = '<g class="stitches">';
  for (const st of state.stitches) stitchesMarkup += stitchToSVG(st, clusterMap, { interactive: false });
  stitchesMarkup += '</g>';

  let legendMarkup = '';
  if (showLegend) {
    const lg = legendSVG(state.stitches, clusterMap, minX + padding, maxY + 28, color);
    legendMarkup = lg.markup;
    maxY += lg.height + 36;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const titleMarkup = title
    ? `<text x="${round(minX + w / 2)}" y="${round(minY + 34)}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="26" font-weight="800" fill="${color}">${escapeXML(title)}</text>`
    : '';
  const bg = background
    ? `<rect x="${round(minX)}" y="${round(minY)}" width="${round(w)}" height="${round(h)}" fill="${background}"/>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(w * scale)}" height="${round(h * scale)}" ` +
    `viewBox="${round(minX)} ${round(minY)} ${round(w)} ${round(h)}">` +
    bg + titleMarkup + stitchesMarkup + legendMarkup +
    '</svg>'
  );
}
