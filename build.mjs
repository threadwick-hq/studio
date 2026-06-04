// build.mjs — bundle stitchgrid into self-contained artifacts (no server, no
// modules): dist/stitchgrid.html (open it directly) and dist/stitchgrid.console.js
// (paste into any browser console to launch the app). Run: npm run build.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('.', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// 1) bundle the ES modules into one classic IIFE
const result = await esbuild.build({
  entryPoints: [new URL('js/main.js', root).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  legalComments: 'none',
  target: ['es2020'],
});
const js = result.outputFiles[0].text;

// 2) pull the body scaffold out of index.html (minus the module <script>)
const html = read('index.html');
const bodyInner = html
  .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*type="module"[^>]*><\/script>/g, '')
  .trim();
const css = read('css/style.css');

mkdirSync(new URL('dist/', root), { recursive: true });

// 3) single-file HTML — works over file:// (no server needed)
const standalone =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>stitchgrid</title><style>\n' + css + '\n</style></head><body>\n' +
  bodyInner + '\n<script>\n' + js + '\n</script></body></html>\n';
writeFileSync(new URL('dist/stitchgrid.html', root), standalone);

// 4) console snippet — injects the CSS + DOM scaffold, then runs the app
const snippet =
  '/* stitchgrid — paste into any browser console (e.g. on about:blank) to run. */\n' +
  '(function(){\n' +
  '  var s=document.getElementById("sg-style")||document.createElement("style");\n' +
  '  s.id="sg-style"; s.textContent=' + JSON.stringify(css) + '; document.head.appendChild(s);\n' +
  '  document.title="stitchgrid";\n' +
  '  document.body.innerHTML=' + JSON.stringify(bodyInner) + ';\n' +
  '  ' + js + '\n' +
  '})();\n';
writeFileSync(new URL('dist/stitchgrid.console.js', root), snippet);

console.log(`built dist/stitchgrid.html (${(standalone.length/1024).toFixed(0)} KB) and dist/stitchgrid.console.js (${(snippet.length/1024).toFixed(0)} KB)`);
