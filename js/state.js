// state.js — the central store: data model, symmetry-aware edits, undo/redo.
//
// DOM-free on purpose so the whole editing model can be unit-tested in Node.
// UI modules subscribe() for change notifications and call the mutation
// methods below; they never touch `state` directly.

import { uid, deepClone } from './util.js';
import { symmetryOrbit } from './symmetry.js';
import { snapPolar, snapGrid, radialRotation } from './geometry.js';
import { defaultRounds, ringRadii } from './rounds.js';

function defaultState() {
  return {
    title: 'Untitled Granny Square',
    settings: {
      symmetry: { order: 4, mirror: false, axis: -90 },
      snap: { mode: 'polar', ring: true, spoke: true, spokeCount: 24, gridStep: 24, autoRadial: true },
      guides: { show: true, showGrid: false, showAnchors: false },
    },
    view: { scale: 1, panX: 0, panY: 0 },
    rounds: defaultRounds(),
    clusters: [], // user-defined parametric clusters {id,name,abbr,base,legs,joinTop,joinBottom,spread}
    motifs: [], // reusable stamps {id,name,stitches:[{type,dx,dy,rot,mirror,color}]}
    stitches: [], // {id, group, type, x, y, rot, mirror, color, round, origin, target}
    groups: {}, // groupId -> the symmetry it was created with {order,mirror,axis}
  };
}

const HISTORY_KEYS = ['title', 'settings', 'rounds', 'clusters', 'motifs', 'stitches', 'groups'];

class Store {
  constructor() {
    this.state = defaultState();
    this.selection = new Set();
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.lastPlacedId = null; // transient: the working position (default next origin)
    this._rebuildClusterMap();
  }

