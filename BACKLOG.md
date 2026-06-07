# stitchgrid studio — feature backlog

A living list of planned work. Newest ideas go under **Proposed**; pull items
into **Next up** when scheduled, **In progress** while building, and **Done**
when shipped. Keep entries small enough to describe their acceptance criteria.

Status legend: 🔲 proposed · 🟡 next up · 🔵 in progress · ✅ done

---

## Next up

### 🔲 Stitch base modes (Explicit / Distanced / Connected)
How the bottom of a stitch marker relates to the base it's worked into. A
per-stitch (with a sensible project/tool default) setting:

- **Explicit** — the bottom of the stitch mark sits *exactly* on the space/stitch
  base position. (This is today's behaviour.)
- **Distanced** — leave a fixed gap of *X* units between the bottom of the stitch
  mark and the base position. Nothing is drawn in the gap.
- **Connected** — same *X* gap as Distanced, **plus** a light, ghosted dashed
  line from the bottom of the stitch mark to the base position, showing the
  connection.

Notes / acceptance:
- `X` is configurable (per stitch and/or a default in the toolbar/inspector).
- The base position is still resolved by the existing connectivity model
  (`basePoint`); only the *drawn* anchor offset and the optional connector change.
- The dashed connector is a render-only concern — extend `render.js`
  (`stitchToSVG`) to take a base point + mode, and the export pipeline should
  include it so WYSIWYG holds.
- Inspector gets a "Base mode" control; ghost preview reflects the chosen mode.

### 🔲 Row from text (notation → stitches)
Generate a whole round from a typed pattern notation, so a designer can write a
row as fast as reading one.

Supported notation (incrementally):
- Plain sequence: `3dc ch2 3dc` — append these stitches in order into the active
  row, using the default base picking (next available space/stitch).
- Repeats: `[3dc ch1]*3` — repeat the bracketed group 3 times.
- Targeted placement into named spaces:
  `[hdc ch1 hdc] > ch1 sp, [hdc ch1 hdc ch3 hdc ch1 hdc] > ch3 sp`
  — work `hdc ch1 hdc` into every `ch1` space of the round below, and
  `hdc ch1 hdc ch3 hdc ch1 hdc` into every `ch3` space.

Notes / acceptance:
- A small parser → an ordered list of `{type, count}` plus optional target
  selectors (`> ch1 sp`, `> ch3 sp`, etc.).
- "ch1 sp" / "ch3 sp" classify spaces by the chain count that formed them, which
  means tracking how many chains sit between two real stitches (the connectivity
  model already skips chains when computing spaces — extend it to *label* the
  space by the skipped chain run length).
- Placement reuses the same origin/base machinery the manual insert flow uses, so
  results are indistinguishable from hand-placed stitches and stay editable.
- Live preview + validation errors for malformed notation. Entry point: a "Row
  from text" affordance in the toolbar / a modal.

### 🔲 Edit mode (double-click a stitch)
While in **Select** mode, double-clicking a stitch enters a focused **Edit**
mode for that single stitch:

- Its **origin**, **base** and **next stitch** are all highlighted simultaneously
  (origin = light blue, base/space = orange, next = purple — reuse the insert
  palette).
- The stitch's **end (head) position is shown as a red dot**.
- The user can fine-tune the stitch's placement (drag the head/red dot to change
  length & angle, drag the body to move it, re-pick its base) and drag it to a
  new place.
- `Esc` / clicking away leaves Edit mode back to Select.

Notes / acceptance:
- New canvas sub-mode distinct from Select/Insert; only one stitch is "in edit".
- Dragging the red dot updates `rot` + `len`; dragging the body updates `x,y`;
  re-picking a base updates `base` (and the drawn anchor).
- All edits are single undo steps and update the chart live (WYSIWYG).

---

## Proposed

- 🔲 More pattern types: worked in the round (spiral / joined), worked flat (rows
  back and forth).
- 🔲 Ghost connector lines and head-elongation (hdc/dc/tr/dtr) driven by the
  origin/base graph, so post heads visually join neighbours like real work.
- 🔲 Richer PDF layouts; multi-square blanket / assembly composition.
- 🔲 Symmetry *assist* (opt-in): mirror/repeat a placed sequence around the centre
  without locking the design into a symmetry group.
- 🔲 Stitch colour palettes per project (named yarn colours from Resources usable
  as stitch colours).
- 🔲 Close-the-round affordance (join last stitch to first) so the final space is
  computed too.
- 🔲 Touch / tablet polish for placement and panning.

---

## Done

- ✅ Procedural granny-square editor: origin / base / computed spaces, two-click
  insert, insert-between with purple next-stitch + grey-out.
- ✅ Studio shell: projects (folders) holding patterns + resources (yarns, links,
  notes, variations); local-storage autosave; per-project file export/import.
- ✅ Shared SVG renderer; SVG / PNG export; PDF composer (chart + legend +
  written round-by-round instructions + resources).
- ✅ Even-out-row helper; undo/redo; selection inspector; auto legend.
