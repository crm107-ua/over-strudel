"use client";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { convertScore, type ImportOptions, type ImportResult } from "@/lib/import/convert";
import { readScoreFile, recognisePdf, type OmrProgress } from "@/lib/import/files";
import { parseMusicXML, type XScore } from "@/lib/import/musicxml";
import { getKey } from "@/lib/keys";
import { useScore } from "@/store/useScore";

type Phase =
  | { t: "idle" }
  | { t: "working"; name: string; omr: boolean; progress?: OmrProgress; since: number }
  | { t: "ready"; name: string; omr: boolean; score: XScore }
  | { t: "error"; message: string };

const ACCEPT = ".pdf,.musicxml,.xml,.mxl,application/pdf";

/** Import a score: MusicXML / MXL directly, a PDF through optical music recognition. Everything ends as editor code. */
export default function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>({ t: "idle" });
  const [opts, setOpts] = useState<Required<Pick<ImportOptions, "expandRepeats" | "expression">> & { from: number; count: number }>({ expandRepeats: true, expression: true, from: 0, count: 64 });
  const [drag, setDrag] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // seconds counter while the recognition runs
  useEffect(() => {
    if (phase.t !== "working") return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - phase.since) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  const close = (v: boolean) => {
    if (!v) {
      abort.current?.abort();
      setPhase({ t: "idle" });
    }
    onOpenChange(v);
  };

  const handle = useCallback(async (file: File) => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setOpts((o) => ({ ...o, from: 0, count: 64 }));
    try {
      const f = await readScoreFile(file);
      if (f.kind === "pdf") {
        setElapsed(0);
        setPhase({ t: "working", name: f.name, omr: true, since: Date.now() });
        const xml = await recognisePdf(f.bytes, {
          signal: ctl.signal,
          onProgress: (progress) => setPhase((p) => (p.t === "working" ? { ...p, progress } : p)),
        });
        setPhase({ t: "ready", name: f.name, omr: true, score: parseMusicXML(xml) });
      } else {
        setPhase({ t: "working", name: f.name, omr: false, since: Date.now() });
        setPhase({ t: "ready", name: f.name, omr: false, score: parseMusicXML(f.xml) });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPhase({ t: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const result: ImportResult | null = (() => {
    if (phase.t !== "ready") return null;
    try {
      return convertScore(phase.score, { expandRepeats: opts.expandRepeats, expression: opts.expression, from: opts.from, count: opts.count });
    } catch {
      return null;
    }
  })();

  const load = () => {
    if (!result) return;
    useScore.getState().importCode(result.code);
    close(false);
  };

  const r = result?.report;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="dark max-h-[90vh] overflow-y-auto sm:max-w-xl" aria-label="Importar partitura" data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">Importar partitura</DialogTitle>
          <DialogDescription>
            PDF (reconocimiento óptico), MusicXML (<code>.musicxml</code>, <code>.xml</code>) o <code>.mxl</code>. Se convierte en código Strudel y se carga en el editor.
          </DialogDescription>
        </DialogHeader>

        {(phase.t === "idle" || phase.t === "error") && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) void handle(f);
              }}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
              data-testid="import-drop"
            >
              <FileUp className="size-7 text-muted-foreground" />
              <p className="text-sm">Arrastra aquí la partitura o pulsa para elegirla</p>
              <p className="text-[12px] text-muted-foreground">PDF · MusicXML · MXL — hasta 25 MB</p>
              <input ref={input} type="file" accept={ACCEPT} className="hidden" data-testid="import-file" onChange={(e) => e.target.files?.[0] && void handle(e.target.files[0])} />
            </div>
            {phase.t === "error" && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {phase.message}
              </p>
            )}
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Los PDF se reconocen con <b>Audiveris</b> (reconocimiento óptico de música) en el servidor; el archivo no se guarda. El resultado depende de la calidad del
              PDF: revisa siempre la partitura cargada (<b>Ctrl+Z</b> devuelve tu código anterior).
            </p>
          </>
        )}

        {phase.t === "working" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="import-working">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm">{phase.omr ? "Reconociendo la partitura…" : "Leyendo la partitura…"}</p>
            <p className="text-[12px] text-muted-foreground">
              {phase.name}
              {phase.omr && ` · ${elapsed} s`}
              {phase.progress && phase.progress.status === "queued" && phase.progress.position > 0 && ` · en cola (puesto ${phase.progress.position})`}
            </p>
            {phase.omr && <p className="max-w-sm text-[12px] text-muted-foreground">Suele tardar entre 30 y 90 segundos, según las páginas.</p>}
            <Button variant="outline" size="sm" onClick={() => close(false)}>
              Cancelar
            </Button>
          </div>
        )}

        {phase.t === "ready" && r && result && (
          <div className="space-y-4" data-testid="import-result">
            <div>
              <p className="text-sm font-medium">{result.title ?? phase.name}</p>
              <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                {[
                  `${r.notes} notas`,
                  `${r.importedMeasures} compases`,
                  getKey(result.keyId).label,
                  result.cpm !== null ? `♩ = ${Math.round(result.cpm * 4)}` : "tempo por defecto",
                  r.parts.length ? `${r.parts.length} ${r.parts.length === 1 ? "parte" : "partes"}` : null,
                ]
                  .filter(Boolean)
                  .map((c) => (
                    <span key={c} className="rounded-full border border-border bg-muted/40 px-2 py-0.5">
                      {c}
                    </span>
                  ))}
              </p>
            </div>

            {phase.omr && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Resultado de un reconocimiento óptico: revisa la partitura. Las ligaduras, los tresillos y los símbolos poco comunes son lo que más falla.
              </p>
            )}

            {r.messages.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-[12px] text-muted-foreground" data-testid="import-messages">
                {r.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="imp-repeats" className="text-[13px]">
                  Desenrollar repeticiones y casillas
                </Label>
                <Switch id="imp-repeats" size="sm" checked={opts.expandRepeats} onCheckedChange={(v) => setOpts((o) => ({ ...o, expandRepeats: v, from: 0 }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="imp-expr" className="text-[13px]">
                  Dinámicas y articulaciones
                </Label>
                <Switch id="imp-expr" size="sm" checked={opts.expression} onCheckedChange={(v) => setOpts((o) => ({ ...o, expression: v }))} />
              </div>
              {r.playedMeasures > 64 && (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="imp-from" className="text-[13px]">
                    Desde el compás (de {r.playedMeasures})
                  </Label>
                  <Input id="imp-from" type="number" min={1} max={r.playedMeasures} value={opts.from + 1} className="h-7 w-20" onChange={(e) => setOpts((o) => ({ ...o, from: Math.max(0, Math.min(r.playedMeasures - 1, Math.round(Number(e.target.value)) - 1 || 0)) }))} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPhase({ t: "idle" })}>
                Elegir otro archivo
              </Button>
              <Button size="sm" onClick={load} disabled={!r.notes} data-testid="import-load">
                Cargar en el editor
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
