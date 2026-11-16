"use client";
import { AlertTriangle, Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggest } from "@/lib/ai/classics";
import { useScore } from "@/store/useScore";

interface Result {
  title: string;
  composer: string;
  key: string;
  bpm: number;
  notes: string;
  code: string;
  attempts: number;
  measures: number;
  notesCount: number;
  model: string;
}
type Phase = { t: "form" } | { t: "working"; stage: string; since: number } | { t: "done"; result: Result } | { t: "error"; message: string };

const PW_KEY = "os-gen-pw";
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), rej(new DOMException("cancelado", "AbortError"))), { once: true });
  });

/** "Crear con IA": the user names a piece, Gemini writes it as Strudel code in the editor's own format. */
export default function GenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [measures, setMeasures] = useState(16);
  const [password, setPassword] = useState("");
  const [focus, setFocus] = useState(false);
  const [phase, setPhase] = useState<Phase>({ t: "form" });
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  // the password is remembered for this tab only
  useEffect(() => {
    try {
      const p = sessionStorage.getItem(PW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser, after hydration
      if (p) setPassword(p);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (phase.t !== "working") return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - phase.since) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  const close = (v: boolean) => {
    if (!v) {
      abort.current?.abort();
      setPhase({ t: "form" });
    }
    onOpenChange(v);
  };

  const run = async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setElapsed(0);
    setPhase({ t: "working", stage: "Enviando…", since: Date.now() });
    try {
      const start = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, password, measures }),
        signal: ctl.signal,
      });
      const first = (await start.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!start.ok || !first.id) throw new Error(first.error ?? `No se pudo iniciar (${start.status}).`);
      try {
        sessionStorage.setItem(PW_KEY, password);
      } catch {
        /* storage unavailable */
      }
      const deadline = Date.now() + 8 * 60_000;
      for (;;) {
        await sleep(2500, ctl.signal);
        const res = await fetch(`/api/generate?id=${first.id}`, { signal: ctl.signal, cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { status?: string; stage?: string; result?: Result; error?: string };
        if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
        if (j.status === "done" && j.result) return setPhase({ t: "done", result: j.result });
        if (j.status === "error") throw new Error(j.error ?? "No se pudo generar la pieza.");
        setPhase((p) => (p.t === "working" ? { ...p, stage: j.stage ?? p.stage } : p));
        if (Date.now() > deadline) throw new Error("La generación tardó demasiado.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPhase({ t: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const load = () => {
    if (phase.t !== "done") return;
    useScore.getState().loadCode(phase.result.code);
    close(false);
  };

  const sugg = focus ? suggest(title) : [];
  const ready = title.trim().length >= 2 && password.length > 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="dark max-h-[90vh] overflow-y-auto sm:max-w-xl" aria-label="Crear con IA" data-testid="generate-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> Crear con IA
          </DialogTitle>
          <DialogDescription>Escribe el título de una pieza clásica: Gemini la transcribe a código Strudel, en el formato exacto del editor.</DialogDescription>
        </DialogHeader>

        {(phase.t === "form" || phase.t === "error") && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) void run();
            }}
          >
            <div className="relative space-y-1.5">
              <Label htmlFor="gen-title" className="text-[13px]">
                Pieza
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
                <Input
                  id="gen-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onFocus={() => setFocus(true)}
                  onBlur={() => setTimeout(() => setFocus(false), 150)}
                  placeholder="Para Elisa, Beethoven · Nocturno Op. 9 n.º 2 · Canon en re…"
                  className="h-9 pl-8"
                  autoComplete="off"
                  data-testid="gen-title"
                />
              </div>
              {sugg.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg" role="listbox" data-testid="gen-suggestions">
                  {sugg.map((s) => (
                    <li key={s}>
                      <button type="button" role="option" aria-selected={false} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted" onMouseDown={(e) => (e.preventDefault(), setTitle(s), setFocus(false))}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gen-measures" className="text-[13px]">
                  Compases (4–64)
                </Label>
                <Input id="gen-measures" type="number" min={4} max={64} value={measures} onChange={(e) => setMeasures(Math.max(4, Math.min(64, Math.round(Number(e.target.value)) || 16)))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-password" className="text-[13px]">
                  Contraseña
                </Label>
                <Input id="gen-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-9" data-testid="gen-password" />
              </div>
            </div>

            {phase.t === "error" && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]" data-testid="gen-error">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {phase.message}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Transcribe el comienzo de la pieza. El resultado se comprueba compás a compás, pero conviene revisarlo: una IA puede equivocarse de notas.
              </p>
              <Button type="submit" size="sm" disabled={!ready} data-testid="gen-submit">
                <Sparkles /> Generar
              </Button>
            </div>
          </form>
        )}

        {phase.t === "working" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="gen-working">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm">{phase.stage}</p>
            <p className="text-[12px] text-muted-foreground">
              {title} · {elapsed} s
            </p>
            <p className="max-w-sm text-[12px] text-muted-foreground">Suele tardar entre 1 y 3 minutos.</p>
            <Button variant="outline" size="sm" onClick={() => close(false)}>
              Cancelar
            </Button>
          </div>
        )}

        {phase.t === "done" && (
          <div className="space-y-4" data-testid="gen-result">
            <div>
              <p className="text-sm font-medium">
                {phase.result.title}
                {phase.result.composer && <span className="font-normal text-muted-foreground"> — {phase.result.composer}</span>}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                {[`${phase.result.notesCount} notas`, `${phase.result.measures} compases`, phase.result.key, `♩ = ${Math.round(phase.result.bpm)}`, phase.result.attempts > 1 ? `corregida ${phase.result.attempts - 1} ${phase.result.attempts === 2 ? "vez" : "veces"}` : "sin correcciones"]
                  .filter(Boolean)
                  .map((c) => (
                    <span key={c} className="rounded-full border border-border bg-muted/40 px-2 py-0.5">
                      {c}
                    </span>
                  ))}
              </p>
            </div>
            {phase.result.notes && <p className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] leading-relaxed text-muted-foreground">{phase.result.notes}</p>}
            <p className="flex items-start gap-2 text-[12px] text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Escúchala y compárala con la partitura original: es una transcripción de memoria de una IA. <b>Ctrl+Z</b> devuelve tu código anterior.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPhase({ t: "form" })}>
                Otra pieza
              </Button>
              <Button size="sm" onClick={load} data-testid="gen-load">
                Cargar en el editor
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
