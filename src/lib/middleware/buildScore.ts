import type { Dynamic, Measure, RawEvent, Score, ScoreNote, ScoreVoice } from "../types";
import { clipToArticulation, gainToDynamic } from "./dynamics";
import { getKey } from "../keys";
import { midiToKey } from "./pitch";
import { quantize, SLOTS, type QEvent } from "./quantize";
import { decompose } from "./rests";

export const MIDDLE_C = 60;
const REST_KEY = { treble: "b/4", bass: "d/3" } as const;

export interface Item {
  start: number;
  dur: number;
  midis: number[];
  ids: number[];
  gain?: number;
  clip?: number;
  /** dynamic to print on this item (set only where the dynamic changes, in global time order) */
  mark?: Dynamic;
}
type Staff = "treble" | "bass";

const newItem = (e: QEvent): Item => ({
  start: e.start,
  dur: e.dur,
  midis: [e.midi],
  ids: e.id === undefined ? [] : [e.id],
  gain: e.gain,
  clip: e.clip,
});

/** Greedy voice allocation: chords merge, overlapping material opens a new voice.
 *  Events must be sorted by (start, midi). */
export function allocateVoices(events: QEvent[]): Item[][] {
  const voices: Item[][] = [];
  for (const e of events) {
    let placed = false;
    for (const v of voices) {
      const last = v[v.length - 1];
      if (last.start === e.start && last.dur === e.dur) {
        last.midis.push(e.midi); // chord
        if (e.id !== undefined) last.ids.push(e.id);
        placed = true;
        break;
      }
      if (last.start + last.dur <= e.start) {
        v.push(newItem(e));
        placed = true;
        break;
      }
    }
    if (!placed) voices.push([newItem(e)]);
  }
  return voices;
}

/** A dynamic is printed only where it changes, walking all items in global time order. */
export function markDynamics(groups: Item[][][]): void {
  const all = groups.flat(2).sort((a, b) => a.start - b.start || a.midis[0] - b.midis[0]);
  let cur: Dynamic | undefined;
  for (const it of all) {
    it.mark = undefined;
    const d = gainToDynamic(it.gain);
    if (d && d !== cur) {
      it.mark = d;
      cur = d;
    }
  }
}

/** Build the notated voice for one measure from allocated items (with rests filling the gaps). */
function measureVoice(items: Item[], m: number, staff: Staff, fifths: number): ScoreVoice {
  const from = m * SLOTS;
  const to = from + SLOTS;
  const out: ScoreNote[] = [];
  let cursor = from;
  const rest = (a: number, b: number) => {
    for (const p of decompose(a - from, b - a, "rest")) {
      out.push({ ids: [], keys: [REST_KEY[staff]], duration: p.duration, dots: p.dots, isRest: true, slot: p.slot });
    }
  };
  for (const it of items) {
    const s = Math.max(it.start, from);
    const e = Math.min(it.start + it.dur, to);
    if (e <= from || s >= to) continue;
    if (s > cursor) rest(cursor, s);
    const pieces = decompose(s - from, e - s);
    const keys = [...new Set(it.midis)].sort((a, b) => a - b).map((x) => midiToKey(x, fifths));
    const crossesBar = it.start + it.dur > to;
    pieces.forEach((p, i) => {
      const n: ScoreNote = { ids: it.ids, keys, duration: p.duration, dots: p.dots, isRest: false, slot: p.slot };
      if (i === 0 && it.start >= from) {
        n.dynamic = it.mark;
        n.articulation = clipToArticulation(it.clip);
      }
      if (i < pieces.length - 1 || crossesBar) n.tieNext = true;
      out.push(n);
    });
    cursor = e;
  }
  if (cursor < to) rest(cursor, to);
  return out;
}

/** Quantised events -> measures. `grand` forces (true/false) or auto-detects (undefined) the grand staff. */
export function buildScoreFromQ(events: QEvent[], cycles: number, opts: { grand?: boolean; key?: string } = {}): Score {
  const key = getKey(opts.key);
  const sorted = [...events].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const grand = opts.grand ?? sorted.some((e) => e.midi < MIDDLE_C);
  const split: Record<Staff, QEvent[]> = { treble: [], bass: [] };
  for (const e of sorted) split[grand && e.midi < MIDDLE_C ? "bass" : "treble"].push(e);

  const voices: Record<Staff, Item[][]> = {
    treble: allocateVoices(split.treble),
    bass: grand ? allocateVoices(split.bass) : [],
  };
  markDynamics([voices.treble, voices.bass]);

  const measures: Measure[] = [];
  for (let m = 0; m < cycles; m++) {
    const build = (staff: Staff): ScoreVoice[] => {
      const list = voices[staff];
      const built = (list.length ? list : [[]]).map((v, i) => ({ i, voice: measureVoice(v, m, staff, key.fifths) }));
      // keep voice 0 always; drop extra voices that are silent in this measure
      return built.filter((b) => b.i === 0 || b.voice.some((n) => !n.isRest)).map((b) => b.voice);
    };
    measures.push({ treble: build("treble"), bass: grand ? build("bass") : null });
  }
  return { measures, grand, keyId: key.id, fifths: key.fifths };
}

/** Full pipeline: raw Strudel events -> quantised, voiced, rest-filled measures. */
export function buildScore(raw: RawEvent[], cycles: number, opts: { grand?: boolean; key?: string } = {}): Score {
  return buildScoreFromQ(quantize(raw, cycles), cycles, opts);
}
