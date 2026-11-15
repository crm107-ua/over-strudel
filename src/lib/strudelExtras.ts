import * as core from "@strudel/core";
import {
  Pattern as PatternClass,
  evalScope,
  gap,
  isPattern,
  pure,
  register,
  signal,
  silence,
  stack,
  stepcat,
  polymeter,
  stackCentre,
} from "@strudel/core";

/**
 * Compatibility layer: everything of Strudel's public API that the published `@strudel/*` packages do not expose in a
 * plain evaluation scope, so that any documented function can be used in the code without failing.
 *
 *  1. pure pattern functions missing from the published packages (stackCenter, juxFlip, isquare …) — real behaviour;
 *  2. REPL functions (`$:`, all, each, hush, setcpm, cpm …) — real behaviour, see {@link createRepl};
 *  3. aliases;
 *  4. stubs for functions that only act on audio, visuals or devices (samples, pianoroll, midi, osc, motion …): they keep
 *     the pattern structure so the score is unaffected, and are only installed where the real function is absent.
 */

type Pattern = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Scope = Record<string, unknown>;
const P = PatternClass.prototype as unknown as Record<string, unknown>;

/** Strings are patterns too (mini-notation): `"0 1".stackLeft(...)`. */
const asPat = (x: unknown): Pattern => (isPattern(x) ? (x as Pattern) : (pure(x) as Pattern));

/** Install a function both as a global and as a chainable method (`pat.name(...args)` = `name(pat, ...args)`). */
function defineBoth(scope: Scope, names: string[], fn: AnyFn, chain: (self: Pattern, ...a: any[]) => unknown = (self, ...a) => fn(self, ...a)) { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const n of names) {
    scope[n] = fn;
    if (!(n in P)) P[n] = function (this: Pattern, ...a: unknown[]) { return chain(this, ...a); };
  }
}

// ---------------------------------------------------------------------------------------------- 1. missing pure functions

const stackRepeat = (...pats: unknown[]) => {
  const ps = pats.map(asPat);
  const steps = Math.max(...ps.map((p) => Number((p as any)._steps ?? 1))); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (polymeter as AnyFn)(...ps).pace(steps);
};

const flipBy = (register(["juxFlipBy", "juxflipby", "fluxBy", "fluxby"], (by: number, func: AnyFn, pat: Pattern) => {
  const half = by / 2;
  const pan = (v: Record<string, number>, d: number) => Object.assign({}, v, { pan: (v.pan ?? 0.5) + d });
  // the mirror of juxBy: the transformed copy goes LEFT, the original RIGHT
  return stack(func(pat.withValue((v: any) => pan(v, -half))), pat.withValue((v: any) => pan(v, half))); // eslint-disable-line @typescript-eslint/no-explicit-any
}) as Record<string, AnyFn>).juxFlipBy;

const isquare = signal((t: number) => 1 - Math.floor((t * 2) % 2));

/** isobite(struct, pat): the structure repeats every cycle while the values of `pat` are used in order (isorhythm). */
const isobite = (register(["isobite", "cycleStruct", "cyclestruct"], (structure: unknown, pat: Pattern) => {
  const st = asPat(structure);
  const vals = (pat as any).firstCycleValues as unknown[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!vals?.length) return silence;
  let n = -1;
  return (st as any).filterValues(Boolean).fmap(() => vals[++n % vals.length]); // eslint-disable-line @typescript-eslint/no-explicit-any
}, false) as Record<string, AnyFn>).isobite;

