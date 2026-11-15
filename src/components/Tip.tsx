"use client";
import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Tooltip around any control: `<Tip label="Deshacer · Ctrl+Z"><Button/></Tip>`. */
export function Tip({ label, children, side = "bottom" }: { label: string; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Style for the "on" state of toggles: the brand colour (shadcn only tints them muted by default). */
export const ON = "aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary/90";
