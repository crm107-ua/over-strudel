import { describe, expect, it } from "vitest";
import type { RawEvent, ScoreVoice } from "../types";
import { buildScore } from "./buildScore";
import { parseDirectives } from "../directives";
import { toMidi } from "./pitch";
import { decompose } from "./rests";

const ev = (note: string | number, b: [number, number], e: [number, number], extra: Partial<RawEvent> = {}): RawEvent => ({
  value: { note },
  begin: { n: b[0], d: b[1] },
  end: { n: e[0], d: e[1] },
  ...extra,
});
const slots = (v: ScoreVoice) =>
  v.reduce((a, n) => a + ({ w: 16, h: 8, q: 4, "8": 2, "16": 1 }[n.duration] ?? 0) * (n.dots ? 1.5 : 1), 0);

describe("pitch", () => {
  it("parses names and midi", () => {
    expect(toMidi("c4")).toBe(60);
    expect(toMidi("eb3")).toBe(51);
    expect(toMidi("cs4")).toBe(61);
    expect(toMidi(72)).toBe(72);
  });
});

describe("rests read as subdivisions", () => {
  const names = (start: number, len: number) => decompose(start, len, "rest").map((p) => `${p.duration}${p.dots ? "." : ""}@${p.slot}`);
  it("an empty measure is one whole rest", () => {
    expect(names(0, 16)).toEqual(["w@0"]);
  });
  it("the free space after a quarter is quarter + half (never stray eighths)", () => {
    expect(names(4, 12)).toEqual(["q@4", "h@8"]);
    expect(names(8, 8)).toEqual(["h@8"]);
    expect(names(12, 4)).toEqual(["q@12"]);
  });
  it("space before a late note is half + quarter", () => {
    expect(names(0, 12)).toEqual(["h@0", "q@8"]);
  });
  it("finer rests appear only when that subdivision is reached", () => {
    expect(names(2, 6)).toEqual(["8@2", "q@4"]);
    expect(names(1, 3)).toEqual(["16@1", "8@2"]);
  });
  it("rests are never dotted", () => {
    for (let s = 0; s < 16; s++) for (let l = 1; s + l <= 16; l++) expect(decompose(s, l, "rest").every((p) => p.dots === 0)).toBe(true);
  });
  it("every rest decomposition covers exactly its length", () => {
    for (let s = 0; s < 16; s++) for (let l = 1; s + l <= 16; l++) {
      const total = decompose(s, l, "rest").reduce((a, p) => a + ({ w: 16, h: 8, q: 4, "8": 2, "16": 1 }[p.duration] ?? 0), 0);
      expect(total).toBe(l);
    }
  });
});

describe("note figures", () => {
  it("a half note may start on beat 2 (syncopation) and stays one figure", () => {
    expect(decompose(4, 8).map((p) => p.duration)).toEqual(["h"]);
    expect(decompose(4, 12).map((p) => p.duration + p.dots)).toEqual(["h1"]);
  });
  it("a whole note only at the bar start", () => {
    expect(decompose(0, 16).map((p) => p.duration)).toEqual(["w"]);
    expect(decompose(4, 12).length).toBe(1);
  });
});

describe("decompose", () => {
  it("splits into aligned figures", () => {
    expect(decompose(0, 16).map((p) => p.duration)).toEqual(["w"]);
    expect(decompose(0, 5).map((p) => p.duration + p.dots)).toEqual(["q0", "160"]);
    expect(decompose(2, 6).length).toBeGreaterThan(1);
  });
});

