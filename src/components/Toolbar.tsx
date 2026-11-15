"use client";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXAMPLES } from "@/lib/examples";
import { MAX_MEASURES } from "@/lib/directives";
import { useScore } from "@/store/useScore";
import Logo from "./Logo";
import PlayButton from "./PlayButton";

const ITEMS = [{ value: "custom", label: "Personalizado" }, ...EXAMPLES.map((e) => ({ value: e.id, label: e.title }))];

export default function Toolbar({ onOpenGuide }: { onOpenGuide: () => void }) {
  const exampleId = useScore((s) => s.exampleId);
  const measuresSetting = useScore((s) => s.measuresSetting);
  const measures = useScore((s) => s.measures);
  const fromCode = useScore((s) => s.measuresFromCode);
  const loadExample = useScore((s) => s.loadExample);
  const setMeasures = useScore((s) => s.setMeasures);

  return (
    <header className="dark shrink-0 border-b border-border bg-[#0d0f15] text-foreground">
      <div className="flex h-16 items-center justify-center">
        <div className="flex items-center gap-3.5">
          <Logo size={34} />
          <h1 className="text-[19px] leading-none tracking-[0.04em]">
            <span className="font-semibold">Over</span>
            <span className="ml-1.5 font-light text-muted-foreground">Strudel</span>
          </h1>
        </div>
      </div>

      <div className="flex h-12 items-center gap-4 px-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Ejemplo</Label>
          <Select
            items={ITEMS}
            value={exampleId || "custom"}
            onValueChange={(v) => v && v !== "custom" && loadExample(v)}
          >
            <SelectTrigger size="sm" className="w-64" aria-label="Ejemplo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="dark">
              {ITEMS.map((i) => (
                <SelectItem key={i.value} value={i.value} disabled={i.value === "custom"}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="measures-input" className="text-xs text-muted-foreground">
            Compases
          </Label>
          <Input
            id="measures-input"
            type="number"
            min={1}
            max={MAX_MEASURES}
            value={fromCode ? measures : measuresSetting}
            disabled={fromCode}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n >= 1) setMeasures(Math.min(MAX_MEASURES, n));
            }}
            title={fromCode ? "Fijado por la directiva // @compases en el código" : "Número de compases a dibujar"}
            className="h-7 w-[4.5rem]"
          />
          {fromCode && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">@compases {measures}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenGuide}>
            <BookOpen /> Guía del lenguaje
          </Button>
          <PlayButton />
        </div>
      </div>
    </header>
  );
}
