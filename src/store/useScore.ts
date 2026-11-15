import { create } from "zustand";
import { buildScoreFromQ } from "@/lib/middleware/buildScore";
import { quantize } from "@/lib/middleware/quantize";
import { playCode, stopAudio } from "@/lib/audioEngine";
import { appendTranspose, parseDirectives, setDirective, type StaffMode } from "@/lib/directives";
import { DEFAULT_SETTINGS, saveSettings, type Settings } from "@/lib/settings";
import { applyKeyToNatural, getKey, transpositionBetween } from "@/lib/keys";
import { generateCode } from "@/lib/edit/codegen";
import {
  addMeasure, addNote, canonical, clearRange, entryTarget, floorFigure, reachKey, type Reach, type StaffName, deleteEvents, docFromQ, docToQ, joinNext, moveEvents, nudgeDuration, setArticulation,
  removeLastMeasure, setAccidental, transposeAll, setDuration, setDynamic, transpose, totalSlots, normalize, type Doc, type EditResult,
} from "@/lib/edit/doc";
import type { EditAction } from "@/lib/edit/shortcuts";
import { EXAMPLES } from "@/lib/examples";
import { startPlayhead, stopPlayhead } from "@/lib/playhead";
import { queryPattern } from "@/lib/strudelClient";
import { clipToArticulation } from "@/lib/middleware/dynamics";
import type { RawEvent, Score } from "@/lib/types";

export const MEASURE_OPTIONS = [4, 8, 16, 32];
const FIRST = EXAMPLES[0];
const FIRST_DIR = parseDirectives(FIRST.code);
const HISTORY_LIMIT = 100;

export type ScoreTheme = "light" | "dark";
export interface Tool {
  /** base length in slots (1,2,4,8,16) */
  dur: number;
  dot: boolean;
  /** accidental for placed notes: -1 flat, 0 natural, +1 sharp, null = follow the key signature */
  accidental: -1 | 0 | 1 | null;
}
export const effDur = (t: Tool) => (t.dot && (t.dur * 3) % 2 === 0 ? (t.dur * 3) / 2 : t.dur);

interface Snapshot {
  code: string;
  doc: Doc;
  selection: number[];
}

/** The pitch a click on a staff position produces, given the chosen accidental or the key signature. */
export const resolvePitch = (natural: number, tool: Tool, fifths: number) =>
  tool.accidental === null ? applyKeyToNatural(natural, fifths) : natural + tool.accidental;

const staffGrand = (m: StaffMode): boolean | undefined => (m === "piano" ? true : m === "treble" ? false : undefined);
const scoreOf = (doc: Doc, staff: StaffMode, key: string): Score =>
  buildScoreFromQ(docToQ(doc), doc.measures, { grand: staffGrand(staff), key });

interface ScoreState {
  code: string;
  exampleId: string;
  /** value of the "Compases" selector (used when the code has no `// @compases N`) */
  measuresSetting: number;
  /** effective number of measures drawn: directive if present, otherwise the selector */
  measures: number;
  /** true when `// @compases N` in the code is controlling the measure count */
  measuresFromCode: boolean;
  staffMode: StaffMode;
  /** key signature id (from the `// @tonalidad` directive) */
  keyId: string;
  /** changing the key also transposes the whole piece to it (otherwise only the signature changes) */
  transposeOnKeyChange: boolean;
  /** user settings (persisted in localStorage) */
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  status: "idle" | "busy" | "ok" | "error";
  /** the editable document (single source of truth shared by the code and the score editor) */
  doc: Doc;
  score: Score; // always the last VALID score
  /** raw events + the exact code they were computed from (used to highlight code while playing) */
  events: RawEvent[];
  evaluatedCode: string;
  /** tempo set in the code with setcpm/setcps (cycles per minute), null = default */
  cpm: number | null;
  /** how many measures the evaluated pattern lasts before repeating (null = unknown / longer than 32) */
  period: number | null;
  error: string | null;
  isPlaying: boolean;

