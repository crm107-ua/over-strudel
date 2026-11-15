import type { Articulation, Dynamic } from "../types";

export function gainToDynamic(gain: number | undefined): Dynamic | undefined {
  if (gain === undefined) return undefined;
  if (gain < 0.5) return "p";
  if (gain <= 0.85) return "mf";
  return "f";
}

export function clipToArticulation(clip: number | undefined): Articulation | undefined {
  if (clip === undefined) return undefined;
  if (clip <= 0.5) return "staccato";
  if (clip > 1) return "tenuto";
  return undefined;
}
