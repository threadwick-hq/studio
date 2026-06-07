// render.js — the one and only renderer: stitch descriptors -> SVG markup.
//
// There is intentionally no DOM here. The live editor injects the inner markup
// via innerHTML (and reads back data-id for hit-testing); SVG/PNG/print export
// reuse the exact same output. One renderer => the editor is a true WYSIWYG
// preview of what gets exported.

import { STITCHES } from './symbols.js';
import { rotatePoint } from './geometry.js';
import { round, escapeXML } from './util.js';

export const INK = '#21201c';
const SW = 2.4; // stroke width in user units (scales with the view)

// ---- shape -> markup -------------------------------------------------------
function shapeToSVG(s, color, sw = SW) {
  const stroke = `stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"`;
  switch (s.k) {
    case 'line': return `<line x1="${round(s.x1)}" y1="${round(s.y1)}" x2="${round(s.x2)}" y2="${round(s.y2)}" ${stroke}/>`;
    case 'ellipse': return `<ellipse cx="${round(s.cx)}" cy="${round(s.cy)}" rx="${round(s.rx)}" ry="${round(s.ry)}" ${stroke}/>`;
    case 'circle': return `<circle cx="${round(s.cx)}" cy="${round(s.cy)}" r="${round(s.r)}" ${stroke}/>`;
    case 'dot': return `<circle cx="${round(s.cx)}" cy="${round(s.cy)}" r="${round(s.r)}" fill="${color}"/>`;
    case 'path': return s.fill ? `<path d="${s.d}" fill="${color}"/>` : `<path d="${s.d}" ${stroke}/>`;
    case 'group': return `<g transform="rotate(${round(s.rot)})">${s.shapes.map((x) => shapeToSVG(x, color, sw)).join('')}</g>`;
    default: return '';
  }
}

export function shapesMarkup(shapes, color = INK, sw = SW) {
  return shapes.map((s) => shapeToSVG(s, color, sw)).join('');
}

// ---- resolving a stitch type to primitives --------------------------------
export function buildStitchShapes(type, len) {
  const def = STITCHES[type];
  if (def) return def.build(len);
  return STITCHES.dc.build(len); // unknown -> fall back to a dc
}

// A stitch's HEAD (top of the marker) in world space. Its BASE is its anchor.
export function topOfStitch(st) {
  const built = buildStitchShapes(st.type, st.len);
  const local = built.head || { x: 0, y: -(built.height || 0) };
  const sx = st.mirror ? -1 : 1;
  const p = rotatePoint(local.x * sx, local.y, st.rot || 0);
  return { x: st.x + p.x, y: st.y + p.y };
}

// ---- a single placed stitch ----------------------------------------------
// opts: { interactive, color, opacity, klass }
export function stitchToSVG(st, opts = {}) {
  const { shapes, height } = buildStitchShapes(st.type, st.len);
  const color = opts.color || st.color || INK;
  const inner = shapesMarkup(shapes, color);
  const mirror = st.mirror ? ' scale(-1,1)' : '';
  const tf = `translate(${round(st.x)} ${round(st.y)}) rotate(${round(st.rot || 0)})${mirror}`;
  const op = opts.opacity != null ? ` opacity="${opts.opacity}"` : '';
  if (!opts.interactive) return `<g transform="${tf}"${op}>${inner}</g>`;
  // Invisible hit target: a capsule along tall posts so dense rings don't steal
  // each other's clicks; a disc for low symbols (dots, ovals, rings).
  const hit = height > 4
    ? `<rect class="hit" x="-9" y="${round(-height - 7)}" width="18" height="${round(height + 14)}" rx="9" fill="transparent" pointer-events="all"/>`
    : `<circle class="hit" cx="0" cy="0" r="13" fill="transparent" pointer-events="all"/>`;
  const cls = 'stitch' + (opts.klass ? ' ' + opts.klass : '');
  return `<g data-id="${st.id}" class="${cls}" transform="${tf}"${op}>${hit}${inner}</g>`;
}

// ---- glyphs (palette + legend) -------------------------------------------
function expandBox(b, x, y) {
  if (x < b.minX) b.minX = x; if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x; if (y > b.maxY) b.maxY = y;
}

function shapesBBox(shapes) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of shapes) {
    switch (s.k) {
      case 'line': expandBox(b, s.x1, s.y1); expandBox(b, s.x2, s.y2); break;
      case 'ellipse': expandBox(b, s.cx - s.rx, s.cy - s.ry); expandBox(b, s.cx + s.rx, s.cy + s.ry); break;
      case 'circle': case 'dot': expandBox(b, s.cx - s.r, s.cy - s.r); expandBox(b, s.cx + s.r, s.cy + s.r); break;
      case 'path': { const n = (s.d.match(/-?\d*\.?\d+/g) || []).map(Number); for (let i = 0; i + 1 < n.length; i += 2) expandBox(b, n[i], n[i + 1]); break; }
      case 'group': {
        const cb = shapesBBox(s.shapes);
        if (cb.minX <= cb.maxX) for (const [cx, cy] of [[cb.minX, cb.minY], [cb.maxX, cb.minY], [cb.maxX, cb.maxY], [cb.minX, cb.maxY]]) {
          const p = rotatePoint(cx, cy, s.rot || 0); expandBox(b, p.x, p.y);
        }
        break;
      }
    }
  }
  return b;
}