  // score editor
  editMode: boolean;
  tool: Tool;
  selection: number[];
  /** "sequence": notes/rests are written one after another at the input cursor; "free": placed where you click */
  entryMode: "sequence" | "free";
  /** what the next entered element is: a note or a rest (switchable at any time) */
  noteKind: "note" | "rest";
  /** input cursor (absolute sixteenth): where the next sequential element goes */
  cursor: number;
  /** true when the cursor was moved on purpose (Alt+click, cursor buttons): then it may overwrite from there */
  cursorPinned: boolean;
  /** ids of the note written by the last sequential entry (the view glides it from where you clicked) */
  lastEntered: number[];
  /** how far entry has written in each measure (so a trailing rest counts as filled) */
  reach: Reach;
  inputStaff: StaffName;
  lastMidi: number;
  setEntryMode: (m: "sequence" | "free") => void;
  setNoteKind: (k: "note" | "rest") => void;
  setCursor: (slot: number) => void;
  /** sequential entry: write a note (or a rest when `midi` is null / rest mode) at the cursor and advance */
  enterAt: (midi: number | null, measure: number | null, staff: StaffName, exact?: boolean) => void;
  /** free entry in rest mode: silence the range starting where you clicked */
  restAt: (abs: number, staff: StaffName) => void;
  /** current sheet (0-based) and how many sheets the score takes; the view computes pageCount from its size */
  page: number;
  pageCount: number;
  /** measures per sheet (set by the view) */
  perPage: number;
  setPage: (p: number) => void;
  past: Snapshot[];
  future: Snapshot[];
  scoreTheme: ScoreTheme;

  setScoreTheme: (t: ScoreTheme) => void;
  /** mouse-wheel pitch change on the selection (consecutive turns share one undo step) */
  wheelPitch: (semitones: number) => void;
  setKey: (id: string) => void;
  setTransposeOnKeyChange: (on: boolean) => void;
  setCode: (code: string) => void;
  /** load code produced by an import: one undo step brings the previous code back */
  importCode: (code: string) => void;
  setMeasures: (n: number) => void;
  loadExample: (id: string) => void;
  evaluate: (code?: string, expect?: Doc) => Promise<void>;
  play: () => Promise<void>;
  stop: () => Promise<void>;
  togglePlay: () => Promise<void>;

  setEditMode: (on: boolean) => void;
  select: (ids: number[], additive?: boolean) => void;
  addNoteAt: (absSlot: number, midi: number, layer?: boolean, dur?: number) => void;
  moveSelection: (dSlot: number, dMidi: number) => void;
  act: (a: EditAction) => void;
}

const GENERATED_MARK = "// Generado desde la partitura";

