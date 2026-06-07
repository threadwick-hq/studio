import { glyphSVG } from '../core/render';
import { STITCHES } from '../core/symbols';
import type { StitchType } from '../core/types';

export function Glyph({ type, size = 34, color }: { type: StitchType; size?: number; color?: string }) {
  return (
    <span
      className="glyph-wrap"
      role="img"
      aria-label={STITCHES[type]?.name ?? type}
      dangerouslySetInnerHTML={{ __html: glyphSVG(type, size, color) }}
    />
  );
}
