import { describe, expect, it } from "vitest";
import { buildScoreFromQ } from "../middleware/buildScore";
import type { ScoreVoice } from "../types";
import {
  addMeasure, addNote, canonical, clearRange, entryTarget, fillPointer, floorFigure, reachKey, deleteEvents, docToQ, joinNext, moveEvents, nudgeDuration, normalize, setArticulation,
  removeLastMeasure, setAccidental, transposeAll, setDuration, setDynamic, totalSlots, transpose, type Doc,
} from "./doc";

const empty = (measures = 2): Doc => ({ measures, events: [] });
const slotsOf = (v: ScoreVoice) =>
  v.reduce((a, n) => a + ({ w: 16, h: 8, q: 4, "8": 2, "16": 1 }[n.duration] ?? 0) * (n.dots ? 1.5 : 1), 0);
const tuples = (d: Doc) => d.events.map((e) => [e.start, e.dur, e.midi]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);

describe("addNote", () => {
  it("adds a note and clamps it inside the piece", () => {
    const { doc } = addNote(empty(1), { start: 14, midi: 60, dur: 8 }, false);
    expect(tuples(doc)).toEqual([[14, 2, 60]]);
  });

  it("same start + same length forms a chord (auto-merge)", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addNote(d, { start: 0, midi: 64, dur: 4 }, false).doc;
    d = addNote(d, { start: 0, midi: 67, dur: 4 }, false).doc;
    expect(tuples(d)).toEqual([[0, 4, 60], [0, 4, 64], [0, 4, 67]]);
    const s = buildScoreFromQ(docToQ(d), 2);
    expect(s.measures[0].treble[0][0].keys).toEqual(["c/4", "e/4", "g/4"]);
  });

  it("is idempotent for an identical note", () => {
    const a = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false);
    const b = addNote(a.doc, { start: 0, midi: 60, dur: 4 }, false);
    expect(b.doc.events).toHaveLength(1);
    expect(b.ids).toEqual(a.ids);
  });

  it("overwrites what it overlaps (trim tail / remove inside)", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 8 }, false).doc;
    d = addNote(d, { start: 4, midi: 62, dur: 4 }, false).doc; // trims the first note to 4
    expect(tuples(d)).toEqual([[0, 4, 60], [4, 4, 62]]);
    d = addNote(d, { start: 0, midi: 64, dur: 8 }, false).doc; // covers both
    expect(tuples(d)).toEqual([[0, 8, 64]]);
  });

  it("layer mode keeps overlapping material (separate voices)", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 8 }, false).doc;
    d = addNote(d, { start: 2, midi: 72, dur: 2, layer: true }, false).doc;
    expect(d.events).toHaveLength(2);
    expect(buildScoreFromQ(docToQ(d), 2).measures[0].treble).toHaveLength(2);
  });

  it("does not overwrite across staves of the grand staff", () => {
    let d = addNote(empty(), { start: 0, midi: 48, dur: 8 }, true).doc; // bass
    d = addNote(d, { start: 0, midi: 72, dur: 4 }, true).doc; // treble
    expect(d.events).toHaveLength(2);
    const d2 = addNote(d, { start: 0, midi: 50, dur: 4 }, true).doc; // bass overwrites bass only
    expect(tuples(d2)).toEqual([[0, 4, 50], [0, 4, 72]]);
  });

  it("inherits the running gain so no accidental dynamic appears", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = setDynamic(d, d.events[0].id, "f");
    d = addNote(d, { start: 4, midi: 62, dur: 4 }, false).doc;
    const marks = buildScoreFromQ(docToQ(d), 2).measures[0].treble[0].map((n) => n.dynamic);
    expect(marks.filter(Boolean)).toEqual(["f"]);
  });
});

