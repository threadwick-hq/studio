// clusterEditor.js — define/edit a reusable parametric cluster with live
// preview. This is how users build their own stitch vocabulary (V-stitches,
// shells, bobbles, decreases) once and reuse it across the whole project.

import { el, clear, openModal } from './ui.js';
import { glyphSVG } from './svg.js';
import { PRESET_CLUSTERS } from './clusters.js';

const LEG_BASES = ['hdc', 'dc', 'tr', 'dtr'];

export function initClusterEditor(store) {
  let onSaved = () => {};

  function open(existing) {
    const def = existing
      ? { ...existing }
      : { name: 'My cluster', base: 'dc', legs: 3, joinBottom: true, joinTop: false, spread: 48 };

    const preview = el('div', { class: 'cluster-preview' });
    function refresh() {
      clear(preview);
      preview.insertAdjacentHTML('beforeend', glyphSVG('__preview__', { __preview__: def }, 120));
    }

    const name = el('input', { class: 'field', value: def.name, oninput: (e) => { def.name = e.target.value; } });
    const base = el('select', { class: 'field', onchange: (e) => { def.base = e.target.value; refresh(); } });
    LEG_BASES.forEach((b) => base.appendChild(el('option', { value: b, text: b })));
    base.value = def.base;

    const legs = el('input', { type: 'number', min: 1, max: 9, value: def.legs, class: 'field',
      oninput: (e) => { def.legs = Math.max(1, Math.min(9, +e.target.value | 0)); refresh(); } });
    const joinBottom = el('input', { type: 'checkbox', checked: def.joinBottom,
      onchange: (e) => { def.joinBottom = e.target.checked; refresh(); } });
    const joinTop = el('input', { type: 'checkbox', checked: def.joinTop,
      onchange: (e) => { def.joinTop = e.target.checked; refresh(); } });
    const spread = el('input', { type: 'range', min: 10, max: 160, value: def.spread, class: 'field',
      oninput: (e) => { def.spread = +e.target.value; refresh(); } });

    const presetSel = el('select', { class: 'field', onchange: (e) => {
      const p = PRESET_CLUSTERS[+e.target.value];
      if (!p) return;
      Object.assign(def, { base: p.base, legs: p.legs, joinTop: !!p.joinTop, joinBottom: !!p.joinBottom, spread: p.spread || 48 });
      if (!existing) { def.name = p.name; name.value = p.name; }
      base.value = def.base; legs.value = def.legs; joinBottom.checked = def.joinBottom; joinTop.checked = def.joinTop; spread.value = def.spread;
      refresh();
    } });
    presetSel.appendChild(el('option', { value: '', text: 'Start from a preset…' }));
    PRESET_CLUSTERS.forEach((p, i) => presetSel.appendChild(el('option', { value: i, text: p.name })));

    function row(label, control) {
      return el('label', { class: 'insp-field' }, [el('span', { class: 'insp-label', text: label }), control]);
    }

    const body = el('div', { class: 'cluster-editor' }, [
      preview,
      el('div', { class: 'cluster-fields' }, [
        row('Name', name),
        row('Preset', presetSel),
        row('Leg stitch', base),
        row('Legs', legs),
        row('Join bottom (increase)', joinBottom),
        row('Join top (decrease)', joinTop),
        row('Fan spread', spread),
        el('p', { class: 'hint', text: 'Bottom only = shell/V · Top only = decrease · Both = bobble/puff.' }),
      ]),
    ]);
    refresh();

    openModal(existing ? 'Edit cluster' : 'New cluster', body, {
      actions: [
        { label: 'Cancel', onClick: (close) => close() },
        { label: 'Save', primary: true, onClick: (close) => {
          const payload = { name: def.name || 'Cluster', base: def.base, legs: def.legs,
            joinTop: def.joinTop, joinBottom: def.joinBottom, spread: def.spread };
          const id = existing ? (store.updateCluster(existing.id, payload), existing.id) : store.addCluster(payload);
          onSaved(id);
          close();
        } },
      ],
    });
  }

  return { open, setOnSaved: (fn) => { onSaved = fn; } };
}
