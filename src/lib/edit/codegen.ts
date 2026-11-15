import type { StaffMode } from "../directives";
import { allocateVoices, type Item } from "../middleware/buildScore";
import { DEFAULT_KEY, getKey, spellName } from "../keys";
import { SLOTS } from "../middleware/quantize";
import { docToQ, totalSlots, type Doc } from "./doc";

/**
 * Score -> Strudel code. Canonical form:
 *
 *   note(`c4@4 [e4,g4]@4 ~@8 ...`)   // one weighted step per note; weight = length in sixteenths
 *     .gain(`0.7@4 0.7@4 ~@8 ...`)   // same step structure, one value per step
 *     .slow(N)                       // the whole sequence spans N measures (N cycles)
 *
 * Weights make every step an exact multiple of 1/16 cycle, so notes may cross barlines (they stay ONE note).
 */
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Step {
  start: number;
  weight: number;
  note: string;
  gain: number;
  clip: number;
}

function voiceSteps(items: Item[], total: number, fifths: number, gain: (it: Item) => number, clip: (it: Item) => number): Step[] {
  const steps: Step[] = [];
  const rest = (a: number, b: number) => {
    // split rests at barlines: purely cosmetic (one line per measure), identical timing
    for (let s = a; s < b; ) {
      const next = Math.min(b, (Math.floor(s / SLOTS) + 1) * SLOTS);
      steps.push({ start: s, weight: next - s, note: "~", gain: 0, clip: 0 });
      s = next;
    }
  };
  let cursor = 0;
  for (const it of items) {
    if (it.start > cursor) rest(cursor, it.start);
    const names = [...new Set(it.midis)].sort((a, b) => a - b).map((m) => spellName(m, fifths));
    steps.push({
      start: it.start,
      weight: it.dur,
      note: names.length > 1 ? `[${names.join(",")}]` : names[0],
      gain: gain(it),
      clip: clip(it),
    });
    cursor = it.start + it.dur;
  }
  if (cursor < total) rest(cursor, total);
  return steps;
}

/** Lay steps out one measure per line. */
function lines(steps: Step[], text: (s: Step) => string, indent: string): string {
  const rows: string[][] = [];
  let measure = -1;
  for (const s of steps) {
    const m = Math.floor(s.start / SLOTS);
    if (m !== measure) {
      rows.push([]);
      measure = m;
    }
    rows[rows.length - 1].push(`${text(s)}@${s.weight}`);
  }
  return rows.map((r) => indent + r.join(" ")).join("\n");
}

export function generateCode(doc: Doc, opts: { staff?: StaffMode; key?: string; cpm?: number | null } = {}): string {
  const key = getKey(opts.key);
  const total = totalSlots(doc);
  const head = [`// @compases ${doc.measures}`];
  if (opts.staff && opts.staff !== "auto") head.push(`// @pentagrama ${opts.staff === "piano" ? "piano" : "sol"}`);
  if (key.id !== DEFAULT_KEY) head.push(`// @tonalidad ${key.id}`);
  head.push("// Generado desde la partitura · 1 ciclo = 1 compás");
  if (opts.cpm != null) head.push(`setcpm(${fmt(opts.cpm)})`);
  head.push("");

  if (!doc.events.length) return [...head, "silence", ""].join("\n");

  const q = docToQ(doc);
  const voices = allocateVoices(q);
  const items = voices.flat();
  const anyGain = items.some((i) => i.gain !== undefined);
  const anyClip = items.some((i) => i.clip !== undefined);
  // leading notes without a gain take the first defined one (so no accidental dynamic mark appears)
  const sortedItems = [...items].sort((a, b) => a.start - b.start || a.midis[0] - b.midis[0]);
  const firstGain = sortedItems.find((i) => i.gain !== undefined)?.gain ?? 0.7;
  const gainOf = new Map<Item, number>();
  let cur = firstGain;
  for (const it of sortedItems) {
    if (it.gain !== undefined) cur = it.gain;
    gainOf.set(it, cur);
  }

  const voiceCode = (v: Item[], indent: string) => {
    const steps = voiceSteps(v, total, key.fifths, (it) => gainOf.get(it) ?? firstGain, (it) => it.clip ?? 1);
    const parts = [`${indent}note(\`\n${lines(steps, (s) => s.note, indent + "  ")}\n${indent}\`)`];
    if (anyGain) parts.push(`${indent}  .gain(\`\n${lines(steps, (s) => (s.note === "~" ? "~" : fmt(s.gain)), indent + "    ")}\n${indent}  \`)`);
    if (anyClip) parts.push(`${indent}  .clip(\`\n${lines(steps, (s) => (s.note === "~" ? "~" : fmt(s.clip)), indent + "    ")}\n${indent}  \`)`);
    if (doc.measures > 1) parts.push(`${indent}  .slow(${doc.measures})`);
    return parts.join("\n");
  };

  const body =
    voices.length === 1
      ? voiceCode(voices[0], "").replace(/^\s+/, "")
      : `stack(\n${voices.map((v) => voiceCode(v, "  ")).join(",\n")}\n)`;
  return [...head, body, ""].join("\n");
}
