// Tiny dependency-free helpers shared across modules.

export function uid(prefix = 'id'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function deepClone<T>(o: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(o)
    : (JSON.parse(JSON.stringify(o)) as T);
}

// Round to a sensible number of decimals so serialized SVG/JSON stays small.
export function round(n: number, p = 2): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

export function escapeXML(s: unknown): string {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function nowISO(): string {
  return new Date().toISOString();
}

// A filesystem-friendly slug, for export filenames.
export function slug(s: string | undefined, fallback = 'untitled'): string {
  const out = String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
}
