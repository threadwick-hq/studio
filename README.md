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
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # type-check + production build into docs/
npm run preview    # serve the production build (http://localhost:8080)
```

The UI is **React 18 + Ant Design v5** in **strict TypeScript**, built with Vite.

## AI-assisted development

Because the UI is built on **Ant Design**, the repo ships Ant Design's
[**official MCP server**](https://ant.design/docs/react/mcp) in
[`.mcp.json`](.mcp.json). Any MCP-aware assistant (Claude Code, Cursor, …) that
opens this repo can query live antd component docs, props, demos, design tokens
and changelogs while it writes code — so generated UI stays idiomatic to the
design system. It exposes seven tools (`antd_list`, `antd_info`, `antd_doc`,
`antd_demo`, `antd_token`, `antd_semantic`, `antd_changelog`) and two prompts
(`antd-expert`, `antd-page-generator`).

```jsonc
{
  "mcpServers": {
    // official @ant-design/cli MCP server (the `antd mcp` command)
    "antd": { "command": "npx", "args": ["-y", "@ant-design/cli", "mcp"] }
  }
}
```

It's the official server from [`@ant-design/cli`](https://www.npmjs.com/package/@ant-design/cli),
run over stdio. We invoke it with `npx` so no global install is needed; the docs'
equivalent is `npm install -g @ant-design/cli` then `{ "command": "antd", "args":
["mcp"] }`. Pin a version with an extra arg (e.g. `"mcp", "--version", "5.20.0"`).
In Claude Code, enable the project server when prompted (or run `claude mcp list`).

## Exporting

Every project autosaves to your browser; these are the ways out:

- **Project file** — a portable `.stitchgrid.json`. Import re-adds it as a fresh copy.
- **Export pattern…** (editor hamburger menu) — a dialog to pick a **format**
  (SVG / PNG / Printable PDF) and **settings**: include title, include legend,
  background (white/transparent, SVG & PNG) and PNG resolution (1×–3×).
- **Printable PDF** (project page) — the whole project, print-tailored: every
  pattern's chart and written instructions, plus resources with **links rendered
  as QR codes** and no embedded media (scan from paper). Save as PDF from the
  print dialog.

## Architecture

The core is deliberately **DOM-free and unit-tested**; the React/antd UI is a
thin layer on top, and the interactive canvas is an imperative controller mounted
into React via a ref.

```
src/core/         framework-agnostic core (strict TS, unit-tested)
  types.ts          shared domain types
  geometry.ts       pure 2D math (polar/cartesian, rotation)
  symbols.ts        stitch-symbol library (primitive descriptors)
  render.ts         the one renderer: descriptors -> SVG (editor + export)
  connectivity.ts   origin / base / space / chain model (the procedural core)
  model.ts          project / pattern / resource factories + migration
  store.ts          central store: data, procedural edits, undo/redo, persistence
  files.ts          project import/export, SVG/PNG, PDF composer, instructions
  sample.ts         the worked sample project
  editorCanvas.ts   interactive surface (the two-click insert workflow)
src/                React + Ant Design UI
  main.tsx theme.ts useStore.ts App.tsx index.css
  components/ Glyph Thumb
  editor/CanvasView.tsx        mounts the canvas controller into React
  views/ ProjectsView ProjectView EditorView
docs/             the built site (committed; served by GitHub Pages)
```

## Testing

```bash
npm test         # Vitest core tests (the DOM-free model)
npm run typecheck # strict tsc --noEmit
```

## Deployment

The app is built with Vite into `dist/` (git-ignored, `base: './'`) and published
to GitHub Pages by a workflow (`.github/workflows/deploy.yml`) that runs on every
push to `main`: it builds, runs the tests, and deploys `dist/`. Enable it once
under **Settings → Pages → Build and deployment → Source: *GitHub Actions***.

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Roadmap

Planned work lives in [`BACKLOG.md`](BACKLOG.md) — including stitch base modes
(explicit / distanced / connected), generating a row from text notation, a
double-click Edit mode, more pattern types, and richer PDF layouts.

## License

MIT