describe("move / duration / pitch", () => {
  const base = () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addNote(d, { start: 0, midi: 64, dur: 4 }, false).doc;
    d = addNote(d, { start: 8, midi: 67, dur: 4 }, false).doc;
    return d;
  };

  it("moves a chord together and clamps at the borders", () => {
    const d = base();
    const chord = d.events.filter((e) => e.start === 0).map((e) => e.id);
    expect(tuples(moveEvents(d, chord, 3, 2, false).doc)).toEqual([[3, 4, 62], [3, 4, 66], [8, 4, 67]]);
    expect(tuples(moveEvents(d, chord, -5, 0, false).doc).slice(0, 2)).toEqual([[0, 4, 60], [0, 4, 64]]);
    const last = d.events.filter((e) => e.start === 8).map((e) => e.id);
    expect(tuples(moveEvents(d, last, 100, 0, false).doc).pop()).toEqual([28, 4, 67]);
  });

  it("growing a note overwrites the following ones", () => {
    const d = base();
    const first = d.events.filter((e) => e.start === 0).map((e) => e.id);
    expect(tuples(setDuration(d, first, 12, false).doc).filter((t) => t[0] === 8)).toEqual([]);
    expect(tuples(setDuration(d, first, 2, false).doc).slice(0, 2)).toEqual([[0, 2, 60], [0, 2, 64]]);
    expect(tuples(nudgeDuration(d, first, 1, false).doc).slice(0, 2)).toEqual([[0, 5, 60], [0, 5, 64]]);
  });

  it("transposes by semitones/octaves without losing notes", () => {
    const d = base();
    const ids = d.events.map((e) => e.id);
    expect(transpose(d, ids, 12).doc.events.map((e) => e.midi).sort()).toEqual([72, 76, 79]);
    expect(transpose(d, ids, 1000).doc.events.every((e) => e.midi <= 108)).toBe(true);
  });

  it("joins same-pitch neighbours into one longer note", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addNote(d, { start: 4, midi: 60, dur: 4 }, false).doc;
    const r = joinNext(d, [d.events[0].id]);
    expect(tuples(r.doc)).toEqual([[0, 8, 60]]);
  });

  it("deletes", () => {
    const d = base();
    expect(deleteEvents(d, [d.events[0].id]).events).toHaveLength(2);
  });
});

describe("sequential entry", () => {
  const grand = false;
  it("fill pointer: bar start when empty, end of the last note otherwise", () => {
    let d = empty(2);
    expect(fillPointer(d, 0, "treble", grand)).toBe(0);
    d = addNote(d, { start: 0, midi: 60, dur: 8 }, grand).doc;
    expect(fillPointer(d, 0, "treble", grand)).toBe(8);
    expect(fillPointer(d, 1, "treble", grand)).toBe(16);
    d = addNote(d, { start: 12, midi: 62, dur: 8 }, grand).doc; // crosses into measure 2
    expect(fillPointer(d, 0, "treble", grand)).toBe(16);
    expect(fillPointer(d, 1, "treble", grand)).toBe(20);
  });
  it("the staffs have their own fill pointer on the grand staff", () => {
    let d = empty(1);
    d = addNote(d, { start: 0, midi: 48, dur: 8 }, true).doc; // bass
    expect(fillPointer(d, 0, "bass", true)).toBe(8);
    expect(fillPointer(d, 0, "treble", true)).toBe(0);
  });
  it("continues from the cursor and never crosses the barline", () => {
    const d = addNote(empty(2), { start: 0, midi: 60, dur: 12 }, grand).doc;
    const t = entryTarget(d, 12, null, "treble", grand, 8)!;
    expect(t).toMatchObject({ start: 12, dur: 4, measure: 0 }); // only a quarter is left
  });
  it("an empty measure starts at its beginning (from the whole-note rest)", () => {
    expect(entryTarget(empty(2), 0, 1, "treble", grand, 16)).toMatchObject({ start: 16, dur: 16, measure: 1 });
  });
  it("clicking a measure writes in THAT measure, after what is already there", () => {
    let d = empty(3);
    d = addNote(d, { start: 16, midi: 60, dur: 4 }, grand).doc;
    expect(entryTarget(d, 0, 1, "treble", grand, 4)).toMatchObject({ start: 20, measure: 1 });
    expect(entryTarget(d, 0, 2, "treble", grand, 4)).toMatchObject({ start: 32, measure: 2 });
    expect(entryTarget(d, 0, 0, "treble", grand, 4)).toMatchObject({ start: 0, measure: 0 });
  });
  it("a full measure accepts nothing and NEVER creates measures", () => {
    let d = empty(2);
    d = addNote(d, { start: 0, midi: 60, dur: 16 }, grand).doc;
    expect(entryTarget(d, 16, 0, "treble", grand, 4)).toBeNull();
    expect(entryTarget(d, 0, 0, "treble", grand, 4)).toBeNull();
    expect(entryTarget(empty(1), 16, null, "treble", grand, 4)).toBeNull(); // cursor past the end: no measure appears
    expect(d.measures).toBe(2);
  });
  it("a measure that does not exist is not a target", () => {
    expect(entryTarget(empty(2), 0, 5, "treble", grand, 4)).toBeNull();
  });
  it("a stale cursor cannot leave a gap: it never goes beyond what is written", () => {
    let d = empty(1);
    d = addNote(d, { start: 0, midi: 60, dur: 4 }, grand).doc;
    expect(entryTarget(d, 12, 0, "treble", grand, 4)).toMatchObject({ start: 4 });
  });
  it("a cursor moved on purpose (Alt+click) may overwrite from an earlier point, even in a full measure", () => {
    let d = empty(1);
    d = addNote(d, { start: 0, midi: 60, dur: 16 }, grand).doc;
    expect(entryTarget(d, 4, 0, "treble", grand, 4, {}, true)).toMatchObject({ start: 4, dur: 4 });
    expect(entryTarget(d, 4, 0, "treble", grand, 4, {}, false)).toBeNull(); // an ordinary cursor does not
  });
  it("a rest replaces what is there and keeps what is before it", () => {
    let d = empty(1);
    d = addNote(d, { start: 0, midi: 60, dur: 8 }, grand).doc;
    d = addNote(d, { start: 8, midi: 62, dur: 8 }, grand).doc;
    const r = clearRange(d, 4, 8, "treble", grand);
    expect(tuples(r)).toEqual([[0, 4, 60]]);
  });
  it("a rest only clears its own staff", () => {
    let d = empty(1);
    d = addNote(d, { start: 0, midi: 48, dur: 16 }, true).doc;
    d = addNote(d, { start: 0, midi: 72, dur: 16 }, true).doc;
    expect(tuples(clearRange(d, 0, 16, "treble", true))).toEqual([[0, 16, 48]]);
  });
  it("a trailing rest counts as written: the measure is complete although it ends in a gap", () => {
    let d = empty(2);
    d = addNote(d, { start: 0, midi: 60, dur: 4 }, grand).doc; // only a quarter is stored
    const reach = { [reachKey("treble", 0)]: 16 }; // ...but entry wrote note + rests up to the barline
    expect(fillPointer(d, 0, "treble", grand, reach)).toBe(16);
    expect(entryTarget(d, 16, 0, "treble", grand, 4, reach)).toBeNull(); // full: no going back into the gap
    expect(entryTarget(d, 16, 0, "treble", grand, 4)).toMatchObject({ start: 4, measure: 0 }); // without the memory it is not full
  });
  it("floorFigure: the longest plain figure that still fits", () => {
    expect([16, 12, 8, 7, 5, 4, 3, 2, 1].map(floorFigure)).toEqual([16, 8, 8, 4, 4, 4, 2, 2, 1]);
  });
});

