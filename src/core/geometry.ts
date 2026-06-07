// Pure 2D math: angles, polar/cartesian, rotation.
//
// Coordinate convention: screen-style, origin at the chart centre (0,0),
// +x right, +y DOWN. Angles in degrees from +x, increasing clockwise.

import type { Point } from './types';

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

export function toPolar(x: number, y: number): { r: number; a: number } {
  return { r: Math.hypot(x, y), a: rad2deg(Math.atan2(y, x)) };
}

export function fromPolar(r: number, aDeg: number): Point {
  const a = deg2rad(aDeg);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

export function norm360(a: number): number {
  a %= 360;
  return a < 0 ? a + 360 : a;
}

// Rotation (deg) so a symbol whose local "up" is (0,-1) points radially outward.
export function radialRotation(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  return norm360(rad2deg(Math.atan2(y, x)) + 90);
}

// Rotate a point about the origin by `deg` (clockwise in y-down space).
export function rotatePoint(x: number, y: number, deg: number): Point {
  const a = deg2rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
