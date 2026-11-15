/**
 * VexFlow 5 draws clefs, noteheads, rests, accidentals and numbers as TEXT in the Bravura / Academico web fonts. A PDF
 * cannot reuse a web font, so before exporting every such <text> is replaced by the vector outlines of its glyphs
 * (read from the very same font data VexFlow embeds). Text in a generic family (the dynamics, drawn in serif italic) uses Academico, the font of the measure numbers.
 */
interface Glyphish {
  path: { toSVG(): string };
}
interface FontLike {
  layout(s: string): { glyphs: Glyphish[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
  unitsPerEm: number;
}

let fonts: Promise<{ bravura: FontLike; academico: FontLike; academicoBold: FontLike }> | null = null;

async function loadFonts() {
  fonts ??= (async () => {
    const fk = (await import("fontkit")) as unknown as { create(b: Uint8Array): FontLike };
    const toFont = async (url: string) => fk.create(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    const [bravura, academico, academicoBold] = await Promise.all([
      toFont("/fonts/bravura.woff2"),
      toFont("/fonts/academico.woff2"),
      toFont("/fonts/academico-bold.woff2"),
    ]);
    return { bravura, academico, academicoBold };
  })();
  return fonts;
}

const isPrivateUse = (s: string) => [...s].some((c) => { const n = c.codePointAt(0)!; return n >= 0xe000 && n <= 0xf8ff; });

function sizeOf(el: Element): number {
  const raw = el.getAttribute("font-size") ?? "10px";
  const n = parseFloat(raw);
  return /pt\s*$/.test(raw) ? (n * 4) / 3 : n;
}

/** Replace the font-dependent <text> elements of `svg` by <path>s (in place). Returns how many were converted. */
export async function textToPaths(svg: SVGElement): Promise<number> {
  const f = await loadFonts();
  const NS = "http://www.w3.org/2000/svg";
  let done = 0;
  for (const el of Array.from(svg.querySelectorAll("text"))) {
    const str = el.textContent ?? "";
    if (!str) {
      el.remove();
      continue;
    }
    const family = (el.getAttribute("font-family") ?? "").toLowerCase();
    const bold = (el.getAttribute("font-weight") ?? "") === "bold" || family.includes("bold");
    const font = isPrivateUse(str) ? f.bravura : bold ? f.academicoBold : f.academico;
    const k = sizeOf(el) / font.unitsPerEm;
    const run = font.layout(str);
    let pen = 0;
    // one <path> per glyph keeps every outline exact (SVG path data has no per-glyph offset)
    const g = document.createElementNS(NS, "g");
    const italic = (el.getAttribute("font-style") ?? "") === "italic";
    g.setAttribute(
      "transform",
      `translate(${el.getAttribute("x") ?? 0} ${el.getAttribute("y") ?? 0}) scale(${k} ${-k})${italic ? " matrix(1 0 0.2 1 0 0)" : ""}`,
    );
    for (const attr of ["fill", "stroke", "opacity"]) if (el.hasAttribute(attr)) g.setAttribute(attr, el.getAttribute(attr)!);
    pen = 0;
    run.glyphs.forEach((gl, i) => {
      const p = gl.path.toSVG();
      if (p) {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", p);
        path.setAttribute("transform", `translate(${pen + run.positions[i].xOffset} ${run.positions[i].yOffset})`);
        g.appendChild(path);
      }
      pen += run.positions[i].xAdvance;
    });
    el.replaceWith(g);
    done++;
  }
  return done;
}
