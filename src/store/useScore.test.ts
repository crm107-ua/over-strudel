import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateToEvents } from "@/lib/strudelRuntime";

// The Worker/audio are browser-only: evaluate with the REAL Strudel in-process instead.
vi.mock("@/lib/strudelClient", async () => {
  const { evaluateFull } = await import("@/lib/strudelRuntime");
  return { queryPattern: (code: string, cycles: number) => evaluateFull(code, cycles) };
});
vi.mock("@/lib/audioEngine", () => ({ playCode: vi.fn(), stopAudio: vi.fn(), getCycle: () => null }));

import { canonical, docFromQ, totalSlots } from "@/lib/edit/doc";
import { keyToAction, type EditAction } from "@/lib/edit/shortcuts";
import { quantize } from "@/lib/middleware/quantize";
import { useScore } from "@/store/useScore";

const st = () => useScore.getState();
const settle = () => vi.waitFor(() => expect(st().status).toBe("ok"), { timeout: 5000 });
const slotsOf = (v: { duration: string; dots: number }[]) =>
  v.reduce((a, n) => a + ({ w: 16, h: 8, q: 4, "8": 2, "16": 1 }[n.duration] ?? 0) * (n.dots ? 1.5 : 1), 0);

async function load(code: string) {
  useScore.setState({ selection: [], past: [], future: [] });
  st().setCode(code);
  await st().evaluate(code);
  await settle();
}

/** The code on screen, evaluated by real Strudel, must be exactly the document + score on screen. */
async function assertConsistent() {
  const s = st();
  expect(s.error).toBeNull();
  const back = docFromQ(quantize(await evaluateToEvents(s.code, s.doc.measures), s.doc.measures), s.doc.measures);
  expect(canonical(back)).toEqual(canonical(s.doc));
  for (const m of s.score.measures) for (const v of [...m.treble, ...(m.bass ?? [])]) expect(slotsOf(v)).toBe(16);
}

beforeEach(async () => {
  useScore.setState({ tool: { dur: 4, dot: false, accidental: null }, transposeOnKeyChange: true, noteKind: "note", entryMode: "sequence", cursor: 0 });
  await load("// @compases 2\nsilence\n");
});

describe("code -> score", () => {
  it("evaluating hand-written code fills the document", async () => {
    await load('// @compases 1\nnote("c4 e4 g4 c5")');
    expect(st().doc.events.map((e) => e.midi)).toEqual([60, 64, 67, 72]);
    expect(st().score.measures[0].treble[0].map((n) => n.duration)).toEqual(["q", "q", "q", "q"]);
  });
});

