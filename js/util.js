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