  // ---- subscription -------------------------------------------------------
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) fn(this.state, this.selection);
  }

  // ---- history ------------------------------------------------------------
  _snapshot() {
    const s = {};
    for (const k of HISTORY_KEYS) s[k] = deepClone(this.state[k]);
    return s;
  }
  _restore(snap) {
    for (const k of HISTORY_KEYS) this.state[k] = deepClone(snap[k]);
    this._rebuildClusterMap();
    this._pruneSelection();
  }
  transact(label, fn) {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    fn();
    this._rebuildClusterMap();
    this.emit();
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this._snapshot());
    this._restore(this.undoStack.pop());
    this.emit();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._snapshot());
    this._restore(this.redoStack.pop());
    this.emit();
  }

  // ---- derived ------------------------------------------------------------
  _rebuildClusterMap() {
    const map = {};
    for (const c of this.state.clusters) map[c.id] = c;
    this.state.clusterMap = map;
  }
  _pruneSelection() {
    const ids = new Set(this.state.stitches.map((s) => s.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }
  byId(id) {
    return this.state.stitches.find((s) => s.id === id);
  }
  groupMembers(group) {
    return group ? this.state.stitches.filter((s) => s.group === group) : [];
  }

  // ---- settings -----------------------------------------------------------
  setTitle(t) {
    this.transact('title', () => { this.state.title = t; });
  }
  setSymmetry(patch) {
    this.transact('symmetry', () => { Object.assign(this.state.settings.symmetry, patch); });
  }
  setSnap(patch) {
    // snap changes don't need history (no visible artifact), update live.
    Object.assign(this.state.settings.snap, patch);
    this.emit();
  }
  setGuides(patch) {
    Object.assign(this.state.settings.guides, patch);
    this.emit();
  }

  // ---- snapping helper ----------------------------------------------------
  snapPoint(x, y) {
    const s = this.state.settings.snap;
    if (s.mode === 'grid') return snapGrid(x, y, s.gridStep);
    if (s.mode === 'polar') {
      // The centre (0,0) isn't on any ring, so make it snappable directly —
      // otherwise the magic ring / round-0 start can't land in the middle.
      if (Math.hypot(x, y) < 16) return { x: 0, y: 0 };
      if (s.ring || s.spoke) {
        return snapPolar(x, y, {
          rings: ringRadii(this.state.rounds),
          spokeStep: s.spokeCount ? 360 / s.spokeCount : 0,
          snapRing: s.ring,
          snapSpoke: s.spoke,
        });
      }
    }
    return { x, y };
  }
  defaultRotFor(x, y) {
    return this.state.settings.snap.autoRadial ? radialRotation(x, y) : 0;
  }

  // ---- connectivity helpers ----------------------------------------------
  // The current "origin" for the next stitch — the last one placed (the working
  // position), if it still exists. Validates against deletes/undo.
  currentOriginId() {
    if (this.lastPlacedId && this.byId(this.lastPlacedId)) return this.lastPlacedId;
    this.lastPlacedId = null;
    return null;
  }
  // Re-anchor the working position (origin for the next stitch) to a stitch.
  setOrigin(id) {
    if (id && this.byId(id)) { this.lastPlacedId = id; this.emit(); }
  }

  // ---- stitches -----------------------------------------------------------
  // Regenerate every sibling of `seed`'s group from `seed`'s current transform.
  // Uses the symmetry the GROUP was created with (not the live global setting),
  // so changing the toolbar later never alters an existing group's member count.
  _regenGroup(seed) {
    if (!seed.group) return;
    const sym = this.state.groups[seed.group] || this.state.settings.symmetry;
    const orbit = symmetryOrbit(
      { x: seed.x, y: seed.y, rot: seed.rot, mirror: seed.mirror },
      sym
    );
    // Keep `seed` (== orbit[0]); drop the rest of the group; rebuild siblings.
    this.state.stitches = this.state.stitches.filter(
      (s) => s.group !== seed.group || s.id === seed.id
    );
    for (let i = 1; i < orbit.length; i++) {
      const o = orbit[i];
      this.state.stitches.push({
        id: uid('st'), group: seed.group,
        type: seed.type, color: seed.color, round: seed.round, len: seed.len ?? null,
        x: o.x, y: o.y, rot: o.rot, mirror: o.mirror,
        origin: null, target: null,
      });
    }
  }

  addStitch(params, { symmetry = true, select = true } = {}) {
    const { type, x, y } = params;
    const rot = params.rot ?? this.defaultRotFor(x, y);
    const mirror = !!params.mirror;
    const color = params.color ?? null;
    const round = params.round ?? null;
    // Connectivity: where this stitch comes from (origin) and what it's worked
    // into (target). Stored on the seed; symmetric copies inherit it implicitly.
    const origin = params.origin ?? null;
    const target = params.target ?? null;
    const len = params.len ?? null; // post length (stretch); null = the type's default
    const sym = this.state.settings.symmetry;
    // A centre *point* (magic ring / dot) maps to itself under rotation, so place
    // a single one — not N overlapping copies. A *post* worked into the centre,
    // though, fans out (the orbit rotates its angle), so keep its symmetry.
    const atCenter = Math.hypot(x, y) < 1e-6;
    const isFixedPoint = atCenter && !len;
    const useSym = symmetry && !isFixedPoint && (sym.order > 1 || sym.mirror);
    const ids = [];
    this.transact('add stitch', () => {
      if (!useSym) {
        const id = uid('st');
        this.state.stitches.push({ id, group: null, type, x, y, rot, mirror, color, round, origin, target, len });
        ids.push(id);
      } else {
        const group = uid('grp');
        this.state.groups[group] = { order: sym.order, mirror: sym.mirror, axis: sym.axis };
        const orbit = symmetryOrbit({ x, y, rot, mirror }, sym);
        orbit.forEach((o, i) => {
          const id = uid('st');
          this.state.stitches.push({
            id, group, type, x: o.x, y: o.y, rot: o.rot, mirror: o.mirror, color, round, len,
            origin: i === 0 ? origin : null, target: i === 0 ? target : null,
          });
          ids.push(id);
        });
      }
    });
    this.lastPlacedId = ids[0] ?? this.lastPlacedId; // chain head for the next stitch
    if (select) this.setSelection(ids);
    return ids;
  }

  // Add already-positioned stitches (e.g. from distribute / motif stamp).
  addStitchesRaw(list, { select = true } = {}) {
    const ids = [];
    this.transact('add stitches', () => {
      for (const p of list) {
        const id = uid('st');
        this.state.stitches.push({
          id, group: null,
          type: p.type, x: p.x, y: p.y,
          rot: p.rot ?? this.defaultRotFor(p.x, p.y),
          mirror: !!p.mirror, color: p.color ?? null, round: p.round ?? null,
          origin: p.origin ?? null, target: p.target ?? null, len: p.len ?? null,
        });
        ids.push(id);
      }
    });
    if (select) this.setSelection(ids);
    return ids;
  }

  // Move one stitch to an absolute position; its symmetric group follows.
  setStitchPos(id, x, y) {
    const st = this.byId(id);
    if (!st) return;
    this.transact('move', () => {
      st.x = x; st.y = y;
      if (this.state.settings.snap.autoRadial) st.rot = radialRotation(x, y);
      this._regenGroup(st);
    });
    if (st.group) this.setSelection(this.groupMembers(st.group).map((s) => s.id));
  }

  // One representative stitch per selected group (independent stitches map to
  // themselves) — so a symmetric group is moved/rotated as a single unit.
  _reps() {
    const reps = new Map();
    for (const id of this.selection) {
      const st = this.byId(id);
      if (!st) continue;
      const key = st.group || 'solo:' + st.id;
      if (!reps.has(key)) reps.set(key, st);
    }
    return [...reps.values()];
  }

  // After an edit regenerates groups (siblings get fresh ids), rebuild the
  // selection to the live member ids of the affected groups so it never points
  // at deleted siblings. `reps` are the seed stitches that were edited.
  _reselectReps(reps) {
    const ids = [];
    for (const r of reps) {
      if (r.group) for (const m of this.groupMembers(r.group)) ids.push(m.id);
      else ids.push(r.id);
    }
    this.selection = new Set(ids);
  }

  // Move a whole selection by a delta (grouped stitches move via one rep each).
  moveSelectionBy(dx, dy) {
    if (!this.selection.size || (dx === 0 && dy === 0)) return;
    const reps = this._reps();
    this.transact('move', () => {
      for (const st of reps) {
        st.x += dx; st.y += dy;
        if (this.state.settings.snap.autoRadial) st.rot = radialRotation(st.x, st.y);
        this._regenGroup(st);
      }
      this._reselectReps(reps);
    });
  }

  // ---- live drag (one history entry per gesture) --------------------------
  // The snapshot is taken lazily on the first frame that actually moves
  // something, so a click that doesn't drag leaves no no-op undo entry.
  dragBegin() {
    this._dragSnapped = false;
  }
  // Move the whole selection so the lead stitch lands at (x,y). The lead always
  // represents its own group (so its id stays valid across frames and the delta
  // is measured against the stitch actually being dragged); every other
  // selected group moves via one representative.
  dragSelectionTo(leadId, x, y) {
    const lead = this.byId(leadId);
    if (!lead) return;
    const dx = x - lead.x;
    const dy = y - lead.y;
    if (dx === 0 && dy === 0) return;
    if (!this._dragSnapped) {
      this.undoStack.push(this._snapshot());
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack.length = 0;
      this._dragSnapped = true;
    }
    const keyOf = (s) => s.group || 'solo:' + s.id;
    const seen = new Set([keyOf(lead)]);
    const movers = [lead];
    for (const id of this.selection) {
      const st = this.byId(id);
      if (!st || seen.has(keyOf(st))) continue;
      seen.add(keyOf(st));
      movers.push(st);
    }
    for (const st of movers) {
      st.x += dx; st.y += dy;
      if (this.state.settings.snap.autoRadial) st.rot = radialRotation(st.x, st.y);
      this._regenGroup(st);
    }
    this._reselectReps(movers);
    this._rebuildClusterMap();
    this.emit();
  }

  // Update shared properties (type/color/rot/mirror) on a stitch + its group.
  updateStitch(id, patch) {
    const st = this.byId(id);
    if (!st) return;
    this.transact('edit', () => {
      const members = st.group ? this.groupMembers(st.group) : [st];
      for (const m of members) {
        if (patch.type !== undefined) m.type = patch.type;
        if (patch.color !== undefined) m.color = patch.color;
        if (patch.round !== undefined) m.round = patch.round;
      }
      // rotation / mirror are geometric: set on seed, regen group.
      if (patch.rot !== undefined) st.rot = patch.rot;
      if (patch.mirror !== undefined) st.mirror = patch.mirror;
      if (patch.rot !== undefined || patch.mirror !== undefined) {
        this._regenGroup(st);
        if (st.group) this._reselectReps([st]);
      }
    });
  }

  // Apply a property patch across the whole selection in one history step.
  updateSelection(patch) {
    if (!this.selection.size) return;
    const reps = this._reps();
    this.transact('edit', () => {
      for (const st of reps) {
        const members = st.group ? this.groupMembers(st.group) : [st];
        for (const m of members) {
          if (patch.type !== undefined) m.type = patch.type;
          if (patch.color !== undefined) m.color = patch.color;
          if (patch.round !== undefined) m.round = patch.round;
        }
        if (patch.rot !== undefined) st.rot = patch.rot;
        if (patch.mirror !== undefined) st.mirror = patch.mirror;
        if (patch.rot !== undefined || patch.mirror !== undefined) this._regenGroup(st);
      }
      this._reselectReps(reps);
    });
  }

  orientSelectionRadial() {
    if (!this.selection.size) return;
    const reps = this._reps();
    this.transact('orient radially', () => {
      for (const st of reps) {
        st.rot = radialRotation(st.x, st.y);
        this._regenGroup(st);
      }
      this._reselectReps(reps);
    });
  }

  rotateSelectionBy(deg) {
    if (!this.selection.size) return;
    const reps = this._reps();
    this.transact('rotate', () => {
      for (const st of reps) {
        st.rot = (st.rot || 0) + deg;
        this._regenGroup(st);
      }
      this._reselectReps(reps);
    });
  }

  deleteSelection() {
    if (!this.selection.size) return;
    const groups = new Set();
    const solo = new Set();
    for (const id of this.selection) {
      const st = this.byId(id);
      if (!st) continue;
      if (st.group) groups.add(st.group); else solo.add(id);
    }
    this.transact('delete', () => {
      this.state.stitches = this.state.stitches.filter(
        (s) => !(s.group && groups.has(s.group)) && !solo.has(s.id)
      );
      for (const g of groups) delete this.state.groups[g];
    });
    this.selection.clear();
    this.emit();
  }

  breakSymmetry() {
    const groups = new Set();
    for (const id of this.selection) {
      const st = this.byId(id);
      if (st && st.group) groups.add(st.group);
    }
    if (!groups.size) return;
    this.transact('break symmetry', () => {
      for (const s of this.state.stitches) if (s.group && groups.has(s.group)) s.group = null;
      for (const g of groups) delete this.state.groups[g];
    });
  }

  // ---- selection ----------------------------------------------------------
  setSelection(ids) {
    this.selection = new Set(ids);
    this.emit();
  }
  toggleSelection(id, additive) {
    if (!additive) {
      this.selection = new Set([id]);
    } else if (this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }
    this.emit();
  }
  selectGroupOf(id, additive = false) {
    const st = this.byId(id);
    if (!st) return;
    const ids = st.group ? this.groupMembers(st.group).map((s) => s.id) : [id];
    if (additive) { for (const i of ids) this.selection.add(i); }
    else this.selection = new Set(ids);
    this.emit();
  }
  clearSelection() {
    if (this.selection.size) { this.selection.clear(); this.emit(); }
  }

  // ---- rounds -------------------------------------------------------------
  // Labels follow the (radius-sorted) position, so they stay R1..Rn with no
  // duplicates or gaps after add/remove.
  _relabelRounds() {
    this.state.rounds.sort((a, b) => a.radius - b.radius);
    this.state.rounds.forEach((r, i) => { r.label = 'R' + (i + 1); });
  }
  addRound(radius) {
    this.transact('add round', () => {
      this.state.rounds.push({ id: uid('rnd'), radius, label: '' });
      this._relabelRounds();
    });
  }
  updateRound(id, patch) {
    this.transact('round', () => {
      const r = this.state.rounds.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      this._relabelRounds();
    });
  }
  removeRound(id) {
    this.transact('remove round', () => {
      this.state.rounds = this.state.rounds.filter((r) => r.id !== id);
      this._relabelRounds();
    });
  }

  // ---- clusters -----------------------------------------------------------
  addCluster(def) {
    const id = uid('cl');
    this.transact('add cluster', () => {
      this.state.clusters.push({ id, ...def });
    });
    return id;
  }
  updateCluster(id, patch) {
    this.transact('cluster', () => {
      const c = this.state.clusters.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
  }
  removeCluster(id) {
    this.transact('remove cluster', () => {
      this.state.clusters = this.state.clusters.filter((c) => c.id !== id);
      // orphaned placed stitches fall back to a dc in the renderer.
    });
  }

  // ---- motifs -------------------------------------------------------------
  createMotifFromSelection(name) {
    const sel = [...this.selection].map((id) => this.byId(id)).filter(Boolean);
    if (sel.length < 2) return null;
    const cx = sel.reduce((a, s) => a + s.x, 0) / sel.length;
    const cy = sel.reduce((a, s) => a + s.y, 0) / sel.length;
    const id = uid('mo');
    const parts = sel.map((s) => ({
      type: s.type, dx: s.x - cx, dy: s.y - cy, rot: s.rot, mirror: s.mirror, color: s.color,
    }));
    this.transact('create motif', () => {
      this.state.motifs.push({ id, name: name || 'Motif ' + (this.state.motifs.length + 1), stitches: parts });
    });
    return id;
  }
  placeMotif(id, x, y) {
    const m = this.state.motifs.find((mm) => mm.id === id);
    if (!m) return [];
    return this.addStitchesRaw(
      m.stitches.map((p) => ({ type: p.type, x: x + p.dx, y: y + p.dy, rot: p.rot, mirror: p.mirror, color: p.color }))
    );
  }
  removeMotif(id) {
    this.transact('remove motif', () => {
      this.state.motifs = this.state.motifs.filter((m) => m.id !== id);
    });
  }

  // ---- persistence --------------------------------------------------------
  serialize() {
    const out = { version: 1 };
    for (const k of HISTORY_KEYS) out[k] = deepClone(this.state[k]);
    out.view = deepClone(this.state.view);
    return out;
  }
  load(data) {
    const fresh = defaultState();
    for (const k of HISTORY_KEYS) if (data[k] !== undefined) fresh[k] = deepClone(data[k]);
    if (data.view) fresh.view = deepClone(data.view);
    this.state = fresh;
    this.selection.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this._rebuildClusterMap();
    this.emit();
  }
  reset() {
    this.load(defaultState());
  }
  clearHistory() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

export const store = new Store();
export { defaultState };
