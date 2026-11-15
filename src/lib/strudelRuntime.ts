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

/** Longest piece we look for when measuring how many measures a pattern lasts before it repeats. */
export const MAX_PERIOD = 32;

/**
 * How many cycles (measures) the pattern lasts before it repeats exactly: the smallest p such that every cycle equals
 * the one p cycles later, looking at 2×MAX_PERIOD cycles. null when it does not repeat within MAX_PERIOD (or is too slow
 * to inspect), e.g. random or very long material.
 */
export function detectPeriod(pattern: { queryArc(a: number, b: number): any[] }): number | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const span = MAX_PERIOD * 2;
  const t0 = Date.now();
  let haps: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    haps = pattern.queryArc(0, span);
  } catch {
    return null;
  }
  if (Date.now() - t0 > 400) return null;
  const sig: string[][] = Array.from({ length: span }, () => []);
  for (const h of haps) {
    if (!h.whole || !h.hasOnset()) continue;
    const b = Number(h.whole.begin.valueOf());
    const c = Math.floor(b + 1e-9);
    if (c < 0 || c >= span) continue;
    let v: string;
    try {
      v = JSON.stringify(h.value) ?? String(h.value);
    } catch {
      v = String(h.value);
    }
    sig[c].push(`${(b - c).toFixed(4)}|${Number(h.whole.end.valueOf() - h.whole.begin.valueOf()).toFixed(4)}|${v}`);
  }
  const keys = sig.map((a) => a.sort().join(";"));
  if (keys.every((k) => k === "")) return 1;
  for (let p = 1; p <= MAX_PERIOD; p++) {
    let ok = true;
    for (let c = 0; c + p < span && ok; c++) ok = keys[c] === keys[c + p];
    if (ok) return p;
  }
  return null;
}

/** Evaluate Strudel code and return the onset events of the first `cycles` cycles. */
export async function evaluateToEvents(code: string, cycles: number): Promise<RawEvent[]> {
  return (await evaluateFull(code, cycles)).events;
}

/** Same, plus the tempo the code sets with setcpm / setcps (cycles per minute, null when it sets none). */
export async function evaluateFull(code: string, cycles: number): Promise<{ events: RawEvent[]; cpm: number | null; period: number | null }> {
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
  return { events, cpm: repl.cpm, period: detectPeriod(pattern) };
}