const ftranspose = (register(["ftranspose", "ftrans", "fTrans", "fTranspose"], (semis: number, pat: Pattern) =>
  (pat as any).withValue((v: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    typeof v === "object" && v && typeof v.freq === "number" ? { ...v, freq: v.freq * 2 ** (semis / 12) } : v,
  ),
) as Record<string, AnyFn>).ftranspose;

/**
 * `setDefaultJoin('mix')`: events of two patterns are combined with the given alignment by default. Every operator
 * (add, set, controls like .note() …) joins through `_opIn` unless an alignment is named explicitly, so redirecting
 * `_opIn` changes the default for all of them.
 */
const JOINS: Record<string, string> = { in: "In", out: "Out", mix: "Mix", squeeze: "Squeeze", squeezeout: "SqueezeOut", reset: "Reset", restart: "Restart", poly: "Poly" };
let originalOpIn: unknown;
function setDefaultJoin(_scope: Scope, method: string) {
  const m = String(method).replace(/^['"]|['"]$/g, "");
  const how = JOINS[m.toLowerCase()];
  if (!how) throw new Error(`setDefaultJoin: alineación desconocida «${m}» (usa ${Object.keys(JOINS).join(", ")})`);
  originalOpIn ??= P._opIn;
  P._opIn = how === "In" ? originalOpIn : P[`_op${how}`];
  return silence;
}

// --------------------------------------------------------------------------------------------------------------- 3. aliases

const ALIASES: [string, string][] = [
  ["delays", "delaysync"],
  ["distortion", "distortvol"],
  ["datt", "duckattack"],
  ["fme", "fmenv"],
  ["bb", "byteBeatExpression"],
  ["pwr", "pwrate"],
  ["pws", "pwsweep"],
  ["stackCenter", "stackCentre"],
];

// ----------------------------------------------------------------------------------------------------------------- 4. stubs

/** Pattern methods / functions that only act on audio, drawing or devices: pass the pattern through unchanged. */
export const PASS_THROUGH = [
  "pianoroll", "punchcard", "scope", "tscope", "fscope", "spectrum", "spiral", "wordfall", "markcss", "pitchwheel",
  "midi", "midikeys", "midibend", "midichan", "midicmd", "midimaps", "midiport", "miditouch", "progNum", "sysex", "sysexdata", "sysexid",
  "ccn", "ccv", "nrpnn", "nrpv", "channel", "osc", "oschost", "oscport", "csoundm", "tune", "xen", "edoScale",
  "worklet", "initDough", "dough", "withBase", "base", "i",
];
/** Functions with no meaning without the audio engine / a device: return silence (a harmless statement). */
export const SILENT = [
  "samples", "soundAlias", "aliasBank", "tables", "setGainCurve", "setMaxPolyphony", "defaultmidimap", "midin", "createCC", "onSchedule",
  "getDevice", "getDuration", "getMidiDeviceNamesString", "open", "close", "generateGraph", "generateReverb", "readInputs", "writeOutputs",
  "shiftInputBuffers", "shiftOutputBuffers", "handleOutputBuffersToRetrieve", "prepareInputBuffersToSend", "reallocateChannelsIfNeeded",
  "applyGradualLowpass", "applyHannWindow", "computeMagnitudes", "findPeaks", "shiftPeaks", "chyx",
];
/** Continuous sensor / UI signals (device motion, sliders): a constant 0 in the notation. */
export const SENSORS = [
  "absoluteOrientationAlpha", "absOriA", "absOriZ", "absoluteOrientationZ", "absoluteOrientationBeta", "absOriB", "absOriX", "absoluteOrientationX",
  "absoluteOrientationGamma", "absOriG", "absOriY", "absoluteOrientationY", "accelerationX", "accX", "accelerationY", "accY", "accelerationZ", "accZ",
  "gravityX", "gravX", "gravityY", "gravY", "gravityZ", "gravZ", "orientationAlpha", "oriA", "oriZ", "orientationZ", "orientationBeta", "oriB", "oriX",
  "orientationX", "orientationGamma", "oriG", "oriY", "orientationY", "rotationAlpha", "rotA", "rotZ", "rotationZ", "rotationBeta", "rotB", "rotX",
  "rotationX", "rotationGamma", "rotG", "rotY", "rotationY",
];

/**
 * Registers the compatibility layer in the evaluation scope. `real` = true when the real audio modules are loaded
 * (main thread), so stubs never replace a real implementation.
 */
export async function installExtras(opts: { stubsOnlyIfMissing?: boolean } = {}) {
  const scope: Scope = {};
  const has = (n: string) => n in globalThis || n in P;

  const add = (names: string[], fn: AnyFn) => {
    for (const n of names) if (!has(n)) scope[n] = fn;
  };

  // 1 — pure functions
  defineBoth(scope, ["stackRepeat"], stackRepeat, (self, ...a) => stackRepeat(self, ...a));
  if (!has("stackCenter")) defineBoth(scope, ["stackCenter"], (...p: unknown[]) => (stackCentre as AnyFn)(...p.map(asPat)), (self, ...a) => (stackCentre as AnyFn)(self, ...a.map(asPat)));
  for (const [n, f] of [["stackLeft", (core as Scope).stackLeft], ["stackRight", (core as Scope).stackRight], ["stackCentre", stackCentre]] as [string, AnyFn][])
    if (!(n in P)) P[n] = function (this: Pattern, ...a: unknown[]) { return f(this, ...a.map(asPat)); };
  scope.juxFlipBy = flipBy; scope.juxflipby = flipBy; scope.fluxBy = flipBy; scope.fluxby = flipBy;
  const flip = (register(["juxFlip", "juxflip", "flux"], (func: AnyFn, pat: Pattern) => flipBy(1, func, pat)) as Record<string, AnyFn>).juxFlip;
  scope.juxFlip = flip; scope.juxflip = flip; scope.flux = flip;
  scope.isquare = isquare;
  scope.isquare2 = (isquare as any).toBipolar(); // eslint-disable-line @typescript-eslint/no-explicit-any
  scope.isobite = isobite; scope.cycleStruct = isobite; scope.cyclestruct = isobite;
  scope.ftranspose = ftranspose; scope.ftrans = ftranspose; scope.fTrans = ftranspose; scope.fTranspose = ftranspose;
  scope.setDefaultJoin = (m: string) => setDefaultJoin(scope, m);
  scope.K = (x: unknown) => () => x;
  scope.pickAndRename = (P.pick as AnyFn) ? (...a: unknown[]) => (asPat(a[0]) as any).pick(...a.slice(1)) : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

  // 3 — aliases (only when the target exists)
  for (const [alias, target] of ALIASES) {
    if (has(alias)) continue;
    const t = (globalThis as Scope)[target] ?? P[target];
    if (typeof t === "function") {
      scope[alias] = (globalThis as Scope)[target] ?? ((p: Pattern, ...a: unknown[]) => (P[target] as AnyFn).apply(asPat(p), a));
      if (!(alias in P) && typeof P[target] === "function") P[alias] = P[target];
    }
  }

  // 4 — stubs
  const passthrough = () =>
    function (this: unknown, ...a: unknown[]) {
      // method call: return the pattern; global call: return the first pattern argument (or silence)
      if (isPattern(this) && this !== globalThis) return this;
      const first = a.find(isPattern);
      return first ?? silence;
    };
  for (const n of PASS_THROUGH) {
    if (opts.stubsOnlyIfMissing === false || !has(n)) {
      scope[n] = passthrough();
      if (!(n in P)) P[n] = function (this: Pattern) { return this; };
    }
  }
  add(SILENT, () => silence);
  for (const n of SENSORS) if (opts.stubsOnlyIfMissing === false || !has(n)) scope[n] = signal(() => 0);
  add(["slider"], (v: unknown) => pure(v));

  for (const [k, v] of Object.entries(scope)) if (v !== undefined) (globalThis as Scope)[k] = v;
  await evalScope(scope);
  void gap; void stepcat;
}

// ---------------------------------------------------------------------------------------------------------- 2. the mini REPL

export function resetDefaultJoin() {
  if (originalOpIn) P._opIn = originalOpIn;
}

export interface Repl {
  /** after evaluating: the pattern the labelled statements (`$:`) + all/each resolve to, or `pattern` when none */
  resolve(pattern: unknown): Pattern;
  /** tempo set by the code, in cycles per minute, or null if the code never called setcpm/setcps */
  readonly cpm: number | null;
  reset(): void;
}

/**
 * The part of Strudel's REPL that changes WHAT is played: labelled patterns (`$:`, `d1:`, `_name:` muted, `S$:` solo),
 * `all`, `each`, `hush`, `setcps`/`setcpm` and `cpm`. Mirrors @strudel/core's repl.mjs, minus the scheduler.
 */
export function createRepl(): Repl {
  let pPatterns: Record<string, Pattern> = {};
  let anonymous = 0;
  let allT: AnyFn[] = [];
  let eachT: AnyFn | undefined;
  let cps: number | null = null;
  const unpure = (x: any) => (x && x._Pattern ? x.__pure : x); // eslint-disable-line @typescript-eslint/no-explicit-any

  const reset = () => {
    pPatterns = {};
    anonymous = 0;
    allT = [];
    eachT = undefined;
    cps = null;
  };
  const hush = () => {
    pPatterns = {};
    anonymous = 0;
    allT = [];
    eachT = undefined;
    return silence;
  };

  P.p = function (this: Pattern, id: string | number) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return silence;
    let key = String(id);
    if (key.includes("$")) key = `${key}${anonymous++}`;
    pPatterns[key] = this;
    return this;
  };
  P.q = () => silence;
  for (let i = 1; i < 10; i++) {
    Object.defineProperty(PatternClass.prototype, `d${i}`, { get() { return (this as any).p(i); }, configurable: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.defineProperty(PatternClass.prototype, `p${i}`, { get() { return (this as any).p(i); }, configurable: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
    P[`q${i}`] = () => silence;
  }

  const setCps = (v: unknown) => {
    const n = Number(unpure(v));
    if (!Number.isFinite(n) || n <= 0) throw new Error("setcps / setcpm: se esperaba un número positivo");
    cps = n;
    return silence;
  };
  const setCpm = (v: unknown) => setCps(Number(unpure(v)) / 60);
  const cpm = register("cpm", (v: number, pat: Pattern) => (pat as any)._fast(v / 60 / (cps ?? 0.5))) as AnyFn; // eslint-disable-line @typescript-eslint/no-explicit-any

  const scope: Scope = {
    all: (t: AnyFn) => (allT.push(t), silence),
    each: (t: AnyFn) => ((eachT = t), silence),
    hush,
    cpm,
    setCps, setcps: setCps, setCpm, setcpm: setCpm,
  };
  Object.assign(globalThis, scope);

  return {
    reset,
    get cpm() { return cps === null ? null : Math.round(cps * 60 * 1000) / 1000; },
    resolve(pattern: unknown) {
      let pat: unknown = pattern;
      const keys = Object.keys(pPatterns);
      if (keys.length) {
        let list: Pattern[] = [];
        let solo = false;
        for (const key of keys) {
          const isSolo = key.length > 1 && key.startsWith("S");
          if (isSolo && !solo) { list = []; solo = true; }
          if (!solo || isSolo) list.push(pPatterns[key]);
        }
        if (eachT) list = list.map((x) => eachT!(x));
        pat = stack(...list);
      } else if (eachT && isPattern(pat)) pat = eachT(pat);
      for (const t of allT) pat = t(pat);
      return isPattern(pat) ? (pat as Pattern) : (silence as Pattern);
    },
  };
}
