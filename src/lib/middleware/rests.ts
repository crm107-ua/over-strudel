/** Valid figure lengths in slots (sixteenths) with VexFlow duration + dots, largest first. */
const FIGURES = [
  { slots: 16, duration: "w", dots: 0 },
  { slots: 12, duration: "h", dots: 1 },
  { slots: 8, duration: "h", dots: 0 },
  { slots: 6, duration: "q", dots: 1 },
  { slots: 4, duration: "q", dots: 0 },
  { slots: 3, duration: "8", dots: 1 },
  { slots: 2, duration: "8", dots: 0 },
  { slots: 1, duration: "16", dots: 0 },
];

export interface Piece {
  slot: number;
  duration: string;
  dots: number;
}

export type FigureKind = "note" | "rest";

/**
 * Notes may start on any beat (a half note on beat 2 is the usual syncopation); shorter figures stay inside
 * their beat. Rests are stricter: only undotted figures, each aligned to its own size (a half rest only on
 * beat 1 or 3, a whole rest only at the bar start). So the free space of a measure always reads as the
 * subdivisions you would expect: whole, half, quarter, eighth... and never as stray eighth rests.
 */
const aligned = (pos: number, slots: number, kind: FigureKind) => {
  if (kind === "rest") return pos % slots === 0;
  if (slots >= 4) return pos % 4 === 0;
  return pos % (slots === 3 ? 2 : slots) === 0;
};

/** Split `length` slots starting at `start` (inside a measure) into valid figures. */
export function decompose(start: number, length: number, kind: FigureKind = "note"): Piece[] {
  const figs = kind === "rest" ? FIGURES.filter((f) => f.dots === 0) : FIGURES;
  const pieces: Piece[] = [];
  let pos = start;
  let left = length;
  while (left > 0) {
    const f = figs.find((x) => x.slots <= left && aligned(pos, x.slots, kind))!; // slots=1 always matches
    pieces.push({ slot: pos, duration: f.duration, dots: f.dots });
    pos += f.slots;
    left -= f.slots;
  }
  return pieces;
}
