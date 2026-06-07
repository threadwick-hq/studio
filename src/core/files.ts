// Saving & loading: project files, image export, and the print/PDF composer.

import { chartToSVG } from './render';
import { chainOrder } from './connectivity';
import { isStart, STITCHES } from './symbols';
import { projectToFile, projectFromFile } from './model';
import { slug, escapeXML } from './util';
import type { Project, Pattern } from './types';

const escapeHTML = escapeXML;

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

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

export function exportPatternSVG(pattern: Pattern, title?: string): void {
  const svg = chartToSVG(pattern, { title: title || pattern.name, legend: true });
  download(`${slug(title || pattern.name, 'pattern')}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
}

export function exportPatternPNG(pattern: Pattern, title?: string, scale = 3): void {
  const svg = chartToSVG(pattern, { title: title || pattern.name, legend: true });
  const img = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    const w = m ? +m[1]! : img.width, h = m ? +m[2]! : img.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => { if (b) download(`${slug(title || pattern.name, 'pattern')}.png`, b); }, 'image/png');
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

// ---- print / PDF composer --------------------------------------------------
export function printProject(project: Project): void {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to compose the PDF.'); return; }
  win.document.write(buildPrintDoc(project));
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* user cancelled */ } }, 350);
}

function buildPrintDoc(project: Project): string {
  const patterns = (project.patterns || []).map((pat) => {
    const chart = chartToSVG(pat, { title: '', legend: true, padding: 24 });
    const start = patternStartLabel(pat);
    const rounds = pat.rounds.map((r) => {
      const text = summarizeRound(pat, r.id);
      return text ? `<li><b>${escapeHTML(r.name)}:</b> ${escapeHTML(text)}</li>` : '';
    }).filter(Boolean).join('');
    return `
      <section class="pat">
        <h2>${escapeHTML(pat.name)}</h2>
        <div class="chart">${chart}</div>
        ${start ? `<p class="start"><b>Start:</b> ${escapeHTML(start)}</p>` : ''}
        ${rounds ? `<h3>Instructions</h3><ol class="rounds">${rounds}</ol>` : '<p class="muted">No stitches placed yet.</p>'}
      </section>`;
  }).join('');

  const r = project.resources || { yarns: [], links: [], notes: [], variations: [] };
  const block = (title: string, items: string[]): string => items && items.length ? `<h3>${escapeHTML(title)}</h3><ul>${items.join('')}</ul>` : '';
  const resources =
    block('Yarns', r.yarns.map((y) => `<li>${escapeHTML([y.name, y.brand, y.weight, y.color].filter(Boolean).join(' · '))}${y.notes ? ' — ' + escapeHTML(y.notes) : ''}</li>`)) +
    block('Links & videos', r.links.map((l) => `<li>${escapeHTML(l.title || l.url)}${l.url ? ` — <span class="url">${escapeHTML(l.url)}</span>` : ''}</li>`)) +
    block('Notes & tips', r.notes.map((n) => `<li><b>${escapeHTML(n.title)}</b> ${escapeHTML(n.body)}</li>`)) +
    block('Variations', r.variations.map((v) => `<li><b>${escapeHTML(v.title)}</b> ${escapeHTML(v.body)}</li>`));

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(project.name)}</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: 'Georgia', 'Iowan Old Style', serif; color: #21201c; line-height: 1.5; }
    h1 { font-size: 30px; margin: 0 0 4px; }
    .desc { color: #6b675f; margin: 0 0 24px; }
    .pat { page-break-inside: avoid; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #e7e2d8; }
    h2 { font-size: 22px; margin: 18px 0 8px; }
    h3 { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; color: #9a8f7d; margin: 16px 0 6px; }
    .chart { text-align: center; }
    .chart svg { max-width: 100%; height: auto; max-height: 460px; }
    ol.rounds, ul { margin: 4px 0 0; padding-left: 22px; }
    li { margin: 2px 0; }
    .start { margin: 6px 0; }
    .muted { color: #9a8f7d; }
    .url { color: #6b675f; font-style: italic; word-break: break-all; }
    footer { margin-top: 30px; color: #b3aa98; font-size: 12px; }
  </style></head><body>
    <h1>${escapeHTML(project.name)}</h1>
    ${project.description ? `<p class="desc">${escapeHTML(project.description)}</p>` : ''}
    ${patterns || '<p class="muted">This project has no patterns yet.</p>'}
    ${resources ? `<section class="resources"><h2>Resources</h2>${resources}</section>` : ''}
    <footer>Made with stitchgrid studio</footer>
  </body></html>`;
}
