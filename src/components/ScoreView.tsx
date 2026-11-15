"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { entryTarget } from "@/lib/edit/doc";
import { keyToAction } from "@/lib/edit/shortcuts";
import { locate, pixelOf, xOfSlot } from "@/lib/edit/hit";
import { durInfo, durLabel, nameES } from "@/lib/edit/noteInfo";
import { subscribePlayhead } from "@/lib/playhead";
import { effDur, resolvePitch, useScore } from "@/store/useScore";
import NotePopover from "./NotePopover";
import ScorePager from "./ScorePager";

import { CLEF_W, KEY_W, MARGIN, MEASURE_MIN, SLOTS, STAFF_GAP, SYSTEM_GAP, PAGE_PAD, FOOTER, drawScore, type Layout } from "@/lib/drawScore";

/** How the score is split into sheets for the available space. */
function pageGeometry(width: number, height: number, grand: boolean, fifths: number) {
  const clefW = CLEF_W + Math.abs(fifths) * KEY_W;
  const perLine = Math.max(1, Math.floor((width - 2 * MARGIN - clefW) / MEASURE_MIN));
  const sysH = (grand ? STAFF_GAP + 110 : 130) + SYSTEM_GAP;
  const linesPerPage = Math.max(1, Math.floor((height - 2 * PAGE_PAD - FOOTER) / sysH));
  return { clefW, perLine, sysH, linesPerPage, perPage: perLine * linesPerPage };
}

/** Where the input line goes for an absolute sixteenth (null when that measure is not on the shown sheet). */
function caretFor(layout: Layout | null, enabled: boolean, slot: number | null) {
  const m = layout && enabled && slot !== null ? layout.measures[Math.floor(slot / SLOTS)] : undefined;
  if (!layout || !m || slot === null) return null;
  const sys = layout.systems[m.sys];
  return { x: xOfSlot(m.pts, slot - Math.floor(slot / SLOTS) * SLOTS), y: sys.top, h: sys.h };
}
type Caret = { x: number; y: number; h: number };
const sameCaret = (a: Caret | null, b: Caret | null) => (a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.h === b.h) ? a : b);

/** What the pointer is about to do, drawn as a subtle preview at the cursor. */
interface Ghost {
  /** notehead centre (px, relative to the sheet) */
  x: number;
  y: number;
  midi: number;
  dur: number;
  mode: "add" | "draw" | "note" | "move" | "rest" | "full";
  noteId?: number;
  /** overrides the default hint line of the card */
  hint?: string;
}

/** A note that was just placed: it is shown where you clicked and then glides to its structured position. */
interface Settle {
  from: { x: number; y: number };
  to: { x: number; y: number } | null;
  g: Ghost;
}

const HINT: Record<Ghost["mode"], string> = {
  add: "clic para poner · arrastra para alargar",
  draw: "suelta para crear la nota",
  note: "clic selecciona · rueda cambia la altura",
  move: "suelta para mover",
  rest: "silencio · se escribe en el cursor",
  full: "no queda nada por subdividir · Alt+clic elige desde dónde escribir",
};

/** The rest about to be written: a simple rest symbol of the chosen length (whole, half, quarter, eighth, sixteenth). */
function GhostRest({ g }: { g: Ghost }) {
  const { base } = durInfo(g.dur);
  const col = "#6366f1";
  return (
    <svg
      width={40}
      height={60}
      viewBox="-20 -30 40 60"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: g.x - 20, top: g.y - 30, opacity: 0.88 }}
      data-testid="ghost-rest"
      aria-hidden
    >
      {base === 16 && <rect x={-7} y={-9} width={14} height={5} fill={col} />}
      {base === 8 && <rect x={-7} y={-4} width={14} height={5} fill={col} />}
      {base === 4 && <path d="M-3 -12 L4 -5 L-3 1 L3 8 C-2 6 -5 9 -2 13" fill="none" stroke={col} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />}
      {base === 2 && (
        <g fill="none" stroke={col} strokeWidth={2} strokeLinecap="round">
          <circle cx={-3} cy={-6} r={2.2} fill={col} />
          <path d="M-1 -4 C 2 -4, 4 -6, 5 -8 L-2 10" />
        </g>
      )}
      {base === 1 && (
        <g fill="none" stroke={col} strokeWidth={2} strokeLinecap="round">
          <circle cx={-3} cy={-9} r={2.1} fill={col} />
          <circle cx={-5} cy={-2} r={2.1} fill={col} />
          <path d="M-1 -7 C 2 -7, 4 -9, 5 -11 L-4 12" />
        </g>
      )}
    </svg>
  );
}

