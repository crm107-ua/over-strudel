import { describe, expect, it } from "vitest";
import { buildScoreFromQ } from "./middleware/buildScore";
import { docToQ, normalize, type Doc } from "./edit/doc";
import { A4, measureNeed, pdfLayout } from "./exportPdf";

const scoreOf = (doc: Doc, grand = false, key = "C") => buildScoreFromQ(docToQ(normalize(doc)), doc.measures, { grand, key });
const empty = (n: number, grand = false) => scoreOf({ measures: n, events: [] }, grand);
const sixteenths = (m: number): Doc => ({
  measures: 3,
  events: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, start: m * 16 + i, dur: 1, midi: 60 + (i % 5) })),
});

describe("A4 layout of the exported score", () => {
  it("places every measure exactly once, in order, across the sheets", () => {
    const lay = pdfLayout(empty(37));
    const all = lay.pages.flatMap((p) => p.systems.flat());
    expect(all).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });

  it("never puts more than 4 measures in a system and fills them", () => {
    const lay = pdfLayout(empty(40));
    expect(lay.systems.every((s) => s.length <= 4)).toBe(true);
    expect(lay.systems.slice(1, -1).every((s) => s.length === 4)).toBe(true); // regular bars: 4 per line (the first system also carries clef + time signature)
  });

  it("a dense measure gets its own room instead of squeezing the whole piece", () => {
    const sc = scoreOf(sixteenths(1));
    expect(measureNeed(sc, 1)).toBeGreaterThan(measureNeed(sc, 0));
    const lay = pdfLayout(sc);
    const sys = lay.systems.find((s) => s.includes(1))!;
    expect(sys.reduce((a, i) => a + lay.weights[i], 0)).toBeLessThanOrEqual(lay.usable + 1e-6);
    expect(lay.systems.flat()).toEqual([0, 1, 2]);
  });

  it("the grand staff leaves room for fewer systems per sheet than a single staff", () => {
    const single = pdfLayout(empty(60, false));
    const grand = pdfLayout(empty(60, true));
    expect(Math.max(...single.pages.map((p) => p.systems.length))).toBeGreaterThan(Math.max(...grand.pages.map((p) => p.systems.length)));
  });

  it("every sheet fits inside an A4 page", () => {
    for (const grand of [false, true]) {
      const lay = pdfLayout(empty(80, grand));
      for (const p of lay.pages) {
        const used = 64 + p.systems.length * lay.sysH - 40 + (p.first ? 44 : 0);
        expect(used).toBeLessThanOrEqual(A4.h - 50 + 1);
      }
    }
  });

  it("an empty score is still one sheet", () => {
    expect(pdfLayout(empty(0)).pages).toHaveLength(1);
  });
});
