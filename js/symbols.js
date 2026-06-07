// symbols.js — the crochet stitch-symbol library.
//
// Every symbol is defined in a LOCAL frame whose origin (0,0) is the stitch's
// BASE — the exact point it is worked into (the bottom of the marker). The
// symbol grows "upward" toward (0,-height); the point (0,-height) is its HEAD
// (the top of the marker). At render time a stitch is drawn with
// translate(x,y) rotate(rot), so the base stays pinned to the worked point and
// the symbol fans out from there. That is what lets a reader (and the tool)
// tell exactly where each stitch begins and ends.
//
// build(len) returns { shapes, height }. `shapes` is a list of plain
// primitive descriptors consumed by render.js. No DOM here, so the whole
// library is unit-testable in Node.

export const BAR = 15; // width of the horizontal "head" bar on post stitches

// Number of yarn-over slashes drawn across the post for each post stitch.
export const SLASH_COUNT = { sc: 0, hdc: 0, dc: 1, tr: 2, dtr: 3 };

// Primitives for a single "post" stitch (hdc/dc/tr/dtr). `slashes` diagonal
// strokes cross the upper portion; an optional bar caps the head.
export function postShapes(height, slashes = 0, { topBar = true } = {}) {
  const shapes = [{ k: 'line', x1: 0, y1: 0, x2: 0, y2: -height }];
  if (topBar) shapes.push({ k: 'line', x1: -BAR / 2, y1: -height, x2: BAR / 2, y2: -height });
  for (let i = 0; i < slashes; i++) {
    const f = slashes === 1 ? 0.6 : 0.46 + (i / (slashes - 1)) * 0.32;
    const yc = -height * f;
    shapes.push({ k: 'line', x1: -6.5, y1: yc + 5, x2: 6.5, y2: yc - 5 });
  }
  return shapes;
}

// --- working stitches -------------------------------------------------------
export const STITCHES = {
  ch: {
    name: 'Chain', abbr: 'ch', kind: 'stitch',
    // An open oval that lies ALONG the flow between stitches. The anchor (0,0)
    // is the connection point (it sits on the origin's head); a buffer leaves a
    // gap so the oval doesn't overlay the origin. The near end of the oval is
    // the BASE (right point), the far end is the HEAD (left point), so chaining
    // several strings ovals out between the surrounding stitches.
    build: () => {
      const B = 6, ry = 8.5, rx = 4.6; // buffer, half-length (long axis = local Y), half-width
      return { shapes: [{ k: 'ellipse', cx: 0, cy: -(B + ry), rx, ry }], height: B + 2 * ry, head: { x: 0, y: -(B + 2 * ry) } };
    },
  },
  slst: {
    name: 'Slip stitch', abbr: 'sl st', kind: 'stitch',
    build: () => ({ shapes: [{ k: 'dot', cx: 0, cy: 0, r: 3.4 }], height: 0 }),
  },
  sc: {
    name: 'Single crochet', abbr: 'sc', kind: 'stitch',
    build: (len) => {
      const h = len ?? 16;
      return {
        shapes: [
          { k: 'line', x1: 0, y1: 0, x2: 0, y2: -h },
          { k: 'line', x1: -7.5, y1: -h / 2, x2: 7.5, y2: -h / 2 },
        ],
        height: h,
      };
    },
  },
  hdc: { name: 'Half double crochet', abbr: 'hdc', kind: 'stitch', build: (len) => ({ shapes: postShapes(len ?? 23, 0), height: len ?? 23 }) },
  dc:  { name: 'Double crochet',      abbr: 'dc',  kind: 'stitch', build: (len) => ({ shapes: postShapes(len ?? 32, 1), height: len ?? 32 }) },
  tr:  { name: 'Treble crochet',      abbr: 'tr',  kind: 'stitch', build: (len) => ({ shapes: postShapes(len ?? 40, 2), height: len ?? 40 }) },
  dtr: { name: 'Double treble',       abbr: 'dtr', kind: 'stitch', build: (len) => ({ shapes: postShapes(len ?? 48, 3), height: len ?? 48 }) },

  // --- starts (round-0 roots) ----------------------------------------------
  mr: {
    name: 'Magic ring', abbr: 'ring', kind: 'start',
    build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }], height: 0 }),
  },
  dmr: {
    name: 'Double magic ring', abbr: '2-ring', kind: 'start',
    build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }, { k: 'circle', cx: 0, cy: 0, r: 11 }], height: 0 }),
  },
  chring: {
    name: 'Chain ring', abbr: 'ch-ring', kind: 'start',
    // a loop of chains: tangential ovals arranged around a circle
    build: () => {
      const R = 14, N = 8, shapes = [];
      for (let i = 0; i < N; i++) {
        shapes.push({ k: 'group', rot: (i * 360) / N, shapes: [{ k: 'ellipse', cx: R, cy: 0, rx: 2.7, ry: 4.6 }] });
      }
      return { shapes, height: 0 };
    },
  },
  slipknot: {
    name: 'Slip knot', abbr: 'sl kt', kind: 'start',
    // a small loop with a short tail
    build: () => ({
      shapes: [
        { k: 'circle', cx: 0, cy: -1, r: 6.5 },
        { k: 'line', x1: 0, y1: 5.5, x2: 0, y2: 13 },
      ],
      height: 0,
    }),
  },
};

// Palette display order for working stitches.
export const STITCH_ORDER = ['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr'];

// Start (round-0) elements every stitch ultimately comes from.
export const START_ORDER = ['mr', 'dmr', 'chring', 'slipknot'];

export const STARTS = new Set(START_ORDER);

// Single-key shortcuts for arming a stitch in Insert mode.
export const STITCH_KEYS = { ch: 'c', slst: 'l', sc: 's', hdc: 'h', dc: 'd', tr: 't', dtr: 'e' };

export function getStitch(type) {
  return STITCHES[type] || null;
}

export function isStart(type) {
  return STARTS.has(type);
}

// "Real" stitches form spaces; chains, slip stitches and starts do not. So the
// space in "3dc ch2 3dc" sits between the flanking dc, skipping the chains.
export function isRealStitch(type) {
  return type !== 'ch' && type !== 'slst' && !STARTS.has(type);
}

export function labelFor(type) {
  const s = STITCHES[type];
  return s ? { name: s.name, abbr: s.abbr } : { name: type, abbr: '' };
}

// Default head length for a freshly-armed stitch (used for the first ghost).
export function defaultLen(type) {
  const s = STITCHES[type];
  if (!s) return 32;
  return s.build().height || 0;
}