function glyphViewBox(shapes, height) {
  let b = shapesBBox(shapes);
  if (b.minX > b.maxX) b = { minX: -10, minY: -Math.max(height, 12), maxX: 10, maxY: 6 };
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 8) + 14;
  return `${round(cx - size / 2)} ${round(cy - size / 2)} ${round(size)} ${round(size)}`;
}

export function glyphSVG(type, px = 40, color = INK) {
  const { shapes, height } = buildStitchShapes(type);
  return `<svg class="glyph" width="${px}" height="${px}" viewBox="${glyphViewBox(shapes, height)}" xmlns="http://www.w3.org/2000/svg">${shapesMarkup(shapes, color)}</svg>`;
}

// ---- world bounds ---------------------------------------------------------
function stitchExtent(st) {
  const { shapes, height } = buildStitchShapes(st.type, st.len);
  let lb = shapesBBox(shapes);
  if (lb.minX > lb.maxX) lb = { minX: -8, minY: -Math.max(height, 12), maxX: 8, maxY: 6 };
  const rot = st.rot || 0, sx = st.mirror ? -1 : 1;
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [cx, cy] of [[lb.minX, lb.minY], [lb.maxX, lb.minY], [lb.maxX, lb.maxY], [lb.minX, lb.maxY]]) {
    const p = rotatePoint(cx * sx, cy, rot); expandBox(out, st.x + p.x, st.y + p.y);
  }
  const pad = 5;
  return { minX: out.minX - pad, minY: out.minY - pad, maxX: out.maxX + pad, maxY: out.maxY + pad };
}

export function contentBounds(stitches) {
  if (!stitches.length) return { minX: -160, minY: -160, maxX: 160, maxY: 160 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const st of stitches) {
    const e = stitchExtent(st);
    if (e.minX < minX) minX = e.minX; if (e.minY < minY) minY = e.minY;
    if (e.maxX > maxX) maxX = e.maxX; if (e.maxY > maxY) maxY = e.maxY;
  }
  return { minX, minY, maxX, maxY };
}

// ---- legend (export) ------------------------------------------------------
function usedTypes(stitches) {
  const seen = new Set(), order = [];
  for (const st of stitches) if (!seen.has(st.type)) { seen.add(st.type); order.push(st.type); }
  return order;
}

function legendSVG(stitches, x, y, color) {
  const types = usedTypes(stitches), rowH = 34;
  let out = `<g transform="translate(${round(x)} ${round(y)})">`;
  out += `<text x="0" y="-12" font-family="system-ui,Segoe UI,Arial" font-size="15" font-weight="700" fill="${color}">Legend</text>`;
  types.forEach((type, i) => {
    const ry = i * rowH;
    const { shapes, height } = buildStitchShapes(type);
    const def = STITCHES[type] || { name: type, abbr: '' };
    const text = def.abbr ? `${def.name} (${def.abbr})` : def.name;
    out += `<svg x="0" y="${ry}" width="30" height="30" viewBox="${glyphViewBox(shapes, height)}">${shapesMarkup(shapes, color)}</svg>`;
    out += `<text x="40" y="${ry + 20}" font-family="system-ui,Segoe UI,Arial" font-size="14" fill="${color}">${escapeXML(text)}</text>`;
  });
  return { markup: out + '</g>', height: types.length * rowH + 12 };
}

function legendWidth(stitches) {
  const types = usedTypes(stitches);
  if (!types.length) return 0;
  let maxChars = 7;
  for (const t of types) {
    const d = STITCHES[t] || { name: t, abbr: '' };
    const s = d.abbr ? `${d.name} (${d.abbr})` : d.name;
    if (s.length > maxChars) maxChars = s.length;
  }
  return 40 + maxChars * 7.6 + 16;
}

// Full standalone <svg> for SVG / PNG / print export.
export function chartToSVG(pattern, opts = {}) {
  const { padding = 30, background = '#ffffff', legend = true, title = '', color = INK, scale = 1 } = opts;
  const stitches = pattern.stitches || [];
  const showLegend = legend && stitches.length > 0;
  const b = contentBounds(stitches);
  let minX = b.minX - padding, minY = b.minY - padding, maxX = b.maxX + padding, maxY = b.maxY + padding;

  const titleH = title ? 52 : 0;
  minY -= titleH;
  if (showLegend) maxX = Math.max(maxX, minX + padding + legendWidth(stitches));
  if (title) {
    const titleW = title.length * 14.5 + 24, span = maxX - minX;
    if (titleW > span) { const g = (titleW - span) / 2; minX -= g; maxX += g; }
  }

  let body = '<g>';
  for (const st of stitches) body += stitchToSVG(st, { interactive: false });
  body += '</g>';

  let legendMarkup = '';
  if (showLegend) {
    const lg = legendSVG(stitches, minX + padding, maxY + 28, color);
    legendMarkup = lg.markup;
    maxY += lg.height + 36;
  }

  const w = maxX - minX, h = maxY - minY;
  const titleMarkup = title
    ? `<text x="${round(minX + w / 2)}" y="${round(minY + 34)}" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="26" font-weight="800" fill="${color}">${escapeXML(title)}</text>`
    : '';
  const bg = background ? `<rect x="${round(minX)}" y="${round(minY)}" width="${round(w)}" height="${round(h)}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(w * scale)}" height="${round(h * scale)}" viewBox="${round(minX)} ${round(minY)} ${round(w)} ${round(h)}">${bg}${titleMarkup}${body}${legendMarkup}</svg>`;
}

export { usedTypes };
