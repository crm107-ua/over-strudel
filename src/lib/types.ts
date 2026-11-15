export type Dynamic = "p" | "mf" | "f";
export type Articulation = "staccato" | "tenuto";

/** One notated element (note, chord or rest) inside a measure. */
export interface ScoreNote {
  /** ids of the document events behind this note (several for a chord) */
  ids: number[];
  /** VexFlow keys, e.g. ["c/4"] or ["c#/4","e/4"] for a chord. Rests carry a placeholder key. */
  keys: string[];
  /** VexFlow base duration: w,h,q,8,16 (no "r" suffix, no dots). */
  duration: string;
  dots: number;
  isRest: boolean;
  dynamic?: Dynamic;
  articulation?: Articulation;
  /** tied to the next note in the same voice (may cross the barline) */
  tieNext?: boolean;
  /** start slot inside the measure (0..15), used for tests / layout */
  slot: number;
}

export type ScoreVoice = ScoreNote[];

export interface Measure {
  treble: ScoreVoice[];
  /** present only when the piece goes below middle C (grand staff) */
  bass: ScoreVoice[] | null;
}

export interface Score {
  measures: Measure[];
  grand: boolean;
  /** key signature id ("C", "G", "Bb", "F#m"...) and its sharps(+)/flats(-) */
  keyId: string;
  fifths: number;
}

/** Rational number serialisable across postMessage. */
export interface Frac {
  n: number;
  d: number;
}

/** Raw event extracted from a Strudel Pattern (times in cycles). */
export interface RawEvent {
  value: unknown;
  begin: Frac;
  end: Frac;
  gain?: number;
  /** clip / sustain, 1 = full length */
  clip?: number;
  /** character-offset ranges [start, end) in the evaluated code that produced this event */
  locs?: [number, number][];
}

export type WorkerRequest = { id: number; code: string; cycles: number };
export type WorkerResponse =
  | { id: number; ok: true; events: RawEvent[] }
  | { id: number; ok: false; error: string };
