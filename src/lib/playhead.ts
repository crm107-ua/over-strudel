import { getCycle } from "./audioEngine";

/**
 * A single requestAnimationFrame loop that publishes the playback position (in cycles) to
 * subscribers (score cursor, editor highlight). Kept outside React so 60fps updates never re-render.
 * `t === null` is published once when playback stops so listeners can clear their visuals.
 */
type Listener = (t: number | null) => void;
const listeners = new Set<Listener>();
let raf = 0;

function frame() {
  const t = getCycle();
  listeners.forEach((l) => l(t));
  raf = requestAnimationFrame(frame);
}

export function startPlayhead() {
  if (!raf) raf = requestAnimationFrame(frame);
}

export function stopPlayhead() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  listeners.forEach((l) => l(null));
}

export function subscribePlayhead(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
