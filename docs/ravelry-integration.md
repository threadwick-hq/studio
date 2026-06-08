# Ravelry integration — concept & roadmap

A planning document for integrating [Ravelry](https://www.ravelry.com) into threadwick.
It captures the agreed product model, the sync philosophy, and a phased, actionable build
roadmap. This is direction, not code — but every milestone is scoped enough to pick up.

## Vision

Lean on Ravelry's ubiquity. People **work naturally in threadwick** (designing and making
charts) while their craft data **syncs bi-directionally** to Ravelry, where their fiber life
already lives. Ravelry is the on-ramp ("Sign in with Ravelry") and the network threadwick
plugs into — but threadwick stays **local-first**, never *dependent* on Ravelry (true to the
data-ownership principle in `CLAUDE.md`).

**Identity principle:** threadwick is a **design studio, not a Ravelry browser.** The app
shows **only threadwick Patterns**. Ravelry content surfaces *only* as an association on a
threadwick object — never as a standalone, browsable Ravelry catalog.

## Model & vocabulary (Pattern / Chart / Project)

Mirror Ravelry's nouns 1:1 so mental models transfer:

- **Pattern** — the *design* you author here: **versions** → **Charts** + **Resources**
  (yarns / links / notes / variations). *(Today's "Project", renamed.)* A Pattern **may be
  associated with a Ravelry pattern** (optional, read-only link — see below).
- **Chart** — a single stitch chart inside a Pattern. *(Today's "Pattern", renamed.)*
- **Project** — a **make**: an **assembly of components**, each a threadwick Pattern + pinned
  version + **count** (e.g. blanket = 20× granny square + 4× tassel + 1× border), with the
  yarn actually used, progress, photos, status. **New pillar.** Syncs 1:1 with a **Ravelry
  project**.

Relationships: a Project **composes many Patterns** (each ×count) and one **Pattern → many
Projects** (many-to-many via components); a Pattern → optional **Ravelry pattern**; a Project
syncs to one **Ravelry project** whose pattern = the **primary component's** Ravelry link.

> **Two pieces of work this implies:** (1) a **rename** across UI + code (Project→Pattern,
> Pattern→Chart) incl. storage key / file format with a migration; (2) the new
> **Project (make)** entity + the **Ravelry pattern association** field.

## Source of truth: Studio + Logbook split

- **threadwick = studio:** owns the **Chart** and the design (no Ravelry equivalent).
- **Ravelry = logbook + community:** owns the make's social/record side.
- **Overlapping metadata** (yarns used, notes, status, progress, photos) syncs **both ways**.
  Default reconciliation is **prompt-on-conflict**; a configurable **source of truth** (global
  in User settings, overridable per Pattern) can make either side authoritative — choosing
  **Ravelry** locks those fields **read-only** in threadwick. The Chart/design is always
  studio-owned (Ravelry can never be its source of truth).

## What syncs

| threadwick | Ravelry | Direction |
|---|---|---|
| Pattern | **Pattern** (optional, **read-only link** — own or based-on) | binding + attribution + metadata pull-in (never written back) |
| Project (make) | **Project** | ↔ both ways (notes, status, progress %, made-for, photos) |
| Yarn resource / yarns used | **Stash** / project "yarns used" | ↔ both ways |
| Notes / Variations | Project **notes** | ↔ both ways |
| Version status (draft→published) | Project status (in-progress→finished) | ↔ both ways |
| **The Chart itself** | *no equivalent — photo/PDF attachment only* | **→ out only** |

Notes: Ravelry has no structured-chart object, so a Chart flows out as a rendered image/PDF
(the app already exports PNG/SVG) and never returns as editable data. The API writes a user's
**own** objects only — never the shared public pattern catalog. **No standalone Ravelry
queue/favorites shelf** (would break the identity principle); any Ravelry pattern reference is
an association on a Pattern.

## The Project (make) entity

- **An assembly of in-app Patterns.** A Project holds **components**, each =
  `{ Pattern, pinned version, count }` (e.g. 20× granny square + 4× tassel + 1× border).
  Patterns are **reusable building blocks**: one Pattern → many Projects, one Project → many
  Patterns. Each component pins its own version, so a redesign won't disturb in-flight makes.
- **Primary component:** one component is marked primary; its Pattern's Ravelry link becomes
  the synced Ravelry project's pattern (other components are credited in notes). A make with
  no linked primary syncs pattern-less ("my own design").
- **Top-level**, in a single logbook / works-in-progress view — a personal Ravelry projects
  dashboard.
- **Holds:** components[]; status, dates, made-for/size, happiness, make-notes, tags; **yarns
  used** (actual colorway / quantity / dye lot, linkable to stash); tools/gauge; **photos**
  (+ the rendered Chart pushed as a project photo); the Ravelry-project sync record.
- **Distinctions it introduces:** *suggested yarn* (Pattern) vs *yarn used* (Project);
  *design notes* (Pattern) vs *make notes* (Project); per-component **version pinning**.

### Per-component progress + dedicated follow mode
- **Per-component counts:** each component needs `count` instances; track "**X of N done**"
  per component, with **round-by-round follow mode** on the instance you're currently working
  (highlights the current round; tap "done" to advance).
- **Overall % is stitch-weighted across the whole recipe** (count × instance stitch-count per
  component), so the make %% is meaningful. **Status auto-derives** (0% Planned · 1–99% In
  progress · 100% Finished; manual **Hibernating / Frogged**). % + status sync to Ravelry; the
  round/instance detail stays in threadwick.
- **Follow mode doubles as the roadmap's "View mode"** (richer read-only viewer over published
  versions).

## Pattern ↔ Ravelry pattern association
- **Optional, 1:1, read-only link** from a threadwick Pattern to an *existing* Ravelry pattern
  (the catalog isn't writable via API; only comments / photos-on-your-own-objects are). Bind by
  pasting a Ravelry URL/permalink (works with no server) → a focused "find my pattern" picker
  after sign-in. Binding, not browsing — stays true to "not a browser".
- **Role flag — own | based-on:** "my own Ravelry listing for this design" *or* "based on /
  credits this pattern"; labels + attribution adapt.
- **Pulls in (cached, read-only, never overwrites your authored design):** Ravelry pattern id,
  permalink, URL, designer, craft, photos, yardage, gauge, suggested hook/needle, price. Used
  for attribution, a "View on Ravelry" deep-link, light enrichment, and the correct pattern
  link when a make syncs. Manual "refresh from Ravelry".
- **Never written back.** The Chart-as-photo and all writes happen on the **Project** (make)
  side — project photo upload + notes/status/progress — never on the pattern listing.

## Sync mechanics
- **Auth:** Sign in with Ravelry (OAuth2, `client_secret` server-side); token stored
  server-side, client holds a session. App fully usable signed-out; edits save locally first,
  sync is async + retryable (local-first).
- **Link record (per object):** Project ↔ Ravelry project stores `ravelryProjectId`,
  `lastSyncedAt`, the remote `updated_at`, and a **baseline snapshot** of synced fields;
  yarns-used store their stash/pack id. All local + exportable.
- **Change detection:** three-way vs the baseline — did local change? did remote change?
- **Resolution (driven by the source-of-truth setting):**
  - *Default (no SoT):* both changed → **prompt** the user to resolve (per field).
  - *Ravelry SoT:* fields **locked read-only** in threadwick; Ravelry authoritative (pull-only).
  - *threadwick SoT:* local authoritative (push-only; local wins).
  - one-sided changes always flow the obvious way regardless of the setting.
- **Settings location:** global default in **User settings**; per-**Pattern** override (pattern
  wins). Applies to make/logbook metadata only — never the Chart/design.
- **Chart → photo:** **manual "Push chart to Ravelry"** button (no auto-attach). Rendered via
  the existing PNG export, uploaded through the upload-token flow, attached to the **project**;
  the photo id is tracked so a re-push **replaces** rather than duplicates.
- **Cadence:** manual **"Sync now"** (per-Project + global) first, with per-Project status
  (idle / syncing / conflict / error); background/auto later. Server absorbs Ravelry
  rate-limits with retry/backoff.
- **Deletes:** conservative — never auto-delete the other side; a removed remote project just
  unlinks locally and is surfaced.

## Constraints (shape the phasing)
- 100% client-side SPA today (no backend, no secrets, no network). Ravelry can't be called from
  the browser: read-only = app-wide Basic-auth key (server-side); per-user = OAuth2 w/
  `client_secret` (server-side); no CORS headers. **→ live sync needs the server + login stage.**
- **Data ownership:** the new **Project (make)** type joins the export story — portable format
  extends, `FILE_VERSION` bumps, old files migrate to "no makes", "export everything" covers
  makes, with a round-trip test. (The rename needs a migration regardless.)
- **Confirm before live calls:** Ravelry API terms on caching/storing data, attribution, and
  write/rate limits.

## Build roadmap (phased)

Every data-model change ships **format bump + migration + round-trip test** (data-ownership
rule); run **tsc / lint / test / build** before each push.

### Track A — No server (can start now)
1. **Rename → Pattern / Chart / Project-free.** Rename existing `Pattern`→`Chart` and the
   existing container `Project`→`Pattern` across `src/core/{types,model,store,files}.ts`,
   `src/views/*`, `test/core.test.ts`; bump `FILE_VERSION` 3→4 with a migration mapping legacy
   `project`/`patterns` JSON **and** the old `localStorage` key. No behaviour change beyond
   labels. *Done when:* green checks, old exports + localStorage migrate, app behaves identically.
2. **Project (make) entity + logbook.** New **top-level** `Project` (make) = **components[]**
   (`{ patternId, versionId, count, primary }`) + status, dates, made-for/size, happiness,
   make-notes, tags, **yarns-used** (colorway/qty/dye-lot/hex), tools/gauge, photos,
   per-component progress, Ravelry-sync placeholder. Store CRUD; extend portable format +
   migration + round-trip test; logbook list view + "Start a project" (add Pattern components
   with counts, set primary) + make detail. *Done when:* a multi-component make round-trips.
3. **Follow mode + per-component progress.** Per-component "X of N" + current-instance
   round-by-round; **stitch-weighted overall %** across the recipe; status auto-derives
   (+ Hibernating/Frogged); guided read-only follow view (doubles as the **View mode**).
   *Done when:* completing rounds + instances drives %/status; exportable.
4. **Pattern ↔ Ravelry pattern link (stored).** Optional link (paste URL/permalink),
   **own | based-on** role, attribution + "View on Ravelry"; format bump + migration.
5. **Craft reference data.** New `src/core/craftMeta.ts` (weights, hook/needle sizes, color
   families) → pickers in yarn/make forms. Independent quality win; order flexible.

### Track B — Server stage (Sign in with Ravelry)
6. **Server + OAuth foundation.** Serverless/proxy + OAuth2 (`client_secret` server-side) +
   session; Vite env (`VITE_RAVELRY_PROXY_URL`) + feature flag; "Connect Ravelry" UI + whoami.
7. **Yarn lookup + stash.** Proxy yarn search/detail → "Search Ravelry" prefills a Yarn
   resource (with `source`); stash read → choose-from-stash for yarns-used. Converters + tests.
8. **Bi-directional make sync.** Link record + baseline; Project↔Ravelry project create/update;
   three-way change detection; resolution per **source-of-truth** (prompt default · Ravelry-SoT
   read-only lock · threadwick-SoT push); User-global + per-Pattern SoT settings; manual
   "Sync now" + per-Project status; conservative deletes; **manual "Push chart to Ravelry"**
   photo (upload-token flow, tracked id → replace).
9. **Polish.** Background/auto sync, conflict-review UI, refresh-from-Ravelry metadata,
   rate-limit/error UX, yarn substitution.

## Decisions log
- Vocabulary: **Pattern / Chart / Project** (full Ravelry parity).
- Source of truth: **studio + logbook split**; default **prompt-on-conflict** + configurable
  source of truth (Ravelry-as-SoT locks fields read-only).
- Makes: **assemblies of in-app Patterns** (components = Pattern × pinned version × count),
  top-level; **primary component** drives the Ravelry project's pattern; progress is
  **per-component counts** + current-instance follow, stitch-weighted overall.
- Ravelry patterns: **never standalone**; only as a **read-only association** (own | based-on)
  on a threadwick Pattern.
- Chart photo: **manual push** to the Ravelry project. Cadence: manual "Sync now" first.
- Surfaces: Project↔project, Yarns↔stash, Sign in with Ravelry. (Queue/favorites folded into
  the Pattern association.)

## Open items for the build stage
- Confirm Ravelry API terms (caching/storage, attribution, write/rate limits) before live calls.
- Sync edge cases: conflict-review UI, refresh-from-Ravelry cadence, background-sync triggers.
