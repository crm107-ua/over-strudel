"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import EditToolbar from "@/components/EditToolbar";
import ErrorBanner from "@/components/ErrorBanner";
import GuideModal from "@/components/GuideModal";
import ScoreInfo from "@/components/ScoreInfo";
import ScoreView from "@/components/ScoreView";
import StatusBar from "@/components/StatusBar";
import Toolbar from "@/components/Toolbar";
import { useScore } from "@/store/useScore";

export default function Home() {
  const [split, setSplit] = useState(42); // % width of the editor pane
  const wrap = useRef<HTMLDivElement>(null);
  const [guide, setGuide] = useState(false);
  const theme = useScore((s) => s.scoreTheme);

  // restore the saved score theme after mount (avoids a hydration mismatch)
  useEffect(() => {
    try {
      const t = localStorage.getItem("os-score-theme");
      if (t === "dark" || t === "light") useScore.setState({ scoreTheme: t });
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const r = wrap.current!.getBoundingClientRect();
      setSplit(Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  return (
    <main className="flex h-screen flex-col bg-[#0b0d12] text-foreground">
      <Toolbar onOpenGuide={() => setGuide(true)} />
      <GuideModal open={guide} onOpenChange={setGuide} />
      <div ref={wrap} className="flex min-h-0 flex-1">
        <section className="dark flex min-w-0 flex-col" style={{ width: `${split}%` }}>
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-[#0f1117] px-4 text-[11px] uppercase tracking-wider text-muted-foreground">
            Código · Strudel
          </div>
          <ErrorBanner />
          <div className="min-h-0 flex-1">
            <Editor />
          </div>
        </section>
        <div
          onPointerDown={onDrag}
          className="w-1 shrink-0 cursor-col-resize bg-white/10 transition-colors hover:bg-primary"
          role="separator"
          aria-orientation="vertical"
        />
        <section className={`score-${theme} ${theme === "dark" ? "dark" : ""} flex min-w-0 flex-1 flex-col bg-[color:var(--sc-bg)] text-[color:var(--sc-text)]`}>
          <div className="flex min-h-9 shrink-0 items-center gap-3 border-b border-[color:var(--sc-line)] bg-[color:var(--sc-bar)] px-4 py-1.5 text-[11px] uppercase tracking-wider">
            <span>Partitura</span>
            <ScoreInfo />
          </div>
          <EditToolbar onHelp={() => setGuide(true)} />
          <div className="min-h-0 flex-1">
            <ScoreView />
          </div>
        </section>
      </div>
      <StatusBar />
    </main>
  );
}
