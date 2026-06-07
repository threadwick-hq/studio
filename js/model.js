// model.js — the data model for stitchgrid studio.
//
// A PROJECT is your folder: it holds many PATTERNS plus shared RESOURCES
// (yarns, links, notes, variations). A PATTERN has a type — for phase 1 only
// "granny" (granny square) is implemented — and contains ordered ROUNDS and the
// STITCHES placed in them. Everything here is plain JSON so a project can be
// saved to localStorage and exported to a file unchanged.

import { uid, nowISO, deepClone } from './util.js';
import { isStart } from './symbols.js';

export const FILE_FORMAT = 'stitchgrid-studio';
export const FILE_VERSION = 2;

export const PATTERN_TYPES = {
  granny: { id: 'granny', name: 'Granny square', worked: 'in the round from a centre start', available: true },
  // Reserved for later phases — surfaced as "coming soon" in the UI.
  round: { id: 'round', name: 'Worked in the round', worked: 'spiral / joined rounds', available: false },
  flat: { id: 'flat', name: 'Worked flat', worked: 'rows back and forth', available: false },
};

export function newRound(name) {
  return { id: uid('rnd'), name: name || 'Round 1' };
}

export function newPattern(name, type = 'granny') {
  const r1 = newRound('Round 1');
  return {
    id: uid('pat'),
    type,
    name: name || 'Untitled pattern',
    start: null,            // chosen start type: 'mr' | 'dmr' | 'chring' | 'slipknot'
    rounds: [r1],
    activeRound: r1.id,     // the row currently being worked
    stitches: [],           // see connectivity.js for the stitch shape
    view: { scale: 1.4, panX: 0, panY: 0 },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export function emptyResources() {
  return { yarns: [], links: [], notes: [], variations: [] };
}

export function newProject(name) {
  return {
    id: uid('prj'),
    name: name || 'Untitled project',
    description: '',
    patterns: [],
    resources: emptyResources(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

// ---- normalisation / migration --------------------------------------------
// Tolerantly coerce any loaded object into a valid project, filling gaps. Keeps
// old autosaves and imported files working as the model evolves.
export function normalizePattern(p = {}) {
  const pat = newPattern(p.name, PATTERN_TYPES[p.type] ? p.type : 'granny');
  if (p.id) pat.id = p.id;
  if (Array.isArray(p.rounds) && p.rounds.length) {
    pat.rounds = p.rounds.map((r, i) => ({ id: r.id || uid('rnd'), name: r.name || 'Round ' + (i + 1) }));
  }
  pat.start = p.start ?? null;
  pat.stitches = Array.isArray(p.stitches) ? p.stitches.map(normalizeStitch).filter(Boolean) : [];
  const roundIds = new Set(pat.rounds.map((r) => r.id));
  pat.activeRound = roundIds.has(p.activeRound) ? p.activeRound : pat.rounds[pat.rounds.length - 1].id;
  // drop stitches whose round vanished
  pat.stitches = pat.stitches.filter((s) => roundIds.has(s.round));
  ensureStartRow(pat); // the start marker always lives alone in its own Round 0
  if (p.view) pat.view = { scale: +p.view.scale || 1.4, panX: +p.view.panX || 0, panY: +p.view.panY || 0 };
  pat.createdAt = p.createdAt || pat.createdAt;
  pat.updatedAt = p.updatedAt || pat.updatedAt;
  return pat;
}

// The id of the dedicated start row (the round that holds the start marker), or
// null if no start has been chosen yet.
export function startRoundId(pat) {
  const s = pat.stitches.find((x) => isStart(x.type));
  return s ? s.round : null;
}
export function isStartRound(pat, roundId) {
  return roundId != null && roundId === startRoundId(pat);
}

// Guarantee the start marker (if any) sits alone in a "Round 0" at the front.
// Migrates older data where the marker shared Round 1 with worked stitches.
export function ensureStartRow(pat) {
  const start = pat.stitches.find((s) => isStart(s.type));
  if (!start) return;
  const inSameRound = pat.stitches.filter((s) => s.round === start.round);
  const alreadyDedicated = inSameRound.length === 1 && pat.rounds[0] && pat.rounds[0].id === start.round;
  if (alreadyDedicated) { pat.rounds[0].name = 'Round 0'; return; }
  const r0 = { id: uid('rnd'), name: 'Round 0' };
  pat.rounds.unshift(r0);
  start.round = r0.id;
  if (isStartRound(pat, pat.activeRound)) pat.activeRound = (pat.rounds[1] || pat.rounds[0]).id;
}

function normalizeStitch(s) {
  if (!s || !s.type) return null;
  const base = s.base && (s.base.kind === 'stitch' || s.base.kind === 'space')
    ? (s.base.kind === 'stitch' ? { kind: 'stitch', id: s.base.id } : { kind: 'space', ids: [s.base.ids[0], s.base.ids[1]] })
    : null;
  return {
    id: s.id || uid('st'),
    round: s.round,
    type: s.type,
    origin: s.origin ?? null,
    base,
    x: +s.x || 0,
    y: +s.y || 0,
    rot: +s.rot || 0,
    len: s.len == null ? null : +s.len,
    color: s.color ?? null,
    mirror: !!s.mirror,
    // chains auto-align between their nearest non-chain neighbours unless the
    // user has moved them by hand (then auto is off until re-enabled).
    auto: s.type === 'ch' ? s.auto !== false : undefined,
  };
}

function normalizeResources(r = {}) {
  const res = emptyResources();
  if (Array.isArray(r.yarns)) res.yarns = r.yarns.map((y) => ({ id: y.id || uid('yrn'), name: y.name || '', brand: y.brand || '', weight: y.weight || '', color: y.color || '', hex: y.hex || '', notes: y.notes || '' }));
  if (Array.isArray(r.links)) res.links = r.links.map((l) => ({ id: l.id || uid('lnk'), title: l.title || '', url: l.url || '', kind: l.kind || 'link' }));
  if (Array.isArray(r.notes)) res.notes = r.notes.map((n) => ({ id: n.id || uid('not'), title: n.title || '', body: n.body || '' }));
  if (Array.isArray(r.variations)) res.variations = r.variations.map((v) => ({ id: v.id || uid('var'), title: v.title || '', body: v.body || '' }));
  return res;
}

export function normalizeProject(p = {}) {
  const prj = newProject(p.name);
  if (p.id) prj.id = p.id;
  prj.description = p.description || '';
  prj.patterns = Array.isArray(p.patterns) ? p.patterns.map(normalizePattern) : [];
  prj.resources = normalizeResources(p.resources);
  prj.createdAt = p.createdAt || prj.createdAt;
  prj.updatedAt = p.updatedAt || prj.updatedAt;
  return prj;
}

// ---- portable project file -------------------------------------------------
export function projectToFile(project) {
  return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: nowISO(), project: deepClone(project) };
}

// Accept either a wrapped file ({format,project}) or a bare project object.
export function projectFromFile(data) {
  if (!data || typeof data !== 'object') return null;
  const raw = data.project && typeof data.project === 'object' ? data.project : data;
  if (!raw || (!Array.isArray(raw.patterns) && !raw.name)) return null;
  return normalizeProject(raw);
}
