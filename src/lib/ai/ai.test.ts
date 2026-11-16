import { describe, expect, it } from "vitest";
import { canonical, docFromQ } from "../edit/doc";
import { parseDirectives } from "../directives";
import { quantize } from "../middleware/quantize";
import { evaluateFull } from "../strudelRuntime";
import { cleanCode, generatePiece, GeminiError } from "./generate";
import { EXAMPLE_PIECE, clampMeasures } from "./prompt";
import { checkPiece } from "./validate";

describe("checkPiece", () => {
  it("accepts the example given to the model", () => {
    const c = checkPiece(EXAMPLE_PIECE, 4);
    expect(c.errors).toEqual([]);
    expect(c).toMatchObject({ ok: true, measures: 4, layers: 2, key: "C", bpm: 108 });
    expect(c.notes).toBe(15 + 16); // 15 melody notes + 8 two-note chords counted note by note
  });

  it("the example really evaluates with Strudel and reads back as the same measures", async () => {
    const { events, cpm } = await evaluateFull(EXAMPLE_PIECE, 4);
    const doc = docFromQ(quantize(events, 4), 4);
    expect(cpm).toBe(27);
    expect(doc.events.length).toBeGreaterThan(20);
    expect(parseDirectives(EXAMPLE_PIECE).title).toBe("Himno de la Alegría — Beethoven");
    expect(canonical(doc).length).toBe(canonical(doc).length);
  });

  const piece = (rows: string[], extra = "") =>
    `// @compases ${rows.length}\nsetcpm(100/4)\nnote(\`\n${rows.join("\n")}\n\`)${extra}\n`;

  it("catches a measure that does not add up to 16", () => {
    const c = checkPiece(piece(["c4@4 d4@4 e4@4", "c4@16"], ".slow(2)"), 2);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toMatch(/compás 1: las duraciones suman 12/);
  });

  it("catches a wrong number of lines and a missing / wrong .slow", () => {
    expect(checkPiece(piece(["c4@16"], ""), 1).ok).toBe(true); // a single measure needs no .slow
    expect(checkPiece(piece(["c4@16", "d4@16"], ""), 2).errors.join(" ")).toMatch(/falta `\.slow\(2\)`/);
    expect(checkPiece(piece(["c4@16", "d4@16"], ".slow(3)"), 2).errors.join(" ")).toMatch(/\.slow\(3\) debe ser \.slow\(2\)/);
    const c = checkPiece(`// @compases 3\nsetcpm(100/4)\nnote(\`\nc4@16\nd4@16\n\`).slow(3)\n`, 3);
    expect(c.errors.join(" ")).toMatch(/2 líneas y debe tener exactamente 3/);
  });

  it("catches invalid steps, notes and tonalities", () => {
    expect(checkPiece(piece(["c4 d4 e4 f4"], ""), 1).errors.join(" ")).toMatch(/paso no válido «c4»/);
    expect(checkPiece(piece(["h4@16"], ""), 1).errors.join(" ")).toMatch(/paso no válido «h4@16»/);
    expect(checkPiece(piece(["c9@16"], ""), 1).errors.join(" ")).toMatch(/paso no válido/);
    expect(checkPiece(`// @tonalidad Hm\n${piece(["c4@16"])}`, 1).errors.join(" ")).toMatch(/Tonalidad «Hm»/);
  });

  it("checks directives and tempo", () => {
    expect(checkPiece(`setcpm(100/4)\nnote(\`\nc4@16\n\`)`).errors.join(" ")).toMatch(/Falta la directiva/);
    expect(checkPiece(`// @compases 1\nnote(\`\nc4@16\n\`)`).errors.join(" ")).toMatch(/Falta `setcpm/);
    expect(checkPiece(`// @compases 1\nsetcpm(400)\nnote(\`\nc4@16\n\`)`).errors.join(" ")).toMatch(/fuera de rango/);
    expect(checkPiece(piece(["c4@16"]), 2).errors.join(" ")).toMatch(/pero se pidieron exactamente 2/);
    expect(checkPiece(`// @compases 99\nsetcpm(25)\nnote(\`\nc4@16\n\`)`).errors.join(" ")).toMatch(/entre 1 y 64/);
  });

  it(".gain must mirror the layout of its note layer", () => {
    const base = (gain: string) => `// @compases 1\nsetcpm(25)\nnote(\`\nc4@8 e4@8\n\`).gain(\`\n${gain}\n\`)\n`;
    expect(checkPiece(base("0.7@8 0.9@8"), 1).ok).toBe(true);
    expect(checkPiece(base("0.7@16"), 1).errors.join(" ")).toMatch(/tiene 1 pasos y note tiene 2/);
    expect(checkPiece(base("0.7@4 0.9@12"), 1).errors.join(" ")).toMatch(/usa @4 y note usa @8/);
    expect(checkPiece(base("f@8 0.9@8"), 1).errors.join(" ")).toMatch(/no numérico/);
  });

  it("rejects a piece without notes", () => {
    expect(checkPiece(piece(["~@16"], ""), 1).errors.join(" ")).toMatch(/ninguna nota/);
  });
});

describe("generatePiece (model mocked)", () => {
  const reply = (obj: Record<string, unknown>) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
  const good = { title: "Himno", composer: "Beethoven", key: "C major", bpm: 108, notes: "Fiel.", code: EXAMPLE_PIECE };
  const bad = { ...good, code: EXAMPLE_PIECE.replace("e4@6 d4@2 d4@8", "e4@6 d4@2 d4@4") };

  it("returns a valid first answer as is", async () => {
    const calls: unknown[] = [];
    const p = await generatePiece({ title: "Oda a la Alegría", measures: 4, apiKey: "k", fetchImpl: async (_u, init) => (calls.push(JSON.parse(String(init?.body))), reply(good)) });
    expect(p.attempts).toBe(1);
    expect(p.check.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const body = calls[0] as { contents: { parts: { text: string }[] }[]; generationConfig: { responseMimeType: string } };
    expect(body.contents[0].parts[0].text).toContain("<<<PIECE\nOda a la Alegría\nPIECE>>>");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("sends the validator's errors back and accepts the repaired answer", async () => {
    const seen: string[] = [];
    let n = 0;
    const p = await generatePiece({
      title: "x", measures: 4, apiKey: "k",
      fetchImpl: async (_u, init) => {
        const turns = (JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] }).contents;
        seen.push(turns[turns.length - 1].parts[0].text);
        return reply(++n === 1 ? bad : good);
      },
    });
    expect(p.attempts).toBe(2);
    expect(seen[1]).toMatch(/suman 12 y deben sumar 16/);
  });

  it("never delivers code that fails the check", async () => {
    await expect(generatePiece({ title: "x", measures: 4, apiKey: "k", maxRepairs: 1, fetchImpl: async () => reply(bad) })).rejects.toThrow(/No se pudo generar/);
  });

  it("maps HTTP errors to readable messages", async () => {
    const status = (s: number) => generatePiece({ title: "x", measures: 4, apiKey: "k", fetchImpl: async () => new Response("{}", { status: s }) });
    await expect(status(429)).rejects.toThrow(/cuota/);
    await expect(status(403)).rejects.toThrow(/rechazó la clave/);
    await expect(status(500)).rejects.toBeInstanceOf(GeminiError);
  });

  it("asks again when an answer is cut off by the length limit, and gives up if it keeps happening", async () => {
    const cut = () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"code":"note(' }] } }] }), { status: 200 });
    let n = 0;
    const p = await generatePiece({ title: "x", measures: 4, apiKey: "k", fetchImpl: async () => (++n === 1 ? cut() : reply(good)) });
    expect(p.attempts).toBe(2);
    await expect(generatePiece({ title: "x", measures: 4, apiKey: "k", maxRepairs: 1, fetchImpl: async () => cut() })).rejects.toThrow(/repetidamente/);
  });

  it("falls back to the next model when one is out of quota", async () => {
    const urls: string[] = [];
    const p = await generatePiece({
      title: "x", measures: 4, apiKey: "k", model: ["a-model", "b-model"],
      fetchImpl: async (u) => (urls.push(String(u)), urls.length === 1 ? new Response("{}", { status: 429 }) : reply(good)),
    });
    expect(p.model).toBe("b-model");
    expect(urls[0]).toContain("a-model:");
    expect(urls[1]).toContain("b-model:");
  });

  it("cleans fenced code", () => {
    expect(cleanCode("```js\nnote(`c4@16`)\n```")).toBe("note(`c4@16`)\n");
  });

  it("clamps the requested length", () => {
    expect([clampMeasures(2), clampMeasures(16), clampMeasures(500), clampMeasures("x")]).toEqual([4, 16, 64, 16]);
  });
});
