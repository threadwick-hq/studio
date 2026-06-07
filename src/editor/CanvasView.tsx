import { useEffect, useRef, type MutableRefObject } from 'react';
import { initCanvas, type CanvasController } from '../core/editorCanvas';
import { store } from '../core/store';

// Mounts the imperative canvas controller into React. The controller draws the
// <svg> directly and subscribes to the store itself (RAF-coalesced), so the
// chart redraws on data changes WITHOUT re-rendering the React tree. React only
// owns the element's lifecycle here.
export function CanvasView({ controllerRef, onChange }: {
  controllerRef: MutableRefObject<CanvasController | null>;
  onChange: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // keep the latest onChange in a ref so the mount-once effect never goes stale
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const c = initCanvas(store, svg, { onChange: () => onChangeRef.current() });
    controllerRef.current = c;
    onChangeRef.current();
    const unsub = store.subscribe(() => c.invalidate());
    const raf = requestAnimationFrame(() => c.fit());
    return () => { cancelAnimationFrame(raf); unsub(); c.destroy(); controllerRef.current = null; };
  }, [controllerRef]);

  return <svg ref={svgRef} id="ed-canvas" className="ed-canvas" role="img" aria-label="Pattern chart" xmlns="http://www.w3.org/2000/svg" />;
}
