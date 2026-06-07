# stitchgrid studio — project instructions

Guidance for working in this repo. See [`README.md`](README.md) for the full
architecture and mental model.

## Core principles

### Data ownership & portability (must-have, non-negotiable)

Users own their data. The app must never become a place where data goes in but
can't come out — **no ecosystem lock-in.**

- **Everything is exportable.** Every kind of user-created data (projects,
  versions, patterns, stitches, resources — and anything added later) must have
  an export path. Never ship a data type that can only live inside the app.
- **Friendly, open formats.** The canonical export is **human-readable JSON**:
  the portable project file (`ProjectFile` → `projectToFile` / `projectFromFile`
  in [`src/core/model.ts`](src/core/model.ts)). Renders also export to standard,
  non-proprietary formats (SVG, PNG, print/PDF). No opaque, encrypted-only, or
  proprietary container formats.
- **Lossless & round-trippable.** Anything exported must re-import and reproduce
  the same data. Treat `export → import → deep-equal` as the bar, and cover it
  in [`test/core.test.ts`](test/core.test.ts).
- **Export _all_ data, not just one item at a time.** The whole library lives in
  `localStorage` via `store.serialize()` ([`src/core/store.ts`](src/core/store.ts)).
  Keep a full-library / "export everything" path available and current so a user
  can walk away with 100% of their data in one action.
- **Evolve the format deliberately.** When you add or change stored data, in the
  **same change**: extend the portable format, bump `FILE_VERSION`, and add a
  migration in `normalizeProject` so old exports still import. Export + import +
  migration ship together — never separately.

When designing any feature, ask "how does a user get this data out, in a format
they can use elsewhere?" before building it. If there isn't a clean answer, the
design isn't done.

## Dev commands

- `npm run dev` — local dev server
- `npm run build` — production build (also the deploy gate)
- `npm test` — unit tests (vitest, `test/core.test.ts`)
- `npx tsc --noEmit` — typecheck
- `npx eslint .` — lint

Run typecheck, lint, tests, and build before pushing.

## Where things live

- **Portable file format + migration:** `src/core/model.ts`
- **Import / export, SVG / PNG, print-PDF:** `src/core/files.ts`
- **Store + `localStorage` persistence:** `src/core/store.ts`
- **Domain types:** `src/core/types.ts`

## Versioning model (invariants)

A `Project` owns `versions[]` + `activeVersionId`; **patterns and resources live
inside a `ProjectVersion`, not on the project.** See the README "Versions"
section for the user-facing behaviour. Hold these invariants when touching it:

- **At most one `draft` and at most one `published`** version per project.
  Publishing a draft outdates the prior published one (`store.publishVersion`).
- **Only a draft is editable.** Every mutation routes through the active version
  and is guarded by `isDraftActive()` in the store — published/outdated versions
  are read-only at the **data layer**, not just hidden in the UI. New
  pattern/resource/editor mutations must go through the active version and
  respect this guard.
- **Read patterns/resources via `activeVersion(prj)`** (or `store.currentVersion()`),
  never `prj.patterns` / `prj.resources` (those no longer exist).
- **`createDraft` snapshots** the published (or active) version with **fresh ids**
  for the new version and its patterns — so a stale editor `patternId` won't
  resolve; it steps back to the project view on purpose.
- **Migration:** `normalizeProject` wraps any legacy `{ patterns, resources }`
  project into a single draft version and enforces a single published version.

## Roadmap & known gaps

- **View mode (planned, large):** a dedicated, richer read-only experience for
  viewing projects is coming. The read-only editor here is intentionally minimal
  — build the real viewer on top of `activeVersion` / `publishedVersion` /
  `setActiveVersion` and the status model rather than expanding the editor.
- **Sharing (next):** share a project's *published* version with other users;
  the version model is the foundation for it.
- **Export-everything gap:** per-project JSON export exists, but there's **no
  one-click "export all projects" yet** (the whole library is already available
  via `store.serialize()`). Wiring this — plus matching import and a round-trip
  test — is the outstanding item for the data-ownership principle above.

## Gotchas

- **Editor CSS grids.** `.editor` is a row grid (`auto auto 1fr`) and `.ed-body`
  a 3-column grid (`220px 1fr 286px`). Conditionally adding/removing a direct
  child (e.g. the read-only banner, or hiding the left palette) silently breaks
  the tracks. Use modifier classes (`.editor.has-banner`, `.ed-body.readonly`)
  instead of removing grid children blind.
- **Verifying UI changes.** `npm run build` then `npx vite preview --port <p>`,
  and drive it headless with puppeteer — seed/inspect state via
  `window.stitchgrid.store`, and screenshot. Name scratch scripts `_*.mjs`
  (gitignored) and delete them after; never `git add -A` them into a commit.
- **antd is v5** (`5.29.3`); the MCP server is pinned to v5 docs in `.mcp.json`.
  Prefer current v5 APIs (`variant`, `destroyOnHidden`, `menu={{items}}`,
  `styles={{body}}`, `App.useApp()`), not the deprecated ones.
