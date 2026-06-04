// symmetry.js — generate the symmetric "orbit" of a placed stitch.
//
// Symmetry is the heart of making even, symmetrical squares effortless: the
// user edits ONE stitch and the tool maintains its mirror images. We model the
// symmetry group as N-fold rotation about the center, optionally combined with
// a mirror axis (giving a dihedral group of 2N elements).
//
// A key property we rely on: the orbit of a point under a group is the same no
// matter which orbit member you start from. So when the user drags any member
// of a symmetric group, we can simply regenerate the whole orbit from that
// member's new position — the result is identical to the original set, kept
// perfectly symmetric. (See state.js for how edits use this.)

import { rotatePoint, reflectPoint, norm360 } from './geometry.js';

export const SYMMETRY_ORDERS = [1, 2, 3, 4, 5, 6, 8, 12];

// src: { x, y, rot, mirror }   sym: { order, mirror, axis }
// Returns an array of { x, y, rot, mirror } — one per group element.
export function symmetryOrbit(src, sym) {
  const order = Math.max(1, sym.order | 0);
  const step = 360 / order;
  const axis = sym.axis ?? -90; // default mirror line is vertical
  const rot0 = src.rot || 0;

  const seeds = [{ x: src.x, y: src.y, rot: rot0, mirror: !!src.mirror }];
  if (sym.mirror) {
    const r = reflectPoint(src.x, src.y, axis);
    seeds.push({ x: r.x, y: r.y, rot: 2 * axis - rot0, mirror: !src.mirror });
  }

  const out = [];
  for (const seed of seeds) {
    for (let k = 0; k < order; k++) {
      const p = rotatePoint(seed.x, seed.y, k * step);
      out.push({
        x: p.x,
        y: p.y,
        rot: norm360(seed.rot + k * step),
        mirror: seed.mirror,
      });
    }
  }
  return out;
}

export function orbitSize(sym) {
  return Math.max(1, sym.order | 0) * (sym.mirror ? 2 : 1);
}
