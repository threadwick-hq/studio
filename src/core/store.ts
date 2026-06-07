// The single source of truth: the whole library of projects plus the UI route.
// Subscribers re-render on emit(). Editor edits (rounds + stitches) are
// transactional with undo/redo; project/resource edits autosave but aren't undoable.

import { uid, deepClone, nowISO } from './util';
import {
  newProject, newPattern, newRound, newVersion, normalizeProject,
  activeVersion, publishedVersion, draftVersion, nextVersionLabel,
  startRowId, isStartRow, PATTERN_TYPES, FILE_FORMAT, FILE_VERSION,
} from './model';
import { isStart, isRealStitch } from './symbols';
import { topOfStitch, buildStitchShapes } from './render';
import { chainOrder } from './connectivity';
import type {
  Project, ProjectVersion, Pattern, Round, Stitch, Base, StitchType, ResourceKind, Resources, UIState,
} from './types';

const SAVE_KEY = 'threadwickstudio:v2';
const LEGACY_SAVE_KEY = 'stitchgridstudio:v2'; // pre-rename key; read once and migrated forward

export interface StoreState { library: { projects: Project[] }; ui: UIState; }
type Listener = (state: StoreState) => void;
interface PatternSnapshot { start: StitchType | null; rounds: Round[]; activeRound: string; stitches: Stitch[]; }

export interface PlaceParams {
  type: StitchType;
  base?: Base;
  x: number;
  y: number;
  rot?: number;
  len?: number | null;
  originId?: string | null;
  color?: string | null;
}

export interface StitchPatch {
  type?: StitchType;
  color?: string | null;
  len?: number | null;
  round?: string;
  mirror?: boolean;
  rot?: number;
}

class Store {
  state: StoreState = {
    library: { projects: [] },
    ui: { view: 'projects', projectId: null, patternId: null },
  };
  selection = new Set<string>();
  undoStack: PatternSnapshot[] = [];
  redoStack: PatternSnapshot[] = [];

  private listeners = new Set<Listener>();
  private histPatternId: string | null = null;
  private dragSnapped = false;
  private liveSnapped = false;
  lastPlacedId: string | null = null;

  // ---- subscription --------------------------------------------------------
  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(): void { for (const fn of this.listeners) fn(this.state); }
  private touch(): void { this.emit(); }

  // ---- lookups -------------------------------------------------------------
  getProject(id: string | null): Project | null { return this.state.library.projects.find((p) => p.id === id) ?? null; }
  currentProject(): Project | null { return this.getProject(this.state.ui.projectId); }
  // The active version of the current project — patterns + resources live here.
  currentVersion(): ProjectVersion | null { const p = this.currentProject(); return p ? activeVersion(p) : null; }
  // Edits only apply to a Draft; Published/Outdated versions are read-only.
  private isDraftActive(): boolean { const v = this.currentVersion(); return !!v && v.status === 'draft'; }
  currentPattern(): Pattern | null {
    const v = this.currentVersion();
    return v ? v.patterns.find((x) => x.id === this.state.ui.patternId) ?? null : null;
  }
  // Locate a pattern (current project's active version first, then anywhere).
  private findPattern(patternId: string): { prj: Project; version: ProjectVersion; pat: Pattern } | null {
    const cur = this.currentProject();
    if (cur) { const v = activeVersion(cur); const pat = v.patterns.find((p) => p.id === patternId); if (pat) return { prj: cur, version: v, pat }; }
    for (const prj of this.state.library.projects)
      for (const v of prj.versions) { const pat = v.patterns.find((p) => p.id === patternId); if (pat) return { prj, version: v, pat }; }
    return null;
  }
  byIdMap(): Map<string, Stitch> {
    const pat = this.currentPattern();
    return new Map((pat ? pat.stitches : []).map((s) => [s.id, s]));
  }

