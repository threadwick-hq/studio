// sample.js — a worked granny square so the app opens on something real and
// shows how the connectivity model lays out an even chart. Built as plain data
// (ids + origin chain + bases) exactly like the editor would produce.

import { uid } from './util.js';
import { newProject, newPattern, normalizeProject } from './model.js';
import { fromPolar, norm360 } from './geometry.js';
import { topOfStitch } from './render.js';
import { isRealStitch } from './symbols.js';

function mk(round, type, origin, base, basePt, headPt) {
  const dx = headPt.x - basePt.x, dy = headPt.y - basePt.y;
  const len = Math.hypot(dx, dy);
  const flat = type === 'slst'; // slip stitch is just a dot at its base
  return {
    id: uid('st'), round, type, origin, base,
    x: basePt.x, y: basePt.y,
    rot: flat ? 0 : (Math.atan2(dx, -dy) * 180) / Math.PI,
    len: (type === 'ch' || flat) ? null : Math.max(2, len),
    color: null, mirror: false,
  };
}

export function sampleProject() {
  const prj = newProject('Sunburst granny');
  prj.description = 'A classic two-round granny square — your starter project. Open it to see how every stitch comes out of an origin and is worked into a base.';
  const pat = newPattern('Classic granny square');
  const r0 = { id: uid('rnd'), name: 'Round 0' };   // the start marker's own row
  const r1 = pat.rounds[0]; r1.name = 'Round 1';
  const r2 = { id: uid('rnd'), name: 'Round 2' };
  pat.rounds = [r0, r1, r2];
  pat.activeRound = r2.id;
  pat.start = 'mr';

  const ring = { id: uid('st'), round: r0.id, type: 'mr', origin: null, base: null, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false };
  const stitches = [ring];
  const byId = (id) => stitches.find((s) => s.id === id);
  let prev = ring.id;

  // ---- Round 1: [3 dc, ch] × 4 worked into the ring -----------------------
  const edges = [0, 90, 180, 270], corners = [45, 135, 225, 315], R1 = 48;
  const seq1 = [];
  for (let k = 0; k < 4; k++) {
    for (const off of [-12, 0, 12]) seq1.push({ type: 'dc', ang: edges[k] + off, R: R1 });
    seq1.push({ type: 'ch', ang: corners[k], R: R1 * 0.96 });
  }
  for (const it of seq1) {
    if (it.type === 'ch') {
      const oh = topOfStitch(byId(prev));                  // chain flows off the previous dc
      const s = mk(r1.id, 'ch', prev, { kind: 'stitch', id: prev }, oh, fromPolar(it.R + 16, it.ang));
      stitches.push(s); prev = s.id;
    } else {
      const head = fromPolar(it.R, it.ang);
      const s = mk(r1.id, it.type, prev, { kind: 'stitch', id: ring.id }, { x: 0, y: 0 }, head);
      stitches.push(s); prev = s.id;
    }
  }

  // ---- Round 2: corner shells (3 dc, ch, 3 dc) + side 3-dc groups ---------
  // Each round-2 stitch rises roughly radially from an inner anchor near the
  // round-1 ring to its head further out, with corners pushed out the most so
  // the motif reads as a square. The topological base is the nearest round-1
  // real stitch; the drawn anchor sits radially for a clean chart.
  const real1 = stitches.filter((s) => s.round === r1.id && isRealStitch(s.type));
  const nearestBaseRef = (pt) => {
    let best = ring, bd = Infinity;
    for (const s of real1) { const h = topOfStitch(s); const d = Math.hypot(h.x - pt.x, h.y - pt.y); if (d < bd) { bd = d; best = s; } }
    return { kind: 'stitch', id: best.id };
  };
  const Rin = 52;
  const items2 = [];
  for (let k = 0; k < 4; k++) {
    const c = corners[k];
    items2.push({ type: 'dc', ang: c - 13, R: 112 }, { type: 'dc', ang: c - 6, R: 116 }, { type: 'ch', ang: c, R: 120 }, { type: 'dc', ang: c + 6, R: 116 }, { type: 'dc', ang: c + 13, R: 112 });
    const e = edges[k];
    items2.push({ type: 'dc', ang: e - 9, R: 92 }, { type: 'dc', ang: e, R: 92 }, { type: 'dc', ang: e + 9, R: 92 });
  }
  items2.sort((a, b) => norm360(a.ang) - norm360(b.ang));
  for (const it of items2) {
    if (it.type === 'ch') {
      const oh = topOfStitch(byId(prev));                  // chain flows off the previous dc
      const s = mk(r2.id, 'ch', prev, { kind: 'stitch', id: prev }, oh, fromPolar(it.R + 14, it.ang));
      stitches.push(s); prev = s.id;
    } else {
      const head = fromPolar(it.R, it.ang);
      const base = nearestBaseRef(head);
      const s = mk(r2.id, it.type, prev, base, fromPolar(Rin, it.ang), head);
      stitches.push(s); prev = s.id;
    }
  }

  pat.stitches = stitches;
  pat.view = { scale: 1.5, panX: 0, panY: 0 };
  prj.patterns.push(pat);
  return normalizeProject(prj);
}
