/// <reference lib="webworker" />
import { evaluateToEvents } from "@/lib/strudelRuntime";
import type { WorkerRequest, WorkerResponse } from "@/lib/types";

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, code, cycles } = e.data;
  const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);
  try {
    post({ id, ok: true, events: await evaluateToEvents(code, cycles) });
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
