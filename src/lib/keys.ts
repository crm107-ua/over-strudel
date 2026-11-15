/**
 * Key signatures (tonalidades). `fifths` = number of sharps (+) or flats (-) in the signature.
 * The signature only changes how the piece is NOTATED (signature on every staff, correct spelling of the
 * accidentals); transposing the notes is a separate, explicit operation (see transposeAll in edit/doc).
 */
export interface KeyDef {
  /** id used in the code directive, e.g. "G", "Bb", "F#m" */
  id: string;
  /** Spanish label */
  label: string;
  fifths: number;
  minor: boolean;
  /** pitch class of the tonic (0 = C) */
  tonic: number;
}

const MAJOR_TONIC = (fifths: number) => (((fifths * 7) % 12) + 12) % 12;
const LETTER_NAMES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

/** Spanish name of the tonic for a given number of fifths (major keys). */
const MAJOR: [string, string, number][] = [
  ["Cb", "Do♭", -7], ["Gb", "Sol♭", -6], ["Db", "Re♭", -5], ["Ab", "La♭", -4], ["Eb", "Mi♭", -3], ["Bb", "Si♭", -2], ["F", "Fa", -1],
  ["C", "Do", 0],
  ["G", "Sol", 1], ["D", "Re", 2], ["A", "La", 3], ["E", "Mi", 4], ["B", "Si", 5], ["F#", "Fa♯", 6], ["C#", "Do♯", 7],
];
const MINOR: [string, string, number][] = [
  ["Abm", "La♭", -7], ["Ebm", "Mi♭", -6], ["Bbm", "Si♭", -5], ["Fm", "Fa", -4], ["Cm", "Do", -3], ["Gm", "Sol", -2], ["Dm", "Re", -1],
  ["Am", "La", 0],
  ["Em", "Mi", 1], ["Bm", "Si", 2], ["F#m", "Fa♯", 3], ["C#m", "Do♯", 4], ["G#m", "Sol♯", 5], ["D#m", "Re♯", 6], ["A#m", "La♯", 7],
];

export const KEYS: KeyDef[] = [
  ...MAJOR.map(([id, n, fifths]) => ({ id, label: `${n} mayor`, fifths, minor: false, tonic: MAJOR_TONIC(fifths) })),
  ...MINOR.map(([id, n, fifths]) => ({ id, label: `${n} menor`, fifths, minor: true, tonic: (MAJOR_TONIC(fifths) + 9) % 12 })),
];

export const DEFAULT_KEY = "C";
const BY_ID = new Map(KEYS.map((k) => [k.id.toLowerCase(), k]));

export function getKey(id: string | null | undefined): KeyDef {
  return BY_ID.get((id ?? DEFAULT_KEY).trim().toLowerCase().replace("♯", "#").replace("♭", "b")) ?? BY_ID.get("c")!;
}
export const isKnownKey = (id: string) => BY_ID.has(id.trim().toLowerCase().replace("♯", "#").replace("♭", "b"));

// letter indices: C=0 D=1 E=2 F=3 G=4 A=5 B=6
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** Accidental the key signature applies to a letter (0=C … 6=B): +1, -1 or 0. */
export function letterAccidental(letter: number, fifths: number): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}

const WHITE_LETTER: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLAT_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

/** midi -> VexFlow key ("bb/4" / "a#/4"), spelling black keys with flats in flat keys and sharps otherwise. */
export function spell(midi: number, fifths: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const names = fifths < 0 ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pc]}/${Math.floor(midi / 12) - 1}`;
}

/** Strudel note name for a midi value (flat keys write flats: "bb4"; Strudel reads both). */
export function spellName(midi: number, fifths: number): string {
  const [n, o] = spell(midi, fifths).split("/");
  return `${n}${o}`;
}

/**
 * The pitch a click on the staff line/space of `naturalMidi` means in this key: the signature's accidental is
 * applied (F becomes F# in G major) unless an explicit accidental is chosen.
 */
export function applyKeyToNatural(naturalMidi: number, fifths: number): number {
  const letter = WHITE_LETTER[((naturalMidi % 12) + 12) % 12];
  return letter === undefined ? naturalMidi : naturalMidi + letterAccidental(letter, fifths);
}

/** Smallest transposition (semitones, -6..+5) that moves the tonic of `from` to the tonic of `to`. */
export function transpositionBetween(from: KeyDef, to: KeyDef): number {
  const d = (((to.tonic - from.tonic) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}

export const SOLFEGE = LETTER_NAMES;
