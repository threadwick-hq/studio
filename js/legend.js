// legend.js — live legend in the sidebar mirroring what export will bake in.

import { glyphSVG, labelFor } from './svg.js';
import { el, clear } from './ui.js';

export function initLegend(store) {
  const box = document.getElementById('legend-box');

  function render() {
    clear(box);
    const seen = new Set();
    const types = [];
    for (const s of store.state.stitches) if (!seen.has(s.type)) { seen.add(s.type); types.push(s.type); }
    if (!types.length) {
      box.appendChild(el('p', { class: 'empty', text: 'Symbols you use will be listed here.' }));
      return;
    }
    for (const t of types) {
      const l = labelFor(t, store.state.clusterMap);
      const text = l.abbr ? `${l.name} (${l.abbr})` : l.name;
      box.appendChild(el('div', { class: 'legend-row' }, [
        el('span', { class: 'legend-glyph', html: glyphSVG(t, store.state.clusterMap, 30) }),
        el('span', { text }),
      ]));
    }
  }

  store.subscribe(render);
  render();
}
