# stitchgrid studio — feature backlog

A living list of planned work. Newest ideas go under **Proposed**; pull items
into **Next up** when scheduled, **In progress** while building, and **Done**
when shipped. Keep entries small enough to describe their acceptance criteria.

Status legend: 🔲 proposed · 🟡 next up · 🔵 in progress · ✅ done

---

## Next up

_Nothing queued._

## Proposed

- 🔲 **Interactive exports for smart devices** — the companion to the Printable
  PDF (tappable links, embedded media, live/animated states).
- 🔲 **Persistent app header** — show "stitchgrid studio" on every screen; set the
  logo in **Space Grotesk**, with "stitchgrid" **bold** and "studio" normal weight.
- 🔲 **Genuine shadcn-style theme** — the current Ant Design theme doesn't read as
  shadcn; revisit tokens/components for a true shadcn look.
- 🔲 **Ravelry integration** — bi-directional sync with
  [Ravelry](https://www.ravelry.com): the Pattern / Chart / Project model (Ravelry-parity
  vocabulary), makes-as-assemblies with follow-mode progress, and account sync under a
  studio + logbook split. Fully scoped — see
  [`docs/ravelry-integration.md`](docs/ravelry-integration.md).

## Done

- ✅ **Export-pattern dialog + Printable PDF** — editor hamburger → "Export
  pattern…" modal (SVG / PNG / Printable PDF + title, legend, background, PNG
  scale). The project "Printable PDF" is print-tailored with **QR codes instead
  of links** and no media.
