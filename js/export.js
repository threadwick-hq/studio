// export.js — turn the chart into deliverables: SVG (vector master), PNG
// (high-res raster), a .stitchgrid project file (save/load), and a first-cut
// print-to-PDF. All raster/print paths reuse the same chartToSVG output, so
// every export matches the on-screen WYSIWYG chart exactly.

import { chartToSVG } from './svg.js';

export function initExport(store, canvas) {
  function filenameBase() {
    const t = (store.state.title || 'granny-square').trim();
    return t.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'granny-square';
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildSVG() {
    return chartToSVG(store.state, { legend: true, title: store.state.title });
  }

  function exportSVG() {
    download(new Blob([buildSVG()], { type: 'image/svg+xml;charset=utf-8' }), filenameBase() + '.svg');
  }

  function exportPNG(scale = 3) {
    const blob = new Blob([buildSVG()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cw = Math.round(img.width * scale);
      const ch = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      c.toBlob((b) => download(b, `${filenameBase()}@${scale}x.png`), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Could not rasterize the chart for PNG export.'); };
    img.src = url;
  }

  function saveProject() {
    const data = JSON.stringify(store.serialize(), null, 2);
    download(new Blob([data], { type: 'application/json' }), filenameBase() + '.stitchgrid.json');
  }

  function openProject() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          store.load(JSON.parse(r.result));
          canvas.onLoad();
          canvas.fit();
        } catch (err) {
          alert('Could not open project: ' + err.message);
        }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  // First-cut PDF: open the chart in a print window (Save as PDF). The fuller
  // "whole project to a ready-to-use pattern PDF" is a later milestone.
  function printPDF() {
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up blocked — allow pop-ups to print.'); return; }
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(store.state.title)}</title>` +
      '<style>html,body{margin:0}body{display:flex;justify-content:center;padding:24px}svg{max-width:100%;height:auto}</style>' +
      '</head><body>' + buildSVG() +
      '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>' +
      '</body></html>'
    );
    w.document.close();
  }

  return { exportSVG, exportPNG, saveProject, openProject, printPDF };
}

function escapeHtml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