/** The note about to be placed, as a real upright note: notehead, stem (up or down by pitch), flags and dot. */
function GhostNote({ g, grand }: { g: Ghost; grand: boolean }) {
  const { base, dot } = durInfo(g.dur);
  const hollow = base >= 8;
  const hasStem = base < 16;
  const mid = grand && g.midi < 60 ? 50 : 71; // middle line of the staff it lives on
  const up = g.midi < mid; // stems go up for notes below the middle line
  const col = g.mode === "move" ? "#f97316" : "#6366f1";
  const cx = 24;
  const cy = 50;
  const sx = up ? cx + 6.2 : cx - 6.2;
  const end = up ? cy - 34 : cy + 34;
  const flags = base === 2 ? 1 : base === 1 ? 2 : 0;
  const dir = up ? 1 : -1;
  return (
    <svg
      width={48}
      height={100}
      viewBox="0 0 48 100"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: g.x - cx, top: g.y - cy, opacity: 0.88 }}
      data-testid="ghost-note"
      aria-hidden
    >
      <ellipse cx={cx} cy={cy} rx={6.8} ry={4.8} transform={`rotate(-22 ${cx} ${cy})`} fill={hollow ? "none" : col} stroke={col} strokeWidth={hollow ? 1.8 : 1.2} />
      {hasStem && <line x1={sx} y1={cy + (up ? -1 : 1)} x2={sx} y2={end} stroke={col} strokeWidth={1.6} strokeLinecap="round" />}
      {Array.from({ length: flags }).map((_, i) => {
        const y0 = end + (up ? 1 : -1) * i * 7;
        return (
          <path
            key={i}
            d={`M${sx} ${y0} c ${dir * 1} ${dir * 7}, ${dir * 10} ${dir * 9}, ${dir * 8} ${dir * 20}`}
            fill="none"
            stroke={col}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        );
      })}
      {dot && <circle cx={cx + 13} cy={cy - 2} r={1.9} fill={col} />}
    </svg>
  );
}

/** Glides the just-placed note from where it was dropped to its structured position. */
function SettleNote({ s, grand }: { s: Settle; grand: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !s.to) return;
    const id = requestAnimationFrame(() => {
      el.style.transform = `translate(${s.to!.x}px, ${s.to!.y}px)`;
    });
    return () => cancelAnimationFrame(id);
  }, [s]);
  return (
    <div
      ref={ref}
      data-testid="settle-note"
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{ transform: `translate(${s.from.x}px, ${s.from.y}px)`, transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
    >
      <GhostNote g={s.g} grand={grand} />
    </div>
  );
}

