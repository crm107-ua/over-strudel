import { isKnownKey } from "../keys";

/**
 * Static check of a generated piece, in the canonical form the editor writes and reads back exactly:
 *
 *   // @titulo ...   // @compases N   // @tonalidad X   setcpm(n)
 *   stack(
 *     note(`  one line per measure, each step `name@length` and the lengths of a line add up to 16  `).gain(`same layout`).slow(N),
 *     ...
 *   )
 *
 * Everything the model can get wrong in a way that would shift the rhythm is caught here, with an error message precise
 * enough to be sent back to the model so it can repair its own output.
 */

export interface PieceCheck {
  ok: boolean;
  errors: string[];
  measures: number;
  layers: number;
  /** note events (chord notes counted one by one) */
  notes: number;
  key: string | null;
  bpm: number | null;
}

const NOTE = "[a-gA-G](?:#|b)?[1-7]";
const STEP = new RegExp(`^(?:~|${NOTE}|\\[${NOTE}(?:,${NOTE})*\\])@(\\d+)$`);
const MAX_ERRORS = 12;

/** Split a line of steps on whitespace that is not inside [chord] brackets. */
function steps(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of line.trim()) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

interface Block {
  fn: "note" | "gain" | "clip";
  lines: string[][];
  /** the code right after the block's closing parenthesis, up to the next block (to find .slow(N)) */
  after: string;
}

function blocks(code: string): Block[] {
  const re = /\b(note|gain|clip)\(\s*`([^`]*)`\s*\)/g;
  const found: { fn: Block["fn"]; body: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) found.push({ fn: m[1] as Block["fn"], body: m[2], start: m.index, end: m.index + m[0].length });
  return found.map((f, i) => ({
    fn: f.fn,
    lines: f.body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(steps),
    // everything of this layer after the note(...) call (its .gain, .clip and .slow): up to the next note(...) layer
    after: code.slice(f.end, found.slice(i + 1).find((x) => x.fn === "note")?.start ?? code.length),
  }));
}

export function checkPiece(code: string, expectedMeasures?: number): PieceCheck {
  const errors: string[] = [];
  const err = (e: string) => errors.length < MAX_ERRORS && errors.push(e);

  const measures = parseInt(/^\s*\/\/\s*@compases\s+(\d+)/im.exec(code)?.[1] ?? "", 10);
  if (!Number.isFinite(measures)) err("Falta la directiva `// @compases N` al principio.");
  else if (measures < 1 || measures > 64) err(`@compases debe estar entre 1 y 64 (es ${measures}).`);
  else if (expectedMeasures && measures !== expectedMeasures) err(`@compases es ${measures} pero se pidieron exactamente ${expectedMeasures} compases.`);

  const key = /^\s*\/\/\s*@tonalidad\s+(\S+)/im.exec(code)?.[1] ?? null;
  if (key && !isKnownKey(key)) err(`Tonalidad «${key}» no válida: usa C G D A E B F# C# F Bb Eb Ab Db Gb Cb y los menores con «m» (Am, F#m…).`);

  const sc = /^\s*setcpm\(\s*([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/im.exec(code);
  const cpm = sc ? parseFloat(sc[1]) / (sc[2] ? parseFloat(sc[2]) : 1) : null;
  if (cpm === null) err("Falta `setcpm(bpm/4)` con el tempo (p. ej. `setcpm(104/4)`).");
  else if (cpm < 5 || cpm > 60) err(`setcpm(${cpm}) fuera de rango razonable (equivale a ${Math.round(cpm * 4)} BPM): usa bpm/4 entre 20 y 240 BPM.`);

  const all = blocks(code);
  if (!all.some((b) => b.fn === "note")) err("No hay ninguna capa `note(`…`)` con plantilla de comillas invertidas.");

  let notes = 0;
  let layers = 0;
  let current: Block | null = null;
  for (const b of all) {
    if (b.fn === "note") {
      layers++;
      current = b;
      if (measures && b.lines.length !== measures) err(`Capa ${layers}: tiene ${b.lines.length} líneas y debe tener exactamente ${measures} (una línea por compás).`);
      b.lines.forEach((line, li) => {
        let sum = 0;
        for (const tok of line) {
          const s = STEP.exec(tok);
          if (!s) {
            err(`Capa ${layers}, compás ${li + 1}: paso no válido «${tok}». Cada paso es nombre+octava@duración (c4@4), acorde [c4,e4]@4 o silencio ~@4.`);
            continue;
          }
          const w = parseInt(s[1], 10);
          if (w < 1 || w > 32) err(`Capa ${layers}, compás ${li + 1}: duración @${w} fuera de rango.`);
          sum += w;
          if (!tok.startsWith("~")) notes += tok.startsWith("[") ? tok.split(",").length : 1;
        }
        if (sum !== 16) err(`Capa ${layers}, compás ${li + 1}: las duraciones suman ${sum} y deben sumar 16 (semicorcheas) — línea: ${line.join(" ")}`);
      });
      if (measures > 1) {
        const slow = /\.slow\(\s*(\d+)\s*\)/.exec(b.after)?.[1];
        if (!slow) err(`Capa ${layers}: falta \`.slow(${measures})\` al final de la capa.`);
        else if (parseInt(slow, 10) !== measures) err(`Capa ${layers}: .slow(${slow}) debe ser .slow(${measures}).`);
      }
    } else if (current) {
      // .gain / .clip must repeat the layout of their note layer: same lines, same steps, same lengths
      if (b.lines.length !== current.lines.length) err(`Capa ${layers}: .${b.fn} tiene ${b.lines.length} líneas y debe tener ${current.lines.length} (igual que note).`);
      b.lines.forEach((line, li) => {
        const ref = current!.lines[li] ?? [];
        if (line.length !== ref.length) {
          err(`Capa ${layers}, compás ${li + 1}: .${b.fn} tiene ${line.length} pasos y note tiene ${ref.length}; deben coincidir paso a paso.`);
          return;
        }
        line.forEach((tok, i) => {
          const [val, w] = tok.split("@");
          const refW = ref[i].split("@")[1];
          const rest = ref[i].startsWith("~");
          if (w !== refW) err(`Capa ${layers}, compás ${li + 1}, paso ${i + 1}: .${b.fn} usa @${w} y note usa @${refW}.`);
          else if (!(rest ? val === "~" || Number.isFinite(parseFloat(val)) : Number.isFinite(parseFloat(val)))) err(`Capa ${layers}, compás ${li + 1}: valor «${val}» no numérico en .${b.fn}.`);
        });
      });
    }
  }
  if (all.some((b) => b.fn === "note") && notes === 0) err("La pieza no contiene ninguna nota (solo silencios).");

  return { ok: errors.length === 0, errors, measures: Number.isFinite(measures) ? measures : 0, layers, notes, key, bpm: cpm === null ? null : Math.round(cpm * 4) };
}
