// geometry.js — pure 2D math: angles, polar/cartesian, snapping, rigid transforms.
//
// Coordinate convention: screen-style, origin at the chart center (0,0),
// +x right, +y DOWN. Angles are in degrees measured from +x, increasing
// clockwise (which matches SVG's rotate() direction in a y-down space).

export const TAU = Math.PI * 2;
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function toPolar(x, y) {
  return { r: Math.hypot(x, y), a: rad2deg(Math.atan2(y, x)) };
}

export function fromPolar(r, aDeg) {
  const a = deg2rad(aDeg);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

export function norm360(a) {
  a %= 360;
  return a < 0 ? a + 360 : a;
}

export function norm180(a) {
  a = norm360(a);
  return a > 180 ? a - 360 : a;
}

// Rotation (deg) needed so a symbol whose local "up" is (0,-1) ends up
// pointing radially outward from the center at the point (x,y).
export function radialRotation(x, y) {
  if (x === 0 && y === 0) return 0;
  return norm360(rad2deg(Math.atan2(y, x)) + 90);
}

// Rotate a point about the origin by `deg` (clockwise in y-down space).
export function rotatePoint(x, y, deg) {
  const a = deg2rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

// Reflect a point across a line through the origin at angle `axisDeg`.
export function reflectPoint(x, y, axisDeg) {
  const { r, a } = toPolar(x, y);
  return fromPolar(r, 2 * axisDeg - a);
}

export function snapTo(value, step, offset = 0) {
  if (!step) return value;
  return Math.round((value - offset) / step) * step + offset;
}

// Snap a cartesian point onto a polar lattice: nearest ring radius from a
// list, and/or nearest spoke angle (multiples of spokeStep).
export function snapPolar(x, y, opts = {}) {
  const {
    rings,
    spokeStep,
    spokeOffset = 0,
    snapRing = true,
    snapSpoke = true,
  } = opts;
  let { r, a } = toPolar(x, y);
  if (snapRing && rings && rings.length) {
    let best = rings[0];
    let bd = Math.abs(r - rings[0]);
    for (const rr of rings) {
      const d = Math.abs(r - rr);
      if (d < bd) {
        bd = d;
        best = rr;
      }
    }
    r = best;
  }
  if (snapSpoke && spokeStep) {
    a = snapTo(a, spokeStep, spokeOffset);
  }
  return fromPolar(r, a);
}

export function snapGrid(x, y, step, offset = 0) {
  return { x: snapTo(x, step, offset), y: snapTo(y, step, offset) };
}
