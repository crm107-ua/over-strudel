/// <reference lib="webworker" />
import { evaluateFull } from "@/lib/strudelRuntime";
import type { WorkerRequest, WorkerResponse } from "@/lib/types";

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, code, cycles } = e.data;
  const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);
  try {
    post({ id, ok: true, ...(await evaluateFull(code, cycles)) });
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
