import { describe, expect, it } from "vitest";
import { appendTranspose, parseDirectives, setDirective } from "./directives";
import { evaluateToEvents } from "./strudelRuntime";

describe("setDirective keeps everything else untouched", () => {
  const mine = `// mi pieza\n// @compases 4\nnote("<c4 e4>").every(2, rev)\n`;
  it("replaces an existing directive in place", () => {
    expect(setDirective(mine, "compases", 5)).toBe(`// mi pieza\n// @compases 5\nnote("<c4 e4>").every(2, rev)\n`);
  });
  it("adds a missing one at the top", () => {
    expect(setDirective(mine, "tonalidad", "G")).toBe(`// @tonalidad G\n${mine}`);
  });
  it("removes one", () => {
    expect(setDirective(`// @tonalidad G\n${mine}`, "tonalidad", null)).toBe(mine);
    expect(setDirective(mine, "tonalidad", null)).toBe(mine);
  });
  it("parses back what it wrote", () => {
    const c = setDirective(setDirective(mine, "compases", 9), "tonalidad", "Bb");
    const d = parseDirectives(c);
    expect(d.measures).toBe(9);
    expect(d.key).toBe("Bb");
  });
});

describe("appendTranspose", () => {
  it("appends to the last statement and merges with an existing transpose", () => {
    expect(appendTranspose(`note("c4")\n`, 2)).toBe(`note("c4").transpose(2)\n`);
    expect(appendTranspose(`note("c4").transpose(2)\n`, 3)).toBe(`note("c4").transpose(5)\n`);
    expect(appendTranspose(`note("c4").transpose(2)\n`, -2)).toBe(`note("c4")\n`);
  });
  it("refuses a last line it cannot safely extend", () => {
    expect(appendTranspose(`note("c4") // hola\n`, 2)).toBeNull();
    expect(appendTranspose(`// solo un comentario\n`, 2)).toBeNull();
  });
  it("really transposes what Strudel plays", async () => {
    const code = appendTranspose(`stack(note("c4 e4"), note("g3"))\n`, 2)!;
    const midi = (await evaluateToEvents(code, 1)).map((e) => (e.value as { note: string }).note);
    expect(midi.sort()).toEqual(["A3", "D4", "F#4"].sort());
  });
});
