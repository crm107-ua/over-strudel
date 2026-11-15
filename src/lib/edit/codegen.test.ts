import { describe, expect, it } from "vitest";
import { parseDirectives } from "../directives";
import { buildScoreFromQ } from "../middleware/buildScore";
import { quantize } from "../middleware/quantize";
import { evaluateToEvents } from "../strudelRuntime";
import { addNote, canonical, docFromQ, docToQ, normalize, setArticulation, setDynamic, totalSlots, type Doc } from "./doc";
import { generateCode } from "./codegen";

/** code -> real Strudel -> events -> document (exactly what the app does when you type code) */
async function roundTrip(code: string, measures: number): Promise<Doc> {
  return docFromQ(quantize(await evaluateToEvents(code, measures), measures), measures);
}

const doc = (measures: number, events: [number, number, number][], extra: Record<number, { gain?: number; clip?: number }> = {}): Doc =>
  normalize({
    measures,
    events: events.map(([start, dur, midi], i) => ({ id: i + 1, start, dur, midi, ...extra[i] })),
  });

describe("generateCode -> real Strudel -> same document", () => {
  it("a simple melody", async () => {
    const d = doc(1, [[0, 4, 60], [4, 4, 64], [8, 4, 67], [12, 4, 72]]);
    const code = generateCode(d);
    expect(code).toContain("// @compases 1");
    expect(canonical(await roundTrip(code, 1))).toEqual(canonical(d));
  });

  it("rests, dotted values and accidentals", async () => {
    const d = doc(2, [[2, 6, 61], [8, 3, 63], [12, 1, 66], [20, 12, 70]]);
    expect(canonical(await roundTrip(generateCode(d), 2))).toEqual(canonical(d));
  });

  it("chords, and several measures", async () => {
    const d = doc(3, [[0, 4, 60], [0, 4, 64], [0, 4, 67], [16, 8, 48], [16, 8, 55], [40, 8, 72]]);
    expect(canonical(await roundTrip(generateCode(d), 3))).toEqual(canonical(d));
  });

  it("a note crossing the barline stays ONE note (not re-attacked)", async () => {
    const d = doc(2, [[12, 8, 60]]);
    const back = await roundTrip(generateCode(d), 2);
    expect(back.events).toHaveLength(1);
    expect(canonical(back)).toEqual(canonical(d));
    expect(buildScoreFromQ(docToQ(back), 2).measures[0].treble[0].at(-1)?.tieNext).toBe(true);
  });

  it("dynamics and articulations", async () => {
    let d = doc(2, [[0, 4, 60], [4, 4, 62], [8, 4, 64], [12, 4, 65], [16, 4, 67]]);
    d = setDynamic(d, d.events[0].id, "p");
    d = setDynamic(d, d.events[2].id, "f");
    d = setArticulation(d, [d.events[1].id], "staccato");
    d = setArticulation(d, [d.events[3].id], "tenuto");
    const back = await roundTrip(generateCode(d), 2);
    expect(canonical(back)).toEqual(canonical(d));
    const s = buildScoreFromQ(docToQ(back), 2);
    expect(s.measures[0].treble[0].map((n) => n.dynamic ?? "-").join(",")).toBe("p,-,f,-");
  });

  it("overlapping material becomes separate voices", async () => {
    const d = doc(1, [[0, 16, 72], [0, 4, 60], [4, 4, 62], [8, 8, 64]]);
    expect(canonical(await roundTrip(generateCode(d), 1))).toEqual(canonical(d));
    expect(generateCode(d)).toContain("stack(");
  });

  it("empty score", async () => {
    const d: Doc = { measures: 2, events: [] };
    expect(await roundTrip(generateCode(d), 2)).toEqual({ measures: 2, events: [] });
  });

  it("the directives are written and parsed back", () => {
    const code = generateCode(doc(5, [[0, 4, 60]]), { staff: "piano" });
    expect(parseDirectives(code)).toEqual({ measures: 5, staff: "piano", key: "C" });
  });

  it("code is a fixed point: regenerating from the evaluation gives identical text", async () => {
    const d = doc(2, [[0, 4, 60], [0, 4, 64], [6, 6, 59], [16, 16, 48]], { 0: { gain: 0.4 }, 1: { gain: 0.4 }, 3: { clip: 0.4, gain: 0.95 } });
    const code = generateCode(d);
    expect(generateCode(await roundTrip(code, 2))).toBe(code);
  });
});

describe("key signatures in generated code", () => {
  it.each(["G", "Bb", "Eb", "F#m", "Db"])("key %s: directive written, names read back by real Strudel", async (key) => {
    const d = doc(2, [[0, 4, 70], [4, 4, 63], [8, 4, 61], [12, 4, 66], [16, 8, 58]]);
    const code = generateCode(d, { key });
    expect(code).toContain(`// @tonalidad ${key}`);
    expect(parseDirectives(code).key).toBe(key);
    expect(canonical(await roundTrip(code, 2))).toEqual(canonical(d));
  });
  it("C major writes no key directive", () => {
    expect(generateCode(doc(1, [[0, 4, 60]]))).not.toContain("@tonalidad");
  });
});

describe("property: random documents survive the round trip through real Strudel", () => {
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  it("60 random documents", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 7919);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      const measures = 1 + Math.floor(r() * 4);
      const total = totalSlots({ measures });
      const groupGain = new Map<string, number | undefined>();
      const groupClip = new Map<string, number | undefined>();
      const events = [];
      for (let i = 0; i < 1 + Math.floor(r() * 14); i++) {
        const start = Math.floor(r() * total);
        const dur = Math.min(pick([1, 2, 3, 4, 6, 8, 12, 16, 20, 24]), total - start);
        const k = `${start}:${dur}`;
        if (!groupGain.has(k)) groupGain.set(k, pick([undefined, 0.4, 0.7, 0.95]));
        if (!groupClip.has(k)) groupClip.set(k, pick([undefined, undefined, 0.4, 1.5]));
        events.push({ id: i + 1, start, dur, midi: 36 + Math.floor(r() * 50), gain: groupGain.get(k), clip: groupClip.get(k) });
      }
      const d = normalize({ measures, events });
      const code = generateCode(d, { key: pick(["C", "G", "Bb", "Eb", "F#m", "Ab"]) });
      const back = await roundTrip(code, measures);
      expect(canonical(back), `seed ${seed}\n${code}`).toEqual(canonical(d));
      expect(generateCode(back, { key: parseDirectives(code).key }), `fixed point, seed ${seed}`).toBe(code);
    }
  }, 120000);
});

describe("editing operations produce code that plays back the edit", () => {
  it("add note -> code -> evaluate", async () => {
    let d: Doc = { measures: 2, events: [] };
    d = addNote(d, { start: 0, midi: 60, dur: 4 }, false).doc;
    d = addNote(d, { start: 4, midi: 62, dur: 12 }, false).doc;
    d = addNote(d, { start: 16, midi: 48, dur: 16 }, true).doc;
    expect(canonical(await roundTrip(generateCode(d), 2))).toEqual(canonical(d));
  });
});
