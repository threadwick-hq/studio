// The data model for stitchgrid studio. A PROJECT is your folder: it holds many
// PATTERNS plus shared RESOURCES. A PATTERN has a type (phase 1: only "granny")
// and contains ordered ROUNDS and the STITCHES placed in them.

import { uid, nowISO, deepClone } from './util';
import { isStart } from './symbols';
import type {
  Project, ProjectVersion, VersionStatus, Pattern, Round, Stitch, Base, Resources, PatternKind, StitchType, ProjectFile,
} from './types';

export const FILE_FORMAT = 'stitchgrid-studio';
export const FILE_VERSION = 3; // v3: projects hold versions (draft/published/outdated)

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
  const startRow: Round = { id: uid('rnd'), name: 'Start' };
  const r1 = newRound('Round 1');
  return {
    id: uid('pat'),
    type: PATTERN_TYPES[type] ? type : 'granny',
    name: name || 'Untitled pattern',
    start: null,
    rounds: [startRow, r1],   // the Start row (row 0) exists from the start
    activeRound: startRow.id, // open on Start so you pick a starting stitch first
    stitches: [],
    view: { scale: 1.4, panX: 0, panY: 0 },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export function emptyResources(): Resources {
  return { yarns: [], links: [], notes: [], variations: [] };
}

export function newVersion(label = 'v1', status: VersionStatus = 'draft'): ProjectVersion {
  return {
    id: uid('ver'),
    label,
    status,
    patterns: [],
    resources: emptyResources(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedAt: null,
  };
}

export function newProject(name?: string): Project {
  const v = newVersion('v1', 'draft');
  return {
    id: uid('prj'),
    name: name || 'Untitled project',
    description: '',
    versions: [v],
    activeVersionId: v.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

// ---- version helpers -------------------------------------------------------
// The version currently selected for viewing/editing (with sensible fallbacks).
export function activeVersion(prj: Project): ProjectVersion {
  return prj.versions.find((v) => v.id === prj.activeVersionId)
    ?? publishedVersion(prj)
    ?? prj.versions[prj.versions.length - 1]!;
}
export function publishedVersion(prj: Project): ProjectVersion | undefined {
  return prj.versions.find((v) => v.status === 'published');
}
export function draftVersion(prj: Project): ProjectVersion | undefined {
  return prj.versions.find((v) => v.status === 'draft');
}
// For cards/thumbnails: prefer the live published version, else whatever's active.
export function displayVersion(prj: Project): ProjectVersion {
  return publishedVersion(prj) ?? activeVersion(prj);
}
// Next "vN" label, one past the highest existing numbered version.
export function nextVersionLabel(prj: Project): string {
  let max = 0;
  for (const v of prj.versions) { const m = /^v(\d+)$/.exec(v.label); if (m) max = Math.max(max, +m[1]!); }
  return 'v' + (max + 1);
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

function normalizeStatus(s: any): VersionStatus {
  return s === 'published' || s === 'outdated' || s === 'draft' ? s : 'draft';
}

function normalizeVersion(v: any = {}, fallbackLabel = 'v1'): ProjectVersion {
  const ver = newVersion(typeof v.label === 'string' && v.label ? v.label : fallbackLabel, normalizeStatus(v.status));
  if (v.id) ver.id = v.id;
  ver.patterns = Array.isArray(v.patterns) ? v.patterns.map(normalizePattern) : [];
  ver.resources = normalizeResources(v.resources);
  ver.createdAt = v.createdAt || ver.createdAt;
  ver.updatedAt = v.updatedAt || ver.updatedAt;
  ver.publishedAt = v.publishedAt || (ver.status === 'published' ? ver.updatedAt : null);
  return ver;
}

// At most one Published version: if data carries several, keep the most recently
// published and demote the rest to Outdated.
function enforceSinglePublished(versions: ProjectVersion[]): void {
  const pub = versions.filter((v) => v.status === 'published');
  if (pub.length <= 1) return;
  pub.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
  for (let i = 0; i < pub.length - 1; i++) pub[i]!.status = 'outdated';
}

export function normalizeProject(p: any = {}): Project {
  const prj = newProject(p.name);
  if (p.id) prj.id = p.id;
  prj.description = p.description || '';
  if (Array.isArray(p.versions) && p.versions.length) {
    prj.versions = p.versions.map((v: any, i: number) => normalizeVersion(v, 'v' + (i + 1)));
  } else {
    // Migrate a legacy project ({ patterns, resources }) into a single draft version.
    prj.versions = [normalizeVersion({
      patterns: p.patterns, resources: p.resources, status: 'draft', label: 'v1',
      createdAt: p.createdAt, updatedAt: p.updatedAt,
    })];
  }
  enforceSinglePublished(prj.versions);
  const active = prj.versions.find((v) => v.id === p.activeVersionId)
    ?? publishedVersion(prj)
    ?? draftVersion(prj)
    ?? prj.versions[0]!;
  prj.activeVersionId = active.id;
  prj.createdAt = p.createdAt || prj.createdAt;
  prj.updatedAt = p.updatedAt || prj.updatedAt;
  return prj;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- the "Start" row (row 0) ----------------------------------------------
// rounds[0] is always the Start row: it exists from creation and holds only the
// start marker; the working rows follow it. These helpers treat rounds[0] as
// the Start row.
export function startRowId(pat: Pattern): string | null {
  return pat.rounds[0] ? pat.rounds[0].id : null;
}
export function isStartRow(pat: Pattern, roundId: string | null): boolean {
  return roundId != null && pat.rounds[0]?.id === roundId;
}
export function hasStart(pat: Pattern): boolean {
  return pat.stitches.some((s) => isStart(s.type));
}

// Guarantee a "Start" row at index 0 (holding only the start marker, if any),
// plus at least one working row after it. Migrates older data.
export function ensureStartRow(pat: Pattern): void {
  const start = pat.stitches.find((s) => isStart(s.type));
  if (start) {
    const inSame = pat.stitches.filter((s) => s.round === start.round);
    const aloneInRound = inSame.length === 1;
    if (aloneInRound && pat.rounds[0] && pat.rounds[0].id !== start.round) {
      // its row is already dedicated but not first — move that row to the front
      const startRound = pat.rounds.find((r) => r.id === start.round)!;
      pat.rounds = [startRound, ...pat.rounds.filter((r) => r.id !== start.round)];
    } else if (!aloneInRound) {
      const r: Round = { id: uid('rnd'), name: 'Start' }; pat.rounds.unshift(r); start.round = r.id;
    }
  } else {
    const first = pat.rounds[0];
    const firstHasStitches = !!first && pat.stitches.some((s) => s.round === first.id);
    if (!first || firstHasStitches) pat.rounds.unshift({ id: uid('rnd'), name: 'Start' });
  }
  if (pat.rounds[0]) pat.rounds[0].name = 'Start';
  if (pat.rounds.length < 2) pat.rounds.push(newRound('Round 1'));
  if (!pat.rounds.find((r) => r.id === pat.activeRound)) pat.activeRound = pat.rounds[0]!.id;
}

// ---- portable project file -------------------------------------------------
export function projectToFile(project: Project): ProjectFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: nowISO(), project: deepClone(project) };
}

export function projectFromFile(data: unknown): Project | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  const raw = (rec.project && typeof rec.project === 'object' ? rec.project : rec) as Record<string, unknown>;
  if (!Array.isArray(raw.patterns) && !raw.name) return null;
  return normalizeProject(raw);
}
