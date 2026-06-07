// Shared domain types for stitchgrid studio.

export type StitchType =
  | 'ch' | 'slst' | 'sc' | 'hdc' | 'dc' | 'tr' | 'dtr' // working stitches
  | 'mr' | 'dmr' | 'chring' | 'slipknot';              // starts

export type Base =
  | { kind: 'stitch'; id: string }
  | { kind: 'space'; ids: [string, string] }
  | null;

export interface Stitch {
  id: string;
  round: string;
  type: StitchType;
  origin: string | null;       // the stitch it comes out of
  base: Base;                  // the stitch head / space it is worked into
  x: number;                   // base anchor (bottom of the marker)
  y: number;
  rot: number;
  len: number | null;          // post length; null = the type's default
  color: string | null;
  mirror: boolean;
  auto?: boolean;              // chains: auto-align between neighbours (default true)
}

export interface Round { id: string; name: string; }
export interface PatternView { scale: number; panX: number; panY: number; }
export type PatternKind = 'granny' | 'round' | 'flat';

export interface Pattern {
  id: string;
  type: PatternKind;
  name: string;
  start: StitchType | null;
  rounds: Round[];
  activeRound: string;
  stitches: Stitch[];
  view: PatternView;
  createdAt: string;
  updatedAt: string;
}

export interface Yarn { id: string; name: string; brand: string; weight: string; color: string; hex: string; notes: string; }
export interface LinkRes { id: string; title: string; url: string; kind: string; }
export interface NoteRes { id: string; title: string; body: string; }
export interface VariationRes { id: string; title: string; body: string; }
export interface Resources { yarns: Yarn[]; links: LinkRes[]; notes: NoteRes[]; variations: VariationRes[]; }
export type ResourceKind = keyof Resources;

// A project keeps an ordered list of VERSIONS. Exactly one can be Published (the
// "working" version others see); a single editable Draft can sit alongside it,
// and superseded versions become Outdated. Patterns + resources live inside the
// version, so a new draft can be edited without disturbing the published one.
export type VersionStatus = 'draft' | 'published' | 'outdated';

export interface ProjectVersion {
  id: string;
  label: string;               // e.g. "v1", "v2"
  status: VersionStatus;
  patterns: Pattern[];
  resources: Resources;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;  // when it was published (null until then)
}

export interface Project {
  id: string;
  name: string;
  description: string;
  versions: ProjectVersion[];
  activeVersionId: string;     // which version the UI is currently showing
  createdAt: string;
  updatedAt: string;
}

export interface Point { x: number; y: number; }

// ---- render shape descriptors ---------------------------------------------
export type Shape =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { k: 'circle'; cx: number; cy: number; r: number }
  | { k: 'dot'; cx: number; cy: number; r: number }
  | { k: 'path'; d: string; fill?: boolean }
  | { k: 'group'; rot: number; shapes: Shape[] };

export interface Built { shapes: Shape[]; height: number; head?: Point; }

// A resolved base reference with its current world point (from pickBase).
export type BaseHit =
  | { kind: 'stitch'; id: string; point: Point; d: number }
  | { kind: 'space'; ids: [string, string]; point: Point; d: number };

export interface SpaceSlot { ids: [string, string]; point: Point; }

export type UIView = 'projects' | 'project' | 'editor';
export interface UIState { view: UIView; projectId: string | null; patternId: string | null; }

// Portable project file wrapper.
export interface ProjectFile { format: string; version: number; exportedAt: string; project: Project; }
