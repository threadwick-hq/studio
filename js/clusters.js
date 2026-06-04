// clusters.js — parametric cluster / motif generator.
//
// A huge fraction of granny-square vocabulary is just "N posts joined at the
// top and/or bottom": V-stitches, shells/fans (increase), decreases, and
// bobbles/puffs (joined both ends). Rather than hand-draw each, we generate
// them from four parameters so users can define and reuse their own.
//
//   base        which post stitch the legs are (dc, tr, hdc, ...)
//   legs        how many posts
//   joinBottom  legs share a single anchor point  -> increase / shell / V
//   joinTop     legs share a single top point      -> decrease / "together"
//   spread      fan angle (degrees) for increases
//
//   joinBottom only           -> "3 dc in 1 stitch" (shell/fan), "2 dc in 1" (V)
//   joinTop only              -> "3 dc together" (decrease)
//   joinBottom AND joinTop    -> "3 dc cluster" / bobble / puff (bulging bundle)

import { postShapes, SLASH_COUNT, STITCHES } from './stitches.js';

export function buildCluster(def = {}) {
  const {
    base = 'dc',
    legs = 3,
    joinTop = false,
    joinBottom = true,
    spread = 48,
  } = def;

  const proto = (STITCHES[base] || STITCHES.dc).build();
  const H = def.height || proto.height || 32;
  const slashes = SLASH_COUNT[base] ?? 1;
  const shapes = [];

  if (joinBottom && joinTop) {
    // Bobble / puff / popcorn: posts bulge outward between a shared base and
    // a shared top, drawn as gently bowed curves.
    const maxOff = 5 + legs * 2.4;
    for (let i = 0; i < legs; i++) {
      const t = legs === 1 ? 0 : (i / (legs - 1)) * 2 - 1; // -1 .. 1
      const off = t * maxOff;
      shapes.push({ k: 'path', d: `M 0 0 Q ${off} ${-H / 2} 0 ${-H}` });
    }
    shapes.push({ k: 'line', x1: -6, y1: -H, x2: 6, y2: -H });
  } else if (joinTop) {
    // Decrease: bases spread along the bottom, all legs meet at one top point.
    const W = 8 + legs * 8;
    for (let i = 0; i < legs; i++) {
      const bx = legs === 1 ? 0 : -W / 2 + i * (W / (legs - 1));
      shapes.push({ k: 'line', x1: bx, y1: 0, x2: 0, y2: -H });
      for (let s = 0; s < slashes; s++) {
        const tt = 0.58 + s * 0.16;
        const mx = bx * (1 - tt);
        const my = -H * tt;
        shapes.push({ k: 'line', x1: mx - 6, y1: my + 5, x2: mx + 6, y2: my - 5 });
      }
    }
  } else {
    // Increase / shell / V: legs share the anchor and fan across `spread`.
    const post = postShapes(H, slashes);
    for (let i = 0; i < legs; i++) {
      const ang = legs === 1 ? 0 : -spread / 2 + i * (spread / (legs - 1));
      shapes.push({ k: 'group', rot: ang, shapes: post });
    }
  }

  return { shapes, height: H };
}

// Starting templates surfaced in the cluster editor. Users tweak any of these
// (or start from scratch) and save the result into the project's library.
export const PRESET_CLUSTERS = [
  { name: '2 dc in 1 (V)', base: 'dc', legs: 2, joinBottom: true, joinTop: false, spread: 34 },
  { name: '3 dc in 1 (shell)', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 50 },
  { name: '5 dc shell', base: 'dc', legs: 5, joinBottom: true, joinTop: false, spread: 92 },
  { name: '3 dc cluster (bobble)', base: 'dc', legs: 3, joinBottom: true, joinTop: true },
  { name: '5 dc popcorn', base: 'dc', legs: 5, joinBottom: true, joinTop: true },
  { name: '3 dc together', base: 'dc', legs: 3, joinBottom: false, joinTop: true },
  { name: '2 dc together', base: 'dc', legs: 2, joinBottom: false, joinTop: true },
  { name: '3 tr cluster', base: 'tr', legs: 3, joinBottom: true, joinTop: true },
];
