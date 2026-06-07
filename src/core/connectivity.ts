// The topological core of the procedural model: origin chains, computed spaces,
// and base picking. Pure & DOM-free.

import { isRealStitch } from './symbols';
import { topOfStitch } from './render';
import type { Stitch, Round, Base, Point, BaseHit, SpaceSlot } from './types';

export function stitchesInRound(stitches: Stitch[], roundId: string): Stitch[] {
  return stitches.filter((s) => s.round === roundId);
}

// Order a round's stitches as worked, following origin links.
export function chainOrder(stitches: Stitch[], roundId: string): Stitch[] {
  const inRound = stitchesInRound(stitches, roundId);
  const ids = new Set(inRound.map((s) => s.id));
  const succOf = new Map<string, Stitch>();
  const heads: Stitch[] = [];
  for (const s of inRound) {
    if (s.origin && ids.has(s.origin)) succOf.set(s.origin, s);
    else heads.push(s);
  }
  const order: Stitch[] = [], visited = new Set<string>();
  for (const head of heads) {
    let cur: Stitch | undefined = head;
    while (cur && !visited.has(cur.id)) { order.push(cur); visited.add(cur.id); cur = succOf.get(cur.id); }
  }
  for (const s of inRound) if (!visited.has(s.id)) { order.push(s); visited.add(s.id); }
  return order;
}

export function tailOfRound(stitches: Stitch[], roundId: string): Stitch | null {
  const o = chainOrder(stitches, roundId);
  return o.length ? o[o.length - 1]! : null;
}

export function successorInRound(stitches: Stitch[], originId: string | null, roundId: string): Stitch | null {
  if (!originId) return null;
  return stitchesInRound(stitches, roundId).find((s) => s.origin === originId) ?? null;
}

export function chainFrom(stitches: Stitch[], startId: string, roundId: string): Stitch[] {
  const order = chainOrder(stitches, roundId);
  const i = order.findIndex((s) => s.id === startId);
  return i < 0 ? [] : order.slice(i);
}

export function spacesForRound(stitches: Stitch[], roundId: string): SpaceSlot[] {
  const real = chainOrder(stitches, roundId).filter((s) => isRealStitch(s.type));
  const out: SpaceSlot[] = [];
  for (let i = 0; i + 1 < real.length; i++) {
    const a = real[i]!, b = real[i + 1]!;
    const ta = topOfStitch(a), tb = topOfStitch(b);
    out.push({ ids: [a.id, b.id], point: { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 } });
  }
  return out;
}

export function allSpaces(stitches: Stitch[]): SpaceSlot[] {
  const rounds = [...new Set(stitches.map((s) => s.round))];
  const out: SpaceSlot[] = [];
  for (const r of rounds) out.push(...spacesForRound(stitches, r));
  return out;
}

export function basePoint(byId: Map<string, Stitch>, base: Base): Point | null {
  if (!base) return null;
  if (base.kind === 'stitch') { const s = byId.get(base.id); return s ? topOfStitch(s) : null; }
  const a = byId.get(base.ids[0]), b = byId.get(base.ids[1]);
  if (!a || !b) return null;
  const ta = topOfStitch(a), tb = topOfStitch(b);
  return { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
}

export function pickBase(stitches: Stitch[], x: number, y: number, opts: { maxD?: number; exclude?: Set<string> | null } = {}): BaseHit | null {
  const maxD = opts.maxD ?? 82, exclude = opts.exclude ?? null;
  let best: BaseHit | null = null, bd = maxD;
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

export function nearestStitch(stitches: Stitch[], x: number, y: number, maxD = Infinity): Stitch | null {
  let best: Stitch | null = null, bd = maxD;
  for (const s of stitches) {
    const pt = topOfStitch(s);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function defaultOriginId(stitches: Stitch[], rounds: Round[], activeRoundId: string): string | null {
  const tail = tailOfRound(stitches, activeRoundId);
  if (tail) return tail.id;
  const idx = rounds.findIndex((r) => r.id === activeRoundId);
  for (let i = idx - 1; i >= 0; i--) {
    const t = tailOfRound(stitches, rounds[i]!.id);
    if (t) return t.id;
  }
  return null;
}
