"use client";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScore } from "@/store/useScore";

export default function PlayButton() {
  const isPlaying = useScore((s) => s.isPlaying);
  const toggle = useScore((s) => s.togglePlay);
  return (
    <Button
      onClick={toggle}
      aria-label={isPlaying ? "Detener" : "Reproducir"}
      variant={isPlaying ? "destructive" : "default"}
      className="min-w-32 font-semibold"
    >
      {isPlaying ? <Square className="fill-current" /> : <Play className="fill-current" />}
      {isPlaying ? "Detener" : "Reproducir"}
    </Button>
  );
}
