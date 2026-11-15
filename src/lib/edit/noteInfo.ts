const ES = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];

/** midi -> "Fa♯4" (Spanish solfège + octave). */
export const nameES = (midi: number) => `${ES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export const DUR_NAME: Record<number, string> = { 1: "Semicorchea", 2: "Corchea", 4: "Negra", 8: "Blanca", 16: "Redonda" };

/** A length in sixteenths as the notation shows it: base figure + dot (+ tie if it needs several figures). */
export function durInfo(dur: number) {
  const figs: [number, number, boolean][] = [
    [16, 16, false], [12, 8, true], [8, 8, false], [6, 4, true], [4, 4, false], [3, 2, true], [2, 2, false], [1, 1, false],
  ];
  const f = figs.find(([n]) => n <= dur) ?? figs[figs.length - 1];
  return { base: f[1], dot: f[2], tied: f[0] !== dur };
}

const SHORT: Record<number, string> = { 1: "1/16", 2: "1/8", 3: "1/8·", 4: "1/4", 6: "1/4·", 8: "1/2", 12: "1/2·", 16: "1" };
/** Compact duration label: "1/8", "1/4·" (dotted) or "5/16" for lengths that need a tie. */
export const durLabel = (dur: number) => SHORT[dur] ?? `${dur}/16`;

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
