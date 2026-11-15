"use client";
import { useScore } from "@/store/useScore";

const LABEL = { idle: "Listo", busy: "Evaluando…", ok: "Partitura actualizada", error: "Error" } as const;
const DOT = {
  idle: "bg-neutral-500",
  busy: "bg-amber-400 animate-pulse",
  ok: "bg-emerald-400",
  error: "bg-red-500",
} as const;

export default function StatusBar() {
  const status = useScore((s) => s.status);
  const measures = useScore((s) => s.measures);
  const isPlaying = useScore((s) => s.isPlaying);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-white/10 bg-[#0f1117] px-4 text-[11px] text-neutral-400">
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
        {LABEL[status]}
      </span>
      <span>{measures} compases · 4/4 · 1 ciclo = 1 compás</span>
      {isPlaying && <span className="text-indigo-300">● Sonando</span>}
      <span className="ml-auto">Ctrl/⌘ + Enter evalúa y actualiza el audio</span>
      <a
        href="https://github.com/crm107-ua/over-strudel"
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:text-indigo-300 hover:underline"
        title="Este servicio se publica bajo la AGPL-3.0: el código fuente completo está disponible aquí"
      >
        Código fuente · AGPL-3.0
      </a>
    </footer>
  );
}
