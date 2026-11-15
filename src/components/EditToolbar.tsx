"use client";
import { Minus, Moon, Pencil, Plus, Redo2, SkipBack, SkipForward, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KEYS } from "@/lib/keys";
import { useScore } from "@/store/useScore";
import { ON, Tip } from "./Tip";

const KEY_ITEMS = KEYS.map((k) => ({ value: k.id, label: k.label }));
const DURATIONS = [
  { base: 1, label: "1/16", tip: "Semicorchea (1)" },
  { base: 2, label: "1/8", tip: "Corchea (2)" },
  { base: 4, label: "1/4", tip: "Negra (3)" },
  { base: 8, label: "1/2", tip: "Blanca (4)" },
  { base: 16, label: "1", tip: "Redonda (5)" },
] as const;

/** The palette: what the next note you place will be like (and what the selected note becomes). */
export default function EditToolbar({ onHelp }: { onHelp: () => void }) {
  const editMode = useScore((s) => s.editMode);
  const setEditMode = useScore((s) => s.setEditMode);
  const tool = useScore((s) => s.tool);
  const noteKind = useScore((s) => s.noteKind);
  const entryMode = useScore((s) => s.entryMode);
  const cursor = useScore((s) => s.cursor);
  const docEnd = useScore((s) => s.doc.events.reduce((m, e) => Math.max(m, e.start + e.dur), 0));
  const setNoteKind = useScore((s) => s.setNoteKind);
  const setEntryMode = useScore((s) => s.setEntryMode);
  const setCursor = useScore((s) => s.setCursor);
  // sequential entry: what is left of the measure the cursor is in (a longer figure would not fit)
  const remaining = cursor % 16 === 0 ? 16 : 16 - (cursor % 16);
  const measures = useScore((s) => s.measures);
  const keyId = useScore((s) => s.keyId);
  const transposeOnKeyChange = useScore((s) => s.transposeOnKeyChange);
  const setKey = useScore((s) => s.setKey);
  const setTranspose = useScore((s) => s.setTransposeOnKeyChange);
  const canUndo = useScore((s) => s.past.length > 0);
  const canRedo = useScore((s) => s.future.length > 0);
  const theme = useScore((s) => s.scoreTheme);
  const setTheme = useScore((s) => s.setScoreTheme);
  const act = useScore((s) => s.act);
  const off = !editMode;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-1.5 text-card-foreground">
      <Tip label="Activar / desactivar la edición con clic sobre la partitura">
        <Toggle variant="outline" size="sm" pressed={editMode} onPressedChange={setEditMode} className={ON} aria-label="Edición">
          <Pencil /> {editMode ? "Edición" : "Solo ver"}
        </Toggle>
      </Tip>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[noteKind]}
        onValueChange={(v) => v[0] && setNoteKind(v[0] as "note" | "rest")}
        disabled={off}
        aria-label="Modo de escritura"
        data-testid="kind-group"
      >
        <Tip label="Escribir notas · R cambia entre nota y silencio">
          <ToggleGroupItem value="note" aria-label="Modo nota" className={ON}>Nota</ToggleGroupItem>
        </Tip>
        <Tip label="Escribir silencios, igual que las notas · R">
          <ToggleGroupItem value="rest" aria-label="Modo silencio" className={ON}>Silencio</ToggleGroupItem>
        </Tip>
      </ToggleGroup>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[entryMode]}
        onValueChange={(v) => v[0] && setEntryMode(v[0] as "sequence" | "free")}
        disabled={off}
        aria-label="Entrada"
        data-testid="entry-group"
      >
        <Tip label="Secuencial: cada nota o silencio se escribe a continuación, en el cursor">
          <ToggleGroupItem value="sequence" aria-label="Entrada secuencial" className={ON}>Secuencial</ToggleGroupItem>
        </Tip>
        <Tip label="Libre: se coloca donde haces clic">
          <ToggleGroupItem value="free" aria-label="Entrada libre" className={ON}>Libre</ToggleGroupItem>
        </Tip>
      </ToggleGroup>
      {entryMode === "sequence" && (
        <>
          <Tip label="Cursor al principio">
            <Button variant="outline" size="icon-sm" disabled={off} onClick={() => setCursor(0)} aria-label="Cursor al principio">
              <SkipBack />
            </Button>
          </Tip>
          <Tip label="Cursor al final de lo escrito">
            <Button variant="outline" size="icon-sm" disabled={off} onClick={() => setCursor(docEnd)} aria-label="Cursor al final">
              <SkipForward />
            </Button>
          </Tip>
        </>
      )}
      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[String(tool.dur)]}
        onValueChange={(v) => v[0] && act({ type: "duration", base: Number(v[0]) })}
        disabled={off}
        aria-label="Duración"
      >
        {DURATIONS.map((d) => (
          <Tip key={d.base} label={d.tip}>
            <ToggleGroupItem value={String(d.base)} aria-label={d.tip} className={ON} disabled={off || (entryMode === "sequence" && d.base > remaining)}>
              {d.label}
            </ToggleGroupItem>
          </Tip>
        ))}
      </ToggleGroup>
      <Tip label="Puntillo (.)">
        <Toggle variant="outline" size="sm" pressed={tool.dot} onPressedChange={() => act({ type: "dot" })} disabled={off || tool.dur === 1} className={ON} aria-label="Puntillo">
          •
        </Toggle>
      </Tip>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={tool.accidental === null ? [] : [String(tool.accidental)]}
        onValueChange={(v) => act({ type: "accidental", value: v[0] === undefined ? null : (Number(v[0]) as -1 | 0 | 1) })}
        disabled={off}
        aria-label="Alteración"
      >
        <Tip label="Bemol (vuelve a pulsar para seguir la armadura)">
          <ToggleGroupItem value="-1" aria-label="Bemol" className={ON}>♭</ToggleGroupItem>
        </Tip>
        <Tip label="Becuadro">
          <ToggleGroupItem value="0" aria-label="Sin alteración" className={ON}>♮</ToggleGroupItem>
        </Tip>
        <Tip label="Sostenido (vuelve a pulsar para seguir la armadura)">
          <ToggleGroupItem value="1" aria-label="Sostenido" className={ON}>♯</ToggleGroupItem>
        </Tip>
      </ToggleGroup>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Tonalidad</Label>
        <Select items={KEY_ITEMS} value={keyId} onValueChange={(v) => v && setKey(v)} disabled={off}>
          <SelectTrigger size="sm" className="w-36" aria-label="Tonalidad" data-testid="key-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className={theme === "dark" ? "dark" : ""}>
            <SelectGroup>
              <SelectLabel>Mayores</SelectLabel>
              {KEY_ITEMS.filter((k) => !k.value.endsWith("m")).map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Menores</SelectLabel>
              {KEY_ITEMS.filter((k) => k.value.endsWith("m")).map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Tip label="Al cambiar de tonalidad, transponer también todas las notas de la obra">
          <div className="flex items-center gap-1.5">
            <Switch id="transpose-switch" size="sm" checked={transposeOnKeyChange} onCheckedChange={setTranspose} disabled={off} aria-label="Transponer la obra" />
            <Label htmlFor="transpose-switch" className="text-xs text-muted-foreground">Transponer</Label>
          </div>
        </Tip>
      </div>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tip label="Deshacer (Ctrl+Z)">
        <Button variant="outline" size="icon-sm" disabled={!canUndo} onClick={() => act({ type: "undo" })} aria-label="Deshacer">
          <Undo2 />
        </Button>
      </Tip>
      <Tip label="Rehacer (Ctrl+Y)">
        <Button variant="outline" size="icon-sm" disabled={!canRedo} onClick={() => act({ type: "redo" })} aria-label="Rehacer">
          <Redo2 />
        </Button>
      </Tip>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tip label="Añadir un compás al final">
        <Button variant="outline" size="sm" data-testid="add-measure-btn" disabled={off || measures >= 64} onClick={() => act({ type: "addMeasure" })} aria-label="Añadir compás">
          <Plus /> Compás
        </Button>
      </Tip>
      <Tip label="Quitar el último compás">
        <Button variant="outline" size="sm" data-testid="remove-measure-btn" disabled={off || measures <= 1} onClick={() => act({ type: "removeMeasure" })} aria-label="Quitar compás">
          <Minus /> Compás
        </Button>
      </Tip>

      <div className="ml-auto flex items-center gap-2">
        <Tip label="Cambiar el aspecto de la partitura">
          <Button variant="outline" size="sm" data-testid="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Claro" : "Oscuro"}
          </Button>
        </Tip>
        <Button variant="link" size="sm" onClick={onHelp}>
          Atajos
        </Button>
      </div>
    </div>
  );
}
