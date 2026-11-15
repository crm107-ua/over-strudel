import { spell } from "../keys";

const BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

/** Strudel note value (name like "c#4"/"eb3"/"cs4" or midi number) -> midi, or null if unpitched. */
export function toMidi(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  const m = /^([a-gA-G])([#bs]*)(-?\d+)?$/.exec(v.trim());
  if (!m) return null;
  let pc = BASE[m[1].toLowerCase()];
  for (const c of m[2]) pc += c === "b" ? -1 : 1; // '#' and 's' = sharp
  const oct = m[3] === undefined ? 3 : parseInt(m[3], 10); // Strudel default octave is 3
  return (oct + 1) * 12 + pc;
}

/** midi -> Strudel note name ("c#4"). */
export function midiToName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** midi -> VexFlow key ("c#/4"; "db/4" in flat keys). */
export function midiToKey(midi: number, fifths = 0): string {
  return spell(midi, fifths);
}

/** Extract the pitch from a Strudel hap value (object with note/n, or primitive). */
export function pitchOf(value: unknown): number | null {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return toMidi(o.note ?? o.n);
  }
  return toMidi(value);
}
