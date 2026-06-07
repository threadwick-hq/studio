// Saving & loading: project files, image export, and the print/PDF composer.

import QRCode from 'qrcode';
import { chartToSVG } from './render';
import { chainOrder } from './connectivity';
import { isStart, STITCHES } from './symbols';
import { projectToFile, projectFromFile } from './model';
import { slug, escapeXML } from './util';
import type { Project, Pattern } from './types';

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---- project file ----------------------------------------------------------
export function exportProjectFile(project: Project): void {
  const data = JSON.stringify(projectToFile(project), null, 2);
  download(`${slug(project.name, 'project')}.stitchgrid.json`, new Blob([data], { type: 'application/json' }));
}

export function importProjectFile(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(projectFromFile(JSON.parse(String(reader.result)))); }
        catch { resolve(null); }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

// ---- image export ----------------------------------------------------------
export interface ImageExportOptions {
  title?: boolean;                     // include the pattern name as a heading
  legend?: boolean;                    // include the symbol legend
  background?: 'white' | 'transparent';
  scale?: number;                      // PNG only
}

function chartSVG(pattern: Pattern, o: ImageExportOptions): string {
  return chartToSVG(pattern, {
    title: o.title === false ? '' : pattern.name,
    legend: o.legend !== false,
    background: o.background === 'transparent' ? null : '#ffffff',
  });
}

export function exportPatternSVG(pattern: Pattern, opts: ImageExportOptions = {}): void {
  download(`${slug(pattern.name, 'pattern')}.svg`, new Blob([chartSVG(pattern, opts)], { type: 'image/svg+xml' }));
}

export function exportPatternPNG(pattern: Pattern, opts: ImageExportOptions = {}): void {
  const scale = opts.scale ?? 3;
  const transparent = opts.background === 'transparent';
  const svg = chartSVG(pattern, opts);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    const w = m ? +m[1]! : img.width, h = m ? +m[2]! : img.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return; }
    if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => { if (b) download(`${slug(pattern.name, 'pattern')}.png`, b); }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// ---- written instructions --------------------------------------------------
export function summarizeRound(pattern: Pattern, roundId: string): string {
  const order = chainOrder(pattern.stitches, roundId).filter((s) => !isStart(s.type));
  if (!order.length) return '';
  const parts: string[] = [];
  let i = 0;
  while (i < order.length) {
    const t = order[i]!.type; let n = 1;
    while (i + n < order.length && order[i + n]!.type === t) n++;
    const abbr = (STITCHES[t] && STITCHES[t].abbr) || t;
    parts.push(t === 'ch' && n > 1 ? `ch ${n}` : (n > 1 ? `${n} ${abbr}` : abbr));
    i += n;
  }
  return parts.join(', ');
}

export function patternStartLabel(pattern: Pattern): string | null {
  const st = pattern.stitches.find((s) => isStart(s.type));
  const type = st ? st.type : pattern.start;
  return type && STITCHES[type] ? STITCHES[type].name : null;
}

// ---- printable PDF ---------------------------------------------------------
// Print-tailored documents: no interactive states, links become QR codes, no
// embedded media. (Interactive smart-device exports are a separate, later path.)

const PRINT_CSS = `
  @page { margin: 18mm; }
  body { font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif; color: #21201c; line-height: 1.5; margin: 0; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .desc { color: #6b675f; margin: 0 0 22px; }
  .pat { page-break-inside: avoid; margin-bottom: 26px; padding-bottom: 16px; border-bottom: 1px solid #e7e2d8; }
  h2 { font-size: 21px; margin: 16px 0 8px; }
  h3 { font-size: 14px; letter-spacing: .05em; text-transform: uppercase; color: #9a8f7d; margin: 14px 0 6px; }
  .chart { text-align: center; }
  .chart svg { max-width: 100%; height: auto; max-height: 460px; }
  ol.rounds, ul { margin: 4px 0 0; padding-left: 22px; }
  li { margin: 3px 0; }
  .start { margin: 6px 0; }
  .muted { color: #9a8f7d; }
  .links { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 16px; }
  .links li { display: flex; gap: 10px; align-items: center; page-break-inside: avoid; }
  .qr svg { width: 84px; height: 84px; display: block; }
  .link-text { font-size: 13px; max-width: 220px; }
  .url { display: block; color: #6b675f; font-style: italic; word-break: break-all; font-size: 11px; }
  .swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; border: 1px solid rgba(0,0,0,.15); vertical-align: -1px; margin-right: 5px; }
  footer { margin-top: 28px; color: #b3aa98; font-size: 12px; }
`;