export default function ScoreView() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const perPageRef = useRef(1);
  const drag = useRef<{ originAbs: number; originMidi: number; moved: boolean } | null>(null);
  const drawing = useRef<{ startAbs: number; midi: number; moved: boolean; len: number; alt: boolean; x0: number; y0: number } | null>(null);
  const hoveredEls = useRef<Element[]>([]);
  const ghostRef = useRef<Ghost | null>(null);
  const settleRef = useRef<{ abs: number; midi: number; dur: number; from: { x: number; y: number } } | null>(null);
  const score = useScore((s) => s.score);
  const editMode = useScore((s) => s.editMode);
  const theme = useScore((s) => s.scoreTheme);
  const selection = useScore((s) => s.selection);
  const entryMode = useScore((s) => s.entryMode);
  const page = useScore((s) => s.page);
  const act = useScore((s) => s.act);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [settle, setSettle] = useState<Settle | null>(null);
  const [caret, setCaret] = useState<Caret | null>(null);

  useEffect(() => {
    ghostRef.current = ghost;
  }, [ghost]);

  // The sheet fills the whole panel: sheet size = panel size; the number of measures per sheet follows from it.
  const total = score.measures.length;
  const geo = useMemo(() => pageGeometry(size.w, size.h, score.grand, score.fifths), [size.w, size.h, score.grand, score.fifths]);
  const pageCount = Math.max(1, Math.ceil(total / geo.perPage));
  const cur = Math.max(0, Math.min(page, pageCount - 1));
  const from = cur * geo.perPage;
  const to = Math.min(total, from + geo.perPage);

  useEffect(() => {
    perPageRef.current = geo.perPage;
  }, [geo.perPage]);

  useEffect(() => {
    const st = useScore.getState();
    if (st.pageCount !== pageCount || st.perPage !== geo.perPage) useScore.setState({ pageCount, perPage: geo.perPage });
    if (st.page > pageCount - 1) useScore.setState({ page: pageCount - 1 });
    if (st.page < 0) useScore.setState({ page: 0 });
  }, [pageCount, page, geo.perPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applySelection = () => {
    const sel = new Set(useScore.getState().selection);
    layoutRef.current?.measures.forEach((m) =>
      m?.els.forEach((n) => n.el.classList.toggle("vf-note-selected", n.ids.some((id) => sel.has(id)))),
    );
  };

  /** Where the floating note menu sits: next to the first selected note (if it is on this sheet). */
  const updateAnchor = () => {
    const st = useScore.getState();
    const layout = layoutRef.current;
    const first = st.doc.events
      .filter((e) => st.selection.includes(e.id))
      .sort((a, b) => a.start - b.start || a.midi - b.midi)[0];
    const p = layout && st.editMode && first ? pixelOf(layout, first.start, first.midi, st.score.grand) : null;
    setAnchor((a) => (p ? (a && a.x === p.x && a.y === p.y ? a : { x: p.x, y: p.y }) : null));
  };

  /** The input line of sequential entry: where the next note or rest will be written. */
  const showCaretAt = (slot: number | null) => {
    const st = useScore.getState();
    const next = caretFor(layoutRef.current, st.editMode && st.entryMode === "sequence", slot);
    setCaret((c) => sameCaret(c, next));
  };
  /** At rest the line sits at the cursor; while hovering it shows the real destination under the pointer. */
  const updateCaret = () => {
    const st = useScore.getState();
    const next = caretFor(layoutRef.current, st.editMode && st.entryMode === "sequence", st.cursor);
    setCaret((c) => sameCaret(c, next));
  };

  /** After a placement: hide the real note, glide a copy from the click point to its final spot, then reveal it. */
  const startSettle = (layout: Layout) => {
    const s = settleRef.current;
    if (!s) return;
    settleRef.current = null;
    const st = useScore.getState();
    const to = pixelOf(layout, s.abs, s.midi, st.score.grand);
    if (!to || (Math.abs(to.x - s.from.x) < 3 && Math.abs(to.y - s.from.y) < 3)) return;
    const ids = new Set([...st.selection, ...st.lastEntered]); // the note just written is hidden while its copy glides
    const hidden: SVGElement[] = [];
    layout.measures.forEach((m) =>
      m?.els.forEach((n) => {
        if (!n.ids.some((id) => ids.has(id))) return;
        const el = n.el as SVGElement;
        el.style.opacity = "0";
        hidden.push(el);
      }),
    );
    setSettle({ from: s.from, to, g: { x: 0, y: 0, midi: s.midi, dur: s.dur, mode: "add" } });
    window.setTimeout(() => {
      hidden.forEach((el) => (el.style.opacity = ""));
      setSettle(null);
    }, 320);
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el || size.w < 200) return;
    let cancelled = false;
    drawScore(el, score, size.w, theme === "dark" ? "#e5e7eb" : "#171717", from, to, geo.perLine, geo.clefW)
      .then((l) => {
        if (cancelled) return;
        layoutRef.current = l;
        (window as unknown as { __osLayout?: Layout }).__osLayout = l; // read-only hook for e2e tests
        applySelection();
        updateAnchor();
        updateCaret();
        startSettle(l);
      })
      .catch((e) => {
        if (!cancelled) console.error("VexFlow render failed", e, { from, to, total: score.measures.length, perLine: geo.perLine });
      });
    return () => {
      cancelled = true;
    };
  }, [score, size.w, theme, from, to, geo.perLine, geo.clefW]);

  // selection highlight + menu follow the store
  useEffect(
    () =>
      useScore.subscribe((s, prev) => {
        if (s.cursor !== prev.cursor || s.entryMode !== prev.entryMode || s.editMode !== prev.editMode) {
          updateCaret();
        }
        if (s.selection === prev.selection && s.editMode === prev.editMode) return;
        applySelection();
        updateAnchor();
      }),
    [],
  );

  // highlight the note under the pointer
  useEffect(() => {
    hoveredEls.current.forEach((e) => e.classList.remove("vf-note-hover"));
    hoveredEls.current = [];
    const id = ghost?.mode === "note" ? ghost.noteId : undefined;
    if (id === undefined) return;
    layoutRef.current?.measures.forEach((m) =>
      m?.els.forEach((n) => {
        if (n.ids.includes(id)) {
          n.el.classList.add("vf-note-hover");
          hoveredEls.current.push(n.el);
        }
      }),
    );
  }, [ghost?.mode, ghost?.noteId]);

  // Playback cursor + active-note highlight (driven by the shared rAF playhead, no React re-renders)
  useEffect(() => {
    let active: Element[] = [];
    const clearActive = () => {
      active.forEach((n) => n.classList.remove("vf-note-active"));
      active = [];
    };
    return subscribePlayhead((t) => {
      const cursor = cursorRef.current;
      const layout = layoutRef.current;
      const st = useScore.getState();
      const count = st.score.measures.length;
      if (!cursor) return;
      if (t === null || !layout || !count) {
        cursor.style.opacity = "0";
        clearActive();
        return;
      }
      // the scheduler can report a tiny negative time right after starting: always wrap into [0, count)
      const p = ((t % count) + count) % count;
      const mi = Math.max(0, Math.min(count - 1, Math.floor(p)));
      const m = layout.measures[mi];
      if (!m) {
        // the playing measure is on another sheet: turn the page and wait for it to be drawn
        cursor.style.opacity = "0";
        clearActive();
        const target = Math.floor(mi / perPageRef.current);
        if (st.page !== target) useScore.setState({ page: target });
        return;
      }
      if (m.pts.length < 2) return;
      const slot = (p - mi) * SLOTS;
      const sys = layout.systems[m.sys];
      cursor.style.opacity = "1";
      cursor.style.height = `${sys.h}px`;
      cursor.style.transform = `translate3d(${xOfSlot(m.pts, slot)}px, ${sys.top}px, 0)`;

      const now = m.els.filter((n) => slot >= n.s && slot < n.e).map((n) => n.el);
      if (now.length !== active.length || now.some((n, i) => n !== active[i])) {
        clearActive();
        now.forEach((n) => n.classList.add("vf-note-active"));
        active = now;
      }
    });
  }, []);

  // ── pointer geometry ──────────────────────────────────────────────────────
  const rectXY = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The note closest to the pointer, with a forgiving radius (you do not need pixel precision). */
  const noteNear = (x: number, y: number) => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const st = useScore.getState();
    // sequential entry writes wherever you click, so selecting needs the very line/space of the notehead
    const maxDy = st.entryMode === "sequence" ? 4 : 10;
    let best: (typeof st.doc.events)[number] | null = null;
    let bd = Infinity;
    for (const e of st.doc.events) {
      const p = pixelOf(layout, e.start, e.midi, st.score.grand);
      if (!p) continue; // not on this sheet
      const dx = Math.abs(p.x - x);
      const dy = Math.abs(p.y - y);
      if (dx <= 12 && dy <= maxDy && dx + dy * 1.5 < bd) {
        bd = dx + dy * 1.5;
        best = e;
      }
    }
    return best;
  };

  /**
   * The note under the pointer. By default only near its notehead (so you can still click right above a note's
   * stem to build a chord). With `broad` any part of the drawn note counts (stem, flag, accidental): used to delete.
   */
  const noteAtEvent = (e: { clientX: number; clientY: number }, broad = false) => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const { x, y } = rectXY(e);
    const near = noteNear(x, y);
    if (near || !broad) return near;
    const group = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".vf-stavenote");
    if (!group) return null;
    const st = useScore.getState();
    for (const m of layout.measures) {
      const hit = m?.els.find((n) => n.el === group);
      if (!hit) continue;
      const cands = st.doc.events.filter((ev) => hit.ids.includes(ev.id));
      let best = cands[0] ?? null;
      let bd = Infinity;
      for (const c of cands) {
        const p = pixelOf(layout, c.start, c.midi, st.score.grand);
        if (p && Math.abs(p.y - y) < bd) {
          bd = Math.abs(p.y - y);
          best = c;
        }
      }
      return best;
    }
    return null;
  };

  const locateEvent = (e: { clientX: number; clientY: number }) => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const { x, y } = rectXY(e);
    const loc = locate(layout, x, y);
    return loc && { loc, abs: loc.measure * SLOTS + loc.slot, x, y };
  };

  const makeGhost = (abs: number, midi: number, dur: number, mode: Ghost["mode"], noteId?: number, rawX?: number): Ghost | null => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const px = pixelOf(layout, abs, midi, useScore.getState().score.grand);
    return px && { x: rawX ?? px.x, y: px.y, midi, dur, mode, noteId };
  };
  const same = (a: Ghost | null, b: Ghost) =>
    !!a && a.x === b.x && a.y === b.y && a.midi === b.midi && a.dur === b.dur && a.mode === b.mode && a.noteId === b.noteId;

  // Mouse wheel over a note changes its pitch (Shift = octave). Elsewhere the wheel scrolls as usual.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let until = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const st = useScore.getState();
      if (!st.editMode || !layoutRef.current) return;
      const now = performance.now();
      if (now > until) {
        const r = el.getBoundingClientRect();
        const near = noteNear(e.clientX - r.left, e.clientY - r.top);
        if (!near) return;
        st.select([near.id]);
      }
      e.preventDefault();
      until = now + 700; // keep acting on this note while the wheel keeps turning
      if (now - last < 70) return; // trackpad inertia: one semitone per tick
      last = now;
      st.wheelPitch((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 12 : 1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── pointer editing ────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    wrapRef.current?.focus();
    if (!editMode || e.button !== 0) return;
    const st = useScore.getState();
    const hit = locateEvent(e);
    const note = noteAtEvent(e);
    if (note) {
      st.select([note.id], e.shiftKey);
      if (hit) drag.current = { originAbs: hit.abs, originMidi: hit.loc.midi, moved: false };
      wrapRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (!hit) return st.select([]);
    if (st.entryMode === "sequence") {
      // Alt+click moves the cursor. A plain click may be ANYWHERE in the measure: the note is shown where you clicked
      // and then glides to its structured place (the first free point, or the subdivision of a full measure).
      if (e.altKey) {
        st.setCursor(hit.abs);
        return;
      }
      const t = entryTarget(st.doc, st.cursor, hit.loc.measure, hit.loc.staff, st.score.grand, effDur(st.tool), st.reach, st.cursorPinned);
      if (t && st.noteKind === "note") {
        settleRef.current = {
          abs: t.start,
          midi: resolvePitch(hit.loc.midi, st.tool, st.score.fifths),
          dur: t.dur,
          from: { x: hit.x, y: ghostRef.current?.y ?? hit.y },
        };
      }
      st.select([]);
      st.enterAt(hit.loc.midi, hit.loc.measure, hit.loc.staff);
      setGhost(null);
      return;
    }
    if (st.noteKind === "rest") {
      st.restAt(hit.abs, hit.loc.staff);
      setGhost(null);
      return;
    }
    drawing.current = { startAbs: hit.abs, midi: hit.loc.midi, moved: false, len: effDur(st.tool), alt: e.altKey, x0: hit.x, y0: ghostRef.current?.y ?? hit.y };
    wrapRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!editMode || !layoutRef.current) return;
    const hit = locateEvent(e);
    const st = useScore.getState();
    if (!hit) {
      if (!drag.current && !drawing.current) setGhost(null);
      return;
    }
    const { loc, abs } = hit;
    const pitch = (natural: number) => resolvePitch(natural, st.tool, st.score.fifths);
    let g: Ghost | null;
    const d = drag.current;
    const w = drawing.current;
    if (d) {
      if (abs !== d.originAbs || loc.midi !== d.originMidi) d.moved = true;
      g = makeGhost(abs, loc.midi, 1, "move");
    } else if (w) {
      if (abs > w.startAbs) {
        w.moved = true;
        w.len = abs - w.startAbs + 1;
      } else if (w.moved) w.len = 1;
      g = makeGhost(w.startAbs, pitch(w.midi), w.len, "draw", undefined, w.x0);
    } else {
      const note = noteAtEvent(e);
      if (note) {
        g = makeGhost(note.start, note.midi, note.dur, "note", note.id);
      } else if (st.entryMode === "sequence") {
        // the note follows the pointer: click ANYWHERE in the measure; on click it settles into its structured place
        const t = entryTarget(st.doc, st.cursor, loc.measure, loc.staff, st.score.grand, effDur(st.tool), st.reach, st.cursorPinned);
        showCaretAt(null);
        if (!t) {
          // nothing left to subdivide in the measure under the pointer
          setGhost((prev) => (prev && prev.mode === "full" && prev.x === hit.x && prev.y === hit.y ? prev : { x: hit.x, y: hit.y, midi: loc.midi, dur: effDur(st.tool), mode: "full" }));
          return;
        }
        const rest = st.noteKind === "rest";
        const row = rest ? (loc.staff === "bass" ? 50 : 71) : pitch(loc.midi); // rests sit on the middle line
        g = makeGhost(abs, row, t.dur, rest ? "rest" : "add", undefined, hit.x);
        if (g) {
          const hint = t.split
            ? `subdivide la última nota: ${durLabel(t.split.keepDur)} + ${durLabel(t.dur)}`
            : t.dur < effDur(st.tool)
              ? `solo cabe ${durLabel(t.dur)} aquí`
              : rest
                ? "silencio · se coloca solo al hacer clic"
                : "se coloca solo en su sitio al hacer clic";
          g = { ...g, hint };
        }
      } else if (st.noteKind === "rest") {
        g = makeGhost(abs, loc.staff === "bass" ? 50 : 71, effDur(st.tool), "rest", undefined, hit.x);
      } else {
        g = makeGhost(abs, pitch(loc.midi), effDur(st.tool), "add", undefined, hit.x);
      }
    }
    if (g) setGhost((prev) => (same(prev, g!) ? prev : g));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const w = drawing.current;
    drag.current = null;
    drawing.current = null;
    if (w) {
      setGhost(null);
      const st = useScore.getState();
      // remember where the note was dropped: it is shown there first and then settles into its structured place
      settleRef.current = { abs: w.startAbs, midi: resolvePitch(w.midi, st.tool, st.score.fifths), dur: w.moved ? w.len : effDur(st.tool), from: { x: w.x0, y: w.y0 } };
      st.addNoteAt(w.startAbs, w.midi, w.alt, w.moved ? w.len : undefined);
      return;
    }
    if (!d || !d.moved) return;
    const hit = locateEvent(e);
    if (hit) useScore.getState().moveSelection(hit.abs - d.originAbs, hit.loc.midi - d.originMidi);
  };

  /** Right click on a note removes it; the measure refills with rests at once. */
  const onContextMenu = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    const note = noteAtEvent(e, true);
    if (!note) return;
    const st = useScore.getState();
    st.select([note.id]);
    st.act({ type: "delete" });
    setGhost(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const st = useScore.getState();
    const nav: Record<string, () => void> = {
      PageDown: () => st.setPage(st.page + 1),
      PageUp: () => st.setPage(st.page - 1),
      Home: () => st.setPage(0),
      End: () => st.setPage(st.pageCount - 1),
    };
    if (nav[e.key]) {
      e.preventDefault();
      nav[e.key]();
      return;
    }
    const a = keyToAction({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
    if (!a) return;
    if (!st.editMode && a.type !== "togglePlay") return;
    e.preventDefault();
    st.act(a);
  };

  // the card never covers a note: hidden over the selected note (its menu already says everything)
  const showGhost = editMode && ghost && !(ghost.mode === "note" && ghost.noteId !== undefined && selection.includes(ghost.noteId));
  const cardRight = ghost ? ghost.x + 240 > size.w : false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[color:var(--sc-bg)] p-4">
        <div
          ref={wrapRef}
          data-testid="score-pane"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenu}
          onPointerLeave={() => {
            if (!drag.current && !drawing.current) setGhost(null);
            updateCaret();
          }}
          onKeyDown={onKeyDown}
          style={{ minHeight: Math.max(260, size.h) }}
          className={`relative flex w-full touch-none flex-col select-none rounded-md bg-[color:var(--sc-paper)] [box-shadow:var(--sc-shadow)] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
            editMode ? (ghost?.mode === "note" ? "cursor-pointer" : "cursor-crosshair") : ""
          }`}
        >
          <div ref={svgRef} />

          {showGhost && ghost && (
            <div className="pointer-events-none absolute inset-0 z-10" data-testid="cursor-layer">
              {ghost.mode === "rest" ? <GhostRest g={ghost} /> : ghost.mode !== "note" && ghost.mode !== "full" && <GhostNote g={ghost} grand={score.grand} />}
              {/* the note card, anchored to the cursor */}
              <div
                data-testid="cursor-preview"
                className="absolute w-max rounded-lg border border-white/10 bg-neutral-900/90 px-2.5 py-1.5 text-white shadow-lg backdrop-blur-sm"
                style={{ left: ghost.x + (cardRight ? -20 : 20), top: ghost.y + 14, transform: cardRight ? "translateX(-100%)" : undefined }}
              >
                <div className="flex items-center gap-2">
                  <span data-testid="cursor-name" className="text-[13px] font-semibold tracking-tight">
                    {ghost.mode === "full" ? "Compás lleno" : ghost.mode === "rest" ? "Silencio" : nameES(ghost.midi)}
                  </span>
                  {ghost.mode !== "full" && (
                    <span data-testid="cursor-dur" className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                      {durLabel(ghost.dur)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-white/50">{ghost.hint ?? HINT[ghost.mode]}</div>
              </div>
            </div>
          )}

          {caret && entryMode === "sequence" && (
            <div
              data-testid="input-caret"
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-[5] w-0 transition-transform duration-150 ease-out"
              style={{ transform: `translate(${caret.x}px, ${caret.y}px)`, height: caret.h }}
            >
              <div className="absolute -left-px top-0 h-full w-0.5 rounded bg-primary/70 shadow-[0_0_8px_1px_rgba(99,102,241,0.45)]" />
              <div className="absolute -left-[4px] -top-[4px] h-2 w-2 rotate-45 rounded-[1px] bg-primary/80" />
            </div>
          )}

          {settle && <SettleNote s={settle} grand={score.grand} />}

          {editMode && anchor && ghost?.mode !== "move" && <NotePopover anchor={anchor} width={size.w} onEnter={() => setGhost(null)} />}

          <div className="mt-auto flex flex-col items-center gap-2 px-5 pb-3 pt-2">
            {editMode && cur === pageCount - 1 && (
              <button
                type="button"
                data-testid="add-measure"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => act({ type: "addMeasure" })}
                className="flex h-9 w-full items-center justify-center rounded-md border border-dashed border-[color:var(--sc-line)] text-[12px] text-[color:var(--sc-text)] transition-colors hover:border-primary hover:text-primary"
              >
                ＋ Añadir compás
              </button>
            )}
            <span data-testid="sheet-label" className="text-[11px] tracking-wide text-[color:var(--sc-text)]">
              — Hoja {cur + 1} de {pageCount} —
            </span>
          </div>

          <div
            ref={cursorRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 w-0 opacity-0 transition-opacity duration-300"
            style={{ willChange: "transform" }}
          >
            <div className="absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-primary/20 to-transparent" />
            <div className="absolute -left-px top-0 h-full w-0.5 rounded bg-primary shadow-[0_0_10px_2px_rgba(99,102,241,0.55)]" />
            <div className="absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-primary" />
          </div>
        </div>
      </div>
      <ScorePager measuresPerPage={geo.perPage} />
    </div>
  );
}
