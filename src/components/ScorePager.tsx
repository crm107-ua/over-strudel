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
  const from = page * measuresPerPage + 1;
  const to = Math.min(total, (page + 1) * measuresPerPage);

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
      <span className="ml-3 text-xs text-muted-foreground" data-testid="page-range">
        Compases {from}–{to} de {total}
      </span>
    </div>
  );
}