  // ---- navigation ----------------------------------------------------------
  goProjects(): void { this.state.ui = { view: 'projects', projectId: null, patternId: null }; this.clearEditor(); this.emit(); }
  openProject(id: string): void {
    if (!this.getProject(id)) return;
    this.state.ui = { view: 'project', projectId: id, patternId: null };
    this.clearEditor(); this.emit();
  }
  openPattern(projectId: string, patternId: string): void {
    const prj = this.getProject(projectId);
    if (!prj || !activeVersion(prj).patterns.find((p) => p.id === patternId)) return;
    this.state.ui = { view: 'editor', projectId, patternId };
    this.clearEditor(); this.emit();
  }
  backToProject(): void { if (this.state.ui.projectId) this.openProject(this.state.ui.projectId); else this.goProjects(); }
  private clearEditor(): void { this.selection = new Set(); this.undoStack = []; this.redoStack = []; this.histPatternId = null; this.lastPlacedId = null; }

  // ---- projects ------------------------------------------------------------
  createProject(name?: string): string { const prj = newProject(name); this.state.library.projects.unshift(prj); this.emit(); return prj.id; }
  renameProject(id: string, name: string): void { const p = this.getProject(id); if (p) { p.name = name; p.updatedAt = nowISO(); this.emit(); } }
  updateProject(id: string, patch: Partial<Project>): void { const p = this.getProject(id); if (p) { Object.assign(p, patch); p.updatedAt = nowISO(); this.emit(); } }
  deleteProject(id: string): void {
    this.state.library.projects = this.state.library.projects.filter((p) => p.id !== id);
    if (this.state.ui.projectId === id) this.goProjects(); else this.emit();
  }
  importProject(obj: unknown): string {
    const prj = normalizeProject(obj);
    prj.id = uid('prj');
    this.reidVersions(prj);
    prj.name = this.uniqueProjectName(prj.name);
    this.state.library.projects.unshift(prj); this.emit(); return prj.id;
  }
  duplicateProject(id: string): string | null {
    const src = this.getProject(id);
    if (!src) return null;
    const copy = normalizeProject(deepClone(src));
    copy.id = uid('prj');
    this.reidVersions(copy);
    copy.name = this.uniqueProjectName(src.name + ' (copy)');
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    this.state.library.projects.unshift(copy); this.emit(); return copy.id;
  }
  // Fresh ids for every version + pattern (keeping the active pointer valid).
  private reidVersions(prj: Project): void {
    const map = new Map<string, string>();
    for (const v of prj.versions) { const nid = uid('ver'); map.set(v.id, nid); v.id = nid; v.patterns.forEach((p) => { p.id = uid('pat'); }); }
    prj.activeVersionId = map.get(prj.activeVersionId) ?? prj.versions[0]!.id;
  }
  private uniqueProjectName(name: string): string {
    const names = new Set(this.state.library.projects.map((p) => p.name));
    if (!names.has(name)) return name;
    let i = 2; while (names.has(`${name} ${i}`)) i++; return `${name} ${i}`;
  }

