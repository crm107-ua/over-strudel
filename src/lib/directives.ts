/**
 * Score directives: special comments at the top of the code that tell the NOTATION how to draw.
 * They are plain `//` comments, so Strudel itself ignores them.
 *
 *   // @compases 8          -> draw 8 measures (1 Strudel cycle = 1 measure of 4/4)
 *   // @pentagrama piano    -> force the grand staff (treble + bass)
 *   // @pentagrama sol      -> force one treble staff (low notes use ledger lines)
 *   // @pentagrama auto     -> default: grand staff only if any note is below middle C (C4)
 *   // @titulo Mi pieza    -> title printed on the exported PDF
 *   // @tonalidad G         -> key signature (C G D A E B F# C# F Bb Eb Ab Db Gb Cb, minor with "m": Am Em ...)
 */
import { DEFAULT_KEY, getKey, isKnownKey } from "./keys";

export type StaffMode = "auto" | "treble" | "piano";

export interface Directives {
  measures: number | null;
  staff: StaffMode;
  /** key signature id (see lib/keys), default "C" */
  key: string;
  /** title for the PDF export (// @titulo ...), null when absent */
  title: string | null;
}

export const MAX_MEASURES = 64;

export function parseDirectives(code: string): Directives {
  const out: Directives = { measures: null, staff: "auto", key: DEFAULT_KEY, title: null };
  for (const line of code.split(/\r?\n/)) {
    const t = /^\s*\/\/\s*@(?:titulo|título|title)\s+(.+?)\s*$/i.exec(line);
    if (t) {
      out.title = t[1].slice(0, 120);
      continue;
    }
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

const DIRECTIVE_RE: Record<"compases" | "tonalidad", RegExp> = {
  compases: /^[ \t]*\/\/[ \t]*@(?:compases|measures)\b.*$/im,
  tonalidad: /^[ \t]*\/\/[ \t]*@(?:tonalidad|key)\b.*$/im,
};

/**
 * Set (or remove, with `null`) one directive in hand-written code, touching nothing else: the existing line is
 * replaced in place; when absent it is added at the very top.
 */
export function setDirective(code: string, name: "compases" | "tonalidad", value: string | number | null): string {
  const re = DIRECTIVE_RE[name];
  const line = value === null ? null : `// @${name} ${value}`;
  if (re.test(code)) {
    return line === null ? code.replace(new RegExp(re.source + "\r?\n?", "im"), "") : code.replace(re, line);
  }
  return line === null ? code : `${line}\n${code}`;
}

/**
 * Shift the whole piece by `semis` semitones by appending `.transpose(n)` to the last statement, merging with a
 * `.transpose(m)` that is already there. Returns null when the end of the code cannot take it safely (the caller then
 * verifies with the real engine or falls back to regenerating the code).
 */
export function appendTranspose(code: string, semis: number): string | null {
  if (!semis) return code;
  const tail = /\.transpose\((-?\d+)\)([ \t]*;?[ \t]*(?:\r?\n[ \t]*)*)$/.exec(code);
  if (tail) {
    const n = parseInt(tail[1], 10) + semis;
    return code.slice(0, tail.index) + (n === 0 ? "" : `.transpose(${n})`) + tail[2];
  }
  const lines = code.replace(/\s+$/, "").split(/\r?\n/);
  const last = lines[lines.length - 1];
  if (!last.trim() || /^\s*\/\//.test(last) || last.includes("//")) return null;
  lines[lines.length - 1] = last.replace(/;?\s*$/, "") + `.transpose(${semis})` + (/;\s*$/.test(last) ? ";" : "");
  return lines.join("\n") + "\n";
}
