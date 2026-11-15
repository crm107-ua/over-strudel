import { generateCode } from "../edit/codegen";
import { newId, normalize, type Doc, type DocEvent } from "../edit/doc";
import { MAX_MEASURES } from "../directives";
import { KEYS } from "../keys";
import { playOrder, type XNote, type XScore } from "./musicxml";

export interface ImportOptions {
  /** unroll repeats and 1st/2nd endings (default true) */
  expandRepeats?: boolean;
  /** first measure to import (0-based, in play order) and how many (default: as many as fit, max 64) */
  from?: number;
  count?: number;
  /** import dynamics (p / mf / f) and articulations (default true) */
  expression?: boolean;
}

export interface ImportReport {
  parts: string[];
  /** measures as written / after unrolling repeats / imported into the editor */
  writtenMeasures: number;
  playedMeasures: number;
  importedMeasures: number;
  from: number;
  truncated: boolean;
  notes: number;
  meters: string[];
  tempoChanges: number;
  keyChanges: number;
  /** human readable list of everything that was approximated or left out */
  messages: string[];
}

export interface ImportResult {
  doc: Doc;
  code: string;
  keyId: string;
  /** cycles per minute (quarter-note BPM / 4), null when the score gives no tempo */
  cpm: number | null;
  title: string | null;
  report: ImportReport;
}

