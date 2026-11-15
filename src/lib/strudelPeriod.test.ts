import { describe, expect, it } from "vitest";
import { evaluateFull } from "./strudelRuntime";

const period = async (code: string) => (await evaluateFull(code, 2)).period;

describe("how long the piece really is", () => {
  it("a looping bar lasts 1 measure", async () => {
    expect(await period(`note("c4 e4 g4 c5")`)).toBe(1);
    expect(await period(`silence`)).toBe(1);
  });
  it("<a b c> alternates: 3 measures", async () => {
    expect(await period(`note("<c4 d4 e4>")`)).toBe(3);
  });
  it("slow(n) stretches the sequence over n measures", async () => {
    expect(await period(`note("c4 d4 e4 f4").slow(4)`)).toBe(4);
  });
  it("stacked layers repeat at their common multiple", async () => {
    expect(await period(`stack(note("<c4 d4>"), note("<c3 d3 e3>"))`)).toBe(6);
  });
  it("16 different measures", async () => {
    const bars = Array.from({ length: 16 }, (_, i) => `[c${(i % 5) + 3} e4 g4 ${["c5", "d5", "e5", "f5"][i % 4]}]`).join(" ");
    expect(await period(`note("<${bars}>")`)).toBe(16);
  });
  it("tempo and $: do not change it", async () => {
    expect(await period(`setcpm(20)\n$: note("<c4 d4>")\n$: note("e4")`)).toBe(2);
  });
  it("longer than 32 (35 here) measures is reported as unknown", async () => {
    const bars = Array.from({ length: 35 }, (_, i) => `${"cdefgab"[i % 7]}${3 + (i % 5)}`).join(" ");
    expect(await period(`note("<${bars}>")`)).toBeNull();
  });
});
