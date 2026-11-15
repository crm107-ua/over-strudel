/**
 * MusicXML reader. Turns a MusicXML document into plain, validated data: for every measure of the score, its length,
 * its notes (position and length measured in sixteenths, exact pitch), the dynamics / tempo / key found there and the
 * repeat structure. Nothing here knows about Strudel or the editor: see convert.ts.
 *
 * Positions are kept as fractional sixteenths so that tuplets are measured exactly and rounded only once, in convert.ts.
 */

export interface XNote {
  part: number;
  /** MusicXML voice and staff, only used to keep ties apart */
  voice: string;
  staff: number;
  /** start and length in sixteenths, relative to the start of the measure (fractional for tuplets) */
  pos: number;
  dur: number;
  /** sounding MIDI number (transposing parts already applied) */
  midi: number;
  tieStart: boolean;
  tieStop: boolean;
  staccato: boolean;
  tenuto: boolean;
  tuplet: boolean;
}

export interface XDynamic {
  part: number;
  pos: number;
  /** gain 0..1.2 in the scale of the editor */
  gain: number;
}

export interface XMeasure {
  /** 0-based position in the score as written */
  index: number;
  number: string;
  implicit: boolean;
  /** nominal length from the time signature, in sixteenths */
  nominal: number;
  beats: number;
  beatType: number;
  /** end of the last note / rest of the busiest part, in sixteenths */
  content: number;
  notes: XNote[];
  dynamics: XDynamic[];
  repeatForward: boolean;
  repeatBackward: boolean;
  repeatTimes: number | null;
  /** a volta bracket (1st / 2nd ending) starts at this measure: the passes in which it is played */
  ending: { numbers: number[] } | null;
  /** the volta bracket that is open closes at this measure */
  endingStop: boolean;
  fifths: number | null;
  minor: boolean | null;
  /** quarter-note beats per minute set in this measure */
  tempo: number | null;
}

export interface XScore {
  title: string | null;
  composer: string | null;
  parts: { id: string; name: string }[];
  measures: XMeasure[];
  warnings: Warnings;
}

/** Things the importer had to approximate or could not represent, counted. */
export interface Warnings {
  graceNotes: number;
  unpitched: number;
  tuplets: number;
  microtones: number;
  transposingParts: number;
  jumps: string[];
  octaveShiftLines: number;
  emptyScore: boolean;
}

const emptyWarnings = (): Warnings => ({ graceNotes: 0, unpitched: 0, tuplets: 0, microtones: 0, transposingParts: 0, jumps: [], octaveShiftLines: 0, emptyScore: false });

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** dynamic marks -> gain (the editor shows <0.5 as p, <=0.85 as mf, else f) */
const DYN_GAIN: Record<string, number> = {
  ppp: 0.25, pp: 0.32, p: 0.4, mp: 0.6, mf: 0.72, f: 0.95, ff: 1.05, fff: 1.15, fp: 0.95, sf: 1, sfz: 1, sffz: 1.1, rfz: 1, fz: 1,
};
/** `<beat-unit>` -> length in quarter notes */
const BEAT_UNIT: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125, breve: 8 };

const kids = (el: Element, name: string): Element[] => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).nodeName === name);
const kid = (el: Element | null | undefined, name: string): Element | null => (el ? kids(el, name)[0] ?? null : null);
const text = (el: Element | null | undefined) => (el?.textContent ?? "").trim();
const num = (el: Element | null | undefined, dflt = 0) => {
  const v = parseFloat(text(el));
  return Number.isFinite(v) ? v : dflt;
};

