"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useScore } from "@/store/useScore";

/** Preferences. They live in this browser's localStorage: no account, no server. */
export default function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useScore((s) => s.settings);
  const setSettings = useScore((s) => s.setSettings);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark sm:max-w-lg" aria-label="Ajustes" data-testid="settings">
        <DialogHeader>
          <DialogTitle className="text-base">Ajustes</DialogTitle>
          <DialogDescription>Se guardan en este navegador (localStorage). No hace falta cuenta.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="preserve-code" className="text-sm font-medium">
              Conservar mi código
            </Label>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Si escribiste el código a mano, cambiar la <b>tonalidad</b>, añadir o quitar <b>compases</b> y <b>transponer</b> solo tocan las directivas
              (<code className="text-primary">{"// @tonalidad"}</code>, <code className="text-primary">{"// @compases"}</code>) o añaden un <code className="text-primary">.transpose(n)</code> al final, sin reescribir tu patrón.
              Si el patrón no admite el cambio, se regenera como antes.
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Editar notas sueltas en la partitura (poner, mover, borrar…) sigue generando el código en su forma canónica; <b>Ctrl+Z</b> recupera el tuyo.
              El código generado desde la partitura siempre se regenera.
            </p>
          </div>
          <Switch id="preserve-code" checked={settings.preserveCode} onCheckedChange={(v) => setSettings({ preserveCode: v })} aria-label="Conservar mi código" data-testid="preserve-switch" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
