// Optional integration check (skipped unless OMR_XML points to a MusicXML produced by the OMR service from a PDF
// exported by this app): the recognised score is compared with the piece that generated that PDF, note by note.
//   OMR_XML=out.xml OMR_SOURCE=piece.js OMR_MEASURES=10 npx vitest run src/lib/import/omr-accuracy.test.ts
import { DOMParser } from "@xmldom/xmldom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docFromQ } from "../edit/doc";
import { quantize } from "../middleware/quantize";
import { evaluateFull } from "../strudelRuntime";
import { convertScore } from "./convert";
import { parseMusicXML } from "./musicxml";

(globalThis as unknown as { DOMParser: unknown }).DOMParser = DOMParser;
const xmlPath = process.env.OMR_XML;

describe.skipIf(!xmlPath)("OMR accuracy on an exported PDF", () => {
  it("recognises the notes of the original piece", async () => {
    const measures = Number(process.env.OMR_MEASURES ?? 10);
    const expected = docFromQ(quantize((await evaluateFull(readFileSync(process.env.OMR_SOURCE!, "utf8"), measures)).events, measures), measures);
    const got = convertScore(parseMusicXML(readFileSync(xmlPath!, "utf8"))).doc;
    const key = (e: { start: number; dur: number; midi: number }) => `${e.start}:${e.dur}:${e.midi}`;
    const exp = new Set(expected.events.map(key));
    const have = new Set(got.events.map(key));
    const hit = [...exp].filter((k) => have.has(k)).length;
    const pitchOnly = (d: typeof got) => new Set(d.events.map((e) => `${Math.floor(e.start / 4)}:${e.midi}`));
    const pe = pitchOnly(expected);
    const pg = pitchOnly(got);
    const pHit = [...pe].filter((k) => pg.has(k)).length;
    console.log(JSON.stringify({ expected: exp.size, got: have.size, exact: hit, exactRecall: hit / exp.size, pitchBeatRecall: pHit / pe.size, measures: got.measures }));
    console.log("MISSING", [...exp].filter((k) => !have.has(k)).slice(0, 25).join(" "));
    console.log("EXTRA", [...have].filter((k) => !exp.has(k)).slice(0, 25).join(" "));
    expect(hit / exp.size).toBeGreaterThan(0.9);
  });
});
