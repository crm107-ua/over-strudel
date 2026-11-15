import type { Articulation, Dynamic } from "../types";

export type EditAction =
  | { type: "duration"; base: number } // slots: 1,2,4,8,16
  | { type: "dot" }
  | { type: "transpose"; semitones: number }
  | { type: "move"; slots: number }
  | { type: "extend"; slots: number }
  | { type: "delete" }
  | { type: "join" }
  | { type: "articulation"; art: Articulation }
  | { type: "dynamic"; dyn: Dynamic | null }
  | { type: "accidental"; value: -1 | 0 | 1 | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "selectAll" }
  | { type: "clear" }
  | { type: "navigate"; dir: 1 | -1 }
  | { type: "duplicate" }
  | { type: "toggleRest" }
  | { type: "enter" }
  | { type: "addMeasure" }
  | { type: "removeMeasure" }
  | { type: "togglePlay" };

export interface KeyInfo {
  key: string;
  ctrl: boolean; // Ctrl or Cmd
  shift: boolean;
  alt: boolean;
}

/** Keyboard map of the score editor (the score pane must have focus). */
export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "1 2 3 4 5", label: "Duración: semicorchea · corchea · negra · blanca · redonda" },
  { keys: ".", label: "Puntillo (×1,5)" },
  { keys: "↑ ↓  /  Shift+↑ ↓", label: "Subir / bajar un semitono / una octava" },
  { keys: "← →  /  Shift+← →", label: "Mover una semicorchea / un tiempo" },
  { keys: "+  -", label: "Alargar / acortar una semicorchea" },
  { keys: "J", label: "Unir con la siguiente nota del mismo sonido" },
  { keys: "S  T", label: "Staccato · tenuto (alterna)" },
  { keys: "P  M  F  0", label: "Dinámica p · mf · f · quitar" },
  { keys: "Supr / Retroceso", label: "Borrar (queda silencio)" },
  { keys: "R", label: "Cambiar entre modo Nota y modo Silencio" },
  { keys: "Intro", label: "Escribir en el cursor (silencio en modo Silencio, o la última nota)" },
  { keys: "Tab / Shift+Tab", label: "Nota siguiente / anterior" },
  { keys: "Ctrl+A  Esc", label: "Seleccionar todo · deseleccionar" },
  { keys: "Ctrl+D", label: "Duplicar la selección a continuación" },
  { keys: "Ctrl+Z  Ctrl+Y", label: "Deshacer · rehacer" },
  { keys: "Espacio", label: "Reproducir / detener" },
  { keys: "Clic", label: "Secuencial: escribe en el cursor · Libre: pone la nota donde haces clic" },
  { keys: "Alt+clic", label: "Secuencial: mueve el cursor · Libre: pone la nota en otra voz" },
  { keys: "Arrastrar en vacío", label: "Dibujar una nota con la duración que arrastres" },
  { keys: "Arrastrar una nota", label: "Moverla (tiempo y altura)" },
  { keys: "Clic derecho", label: "Borrar la nota (o la ✕ de su menú)" },
  { keys: "Rueda sobre una nota", label: "Subir / bajar su altura (Shift = octava)" },
  { keys: "Shift+clic", label: "Añadir a la selección" },
];

export function keyToAction(k: KeyInfo): EditAction | null {
  const key = k.key.toLowerCase();
  if (k.ctrl) {
    if (key === "z") return { type: k.shift ? "redo" : "undo" };
    if (key === "y") return { type: "redo" };
    if (key === "a") return { type: "selectAll" };
    if (key === "d") return { type: "duplicate" };
    return null;
  }
  const dur: Record<string, number> = { "1": 1, "2": 2, "3": 4, "4": 8, "5": 16 };
  if (key in dur) return { type: "duration", base: dur[key] };
  switch (key) {
    case ".": return { type: "dot" };
    case "arrowup": return { type: "transpose", semitones: k.shift ? 12 : 1 };
    case "arrowdown": return { type: "transpose", semitones: k.shift ? -12 : -1 };
    case "arrowright": return { type: "move", slots: k.shift ? 4 : 1 };
    case "arrowleft": return { type: "move", slots: k.shift ? -4 : -1 };
    case "+": case "=": return { type: "extend", slots: 1 };
    case "-": return { type: "extend", slots: -1 };
    case "j": return { type: "join" };
    case "s": return { type: "articulation", art: "staccato" };
    case "t": return { type: "articulation", art: "tenuto" };
    case "p": return { type: "dynamic", dyn: "p" };
    case "m": return { type: "dynamic", dyn: "mf" };
    case "f": return { type: "dynamic", dyn: "f" };
    case "0": return { type: "dynamic", dyn: null };
    case "delete": case "backspace": return { type: "delete" };
    case "r": return { type: "toggleRest" };
    case "enter": return { type: "enter" };
    case "tab": return { type: "navigate", dir: k.shift ? -1 : 1 };
    case "escape": return { type: "clear" };
    case " ": return { type: "togglePlay" };
    default: return null;
  }
}
