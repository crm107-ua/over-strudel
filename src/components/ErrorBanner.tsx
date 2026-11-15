"use client";
import { useScore } from "@/store/useScore";

export default function ErrorBanner() {
  const error = useScore((s) => s.error);
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-red-500/40 bg-red-950/80 px-4 py-2 text-xs text-red-200"
    >
      <span className="font-bold text-red-400">✕</span>
      <span>
        {error} <span className="text-red-300/60">· se mantiene la última partitura válida</span>
      </span>
    </div>
  );
}
