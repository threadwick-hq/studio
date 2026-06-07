// util.js — tiny dependency-free helpers shared across modules.

export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function deepClone(o) {
  return typeof structuredClone === 'function'
    ? structuredClone(o)
    : JSON.parse(JSON.stringify(o));
}

// Round to a sensible number of decimals so serialized SVG/JSON stays small.
export function round(n, p = 2) {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

export function escapeXML(s) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// HTML-escape for safe text interpolation into innerHTML.
export function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function nowISO() {
  return new Date().toISOString();
}

// A filesystem-friendly slug, for export filenames.
export function slug(s, fallback = 'untitled') {
  const out = String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
}
