"use client";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { effectiveDynamics } from "@/lib/edit/doc";
import { DUR_NAME, durInfo, isBlackKey, nameES } from "@/lib/edit/noteInfo";
import type { EditAction } from "@/lib/edit/shortcuts";
import { clipToArticulation } from "@/lib/middleware/dynamics";
import type { Dynamic } from "@/lib/types";
import { useScore } from "@/store/useScore";
import { ON, Tip } from "./Tip";

/**
 * Small contextual menu floating next to the selected note: everything you can change about it, right where you
 * are looking. It never takes keyboard focus, so the score shortcuts keep working while it is open.
 */
export default function NotePopover({ anchor, width, onEnter }: { anchor: { x: number; y: number }; width: number; onEnter?: () => void }) {
  const doc = useScore((s) => s.doc);
  const selection = useScore((s) => s.selection);
  const act = useScore((s) => s.act);
  const run = (a: EditAction) => () => act(a);

  const selected = doc.events.filter((e) => selection.includes(e.id)).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const first = selected[0];
  if (!first) return null;
  const info = durInfo(first.dur);
  const dyn = effectiveDynamics(doc.events).get(first.id);
  const art = clipToArticulation(first.clip);
  const black = isBlackKey(first.midi);

  const W = 372;
  const left = Math.max(6, Math.min(width - W - 6, anchor.x - 24));
  // clear of the note AND its stem/flag (about 40px): well above it, or well below when there is no room
  const above = anchor.y - 118;
  const top = above < 4 ? anchor.y + 46 : above;
  const item = "h-6 min-w-6 px-1.5 text-[11px]";

  return (
    <div
      data-testid="note-popover"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerEnter={onEnter}
      onContextMenu={(e) => e.stopPropagation()}
      className="absolute z-20 rounded-lg border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur"
      style={{ left, top, width: W }}
    >
      <div className="flex items-center gap-1">
        <span data-testid="popover-name" className="mx-1.5 min-w-12 text-[13px] font-semibold tracking-tight">
          {selected.length > 1 ? `${selected.length} notas` : nameES(first.midi)}
        </span>
        <Tip label="Bajar un semitono (↓)" side="top">
          <Button variant="ghost" size="icon-xs" onClick={run({ type: "transpose", semitones: -1 })} aria-label="Bajar un semitono">
            <ChevronDown />
          </Button>
        </Tip>
        <Tip label="Subir un semitono (↑)" side="top">
          <Button variant="ghost" size="icon-xs" onClick={run({ type: "transpose", semitones: 1 })} aria-label="Subir un semitono">
            <ChevronUp />
          </Button>
        </Tip>
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <ToggleGroup size="sm" spacing={0} value={[String(info.base)]} onValueChange={(v) => v[0] && act({ type: "duration", base: Number(v[0]) })} aria-label="Duración de la nota">
          {([[1, "1/16"], [2, "1/8"], [4, "1/4"], [8, "1/2"], [16, "1"]] as const).map(([base, l]) => (
            <Tip key={base} label={`${DUR_NAME[base]} (${[1, 2, 4, 8, 16].indexOf(base) + 1})`} side="top">
              <ToggleGroupItem value={String(base)} aria-label={DUR_NAME[base]} className={`${item} ${ON}`}>
                {l}
              </ToggleGroupItem>
            </Tip>
          ))}
        </ToggleGroup>
        <Tip label="Puntillo (.)" side="top">
          <Toggle size="sm" pressed={info.dot} onPressedChange={() => act({ type: "dot" })} className={`${item} ${ON}`} aria-label="Puntillo">
            •
          </Toggle>
        </Tip>
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <Tip label="Borrar la nota (Supr)" side="top">
          <Button variant="destructive" size="icon-xs" data-testid="popover-delete" onClick={run({ type: "delete" })} aria-label="Borrar la nota">
            <X />
          </Button>
        </Tip>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <ToggleGroup
          size="sm"
          spacing={0}
          value={[black ? "1" : "0"]}
          onValueChange={(v) => v[0] && act({ type: "accidental", value: Number(v[0]) as -1 | 0 | 1 })}
          aria-label="Alteración de la nota"
        >
          <ToggleGroupItem value="-1" aria-label="Bemol" className={`${item} ${ON}`}>♭</ToggleGroupItem>
          <ToggleGroupItem value="0" aria-label="Natural" className={`${item} ${ON}`}>♮</ToggleGroupItem>
          <ToggleGroupItem value="1" aria-label="Sostenido" className={`${item} ${ON}`}>♯</ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <ToggleGroup
          size="sm"
          spacing={0}
          value={dyn ? [dyn] : []}
          onValueChange={(v) => act({ type: "dynamic", dyn: (v[0] as Dynamic | undefined) ?? null })}
          aria-label="Dinámica"
        >
          {(["p", "mf", "f"] as const).map((d) => (
            <ToggleGroupItem key={d} value={d} aria-label={`Dinámica ${d}`} className={`${item} font-serif italic ${ON}`}>
              {d}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <ToggleGroup
          size="sm"
          spacing={0}
          value={art ? [art] : []}
          onValueChange={(v) => act({ type: "articulation", art: ((v[0] ?? art) as "staccato" | "tenuto") })}
          aria-label="Articulación"
        >
          <Tip label="Staccato (S)" side="top">
            <ToggleGroupItem value="staccato" aria-label="Staccato" className={`${item} ${ON}`}>stacc.</ToggleGroupItem>
          </Tip>
          <Tip label="Tenuto (T)" side="top">
            <ToggleGroupItem value="tenuto" aria-label="Tenuto" className={`${item} ${ON}`}>ten.</ToggleGroupItem>
          </Tip>
        </ToggleGroup>
        <Tip label="Unir con la siguiente nota igual (J)" side="top">
          <Button variant="ghost" size="xs" onClick={run({ type: "join" })} aria-label="Unir">
            Unir
          </Button>
        </Tip>
      </div>
    </div>
  );
}
