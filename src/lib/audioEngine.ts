// Audio runs on the main thread (WebAudio is not available in Workers).
// The Worker remains the only source of the score.
type Repl = {
  evaluate: (code: string, autostart?: boolean) => Promise<unknown>;
  stop: () => void;
  scheduler: { now: () => number };
};
let repl: Promise<Repl> | null = null;
let replSync: Repl | null = null;

async function getRepl(): Promise<Repl> {
  repl ??= (async () => {
    const { initStrudel } = await import("@strudel/web");
    const { installExtras } = await import("./strudelExtras");
    const { SAMPLE_MAPS } = await import("./sounds");
    const r = (await initStrudel({
      prebake: async () => {
        await installExtras(); // functions the published packages lack (+ stubs for device/visual-only ones)
        const g = globalThis as unknown as { samples?: (src: string) => Promise<unknown> };
        // sample banks: a bank that fails to load must never block playback
        const load = Promise.allSettled(SAMPLE_MAPS.map((m) => g.samples?.(m)));
        await Promise.race([load, new Promise((res) => setTimeout(res, 10000))]);
      },
    })) as Repl;
    replSync = r;
    return r;
  })();
  return repl;
}

/** Must be called from a user gesture the first time (AudioContext autoplay policy). */
export async function playCode(code: string) {
  const r = await getRepl();
  await r.evaluate(code, true); // also hot-swaps the pattern while playing
}

export async function stopAudio() {
  if (!repl) return;
  (await repl).stop();
}

/** Current playback position in cycles (1 cycle = 1 measure), or null if the audio engine is not ready. */
export function getCycle(): number | null {
  const t = replSync?.scheduler?.now?.();
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}