describe("measures", () => {
  it("adds a measure at the end and keeps every measure complete", () => {
    let d = addNote(empty(1), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addMeasure(d);
    expect(d.measures).toBe(2);
    const s = buildScoreFromQ(docToQ(d), d.measures);
    expect(s.measures).toHaveLength(2);
    expect(slotsOf(s.measures[1].treble[0])).toBe(16);
  });
  it("is limited to 1..64 measures", () => {
    expect(addMeasure({ measures: 64, events: [] }).measures).toBe(64);
    expect(removeLastMeasure({ measures: 1, events: [] }).measures).toBe(1);
  });
  it("removing the last measure drops its notes and shortens notes that cross into it", () => {
    let d = empty(2);
    d = addNote(d, { start: 12, midi: 60, dur: 8 }, false).doc; // crosses the barline
    d = addNote(d, { start: 20, midi: 62, dur: 4 }, false).doc; // lives in measure 2
    const r = removeLastMeasure(d);
    expect(r.measures).toBe(1);
    expect(tuples(r)).toEqual([[12, 4, 60]]);
  });
});

describe("transposeAll", () => {
  it("shifts the whole piece and keeps every note", () => {
    let d = addNote(empty(), { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addNote(d, { start: 4, midi: 67, dur: 4 }, false).doc;
    expect(transposeAll(d, 2).events.map((e) => e.midi)).toEqual([62, 69]);
    expect(transposeAll(d, 0)).toBe(d);
  });
  it("never leaves the piano range (the shift is reduced instead of losing notes)", () => {
    let d = addNote(empty(), { start: 0, midi: 100, dur: 4 }, false).doc;
    d = addNote(d, { start: 4, midi: 60, dur: 4 }, false).doc;
    const r = transposeAll(d, 30);
    expect(r.events).toHaveLength(2);
    expect(Math.max(...r.events.map((e) => e.midi))).toBe(108);
  });
});

describe("accidentals", () => {
  const one = (midi: number) => {
    const r = addNote(empty(), { start: 0, midi, dur: 4 }, false);
    return { d: r.doc, ids: r.ids };
  };
  const apply = (midi: number, v: -1 | 0 | 1) => {
    const { d, ids } = one(midi);
    return setAccidental(d, ids, v).doc.events[0].midi;
  };
  it("sharp / flat / natural on white and black keys", () => {
    expect(apply(60, 1)).toBe(61); // C -> C#
    expect(apply(64, -1)).toBe(63); // E -> Eb (spelled D#)
    expect(apply(61, 1)).toBe(61); // already sharp
    expect(apply(61, -1)).toBe(61); // C# is already Db
    expect(apply(61, 0)).toBe(60); // natural on a black key -> its letter
    expect(apply(60, 0)).toBe(60);
  });
});

describe("dynamics & articulations", () => {
  const four = () => {
    let d = empty();
    for (let i = 0; i < 4; i++) d = addNote(d, { start: i * 4, midi: 60 + i, dur: 4 }, false).doc;
    return d;
  };
  const marks = (d: Doc) => buildScoreFromQ(docToQ(d), 2).measures[0].treble[0].map((n) => n.dynamic ?? "-").join(",");

  it("a dynamic lasts until the next mark", () => {
    let d = four();
    d = setDynamic(d, d.events[0].id, "mf");
    d = setDynamic(d, d.events[2].id, "f");
    expect(marks(d)).toBe("mf,-,f,-");
    d = setDynamic(d, d.events[1].id, "p"); // only affects the old mf run (note 2)
    expect(marks(d)).toBe("mf,p,f,-");
  });

  it("removing a mark merges the run into the previous one", () => {
    let d = four();
    d = setDynamic(d, d.events[0].id, "mf");
    d = setDynamic(d, d.events[2].id, "f");
    d = setDynamic(d, d.events[2].id, null);
    expect(marks(d)).toBe("mf,-,-,-");
  });

  it("sets articulations", () => {
    let d = four();
    d = setArticulation(d, [d.events[1].id], "staccato");
    d = setArticulation(d, [d.events[2].id], "tenuto");
    expect(buildScoreFromQ(docToQ(d), 2).measures[0].treble[0].map((n) => n.articulation ?? "-").join(",")).toBe("-,staccato,tenuto,-");
    d = setArticulation(d, [d.events[1].id], null);
    expect(canonical(d)[1].articulation).toBeNull();
  });
});

describe("invariant: any sequence of edits keeps every measure complete", () => {
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  it("200 random edit sequences", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      let d = empty(1 + Math.floor(r() * 3));
      for (let step = 0; step < 25; step++) {
        const grand = r() < 0.5;
        const ids = d.events.length ? [pick(d.events).id] : [];
        const op = Math.floor(r() * 9);
        if (op <= 2 || !ids.length) {
          d = addNote(d, { start: Math.floor(r() * totalSlots(d)), midi: 36 + Math.floor(r() * 50), dur: pick([1, 2, 3, 4, 6, 8, 12, 16, 24]), layer: r() < 0.3 }, grand).doc;
        } else if (op === 3) d = moveEvents(d, ids, Math.floor(r() * 21) - 10, Math.floor(r() * 25) - 12, grand).doc;
        else if (op === 4) d = setDuration(d, ids, pick([1, 2, 3, 4, 8, 16, 30]), grand).doc;
        else if (op === 5) d = transpose(d, ids, pick([-12, -1, 1, 12])).doc;
        else if (op === 6) d = joinNext(d, ids).doc;
        else if (op === 7) d = setDynamic(d, ids[0], pick(["p", "mf", "f", null] as const));
        else d = deleteEvents(d, ids);
        d = normalize(d);

        const score = buildScoreFromQ(docToQ(d), d.measures, { grand: r() < 0.5 ? undefined : grand });
        for (const m of score.measures) {
          for (const v of [...m.treble, ...(m.bass ?? [])]) expect(slotsOf(v)).toBe(16);
        }
        for (const e of d.events) {
          expect(e.start).toBeGreaterThanOrEqual(0);
          expect(e.start + e.dur).toBeLessThanOrEqual(totalSlots(d));
        }
      }
    }
  });
});
