// help.js — an in-app Help & keyboard-shortcuts panel. Also explains the
// concept users find least obvious: how a square (and its corners) is formed
// on a chart that's worked in the round.

import { el, openModal } from './ui.js';

export function initHelp() {
  const btn = document.getElementById('help-btn');
  if (!btn) return;

  function section(title, rows) {
    return el('div', { class: 'help-section' }, [
      el('h3', { text: title }),
      el('table', { class: 'help-table' },
        rows.map(([k, v]) => el('tr', {}, [
          el('td', { class: 'help-key', html: k }),
          el('td', { html: v }),
        ]))
      ),
    ]);
  }

  function open() {
    const body = el('div', { class: 'help' }, [
      section('Tools', [
        ['Select <kbd>V</kbd>', 'Click a stitch to select its symmetry group; drag to move. Drag on empty space for a <b>box-selection</b>. Hold <kbd>Shift</kbd> to add to the selection.'],
        ['Place <kbd>P</kbd>', 'Click to drop the chosen stitch or cluster. With symmetry on it’s copied to every sector automatically.'],
        ['Pan <kbd>H</kbd> / hold <kbd>Space</kbd>', 'Drag to pan; scroll to zoom; <b>Fit</b> frames the design.'],
      ]),
      section('Keyboard', [
        ['<kbd>R</kbd> / <kbd>Shift</kbd>+<kbd>R</kbd>', 'Rotate the selection ±15°'],
        ['Arrow keys', 'Nudge the selection (hold <kbd>Shift</kbd> for bigger steps)'],
        ['<kbd>Delete</kbd>', 'Delete the selection'],
        ['<kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> / <kbd>Shift</kbd>+<kbd>Z</kbd>', 'Undo / redo'],
        ['<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd>', 'Save the project file'],
      ]),
      section('Even & symmetric, with ease', [
        ['Symmetry', 'Choose a rotational order (4 for squares) and optionally mirror. Edit one stitch and its copies follow, so designs stay perfectly even. “Break symmetry” detaches a group for free-form tweaks.'],
        ['Snapping', 'Rings + spokes (polar) or a square grid. The chart <b>centre is always snappable</b>, so the magic ring lands dead-centre.'],
        ['Distribute', 'In <b>Rounds → Distribute</b>, lay a stitch out evenly around a round in one click, then fine-tune by hand.'],
        ['Clusters & motifs', 'Define your own shells / bobbles / decreases in the cluster editor, or select stitches and “Save as motif”. They’re reusable across the project.'],
      ]),
      section('Making a square — where do corners go?', [
        ['The idea', 'A granny square is worked in the round but turns into a square because of <b>corner increases</b>. The chart simply shows each stitch at its real position, so the square shape comes from <i>where</i> you place stitches — not from a separate “square” mode.'],
        ['Do this', 'Put a <b>corner cluster</b> (e.g. a 3-dc shell, or 3dc-ch2-3dc) at each of the four corners, and straight stitch runs along the edges. With <b>4-fold symmetry</b> you place just <i>one</i> corner and <i>one</i> edge run — they’re mirrored to all four sides.'],
        ['Keep edges straight', 'Constant-radius rings draw a circle. For straight sides switch Snap to the <b>square grid</b> (or place edge stitches on a constant x/y), and reserve the corners for the increases. See the <code>granny-square</code> sample for a worked example.'],
      ]),
    ]);
    openModal('Help & shortcuts', body, { actions: [{ label: 'Got it', primary: true, onClick: (c) => c() }] });
  }

  btn.addEventListener('click', open);
  return { open };
}
