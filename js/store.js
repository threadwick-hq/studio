// store.js — the single source of truth.
//
// Holds the whole library of projects plus the lightweight UI route (which
// project / pattern is open). Subscribers re-render on emit(). Editor edits
// (rounds + stitches) are transactional with undo/redo; project- and
// resource-level edits autosave but aren't part of the undo stack.

import { uid, deepClone, nowISO } from './util.js';
import {
  newProject, newPattern, newRound, normalizeProject,
  startRoundId, isStartRound,
  PATTERN_TYPES, FILE_FORMAT, FILE_VERSION,
} from './model.js';
import { isStart, isRealStitch } from './symbols.js';
import { topOfStitch, buildStitchShapes } from './render.js';
import { chainOrder } from './connectivity.js';

const SAVE_KEY = 'stitchgridstudio:v2';

class Store {
  constructor() {
    this.state = {
      library: { projects: [] },
      ui: { view: 'projects', projectId: null, patternId: null },
    };
    this.selection = new Set();
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._histPatternId = null;
    this._lastPlacedId = null;
  }

  // ---- subscription --------------------------------------------------------
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  _touch() { this.emit(); }

  // ---- lookups -------------------------------------------------------------
  getProject(id) { return this.state.library.projects.find((p) => p.id === id) || null; }
  currentProject() { return this.getProject(this.state.ui.projectId); }
  currentPattern() {
    const p = this.currentProject();
    return p ? p.patterns.find((x) => x.id === this.state.ui.patternId) || null : null;
  }
  byIdMap() {
    const pat = this.currentPattern();
    return new Map((pat ? pat.stitches : []).map((s) => [s.id, s]));
  }

  // ---- navigation ----------------------------------------------------------
  goProjects() { this.state.ui = { view: 'projects', projectId: null, patternId: null }; this._clearEditor(); this.emit(); }
  openProject(id) {
    if (!this.getProject(id)) return;
    this.state.ui = { view: 'project', projectId: id, patternId: null };
    this._clearEditor();
    this.emit();
  }
  openPattern(projectId, patternId) {
    const prj = this.getProject(projectId);
    if (!prj || !prj.patterns.find((p) => p.id === patternId)) return;
    this.state.ui = { view: 'editor', projectId, patternId };
    this._clearEditor();
    this.emit();
  }
  backToProject() {
    if (this.state.ui.projectId) this.openProject(this.state.ui.projectId);
    else this.goProjects();
  }
  _clearEditor() { this.selection = new Set(); this.undoStack = []; this.redoStack = []; this._histPatternId = null; this._lastPlacedId = null; }

  // ---- projects ------------------------------------------------------------
  createProject(name) {
    const prj = newProject(name);
    this.state.library.projects.unshift(prj);
    this.emit();
    return prj.id;
  }
  renameProject(id, name) { const p = this.getProject(id); if (p) { p.name = name; p.updatedAt = nowISO(); this.emit(); } }
  updateProject(id, patch) { const p = this.getProject(id); if (p) { Object.assign(p, patch); p.updatedAt = nowISO(); this.emit(); } }
  deleteProject(id) {
    this.state.library.projects = this.state.library.projects.filter((p) => p.id !== id);
    if (this.state.ui.projectId === id) this.goProjects(); else this.emit();
  }
  importProject(obj) {
    const prj = normalizeProject(obj);
    prj.id = uid('prj'); // fresh id so imports never collide with existing
    prj.patterns.forEach((p) => { p.id = uid('pat'); });
    prj.name = this._uniqueProjectName(prj.name);
    this.state.library.projects.unshift(prj);
    this.emit();
    return prj.id;
  }
  duplicateProject(id) {
    const src = this.getProject(id);
    if (!src) return null;
    const copy = normalizeProject(deepClone(src));
    copy.id = uid('prj');
    copy.patterns.forEach((p) => { p.id = uid('pat'); });
    copy.name = this._uniqueProjectName(src.name + ' (copy)');
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    this.state.library.projects.unshift(copy);
    this.emit();
    return copy.id;
  }
  _uniqueProjectName(name) {
    const names = new Set(this.state.library.projects.map((p) => p.name));
    if (!names.has(name)) return name;
    let i = 2; while (names.has(`${name} ${i}`)) i++; return `${name} ${i}`;
  }

