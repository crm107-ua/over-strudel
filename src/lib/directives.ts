/**
 * Score directives: special comments at the top of the code that tell the NOTATION how to draw.
 * They are plain `//` comments, so Strudel itself ignores them.
 *
 *   // @compases 8          -> draw 8 measures (1 Strudel cycle = 1 measure of 4/4)
 *   // @pentagrama piano    -> force the grand staff (treble + bass)
 *   // @pentagrama sol      -> force one treble staff (low notes use ledger lines)
 *   // @pentagrama auto     -> default: grand staff only if any note is below middle C (C4)
 *   // @tonalidad G         -> key signature (C G D A E B F# C# F Bb Eb Ab Db Gb Cb, minor with "m": Am Em ...)
 */
import { DEFAULT_KEY, getKey, isKnownKey } from "./keys";

export type StaffMode = "auto" | "treble" | "piano";

export interface Directives {
  measures: number | null;
  staff: StaffMode;
  /** key signature id (see lib/keys), default "C" */
  key: string;
}

export const MAX_MEASURES = 64;

export function parseDirectives(code: string): Directives {
  const out: Directives = { measures: null, staff: "auto", key: DEFAULT_KEY };
  for (const line of code.split(/\r?\n/)) {
    const m = /^\s*\/\/\s*@(\w+)\s+(\S+)/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].toLowerCase();
    if (key === "compases" || key === "measures") {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 1) out.measures = Math.min(MAX_MEASURES, n);
    } else if (key === "tonalidad" || key === "key") {
      if (isKnownKey(m[2])) out.key = getKey(m[2]).id;
    } else if (key === "pentagrama" || key === "staff") {
      if (val === "sol" || val === "treble") out.staff = "treble";
      else if (val === "piano" || val === "grand") out.staff = "piano";
      else if (val === "auto") out.staff = "auto";
    }
  }
  return out;
}