const STACCATO = 0.4;
const TENUTO = 1.5;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** MusicXML score -> the editor's document and its canonical Strudel code. */
export function convertScore(score: XScore, opts: ImportOptions = {}): ImportResult {
  const expand = opts.expandRepeats !== false;
  const expression = opts.expression !== false;
  const order = playOrder(score.measures, expand);
  const messages: string[] = [];

  // ---- lay the played measures on the 16-slot grid ------------------------------------------------------------
  type Ev = DocEvent;
  const events: Ev[] = [];
  const open = new Map<string, Ev>();
  const meters = new Set<string>();
  const tempi: number[] = [];
  const keys: string[] = [];
  const current = new Map<number, number>(); // part -> current dynamic gain
  let anyDynamic = false;
  let base = 0; // first output measure of the measure being laid out
  const slack = 0.5001;

  order.forEach((mi, k) => {
    const m = score.measures[mi];
    const meter = `${m.beats}/${m.beatType}`;
    if (meter !== "4/4") meters.add(meter);
    if (m.tempo !== null) tempi.push(m.tempo);
    if (m.fifths !== null) keys.push(`${m.fifths}${m.minor ? "m" : ""}`);
    // the pick-up (anacrusis): the notes sit at the END of the first measure so the downbeat lands on the barline
    const length = Math.max(m.nominal, m.content);
    const pickup = k === 0 && length <= 16 && (m.implicit || m.content < m.nominal - 0.01) && m.content > 0;
    const offset = pickup ? 16 - m.content : 0;
    const span = Math.max(1, Math.ceil(length / 16 - 1e-9));

    type Item = { pos: number; dyn?: { part: number; gain: number }; note?: XNote };
    const items: Item[] = [
      ...m.dynamics.map((d): Item => ({ pos: d.pos, dyn: { part: d.part, gain: d.gain } })),
      ...m.notes.map((n): Item => ({ pos: n.pos, note: n })),
    ].sort((a, b) => a.pos - b.pos || (a.dyn ? -1 : 0) - (b.dyn ? -1 : 0));

    for (const it of items) {
      if (it.dyn) {
        current.set(it.dyn.part, it.dyn.gain);
        anyDynamic = true;
        continue;
      }
      const n = it.note!;
      const abs = base * 16 + offset;
      const start = Math.round(abs + n.pos + 1e-9);
      const end = Math.max(start + 1, Math.round(abs + n.pos + n.dur + 1e-9));
      const key = `${n.part}|${n.voice}|${n.midi}`;
      const prev = open.get(key);
      let ev: Ev;
      if (n.tieStop && prev && Math.abs(prev.start + prev.dur - start) <= slack) {
        prev.dur = Math.max(prev.dur, end - prev.start); // a tied note is ONE note
        ev = prev;
      } else {
        ev = { id: newId(), start, dur: end - start, midi: n.midi };
        if (expression) {
          const g = current.get(n.part);
          if (g !== undefined) ev.gain = g;
          if (n.staccato) ev.clip = STACCATO;
          else if (n.tenuto) ev.clip = TENUTO;
        }
        events.push(ev);
      }
      if (n.tieStart) open.set(key, ev);
      else open.delete(key);
    }
    base += span;
  });

  const played = base;
  // a dynamic written once applies to everything before the first mark too (no accidental first dynamic)
  if (anyDynamic && expression) {
    const firstGain = [...events].sort((a, b) => a.start - b.start).find((e) => e.gain !== undefined)?.gain;
    if (firstGain !== undefined) for (const e of events) if (e.gain === undefined) e.gain = firstGain;
  }

  // ---- the section that goes into the editor -------------------------------------------------------------------
  const from = Math.max(0, Math.min(opts.from ?? 0, Math.max(0, played - 1)));
  const count = Math.max(1, Math.min(opts.count ?? MAX_MEASURES, MAX_MEASURES, played - from || 1));
  const lo = from * 16;
  const hi = (from + count) * 16;
  const picked: DocEvent[] = [];
  for (const e of events) {
    const s = e.start - lo;
    const en = Math.min(e.start + e.dur, hi) - lo;
    if (en <= 0 || s >= hi - lo) continue;
    const start = Math.max(0, s);
    picked.push({ ...e, start, dur: Math.max(1, en - start) });
  }
  const doc = normalize({ measures: Math.max(1, count), events: picked });

  // ---- global properties ----------------------------------------------------------------------------------------
  const firstKey = score.measures.find((m) => m.fifths !== null);
  const keyDef = firstKey ? KEYS.find((k) => k.fifths === firstKey.fifths && k.minor === !!firstKey.minor) : undefined;
  const keyId = keyDef?.id ?? "C";
  const distinctKeys = new Set(keys);
  const cpm = tempi.length ? Math.round((tempi[0] / 4) * 1000) / 1000 : null;
  const tempoChanges = new Set(tempi.map((t) => Math.round(t))).size - 1;

  const w = score.warnings;
  if (w.emptyScore) messages.push("La partitura no contiene notas.");
  if (played > MAX_MEASURES) messages.push(`La pieza tiene ${played} compases y el editor admite ${MAX_MEASURES}: se importan los compases ${from + 1}–${from + count}. Puedes elegir otro tramo.`);
  if (meters.size) messages.push(`Compás ${[...meters].join(", ")}: el editor trabaja en 4/4; esos compases se colocan en compases de 4/4 (con silencio al final si son más cortos).`);
  if (w.tuplets) messages.push(`${plural(w.tuplets, "nota de tresillo / grupo especial", "notas de tresillos / grupos especiales")} aproximadas a la rejilla de semicorcheas.`);
  if (w.graceNotes) messages.push(`${plural(w.graceNotes, "nota de adorno omitida", "notas de adorno omitidas")}.`);
  if (w.unpitched) messages.push(`${plural(w.unpitched, "nota de percusión sin altura omitida", "notas de percusión sin altura omitidas")}.`);
  if (w.microtones) messages.push(`${plural(w.microtones, "microtono redondeado", "microtonos redondeados")} al semitono.`);
  if (w.transposingParts) messages.push("Partes transpositoras: se importa la altura real (de concierto).");
  if (tempoChanges > 0) messages.push(`${plural(tempoChanges, "cambio de tempo", "cambios de tempo")}: solo se conserva el tempo inicial.`);
  if (distinctKeys.size > 1) messages.push("Hay cambios de tonalidad: las notas suenan bien, pero la armadura es la inicial.");
  if (w.jumps.length) messages.push(`Saltos sin desenrollar: ${w.jumps.join(", ")}.`);
  if (expand && order.length !== score.measures.length) messages.push(`Repeticiones desenrolladas: ${score.measures.length} compases escritos → ${order.length} compases tocados.`);

  const title = score.title ? score.title.replace(/\s+/g, " ").trim() : null;
  const code = generateCode(doc, { staff: "auto", key: keyId, cpm, title });
  return {
    doc,
    code,
    keyId,
    cpm,
    title,
    report: {
      parts: score.parts.map((p) => p.name).filter(Boolean),
      writtenMeasures: score.measures.length,
      playedMeasures: played,
      importedMeasures: doc.measures,
      from,
      truncated: played > count,
      notes: doc.events.length,
      meters: [...meters],
      tempoChanges: Math.max(0, tempoChanges),
      keyChanges: Math.max(0, distinctKeys.size - 1),
      messages,
    },
  };
}
