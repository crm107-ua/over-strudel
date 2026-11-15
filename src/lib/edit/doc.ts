import type { Articulation, Dynamic } from "../types";
import { MIDDLE_C } from "../middleware/buildScore";
import { clipToArticulation, gainToDynamic } from "../middleware/dynamics";
import type { QEvent } from "../middleware/quantize";
import { SLOTS } from "../middleware/quantize";

/**
 * The editable document: a flat list of note events on a sixteenth-note grid.
 * Rests are never stored (they are derived), so every measure always adds up exactly.
 * Both the code (via evaluation) and the score editor read/write this same model.
 */
export interface DocEvent {
  id: number;
  start: number; // absolute slot (16 per measure)
  dur: number; // slots, >= 1
  midi: number;
  gain?: number;
  clip?: number;
}
export interface Doc {
  measures: number;
  events: DocEvent[];
}

export const DYN_GAIN: Record<Dynamic, number> = { p: 0.4, mf: 0.7, f: 0.95 };
export const ART_CLIP: Record<Articulation, number> = { staccato: 0.4, tenuto: 1.5 };
export const MIN_MIDI = 21;
export const MAX_MIDI = 108;

const groupKey = (e: DocEvent) => `${e.start}:${e.dur}`;

let counter = 1;
export const newId = () => counter++;

export const totalSlots = (doc: Pick<Doc, "measures">) => doc.measures * SLOTS;
const order = (a: DocEvent, b: DocEvent) => a.start - b.start || a.midi - b.midi || a.dur - b.dur;
export type StaffName = "treble" | "bass";
export const staffOf = (midi: number, grand: boolean): StaffName => (grand && midi < MIDDLE_C ? "bass" : "treble");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function docFromQ(events: QEvent[], measures: number): Doc {
  return normalize({
    measures,
    events: events.map((e) => ({ id: newId(), start: e.start, dur: e.dur, midi: e.midi, gain: e.gain, clip: e.clip })),
  });
}

export function docToQ(doc: Doc): QEvent[] {
  return [...doc.events].sort(order).map((e) => ({ ...e }));
}

