# stitchgrid studio

A **crochet project designer** for the web. Keep every project — its patterns,
the yarns you used, tutorial links and notes — in one folder, and design
**granny-square stitch charts the way you actually crochet them**.

No symmetry maths, no fiddly grids. You pick a start, choose a row, and place
stitches one at a time: each stitch *comes out of* the previous one and is
*worked into* a stitch or a space, exactly like real crochet. Even, readable
charts fall out of that structure instead of out of calculation.

**Live app:** served from GitHub Pages — just visit the link, no install.
Everything saves to your browser, and any project exports to a file you can back
up or share.

## The mental model

Designing should feel like recreating your crochet work. Every stitch records two
things — and that's the whole trick:

- **Origin** — the stitch it comes out of (the working sequence within a row).
- **Base** — the stitch head or the **space** it is worked into (where its
  bottom sits). Spaces are computed automatically as the midpoint between two
  consecutive *real* stitches (chains and slip stitches don't form spaces, so the
  space in `3 dc, ch 2, 3 dc` sits between the flanking dc).

### Placing stitches

1. Pick a **start** (magic ring, double magic ring, chain ring, slip knot). It
   drops in the centre — every stitch ultimately comes from here.
2. Choose the **row** you're working (in the toolbar; only one is active).
3. Enter **Insert** mode (press `I` or any stitch key). The current **origin** is
   highlighted <span>light blue</span>; the orange dots mark the **spaces** you
   can work into.
4. **Click a base** — a stitch head or a space — then **click again to set the
   head**. The bottom of the marker is the base; the top is where you click. Keep
   clicking to chain stitches.

### Inserting between stitches

Hold **Alt / ⌘** and click a stitch to make it the origin. The stitch worked out
of it (the *next stitch*) turns **purple** and everything after it greys out, so
you can see exactly where you're splicing in. Place a stitch and the focus walks
forward one — insert as many as you like.

## Symbols

Standard chart symbols, drawn so you can always see where a stitch begins and how
it lies: chain = oval, slip stitch = dot, sc = cross, hdc = T, dc/tr/dtr = T with
1/2/3 slashes; starts are rings/knots. A **legend** builds itself from the symbols
you use.

## Projects & resources

A project is your folder. It can hold **multiple patterns** (phase 1 implements
the **granny square** type; others are stubbed as "coming soon"), plus shared
**resources**: yarns, links & videos, notes & tips, and variations. **Compose
PDF** lays the whole project out — chart, legend, round-by-round written
instructions and resources — into a print/PDF document.

## Run it locally

```bash
node server.js          # zero-dependency static server
# open http://localhost:8080
```

The app is plain ES modules — no build step. Any static server works
(`python3 -m http.server` too); `node server.js` just keeps it dependency-free.

## Exporting

- **Project file** — a portable `.stitchgrid.json` (also autosaved to your
  browser). Import re-adds it as a fresh copy.
- **SVG** — vector master, editable in Illustrator/Inkscape.
- **PNG** — high-resolution raster (3× by default).
- **PDF** — the project composer (Save as PDF from the print dialog).

## Architecture

The core is deliberately **DOM-free and unit-tested**; the UI is a thin layer.

```
js/
  geometry.js      pure 2D math (polar/cartesian, rotation)
  symbols.js       stitch-symbol library (primitive descriptors)
  render.js        the one renderer: descriptors -> SVG (editor + export)
  connectivity.js  origin/base/space/chain model (the procedural core)
  model.js         project / pattern / resource factories + migration
  store.js         central store: data, procedural edits, undo/redo, persistence
  files.js         project import/export, SVG/PNG, PDF composer, instructions
  editorCanvas.js  interactive surface (the two-click insert workflow)
  editorView.js    editor screen: toolbar, palette, panels
  projectsView.js  dashboard (project cards)
  projectView.js   a project: patterns + resources
  app.js           bootstrap, router, modals, autosave
server.js          zero-dependency static server (local dev)
```

## Testing

```bash
npm test            # dependency-free core tests (just node)
npm run test:browser # drives the live app in headless Chromium (needs puppeteer
                     #   + a running server on :8080)
```

## Deployment

The app is static (no build step), so GitHub Pages can serve it straight from the
repository. Enable it once under **Settings → Pages → Build and deployment →
Source: *Deploy from a branch* → Branch: `main` / `/ (root)`**. After that every
push to `main` redeploys automatically; the committed `.nojekyll` tells Pages to
publish the files as-is. The site root (`index.html`) loads `js/` and `css/`
directly.

> Prefer Actions-based deploys (e.g. to gate on tests)? Add a
> `.github/workflows/deploy.yml` that runs `node test/core.test.js` and then
> `actions/upload-pages-artifact` + `actions/deploy-pages`, and switch the Pages
> source to *GitHub Actions*. (It isn't committed here because the automation
> credential lacks the `workflow` scope to push workflow files.)

## Roadmap

Planned work lives in [`BACKLOG.md`](BACKLOG.md) — including stitch base modes
(explicit / distanced / connected), generating a row from text notation, a
double-click Edit mode, more pattern types, and richer PDF layouts.

## License

MIT
