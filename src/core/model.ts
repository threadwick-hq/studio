// The data model for stitchgrid studio. A PROJECT is your folder: it holds many
// PATTERNS plus shared RESOURCES. A PATTERN has a type (phase 1: only "granny")
// and contains ordered ROUNDS and the STITCHES placed in them.

import { uid, nowISO, deepClone } from './util';
import { isStart } from './symbols';
import type {
  Project, Pattern, Round, Stitch, Base, Resources, PatternKind, StitchType, ProjectFile,
} from './types';

export const FILE_FORMAT = 'stitchgrid-studio';
export const FILE_VERSION = 2;

export interface PatternTypeInfo { id: PatternKind; name: string; worked: string; available: boolean; }
export const PATTERN_TYPES: Record<PatternKind, PatternTypeInfo> = {
  granny: { id: 'granny', name: 'Granny square', worked: 'in the round from a centre start', available: true },
  round: { id: 'round', name: 'Worked in the round', worked: 'spiral / joined rounds', available: false },
  flat: { id: 'flat', name: 'Worked flat', worked: 'rows back and forth', available: false },
};

export function newRound(name?: string): Round {
  return { id: uid('rnd'), name: name || 'Round 1' };
}

export function newPattern(name?: string, type: PatternKind = 'granny'): Pattern {
  const r1 = newRound('Round 1');
  return {
    id: uid('pat'),
    type: PATTERN_TYPES[type] ? type : 'granny',
    name: name || 'Untitled pattern',
    start: null,
    rounds: [r1],
    activeRound: r1.id,
    stitches: [],
    view: { scale: 1.4, panX: 0, panY: 0 },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export function emptyResources(): Resources {
  return { yarns: [], links: [], notes: [], variations: [] };
}

export function newProject(name?: string): Project {
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
/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeStitch(s: any): Stitch | null {
  if (!s || !s.type) return null;
  let base: Base = null;
  if (s.base && (s.base.kind === 'stitch' || s.base.kind === 'space')) {
    base = s.base.kind === 'stitch'
      ? { kind: 'stitch', id: String(s.base.id) }
      : { kind: 'space', ids: [String(s.base.ids[0]), String(s.base.ids[1])] };
  }
  return {
    id: s.id || uid('st'),
    round: s.round,
    type: s.type as StitchType,
    origin: s.origin ?? null,
    base,
    x: +s.x || 0,
    y: +s.y || 0,
    rot: +s.rot || 0,
    len: s.len == null ? null : +s.len,
    color: s.color ?? null,
    mirror: !!s.mirror,
    auto: s.type === 'ch' ? s.auto !== false : undefined,
  };
}

export function normalizePattern(p: any = {}): Pattern {
  const pat = newPattern(p.name, PATTERN_TYPES[p.type as PatternKind] ? p.type : 'granny');
  if (p.id) pat.id = p.id;
  if (Array.isArray(p.rounds) && p.rounds.length) {
    pat.rounds = p.rounds.map((r: any, i: number) => ({ id: r.id || uid('rnd'), name: r.name || 'Round ' + (i + 1) }));
  }
  pat.start = (p.start ?? null) as StitchType | null;
  pat.stitches = Array.isArray(p.stitches) ? p.stitches.map(normalizeStitch).filter(Boolean) as Stitch[] : [];
  const roundIds = new Set(pat.rounds.map((r) => r.id));
  pat.activeRound = roundIds.has(p.activeRound) ? p.activeRound : pat.rounds[pat.rounds.length - 1]!.id;
  pat.stitches = pat.stitches.filter((s) => roundIds.has(s.round));
  ensureStartRow(pat);
  if (p.view) pat.view = { scale: +p.view.scale || 1.4, panX: +p.view.panX || 0, panY: +p.view.panY || 0 };
  pat.createdAt = p.createdAt || pat.createdAt;
  pat.updatedAt = p.updatedAt || pat.updatedAt;
  return pat;
}

function normalizeResources(r: any = {}): Resources {
  const res = emptyResources();
  if (Array.isArray(r.yarns)) res.yarns = r.yarns.map((y: any) => ({ id: y.id || uid('yrn'), name: y.name || '', brand: y.brand || '', weight: y.weight || '', color: y.color || '', hex: y.hex || '', notes: y.notes || '' }));
  if (Array.isArray(r.links)) res.links = r.links.map((l: any) => ({ id: l.id || uid('lnk'), title: l.title || '', url: l.url || '', kind: l.kind || 'link' }));
  if (Array.isArray(r.notes)) res.notes = r.notes.map((n: any) => ({ id: n.id || uid('not'), title: n.title || '', body: n.body || '' }));
  if (Array.isArray(r.variations)) res.variations = r.variations.map((v: any) => ({ id: v.id || uid('var'), title: v.title || '', body: v.body || '' }));
  return res;
}

export function normalizeProject(p: any = {}): Project {
  const prj = newProject(p.name);
  if (p.id) prj.id = p.id;
  prj.description = p.description || '';
  prj.patterns = Array.isArray(p.patterns) ? p.patterns.map(normalizePattern) : [];
  prj.resources = normalizeResources(p.resources);
  prj.createdAt = p.createdAt || prj.createdAt;
  prj.updatedAt = p.updatedAt || prj.updatedAt;
  return prj;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- start row (Round 0) --------------------------------------------------
export function startRoundId(pat: Pattern): string | null {
  const s = pat.stitches.find((x) => isStart(x.type));
  return s ? s.round : null;
}
export function isStartRound(pat: Pattern, roundId: string | null): boolean {
  return roundId != null && roundId === startRoundId(pat);
}

// Guarantee the start marker (if any) sits alone in a "Round 0" at the front.
export function ensureStartRow(pat: Pattern): void {
  const start = pat.stitches.find((s) => isStart(s.type));
  if (!start) return;
  const inSameRound = pat.stitches.filter((s) => s.round === start.round);
  const alreadyDedicated = inSameRound.length === 1 && pat.rounds[0] && pat.rounds[0].id === start.round;
  if (alreadyDedicated) { pat.rounds[0]!.name = 'Round 0'; return; }
  const r0: Round = { id: uid('rnd'), name: 'Round 0' };
  pat.rounds.unshift(r0);
  start.round = r0.id;
  if (isStartRound(pat, pat.activeRound)) pat.activeRound = (pat.rounds[1] || pat.rounds[0])!.id;
}

// ---- portable project file -------------------------------------------------
export function projectToFile(project: Project): ProjectFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: nowISO(), project: deepClone(project) };
}

export function projectFromFile(data: any): Project | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data.project && typeof data.project === 'object' ? data.project : data;
  if (!raw || (!Array.isArray(raw.patterns) && !raw.name)) return null;
  return normalizeProject(raw);
}
