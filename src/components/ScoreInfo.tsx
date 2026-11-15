"use client";
import { useScore } from "@/store/useScore";

/** Says, in plain words, WHY the score looks the way it does (measure count + number of staves). */
export default function ScoreInfo() {
  const measures = useScore((s) => s.measures);
  const fromCode = useScore((s) => s.measuresFromCode);
  const staffMode = useScore((s) => s.staffMode);
  const grand = useScore((s) => s.score.grand);

  const staff =
    staffMode === "piano"
      ? "2 pentagramas · forzado con @pentagrama piano"
      : staffMode === "treble"
        ? "1 pentagrama · forzado con @pentagrama sol"
        : grand
          ? "2 pentagramas · hay notas por debajo de Do central (C4) → clave de Fa"
          : "1 pentagrama · todas las notas ≥ Do central (clave de Sol)";

  const chip = "rounded-full border border-[color:var(--sc-line)] bg-[color:var(--sc-chip)] px-2.5 py-0.5 text-[11px] normal-case tracking-normal text-[color:var(--sc-chip-text)]";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={chip}>
        <b>{measures}</b> compases · {fromCode ? "fijado con @compases" : "selector"}
      </span>
      <span className={chip}>{staff}</span>
    </div>
  );
}