/** Parse a MusicXML string (score-partwise; score-timewise is converted). Throws a readable Error on bad input. */
export function parseMusicXML(xml: string): XScore {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El archivo no es un MusicXML válido (XML mal formado).");
  let root: Element = doc.documentElement;
  if (!root) throw new Error("El archivo no es un MusicXML válido.");
  if (root.nodeName === "score-timewise") root = timewiseToPartwise(doc);
  if (root.nodeName !== "score-partwise") throw new Error(`MusicXML no reconocido (<${root.nodeName}>).`);

  const warnings = emptyWarnings();
  const title = text(kid(kid(root, "work"), "work-title")) || text(kid(root, "movement-title")) || creditTitle(root) || null;
  const composer = kids(kid(root, "identification") ?? root, "creator").find((c) => c.getAttribute("type") === "composer");
  const parts = kids(root, "part");
  if (!parts.length) throw new Error("La partitura no contiene partes (<part>).");
  const list = kids(kid(root, "part-list") ?? root, "score-part").map((p) => ({ id: p.getAttribute("id") ?? "", name: text(kid(p, "part-name")) }));

  const measures: XMeasure[] = [];
  parts.forEach((partEl, pi) => {
    let divisions = 1;
    let transpose = 0;
    let beats = 4;
    let beatType = 4;
    let transposeNoted = false;
    kids(partEl, "measure").forEach((mEl, mi) => {
      let m = measures[mi];
      if (!m) {
        m = measures[mi] = {
          index: mi, number: mEl.getAttribute("number") ?? String(mi + 1), implicit: mEl.getAttribute("implicit") === "yes",
          nominal: 16, beats: 4, beatType: 4, content: 0, notes: [], dynamics: [], repeatForward: false, repeatBackward: false,
          repeatTimes: null, ending: null, endingStop: false, fifths: null, minor: null, tempo: null,
        };
      }
      let cursor = 0; // divisions
      let last = 0;
      let lastNote: { pos: number } | null = null;
      let maxEnd = 0;
      const toSlots = (d: number) => (d * 4) / divisions; // divisions are per quarter note

      for (const el of Array.from(mEl.childNodes).filter((n): n is Element => n.nodeType === 1)) {
        switch (el.nodeName) {
          case "attributes": {
            const dv = kid(el, "divisions");
            if (dv) divisions = Math.max(1, num(dv, divisions));
            const time = kid(el, "time");
            if (time && !kid(time, "senza-misura")) {
              beats = parseInt(text(kid(time, "beats")), 10) || beats; // "3+2" style sums are read as their first number
              const plus = text(kid(time, "beats")).split("+").map((x) => parseInt(x, 10)).filter(Number.isFinite);
              if (plus.length > 1) beats = plus.reduce((a, b) => a + b, 0);
              beatType = parseInt(text(kid(time, "beat-type")), 10) || beatType;
            }
            if (pi === 0) {
              const key = kid(el, "key");
              if (key) {
                m.fifths = num(kid(key, "fifths"), 0);
                m.minor = text(kid(key, "mode")).toLowerCase() === "minor";
              }
            }
            const tr = kid(el, "transpose");
            if (tr) {
              transpose = num(kid(tr, "chromatic"), 0) + 12 * num(kid(tr, "octave-change"), 0);
              if (transpose && !transposeNoted) {
                transposeNoted = true;
                warnings.transposingParts++;
              }
            }
            break;
          }
          case "backup":
            cursor -= num(kid(el, "duration"));
            break;
          case "forward":
            cursor += num(kid(el, "duration"));
            maxEnd = Math.max(maxEnd, cursor);
            break;
          case "direction": {
            const offset = num(kid(el, "offset"), 0);
            const pos = toSlots(cursor + offset);
            for (const d of kids(el, "direction-type")) {
              const dyn = kid(d, "dynamics");
              if (dyn) {
                const mark = Array.from(dyn.childNodes).find((n) => n.nodeType === 1 && DYN_GAIN[n.nodeName] !== undefined) as Element | undefined;
                if (mark) m.dynamics.push({ part: pi, pos, gain: DYN_GAIN[mark.nodeName] });
              }
              const met = kid(d, "metronome");
              if (met && pi === 0 && m.tempo === null) {
                const unit = BEAT_UNIT[text(kid(met, "beat-unit"))] ?? 1;
                const dots = kids(met, "beat-unit-dot").length;
                const bpm = parseFloat(text(kid(met, "per-minute")));
                if (Number.isFinite(bpm) && bpm > 0) m.tempo = bpm * unit * (dots ? 2 - 1 / 2 ** dots : 1);
              }
              if (kid(d, "octave-shift")) warnings.octaveShiftLines++;
              if (kid(d, "segno") || kid(d, "coda")) addJump(warnings, "segno/coda");
            }
            const snd = kid(el, "sound");
            if (snd) {
              if (pi === 0 && m.tempo === null && snd.getAttribute("tempo")) {
                const t = parseFloat(snd.getAttribute("tempo")!);
                if (t > 0) m.tempo = t;
              }
              for (const j of ["dacapo", "dalsegno", "tocoda", "fine"]) if (snd.getAttribute(j)) addJump(warnings, j === "dacapo" ? "D.C." : j === "dalsegno" ? "D.S." : j === "tocoda" ? "To Coda" : "Fine");
            }
            break;
          }
          case "barline": {
            if (pi !== 0) break;
            const rep = kid(el, "repeat");
            if (rep) {
              if (rep.getAttribute("direction") === "forward") m.repeatForward = true;
              else {
                m.repeatBackward = true;
                const t = parseInt(rep.getAttribute("times") ?? "", 10);
                if (t > 1) m.repeatTimes = t;
              }
            }
            const end = kid(el, "ending");
            if (end) {
              const type = end.getAttribute("type");
              const numbers = (end.getAttribute("number") ?? "1").split(/[,\s]+/).map((x) => parseInt(x, 10)).filter(Number.isFinite);
              if (type === "start") m.ending = { numbers };
              else m.endingStop = true; // "stop" or "discontinue"
            }
            break;
          }
          case "note": {
            const isGrace = !!kid(el, "grace");
            const isCue = !!kid(el, "cue");
            const isChord = !!kid(el, "chord");
            const dur = isGrace || isCue ? 0 : num(kid(el, "duration"));
            const start = isChord && lastNote ? lastNote.pos : cursor;
            if (!isChord) lastNote = { pos: cursor };
            if (isGrace) {
              warnings.graceNotes++;
              break;
            }
            const rest = kid(el, "rest");
            const pitch = kid(el, "pitch");
            if (!isChord) {
              last = cursor;
              cursor += dur;
              maxEnd = Math.max(maxEnd, cursor);
            }
            if (isCue || rest) break;
            if (!pitch) {
              if (kid(el, "unpitched")) warnings.unpitched++;
              break;
            }
            const alter = num(kid(pitch, "alter"), 0);
            if (Math.abs(alter - Math.round(alter)) > 1e-6) warnings.microtones++;
            const midi = 12 * (num(kid(pitch, "octave"), 4) + 1) + (STEP[text(kid(pitch, "step"))] ?? 0) + Math.round(alter) + transpose;
            const ties = kids(el, "tie").map((t) => t.getAttribute("type"));
            const artic = kid(kid(el, "notations"), "articulations");
            m.notes.push({
              part: pi,
              voice: text(kid(el, "voice")) || "1",
              staff: parseInt(text(kid(el, "staff")), 10) || 1,
              pos: toSlots(isChord ? start : last),
              dur: toSlots(dur),
              midi,
              tieStart: ties.includes("start"),
              tieStop: ties.includes("stop"),
              staccato: !!(artic && (kid(artic, "staccato") || kid(artic, "staccatissimo"))),
              tenuto: !!(artic && kid(artic, "tenuto")),
              tuplet: !!kid(el, "time-modification"),
            });
            if (kid(el, "time-modification")) warnings.tuplets++;
            break;
          }
        }
      }
      m.content = Math.max(m.content, toSlots(maxEnd));
      if (pi === 0) {
        m.beats = beats;
        m.beatType = beatType;
        m.nominal = (beats * 16) / beatType;
      }
    });
  });

  if (!measures.length || measures.every((m) => !m.notes.length)) warnings.emptyScore = true;
  return { title, composer: composer ? text(composer) : null, parts: list, measures, warnings };
}

