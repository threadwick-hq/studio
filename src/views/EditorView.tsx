import { useEffect, useRef, useState } from 'react';
import {
  App, Alert, Button, Segmented, Select, InputNumber, Switch, ColorPicker, Dropdown, Modal, Input, Tooltip, Typography,
} from 'antd';
import {
  BackIcon, UndoIcon, RedoIcon, DownloadIcon, HelpIcon, MenuIcon,
  PlusIcon, ZoomInIcon, ZoomOutIcon, FitIcon, MoreIcon, DeleteIcon,
  EditIcon, RotateLeftIcon, RotateRightIcon, OriginIcon,
  SelectModeIcon, InsertModeIcon, PanModeIcon, MirrorIcon,
} from '../icons';
import { useStore } from '../useStore';
import { CanvasView } from '../editor/CanvasView';
import { TopBar } from '../components/TopBar';
import { Glyph } from '../components/Glyph';
import { statusLabel } from '../components/versionStatus';
import type { CanvasController, Mode } from '../core/editorCanvas';
import { STITCH_ORDER, START_ORDER, STITCHES, STITCH_KEYS, isStart, isRealStitch, defaultLen } from '../core/symbols';
import { chainOrder } from '../core/connectivity';
import { usedTypes } from '../core/render';
import { summarizeRound, exportPatternSVG, exportPatternPNG, printPattern } from '../core/files';
import { hasStart, isStartRow } from '../core/model';
import { INK, ORIGIN, SPACE, SELECT, NEXT } from '../core/colors';
import type { Stitch, StitchType } from '../core/types';

const { Title } = Typography;
const KEY_TO_TYPE: Record<string, StitchType> = Object.fromEntries(
  Object.entries(STITCH_KEYS).map(([t, k]) => [k as string, t as StitchType]),
);

interface Chrome { mode: Mode; armed: StitchType; phase: 'base' | 'head'; nextId: string | null; }

