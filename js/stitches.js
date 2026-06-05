// stitches.js — the base stitch-symbol library.
//
// Every symbol is defined in a LOCAL coordinate frame whose origin (0,0) is
// the stitch's *anchor* — the precise point where the stitch is worked into
// the fabric. The symbol grows "upward" toward (0,-height). At render time a
// stitch is placed with translate(x,y) rotate(rot), so the anchor stays pinned
// to the placed point and the symbol fans out from it. This is what lets a
// reader tell exactly where each stitch begins.
//
// build() returns { shapes, height } where `shapes` is a list of primitive
// descriptors consumed by the renderer (see svg.js). Keeping these as plain
// data (no DOM) makes the whole library unit-testable in Node.

export const BAR = 15; // width of the horizontal "top" bar on post stitches

// Number of yarn-over slashes drawn across the post for each post stitch.
export const SLASH_COUNT = { sc: 0, hdc: 0, dc: 1, tr: 2, dtr: 3 };

// Build the primitives for a single "post" stitch (hdc/dc/tr/dtr and the
// individual legs of clusters). `slashes` diagonal strokes cross the upper
// portion of the post; an optional horizontal bar caps the top.
export function postShapes(height, slashes = 0, { topBar = true } = {}) {
  const shapes = [{ k: 'line', x1: 0, y1: 0, x2: 0, y2: -height }];
  if (topBar) {
    shapes.push({ k: 'line', x1: -BAR / 2, y1: -height, x2: BAR / 2, y2: -height });
  }
  for (let i = 0; i < slashes; i++) {
    const f = slashes === 1 ? 0.6 : 0.46 + (i / (slashes - 1)) * 0.32;
    const yc = -height * f;
    shapes.push({ k: 'line', x1: -6.5, y1: yc + 5, x2: 6.5, y2: yc - 5 });
  }
  return shapes;
}

export const STITCHES = {
  ch: {
    name: 'Chain',
    abbr: 'ch',
    category: 'basic',
    // A small open oval. Drawn with its long axis along local X so that, when
    // oriented radially, the oval lies tangentially around the ring (as in
    // real charts, where chain spaces run along the direction of travel).
    build: () => ({ shapes: [{ k: 'ellipse', cx: 0, cy: 0, rx: 9.5, ry: 4.6 }], height: 0 }),
  },
  slst: {
    name: 'Slip stitch',
    abbr: 'sl st',
    category: 'basic',
    build: () => ({ shapes: [{ k: 'dot', cx: 0, cy: 0, r: 3.4 }], height: 0 }),
  },
  sc: {
    name: 'Single crochet',
    abbr: 'sc',
    category: 'basic',
    // A cross "+": a short vertical with a horizontal bar through the middle.
    build: () => {
      const h = 16;
      return {
        shapes: [
          { k: 'line', x1: 0, y1: 0, x2: 0, y2: -h },
          { k: 'line', x1: -7.5, y1: -h / 2, x2: 7.5, y2: -h / 2 },
        ],
        height: h,
      };
    },
  },
  hdc: {
    name: 'Half double crochet',
    abbr: 'hdc',
    category: 'basic',
    build: () => ({ shapes: postShapes(23, 0), height: 23 }),
  },
  dc: {
    name: 'Double crochet',
    abbr: 'dc',
    category: 'basic',
    build: () => ({ shapes: postShapes(32, 1), height: 32 }),
  },
  tr: {
    name: 'Treble crochet',
    abbr: 'tr',
    category: 'basic',
    build: () => ({ shapes: postShapes(40, 2), height: 40 }),
  },
  dtr: {
    name: 'Double treble',
    abbr: 'dtr',
    category: 'basic',
    build: () => ({ shapes: postShapes(48, 3), height: 48 }),
  },
  mr: {
    name: 'Magic ring',
    abbr: 'ring',
    category: 'start',
    build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }], height: 0 }),
  },
  dmr: {
    name: 'Double magic ring',
    abbr: '2-ring',
    category: 'start',
    build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }, { k: 'circle', cx: 0, cy: 0, r: 11 }], height: 0 }),
  },
  chring: {
    name: 'Chain ring',
    abbr: 'ch-ring',
    category: 'start',
    // a loop of chains: tangential ovals arranged around a circle
    build: () => {
      const R = 13, N = 9, shapes = [];
      for (let i = 0; i < N; i++) {
        shapes.push({ k: 'group', rot: (i * 360) / N, shapes: [{ k: 'ellipse', cx: R, cy: 0, rx: 2.6, ry: 4.4 }] });
      }
      return { shapes, height: 0 };
    },
  },
};

// Display order for the palette.
export const STITCH_ORDER = ['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr'];

// Round-0 "start" elements — the roots every stitch ultimately comes from.
export const STARTS = ['mr', 'dmr', 'chring'];

// Single-key shortcuts for entering insert mode with a given stitch/start.
export const STITCH_KEYS = {
  ch: 'c', slst: 'l', sc: 's', hdc: 'h', dc: 'd', tr: 't', dtr: 'e',
  mr: 'm', dmr: 'b', chring: 'g',
};

export function getStitch(type) {
  return STITCHES[type] || null;
}