  // ---- versions ------------------------------------------------------------
  setActiveVersion(projectId: string, versionId: string): void {
    const prj = this.getProject(projectId);
    if (!prj || !prj.versions.find((v) => v.id === versionId)) return;
    prj.activeVersionId = versionId;
    this.clearEditor();
    // If we were in the editor on a pattern that doesn't exist in this version, step back.
    if (this.state.ui.view === 'editor' && !activeVersion(prj).patterns.find((p) => p.id === this.state.ui.patternId)) {
      this.state.ui = { view: 'project', projectId, patternId: null };
    }
    this.emit();
  }
  // Publish the active draft: the prior published version (if any) becomes Outdated.
  publishVersion(projectId: string): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    const draft = draftVersion(prj);
    if (!draft) return;
    for (const v of prj.versions) if (v.status === 'published') v.status = 'outdated';
    draft.status = 'published';
    draft.publishedAt = nowISO(); draft.updatedAt = nowISO();
    prj.activeVersionId = draft.id; prj.updatedAt = nowISO();
    this.emit();
  }
  // Start a new editable draft from the published (or active) version. Only one
  // draft at a time — if one exists, switch to it instead. Returns its id.
  createDraft(projectId: string): string | null {
    const prj = this.getProject(projectId);
    if (!prj) return null;
    const existing = draftVersion(prj);
    if (existing) { this.setActiveVersion(projectId, existing.id); return existing.id; }
    const source = publishedVersion(prj) ?? activeVersion(prj);
    const draft = newVersion(nextVersionLabel(prj), 'draft');
    draft.patterns = deepClone(source.patterns).map((p) => { p.id = uid('pat'); return p; });
    draft.resources = deepClone(source.resources);
    prj.versions.push(draft);
    prj.activeVersionId = draft.id; prj.updatedAt = nowISO();
    this.clearEditor();
    // the editor's pattern id won't exist in the freshly-id'd draft — step back to the project
    if (this.state.ui.view === 'editor') this.state.ui = { view: 'project', projectId, patternId: null };
    this.emit();
    return draft.id;
  }
  // Discard the draft and fall back to the published (or latest) version.
  discardDraft(projectId: string): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    const draft = draftVersion(prj);
    if (!draft || prj.versions.length < 2) return; // always keep at least one version
    prj.versions = prj.versions.filter((v) => v.id !== draft.id);
    prj.activeVersionId = (publishedVersion(prj) ?? prj.versions[prj.versions.length - 1]!).id;
    prj.updatedAt = nowISO();
    this.clearEditor();
    if (this.state.ui.view === 'editor') this.state.ui = { view: 'project', projectId, patternId: null };
    this.emit();
  }

  // ---- patterns ------------------------------------------------------------
  createPattern(projectId: string, name?: string, type: 'granny' | 'round' | 'flat' = 'granny'): string | null {
    const prj = this.getProject(projectId);
    if (!prj || !PATTERN_TYPES[type] || !PATTERN_TYPES[type].available) return null;
    const ver = activeVersion(prj);
    if (ver.status !== 'draft') return null; // only draft versions are editable
    const pat = newPattern(name, type);
    ver.patterns.push(pat); ver.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); return pat.id;
  }
  renamePattern(patternId: string, name: string): void {
    const found = this.findPattern(patternId);
    if (!found || found.version.status !== 'draft') return;
    found.pat.name = name; found.pat.updatedAt = nowISO();
    found.version.updatedAt = nowISO(); found.prj.updatedAt = nowISO(); this.emit();
  }
  deletePattern(projectId: string, patternId: string): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    const ver = activeVersion(prj);
    if (ver.status !== 'draft') return;
    ver.patterns = ver.patterns.filter((p) => p.id !== patternId);
    ver.updatedAt = nowISO(); prj.updatedAt = nowISO();
    if (this.state.ui.patternId === patternId) this.openProject(projectId); else this.emit();
  }
  duplicatePattern(projectId: string, patternId: string): string | null {
    const prj = this.getProject(projectId);
    const ver = prj && activeVersion(prj);
    const src = ver && ver.patterns.find((p) => p.id === patternId);
    if (!prj || !ver || !src || ver.status !== 'draft') return null;
    const copy = deepClone(src);
    copy.id = uid('pat'); copy.name = src.name + ' (copy)';
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    ver.patterns.push(copy); ver.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); return copy.id;
  }

  // ---- resources -----------------------------------------------------------
  // Generic over the kind so the public surface is type-safe (the per-kind item
  // shape is checked at the call site). The single internal cast is unavoidable
  // when indexing resources by a generic key, and is contained here.
  addResource<K extends ResourceKind>(projectId: string, kind: K, item: Partial<Omit<Resources[K][number], 'id'>>): string | null {
    const prj = this.getProject(projectId);
    if (!prj) return null;
    const ver = activeVersion(prj);
    if (ver.status !== 'draft') return null;
    const list = ver.resources[kind] as Resources[K][number][];
    const withId = { id: uid(kind.slice(0, 3)), ...item } as Resources[K][number];
    list.push(withId);
    ver.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); return withId.id;
  }
  updateResource<K extends ResourceKind>(projectId: string, kind: K, itemId: string, patch: Partial<Omit<Resources[K][number], 'id'>>): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    const ver = activeVersion(prj);
    if (ver.status !== 'draft') return;
    const it = (ver.resources[kind] as Resources[K][number][]).find((x) => x.id === itemId);
    if (it) { Object.assign(it, patch); ver.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); }
  }
  removeResource(projectId: string, kind: ResourceKind, itemId: string): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    const ver = activeVersion(prj);
    if (ver.status !== 'draft') return;
    const list = ver.resources[kind] as { id: string }[];
    const i = list.findIndex((x) => x.id === itemId);
    if (i >= 0) { list.splice(i, 1); ver.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); }
  }

  // ---- editor: history -----------------------------------------------------
  private snap(pat: Pattern): PatternSnapshot { return deepClone({ start: pat.start, rounds: pat.rounds, activeRound: pat.activeRound, stitches: pat.stitches }); }
  private restoreSnap(pat: Pattern, snap: PatternSnapshot): void { Object.assign(pat, deepClone(snap)); }
  private pushHistory(pat: Pattern): void {
    if (this.histPatternId !== pat.id) { this.undoStack = []; this.redoStack = []; this.histPatternId = pat.id; }
    this.undoStack.push(this.snap(pat));
    if (this.undoStack.length > 250) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  editTransact(fn: (pat: Pattern) => void): void {
    const pat = this.currentPattern();
    if (!pat || !this.isDraftActive()) return; // published/outdated versions are read-only
    this.pushHistory(pat);
    fn(pat);
    autoLayoutChains(pat);
    pat.updatedAt = nowISO();
    const ver = this.currentVersion(); if (ver) ver.updatedAt = nowISO();
    const prj = this.currentProject(); if (prj) prj.updatedAt = nowISO();
    this.pruneSelection(pat);
    this.touch();
  }
  undo(): void {
    const pat = this.currentPattern();
    if (!pat || !this.undoStack.length) return;
    this.redoStack.push(this.snap(pat));
    this.restoreSnap(pat, this.undoStack.pop()!);
    this.pruneSelection(pat); this.emit();
  }
  redo(): void {
    const pat = this.currentPattern();
    if (!pat || !this.redoStack.length) return;
    this.undoStack.push(this.snap(pat));
    this.restoreSnap(pat, this.redoStack.pop()!);
    this.pruneSelection(pat); this.emit();
  }
  private pruneSelection(pat: Pattern): void {
    const ids = new Set(pat.stitches.map((s) => s.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }

  // ---- editor: rounds ------------------------------------------------------
  setActiveRound(roundId: string): void {
    const pat = this.currentPattern();
    if (!pat || !pat.rounds.find((r) => r.id === roundId)) return;
    pat.activeRound = roundId; this.emit(); // the Start row is selectable too
  }
  addRound(name?: string): string | null {
    let id: string | null = null;
    this.editTransact((pat) => {
      const startId = startRowId(pat);
      const working = pat.rounds.filter((r) => r.id !== startId).length;
      const r = newRound(name || 'Round ' + (working + 1));
      pat.rounds.push(r); pat.activeRound = r.id; id = r.id;
    });
    return id;
  }
  renameRound(roundId: string, name: string): void {
    this.editTransact((pat) => {
      if (isStartRow(pat, roundId)) return; // the Start row name is fixed
      const r = pat.rounds.find((x) => x.id === roundId);
      if (r) r.name = name;
    });
  }
  removeRound(roundId: string): void {
    this.editTransact((pat) => {
      if (isStartRow(pat, roundId)) return; // can't remove the Start row
      const working = pat.rounds.filter((r) => !isStartRow(pat, r.id)).length;
      if (working <= 1) return;
      const removed = new Set(pat.stitches.filter((s) => s.round === roundId).map((s) => s.id));
      pat.rounds = pat.rounds.filter((r) => r.id !== roundId);
      pat.stitches = pat.stitches.filter((s) => s.round !== roundId);
      for (const s of pat.stitches) {
        if (s.origin && removed.has(s.origin)) s.origin = null;
        if (s.base && s.base.kind === 'stitch' && removed.has(s.base.id)) s.base = null;
        if (s.base && s.base.kind === 'space' && (removed.has(s.base.ids[0]) || removed.has(s.base.ids[1]))) s.base = null;
      }
      if (!pat.rounds.find((r) => r.id === pat.activeRound) || isStartRow(pat, pat.activeRound)) {
        const firstWorking = pat.rounds.find((r) => !isStartRow(pat, r.id));
        pat.activeRound = (firstWorking || pat.rounds[pat.rounds.length - 1]!).id;
      }
    });
  }

  // ---- editor: start -------------------------------------------------------
  // The start marker goes (alone) into the existing Start row (row 0). After it's
  // chosen we hop to the first working row so you can crochet straight away.
  setStart(type: StitchType): string | null {
    if (!isStart(type)) return null;
    let id: string | null = null;
    this.editTransact((pat) => {
      pat.start = type;
      const startRow = pat.rounds[0];
      if (!startRow) return;
      let start = pat.stitches.find((s) => isStart(s.type));
      if (start) { start.type = type; }
      else {
        start = { id: uid('st'), round: startRow.id, type, origin: null, base: null, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false };
        pat.stitches.unshift(start);
      }
      id = start.id;
      const working = pat.rounds.find((r) => r.id !== startRow.id);
      if (working) pat.activeRound = working.id;
    });
    this.lastPlacedId = id;
    return id;
  }

  // ---- editor: stitches ----------------------------------------------------
  placeStitch(params: PlaceParams): string | null {
    const { type, base = null, x, y, rot = 0, len = null, originId = null, color = null } = params;
    let id: string | null = null;
    this.editTransact((pat) => {
      const roundId = pat.activeRound;
      id = uid('st');
      if (originId) {
        const next = pat.stitches.find((s) => s.round === roundId && s.origin === originId);
        if (next) next.origin = id;
      }
      pat.stitches.push({ id, round: roundId, type, origin: originId, base, x, y, rot, len, color, mirror: false, auto: type === 'ch' ? true : undefined });
    });
    this.lastPlacedId = id;
    return id;
  }

  moveSelectionBy(dx: number, dy: number): void {
    if (!this.selection.size || (!dx && !dy)) return;
    this.editTransact((pat) => {
      for (const s of pat.stitches) if (this.selection.has(s.id)) {
        s.x += dx; s.y += dy;
        if (s.type === 'ch') s.auto = false;
      }
    });
  }

  setChainAuto(value: boolean): void {
    if (!this.selection.size) return;
    this.editTransact((pat) => {
      for (const s of pat.stitches) if (this.selection.has(s.id) && s.type === 'ch') s.auto = value;
    });
  }

  // ---- live drag (one history entry per gesture) --------------------------
  // The snapshot is taken lazily on the first frame that actually moves. dragBy
  // does NOT emit — the canvas redraws itself imperatively during the gesture;
  // commitGesture() flushes one React update (and autosave) at the end. This
  // avoids force-rendering the whole editor on every pointer move.
  dragBegin(): void { this.dragSnapped = false; }
  dragBy(dx: number, dy: number): void {
    if (!this.selection.size || (!dx && !dy) || !this.isDraftActive()) return;
    const pat = this.currentPattern();
    if (!pat) return;
    if (!this.dragSnapped) { this.pushHistory(pat); this.dragSnapped = true; }
    for (const s of pat.stitches) if (this.selection.has(s.id)) {
      s.x += dx; s.y += dy;
      if (s.type === 'ch') s.auto = false;
    }
    autoLayoutChains(pat);
    pat.updatedAt = nowISO();
  }
  commitGesture(): void { this.emit(); }

  // A continuous control (e.g. the length slider) coalesces into a single undo
  // entry: it snapshots once, then emits live so the canvas updates as you drag.
  // endLive() resets so the next gesture starts a fresh history entry.
  liveUpdateSelection(patch: StitchPatch): void {
    if (!this.selection.size || !this.isDraftActive()) return;
    const pat = this.currentPattern();
    if (!pat) return;
    if (!this.liveSnapped) { this.pushHistory(pat); this.liveSnapped = true; }
    for (const s of pat.stitches) {
      if (!this.selection.has(s.id)) continue;
      if (patch.type !== undefined) s.type = patch.type;
      if (patch.color !== undefined) s.color = patch.color;
      if (patch.len !== undefined) s.len = patch.len;
      if (patch.mirror !== undefined) s.mirror = patch.mirror;
      if (patch.rot !== undefined) s.rot = patch.rot;
    }
    autoLayoutChains(pat);
    pat.updatedAt = nowISO();
    this.touch();
  }
  endLive(): void { this.liveSnapped = false; }

  updateSelection(patch: StitchPatch): void {
    if (!this.selection.size) return;
    this.editTransact((pat) => {
      for (const s of pat.stitches) {
        if (!this.selection.has(s.id)) continue;
        if (patch.type !== undefined) s.type = patch.type;
        if (patch.color !== undefined) s.color = patch.color;
        if (patch.len !== undefined) s.len = patch.len;
        if (patch.round !== undefined) s.round = patch.round;
        if (patch.mirror !== undefined) s.mirror = patch.mirror;
        if (patch.rot !== undefined) s.rot = patch.rot;
      }
    });
  }
  rotateSelectionBy(deg: number): void {
    if (!this.selection.size) return;
    this.editTransact((pat) => { for (const s of pat.stitches) if (this.selection.has(s.id)) s.rot = (s.rot || 0) + deg; });
  }

  deleteSelection(): void { if (this.selection.size) this.removeStitches([...this.selection]); }
  removeStitches(ids: string[]): void {
    const set = new Set(ids);
    this.editTransact((pat) => {
      const byId = new Map(pat.stitches.map((s) => [s.id, s]));
      const resolve = (originId: string | null): string | null => { let cur = originId; while (cur && set.has(cur)) { const s = byId.get(cur); cur = s ? s.origin : null; } return cur; };
      pat.stitches = pat.stitches.filter((s) => !set.has(s.id));
      for (const s of pat.stitches) {
        if (s.origin && set.has(s.origin)) s.origin = resolve(s.origin);
        if (s.base && s.base.kind === 'stitch' && set.has(s.base.id)) s.base = null;
        if (s.base && s.base.kind === 'space' && (set.has(s.base.ids[0]) || set.has(s.base.ids[1]))) s.base = null;
      }
    });
    this.selection.clear();
    this.emit();
  }

  // Evenly fan a round's real stitches around their common centre.
  evenRound(roundId: string): void {
    this.editTransact((pat) => {
      const order = chainOrder(pat.stitches, roundId).filter((s) => isRealStitch(s.type));
      if (order.length < 2) return;
      let cx = 0, cy = 0;
      for (const s of order) { cx += s.x; cy += s.y; }
      cx /= order.length; cy /= order.length;
      let R = 0; const heads = order.map((s) => topOfStitch(s));
      for (const h of heads) R += Math.hypot(h.x - cx, h.y - cy);
      R /= order.length;
      const start = Math.atan2(heads[0]!.y - cy, heads[0]!.x - cx);
      order.forEach((s, i) => {
        const a = start + (i * 2 * Math.PI) / order.length;
        const hx = cx + R * Math.cos(a), hy = cy + R * Math.sin(a);
        const dx = hx - s.x, dy = hy - s.y;
        s.len = Math.max(2, Math.hypot(dx, dy));
        s.rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
      });
    });
  }

  // ---- selection -----------------------------------------------------------
  setSelection(ids: string[]): void { this.selection = new Set(ids); this.emit(); }
  toggleSelection(id: string, additive: boolean): void {
    if (!additive) this.selection = new Set([id]);
    else if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }
  clearSelection(): void { if (this.selection.size) { this.selection.clear(); this.emit(); } }

  // ---- persistence ---------------------------------------------------------
  serialize(): { format: string; version: number; library: { projects: Project[] }; ui: UIState } {
    return {
      format: FILE_FORMAT, version: FILE_VERSION,
      library: { projects: this.state.library.projects },
      ui: { view: this.state.ui.view, projectId: this.state.ui.projectId, patternId: this.state.ui.patternId },
    };
  }
  saveLocal(): void { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch { /* ignore quota */ } }
  loadLocal(): boolean {
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      const fromLegacy = raw === null;
      if (fromLegacy) raw = localStorage.getItem(LEGACY_SAVE_KEY); // tool was renamed; keep old data
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.library || !Array.isArray(data.library.projects)) return false;
      this.state.library.projects = data.library.projects.map(normalizeProject);
      const ui = data.ui || {};
      const prj = this.getProject(ui.projectId);
      if (prj) {
        this.state.ui.projectId = prj.id;
        const pat = activeVersion(prj).patterns.find((p) => p.id === ui.patternId);
        if (pat && ui.view === 'editor') { this.state.ui.patternId = pat.id; this.state.ui.view = 'editor'; }
        else this.state.ui.view = 'project';
      }
      if (fromLegacy) this.saveLocal(); // migrate pre-rename data onto the current key
      return true;
    } catch { return false; }
  }
}

