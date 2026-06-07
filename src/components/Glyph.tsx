import { glyphSVG } from '../core/render';
import type { StitchType } from '../core/types';

export function Glyph({ type, size = 34, color }: { type: StitchType; size?: number; color?: string }) {
  return <span className="glyph-wrap" dangerouslySetInnerHTML={{ __html: glyphSVG(type, size, color) }} />;
}