/** Clamp to the grid/range, drop invalid events, de-duplicate identical notes, sort. */
export function normalize(doc: Doc): Doc {
  const total = totalSlots(doc);
  const seen = new Set<string>();
  const events: DocEvent[] = [];
  for (const e of [...doc.events].sort(order)) {
    if (e.start < 0 || e.start >= total) continue;
    const dur = Math.min(Math.max(1, Math.round(e.dur)), total - e.start);
    const midi = clamp(Math.round(e.midi), MIN_MIDI, MAX_MIDI);
    const key = `${e.start}:${dur}:${midi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ ...e, dur, midi });
  }
  // invariant: a chord (same start + length) has ONE dynamic and ONE articulation - the lowest note's
  const first = new Map<string, DocEvent>();
  for (const e of events) if (!first.has(groupKey(e))) first.set(groupKey(e), e);
  return {
    measures: doc.measures,
    events: events.map((e) => {
      const f = first.get(groupKey(e))!;
      return f === e ? e : { ...e, gain: f.gain, clip: f.clip };
    }),
  };
}

/** The gain a new note at `start` should inherit so no accidental dynamic mark appears. */
function inheritedGain(events: DocEvent[], start: number): number | undefined {
  let best: DocEvent | undefined;
  for (const e of events) if (e.start <= start && (!best || order(e, best) > 0)) best = e;
  return best?.gain;
}

/** Insert `ev`; unless `layer`, overwrite what it overlaps on the same staff (trim / remove). Chord mates stay. */
function place(events: DocEvent[], ev: DocEvent, layer: boolean, grand: boolean): DocEvent[] {
  const end = ev.start + ev.dur;
  const out: DocEvent[] = [];
  for (const e of events) {
    const overlaps = e.start < end && e.start + e.dur > ev.start;
    const sameStaff = staffOf(e.midi, grand) === staffOf(ev.midi, grand);
    if (layer || !overlaps || !sameStaff || (e.start === ev.start && e.dur === ev.dur)) {
      out.push(e);
    } else if (e.start < ev.start) {
      out.push({ ...e, dur: ev.start - e.start }); // trim the tail
    } // else: starts inside the new note -> removed
  }
  // landing on an existing chord: the chord keeps its dynamic / articulation
  const mate = out.find((e) => e.start === ev.start && e.dur === ev.dur && e.midi !== ev.midi);
  out.push(mate ? { ...ev, gain: mate.gain, clip: mate.clip } : ev);
  return out;
}

export interface EditResult {
  doc: Doc;
  /** ids that should be selected after the edit */
  ids: number[];
}

export function addNote(
  doc: Doc,
  n: { start: number; midi: number; dur: number; layer?: boolean },
  grand: boolean,
): EditResult {
  const total = totalSlots(doc);
  const start = clamp(Math.round(n.start), 0, total - 1);
  const dur = clamp(Math.round(n.dur), 1, total - start);
  const midi = clamp(Math.round(n.midi), MIN_MIDI, MAX_MIDI);
  const dup = doc.events.find((e) => e.start === start && e.dur === dur && e.midi === midi);
  if (dup) return { doc, ids: [dup.id] };
  const mate = doc.events.find((e) => e.start === start && e.dur === dur);
  // a chord shares one dynamic and one articulation (that is all the code can express per step)
  const ev: DocEvent = { id: newId(), start, dur, midi, gain: mate ? mate.gain : inheritedGain(doc.events, start), clip: mate?.clip };
  return { doc: normalize({ ...doc, events: place(doc.events, ev, !!n.layer, grand) }), ids: [ev.id] };
}

export function deleteEvents(doc: Doc, ids: number[]): Doc {
  const s = new Set(ids);
  return { ...doc, events: doc.events.filter((e) => !s.has(e.id)) };
}

/** Move selected events (shared start/pitch shift), clamped to the grid; they overwrite what they land on. */
export function moveEvents(doc: Doc, ids: number[], dStart: number, dMidi: number, grand: boolean): EditResult {
  const sel = doc.events.filter((e) => ids.includes(e.id));
  if (!sel.length) return { doc, ids };
  const total = totalSlots(doc);
  const ds = clamp(dStart, -Math.min(...sel.map((e) => e.start)), Math.min(...sel.map((e) => total - e.start - e.dur)));
  const dm = clamp(dMidi, MIN_MIDI - Math.min(...sel.map((e) => e.midi)), MAX_MIDI - Math.max(...sel.map((e) => e.midi)));
  let events = doc.events.filter((e) => !ids.includes(e.id));
  for (const e of sel) events = place(events, { ...e, start: e.start + ds, midi: e.midi + dm }, false, grand);
  return { doc: normalize({ ...doc, events }), ids };
}

/** Change the length of selected events; growing overwrites what follows. */
export function setDuration(doc: Doc, ids: number[], dur: number, grand: boolean): EditResult {
  const total = totalSlots(doc);
  let events = doc.events.filter((e) => !ids.includes(e.id));
  for (const e of doc.events.filter((x) => ids.includes(x.id))) {
    events = place(events, { ...e, dur: clamp(Math.round(dur), 1, total - e.start) }, false, grand);
  }
  return { doc: normalize({ ...doc, events }), ids };
}

export function nudgeDuration(doc: Doc, ids: number[], delta: number, grand: boolean): EditResult {
  const total = totalSlots(doc);
  let events = doc.events.filter((e) => !ids.includes(e.id));
  for (const e of doc.events.filter((x) => ids.includes(x.id))) {
    events = place(events, { ...e, dur: clamp(e.dur + delta, 1, total - e.start) }, false, grand);
  }
  return { doc: normalize({ ...doc, events }), ids };
}

/** Transpose without overwriting anything (layering) so no material is lost. */
export function transpose(doc: Doc, ids: number[], semitones: number): EditResult {
  const sel = doc.events.filter((e) => ids.includes(e.id));
  if (!sel.length) return { doc, ids };
  const dm = clamp(semitones, MIN_MIDI - Math.min(...sel.map((e) => e.midi)), MAX_MIDI - Math.max(...sel.map((e) => e.midi)));
  return {
    doc: normalize({ ...doc, events: doc.events.map((e) => (ids.includes(e.id) ? { ...e, midi: e.midi + dm } : e)) }),
    ids,
  };
}

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * Apply an accidental to the selected notes. Black keys are always spelled as sharps, so a flat on a black key
 * is already what it sounds like (no-op); a natural on a black key lowers it to its letter.
 */
export function setAccidental(doc: Doc, ids: number[], value: -1 | 0 | 1): EditResult {
  const events = doc.events.map((e) => {
    if (!ids.includes(e.id)) return e;
    const black = BLACK.has(((e.midi % 12) + 12) % 12);
    let midi = e.midi;
    if (black) midi = value === 0 ? e.midi - 1 : e.midi;
    else midi = e.midi + value;
    return { ...e, midi: clamp(midi, MIN_MIDI, MAX_MIDI) };
  });
  return { doc: normalize({ ...doc, events }), ids };
}

/** Transpose every note of the piece (clamped to the piano range, nothing is lost: out-of-range shifts are reduced). */
export function transposeAll(doc: Doc, semitones: number): Doc {
  if (!doc.events.length || !semitones) return doc;
  const lo = Math.min(...doc.events.map((e) => e.midi));
  const hi = Math.max(...doc.events.map((e) => e.midi));
  const dm = clamp(semitones, MIN_MIDI - lo, MAX_MIDI - hi);
  return normalize({ ...doc, events: doc.events.map((e) => ({ ...e, midi: e.midi + dm })) });
}

/** How far sequential entry has written in each measure, per staff: `${staff}:${measure}` -> absolute slot.
 *  Needed because a rest is not stored: after "note, rest" the measure is complete although it ends in a gap. It is
 *  forgotten by any other edit (delete, move...), so the space you free is free again. */
export type Reach = Record<string, number>;
export const reachKey = (staff: StaffName, measure: number) => `${staff}:${measure}`;

/**
 * First free sixteenth of a measure on a staff: the first slot, from the written reach on, that no note covers.
 * In normal writing that is "right after the last note"; after you delete a note it is the hole you left.
 */
export function firstFree(doc: Doc, measure: number, staff: StaffName, grand: boolean, reach: Reach = {}): number {
  const from = measure * 16;
  const end = from + 16;
  let p = Math.min(end, Math.max(from, reach[reachKey(staff, measure)] ?? from));
  const here = doc.events.filter((e) => staffOf(e.midi, grand) === staff && e.start < end && e.start + e.dur > from);
  for (let moved = true; moved && p < end; ) {
    moved = false;
    for (const e of here) {
      if (e.start <= p && e.start + e.dur > p) {
        p = Math.min(end, e.start + e.dur);
        moved = true;
      }
    }
  }
  return p;
}

/**
 * Enter a REST: the time range becomes silent on that staff (notes there are removed / shortened). Rests are
 * implicit in the document, so this is exactly "a note-entry step that writes nothing".
 */
export function clearRange(doc: Doc, start: number, len: number, staff: StaffName, grand: boolean): Doc {
  const end = start + len;
  const events: DocEvent[] = [];
  for (const e of doc.events) {
    const overlaps = e.start < end && e.start + e.dur > start;
    if (!overlaps || staffOf(e.midi, grand) !== staff) events.push(e);
    else if (e.start < start) events.push({ ...e, dur: start - e.start });
  }
  return { ...doc, events };
}

export interface EntryTarget {
  /** absolute slot where the element goes */
  start: number;
  /** its length: the wanted one, cut to the free space */
  dur: number;
  measure: number;
  /** set when the measure was full: the last note (these ids) is cut to `keepDur` to make room for the new element */
  split?: { ids: number[]; keepDur: number };
}

/**
 * Where the next sequentially entered element goes. Always inside the measure you work in (the clicked one, or the
 * cursor's for keyboard entry); it never leaves it and never creates measures.
 *
 *  1. Free space: the element goes to the first free point of the measure (right after what is written, or into the
 *     hole you left by deleting a note), cut to the free space so it never overwrites what comes after it. An empty
 *     measure starts from its whole-note rest.
 *  2. Full measure: the LAST note is subdivided to make room - a whole note becomes two halves, the last half two
 *     quarters, and so on down to sixteenths (`null` only when nothing can be split any more).
 *
 * Only a cursor moved ON PURPOSE (`pinned`, Alt+click) writes at an arbitrary point, overwriting from there.
 */
export function entryTarget(
  doc: Doc, cursor: number, clickedMeasure: number | null, staff: StaffName, grand: boolean, wantDur: number, reach: Reach = {}, pinned = false,
): EntryTarget | null {
  const measure = clickedMeasure ?? Math.floor(cursor / SLOTS);
  if (measure < 0 || measure >= doc.measures) return null;
  const from = measure * SLOTS;
  const end = from + SLOTS;
  const want = Math.max(1, Math.round(wantDur));
  if (pinned && cursor >= from && cursor < end) return { start: cursor, dur: Math.min(want, end - cursor), measure };

  const c = firstFree(doc, measure, staff, grand, reach);
  const mine = doc.events.filter((e) => staffOf(e.midi, grand) === staff);
  if (c < end) {
    const next = mine.filter((e) => e.start > c && e.start < end).reduce((m, e) => Math.min(m, e.start), end);
    return { start: c, dur: Math.max(1, Math.min(want, next - c)), measure };
  }

  // full: subdivide the last note (the group that ends at the barline and starts inside this measure)
  const tail = mine.filter((e) => e.start >= from && e.start + e.dur === end);
  if (!tail.length) return null;
  const start = Math.max(...tail.map((e) => e.start));
  const d = end - start;
  if (d < 2) return null;
  const keep = floorFigure(d - 1); // the largest plain figure strictly shorter than the note
  return { start: start + keep, dur: d - keep, measure, split: { ids: tail.filter((e) => e.start === start).map((e) => e.id), keepDur: keep } };
}

/** Largest power of two (1,2,4,8,16) that fits in `n` slots: the longest plain figure still available. */
export const floorFigure = (n: number) => [16, 8, 4, 2, 1].find((f) => f <= n) ?? 1;

export const MAX_MEASURES = 64;

/** Append an empty measure at the end. */
export function addMeasure(doc: Doc): Doc {
  return doc.measures >= MAX_MEASURES ? doc : { ...doc, measures: doc.measures + 1 };
}

/** Remove the last measure; notes starting in it are dropped and notes crossing into it are shortened. */
export function removeLastMeasure(doc: Doc): Doc {
  if (doc.measures <= 1) return doc;
  return normalize({ ...doc, measures: doc.measures - 1 });
}

/** Merge each selected note with the same-pitch note that starts exactly where it ends. */
export function joinNext(doc: Doc, ids: number[]): EditResult {
  let events = doc.events;
  const out: number[] = [];
  for (const id of ids) {
    const a = events.find((e) => e.id === id);
    if (!a) continue;
    const b = events.find((e) => e.midi === a.midi && e.start === a.start + a.dur);
    if (!b) {
      out.push(id);
      continue;
    }
    events = events.filter((e) => e.id !== b.id).map((e) => (e.id === a.id ? { ...e, dur: a.dur + b.dur } : e));
    out.push(id);
  }
  return { doc: normalize({ ...doc, events }), ids: out };
}


/**
 * Set the dynamic from the note's group onward until the old dynamic run ends (the next mark is untouched).
 * `null` removes the mark by merging the run into the previous one.
 */
export function setDynamic(doc: Doc, id: number, dyn: Dynamic | null): Doc {
  const sorted = [...doc.events].sort(order);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx < 0) return doc;
  const target = sorted[idx];
  const groupStart = sorted.findIndex((e) => groupKey(e) === groupKey(target));
  const old = gainToDynamic(target.gain);
  const prev = groupStart > 0 ? sorted[groupStart - 1] : undefined;
  const newGain = dyn ? DYN_GAIN[dyn] : prev?.gain;
  const changed = new Set<number>();
  for (let i = groupStart; i < sorted.length; i++) {
    const e = sorted[i];
    if (i > groupStart && groupKey(e) !== groupKey(target) && gainToDynamic(e.gain) !== old) break;
    changed.add(e.id);
  }
  return { ...doc, events: doc.events.map((e) => (changed.has(e.id) ? { ...e, gain: newGain } : e)) };
}

/** Articulations belong to the whole chord (every event sharing start and length). */
export function setArticulation(doc: Doc, ids: number[], art: Articulation | null): Doc {
  const groups = new Set(doc.events.filter((e) => ids.includes(e.id)).map(groupKey));
  return { ...doc, events: doc.events.map((e) => (groups.has(groupKey(e)) ? { ...e, clip: art ? ART_CLIP[art] : undefined } : e)) };
}

/** Dynamic of each event after inheriting forward (and the first defined one backwards). Invariant under codegen. */
export function effectiveDynamics(events: DocEvent[]): Map<number, Dynamic | undefined> {
  const sorted = [...events].sort(order);
  const firstDefined = sorted.map((e) => gainToDynamic(e.gain)).find((d) => d !== undefined);
  const res = new Map<number, Dynamic | undefined>();
  let cur: Dynamic | undefined = firstDefined;
  const groupDyn = new Map<string, Dynamic | undefined>();
  for (const e of sorted) {
    const k = groupKey(e);
    if (!groupDyn.has(k)) {
      const d = gainToDynamic(e.gain);
      if (d) cur = d;
      groupDyn.set(k, cur);
    }
    res.set(e.id, groupDyn.get(k));
  }
  return res;
}

/** Id-free, comparable description of a document: what the score actually says. */
export function canonical(doc: Doc) {
  const dyn = effectiveDynamics(doc.events);
  return [...doc.events].sort(order).map((e) => ({
    start: e.start,
    dur: e.dur,
    midi: e.midi,
    dynamic: dyn.get(e.id) ?? null,
    articulation: clipToArticulation(e.clip) ?? null,
  }));
}
