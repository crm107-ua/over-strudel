import type { RawEvent, WorkerRequest, WorkerResponse } from "./types";

export interface PatternResult {
  events: RawEvent[];
  /** tempo set by setcpm/setcps in the code (cycles per minute) or null */
  cpm: number | null;
}

const TIMEOUT_MS = 1500;
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (e: PatternResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function spawn(): Worker {
  const w = new Worker(new URL("../workers/strudel.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve({ events: e.data.events, cpm: e.data.cpm });
    else p.reject(new Error(e.data.error));
  };
  return w;
}

/** Evaluate code in the worker; a hung worker (infinite loop) is killed and recreated. */
export function queryPattern(code: string, cycles = 4): Promise<PatternResult> {
  worker ??= spawn();
  const id = ++seq;
  // a newer request supersedes older ones
  for (const [oid, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error("superseded"));
    pending.delete(oid);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      reject(new Error("Tiempo de evaluación agotado (¿bucle infinito?)"));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    const req: WorkerRequest = { id, code, cycles };
    worker!.postMessage(req);
  });
}
