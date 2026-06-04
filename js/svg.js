// svg.js — the one and only renderer.
//
// It turns chart state into SVG *markup strings*. There is intentionally no
// DOM here: the live editor injects the inner markup via innerHTML (and reads
// back data-id attributes for hit-testing), while SVG/PNG/PDF export reuse the
// exact same output. One renderer => the editor is a true WYSIWYG preview of
// what gets exported.

import { STITCHES, getStitch } from './stitches.js';
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

export function buildStitchShapes(type, clusterMap) {
  if (STITCHES[type]) return STITCHES[type].build();
  const def = clusterMap && clusterMap[type];
  if (def) return buildCluster(def);
  return STITCHES.dc.build();
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
  const { shapes, height } = buildStitchShapes(st.type, clusterMap);
  const color = st.color || INK;
  const inner = shapes.map((s) => shapeToSVG(s, color)).join('');
  const mirror = st.mirror ? ' scale(-1,1)' : '';
  const tf = `translate(${round(st.x)} ${round(st.y)}) rotate(${round(st.rot || 0)})${mirror}`;
  if (!interactive) return `<g transform="${tf}">${inner}</g>`;
  // a transparent, generously sized hit target so thin symbols are easy to grab
  const r = Math.max(12, height / 2 + 8);
  const hit = `<circle class="hit" cx="0" cy="${round(-height / 2)}" r="${round(r)}"/>`;
  return `<g data-id="${st.id}" class="stitch" transform="${tf}">${hit}${inner}</g>`;
}

// ---- glyphs (palette + legend) -------------------------------------------

function glyphViewBox(height) {
  const h = Math.max(height, 16);
  const top = -(h + 12);
  const bottom = 12;
  return `-19 ${round(top)} 38 ${round(bottom - top)}`;
}

export function glyphSVG(type, clusterMap, px = 42, color = INK) {
  const { shapes, height } = buildStitchShapes(type, clusterMap);
  const inner = shapes.map((s) => shapeToSVG(s, color)).join('');
  return `<svg class="glyph" width="${px}" height="${px}" viewBox="${glyphViewBox(height)}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// ---- bounds ---------------------------------------------------------------

function stitchExtent(st, clusterMap) {
  const { height } = buildStitchShapes(st.type, clusterMap);
  const h = Math.max(height, 18);
  const up = rotatePoint(0, -1, st.rot || 0); // local up after rotation
  const tip = { x: st.x + up.x * h, y: st.y + up.y * h };
  const pad = 12; // half-bar / oval radius slack
  return {
    minX: Math.min(st.x, tip.x) - pad,
    minY: Math.min(st.y, tip.y) - pad,
    maxX: Math.max(st.x, tip.x) + pad,
    maxY: Math.max(st.y, tip.y) + pad,
  };
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
    out += `<svg x="0" y="${ry}" width="30" height="30" viewBox="${glyphViewBox(height)}">${inner}</svg>`;
    out += `<text x="40" y="${ry + 20}" font-family="system-ui,Segoe UI,Arial" font-size="14" fill="${color}">${escapeXML(text)}</text>`;
  });
  return { markup: out + '</g>', height: types.length * rowH + 12, count: types.length };
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

  const b = contentBounds(state.stitches, clusterMap);
  let minX = b.minX - padding;
  let minY = b.minY - padding;
  let maxX = b.maxX + padding;
  let maxY = b.maxY + padding;

  const titleH = title ? 52 : 0;
  minY -= titleH;

  let stitchesMarkup = '<g class="stitches">';
  for (const st of state.stitches) stitchesMarkup += stitchToSVG(st, clusterMap, { interactive: false });
  stitchesMarkup += '</g>';

  let legendMarkup = '';
  if (legend && state.stitches.length) {
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