function patternSection(pat: Pattern, opts: { title?: boolean; legend?: boolean; instructions?: boolean }): string {
  const chart = chartToSVG(pat, { title: '', legend: opts.legend !== false, padding: 24 });
  const start = patternStartLabel(pat);
  const rounds = opts.instructions === false ? '' : pat.rounds.map((r) => {
    const text = summarizeRound(pat, r.id);
    return text ? `<li><b>${escapeXML(r.name)}:</b> ${escapeXML(text)}</li>` : '';
  }).filter(Boolean).join('');
  return `<section class="pat">
    ${opts.title === false ? '' : `<h2>${escapeXML(pat.name)}</h2>`}
    <div class="chart">${chart}</div>
    ${start ? `<p class="start"><b>Start:</b> ${escapeXML(start)}</p>` : ''}
    ${rounds ? `<h3>Instructions</h3><ol class="rounds">${rounds}</ol>` : ''}
  </section>`;
}

function printDoc(title: string, bodyInner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXML(title)}</title>`
    + `<style>${PRINT_CSS}</style></head><body>${bodyInner}`
    + `<footer>Made with stitchgrid studio · printable PDF</footer></body></html>`;
}

function openPrintWindow(): Window | null {
  const win = window.open('', '_blank');
  if (!win) alert('Please allow pop-ups to export a PDF.');
  return win;
}
function writeAndPrint(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // small delay lets the inline SVG(s) lay out before the print dialog opens
  setTimeout(() => { try { win.print(); } catch { /* dialog dismissed */ } }, 250);
}

// A single pattern (chart + legend + written instructions), tailored for paper.
export function printPattern(pattern: Pattern, opts: { title?: boolean; legend?: boolean; instructions?: boolean } = {}): void {
  const win = openPrintWindow();
  if (!win) return;
  writeAndPrint(win, printDoc(pattern.name, `<h1>${escapeXML(pattern.name)}</h1>${patternSection(pattern, { ...opts, title: false })}`));
}

async function qrSvg(text: string): Promise<string> {
  try { return await QRCode.toString(text, { type: 'svg', margin: 1 }); }
  catch { return ''; }
}

// The whole project (every pattern + shared resources), with links as QR codes.
export async function printProject(project: Project): Promise<void> {
  const win = openPrintWindow();
  if (!win) return;
  // open synchronously (keeps the user gesture), then fill once the QRs are ready
  win.document.write('<!doctype html><meta charset="utf-8"><body style="font:16px Georgia,serif;color:#777;padding:28px">Preparing printable PDF…</body>');

  const patterns = project.patterns.map((p) => patternSection(p, {})).join('')
    || '<p class="muted">This project has no patterns yet.</p>';

  const r = project.resources;
  const block = (heading: string, items: string[]): string => items.length ? `<h3>${escapeXML(heading)}</h3><ul>${items.join('')}</ul>` : '';
  const yarns = block('Yarns', r.yarns.map((y) =>
    `<li>${y.hex ? `<span class="swatch" style="background:${escapeXML(y.hex)}"></span>` : ''}`
    + `${escapeXML([y.name, y.brand, y.weight, y.color].filter(Boolean).join(' · ')) || 'Yarn'}`
    + `${y.notes ? ' — ' + escapeXML(y.notes) : ''}</li>`));
  const notes = block('Notes & tips', r.notes.map((n) => `<li><b>${escapeXML(n.title)}</b> ${escapeXML(n.body)}</li>`));
  const variations = block('Variations', r.variations.map((v) => `<li><b>${escapeXML(v.title)}</b> ${escapeXML(v.body)}</li>`));
  // links → QR codes (scannable in print); no live hyperlinks, no media
  const linkItems = await Promise.all(r.links.map(async (l) => {
    const qr = l.url ? await qrSvg(l.url) : '';
    return `<li>${qr ? `<div class="qr">${qr}</div>` : ''}<div class="link-text"><b>${escapeXML(l.title || l.url || 'Link')}</b>`
      + `${l.url ? `<span class="url">${escapeXML(l.url)}</span>` : ''}</div></li>`;
  }));
  const links = r.links.length ? `<h3>Links &amp; videos</h3><ul class="links">${linkItems.join('')}</ul>` : '';

  const resources = (yarns || links || notes || variations)
    ? `<section class="resources"><h2>Resources</h2>${yarns}${links}${notes}${variations}</section>` : '';

  const body = `<h1>${escapeXML(project.name)}</h1>`
    + (project.description ? `<p class="desc">${escapeXML(project.description)}</p>` : '')
    + patterns + resources;

  writeAndPrint(win, printDoc(project.name, body));
}
