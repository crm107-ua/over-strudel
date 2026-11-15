import type { RawEvent } from "../types";
import { pitchOf } from "./pitch";

/** Grid: 16 slots per cycle = one 4/4 measure of sixteenth notes. */
export const SLOTS = 16;

export interface QEvent {
  id?: number;
  start: number; // absolute slot
  dur: number; // slots, >= 1
  midi: number;
  gain?: number;
  clip?: number;
}

const toSlots = (f: { n: number; d: number }) => Math.round((f.n / f.d) * SLOTS);

/** Snap Strudel fractional events to the nearest sixteenth; drops unpitched events. */
export function quantize(events: RawEvent[], cycles: number): QEvent[] {
  const limit = cycles * SLOTS;
  const out: QEvent[] = [];
  for (const e of events) {
    const midi = pitchOf(e.value);
    if (midi === null) continue;
    const start = toSlots(e.begin);
    if (start < 0 || start >= limit) continue;
    const end = Math.min(limit, Math.max(start + 1, toSlots(e.end)));
    out.push({ start, dur: end - start, midi, gain: e.gain, clip: e.clip });
  }
  return out.sort((a, b) => a.start - b.start || a.midi - b.midi);
}
