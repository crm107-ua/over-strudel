import { MAX_MIDI, MIN_MIDI } from "./doc";

/** Pure geometry for editing the score with the pointer (pixels <-> measure / sixteenth / pitch). */
export type StaffName = "treble" | "bass";

export interface HitMeasure {
  sys: number;
  /** left edge and width of the measure's staff */
  x: number;
  w: number;
  /** [slot, x] control points of the first treble voice; slot 16 = right barline */
  pts: [number, number][];
}
export interface HitSystem {
  /** y of the treble stave (top line is at +40, bottom line at +80) */
  staveY: number;
  bassY: number | null;
}
export interface Geometry {
  systems: HitSystem[];
  measures: HitMeasure[];
}

export interface Located {
  measure: number;
  /** nearest sixteenth inside the measure, 0..15 */
  slot: number;
  staff: StaffName;
  /** natural (white-key) midi under the pointer */
  midi: number;
  x: number;
  y: number;
}

const NAT = [0, 2, 4, 5, 7, 9, 11];
const BASE: Record<StaffName, number> = { treble: 30 /* E4 */, bass: 18 /* G2 */ };
const STEP = 5; // px per diatonic step
const BOTTOM = 80; // bottom line offset from the stave y
const HEAD = 12; // notehead width: pointer x is compared to the head centre

export const diatonicToMidi = (d: number) => 12 * (Math.floor(d / 7) + 1) + NAT[((d % 7) + 7) % 7];
export const midiToDiatonic = (m: number) => {
  const pc = ((m % 12) + 12) % 12;
  let idx = 0;
  for (let i = 0; i < 7; i++) if (NAT[i] <= pc) idx = i;
  return (Math.floor(m / 12) - 1) * 7 + idx;
};

export const yOfMidi = (midi: number, staff: StaffName, staveY: number) =>
  staveY + BOTTOM - (midiToDiatonic(midi) - BASE[staff]) * STEP;

const clampMidi = (m: number) => Math.max(MIN_MIDI, Math.min(MAX_MIDI, m));

/** slot (fractional) -> x, linear between the formatted note positions. */
export function xOfSlot(pts: [number, number][], slot: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, xa] = pts[i];
    const [b, xb] = pts[i + 1];
    if (slot >= a && slot < b) return b === a ? xa : xa + ((xb - xa) * (slot - a)) / (b - a);
  }
  return pts[pts.length - 1][1];
}

/** x -> slot (fractional) inverse of xOfSlot. */
export function slotOfX(pts: [number, number][], x: number): number {
  if (!pts.length || x <= pts[0][1]) return 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, xa] = pts[i];
    const [b, xb] = pts[i + 1];
    if (x >= xa && x < xb) return xb === xa ? a : a + ((x - xa) * (b - a)) / (xb - xa);
  }
  return 16;
}

export function locate(geo: Geometry, x: number, y: number): Located | null {
  const si = geo.systems.findIndex((s) => y >= s.staveY + 5 && y <= (s.bassY ?? s.staveY) + 105);
  if (si < 0) return null;
  const sys = geo.systems[si];
  const inSys = geo.measures.map((m, i) => ({ m, i })).filter((r) => r.m && r.m.sys === si); // only the shown page has geometry
  if (!inSys.length) return null;
  const hit = inSys.find((r) => x >= r.m.x && x < r.m.x + r.m.w) ?? (x < inSys[0].m.x ? inSys[0] : inSys[inSys.length - 1]);
  const staff: StaffName =
    sys.bassY !== null && y >= (sys.staveY + BOTTOM + sys.bassY + 40) / 2 ? "bass" : "treble";
  const y0 = staff === "bass" ? sys.bassY! : sys.staveY;
  const midi = clampMidi(diatonicToMidi(BASE[staff] + Math.round((y0 + BOTTOM - y) / STEP)));
  const slot = Math.max(0, Math.min(15, Math.floor(slotOfX(hit.m.pts, x - HEAD / 2) + 0.5)));
  return { measure: hit.i, slot, staff, midi, x, y };
}

/**
 * Pixel centre of the notehead for an absolute slot and pitch (ghost / drag preview, note menu anchor).
 * `null` when that measure is not on the page being shown.
 */
export function pixelOf(geo: Geometry, absSlot: number, midi: number, grand: boolean): { x: number; y: number } | null {
  const measure = Math.floor(absSlot / 16);
  const m = geo.measures[measure];
  if (!m) return null;
  const sys = geo.systems[m.sys];
  const staff: StaffName = grand && midi < 60 && sys.bassY !== null ? "bass" : "treble";
  const y = yOfMidi(midi, staff, staff === "bass" ? sys.bassY! : sys.staveY);
  return { x: xOfSlot(m.pts, absSlot - measure * 16) + HEAD / 2, y };
}
