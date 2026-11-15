import type { Geometry } from "@/lib/edit/hit";
import type { Score, ScoreNote, ScoreVoice } from "@/lib/types";

export const MEASURE_MIN = 250;
export const CLEF_W = 64;
export const KEY_W = 9; // extra room per accidental of the key signature
export const MARGIN = 44; // inner margin of the sheet (left, right, top)
export const STAFF_GAP = 90; // treble -> bass distance
export const SYSTEM_GAP = 40;
export const PAGE_PAD = 44;
export const FOOTER = 76; // "add measure" block + sheet number
export const SLOTS = 16;
export const SLOT_LEN: Record<string, number> = { w: 16, h: 8, q: 4, "8": 2, "16": 1 };

/** Geometry captured while drawing the shown sheet: playback cursor + pointer editing. */
export interface MeasureLayout {
  sys: number;
  x: number;
  w: number;
  /** [slot, x] control points of the first treble voice (slot 16 = right barline) */
  pts: [number, number][];
  /** sounding notes (rests excluded) with their SVG element and document ids */
  els: { s: number; e: number; el: Element; ids: number[] }[];
}
export interface Layout extends Geometry {
  systems: { top: number; h: number; staveY: number; bassY: number | null }[];
  /** sparse: indexed by absolute measure, only the measures of the shown sheet exist */
  measures: MeasureLayout[];
}

type VF = typeof import("vexflow");

