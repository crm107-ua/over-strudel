"use client";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScore } from "@/store/useScore";
import { Tip } from "./Tip";

/** Sheet navigation: first / previous / "n of N" / next / last. */
export default function ScorePager({ measuresPerPage }: { measuresPerPage: number }) {
  const page = useScore((s) => s.page);
  const pageCount = useScore((s) => s.pageCount);
  const total = useScore((s) => s.score.measures.length);
  const setPage = useScore((s) => s.setPage);
  const period = useScore((s) => s.period);
  const fromCode = useScore((s) => s.measuresFromCode);
  const setMeasures = useScore((s) => s.setMeasures);
  const setCode = useScore((s) => s.setCode);
  const from = page * measuresPerPage + 1;
  const to = Math.min(total, (page + 1) * measuresPerPage);

  // the piece lasts longer than what is drawn: say it and offer to draw all of it
  const longer = period !== null && period > total;
  const drawAll = () => {
    if (period === null) return;
    if (fromCode) setCode(useScore.getState().code.replace(/(\/\/\s*@(?:compases|measures)\s+)\d+/i, `$1${period}`));
    else setMeasures(period);
  };
  // sheet numbers: first, last and the neighbours of the current one
  const nums = [...new Set([0, page - 1, page, page + 1, pageCount - 1])].filter((n) => n >= 0 && n < pageCount).sort((a, b) => a - b);

  return (
    <div data-testid="pager" className="flex items-center justify-center gap-1.5 border-t border-border bg-card px-4 py-1.5 text-card-foreground">
      <Tip label="Primera hoja (Inicio)" side="top">
        <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => setPage(0)} aria-label="Primera hoja">
          <ChevronsLeft />
        </Button>
      </Tip>
      <Tip label="Hoja anterior (Re Pág)" side="top">
        <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Hoja anterior">
          <ChevronLeft />
        </Button>
      </Tip>
      <span className="text-xs text-muted-foreground">Hoja</span>
      <Input
        type="number"
        min={1}
        max={pageCount}
        value={page + 1}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 1) setPage(n - 1);
        }}
        aria-label="Número de hoja"
        data-testid="page-input"
        className="h-7 w-14 text-center"
      />
      <span className="text-xs text-muted-foreground" data-testid="page-total">
        de {pageCount}
      </span>
      <Tip label="Hoja siguiente (Av Pág)" side="top">
        <Button variant="ghost" size="icon-sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} aria-label="Hoja siguiente">
          <ChevronRight />
        </Button>
      </Tip>
      <Tip label="Última hoja (Fin)" side="top">
        <Button variant="ghost" size="icon-sm" disabled={page >= pageCount - 1} onClick={() => setPage(pageCount - 1)} aria-label="Última hoja">
          <ChevronsRight />
        </Button>
      </Tip>
      <div className="ml-1 flex items-center gap-0.5" data-testid="page-list">
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-0.5">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-0.5 text-xs text-muted-foreground">…</span>}
            <Button variant={n === page ? "secondary" : "ghost"} size="icon-sm" className="h-6 min-w-6 px-1 text-xs" onClick={() => setPage(n)} aria-label={`Ir a la hoja ${n + 1}`} aria-current={n === page}>
              {n + 1}
            </Button>
          </span>
        ))}
      </div>
      <span className="ml-3 text-xs text-muted-foreground" data-testid="page-range">
        Compases {from}–{to} de {total} · {measuresPerPage} por hoja
      </span>
      {longer && (
        <span className="ml-2 flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-600 dark:text-amber-300" data-testid="period-hint">
          La pieza completa dura {period} compases (se dibujan {total})
          <button type="button" onClick={drawAll} className="font-medium underline underline-offset-2 hover:no-underline" data-testid="draw-all">
            Dibujar todos
          </button>
        </span>
      )}
    </div>
  );
}
