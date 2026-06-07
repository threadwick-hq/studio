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
