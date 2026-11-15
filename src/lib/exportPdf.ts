import { CLEF_W, KEY_W, MARGIN, STAFF_GAP, SYSTEM_GAP, drawScore } from "./drawScore";
import { getKey } from "./keys";
import { textToPaths } from "./svgTextToPaths";
import type { Score } from "./types";

/** A4 in PostScript points (1 pt = 1 SVG user unit). */
export const A4 = { w: 595.28, h: 841.89 };
const FOOTER_H = 50; // bottom margin (page number)
const TOP_PAD = MARGIN + 20; // where the first staff starts inside the drawing
const FIRST_PAGE_HEADER = 44; // title block height on the first page

export interface PdfOptions {
  title?: string | null;
  /** beats per minute shown under the title (cycles per minute × 4), null = default 120 */
  cpm?: number | null;
}

/** jsPDF's built-in fonts are Latin-1: drop the music accidentals. */
const latin = (t: string) => t.replace(/♭/g, "b").replace(/♯/g, "#");

/** Width one measure needs (relative units): grows with its busiest voice. */
export function measureNeed(score: Score, mi: number): number {
  const m = score.measures[mi];
  const most = Math.max(4, ...[...m.treble, ...(m.bass ?? [])].map((v) => v.length));
  // the first measure also carries the time signature
  return (most <= 4 ? 108 : 30 + 22 * most) + (mi === 0 ? 34 : 0);
}

/**
 * Layout of the printed score. Systems are filled greedily with consecutive measures while their natural widths fit
 * (at most 4 per system); each system is then justified to the full line with widths proportional to the measure
 * density. Pure, so it can be tested.
 */
export function pdfLayout(score: Score) {
  const clefW = CLEF_W + Math.abs(score.fifths) * KEY_W;
  const usable = A4.w - 2 * MARGIN - clefW;
  const total = score.measures.length;
  const weights = Array.from({ length: total }, (_, i) => measureNeed(score, i));
  const systems: number[][] = [];
  for (let i = 0; i < total; ) {
    const sys: number[] = [];
    let sum = 0;
    while (i < total && sys.length < 4 && (sys.length === 0 || sum + weights[i] <= usable)) {
      sum += weights[i];
      sys.push(i++);
    }
    systems.push(sys);
  }
  if (!systems.length) systems.push([]);
  const sysH = (score.grand ? STAFF_GAP + 110 : 130) + SYSTEM_GAP;
  const fit = (headerH: number) => Math.max(1, Math.floor((A4.h - FOOTER_H - headerH - TOP_PAD + SYSTEM_GAP) / sysH));
  const pages: { systems: number[][]; first: boolean }[] = [];
  for (let at = 0; at < systems.length || pages.length === 0; ) {
    const first = pages.length === 0;
    const n = fit(first ? FIRST_PAGE_HEADER : 0);
    pages.push({ systems: systems.slice(at, at + n), first });
    at += n;
  }
  return { clefW, usable, weights, sysH, systems, pages };
}

/** Render the whole score on classic A4 sheets and download it as a vector PDF. Returns the number of pages. */
export async function exportScorePdf(score: Score, opts: PdfOptions = {}): Promise<number> {
  const [{ jsPDF }, svg2pdfMod] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const svg2pdf = (svg2pdfMod as unknown as { svg2pdf: typeof import("svg2pdf.js").svg2pdf }).svg2pdf;
  const lay = pdfLayout(score);
  const title = latin(opts.title?.trim() || "Partitura");
  const key = getKey(score.keyId);
  const bpm = Math.round((opts.cpm ?? 30) * 4);
  const subtitle = latin(
    `${key.label}  ·  4/4  ·  negra = ${bpm}  ·  ${score.measures.length} compases`,
  );

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title, subject: "Partitura generada con Over Strudel", creator: "Over Strudel" });

  // the drawing needs to live in the DOM (VexFlow measures text) but nobody should see it
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:700px;pointer-events:none;visibility:hidden";
  document.body.appendChild(host);
  try {
    for (let p = 0; p < lay.pages.length; p++) {
      const pg = lay.pages[p];
      if (p > 0) doc.addPage("a4", "portrait");
      const yOff = pg.first ? FIRST_PAGE_HEADER : 0;
      const idxs = pg.systems.flat();
      await drawScore(host, score, A4.w, "#000000", idxs[0] ?? 0, (idxs[idxs.length - 1] ?? -1) + 1, 4, lay.clefW, {
        systems: pg.systems,
        weights: lay.weights,
        lastStretchCap: p === lay.pages.length - 1 ? 1.3 : undefined,
      });
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("No se pudo dibujar la hoja");
      svg.setAttribute("viewBox", `0 0 ${A4.w} ${svg.getAttribute("height")}`);
      await textToPaths(svg as SVGElement); // fonts cannot travel in the PDF: use the glyph outlines
      const h = Number(svg.getAttribute("height")) || A4.h;
      await svg2pdf(svg as SVGElement, doc, { x: 0, y: yOff, width: A4.w, height: h });

      if (pg.first) {
        doc.setTextColor(20);
        doc.setFont("helvetica", "bold").setFontSize(18).text(title, A4.w / 2, 48, { align: "center", maxWidth: A4.w - 2 * MARGIN });
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110).text(subtitle, A4.w / 2, 63, { align: "center" });
      }
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
      doc.text("Over Strudel", MARGIN, A4.h - 28);
      doc.text(`${p + 1} / ${lay.pages.length}`, A4.w - MARGIN, A4.h - 28, { align: "right" });
    }
  } finally {
    host.remove();
  }
  const name = (title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "partitura").toLowerCase();
  doc.save(`${name}.pdf`);
  return lay.pages.length;
}