export async function drawScore(
  el: HTMLDivElement, score: Score, width: number, ink: string, from: number, to: number, perLine: number, clefW: number,
  opts: {
    /** keep every measure this wide (the last, shorter system is then not stretched) */
    measureW?: number;
    /** explicit systems (absolute measure indices); default: `perLine` measures each */
    systems?: number[][];
    /** relative width of each measure (by absolute index): systems are justified proportionally to it */
    weights?: number[];
    /** the last system is stretched at most this much (1 = natural width) */
    lastStretchCap?: number;
  } = {},
): Promise<Layout> {
  const VF: VF = await import("vexflow");
  const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Beam, Accidental, Articulation, Annotation, Dot, StaveTie } = VF;

  const systems: number[][] = opts.systems ?? [];
  if (!opts.systems) {
    for (let i = from; i < to; i++) {
      if ((i - from) % perLine === 0) systems.push([]);
      systems[systems.length - 1].push(i);
    }
  }
  const sysH = (score.grand ? STAFF_GAP + 110 : 130) + SYSTEM_GAP;
  const height = Math.max(1, systems.length) * sysH + MARGIN * 2;

  el.innerHTML = ""; // never stack SVGs / leak nodes
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(ink); // theme: staff lines, notes and text all take the ink colour
  ctx.setStrokeStyle(ink);

  const layout: Layout = { systems: [], measures: [] };

  const toVex = (n: ScoreNote, staff: "treble" | "bass", stem?: number) => {
    const note = new StaveNote({
      keys: n.keys,
      duration: n.duration + (n.isRest ? "r" : ""),
      dots: n.dots,
      clef: staff,
      ...(stem && !n.isRest ? { stemDirection: stem } : {}),
    });
    if (n.dots) Dot.buildAndAttach([note], { all: true });
    if (n.articulation) note.addModifier(new Articulation(n.articulation === "staccato" ? "a." : "a-").setPosition(3), 0);
    if (n.dynamic) {
      const a = new Annotation(n.dynamic).setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
      a.setFont("serif", 14, "bold", "italic");
      note.addModifier(a, 0);
    }
    return note;
  };

  systems.forEach((idxs, si) => {
    const top = MARGIN + si * sysH + 20;
    layout.systems.push({ top: top + 22, h: score.grand ? STAFF_GAP + 66 : 66, staveY: top, bassY: score.grand ? top + STAFF_GAP : null });
    const usable = width - 2 * MARGIN - clefW;
    // width of every measure of this system, justified to the full line (proportional to `weights` when given)
    let widths: number[];
    if (opts.weights) {
      const ws = idxs.map((i) => opts.weights![i] ?? 1);
      const sum = ws.reduce((a, b) => a + b, 0);
      let k = usable / sum;
      if (opts.lastStretchCap && si === systems.length - 1) k = Math.min(k, opts.lastStretchCap);
      widths = ws.map((w) => w * k);
    } else {
      widths = idxs.map(() => opts.measureW ?? usable / idxs.length);
    }
    const before = (k: number) => widths.slice(0, k).reduce((a, b) => a + b, 0);
    const drawn: { staff: "treble" | "bass"; v: number; notes: InstanceType<typeof StaveNote>[]; src: ScoreVoice }[][] = [];

    idxs.forEach((mi, k) => {
      const m = score.measures[mi];
      const x = MARGIN + (k === 0 ? 0 : clefW + before(k));
      const w = k === 0 ? clefW + widths[0] : widths[k];
      const staves: Record<string, InstanceType<typeof Stave>> = {};
      const mk = (staff: "treble" | "bass", y: number) => {
        const s = new Stave(x, y, w);
        if (k === 0) {
          s.addClef(staff);
          if (score.fifths !== 0) s.addKeySignature(score.keyId); // the signature on every system
        }
        if (staff === "treble") s.setMeasure(mi + 1); // measure numbers
        if (mi === 0) s.addTimeSignature("4/4");
        s.setContext(ctx).draw();
        staves[staff] = s;
      };
      mk("treble", top);
      if (m.bass) mk("bass", top + STAFF_GAP);

      if (m.bass) {
        if (k === 0) {
          new StaveConnector(staves.treble, staves.bass).setType("brace").setContext(ctx).draw();
          new StaveConnector(staves.treble, staves.bass).setType("singleLeft").setContext(ctx).draw();
        }
        new StaveConnector(staves.treble, staves.bass).setType("singleRight").setContext(ctx).draw();
      }

      const allVoices: InstanceType<typeof Voice>[] = [];
      const groups: InstanceType<typeof Voice>[][] = [];
      const entries: (typeof drawn)[number] = [];
      const addStaff = (staff: "treble" | "bass", voices: ScoreVoice[]) => {
        const g: InstanceType<typeof Voice>[] = [];
        voices.forEach((sv, vi) => {
          const stem = voices.length > 1 ? (vi === 0 ? 1 : -1) : undefined;
          const notes = sv.map((n) => toVex(n, staff, stem));
          const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(notes);
          g.push(voice);
          entries.push({ staff, v: vi, notes, src: sv });
        });
        groups.push(g);
        allVoices.push(...g);
        Accidental.applyAccidentals(g, score.keyId); // accidentals relative to the key signature
      };
      addStaff("treble", m.treble);
      if (m.bass) addStaff("bass", m.bass);

      const fmt = new Formatter();
      groups.forEach((g) => fmt.joinVoices(g));
      const first = staves.treble;
      fmt.format(allVoices, Math.max(40, first.getNoteEndX() - first.getNoteStartX() - 16));

      const ml: MeasureLayout = { sys: si, x, w, pts: [], els: [] };
      entries.forEach((e, ei) => {
        const voice = allVoices[ei];
        const beams = Beam.generateBeams(e.notes, { maintainStemDirections: true });
        voice.draw(ctx, staves[e.staff]);
        beams.forEach((b) => b.setContext(ctx).draw());
        e.src.forEach((n, i) => {
          if (e.staff === "treble" && e.v === 0) ml.pts.push([n.slot, e.notes[i].getAbsoluteX()]);
          if (n.isRest) return;
          const svg = e.notes[i].getSVGElement();
          if (svg) ml.els.push({ s: n.slot, e: n.slot + (SLOT_LEN[n.duration] ?? 1) * (n.dots ? 1.5 : 1), el: svg, ids: n.ids });
        });
      });
      ml.pts.push([SLOTS, first.getNoteEndX()]);
      layout.measures[mi] = ml;
      drawn.push(entries);
    });

    // ties (within a measure, or into the next measure of this system)
    drawn.forEach((entries, k) => {
      entries.forEach((e) => {
        e.src.forEach((n, i) => {
          if (!n.tieNext) return;
          const next = e.notes[i + 1] ?? drawn[k + 1]?.find((x) => x.staff === e.staff && x.v === e.v)?.notes[0] ?? null;
          const idx = n.keys.map((_, j) => j);
          try {
            new StaveTie({ firstNote: e.notes[i], lastNote: next, firstIndexes: idx, lastIndexes: idx }).setContext(ctx).draw();
          } catch {
            /* tie target not drawable (e.g. next system or sheet) */
          }
        });
      });
    });
  });
  return layout;
}
