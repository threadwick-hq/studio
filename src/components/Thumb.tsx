import { chartToSVG, glyphSVG } from '../core/render';
import type { Pattern } from '../core/types';

// A small, chrome-free chart preview for a card (or a placeholder glyph).
export function Thumb({ pattern }: { pattern?: Pattern }) {
  if (pattern && pattern.stitches.length) {
    const svg = chartToSVG(pattern, { legend: false, title: '', background: null, padding: 12 });
    return <div className="thumb" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return <div className="thumb thumb-empty" dangerouslySetInnerHTML={{ __html: glyphSVG('mr', 40, '#c8bfae') }} />;
}
