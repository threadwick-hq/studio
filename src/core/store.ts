// The single source of truth: the whole library of projects plus the UI route.
// Subscribers re-render on emit(). Editor edits (rounds + stitches) are
// transactional with undo/redo; project/resource edits autosave but aren't undoable.

import { uid, deepClone, nowISO } from './util';
import {
  newProject, newPattern, newRound, normalizeProject,
  startRoundId, isStartRound, PATTERN_TYPES, FILE_FORMAT, FILE_VERSION,
} from './model';
import { isStart, isRealStitch } from './symbols';
import { topOfStitch, buildStitchShapes } from './render';
import { chainOrder } from './connectivity';
import type {
  Project, Pattern, Round, Stitch, Base, StitchType, ResourceKind, Resources, UIState, ProjectFile,
} from './types';

const SAVE_KEY = 'stitchgridstudio:v2';

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
  currentPattern(): Pattern | null {
    const p = this.currentProject();
    return p ? p.patterns.find((x) => x.id === this.state.ui.patternId) ?? null : null;
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
    if (!prj || !prj.patterns.find((p) => p.id === patternId)) return;
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
    prj.patterns.forEach((p) => { p.id = uid('pat'); });
    prj.name = this.uniqueProjectName(prj.name);
    this.state.library.projects.unshift(prj); this.emit(); return prj.id;
  }
  duplicateProject(id: string): string | null {
    const src = this.getProject(id);
    if (!src) return null;
    const copy = normalizeProject(deepClone(src));
    copy.id = uid('prj');
    copy.patterns.forEach((p) => { p.id = uid('pat'); });
    copy.name = this.uniqueProjectName(src.name + ' (copy)');
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    this.state.library.projects.unshift(copy); this.emit(); return copy.id;
  }
  private uniqueProjectName(name: string): string {
    const names = new Set(this.state.library.projects.map((p) => p.name));
    if (!names.has(name)) return name;
    let i = 2; while (names.has(`${name} ${i}`)) i++; return `${name} ${i}`;
  }

  // ---- patterns ------------------------------------------------------------
  createPattern(projectId: string, name?: string, type: 'granny' | 'round' | 'flat' = 'granny'): string | null {
    const prj = this.getProject(projectId);
    if (!prj || !PATTERN_TYPES[type] || !PATTERN_TYPES[type].available) return null;
    const pat = newPattern(name, type);
    prj.patterns.push(pat); prj.updatedAt = nowISO(); this.emit(); return pat.id;
  }
  renamePattern(patternId: string, name: string): void {
    const prj = this.currentProject() || this.ownerOfPattern(patternId);
    const pat = prj && prj.patterns.find((p) => p.id === patternId);
    if (prj && pat) { pat.name = name; pat.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); }
  }
  deletePattern(projectId: string, patternId: string): void {
    const prj = this.getProject(projectId);
    if (!prj) return;
    prj.patterns = prj.patterns.filter((p) => p.id !== patternId);
    prj.updatedAt = nowISO();
    if (this.state.ui.patternId === patternId) this.openProject(projectId); else this.emit();
  }
  duplicatePattern(projectId: string, patternId: string): string | null {
    const prj = this.getProject(projectId);
    const src = prj && prj.patterns.find((p) => p.id === patternId);
    if (!prj || !src) return null;
    const copy = deepClone(src);
    copy.id = uid('pat'); copy.name = src.name + ' (copy)';
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    prj.patterns.push(copy); prj.updatedAt = nowISO(); this.emit(); return copy.id;
  }
  private ownerOfPattern(patternId: string): Project | null {
    return this.state.library.projects.find((p) => p.patterns.some((x) => x.id === patternId)) ?? null;
  }

  // ---- resources -----------------------------------------------------------
  addResource(projectId: string, kind: ResourceKind, item: Record<string, unknown>): string | null {
    const prj = this.getProject(projectId);
    if (!prj || !prj.resources[kind]) return null;
    const withId = { id: uid(kind.slice(0, 3)), ...item } as Resources[typeof kind][number];
    (prj.resources[kind] as unknown[]).push(withId);
    prj.updatedAt = nowISO(); this.emit(); return withId.id;
  }
  updateResource(projectId: string, kind: ResourceKind, itemId: string, patch: Record<string, unknown>): void {
    const prj = this.getProject(projectId);
    const it = prj && (prj.resources[kind] as { id: string }[]).find((x) => x.id === itemId);
    if (prj && it) { Object.assign(it, patch); prj.updatedAt = nowISO(); this.emit(); }
  }
  removeResource(projectId: string, kind: ResourceKind, itemId: string): void {
    const prj = this.getProject(projectId);
    if (!prj || !prj.resources[kind]) return;
    (prj.resources[kind] as { id: string }[]) = (prj.resources[kind] as { id: string }[]).filter((x) => x.id !== itemId);
    prj.updatedAt = nowISO(); this.emit();
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
    if (!pat) return;
    this.pushHistory(pat);
    fn(pat);
    autoLayoutChains(pat);
    pat.updatedAt = nowISO();
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
    if (isStartRound(pat, roundId)) return;
    pat.activeRound = roundId; this.emit();
  }
  addRound(name?: string): string | null {
    let id: string | null = null;
    this.editTransact((pat) => {
      const startId = startRoundId(pat);
      const working = pat.rounds.filter((r) => r.id !== startId).length;
      const r = newRound(name || 'Round ' + (working + 1));
      pat.rounds.push(r); pat.activeRound = r.id; id = r.id;
    });
    return id;
  }
  renameRound(roundId: string, name: string): void {
    this.editTransact((pat) => {
      if (isStartRound(pat, roundId)) return;
      const r = pat.rounds.find((x) => x.id === roundId);
      if (r) r.name = name;
    });
  }
  removeRound(roundId: string): void {
    this.editTransact((pat) => {
      if (isStartRound(pat, roundId)) return;
      const working = pat.rounds.filter((r) => !isStartRound(pat, r.id)).length;
      if (working <= 1) return;
      const removed = new Set(pat.stitches.filter((s) => s.round === roundId).map((s) => s.id));
      pat.rounds = pat.rounds.filter((r) => r.id !== roundId);
      pat.stitches = pat.stitches.filter((s) => s.round !== roundId);
      for (const s of pat.stitches) {
        if (s.origin && removed.has(s.origin)) s.origin = null;
        if (s.base && s.base.kind === 'stitch' && removed.has(s.base.id)) s.base = null;
        if (s.base && s.base.kind === 'space' && (removed.has(s.base.ids[0]) || removed.has(s.base.ids[1]))) s.base = null;
      }
      if (!pat.rounds.find((r) => r.id === pat.activeRound) || isStartRound(pat, pat.activeRound)) {
        const firstWorking = pat.rounds.find((r) => !isStartRound(pat, r.id));
        pat.activeRound = (firstWorking || pat.rounds[pat.rounds.length - 1]!).id;
      }
    });
  }

  // ---- editor: start -------------------------------------------------------
  setStart(type: StitchType): string | null {
    if (!isStart(type)) return null;
    let id: string | null = null;
    this.editTransact((pat) => {
      pat.start = type;
      let start = pat.stitches.find((s) => isStart(s.type));
      if (start) { start.type = type; }
      else {
        const r0 = newRound('Round 0');
        pat.rounds.unshift(r0);
        start = { id: uid('st'), round: r0.id, type, origin: null, base: null, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false };
        pat.stitches.unshift(start);
        if (isStartRound(pat, pat.activeRound)) pat.activeRound = (pat.rounds[1] || pat.rounds[0])!.id;
      }
      id = start.id;
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
    if (!this.selection.size || (!dx && !dy)) return;
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
    if (!this.selection.size) return;
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
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.library || !Array.isArray(data.library.projects)) return false;
      this.state.library.projects = data.library.projects.map(normalizeProject);
      const ui = data.ui || {};
      const prj = this.getProject(ui.projectId);
      if (prj) {
        this.state.ui.projectId = prj.id;
        const pat = prj.patterns.find((p) => p.id === ui.patternId);
        if (pat && ui.view === 'editor') { this.state.ui.patternId = pat.id; this.state.ui.view = 'editor'; }
        else this.state.ui.view = 'project';
      }
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
