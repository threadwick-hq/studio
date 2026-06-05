// palette.js — left sidebar: base stitches, custom clusters, reusable motifs.

import { STITCH_ORDER, STITCHES, STARTS, STITCH_KEYS } from './stitches.js';
import { glyphSVG } from './svg.js';
import { el, clear } from './ui.js';

export function initPalette(store, canvas, clusterEditor) {
  const stitchesBox = document.getElementById('palette-stitches');
  const clustersBox = document.getElementById('palette-clusters');
  const motifsBox = document.getElementById('palette-motifs');
  let activeRef = 'dc';

  function chip(label, refKey, glyphMarkup, extra = []) {
    const c = el('button', {
      class: 'chip',
      title: label,
      dataset: { ref: refKey },
      onclick: () => choose(refKey),
    }, [el('span', { class: 'chip-glyph', html: glyphMarkup }), el('span', { class: 'chip-label', text: label })]);
    const key = STITCH_KEYS[refKey];
    if (key) c.appendChild(el('span', { class: 'chip-key', title: `Shortcut: ${key.toUpperCase()}`, text: key.toUpperCase() }));
    extra.forEach((e) => c.appendChild(e));
    return c;
  }

  // enter=true begins inserting (the normal palette pick / shortcut); enter=false
  // just sets the active stitch without leaving Select mode (startup / fallback).
  function choose(refKey, enter = true) {
    activeRef = refKey;
    const [kind, ...rest] = refKey.split(':');
    if (kind === 'motif') canvas.setPlacement({ kind: 'motif', ref: rest.join(':') }, enter);
    else canvas.setPlacement({ kind: kind === 'cluster' ? 'cluster' : 'stitch', ref: kind === 'cluster' ? rest.join(':') : refKey }, enter);
    highlight();
  }

  // Only show a chip as active while actually inserting, so Select mode is clearly
  // "no stitch armed".
  function highlight() {
    const insert = canvas.getTool() === 'place';
    document.querySelectorAll('#left .chip').forEach((c) => c.classList.toggle('active', insert && c.dataset.ref === activeRef));
  }
  canvas.setOnToolChange(() => highlight());

  // start (round-0) elements + base stitches are static
  const startsBox = document.getElementById('palette-starts');
  for (const type of STARTS) {
    startsBox.appendChild(chip(STITCHES[type].abbr, type, glyphSVG(type, {}, 38)));
  }
  for (const type of STITCH_ORDER) {
    stitchesBox.appendChild(chip(STITCHES[type].abbr, type, glyphSVG(type, {}, 38)));
  }

  function renderClusters() {
    clear(clustersBox);
    const list = store.state.clusters;
    if (!list.length) {
      clustersBox.appendChild(el('p', { class: 'empty', text: 'No custom clusters yet.' }));
    }
    for (const c of list) {
      const refKey = 'cluster:' + c.id;
      const del = el('span', {
        class: 'chip-x', title: 'Delete', html: '&times;',
        onclick: (e) => { e.stopPropagation(); store.removeCluster(c.id); },
      });
      const edit = el('span', {
        class: 'chip-edit', title: 'Edit', html: '&#9998;',
        onclick: (e) => { e.stopPropagation(); clusterEditor.open(c); },
      });
      clustersBox.appendChild(chip(c.name, refKey, glyphSVG(c.id, store.state.clusterMap, 38), [edit, del]));
    }
    highlight();
  }

  function renderMotifs() {
    clear(motifsBox);
    const list = store.state.motifs;
    if (!list.length) {
      motifsBox.appendChild(el('p', { class: 'empty', text: 'Select stitches, then "Save as motif".' }));
    }
    for (const m of list) {
      const refKey = 'motif:' + m.id;
      const del = el('span', {
        class: 'chip-x', title: 'Delete', html: '&times;',
        onclick: (e) => { e.stopPropagation(); store.removeMotif(m.id); },
      });
      // preview the motif's first stitch as an icon
      const icon = m.stitches[0] ? glyphSVG(m.stitches[0].type, store.state.clusterMap, 38) : '';
      motifsBox.appendChild(chip(`${m.name} (${m.stitches.length})`, refKey, icon, [del]));
    }
    highlight();
  }

  document.getElementById('btn-new-cluster').addEventListener('click', () => clusterEditor.open(null));
  document.getElementById('btn-create-motif').addEventListener('click', () => {
    if (store.selection.size < 2) {
      alert('Select at least two stitches first, then save them as a reusable motif.');
      return;
    }
    const name = prompt('Name this motif:', 'Motif ' + (store.state.motifs.length + 1));
    if (name) store.createMotifFromSelection(name);
  });

  store.subscribe(() => {
    renderClusters();
    renderMotifs();
    // If the active placement's backing cluster/motif was deleted, fall back to dc.
    if (activeRef.startsWith('cluster:') && !store.state.clusters.some((c) => 'cluster:' + c.id === activeRef)) choose('dc', false);
    else if (activeRef.startsWith('motif:') && !store.state.motifs.some((m) => 'motif:' + m.id === activeRef)) choose('dc', false);
  });
  renderClusters();
  renderMotifs();
  choose('dc', false);

  return { choose };
}
