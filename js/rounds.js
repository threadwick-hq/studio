// rounds.js — the "rounds" (concentric rings) model and the guided even-
// distribution generator.
//
// Granny squares are worked in rounds from the center out. A round here is
// just a labelled ring at a given radius; rings double as snapping targets and
// as the basis for the "distribute evenly" guided builder.

import { fromPolar, radialRotation } from './geometry.js';
import { uid } from './util.js';

export function defaultRounds() {
  return [30, 64, 100, 138, 178, 220].map((radius, i) => ({
    id: uid('rnd'),
    radius,
    label: 'R' + (i + 1),
  }));
}

export function ringRadii(rounds) {
  return rounds.map((r) => r.radius).sort((a, b) => a - b);
}

// Evenly place `count` items around a ring. `sequence` is a repeating list of
// stitch types (e.g. ['dc','dc','dc','ch']); each slot takes the next type.
// Items are oriented radially by default. Returns plain stitch params (the
// caller assigns ids / commits them).
export function distributeRound(opts) {
  const {
    radius,
    count,
    sequence = ['dc'],
    startAngle = -90, // begin at the top (12 o'clock)
    orient = 'radial',
    color = null,
    round = null,
  } = opts;

  const out = [];
  const step = 360 / count;
  for (let k = 0; k < count; k++) {
    const a = startAngle + k * step;
    const p = fromPolar(radius, a);
    const type = sequence[k % sequence.length];
    out.push({
      type,
      x: p.x,
      y: p.y,
      // radial = point outward from center; otherwise stand upright (rot 0)
      rot: orient === 'radial' ? radialRotation(p.x, p.y) : 0,
      color,
      round,
    });
  }
  return out;
}