describe("score -> code (the score is the source)", () => {
  it("clicking notes writes code that plays exactly that", async () => {
    st().addNoteAt(0, 60);
    await settle();
    st().addNoteAt(4, 64);
    await settle();
    st().act({ type: "duration", base: 8 });
    st().addNoteAt(8, 67);
    await settle();
    expect(st().code).toContain("// @compases 2");
    expect(st().code).toMatch(/note\(`[\s\S]*c4@4[\s\S]*e4@4[\s\S]*g4@8/);
    await assertConsistent();
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 4, 60], [4, 4, 64], [8, 8, 67]]);
  });

  it("notes placed on the same beat fuse into a chord", async () => {
    st().addNoteAt(0, 60);
    st().addNoteAt(0, 64);
    st().addNoteAt(0, 67);
    await settle();
    expect(st().score.measures[0].treble[0][0].keys).toEqual(["c/4", "e/4", "g/4"]);
    expect(st().code).toContain("[c4,e4,g4]@4");
    await assertConsistent();
  });

  it("accidental tool, dotted values and notes across the barline", async () => {
    st().act({ type: "accidental", value: 1 });
    st().act({ type: "duration", base: 8 });
    st().act({ type: "dot" }); // dotted half = 12
    st().addNoteAt(10, 60); // c#4, crosses into measure 2
    await settle();
    expect(st().doc.events[0]).toMatchObject({ start: 10, dur: 12, midi: 61 });
    expect(st().score.measures[0].treble[0].at(-1)?.tieNext).toBe(true);
    await assertConsistent();
  });

  it("changing the duration / pitch / position of the selection", async () => {
    st().addNoteAt(0, 60);
    st().act({ type: "duration", base: 8 });
    expect(st().doc.events[0].dur).toBe(8);
    st().act({ type: "transpose", semitones: 12 });
    expect(st().doc.events[0].midi).toBe(72);
    st().act({ type: "move", slots: 4 });
    expect(st().doc.events[0].start).toBe(4);
    st().act({ type: "extend", slots: -2 });
    expect(st().doc.events[0].dur).toBe(6);
    await settle();
    await assertConsistent();
  });

  it("dynamics and articulations written into the code", async () => {
    for (let i = 0; i < 4; i++) st().addNoteAt(i * 4, 60 + i);
    st().act({ type: "selectAll" });
    st().act({ type: "dynamic", dyn: "f" });
    st().select([st().doc.events[1].id]);
    st().act({ type: "articulation", art: "staccato" });
    await settle();
    expect(st().code).toContain(".gain(");
    expect(st().code).toContain(".clip(");
    expect(st().score.measures[0].treble[0][0].dynamic).toBe("f");
    expect(st().score.measures[0].treble[0][1].articulation).toBe("staccato");
    await assertConsistent();
  });

  it("undo / redo restore both code and score", async () => {
    st().addNoteAt(0, 60);
    st().addNoteAt(4, 62);
    await settle();
    const two = st().code;
    st().act({ type: "undo" });
    await settle();
    expect(st().doc.events).toHaveLength(1);
    st().act({ type: "undo" });
    await settle();
    expect(st().doc.events).toHaveLength(0);
    expect(st().code).toBe("// @compases 2\nsilence\n"); // the hand-written code comes back
    st().act({ type: "redo" });
    st().act({ type: "redo" });
    await settle();
    expect(st().code).toBe(two);
    await assertConsistent();
  });

  it("typing code after editing keeps working (bidirectional)", async () => {
    st().addNoteAt(0, 60);
    await settle();
    await load('// @compases 1\nnote("d4 f4")');
    expect(st().doc.events.map((e) => e.midi)).toEqual([62, 65]);
    st().addNoteAt(12, 69); // trims the f4 (8..16) to 4 slots and adds a4 after it
    await settle();
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 8, 62], [8, 4, 65], [12, 4, 69]]);
    await assertConsistent();
  });
});

describe("note inspector actions", () => {
  it("accidental buttons modify the selected note", async () => {
    st().addNoteAt(0, 60);
    st().act({ type: "accidental", value: 1 });
    expect(st().doc.events[0].midi).toBe(61);
    st().act({ type: "accidental", value: 0 });
    expect(st().doc.events[0].midi).toBe(60);
    await settle();
    await assertConsistent();
  });

  it("wheel turns share ONE undo step and stay consistent", async () => {
    st().addNoteAt(0, 60);
    await settle();
    const pastBefore = st().past.length;
    st().wheelPitch(1);
    st().wheelPitch(1);
    st().wheelPitch(1);
    expect(st().doc.events[0].midi).toBe(63);
    expect(st().past.length).toBe(pastBefore + 1);
    await settle();
    await assertConsistent();
    st().act({ type: "undo" });
    await settle();
    expect(st().doc.events[0].midi).toBe(60);
  });

  it("adds and removes measures from the score", async () => {
    st().addNoteAt(0, 60);
    await settle();
    st().act({ type: "addMeasure" });
    st().act({ type: "addMeasure" });
    await settle();
    expect(st().doc.measures).toBe(4);
    expect(st().code).toContain("// @compases 4");
    expect(st().score.measures).toHaveLength(4);
    await assertConsistent();
    st().addNoteAt(60, 64); // a note in the last measure
    await settle();
    st().act({ type: "removeMeasure" });
    await settle();
    expect(st().doc.measures).toBe(3);
    expect(st().doc.events.map((e) => e.midi)).toEqual([60]);
    await assertConsistent();
  });

  it("a note drawn with an explicit length (drag-to-draw)", async () => {
    st().addNoteAt(4, 62, false, 7);
    await settle();
    expect(st().doc.events[0]).toMatchObject({ start: 4, dur: 7, midi: 62 });
    await assertConsistent();
  });
});

describe("key signature (tonalidad)", () => {
  it("changing the key transposes the WHOLE piece, writes the directive, and undo restores it", async () => {
    st().addNoteAt(0, 60);
    st().addNoteAt(4, 64);
    await settle();
    st().setKey("D");
    await settle();
    expect(st().keyId).toBe("D");
    expect(st().score.fifths).toBe(2);
    expect(st().code).toContain("// @tonalidad D");
    expect(st().doc.events.map((e) => e.midi)).toEqual([62, 66]);
    await assertConsistent();
    st().act({ type: "undo" });
    await settle();
    expect(st().keyId).toBe("C");
    expect(st().doc.events.map((e) => e.midi)).toEqual([60, 64]);
  });

  it("can change only the signature (notes keep sounding the same)", async () => {
    st().addNoteAt(0, 70);
    await settle();
    useScore.setState({ transposeOnKeyChange: false });
    st().setKey("F");
    await settle();
    expect(st().doc.events[0].midi).toBe(70);
    expect(st().score.measures[0].treble[0][0].keys).toEqual(["bb/4"]); // spelled as a flat in F major
    await assertConsistent();
  });

  it("a click on a staff position follows the signature unless an accidental is chosen", async () => {
    st().setKey("G");
    await vi.waitFor(() => expect(st().keyId).toBe("G")); // hand-written code is patched after a verification round
    await settle();
    st().addNoteAt(0, 65); // the F line/space
    expect(st().doc.events[0].midi).toBe(66); // F# in G major
    st().act({ type: "accidental", value: 0 });
    st().addNoteAt(4, 65);
    expect(st().doc.events.find((e) => e.start === 4)?.midi).toBe(65); // explicit natural
    await settle();
    await assertConsistent();
  });

  it("typed code with a key directive sets the key", async () => {
    await load(["// @compases 1", "// @tonalidad Eb", "note(`c4 e4`)"].join("\n"));
    expect(st().keyId).toBe("Eb");
    expect(st().score.fifths).toBe(-3);
  });
});

const tool = (dur: number, dot = false) => useScore.setState({ tool: { dur, dot, accidental: null } });
const shape = (m: number, staff: "treble" | "bass" = "treble") =>
  st().score.measures[m][staff]![0].map((n) => `${n.duration}${n.dots ? "." : ""}${n.isRest ? "r" : ""}`);

describe("sequential entry: notes and rests, one after another", () => {
  it("a measure starts as a whole rest", () => {
    expect(shape(0)).toEqual(["wr"]);
  });

  it("notes go in order at the cursor, wherever you click", async () => {
    tool(8);
    st().enterAt(67, 0, "treble");
    st().enterAt(69, 0, "treble");
    await settle();
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 8, 67], [8, 8, 69]]);
    expect(st().cursor).toBe(16);
    await assertConsistent();
  });

  it("the free space reads as subdivisions (whole, half, quarter), never stray eighths", async () => {
    tool(4);
    st().enterAt(60, 0, "treble");
    expect(shape(0)).toEqual(["q", "qr", "hr"]); // quarter note, quarter rest, half rest
    st().enterAt(62, 0, "treble");
    expect(shape(0)).toEqual(["q", "q", "hr"]);
    st().enterAt(64, 0, "treble");
    expect(shape(0)).toEqual(["q", "q", "q", "qr"]);
    await settle();
    await assertConsistent();
  });

  it("the figure never crosses the barline and shrinks to what is left", async () => {
    tool(4);
    st().enterAt(60, 0, "treble");
    st().enterAt(62, 0, "treble");
    st().enterAt(64, 0, "treble"); // cursor at 12: a quarter is left
    tool(16);
    st().enterAt(65, 0, "treble"); // wanted a whole, only a quarter fits
    expect(st().doc.events.map((e) => e.dur)).toEqual([4, 4, 4, 4]);
    expect(st().cursor).toBe(16);
    expect(st().tool.dur).toBe(16); // next measure: a whole fits again
    await settle();
    await assertConsistent();
  });

  it("after a half note the default figure becomes a half (only that much is left)", () => {
    tool(16);
    st().enterAt(60, 0, "treble", false);
    expect(st().doc.events[0].dur).toBe(16);
    useScore.setState({ cursor: 0 });
    useScore.getState().act({ type: "undo" });
    tool(8);
    st().enterAt(60, 0, "treble");
    tool(16);
    st().enterAt(62, 0, "treble"); // wanted a whole, a half fits
    expect(st().doc.events.map((e) => e.dur)).toEqual([8, 8]);
  });

  it("rest mode is the same flow, and you can switch at any moment", async () => {
    tool(4);
    st().enterAt(60, 0, "treble"); // note
    st().act({ type: "toggleRest" });
    expect(st().noteKind).toBe("rest");
    st().enterAt(null, 0, "treble"); // rest (advances the cursor)
    st().act({ type: "toggleRest" });
    st().enterAt(64, 0, "treble"); // note again, after the rest
    st().act({ type: "toggleRest" });
    st().enterAt(null, 0, "treble"); // closing rest
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 4, 60], [8, 4, 64]]);
    expect(shape(0)).toEqual(["q", "qr", "q", "qr"]);
    expect(st().cursor).toBe(16);
    await settle();
    await assertConsistent();
  });

  it("a rest written over existing notes replaces them (cursor placed on purpose)", async () => {
    tool(8);
    st().addNoteAt(0, 60);
    st().addNoteAt(8, 62);
    st().setCursor(0); // Alt+click: write from here
    useScore.setState({ noteKind: "rest" });
    st().enterAt(null, 0, "treble");
    expect(st().doc.events.map((e) => e.midi)).toEqual([62]);
    expect(shape(0)).toEqual(["hr", "h"]);
    await settle();
    await assertConsistent();
  });

  it("every click on a full measure subdivides its last note (whole -> 2 halves -> half + 2 quarters ...)", async () => {
    tool(16);
    st().enterAt(60, 0, "treble");
    expect(shape(0)).toEqual(["w"]);
    st().enterAt(62, 0, "treble");
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 8, 60], [8, 8, 62]]);
    expect(shape(0)).toEqual(["h", "h"]);
    st().enterAt(64, 0, "treble");
    expect(st().doc.events.map((e) => e.dur)).toEqual([8, 4, 4]);
    st().enterAt(65, 0, "treble");
    expect(st().doc.events.map((e) => e.dur)).toEqual([8, 4, 2, 2]);
    await settle();
    expect(st().doc.measures).toBe(2); // never a new measure
    expect(st().code).toContain("// @compases 2");
    await assertConsistent();
  });

  it("the sequence ends when nothing is left to subdivide (sixteenths), still without new measures", async () => {
    tool(16);
    for (let i = 0; i < 12; i++) st().enterAt(60 + (i % 7), 0, "treble");
    await settle();
    expect(st().doc.events.map((e) => e.dur)).toEqual([8, 4, 2, 1, 1]);
    expect(st().doc.measures).toBe(2);
    await assertConsistent();
  });

  it("rest mode on a full measure subdivides too: the new half is a rest", async () => {
    tool(16);
    st().enterAt(60, 0, "treble");
    useScore.setState({ noteKind: "rest" });
    st().enterAt(null, 0, "treble");
    expect(st().doc.events.map((e) => [e.start, e.dur])).toEqual([[0, 8]]);
    expect(shape(0)).toEqual(["h", "hr"]);
    useScore.setState({ noteKind: "note" });
    tool(16);
    st().enterAt(64, 0, "treble"); // the free half is free: the next note goes there
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 8, 60], [8, 8, 64]]);
    await settle();
    await assertConsistent();
  });

  it("deleting a note frees its space: the next clicks write there again", async () => {
    tool(16);
    st().enterAt(60, 0, "treble");
    st().select([st().doc.events[0].id]);
    st().act({ type: "delete" });
    expect(st().doc.events).toHaveLength(0);
    expect(shape(0)).toEqual(["wr"]);
    st().enterAt(62, 0, "treble"); // the measure is a whole-note rest again
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 16, 62]]);
    await settle();
    await assertConsistent();
  });

  it("deleting one of several notes: the clicks refill the hole, in order, without touching the rest", async () => {
    tool(4);
    for (const m of [60, 62, 64, 65]) st().enterAt(m, 0, "treble");
    expect(st().doc.events.map((e) => e.dur)).toEqual([4, 4, 4, 4]);
    st().select([st().doc.events[1].id]);
    st().act({ type: "delete" });
    st().enterAt(70, 0, "treble");
    expect(st().doc.events.map((e) => [e.start, e.midi])).toEqual([[0, 60], [4, 70], [8, 64], [12, 65]]);
    await settle();
    await assertConsistent();
  });

  it("deleting after explicit rests also frees the space (the written reach is forgotten)", async () => {
    tool(4);
    st().enterAt(60, 0, "treble");
    useScore.setState({ noteKind: "rest" });
    tool(8);
    st().enterAt(null, 0, "treble");
    tool(4);
    st().enterAt(null, 0, "treble"); // note + rests to the barline: complete
    useScore.setState({ noteKind: "note" });
    st().select([st().doc.events[0].id]);
    st().act({ type: "delete" });
    st().enterAt(67, 0, "treble");
    expect(st().doc.events.map((e) => [e.start, e.dur, e.midi])).toEqual([[0, 4, 67]]);
  });

  it("measures are only added with the explicit action", async () => {
    tool(16);
    st().enterAt(60, 0, "treble");
    st().act({ type: "addMeasure" });
    await settle();
    expect(st().doc.measures).toBe(3);
    st().enterAt(62, 2, "treble"); // the new, empty measure starts from the whole rest
    expect(st().doc.events.map((e) => [e.start, e.dur])).toEqual([[0, 16], [32, 16]]);
  });

  it("working in another measure continues from that measure's first free point", () => {
    tool(4);
    st().addNoteAt(16, 60); // measure 2: a quarter
    useScore.setState({ cursor: 0 });
    st().enterAt(62, 1, "treble");
    expect(st().doc.events.map((e) => [e.start, e.midi])).toEqual([[16, 60], [20, 62]]);
  });

  it("note, then rests to the barline: that measure is complete and a click there changes nothing", async () => {
    tool(4);
    st().enterAt(60, 0, "treble"); // quarter note
    st().act({ type: "toggleRest" });
    tool(8);
    st().enterAt(null, 0, "treble"); // half rest (cursor 12)
    tool(4);
    st().enterAt(null, 0, "treble"); // quarter rest (cursor 16): the measure is complete
    st().act({ type: "toggleRest" });
    st().enterAt(64, 0, "treble"); // clicking measure 1 again: it is full, nothing is written anywhere else
    expect(st().doc.events.map((e) => [e.start, e.midi])).toEqual([[0, 60]]);
    expect(st().doc.measures).toBe(2);
    st().enterAt(64, 1, "treble"); // measure 2 is independent and starts empty
    expect(st().doc.events.map((e) => [e.start, e.midi])).toEqual([[0, 60], [16, 64]]);
    await settle();
    await assertConsistent();
  });

  it("Enter writes at the cursor: a rest in rest mode, the last pitch in note mode", async () => {
    tool(4);
    st().enterAt(69, 0, "treble");
    st().act({ type: "enter" }); // note mode: repeats the last pitch
    expect(st().doc.events.map((e) => [e.start, e.midi])).toEqual([[0, 69], [4, 69]]);
    st().act({ type: "toggleRest" });
    st().act({ type: "enter" }); // rest
    expect(st().cursor).toBe(12);
    await settle();
    await assertConsistent();
  });

  it("each entry is one undo step", async () => {
    tool(4);
    st().enterAt(60, 0, "treble");
    st().enterAt(62, 0, "treble");
    await settle();
    st().act({ type: "undo" });
    await settle();
    expect(st().doc.events.map((e) => e.midi)).toEqual([60]);
  });

  it("after typing code, the cursor continues after the last note", async () => {
    await load(["// @compases 2", "note(`c4 e4 g4 c5`)"].join("\n"));
    expect(st().cursor).toBe(32); // two measures of material
    await load(["// @compases 2", "silence", ""].join("\n"));
    expect(st().cursor).toBe(0);
  });

  it("free mode rest: silences the range where you click", async () => {
    tool(4);
    st().addNoteAt(0, 60);
    st().addNoteAt(4, 62);
    st().restAt(4, "treble");
    expect(st().doc.events.map((e) => e.midi)).toEqual([60]);
    await settle();
    await assertConsistent();
  });
});

describe("keyboard map", () => {
  const k = (key: string, o: Partial<{ ctrl: boolean; shift: boolean; alt: boolean }> = {}) =>
    keyToAction({ key, ctrl: false, shift: false, alt: false, ...o });
  it("maps shortcuts to actions", () => {
    expect(k("3")).toEqual({ type: "duration", base: 4 });
    expect(k(".")).toEqual({ type: "dot" });
    expect(k("ArrowUp", { shift: true })).toEqual({ type: "transpose", semitones: 12 });
    expect(k("ArrowLeft")).toEqual({ type: "move", slots: -1 });
    expect(k("z", { ctrl: true })).toEqual({ type: "undo" });
    expect(k("z", { ctrl: true, shift: true })).toEqual({ type: "redo" });
    expect(k("Delete")).toEqual({ type: "delete" });
    expect(k("r")).toEqual({ type: "toggleRest" });
    expect(k("Enter")).toEqual({ type: "enter" });
    expect(k("m")).toEqual({ type: "dynamic", dyn: "mf" });
    expect(k("Tab", { shift: true })).toEqual({ type: "navigate", dir: -1 });
    expect(k("q")).toBeNull();
  });
});

describe("fuzz: random editing sessions stay consistent with real Strudel", () => {
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SESSIONS = Number(process.env.FUZZ_SESSIONS ?? 12);
  it(`${SESSIONS} sessions x 40 random actions`, async () => {
    for (let seed = 1; seed <= SESSIONS; seed++) {
      const r = rng(seed * 104729);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      await load(`// @compases ${1 + Math.floor(r() * 3)}\nsilence\n`);
      for (let i = 0; i < 40; i++) {
        const events = st().doc.events;
        const total = totalSlots(st().doc);
        const roll = r();
        let label = "";
        if (roll < 0.3 || !events.length) {
          const abs = Math.floor(r() * total), midi = 40 + Math.floor(r() * 45);
          label = `add ${abs} ${midi}`;
          st().addNoteAt(abs, midi, r() < 0.2);
        } else if (roll < 0.4) {
          st().select([pick(events).id], r() < 0.3);
          label = "select";
        } else if (roll < 0.42) {
          const keys = ["C", "G", "D", "F", "Bb", "Eb", "Am", "F#m"];
          const k = pick(keys);
          useScore.setState({ transposeOnKeyChange: r() < 0.5 });
          label = `setKey ${k}`;
          st().setKey(k);
        } else if (roll < 0.46) {
          label = "enterAt";
          st().enterAt(r() < 0.8 ? 40 + Math.floor(r() * 45) : null, r() < 0.5 ? Math.floor(r() * st().doc.measures) : null, pick(["treble", "bass"] as const));
        } else if (roll < 0.5) {
          label = "moveSelection";
          st().moveSelection(Math.floor(r() * 9) - 4, Math.floor(r() * 9) - 4);
        } else {
          const actions: EditAction[] = [
            { type: "duration", base: pick([1, 2, 4, 8, 16]) }, { type: "dot" },
            { type: "transpose", semitones: pick([-12, -1, 1, 12]) }, { type: "move", slots: pick([-4, -1, 1, 4]) },
            { type: "extend", slots: pick([-1, 1]) }, { type: "delete" }, { type: "join" },
            { type: "articulation", art: pick(["staccato", "tenuto"] as const) },
            { type: "dynamic", dyn: pick(["p", "mf", "f", null] as const) }, { type: "accidental", value: pick([-1, 0, 1] as const) },
            { type: "toggleRest" }, { type: "enter" },
            { type: "undo" }, { type: "redo" }, { type: "addMeasure" }, { type: "removeMeasure" }, { type: "selectAll" }, { type: "navigate", dir: 1 }, { type: "duplicate" },
          ];
          const a = pick(actions);
          label = JSON.stringify(a);
          st().act(a);
        }
        await settle();
        try {
          await assertConsistent();
        } catch (e) {
          throw new Error(`seed ${seed} step ${i} after ${label}\n${st().code}\n${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }, 600000);
});

describe("keeping the user's own code (setting preserveCode)", () => {
  const mine = [
    "// mi pieza",
    "// @compases 4",
    'setcpm(28)',
    'note("<[c4 e4 g4 e4] [d4 f4 a4 f4]>")',
    "  .every(2, rev) // mi patrón",
    "",
  ].join("\n");

  it("changing the key (no transposition) only touches the directive", async () => {
    useScore.setState({ transposeOnKeyChange: false });
    st().setSettings({ preserveCode: true });
    await load(mine);
    st().setKey("G");
    await settle();
    await vi.waitFor(() => expect(st().code).toContain("// @tonalidad G"));
    expect(st().code).toBe(`// @tonalidad G\n${mine}`);
    expect(st().keyId).toBe("G");
  });

  it("changing the key WITH transposition appends .transpose() and still plays the transposed piece", async () => {
    useScore.setState({ transposeOnKeyChange: true });
    st().setSettings({ preserveCode: true });
    await load('// @compases 2\nnote("<c4 e4>")\n');
    const before = st().doc.events.map((e) => e.midi);
    st().setKey("D");
    await vi.waitFor(() => expect(st().code).toContain(".transpose("));
    await settle();
    expect(st().code).toContain('note("<c4 e4>")');
    expect(st().doc.events.map((e) => e.midi)).toEqual(before.map((m) => m + 2));
    await assertConsistent();
  });

  it("a pattern that cannot take .transpose() falls back to regenerating the code", async () => {
    useScore.setState({ transposeOnKeyChange: true });
    st().setSettings({ preserveCode: true });
    await load('// @compases 1\nn("0 2 4").scale("C:major").note()\n');
    st().setKey("D");
    await vi.waitFor(() => expect(st().keyId).toBe("D"));
    await settle();
    await assertConsistent();
  });

  it("adding a measure only changes @compases", async () => {
    st().setSettings({ preserveCode: true });
    await load(mine);
    st().act({ type: "addMeasure" });
    await vi.waitFor(() => expect(st().code).toContain("// @compases 5"));
    expect(st().code).toBe(mine.replace("@compases 4", "@compases 5"));
    expect(st().doc.measures).toBe(5);
  });

  it("with the setting off the code is regenerated as before", async () => {
    useScore.setState({ transposeOnKeyChange: false });
    st().setSettings({ preserveCode: false });
    await load(mine);
    st().setKey("G");
    await vi.waitFor(() => expect(st().code).toContain("Generado desde la partitura"));
    expect(st().code).not.toContain("mi patrón");
    st().setSettings({ preserveCode: true });
  });

  it("the setting is persisted in localStorage", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
    st().setSettings({ preserveCode: false });
    expect(JSON.parse(store["os-settings"])).toEqual({ preserveCode: false });
    st().setSettings({ preserveCode: true });
    vi.unstubAllGlobals();
  });
});
