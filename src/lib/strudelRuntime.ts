import { evalScope, evaluate } from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import { createRepl, installExtras, resetDefaultJoin } from "./strudelExtras";
import type { Frac, RawEvent } from "./types";

// Pure pattern evaluation (no DOM, no WebAudio): shared by the Web Worker and the tests.
let ready: Promise<unknown> | null = null;
const repl = createRepl();
const init = () =>
  (ready ??= (async () => {
    await evalScope(import("@strudel/core"), import("@strudel/mini"), import("@strudel/tonal"));
    await installExtras();
  })());

// Strudel's Fraction may expose n/d/s as BigInt; plain numbers are structured-clone safe.
const frac = (f: { n: number | bigint; d: number | bigint; s?: number | bigint }): Frac => ({
  n: Number(f.s ?? 1) * Number(f.n),
  d: Number(f.d),
});

/** Evaluate Strudel code and return the onset events of the first `cycles` cycles. */
export async function evaluateToEvents(code: string, cycles: number): Promise<RawEvent[]> {
  return (await evaluateFull(code, cycles)).events;
}

/** Same, plus the tempo the code sets with setcpm / setcps (cycles per minute, null when it sets none). */
export async function evaluateFull(code: string, cycles: number): Promise<{ events: RawEvent[]; cpm: number | null }> {
  await init();
  repl.reset();
  resetDefaultJoin();
  const { pattern: last } = await evaluate(code, transpiler);
  const pattern = repl.resolve(last);
  if (!pattern || typeof pattern.queryArc !== "function") {
    throw new Error('El código debe devolver un patrón (p. ej. note("c4 e4")).');
  }
  const events: RawEvent[] = [];
  for (const h of pattern.queryArc(0, cycles)) {
    if (!h.whole || !h.hasOnset()) continue; // skip continuous / fragment haps
    const v = h.value;
    const obj: Record<string, unknown> = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { note: v };
    const locs: [number, number][] = (h.context?.locations ?? [])
      .filter((l: { start: unknown; end: unknown }) => typeof l.start === "number" && typeof l.end === "number")
      .map((l: { start: number; end: number }) => [l.start, l.end]);
    events.push({
      locs,
      value: v,
      begin: frac(h.whole.begin),
      end: frac(h.whole.end),
      gain: typeof obj.gain === "number" ? obj.gain : undefined,
      clip: typeof obj.clip === "number" ? obj.clip : typeof obj.sustain === "number" ? obj.sustain : undefined,
    });
  }
  return { events, cpm: repl.cpm };
}
