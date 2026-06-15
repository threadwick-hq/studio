// The crochet stitch-symbol library.
//
// Every symbol is defined in a LOCAL frame whose origin (0,0) is the stitch's
// BASE (bottom of the marker). It grows "upward" toward (0,-height); that point
// is the HEAD. At render time the stitch is drawn translate(x,y) rotate(rot), so
// the base stays pinned to the worked point and the symbol fans out from there.

import type { Shape, Built, StitchType } from './types';

export const BAR = 15; // width of the horizontal "head" bar on post stitches

export function postShapes(height: number, slashes = 0, { topBar = true }: { topBar?: boolean } = {}): Shape[] {
  const shapes: Shape[] = [{ k: 'line', x1: 0, y1: 0, x2: 0, y2: -height }];
  if (topBar) shapes.push({ k: 'line', x1: -BAR / 2, y1: -height, x2: BAR / 2, y2: -height });
  for (let i = 0; i < slashes; i++) {
    const f = slashes === 1 ? 0.6 : 0.46 + (i / (slashes - 1)) * 0.32;
    const yc = -height * f;
    shapes.push({ k: 'line', x1: -6.5, y1: yc + 5, x2: 6.5, y2: yc - 5 });
  }
  return shapes;
}

export interface StitchDef {
  name: string;
  abbr: string;
  kind: 'stitch' | 'start';
  build: (len?: number) => Built;
}

export const STITCHES: Record<StitchType, StitchDef> = {
  ch: {
    name: 'Chain', abbr: 'ch', kind: 'stitch',
    // An open oval lying ACROSS the flow between stitches — the chain symbol is
    // shown sideways (long axis perpendicular to base->head), unlike post
    // stitches that stand up along it. The anchor (0,0) is the connection point
    // (sits on the origin's head); a buffer leaves a gap so the oval doesn't
    // overlay the origin. Near end = base, far end = head.
    build: () => {
      const B = 6, rx = 9, ry = 5;
      return { shapes: [{ k: 'ellipse', cx: 0, cy: -(B + ry), rx, ry }], height: B + 2 * ry, head: { x: 0, y: -(B + 2 * ry) } };
    },
  },
  slst: {
    name: 'Slip stitch', abbr: 'sl st', kind: 'stitch',
    build: () => ({ shapes: [{ k: 'dot', cx: 0, cy: 0, r: 3.4 }], height: 0 }),
  },
  sc: {
    name: 'Single crochet', abbr: 'sc', kind: 'stitch',
    build: (len?: number) => {
      const h = len ?? 16;
      return { shapes: [{ k: 'line', x1: 0, y1: 0, x2: 0, y2: -h }, { k: 'line', x1: -7.5, y1: -h / 2, x2: 7.5, y2: -h / 2 }], height: h };
    },
  },
  hdc: { name: 'Half double crochet', abbr: 'hdc', kind: 'stitch', build: (len?: number) => ({ shapes: postShapes(len ?? 23, 0), height: len ?? 23 }) },
  dc: { name: 'Double crochet', abbr: 'dc', kind: 'stitch', build: (len?: number) => ({ shapes: postShapes(len ?? 32, 1), height: len ?? 32 }) },
  tr: { name: 'Treble crochet', abbr: 'tr', kind: 'stitch', build: (len?: number) => ({ shapes: postShapes(len ?? 40, 2), height: len ?? 40 }) },
  dtr: { name: 'Double treble', abbr: 'dtr', kind: 'stitch', build: (len?: number) => ({ shapes: postShapes(len ?? 48, 3), height: len ?? 48 }) },

  mr: { name: 'Magic ring', abbr: 'ring', kind: 'start', build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }], height: 0 }) },
  dmr: { name: 'Double magic ring', abbr: '2-ring', kind: 'start', build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: 0, r: 15 }, { k: 'circle', cx: 0, cy: 0, r: 11 }], height: 0 }) },
  chring: {
    name: 'Chain ring', abbr: 'ch-ring', kind: 'start',
    build: () => {
      const R = 14, N = 8; const shapes: Shape[] = [];
      for (let i = 0; i < N; i++) shapes.push({ k: 'group', rot: (i * 360) / N, shapes: [{ k: 'ellipse', cx: R, cy: 0, rx: 2.7, ry: 4.6 }] });
      return { shapes, height: 0 };
    },
  },
  slipknot: {
    name: 'Slip knot', abbr: 'sl kt', kind: 'start',
    build: () => ({ shapes: [{ k: 'circle', cx: 0, cy: -1, r: 6.5 }, { k: 'line', x1: 0, y1: 5.5, x2: 0, y2: 13 }], height: 0 }),
  },
};

export const STITCH_ORDER: StitchType[] = ['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr'];
export const START_ORDER: StitchType[] = ['mr', 'dmr', 'chring', 'slipknot'];
export const STARTS = new Set<StitchType>(START_ORDER);

export const STITCH_KEYS: Partial<Record<StitchType, string>> = { ch: 'c', slst: 'l', sc: 's', hdc: 'h', dc: 'd', tr: 't', dtr: 'e' };

export function isStart(type: StitchType): boolean {
  return STARTS.has(type);
}

// "Real" stitches form spaces; chains, slip stitches and starts do not.
export function isRealStitch(type: StitchType): boolean {
  return type !== 'ch' && type !== 'slst' && !STARTS.has(type);
}

export function defaultLen(type: StitchType): number {
  const s = STITCHES[type];
  if (!s) return 32;
  return s.build().height || 0;
}
