// inspector.js — right-side properties panel for the current selection.

import { STITCH_ORDER, STITCHES } from './stitches.js';
import { el, clear } from './ui.js';

const SWATCHES = [
  { v: null, name: 'Default (ink)', css: '#1c1c1c' },
  { v: '#163a5f', name: 'Navy', css: '#163a5f' },
  { v: '#2f7bff', name: 'Blue', css: '#2f7bff' },
  { v: '#1f9d6b', name: 'Green', css: '#1f9d6b' },
  { v: '#e0a400', name: 'Gold', css: '#e0a400' },
  { v: '#e0542e', name: 'Orange', css: '#e0542e' },
  { v: '#c0317a', name: 'Magenta', css: '#c0317a' },
  { v: '#7a4fd0', name: 'Purple', css: '#7a4fd0' },
];

export function initInspector(store) {
  const box = document.getElementById('inspector');

  function selectedStitches() {
    return [...store.selection].map((id) => store.byId(id)).filter(Boolean);
  }

  function render() {
    clear(box);
    const sel = selectedStitches();
    if (!sel.length) {
      box.appendChild(el('p', { class: 'empty', text: 'Nothing selected. Pick a stitch with the Select tool to edit it.' }));
      return;
    }
    const lead = sel[0];
    const types = new Set(sel.map((s) => s.type));
    const grouped = sel.some((s) => s.group);
    const colors = new Set(sel.map((s) => s.color || null));

    box.appendChild(el('div', { class: 'insp-summary', text:
      `${sel.length} stitch${sel.length > 1 ? 'es' : ''} selected${grouped ? ' · symmetric' : ''}` }));

    // type
    const typeSel = el('select', { class: 'field',
      onchange: (e) => store.updateSelection({ type: e.target.value }) });
    for (const t of STITCH_ORDER) typeSel.appendChild(el('option', { value: t, text: STITCHES[t].name }));
    for (const c of store.state.clusters) typeSel.appendChild(el('option', { value: c.id, text: c.name }));
    typeSel.value = types.size === 1 ? lead.type : '';
    box.appendChild(field('Stitch', typeSel));

    // colour
    const swBox = el('div', { class: 'swatches' });
    for (const s of SWATCHES) {
      const active = colors.size === 1 && (colors.has(s.v) || (s.v === null && colors.has(null)));
      swBox.appendChild(el('button', {
        class: 'swatch' + (active ? ' active' : ''),
        title: s.name,
        style: `background:${s.css}`,
        onclick: () => store.updateSelection({ color: s.v }),
      }));
    }
    const custom = el('input', { type: 'color', class: 'swatch-custom', title: 'Custom colour',
      value: lead.color || '#1c1c1c', oninput: (e) => store.updateSelection({ color: e.target.value }) });
    swBox.appendChild(custom);
    box.appendChild(field('Colour', swBox));

    // orientation
    const rotRow = el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', title: 'Rotate -15°', onclick: () => store.rotateSelectionBy(-15), html: '&#8634;' }),
      el('span', { class: 'rot-readout', text: `${Math.round(lead.rot || 0)}°` }),
      el('button', { class: 'btn', title: 'Rotate +15°', onclick: () => store.rotateSelectionBy(15), html: '&#8635;' }),
    ]);
    box.appendChild(field('Rotation', rotRow));
    box.appendChild(el('button', { class: 'btn wide', text: 'Point outward (radial)', onclick: () => store.orientSelectionRadial() }));
    box.appendChild(el('button', { class: 'btn wide', text: 'Flip / mirror', onclick: () => store.updateSelection({ mirror: !lead.mirror }) }));

    // structure
    if (grouped) {
      box.appendChild(el('button', { class: 'btn wide', text: 'Break symmetry (detach)', onclick: () => store.breakSymmetry() }));
    }
    box.appendChild(el('button', { class: 'btn wide danger', text: 'Delete', onclick: () => store.deleteSelection() }));
  }

  function field(label, control) {
    return el('label', { class: 'insp-field' }, [el('span', { class: 'insp-label', text: label }), control]);
  }

  store.subscribe(render);
  render();
}
