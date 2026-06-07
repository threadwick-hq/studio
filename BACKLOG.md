# stitchgrid studio — feature backlog

A living list of planned work. Newest ideas go under **Proposed**; pull items
into **Next up** when scheduled, **In progress** while building, and **Done**
when shipped. Keep entries small enough to describe their acceptance criteria.

Status legend: 🔲 proposed · 🟡 next up · 🔵 in progress · ✅ done

---

## Next up

### 🔲 Export-pattern dialog + Printable PDF
Replace the editor's Export button with a **hamburger menu** → **"Export pattern…"**
that opens a modal to choose **format** (SVG / PNG / PDF) and **settings**
(include title, include legend, background white/transparent, PNG scale).

The PDF is a **Printable PDF**: tailored for printing — no interactive states,
**QR codes instead of links**, no media. (`qrcode` dependency is already added.)
Interactive exports for smart devices come later.

## Proposed

- 🔲 **Interactive exports for smart devices** — the companion to the Printable
  PDF (tappable links, embedded media, live/animated states).
- 🔲 **Persistent app header** — show "stitchgrid studio" on every screen; set the
  logo in **Space Grotesk**, with "stitchgrid" **bold** and "studio" normal weight.
- 🔲 **Genuine shadcn-style theme** — the current Ant Design theme doesn't read as
  shadcn; revisit tokens/components for a true shadcn look.
- 🔲 **Ravelry integration** — consider linking / importing / exporting with
  [Ravelry](https://www.ravelry.com).

## Done

_(history starts fresh after the backlog was cleared)_
