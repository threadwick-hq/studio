// connectivity.js — the topological core of the procedural model.
//
// Every stitch (except a round-0 start) records:
//   origin: the stitch it comes out of      (determines the working sequence)
//   base:   the stitch head or space it is worked into  (where its bottom sits)
//
// Within a round the stitches form a single linked chain via `origin`. Spaces
// between stitches are computed automatically as the midpoint between two
// consecutive REAL stitch heads. These two facts are what make even graphs
// fall out of the structure instead of out of symmetry math.
//
// Pure & DOM-free, so the whole model is unit-testable in Node.

import { isRealStitch } from './symbols.js';
import { topOfStitch } from './render.js';

export function stitchesInRound(stitches, roundId) {
  return stitches.filter((s) => s.round === roundId);
}

// Order a round's stitches as they were worked, by following origin links.
// Robust to splices, multiple heads and stray orphans.
export function chainOrder(stitches, roundId) {
  const inRound = stitchesInRound(stitches, roundId);
  const ids = new Set(inRound.map((s) => s.id));
  const succOf = new Map(); // in-round origin id -> its successor stitch
  const heads = [];
  for (const s of inRound) {
    if (s.origin && ids.has(s.origin)) succOf.set(s.origin, s);
    else heads.push(s); // origin null / outside the round => a chain head
  }
  const order = [], visited = new Set();
  for (const head of heads) {
    let cur = head;
    while (cur && !visited.has(cur.id)) { order.push(cur); visited.add(cur.id); cur = succOf.get(cur.id); }
  }
  for (const s of inRound) if (!visited.has(s.id)) { order.push(s); visited.add(s.id); } // cycles/orphans
  return order;
}

export function tailOfRound(stitches, roundId) {
  const o = chainOrder(stitches, roundId);
  return o.length ? o[o.length - 1] : null;
}

export function headOfRound(stitches, roundId) {
  const o = chainOrder(stitches, roundId);
  return o.length ? o[0] : null;
}

// The stitch in `roundId` whose origin is `originId` — the "next stitch" that an
// insert would push forward (highlighted purple in the UI).
export function successorInRound(stitches, originId, roundId) {
  if (!originId) return null;
  return stitchesInRound(stitches, roundId).find((s) => s.origin === originId) || null;
}

// The chain from `startId` (inclusive) to the end of the round — the stitches
// that get grayed out while inserting earlier in the sequence.
export function chainFrom(stitches, startId, roundId) {
  const order = chainOrder(stitches, roundId);
  const i = order.findIndex((s) => s.id === startId);
  return i < 0 ? [] : order.slice(i);
}

// Spaces between consecutive REAL stitches of a round (chains/slip-stitches and
// starts are skipped). Returns [{ ids:[a,b], point }].
export function spacesForRound(stitches, roundId) {
  const real = chainOrder(stitches, roundId).filter((s) => isRealStitch(s.type));
  const out = [];
  for (let i = 0; i + 1 < real.length; i++) {
    const a = real[i], b = real[i + 1];
    const ta = topOfStitch(a), tb = topOfStitch(b);
    out.push({ ids: [a.id, b.id], point: { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 } });
  }
  return out;
}

export function allSpaces(stitches) {
  const rounds = [...new Set(stitches.map((s) => s.round))];
  const out = [];
  for (const r of rounds) out.push(...spacesForRound(stitches, r));
  return out;
}

// Resolve a base descriptor to its current world point.
export function basePoint(byId, base) {
  if (!base) return null;
  if (base.kind === 'stitch') { const s = byId.get(base.id); return s ? topOfStitch(s) : null; }
  if (base.kind === 'space') {
    const a = byId.get(base.ids[0]), b = byId.get(base.ids[1]);
    if (!a || !b) return null;
    const ta = topOfStitch(a), tb = topOfStitch(b);
    return { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
  }
  return null;
}

// Pick the base nearest to (x,y): a stitch head or a computed space. Spaces win
// ties (they're the intended target when working into the round below).
export function pickBase(stitches, x, y, { maxD = 82, exclude = null } = {}) {
  let best = null, bd = maxD;
  for (const s of stitches) {
    if (exclude && exclude.has(s.id)) continue;
    const pt = topOfStitch(s);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bd) { bd = d; best = { kind: 'stitch', id: s.id, point: pt, d }; }
  }
  for (const sp of allSpaces(stitches)) {
    const d = Math.hypot(sp.point.x - x, sp.point.y - y);
    if (d <= bd) { bd = d; best = { kind: 'space', ids: sp.ids, point: sp.point, d }; }
  }
  return best;
}

// Nearest stitch to a point, by head — used to preview an origin candidate.
export function nearestStitch(stitches, x, y, maxD = Infinity) {
  let best = null, bd = maxD;
  for (const s of stitches) {
    const pt = topOfStitch(s);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// The origin a fresh stitch should come from when (re)entering a round:
// the round's tail if it has stitches, else the previous round's tail.
export function defaultOriginId(stitches, rounds, activeRoundId) {
  const tail = tailOfRound(stitches, activeRoundId);
  if (tail) return tail.id;
  const idx = rounds.findIndex((r) => r.id === activeRoundId);
  for (let i = idx - 1; i >= 0; i--) {
    const t = tailOfRound(stitches, rounds[i].id);
    if (t) return t.id;
  }
  return null;
}

// Repair the chain when a stitch is removed: every stitch that came out of it
// is re-pointed to the removed stitch's own origin, so the sequence stays whole.
export function rerouteOrigins(stitches, removedId, replacementOriginId) {
  for (const s of stitches) if (s.origin === removedId) s.origin = replacementOriginId;
}
