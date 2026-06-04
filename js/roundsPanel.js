// roundsPanel.js — manage concentric rounds (rings) and the guided
// "distribute evenly" builder that lays a stitch out symmetrically around a
// round. This is the guardrail side of the hybrid model: perfectly even
// placement with one click, which you can then fine-tune by hand.

import { el, clear } from './ui.js';
import { distributeRound } from './rounds.js';
import { STITCH_ORDER, STITCHES } from './stitches.js';

export function initRoundsPanel(store, canvas) {
  const listBox = document.getElementById('rounds-list');
  const distBox = document.getElementById('distribute-form');

  function renderList() {
    clear(listBox);
    store.state.rounds.forEach((r) => {
      const radius = el('input', {
        type: 'number', class: 'mini', value: Math.round(r.radius), min: 4, step: 1,
        onchange: (e) => store.updateRound(r.id, { radius: Math.max(4, +e.target.value) }),
      });
      const del = el('button', { class: 'icon-btn', title: 'Remove round', html: '&times;',
        onclick: () => store.removeRound(r.id) });
      listBox.appendChild(el('div', { class: 'round-row' }, [
        el('span', { class: 'round-label', text: r.label }), radius, del,
      ]));
    });
    const addRadius = el('input', { type: 'number', class: 'mini', value: nextRadius(), min: 4, step: 1 });
    listBox.appendChild(el('div', { class: 'round-row add' }, [
      el('span', { class: 'round-label', text: '+' }), addRadius,
      el('button', { class: 'btn', text: 'Add round', onclick: () => store.addRound(Math.max(4, +addRadius.value)) }),
    ]));
    refreshRoundOptions();
  }

  function nextRadius() {
    const rs = store.state.rounds.map((r) => r.radius);
    return rs.length ? Math.round(Math.max(...rs) + 38) : 30;
  }

  // ---- distribute form -----------------------------------------------------
  const roundSel = el('select', { class: 'field' });
  const stitchSel = el('select', { class: 'field' });
  const countInput = el('input', { type: 'number', class: 'mini', value: 12, min: 1, step: 1 });
  const startInput = el('input', { type: 'number', class: 'mini', value: -90, step: 5 });
  const radialChk = el('input', { type: 'checkbox', checked: true });

  function refreshRoundOptions() {
    const cur = roundSel.value;
    clear(roundSel);
    store.state.rounds.forEach((r) =>
      roundSel.appendChild(el('option', { value: r.radius, text: `${r.label} · r=${Math.round(r.radius)}` })));
    if (cur) roundSel.value = cur;
  }
  function refreshStitchOptions() {
    const cur = stitchSel.value;
    clear(stitchSel);
    STITCH_ORDER.forEach((t) => stitchSel.appendChild(el('option', { value: t, text: STITCHES[t].name })));
    store.state.clusters.forEach((c) => stitchSel.appendChild(el('option', { value: c.id, text: c.name })));
    if (cur && [...stitchSel.options].some((o) => o.value === cur)) stitchSel.value = cur;
    else stitchSel.value = 'dc';
  }

  function buildForm() {
    clear(distBox);
    distBox.appendChild(row('Round', roundSel));
    distBox.appendChild(row('Stitch', stitchSel));
    distBox.appendChild(row('Count', countInput));
    distBox.appendChild(row('Start °', startInput));
    distBox.appendChild(row('Point outward', radialChk));
    distBox.appendChild(el('button', { class: 'btn btn-primary wide', text: 'Distribute around round',
      onclick: distribute }));
    distBox.appendChild(el('p', { class: 'hint', text:
      'Tip: run it twice with different Start° to interleave groups and corners.' }));
  }

  function distribute() {
    if (!store.state.rounds.length || !roundSel.value) {
      alert('Add a round first, then distribute a stitch around it.');
      return;
    }
    const radius = +roundSel.value;
    if (!(radius > 0)) { alert('Choose a round with a positive radius.'); return; }
    const count = Math.max(1, +countInput.value | 0);
    const items = distributeRound({
      radius,
      count,
      sequence: [stitchSel.value],
      startAngle: +startInput.value,
      orient: radialChk.checked ? 'radial' : 'up',
    });
    store.addStitchesRaw(items);
  }

  function row(label, control) {
    return el('label', { class: 'insp-field' }, [el('span', { class: 'insp-label', text: label }), control]);
  }

  store.subscribe(() => {
    // Don't tear down inputs the user is mid-edit in (focus/caret would be lost).
    if (!listBox.contains(document.activeElement)) renderList();
    if (document.activeElement !== stitchSel) refreshStitchOptions();
  });
  buildForm();
  renderList();
  refreshStitchOptions();
}