  // ---- patterns ------------------------------------------------------------
  createPattern(projectId, name, type = 'granny') {
    const prj = this.getProject(projectId);
    if (!prj || !PATTERN_TYPES[type] || !PATTERN_TYPES[type].available) return null;
    const pat = newPattern(name, type);
    prj.patterns.push(pat);
    prj.updatedAt = nowISO();
    this.emit();
    return pat.id;
  }
  renamePattern(patternId, name) {
    const prj = this.currentProject() || this._ownerOfPattern(patternId);
    const pat = prj && prj.patterns.find((p) => p.id === patternId);
    if (pat) { pat.name = name; pat.updatedAt = nowISO(); prj.updatedAt = nowISO(); this.emit(); }
  }
  deletePattern(projectId, patternId) {
    const prj = this.getProject(projectId);
    if (!prj) return;
    prj.patterns = prj.patterns.filter((p) => p.id !== patternId);
    prj.updatedAt = nowISO();
    if (this.state.ui.patternId === patternId) this.openProject(projectId); else this.emit();
  }
  duplicatePattern(projectId, patternId) {
    const prj = this.getProject(projectId);
    const src = prj && prj.patterns.find((p) => p.id === patternId);
    if (!src) return null;
    const copy = deepClone(src);
    copy.id = uid('pat'); copy.name = src.name + ' (copy)';
    copy.createdAt = nowISO(); copy.updatedAt = nowISO();
    prj.patterns.push(copy);
    prj.updatedAt = nowISO();
    this.emit();
    return copy.id;
  }
  _ownerOfPattern(patternId) {
    return this.state.library.projects.find((p) => p.patterns.some((x) => x.id === patternId)) || null;
  }

  // ---- resources -----------------------------------------------------------
  addResource(projectId, kind, item) {
    const prj = this.getProject(projectId);
    if (!prj || !prj.resources[kind]) return null;
    const withId = { id: uid(kind.slice(0, 3)), ...item };
    prj.resources[kind].push(withId);
    prj.updatedAt = nowISO();
    this.emit();
    return withId.id;
  }
  updateResource(projectId, kind, itemId, patch) {
    const prj = this.getProject(projectId);
    const it = prj && prj.resources[kind] && prj.resources[kind].find((x) => x.id === itemId);
    if (it) { Object.assign(it, patch); prj.updatedAt = nowISO(); this.emit(); }
  }
  removeResource(projectId, kind, itemId) {
    const prj = this.getProject(projectId);
    if (!prj || !prj.resources[kind]) return;
    prj.resources[kind] = prj.resources[kind].filter((x) => x.id !== itemId);
    prj.updatedAt = nowISO();
    this.emit();
  }

