// Tiny dependency-free helpers shared across modules.

export function uid(prefix = 'id'): string {
  // A collision-resistant id, unique across devices/users once projects sync.
  return prefix + '_' + uuid();
}

// crypto.randomUUID is only defined in a secure context (HTTPS/localhost). Fall
// back to getRandomValues — available even over plain http on a LAN IP, the
// pattern used to preview on a phone — and finally to Math.random, so the
// local-only app never crashes generating an id.
function uuid(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
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