describe("buildScore", () => {
  it("four quarters", () => {
    const q = (i: number) => ev("c4", [i, 4], [i + 1, 4]);
    const s = buildScore([q(0), q(1), q(2), q(3)], 1);
    expect(s.measures[0].treble[0].map((n) => n.duration)).toEqual(["q", "q", "q", "q"]);
  });

  it("fills rests so every measure sums to 16 slots", () => {
    const s = buildScore([ev("c4", [0, 1], [1, 4]), ev("e4", [3, 4], [1, 1])], 2);
    for (const m of s.measures) expect(slots(m.treble[0])).toBe(16);
    expect(s.measures[1].treble[0]).toHaveLength(1);
    expect(s.measures[1].treble[0][0]).toMatchObject({ isRest: true, duration: "w" });
  });

  it("snaps thirds to nearest sixteenth", () => {
    const s = buildScore([ev("c4", [0, 1], [1, 3]), ev("d4", [1, 3], [2, 3]), ev("e4", [2, 3], [1, 1])], 1);
    expect(slots(s.measures[0].treble[0])).toBe(16);
  });

  it("makes chords and separate voices", () => {
    const chord = buildScore([ev("c4", [0, 1], [1, 2]), ev("e4", [0, 1], [1, 2])], 1);
    expect(chord.measures[0].treble[0][0].keys).toEqual(["c/4", "e/4"]);
    const poly = buildScore([ev("c5", [0, 1], [1, 1]), ev("e4", [0, 1], [1, 2]), ev("g4", [1, 2], [1, 1])], 1);
    expect(poly.measures[0].treble).toHaveLength(2);
    expect(slots(poly.measures[0].treble[1])).toBe(16);
  });

  it("uses grand staff below middle C", () => {
    const s = buildScore([ev("c3", [0, 1], [1, 1]), ev("e4", [0, 1], [1, 1])], 1);
    expect(s.grand).toBe(true);
    expect(s.measures[0].bass![0][0].keys).toEqual(["c/3"]);
    expect(s.measures[0].treble[0][0].keys).toEqual(["e/4"]);
  });

  it("ties notes crossing the barline", () => {
    const s = buildScore([ev("c4", [1, 2], [3, 2])], 2);
    expect(s.measures[0].treble[0].at(-1)?.tieNext).toBe(true);
    expect(s.measures[1].treble[0][0]).toMatchObject({ isRest: false, duration: "h" });
  });

  it("maps gain and clip", () => {
    const s = buildScore([ev("c4", [0, 1], [1, 2], { gain: 0.3, clip: 0.4 }), ev("d4", [1, 2], [1, 1], { gain: 1, clip: 2 })], 1);
    const [a, b] = s.measures[0].treble[0];
    expect([a.dynamic, a.articulation, b.dynamic, b.articulation]).toEqual(["p", "staccato", "f", "tenuto"]);
  });

  it("can force the staff layout", () => {
    const low = [ev("c3", [0, 1], [1, 1])];
    expect(buildScore(low, 1, { grand: false }).grand).toBe(false);
    expect(buildScore(low, 1, { grand: false }).measures[0].treble[0][0].keys).toEqual(["c/3"]);
    expect(buildScore([ev("c4", [0, 1], [1, 1])], 1, { grand: true }).grand).toBe(true);
  });
});

describe("directives", () => {
  it("parses compases and pentagrama", () => {
    expect(parseDirectives(["// @compases 8", "// @pentagrama piano", "note('c4')"].join("\n"))).toEqual({
      measures: 8,
      staff: "piano",
      key: "C",
    });
    expect(parseDirectives("note('c4')")).toEqual({ measures: null, staff: "auto", key: "C" });
    expect(parseDirectives("// @measures 999")).toEqual({ measures: 64, staff: "auto", key: "C" });
    expect(parseDirectives("// @pentagrama sol")).toEqual({ measures: null, staff: "treble", key: "C" });
  });
});

describe("key signature in the score", () => {
  it("spells accidentals by key and exposes the signature", () => {
    const e = [ev("a#4", [0, 1], [1, 1])];
    const f = buildScore(e, 1, { key: "F" });
    expect(f.fifths).toBe(-1);
    expect(f.measures[0].treble[0][0].keys).toEqual(["bb/4"]);
    const g = buildScore(e, 1, { key: "G" });
    expect(g.measures[0].treble[0][0].keys).toEqual(["a#/4"]);
    expect(parseDirectives("// @tonalidad Bb").key).toBe("Bb");
    expect(parseDirectives("// @key F#m").key).toBe("F#m");
    expect(parseDirectives("// @tonalidad xyz").key).toBe("C");
  });
});