export function EditorView() {
  const s = useStore();
  const pat = s.currentPattern();
  const proj = s.currentProject();
  const ver = s.currentVersion();
  const readOnly = !ver || ver.status !== 'draft'; // only draft versions are editable
  const ctrl = useRef<CanvasController | null>(null);
  const [chrome, setChrome] = useState<Chrome>({ mode: 'select', armed: 'dc', phase: 'base', nextId: null });
  const [help, setHelp] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const { modal } = App.useApp();

  const sync = () => {
    const c = ctrl.current; if (!c) return;
    setChrome({ mode: c.getMode(), armed: c.getArmed(), phase: c.getPhase(), nextId: c.getNextStitchId() });
  };

  // keyboard, scoped to the editor
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const c = ctrl.current; if (!c) return;
      const meta = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (meta && k === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (meta && (k === 'y')) { e.preventDefault(); s.redo(); return; }
      if (meta && k === 's') { e.preventDefault(); return; }
      if (meta) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); s.deleteSelection(); return; }
      if (e.key === 'Escape') { if (!c.escape()) s.clearSelection(); return; }
      if (e.key === ' ') { e.preventDefault(); c.setSpace(true); return; }
      if (k === 'v') { c.setMode('select'); return; }
      if (k === 'i') { c.setMode('insert'); return; }
      if (k === 'p') { c.setMode('pan'); return; }
      if (KEY_TO_TYPE[k]) {
        const cur = s.currentPattern();
        const onStartRow = !!cur && isStartRow(cur, cur.activeRound);
        if (!onStartRow) c.setArmed(KEY_TO_TYPE[k]!); // no normal stitches on the Start row
        return;
      }
      if (k === 'r') { s.rotateSelectionBy(e.shiftKey ? -15 : 15); return; }
      const n = e.shiftKey ? 8 : 2;
      if (e.key === 'ArrowLeft') { e.preventDefault(); s.moveSelectionBy(-n, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); s.moveSelectionBy(n, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); s.moveSelectionBy(0, -n); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); s.moveSelectionBy(0, n); }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === ' ') ctrl.current?.setSpace(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, [s]);

  if (!pat) return null;
  const startRow = pat.rounds[0];
  const working = pat.rounds.slice(1);
  const onStart = isStartRow(pat, pat.activeRound);
  const started = hasStart(pat);
  return (
    <div className={'editor' + (readOnly ? ' has-banner' : '')}>
      <TopBar>
        <Tooltip title="Back to project"><Button type="text" icon={<BackIcon />} onClick={() => s.backToProject()}><span className="back-label">{proj?.name ?? 'Project'}</span></Button></Tooltip>
        <Input variant="borderless" className="pat-name" value={pat.name} readOnly={readOnly} onChange={(e) => s.renamePattern(pat.id, e.target.value)} />
        <span className="badge">Granny square</span>
        <div className="grow" />
        <Tooltip title="Undo (⌘Z)"><Button type="text" aria-label="Undo" icon={<UndoIcon />} disabled={!s.undoStack.length} onClick={() => s.undo()} /></Tooltip>
        <Tooltip title="Redo (⇧⌘Z)"><Button type="text" aria-label="Redo" icon={<RedoIcon />} disabled={!s.redoStack.length} onClick={() => s.redo()} /></Tooltip>
        <Tooltip title="How it works"><Button type="text" aria-label="How it works" icon={<HelpIcon />} onClick={() => setHelp(true)} /></Tooltip>
        <Dropdown trigger={['click']} menu={{
          items: [{ key: 'export', icon: <DownloadIcon />, label: 'Export pattern…' }],
          onClick: ({ key }) => { if (key === 'export') setExportOpen(true); },
        }}>
          <Button type="text" aria-label="Menu" icon={<MenuIcon />} />
        </Dropdown>
      </TopBar>

      <div className="toolbar">
        <Segmented value={chrome.mode === 'insert' && readOnly ? 'select' : chrome.mode} onChange={(v) => ctrl.current?.setMode(v as Mode)}
          options={[
            { label: (<Tooltip title="Select (V)"><span className="seg-icon" aria-label="Select"><SelectModeIcon /></span></Tooltip>), value: 'select' },
            ...(readOnly ? [] : [{ label: (<Tooltip title="Insert (I)"><span className="seg-icon" aria-label="Insert"><InsertModeIcon /></span></Tooltip>), value: 'insert' }]),
            { label: (<Tooltip title="Pan (P)"><span className="seg-icon" aria-label="Pan"><PanModeIcon /></span></Tooltip>), value: 'pan' },
          ]} />
        <div className="grow" />
        {!readOnly && <Tooltip title="Fan the current row out evenly"><Button size="small" onClick={() => s.evenRound(pat.activeRound)}>Even out row</Button></Tooltip>}
        <div className="tool-view">
          <Tooltip title="Zoom out"><Button size="small" type="text" aria-label="Zoom out" icon={<ZoomOutIcon />} onClick={() => ctrl.current?.zoomOut()} /></Tooltip>
          <Tooltip title="Fit to view"><Button size="small" icon={<FitIcon />} onClick={() => ctrl.current?.fit()}>Fit</Button></Tooltip>
          <Tooltip title="Zoom in"><Button size="small" type="text" aria-label="Zoom in" icon={<ZoomInIcon />} onClick={() => ctrl.current?.zoomIn()} /></Tooltip>
        </div>
      </div>

      {readOnly && (
        <Alert className="ed-readonly" type="info" showIcon banner
          message="You are viewing a read-only version"
          description={ver ? `Version ${ver.label} is ${statusLabel(ver.status).toLowerCase()} and cannot be edited.` : undefined}
          action={proj && <Button size="small" type="primary" icon={<EditIcon />} onClick={() => s.createDraft(proj.id)}>Edit as new draft</Button>} />
      )}

      <div className={'ed-body' + (readOnly ? ' readonly' : '')}>
        {!readOnly && (
          <aside className="ed-left">
            <Palette pat={pat} chrome={chrome} ctrl={ctrl} />
            <div className="howto-card">
              <div className="panel-title">How it works</div>
              <ol className="howto">
                <li>Pick a <b>start</b>, then a <b>row</b>.</li>
                <li>Hit <b>Insert</b> (or a stitch key).</li>
                <li>Click a <b>base</b> — a stitch or an <span className="dot-space" /> space.</li>
                <li>Click again to set the <b>head</b>.</li>
                <li><kbd>Alt</kbd>/<kbd>⌘</kbd>-click a stitch to work out of it.</li>
              </ol>
            </div>
          </aside>
        )}

        <div className="canvas-wrap">
          <CanvasView controllerRef={ctrl} onChange={sync} />
          {!readOnly && <StepToast chrome={chrome} onStart={onStart} started={started} />}
          {!readOnly && <Hint chrome={chrome} onStart={onStart} started={started} />}
        </div>

        <aside className="ed-right">
          <div className="rows-panel">
            <div className="panel-head"><div className="panel-title">Rows</div>{!readOnly && <Button size="small" icon={<PlusIcon />} onClick={() => { s.addRound(); ctrl.current?.resetInsert(); }}>Row</Button>}</div>
            <div className="rows-list">
              {startRow && (
                <div className={'row-item start-row' + (onStart ? ' on' : '')}>
                  <button className="row-main" onClick={() => { s.setActiveRound(startRow.id); ctrl.current?.resetInsert(); }}>
                    <b>Start</b><small>{pat.start ? STITCHES[pat.start].name : 'pick a starting stitch'}</small>
                  </button>
                </div>
              )}
              {working.map((r) => {
                const count = chainOrder(pat.stitches, r.id).filter((x) => !isStart(x.type)).length;
                const summary = summarizeRound(pat, r.id);
                return (
                  <div key={r.id} className={'row-item' + (r.id === pat.activeRound ? ' on' : '')}>
                    <button className="row-main" onClick={() => { s.setActiveRound(r.id); ctrl.current?.resetInsert(); }}>
                      <b>{r.name}</b><small>{count ? summary : 'empty'}</small>
                    </button>
                    {!readOnly && <Dropdown trigger={['click']} menu={{
                      items: [
                        { key: 'rename', icon: <EditIcon />, label: 'Rename' },
                        ...(working.length > 1 ? [{ key: 'del', icon: <DeleteIcon />, label: 'Delete row', danger: true }] : []),
                      ],
                      onClick: ({ key }) => {
                        if (key === 'rename') setRename({ id: r.id, name: r.name });
                        else modal.confirm({ title: `Delete ${r.name} and its stitches?`, okText: 'Delete', okButtonProps: { danger: true }, onOk: () => { s.removeRound(r.id); ctrl.current?.resetInsert(); } });
                      },
                    }}>
                      <Button type="text" size="small" icon={<MoreIcon />} />
                    </Dropdown>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="ed-right-scroll">
            <div className="panel"><div className="panel-title">Selection</div><Inspector pat={pat} ctrl={ctrl} readOnly={readOnly} /></div>
            <div className="panel"><div className="panel-title">Legend</div><Legend pat={pat} /></div>
          </div>
        </aside>
      </div>

      <HelpModal open={help} onClose={() => setHelp(false)} />
      {exportOpen && <ExportModal pattern={pat} onClose={() => setExportOpen(false)} />}

      <Modal title="Rename row" open={!!rename} okText="Save" destroyOnHidden
        onOk={() => { if (rename) s.renameRound(rename.id, rename.name.trim() || 'Row'); setRename(null); }}
        onCancel={() => setRename(null)}>
        <Input value={rename?.name ?? ''} autoFocus onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })}
          onPressEnter={() => { if (rename) s.renameRound(rename.id, rename.name.trim() || 'Row'); setRename(null); }} />
      </Modal>
    </div>
  );
}

// The palette is contextual: on the Start row you pick a starting stitch; on any
// working row you pick a normal stitch.
function Palette({ pat, chrome, ctrl }: { pat: import('../core/types').Pattern; chrome: Chrome; ctrl: React.MutableRefObject<CanvasController | null>; }) {
  const s = useStore();
  const onStart = isStartRow(pat, pat.activeRound);
  if (onStart) {
    return (
      <div className="panel">
        <div className="panel-title">Start</div>
        <div className="chips">
          {START_ORDER.map((t) => (
            <button key={t} className={'chip' + (pat.start === t ? ' on' : '')} title={STITCHES[t].name}
              onClick={() => { s.setStart(t); ctrl.current?.setArmed('dc'); ctrl.current?.resetInsert(); }}>
              <Glyph type={t} /><span>{STITCHES[t].abbr}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-title">Stitches</div>
      <div className="chips">
        {STITCH_ORDER.map((t) => (
          <button key={t} className={'chip' + (chrome.mode === 'insert' && chrome.armed === t ? ' on' : '')} title={STITCHES[t].name}
            onClick={() => ctrl.current?.setArmed(t)}>
            <Glyph type={t} /><span>{STITCHES[t].abbr}</span>
            {STITCH_KEYS[t] && <kbd>{STITCH_KEYS[t]!.toUpperCase()}</kbd>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Inspector({ pat, ctrl, readOnly }: { pat: import('../core/types').Pattern; ctrl: React.MutableRefObject<CanvasController | null>; readOnly?: boolean; }) {
  const s = useStore();
  const sel = [...s.selection];
  const items = sel.map((id) => pat.stitches.find((x) => x.id === id)).filter(Boolean) as Stitch[];
  if (!items.length) return (
    <div className="muted small insp-empty">
      <p>{readOnly ? <>This is a <b>read-only</b> version. Click a stitch to inspect it.</> : <>Nothing selected. In <b>Select</b> mode, click a stitch or drag a box.</>}</p>
      <p>Selected stitches reveal their framework:</p>
      <ul className="insp-legend">
        <li><span className="sw" style={{ background: ORIGIN }} /> origin</li>
        <li><span className="sw" style={{ background: SPACE }} /> base / space</li>
        <li><span className="sw" style={{ background: SELECT }} /> head</li>
      </ul>
    </div>
  );
  const first = items[0]!;
  const sameType = items.every((x) => x.type === first.type);
  const post = isRealStitch(first.type) && first.type !== 'ch';
  const chains = items.filter((x) => x.type === 'ch');
  const allAuto = chains.length > 0 && chains.every((x) => x.auto !== false);
  return (
    <div className="inspector">
      <p className="muted small">{items.length} stitch{items.length > 1 ? 'es' : ''} selected</p>
      <label className="field"><span>Type</span>
        <Select size="small" disabled={readOnly} value={sameType ? first.type : undefined} placeholder="(mixed)" style={{ width: '100%' }}
          onChange={(v) => s.updateSelection({ type: v })}
          options={STITCH_ORDER.map((t) => ({
            value: t,
            label: <span className="type-opt"><Glyph type={t} size={16} /> {STITCHES[t].name}</span>,
          }))} />
      </label>
      <label className="field"><span>Colour</span>
        <ColorPicker value={first.color || INK} disabled={readOnly} onChangeComplete={(c) => s.updateSelection({ color: c.toHexString() })}
          allowClear onClear={() => s.updateSelection({ color: null })} showText />
      </label>
      {post && (
        <label className="field"><span>Length</span>
          <InputNumber size="small" min={10} max={70} disabled={readOnly} style={{ width: '100%' }}
            value={Math.round(first.len ?? defaultLen(first.type))}
            onChange={(v) => { if (typeof v === 'number') s.updateSelection({ len: v }); }} />
        </label>
      )}
      {chains.length > 0 && (
        <label className="field row"><span>Auto-position chain{chains.length > 1 ? 's' : ''}</span>
          <Switch size="small" disabled={readOnly} checked={allAuto} onChange={(v) => s.setChainAuto(v)} />
        </label>
      )}
      {!readOnly && <div className="insp-acts">
        <Tooltip title="Rotate −15°"><Button size="small" icon={<RotateLeftIcon />} onClick={() => s.rotateSelectionBy(-15)} /></Tooltip>
        <Tooltip title="Rotate +15°"><Button size="small" icon={<RotateRightIcon />} onClick={() => s.rotateSelectionBy(15)} /></Tooltip>
        <Tooltip title="Flip the selection horizontally"><Button size="small" icon={<MirrorIcon />} onClick={() => s.mirrorSelection()}>Mirror</Button></Tooltip>
        {items.length === 1 && <Button size="small" icon={<OriginIcon />} onClick={() => { ctrl.current?.setMode('insert'); ctrl.current?.setOrigin(first.id); }}>Set as origin</Button>}
        <Button size="small" danger icon={<DeleteIcon />} onClick={() => s.deleteSelection()}>Delete</Button>
      </div>}
    </div>
  );
}

function Legend({ pat }: { pat: import('../core/types').Pattern }) {
  const seen = usedTypes(pat.stitches);
  if (!seen.length) return <p className="muted small">Place a stitch to build the legend.</p>;
  return (
    <div className="legend">
      {seen.map((t) => (
        <div key={t} className="legend-row"><Glyph type={t} size={26} /><span>{STITCHES[t].name}{STITCHES[t].abbr ? ` (${STITCHES[t].abbr})` : ''}</span></div>
      ))}
    </div>
  );
}

function ExportModal({ pattern, onClose }: { pattern: import('../core/types').Pattern; onClose: () => void }) {
  const [format, setFormat] = useState<'svg' | 'png' | 'pdf'>('svg');
  const [title, setTitle] = useState(true);
  const [legend, setLegend] = useState(true);
  const [bg, setBg] = useState<'white' | 'transparent'>('white');
  const [scale, setScale] = useState(3);

  const doExport = () => {
    if (format === 'svg') exportPatternSVG(pattern, { title, legend, background: bg });
    else if (format === 'png') exportPatternPNG(pattern, { title, legend, background: bg, scale });
    else printPattern(pattern, { title, legend });
    onClose();
  };

  return (
    <Modal title="Export pattern" open okText="Export" onOk={doExport} onCancel={onClose} destroyOnHidden>
      <div className="export-form">
        <label className="field"><span>Format</span>
          <Segmented block value={format} onChange={(v) => setFormat(v as 'svg' | 'png' | 'pdf')}
            options={[{ label: 'SVG', value: 'svg' }, { label: 'PNG', value: 'png' }, { label: 'Printable PDF', value: 'pdf' }]} />
        </label>
        <label className="field check"><Switch size="small" checked={title} onChange={setTitle} /> Include title</label>
        <label className="field check"><Switch size="small" checked={legend} onChange={setLegend} /> Include legend</label>
        {format !== 'pdf' && (
          <label className="field"><span>Background</span>
            <Segmented value={bg} onChange={(v) => setBg(v as 'white' | 'transparent')}
              options={[{ label: 'White', value: 'white' }, { label: 'Transparent', value: 'transparent' }]} />
          </label>
        )}
        {format === 'png' && (
          <label className="field"><span>Resolution</span>
            <Segmented value={scale} onChange={(v) => setScale(v as number)}
              options={[{ label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '3×', value: 3 }]} />
          </label>
        )}
        {format === 'pdf' && <p className="muted small">Print-ready — this pattern's chart, legend and written instructions. (For the whole project with QR-coded links, use “Printable PDF” on the project page.)</p>}
      </div>
    </Modal>
  );
}

function StepToast({ chrome, onStart, started }: { chrome: Chrome; onStart: boolean; started: boolean }) {
  if (onStart) return <div className="toast">Pick a starting stitch — magic ring, double ring, chain ring or slip knot</div>;
  if (!started) return <div className="toast">Pick a starting stitch first (the Start row)</div>;
  if (chrome.mode !== 'insert') return null;
  const name = STITCHES[chrome.armed]?.name || 'stitch';
  let text: string;
  if (chrome.armed === 'ch') text = `Click to place a ${name} flowing off the origin`;
  else if (chrome.phase === 'head') text = 'Click to set the head';
  else text = chrome.nextId ? `Inserting ${name} — pick a base` : `Pick a base for ${name} — a stitch or a space`;
  return <div className="toast">{text}</div>;
}

function Hint({ chrome, onStart, started }: { chrome: Chrome; onStart: boolean; started: boolean }) {
  let text: string;
  if (chrome.mode === 'pan') text = 'Pan mode — drag anywhere to move the canvas · scroll to zoom · press V or I to leave';
  else if (onStart || !started) text = 'Every stitch is worked out from the centre — pick a start to begin';
  else if (chrome.mode !== 'insert') text = 'Drag to move · drag empty space to box-select · scroll to zoom · hold Space to pan · press a stitch key to start';
  else if (chrome.armed === 'ch') text = 'Chains flow out of the origin (light blue) · Alt/⌘-click a stitch to work out of it · Esc to leave Insert';
  else if (chrome.phase === 'head') text = 'The bottom sits in the base; the top follows your cursor · Esc to redo the base';
  else text = 'Click a stitch head or an orange space · Alt/⌘-click a stitch to work out of it (insert after) · Esc to leave Insert';
  return <div className="hint">{text}</div>;
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal title="Designing a granny square" open={open} onCancel={onClose} footer={null} width={560}>
      <p>This editor recreates your crochet work. Every stitch <b>comes out of</b> an origin and is <b>worked into</b> a base — a stitch head or the space between two stitches. Build on even bases and the chart stays even, no symmetry maths required.</p>
      <ol className="help-steps">
        <li><b>Start:</b> pick a centre (magic ring, etc.). It drops into the Start row.</li>
        <li><b>Row:</b> choose which row you're working in the Rows panel (top-right).</li>
        <li><b>Insert:</b> press <kbd>I</kbd> or a stitch key (<kbd>D</kbd>=dc). The origin is <span className="sw" style={{ background: ORIGIN }} /> light blue.</li>
        <li><b>Base:</b> orange dots <span className="sw" style={{ background: SPACE }} /> mark spaces. Click a space or a stitch head, then click again to set the head.</li>
        <li><b>Chains:</b> flow off the origin in one click and auto-align evenly between neighbours.</li>
        <li><b>Insert after:</b> <kbd>Alt</kbd>/<kbd>⌘</kbd>-click a stitch to set it as origin; the next stitch turns <span className="sw" style={{ background: NEXT }} /> purple and everything after greys out.</li>
      </ol>
      <Title level={5}>Keys</Title>
      <table className="keys">
        <tbody>
          <tr><td><kbd>V</kbd> / <kbd>I</kbd></td><td>Select / Insert mode</td></tr>
          <tr><td><kbd>S H D T E</kbd></td><td>arm sc / hdc / dc / tr / dtr</td></tr>
          <tr><td><kbd>C</kbd> / <kbd>L</kbd></td><td>arm chain / slip stitch</td></tr>
          <tr><td><kbd>R</kbd> / <kbd>⇧R</kbd></td><td>rotate selection ±15°</td></tr>
          <tr><td>Arrows</td><td>nudge selection</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>step back / deselect</td></tr>
          <tr><td><kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd></td><td>undo / redo</td></tr>
        </tbody>
      </table>
    </Modal>
  );
}