// Evenly align every auto chain along the segment between its nearest non-chain
// ancestor's head and nearest non-chain child's head.
function autoLayoutChains(pat: Pattern): void {
  const stitches = pat.stitches;
  const byId = new Map(stitches.map((s) => [s.id, s]));
  const childOf = new Map<string, Stitch>();
  for (const s of stitches) if (s.origin) childOf.set(s.origin, s);
  const built = buildStitchShapes('ch');
  const ovalCy = built.shapes[0] && built.shapes[0].k === 'ellipse' ? built.shapes[0].cy : 0;
  const d0 = -ovalCy;
  for (const s of stitches) {
    if (s.type !== 'ch' || s.auto === false) continue;
    let a = s.origin ? byId.get(s.origin) : undefined, before = 0; const seenA = new Set([s.id]);
    while (a && a.type === 'ch' && !seenA.has(a.id)) { before++; seenA.add(a.id); a = a.origin ? byId.get(a.origin) : undefined; }
    let c = childOf.get(s.id), after = 0; const seenC = new Set([s.id]);
    while (c && c.type === 'ch' && !seenC.has(c.id)) { after++; seenC.add(c.id); c = childOf.get(c.id); }
    if (!a || !c || a.type === 'ch' || c.type === 'ch') continue;
    const ah = topOfStitch(a), chd = topOfStitch(c);
    const dx = chd.x - ah.x, dy = chd.y - ah.y;
    const L = Math.hypot(dx, dy); if (L < 1e-6) continue;
    const N = before + 1 + after;
    const t = (before + 1) / (N + 1);
    const sx = ah.x + dx * t, sy = ah.y + dy * t;
    const ux = dx / L, uy = dy / L;
    s.rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
    s.x = sx - d0 * ux; s.y = sy - d0 * uy;
  }
}

export const store = new Store();
export type { Store };
