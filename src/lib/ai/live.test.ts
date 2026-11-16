// Optional live check against the real Gemini API (skipped unless GEMINI_API_KEY is set; costs a few requests):
//   GEMINI_API_KEY=... LIVE_TITLE="Für Elise" LIVE_MEASURES=16 npx vitest run src/lib/ai/live.test.ts
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docFromQ } from "../edit/doc";
import { quantize } from "../middleware/quantize";
import { evaluateFull } from "../strudelRuntime";
import { generatePiece } from "./generate";

describe.skipIf(!process.env.GEMINI_API_KEY)("live Gemini generation", () => {
  it("writes a valid, playable transcription", async () => {
    const title = process.env.LIVE_TITLE ?? "Für Elise — Beethoven";
    const measures = Number(process.env.LIVE_MEASURES ?? 16);
    const t0 = Date.now();
    const p = await generatePiece({ title, measures, apiKey: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL || undefined, onStage: (s) => console.log("[stage]", s), onAttempt: (a) => console.log("[attempt]", JSON.stringify(a)) });
    const secs = Math.round((Date.now() - t0) / 1000);
    const { events, cpm } = await evaluateFull(p.code, measures);
    const doc = docFromQ(quantize(events, measures), measures);
    console.log(JSON.stringify({ model: p.model, secs, attempts: p.attempts, notes: p.check.notes, docEvents: doc.events.length, cpm, key: p.key, bpm: p.bpm, layers: p.check.layers }));
    console.log("NOTES:", p.notes);
    if (process.env.LIVE_OUT) writeFileSync(process.env.LIVE_OUT, p.code);
    expect(p.check.ok).toBe(true);
    expect(doc.events.length).toBeGreaterThan(measures * 2);
  }, 600_000);
});