function addJump(w: Warnings, name: string) {
  if (!w.jumps.includes(name)) w.jumps.push(name);
}

function creditTitle(root: Element): string | null {
  for (const c of kids(root, "credit")) {
    const type = text(kid(c, "credit-type"));
    if (type === "title") return text(kid(c, "credit-words")) || null;
  }
  return null;
}

/** score-timewise -> a score-partwise document (measure-major to part-major). */
function timewiseToPartwise(doc: Document): Element {
  const src = doc.documentElement;
  const out = doc.createElement("score-partwise");
  for (const n of Array.from(src.childNodes)) if (n.nodeType === 1 && n.nodeName !== "measure") out.appendChild(n.cloneNode(true));
  const byPart = new Map<string, Element>();
  for (const m of kids(src, "measure")) {
    for (const p of kids(m, "part")) {
      const id = p.getAttribute("id") ?? "";
      let part = byPart.get(id);
      if (!part) {
        part = doc.createElement("part");
        part.setAttribute("id", id);
        byPart.set(id, part);
        out.appendChild(part);
      }
      const nm = doc.createElement("measure");
      for (const a of Array.from(m.attributes)) nm.setAttribute(a.name, a.value);
      for (const c of Array.from(p.childNodes)) nm.appendChild(c.cloneNode(true));
      part.appendChild(nm);
    }
  }
  return out;
}

/**
 * The order in which the measures are played once repeats and volta brackets (1st / 2nd ending) are unrolled.
 * With `expand` false the measures are returned as written.
 */
export function playOrder(measures: XMeasure[], expand: boolean): number[] {
  if (!expand) return measures.map((m) => m.index);
  const order: number[] = [];
  let pass = 1;
  let start = 0;
  let skipping = false;
  let guard = 0;
  for (let i = 0; i < measures.length && guard++ < measures.length * 8 + 64; ) {
    const m = measures[i];
    if (m.ending) skipping = !m.ending.numbers.includes(pass);
    if (skipping) {
      // an ending that is not played in this pass: skip its measures up to the one that closes it
      if (m.endingStop) skipping = false;
      i++;
      continue;
    }
    if (m.repeatForward) start = i;
    order.push(i);
    if (m.repeatBackward) {
      if (pass < (m.repeatTimes ?? 2)) {
        pass++;
        i = start;
        continue;
      }
      pass = 1;
      start = i + 1;
    }
    i++;
  }
  return order;
}