  // ---- editor: history -----------------------------------------------------
  _snap(pat) { return deepClone({ start: pat.start, rounds: pat.rounds, activeRound: pat.activeRound, stitches: pat.stitches }); }
  _restoreSnap(pat, snap) { Object.assign(pat, deepClone(snap)); }
  _pushHistory(pat) {
    if (this._histPatternId !== pat.id) { this.undoStack = []; this.redoStack = []; this._histPatternId = pat.id; }
    this.undoStack.push(this._snap(pat));
    if (this.undoStack.length > 250) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  editTransact(fn) {
    const pat = this.currentPattern();
    if (!pat) return;
    this._pushHistory(pat);
    fn(pat);
    autoLayoutChains(pat); // keep auto chains evenly aligned after any edit
    pat.updatedAt = nowISO();
    const prj = this.currentProject(); if (prj) prj.updatedAt = nowISO();
    this._pruneSelection(pat);
    this._touch();
  }
  undo() {
    const pat = this.currentPattern();
    if (!pat || !this.undoStack.length) return;
    this.redoStack.push(this._snap(pat));
    this._restoreSnap(pat, this.undoStack.pop());
    this._pruneSelection(pat);
    this.emit();
  }
  redo() {
    const pat = this.currentPattern();
    if (!pat || !this.redoStack.length) return;
    this.undoStack.push(this._snap(pat));
    this._restoreSnap(pat, this.redoStack.pop());
    this._pruneSelection(pat);
    this.emit();
  }
  _pruneSelection(pat) {
    const ids = new Set(pat.stitches.map((s) => s.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }

  // ---- editor: rounds ------------------------------------------------------
  setActiveRound(roundId) {
    const pat = this.currentPattern();
    if (!pat || !pat.rounds.find((r) => r.id === roundId)) return;
    if (isStartRound(pat, roundId)) return; // Round 0 can't be worked into
    pat.activeRound = roundId; // not history-worthy on its own
    this.emit();
  }
  addRound(name) {
    let id = null;
    this.editTransact((pat) => {
      const startId = startRoundId(pat);
      const working = pat.rounds.filter((r) => r.id !== startId).length;
      const r = newRound(name || 'Round ' + (working + 1));
      pat.rounds.push(r);
      pat.activeRound = r.id;
      id = r.id;
    });
    return id;
  }
  renameRound(roundId, name) {
    this.editTransact((pat) => {
      if (isStartRound(pat, roundId)) return; // Round 0 is fixed
      const r = pat.rounds.find((x) => x.id === roundId);
      if (r) r.name = name;
    });
  }
  removeRound(roundId) {
    this.editTransact((pat) => {
      if (isStartRound(pat, roundId)) return; // can't remove the start row
      const working = pat.rounds.filter((r) => !isStartRound(pat, r.id)).length;
      if (working <= 1) return; // always keep one working round
      const removed = new Set(pat.stitches.filter((s) => s.round === roundId).map((s) => s.id));
      pat.rounds = pat.rounds.filter((r) => r.id !== roundId);
      pat.stitches = pat.stitches.filter((s) => s.round !== roundId);
      // drop references to deleted stitches
      for (const s of pat.stitches) {
        if (s.origin && removed.has(s.origin)) s.origin = null;
        if (s.base && s.base.kind === 'stitch' && removed.has(s.base.id)) s.base = null;
        if (s.base && s.base.kind === 'space' && (removed.has(s.base.ids[0]) || removed.has(s.base.ids[1]))) s.base = null;
      }
      if (!pat.rounds.find((r) => r.id === pat.activeRound) || isStartRound(pat, pat.activeRound)) {
        const firstWorking = pat.rounds.find((r) => !isStartRound(pat, r.id));
        pat.activeRound = (firstWorking || pat.rounds[pat.rounds.length - 1]).id;
      }
    });
  }

  // ---- editor: start -------------------------------------------------------
  // Picking a start marker drops it, alone, into a dedicated Round 0 at the
  // centre. It's never placed by hand, moved, or added to (see editorCanvas).
  setStart(type) {
    if (!isStart(type)) return null;
    let id = null;
    this.editTransact((pat) => {
      pat.start = type;
      let start = pat.stitches.find((s) => isStart(s.type));
      if (start) { start.type = type; } // already have Round 0 — just swap the symbol
      else {
        const r0 = newRound('Round 0');
        pat.rounds.unshift(r0);
        start = { id: uid('st'), round: r0.id, type, origin: null, base: null, x: 0, y: 0, rot: 0, len: null, color: null, mirror: false };
        pat.stitches.unshift(start);
        if (isStartRound(pat, pat.activeRound)) pat.activeRound = (pat.rounds[1] || pat.rounds[0]).id;
      }
      id = start.id;
    });
    this._lastPlacedId = id;
    return id;
  }

  // ---- editor: stitches ----------------------------------------------------
  // The procedural insert: a stitch comes out of `originId` and is worked into
  // `base`; its bottom sits at (x,y), its head at the click captured as rot+len.
  // Splices into the round's chain so inserting between stitches shifts the rest.
  placeStitch({ type, base = null, x, y, rot = 0, len = null, originId = null, color = null }) {
    let id = null;
    this.editTransact((pat) => {
      const roundId = pat.activeRound;
      id = uid('st');
      if (originId) {
        const next = pat.stitches.find((s) => s.round === roundId && s.origin === originId);
        if (next) next.origin = id; // existing successor now comes out of the new stitch
      }
      pat.stitches.push({ id, round: roundId, type, origin: originId, base, x, y, rot, len, color, mirror: false, auto: type === 'ch' ? true : undefined });
    });
    this._lastPlacedId = id;
    return id;
  }

  moveSelectionBy(dx, dy) {
    if (!this.selection.size || (!dx && !dy)) return;
    this.editTransact((pat) => {
      for (const s of pat.stitches) if (this.selection.has(s.id)) {
        s.x += dx; s.y += dy;
        if (s.type === 'ch') s.auto = false; // moving a chain by hand opts it out of auto-align
      }
    });
  }

  // Toggle auto-alignment on the selected chains (re-enabling snaps them back).
  setChainAuto(value) {
    if (!this.selection.size) return;
    this.editTransact((pat) => {
      for (const s of pat.stitches) if (this.selection.has(s.id) && s.type === 'ch') s.auto = value;
    });
  }

  // ---- live drag (one history entry per gesture) --------------------------
  // The snapshot is taken lazily on the first frame that actually moves, so a
  // click that doesn't drag leaves no no-op undo entry.
  dragBegin() { this._dragSnapped = false; }
  dragBy(dx, dy) {
    if (!this.selection.size || (!dx && !dy)) return;
    const pat = this.currentPattern();
    if (!pat) return;
    if (!this._dragSnapped) { this._pushHistory(pat); this._dragSnapped = true; }
    for (const s of pat.stitches) if (this.selection.has(s.id)) {
      s.x += dx; s.y += dy;
      if (s.type === 'ch') s.auto = false; // dragging a chain opts it out of auto-align
    }
    autoLayoutChains(pat); // realign auto chains as their neighbours move
    pat.updatedAt = nowISO();
    this._touch();
  }

  updateSelection(patch) {
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
  rotateSelectionBy(deg) {
    if (!this.selection.size) return;
    this.editTransact((pat) => { for (const s of pat.stitches) if (this.selection.has(s.id)) s.rot = (s.rot || 0) + deg; });
  }

  deleteSelection() { if (this.selection.size) this.removeStitches([...this.selection]); }
  removeStitches(ids) {
    const set = new Set(ids);
    this.editTransact((pat) => {
      const byId = new Map(pat.stitches.map((s) => [s.id, s]));
      const resolve = (originId) => { let cur = originId; while (cur && set.has(cur)) { const s = byId.get(cur); cur = s ? s.origin : null; } return cur; };
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

  // Evenly fan a round's stitches around their common centre, preserving order
  // and each stitch's length — a one-click "make it tidy" that needs no symmetry
  // bookkeeping. (Honours the directive: even graphs without the maths.)
  evenRound(roundId) {
    this.editTransact((pat) => {
      const order = chainOrder(pat.stitches, roundId).filter((s) => isRealStitch(s.type));
      if (order.length < 2) return;
      // common centre = average of the stitches' bases
      let cx = 0, cy = 0;
      for (const s of order) { cx += s.x; cy += s.y; }
      cx /= order.length; cy /= order.length;
      // radius = average current distance of heads from centre
      let R = 0; const heads = order.map((s) => topOfStitch(s));
      for (const h of heads) R += Math.hypot(h.x - cx, h.y - cy);
      R /= order.length;
      const start = Math.atan2(heads[0].y - cy, heads[0].x - cx);
      order.forEach((s, i) => {
        const a = start + (i * 2 * Math.PI) / order.length;
        const hx = cx + R * Math.cos(a), hy = cy + R * Math.sin(a);
        // keep the base where it is; just re-aim the head evenly
        const dx = hx - s.x, dy = hy - s.y;
        s.len = Math.max(2, Math.hypot(dx, dy));
        s.rot = (Math.atan2(dx, -dy) * 180) / Math.PI;
      });
    });
  }

  // ---- selection -----------------------------------------------------------
  setSelection(ids) { this.selection = new Set(ids); this.emit(); }
  toggleSelection(id, additive) {
    if (!additive) this.selection = new Set([id]);
    else if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }
  clearSelection() { if (this.selection.size) { this.selection.clear(); this.emit(); } }

  // ---- persistence ---------------------------------------------------------
  serialize() {
    return {
      format: FILE_FORMAT, version: FILE_VERSION,
      library: { projects: this.state.library.projects },
      ui: { view: this.state.ui.view, projectId: this.state.ui.projectId, patternId: this.state.ui.patternId },
    };
  }
  saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch {} }
  loadLocal() {
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
// ancestor's head and nearest non-chain child's head. A run of chains fills the
// gap at the fractions 1/(N+1)…N/(N+1); each oval's centre lands on its slot.
function autoLayoutChains(pat) {
  const stitches = pat.stitches;
  const byId = new Map(stitches.map((s) => [s.id, s]));
  const childOf = new Map();
  for (const s of stitches) if (s.origin) childOf.set(s.origin, s); // linear chain => one child each
  const d0 = -(buildStitchShapes('ch').shapes[0].cy || 0); // oval-centre offset from the anchor
  for (const s of stitches) {
    if (s.type !== 'ch' || s.auto === false) continue;
    let a = byId.get(s.origin), before = 0; const seenA = new Set([s.id]);
    while (a && a.type === 'ch' && !seenA.has(a.id)) { before++; seenA.add(a.id); a = byId.get(a.origin); }
    let c = childOf.get(s.id), after = 0; const seenC = new Set([s.id]);
    while (c && c.type === 'ch' && !seenC.has(c.id)) { after++; seenC.add(c.id); c = childOf.get(c.id); }
    if (!a || !c || a.type === 'ch' || c.type === 'ch') continue; // need a non-chain neighbour each side
    const ah = topOfStitch(a), chd = topOfStitch(c);
    const dx = chd.x - ah.x, dy = chd.y - ah.y;
    const L = Math.hypot(dx, dy); if (L < 1e-6) continue;
    const N = before + 1 + after;
    const t = (before + 1) / (N + 1);
    const sx = ah.x + dx * t, sy = ah.y + dy * t;  // even slot centre
    const ux = dx / L, uy = dy / L;
    s.rot = (Math.atan2(dx, -dy) * 180) / Math.PI; // local up points ancestor -> child
    s.x = sx - d0 * ux; s.y = sy - d0 * uy;        // back off so the oval centre lands on the slot
  }
}

export const store = new Store();
