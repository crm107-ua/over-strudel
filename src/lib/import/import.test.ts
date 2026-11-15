import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { canonical, docFromQ } from "../edit/doc";
import { parseDirectives } from "../directives";
import { quantize } from "../middleware/quantize";
import { evaluateFull } from "../strudelRuntime";
import { convertScore, type ImportOptions } from "./convert";
import { parseMusicXML } from "./musicxml";

(globalThis as unknown as { DOMParser: unknown }).DOMParser = DOMParser;

// ---- tiny MusicXML builder ------------------------------------------------------------------------------------
const pitch = (p: string) => {
  const m = /^([A-G])([#b]?)(\d)$/.exec(p)!;
  return `<pitch><step>${m[1]}</step>${m[2] ? `<alter>${m[2] === "#" ? 1 : -1}</alter>` : ""}<octave>${m[3]}</octave></pitch>`;
};
const N = (p: string, d: number, extra = "", pre = "") => `<note>${pre}${pitch(p)}<duration>${d}</duration>${extra}</note>`;
const R = (d: number) => `<note><rest/><duration>${d}</duration></note>`;
const chord = (p: string, d: number) => N(p, d, "", "<chord/>");
const attrs = (o: { div?: number; beats?: number; type?: number; fifths?: number; mode?: string; transpose?: number } = {}) =>
  `<attributes><divisions>${o.div ?? 1}</divisions>${o.fifths !== undefined ? `<key><fifths>${o.fifths}</fifths>${o.mode ? `<mode>${o.mode}</mode>` : ""}</key>` : ""}<time><beats>${o.beats ?? 4}</beats><beat-type>${o.type ?? 4}</beat-type></time>${o.transpose !== undefined ? `<transpose><chromatic>${o.transpose}</chromatic></transpose>` : ""}</attributes>`;
const M = (n: number, body: string, attr = "") => `<measure number="${n}"${attr}>${body}</measure>`;
const part = (id: string, ...ms: string[]) => `<part id="${id}">${ms.join("")}</part>`;
const score = (parts: string, head = "") =>
  `<?xml version="1.0"?><score-partwise version="4.0">${head}<part-list>${[...parts.matchAll(/part id="(\w+)"/g)].map((m) => `<score-part id="${m[1]}"><part-name>${m[1]}</part-name></score-part>`).join("")}</part-list>${parts}</score-partwise>`;
const imp = (xml: string, o?: ImportOptions) => convertScore(parseMusicXML(xml), o);
const rows = (r: ReturnType<typeof imp>) => r.doc.events.map((e) => [e.start, e.dur, e.midi]);

/** code -> real Strudel -> document must be exactly the imported document */
async function reproduces(r: ReturnType<typeof imp>) {
  const { events } = await evaluateFull(r.code, r.doc.measures);
  expect(canonical(docFromQ(quantize(events, r.doc.measures), r.doc.measures))).toEqual(canonical(r.doc));
}

describe("MusicXML -> document", () => {
  it("quarter notes on the grid, key, and the code plays exactly that", async () => {
    const r = imp(score(part("P1", M(1, attrs({ fifths: 0 }) + N("C4", 1) + N("D4", 1) + N("E4", 1) + N("F4", 1)))));
    expect(rows(r)).toEqual([[0, 4, 60], [4, 4, 62], [8, 4, 64], [12, 4, 65]]);
    expect(r.keyId).toBe("C");
    expect(r.doc.measures).toBe(1);
    await reproduces(r);
  });

  it("accidentals, octaves and the key signature (D major)", async () => {
    const r = imp(score(part("P1", M(1, attrs({ fifths: 2 }) + N("F#4", 2) + N("Bb3", 2)))));
    expect(rows(r)).toEqual([[0, 8, 66], [8, 8, 58]]);
    expect(r.keyId).toBe("D");
    expect(parseDirectives(r.code).key).toBe("D");
  });

  it("a minor key", () => {
    expect(imp(score(part("P1", M(1, attrs({ fifths: 0, mode: "minor" }) + N("A3", 4))))).keyId).toBe("Am");
  });

  it("chords share the start", async () => {
    const r = imp(score(part("P1", M(1, attrs() + N("C4", 4) + chord("E4", 4) + chord("G4", 4)))));
    expect(rows(r)).toEqual([[0, 16, 60], [0, 16, 64], [0, 16, 67]]);
    await reproduces(r);
  });

  it("a tied note across the barline is ONE note", async () => {
    const r = imp(score(part("P1", M(1, attrs() + R(2) + N("C4", 2, '<tie type="start"/><notations><tied type="start"/></notations>')) + M(2, N("C4", 1, '<tie type="stop"/>') + R(3)))));
    expect(rows(r)).toEqual([[8, 12, 60]]);
    await reproduces(r);
  });

  it("two voices with backup", async () => {
    const r = imp(
      score(part("P1", M(1, attrs() + N("C5", 2) + N("D5", 2) + "<backup><duration>4</duration></backup>" + N("C4", 4)))),
    );
    expect(rows(r)).toEqual([[0, 8, 72], [0, 16, 60], [8, 8, 74]].sort((a, b) => a[0] - b[0] || a[2] - b[2]));
    await reproduces(r);
  });

  it("several parts are merged into one score", () => {
    const r = imp(score(part("P1", M(1, attrs() + N("E5", 4))) + part("P2", M(1, attrs() + N("C3", 4)))));
    expect(rows(r)).toEqual([[0, 16, 48], [0, 16, 76]]);
    expect(r.report.parts).toEqual(["P1", "P2"]);
  });

  it("the pick-up measure sits at the end of the first measure", () => {
    const r = imp(score(part("P1", M(0, attrs() + N("G4", 1), ' implicit="yes"') + M(1, N("C5", 4)))));
    expect(rows(r)).toEqual([[12, 4, 67], [16, 16, 72]]);
    expect(r.doc.measures).toBe(2);
  });

  it("3/4 measures are padded into 4/4 measures and reported", () => {
    const r = imp(score(part("P1", M(1, attrs({ beats: 3 }) + N("C4", 3)) + M(2, N("D4", 3)))));
    expect(rows(r)).toEqual([[0, 12, 60], [16, 12, 62]]);
    expect(r.report.meters).toEqual(["3/4"]);
    expect(r.report.messages.join(" ")).toContain("3/4");
  });

  it("a long measure (6/4) takes two output measures", () => {
    const r = imp(score(part("P1", M(1, attrs({ beats: 6 }) + N("C4", 6)) + M(2, N("D4", 6)))));
    expect(rows(r)).toEqual([[0, 24, 60], [32, 24, 62]]);
    expect(r.doc.measures).toBe(4);
  });

  it("repeats are unrolled (or kept as written)", () => {
    const fwd = '<barline location="left"><repeat direction="forward"/></barline>';
    const bwd = '<barline location="right"><repeat direction="backward"/></barline>';
    const xml = score(part("P1", M(1, attrs() + fwd + N("C4", 4)), M(2, N("D4", 4) + bwd), M(3, N("E4", 4))));
    expect(imp(xml).report.playedMeasures).toBe(5);
    expect(rows(imp(xml)).map((r) => r[2])).toEqual([60, 62, 60, 62, 64]);
    expect(rows(imp(xml, { expandRepeats: false })).map((r) => r[2])).toEqual([60, 62, 64]);
  });

  it("1st / 2nd endings", () => {
    const fwd = '<barline location="left"><repeat direction="forward"/></barline>';
    const e1 = '<barline location="left"><ending number="1" type="start"/></barline>';
    const e1end = '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>';
    const e2 = '<barline location="left"><ending number="2" type="start"/></barline>';
    const e2end = '<barline location="right"><ending number="2" type="stop"/></barline>';
    const xml = score(part("P1", M(1, attrs() + fwd + N("C4", 4)), M(2, e1 + N("D4", 4) + e1end), M(3, e2 + N("E4", 4) + e2end)));
    expect(rows(imp(xml)).map((r) => r[2])).toEqual([60, 62, 60, 64]);
  });

  it("dynamics become gain and articulations clip", () => {
    const dyn = (d: string) => `<direction><direction-type><dynamics><${d}/></dynamics></direction-type></direction>`;
    const r = imp(score(part("P1", M(1, attrs() + dyn("p") + N("C4", 2, "<notations><articulations><staccato/></articulations></notations>") + N("D4", 2) + dyn("f") + N("E4", 2) + N("F4", 2, "<notations><articulations><tenuto/></articulations></notations>")))));
    const e = r.doc.events;
    expect(e.map((x) => x.gain)).toEqual([0.4, 0.4, 0.95, 0.95]);
    expect(e[0].clip).toBe(0.4);
    expect(e[3].clip).toBe(1.5);
    expect(r.code).toContain(".gain(");
  });

  it("expression can be left out", () => {
    const dyn = `<direction><direction-type><dynamics><f/></dynamics></direction-type></direction>`;
    const r = imp(score(part("P1", M(1, attrs() + dyn + N("C4", 4)))), { expression: false });
    expect(r.doc.events[0].gain).toBeUndefined();
    expect(r.code).not.toContain(".gain(");
  });

  it("tempo -> setcpm (quarter BPM / 4) and the engine reads it back", async () => {
    const sound = '<direction><direction-type><words>Slowly</words></direction-type><sound tempo="58"/></direction>';
    const r = imp(score(part("P1", M(1, attrs() + sound + N("C4", 4)))));
    expect(r.cpm).toBe(14.5);
    expect((await evaluateFull(r.code, 1)).cpm).toBe(14.5);
  });

  it("a metronome mark with a dotted beat unit", () => {
    const met = '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type></direction>';
    expect(imp(score(part("P1", M(1, attrs() + met + N("C4", 4))))).cpm).toBe(22.5);
  });

  it("title goes to @titulo", () => {
    const r = imp(score(part("P1", M(1, attrs() + N("C4", 4))), "<work><work-title>Mice on Venus</work-title></work>"));
    expect(r.title).toBe("Mice on Venus");
    expect(parseDirectives(r.code).title).toBe("Mice on Venus");
  });

  it("grace notes are skipped, triplets approximated, both reported", () => {
    const grace = `<note><grace/>${pitch("D4")}</note>`;
    const tri = (p: string) => N(p, 1, "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>");
    const r = imp(score(part("P1", M(1, attrs({ div: 3 }) + grace + N("C4", 3) + tri("E4") + tri("E4") + tri("E4") + N("G4", 3) + R(3)))));
    expect(r.report.messages.join(" ")).toMatch(/adorno/);
    expect(r.report.messages.join(" ")).toMatch(/tresillo/);
    expect(r.doc.events.every((e) => e.dur >= 1)).toBe(true);
    expect(rows(r)[0]).toEqual([0, 4, 60]);
  });

  it("a transposing part is imported at sounding pitch", () => {
    const r = imp(score(part("P1", M(1, attrs({ transpose: -2 }) + N("C4", 4)))));
    expect(rows(r)).toEqual([[0, 16, 58]]);
  });

  it("selecting a section of a long piece", () => {
    const ms = Array.from({ length: 10 }, (_, i) => M(i + 1, (i === 0 ? attrs() : "") + N("C4", 4)));
    const r = imp(score(part("P1", ...ms)), { from: 3, count: 4 });
    expect(r.doc.measures).toBe(4);
    expect(r.report.from).toBe(3);
    expect(rows(r).map((x) => x[0])).toEqual([0, 16, 32, 48]);
  });

  it("more than 64 measures: imports the first 64 and says so", () => {
    const ms = Array.from({ length: 70 }, (_, i) => M(i + 1, (i === 0 ? attrs() : "") + N("C4", 4)));
    const r = imp(score(part("P1", ...ms)));
    expect(r.doc.measures).toBe(64);
    expect(r.report.truncated).toBe(true);
    expect(r.report.messages.join(" ")).toContain("64");
  });

  it("an empty score and bad input give clear errors", () => {
    expect(imp(score(part("P1", M(1, attrs() + R(4))))).report.messages.join(" ")).toContain("no contiene notas");
    expect(() => parseMusicXML("<hola")).toThrow();
    expect(() => parseMusicXML("<html></html>")).toThrow(/MusicXML/);
  });
});