export const useScore = create<ScoreState>((set, get) => {
  /** Apply an edit to the document, regenerate the canonical code, record history and verify with Strudel. */
  let lastCoalesce = { key: "", at: 0 };
  const commit = (doc: Doc, ids: number[], coalesce?: string, keyId?: string, kept?: string, verified = true) => {
    const st = get();
    const next = normalize(doc);
    const key = keyId ?? st.keyId;
    // `kept`: the user's own code, minimally patched, instead of the canonical regeneration
    const code = kept ?? generateCode(next, { staff: st.staffMode, key, cpm: st.cpm });
    const now = Date.now();
    const merge = !!coalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 600 && st.past.length > 0;
    lastCoalesce = coalesce ? { key: coalesce, at: now } : { key: "", at: 0 };
    set({
      past: merge ? st.past : [...st.past, { code: st.code, doc: st.doc, selection: st.selection }].slice(-HISTORY_LIMIT),
      future: [],
      doc: next,
      code,
      exampleId: "",
      selection: ids.filter((id) => next.events.some((e) => e.id === id)),
      score: scoreOf(next, st.staffMode, key),
      keyId: key,
      reach: {}, // any ordinary edit forgets what entry wrote: the space you free is free again
      error: null,
    });
    void get().evaluate(code, kept !== undefined && !verified ? undefined : next);
    if (get().isPlaying) void get().play();
  };

  // Editing the score regenerates the code with no confirmation; Ctrl+Z restores the hand-written code.
  const edit = (fn: (doc: Doc, grand: boolean, ids: number[]) => EditResult | Doc, requireSelection = true, coalesce?: string) => {
    const st = get();
    const ids = st.selection.filter((id) => st.doc.events.some((e) => e.id === id));
    if (requireSelection && !ids.length) return;
    const r = fn(st.doc, st.score.grand, ids);
    if ("events" in r) commit(r, ids, coalesce);
    else commit(r.doc, r.ids, coalesce);
  };

  /**
   * Apply a change that does not need to rewrite the user's code (key signature, number of measures, transposition):
   * `patch` edits their code minimally. When the change must reproduce the edited document (`verify`), the patched code
   * is first evaluated with the real engine and used only if it does; otherwise the code is regenerated as usual.
   */
  const commitKept = async (next: Doc, ids: number[], keyId: string | undefined, patch: (code: string) => string | null, verify: boolean) => {
    const st = get();
    const key = keyId ?? st.keyId;
    // code generated from the score is ours to regenerate (its .slow(N) is tied to the measure count); only hand-written code is kept
    if (st.settings.preserveCode && !st.code.includes(GENERATED_MARK)) {
      const patched = patch(st.code);
      if (patched !== null) {
        try {
          if (!verify) {
            commit(next, ids, undefined, key, patched, false);
            return;
          }
          const { events } = await queryPattern(patched, next.measures);
          const fromCode = docFromQ(quantize(events, next.measures), next.measures);
          if (JSON.stringify(canonical(fromCode)) === JSON.stringify(canonical(normalize(next)))) {
            commit(next, ids, undefined, key, patched, true);
            return;
          }
        } catch {
          /* the patched code does not evaluate: regenerate */
        }
      }
    }
    commit(next, ids, undefined, key);
  };

  /** The sheet that shows a given sixteenth (the last measure for the very end). */
  const pageOf = (slot: number) => {
    const st = get();
    const last = Math.max(0, st.doc.measures - 1);
    return Math.floor(Math.min(Math.floor(slot / 16), last) / Math.max(1, st.perPage));
  };

  const restore = (snap: Snapshot, past: Snapshot[], future: Snapshot[]) => {
    const dir = parseDirectives(snap.code);
    const staff = dir.staff;
    set({
      past, future, code: snap.code, doc: snap.doc, selection: snap.selection, exampleId: "", reach: {}, cursorPinned: false,
      staffMode: staff, keyId: dir.key, measures: snap.doc.measures, score: scoreOf(snap.doc, staff, dir.key), error: null,
    });
    void get().evaluate(snap.code, snap.doc);
    if (get().isPlaying) void get().play();
  };

  return {
    code: FIRST.code,
    exampleId: FIRST.id,
    measuresSetting: FIRST.measures,
    measures: FIRST_DIR.measures ?? FIRST.measures,
    measuresFromCode: FIRST_DIR.measures !== null,
    staffMode: FIRST_DIR.staff,
    keyId: FIRST_DIR.key,
    transposeOnKeyChange: true,
    settings: DEFAULT_SETTINGS,
    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      saveSettings(settings);
    },
    status: "idle",
    doc: { measures: FIRST_DIR.measures ?? FIRST.measures, events: [] },
    score: scoreOf({ measures: FIRST_DIR.measures ?? FIRST.measures, events: [] }, FIRST_DIR.staff, FIRST_DIR.key),
    events: [],
    evaluatedCode: "",
    cpm: null,
    period: null,
    error: null,
    isPlaying: false,

    editMode: true,
    tool: { dur: 16, dot: false, accidental: null }, // a measure starts as a whole rest: the first figure is the whole
    entryMode: "sequence",
    noteKind: "note",
    cursor: 0,
    cursorPinned: false,
    lastEntered: [],
    reach: {},
    inputStaff: "treble",
    lastMidi: 67,
    selection: [],
    page: 0,
    pageCount: 1,
    perPage: 6,
    setPage: (p) => set((s) => ({ page: Math.max(0, Math.min(s.pageCount - 1, Math.round(p))) })),
    past: [],
    future: [],
    scoreTheme: "light",

    setScoreTheme: (scoreTheme) => {
      set({ scoreTheme });
      try {
        localStorage.setItem("os-score-theme", scoreTheme);
      } catch {
        /* storage unavailable */
      }
    },
    wheelPitch: (semitones) => edit((d, _g, ids) => transpose(d, ids, semitones), true, "wheel"),

    setTransposeOnKeyChange: (transposeOnKeyChange) => set({ transposeOnKeyChange }),
    // Changing the key adjusts the whole piece: signature + spelling everywhere, and (optionally) the notes themselves.
    setKey: (id) => {
      const st = get();
      const to = getKey(id);
      const from = getKey(st.keyId);
      if (to.id === from.id) return;
      const semis = st.transposeOnKeyChange ? transpositionBetween(from, to) : 0;
      void commitKept(
        transposeAll(st.doc, semis),
        st.selection,
        to.id,
        (code) => {
          const withKey = setDirective(code, "tonalidad", to.id === "C" ? null : to.id);
          return semis ? appendTranspose(withKey, semis) : withKey;
        },
        true,
      );
    },
    importCode: (code) => {
      const st = get();
      set({
        past: [...st.past, { code: st.code, doc: st.doc, selection: st.selection }].slice(-HISTORY_LIMIT),
        future: [], code, exampleId: "", selection: [], page: 0, reach: {}, cursorPinned: false, cursor: 0, error: null,
      });
      void get().evaluate(code);
      if (get().isPlaying) void get().play();
    },
    setCode: (code) => {
      const ex = EXAMPLES.find((e) => e.id === get().exampleId);
      set({ code, exampleId: ex && ex.code === code ? ex.id : "" });
    },
    setMeasures: (measuresSetting) => {
      set({ measuresSetting });
      void get().evaluate();
    },
    loadExample: (id) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      set({ code: ex.code, measuresSetting: ex.measures, exampleId: ex.id, selection: [], page: 0, past: [], future: [] });
      void get().evaluate(ex.code);
      if (get().isPlaying) void get().play();
    },

    // Worker -> middleware -> store. On error the previous score is kept untouched.
    // `expect` = the document an edit produced: the evaluation must reproduce it (code <-> score consistency).
    evaluate: async (code = get().code, expect) => {
      const dir = parseDirectives(code);
      const measures = dir.measures ?? get().measuresSetting;
      set({ status: "busy", measures, measuresFromCode: dir.measures !== null, staffMode: dir.staff, keyId: dir.key });
      try {
        const { events, cpm, period } = await queryPattern(code, measures);
        const fromCode = docFromQ(quantize(events, measures), measures);
        const docEnd = fromCode.events.reduce((m, e) => Math.max(m, e.start + e.dur), 0);
        const consistent = expect && JSON.stringify(canonical(fromCode)) === JSON.stringify(canonical(expect));
        if (expect && consistent) {
          set({ cpm, period, events, evaluatedCode: code, error: null, status: "ok", cursor: Math.min(get().cursor, measures * 16) }); // keep ids + selection
        } else {
          set({
            cpm, period, doc: fromCode, score: scoreOf(fromCode, dir.staff, dir.key), events, evaluatedCode: code, status: "ok",
            error: expect ? "La partitura editada no coincide con lo que evalúa Strudel (se ha adoptado la evaluación)." : null,
            cursor: expect ? Math.min(get().cursor, measures * 16) : docEnd >= measures * 16 ? measures * 16 : docEnd,
            ...(expect ? {} : { reach: {}, cursorPinned: false }),
            ...(expect ? {} : { selection: [] }),
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== "superseded") set({ error: msg, status: "error" });
      }
    },

    play: async () => {
      try {
        await playCode(get().code);
        set({ isPlaying: true });
        startPlayhead();
      } catch (e) {
        set({ error: `Audio: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
    stop: async () => {
      await stopAudio();
      set({ isPlaying: false });
      stopPlayhead();
    },
    togglePlay: async () => (get().isPlaying ? get().stop() : get().play()),

    setEditMode: (editMode) => set({ editMode }),
    setEntryMode: (entryMode) => set({ entryMode }),
    setNoteKind: (noteKind) => set({ noteKind }),
    setCursor: (slot) => {
      const c = Math.max(0, Math.min(totalSlots(get().doc), Math.round(slot)));
      set({ cursor: c, cursorPinned: true, page: pageOf(c) });
    },

    enterAt: (midi, measure, staff, exact = false) => {
      const st = get();
      const grand = st.score.grand;
      const asRest = st.noteKind === "rest" || midi === null;
      const t = entryTarget(st.doc, st.cursor, measure, staff, grand, effDur(st.tool), st.reach, st.cursorPinned);
      if (!t) return; // nothing can be written there (no such measure, or nothing left to subdivide): no measure is ever added
      let doc = st.doc;
      // a full measure: the last note is cut in two to make room (whole -> half + half, half -> quarter + quarter ...)
      if (t.split) {
        const { ids, keepDur } = t.split;
        doc = { ...doc, events: doc.events.map((e) => (ids.includes(e.id) ? { ...e, dur: keepDur } : e)) };
      }
      let lastMidi = st.lastMidi;
      let entered: number[] = [];
      if (asRest) {
        doc = clearRange(doc, t.start, t.dur, staff, grand);
      } else {
        lastMidi = exact ? midi! : resolvePitch(midi!, st.tool, st.score.fifths);
        const r = addNote(doc, { start: t.start, midi: lastMidi, dur: t.dur }, grand);
        doc = r.doc;
        entered = r.ids;
      }
      commit(doc, []);
      // the cursor moves on; the plain figure shrinks to what is left of the measure (subdivisions as they happen)
      const next = t.start + t.dur;
      const left = next % 16 === 0 ? 16 : 16 - (next % 16);
      const dur = Math.min(st.tool.dur, floorFigure(left));
      const dot = st.tool.dot && dur > 1 && (dur * 3) / 2 <= left && dur === st.tool.dur;
      const key = reachKey(staff, t.measure);
      // ordinary writing remembers how far it got; subdividing with a REST leaves the freed half free (reach drops to it)
      const reach = t.split
        ? { ...st.reach, [key]: asRest ? t.start : next }
        : { ...st.reach, [key]: Math.max(st.reach[key] ?? 0, next) };
      set({ cursor: next, cursorPinned: false, inputStaff: staff, lastMidi, lastEntered: entered, tool: { ...st.tool, dur, dot }, reach });
    },
    restAt: (abs, staff) => {
      const st = get();
      const dur = Math.min(effDur(st.tool), (Math.floor(abs / 16) + 1) * 16 - abs);
      commit(clearRange(st.doc, abs, dur, staff, st.score.grand), []);
      const key = reachKey(staff, Math.floor(abs / 16));
      set({ cursor: abs + dur, cursorPinned: false, inputStaff: staff, reach: { ...st.reach, [key]: Math.max(st.reach[key] ?? 0, abs + dur) } });
    },
    select: (ids, additive = false) =>
      set((s) => ({
        selection: additive ? [...new Set([...s.selection.filter((i) => !ids.includes(i)), ...ids.filter((i) => !s.selection.includes(i))])] : ids,
      })),

    addNoteAt: (absSlot, midi, layer = false, dur) => {
      const st = get();
      const r = addNote(st.doc, { start: absSlot, midi: resolvePitch(midi, st.tool, st.score.fifths), dur: dur ?? effDur(st.tool), layer }, st.score.grand);
      commit(r.doc, r.ids);
    },
    moveSelection: (dSlot, dMidi) => {
      if (!dSlot && !dMidi) return;
      edit((d, g, ids) => moveEvents(d, ids, dSlot, dMidi, g));
    },

    act: (a) => {
      const st = get();
      switch (a.type) {
        case "duration": {
          const tool = { ...st.tool, dur: a.base, dot: a.base === 1 ? false : st.tool.dot };
          set({ tool });
          if (st.selection.length) edit((d, g, ids) => setDuration(d, ids, effDur(tool), g));
          break;
        }
        case "dot": {
          const tool = { ...st.tool, dot: !st.tool.dot && st.tool.dur > 1 };
          set({ tool });
          if (st.selection.length) edit((d, g, ids) => setDuration(d, ids, effDur(tool), g));
          break;
        }
        case "accidental":
          set({ tool: { ...st.tool, accidental: a.value } });
          if (st.selection.length && a.value !== null) edit((d, _g, ids) => setAccidental(d, ids, a.value as -1 | 0 | 1));
          break;
        case "transpose": edit((d, _g, ids) => transpose(d, ids, a.semitones)); break;
        case "move": edit((d, g, ids) => moveEvents(d, ids, a.slots, 0, g)); break;
        case "extend": edit((d, g, ids) => nudgeDuration(d, ids, a.slots, g)); break;
        case "delete": edit((d, _g, ids) => ({ doc: deleteEvents(d, ids), ids: [] })); break;
        case "join": edit((d, _g, ids) => joinNext(d, ids)); break;
        case "articulation":
          edit((d, _g, ids) => {
            const all = d.events.filter((e) => ids.includes(e.id)).every((e) => clipToArticulation(e.clip) === a.art);
            return { doc: setArticulation(d, ids, all ? null : a.art), ids };
          });
          break;
        case "dynamic": {
          const first = [...st.doc.events].filter((e) => st.selection.includes(e.id)).sort((x, y) => x.start - y.start || x.midi - y.midi)[0];
          if (first) edit((d) => ({ doc: setDynamic(d, first.id, a.dyn), ids: st.selection }));
          break;
        }
        case "duplicate":
          edit((d, g, ids) => {
            const sel = d.events.filter((e) => ids.includes(e.id));
            const from = Math.min(...sel.map((e) => e.start));
            const to = Math.max(...sel.map((e) => e.start + e.dur));
            const total = totalSlots(d);
            if (Math.max(...sel.map((e) => e.start + (to - from) + e.dur)) > total) return { doc: d, ids }; // no room
            let doc = d;
            const created: number[] = [];
            for (const e of sel) {
              const r = addNote(doc, { start: e.start + (to - from), midi: e.midi, dur: e.dur }, g);
              doc = r.doc;
              created.push(...r.ids);
              doc = { ...doc, events: doc.events.map((x) => (x.id === r.ids[0] ? { ...x, gain: e.gain, clip: e.clip } : x)) };
            }
            return { doc, ids: created };
          });
          break;
        case "undo": {
          const past = st.past;
          if (!past.length) break;
          restore(past[past.length - 1], past.slice(0, -1), [{ code: st.code, doc: st.doc, selection: st.selection }, ...st.future]);
          break;
        }
        case "redo": {
          if (!st.future.length) break;
          restore(st.future[0], [...st.past, { code: st.code, doc: st.doc, selection: st.selection }], st.future.slice(1));
          break;
        }
        case "selectAll": set({ selection: st.doc.events.map((e) => e.id) }); break;
        case "clear": set({ selection: [] }); break;
        case "navigate": {
          const sorted = [...st.doc.events].sort((x, y) => x.start - y.start || x.midi - y.midi);
          if (!sorted.length) break;
          const cur = sorted.findIndex((e) => st.selection.includes(e.id));
          const next = sorted[(cur < 0 ? (a.dir > 0 ? 0 : sorted.length - 1) : cur + a.dir + sorted.length) % sorted.length];
          set({ selection: [next.id] });
          break;
        }
        case "addMeasure":
          void commitKept(addMeasure(st.doc), st.selection, undefined, (code) => setDirective(code, "compases", st.doc.measures + 1), false);
          useScore.setState({ page: Number.MAX_SAFE_INTEGER }); // the view clamps it to the last sheet
          break;
        case "removeMeasure":
          if (st.doc.measures > 1) void commitKept(removeLastMeasure(st.doc), st.selection, undefined, (code) => setDirective(code, "compases", st.doc.measures - 1), false);
          break;
        case "toggleRest": set({ noteKind: st.noteKind === "rest" ? "note" : "rest" }); break;
        case "enter": get().enterAt(st.noteKind === "rest" ? null : st.lastMidi, null, st.inputStaff, true); break;
        case "togglePlay": void get().togglePlay(); break;
      }
    },
  };
});

