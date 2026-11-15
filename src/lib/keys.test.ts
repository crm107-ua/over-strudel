import { describe, expect, it } from "vitest";
import { applyKeyToNatural, getKey, KEYS, letterAccidental, spell, spellName, transpositionBetween } from "./keys";

describe("key table", () => {
  it("has 15 major and 15 minor keys with consistent tonics", () => {
    expect(KEYS).toHaveLength(30);
    expect(getKey("G")).toMatchObject({ fifths: 1, tonic: 7, minor: false, label: "Sol mayor" });
    expect(getKey("Bb")).toMatchObject({ fifths: -2, tonic: 10, label: "Si♭ mayor" });
    expect(getKey("Am")).toMatchObject({ fifths: 0, tonic: 9, minor: true });
    expect(getKey("Dm").tonic).toBe(2);
    expect(getKey("F#m")).toMatchObject({ fifths: 3, tonic: 6 });
    expect(getKey("nonsense").id).toBe("C");
    expect(getKey("f♯").id).toBe("F#");
  });
});

describe("key signature accidentals", () => {
  it("sharps and flats follow the circle of fifths", () => {
    const F = 3, C = 0, G = 4, B = 6, E = 2, A = 5;
    expect(letterAccidental(F, 1)).toBe(1);
    expect(letterAccidental(C, 1)).toBe(0);
    expect(letterAccidental(C, 2)).toBe(1);
    expect(letterAccidental(B, -1)).toBe(-1);
    expect([B, E, A].map((l) => letterAccidental(l, -3))).toEqual([-1, -1, -1]);
    expect(letterAccidental(G, -3)).toBe(0);
    expect([0, 1, 2, 3, 4, 5, 6].map((l) => letterAccidental(l, 7))).toEqual(Array(7).fill(1));
  });

  it("a click on a staff position means what the signature says", () => {
    expect(applyKeyToNatural(65, 1)).toBe(66); // F -> F# in G major
    expect(applyKeyToNatural(71, -2)).toBe(70); // B -> Bb in Bb major
    expect(applyKeyToNatural(65, 0)).toBe(65);
  });
});

describe("spelling", () => {
  it("flats in flat keys, sharps otherwise", () => {
    expect(spell(70, -2)).toBe("bb/4");
    expect(spell(70, 2)).toBe("a#/4");
    expect(spell(61, -5)).toBe("db/4");
    expect(spell(60, -5)).toBe("c/4");
    expect(spellName(63, -3)).toBe("eb4");
  });
});

describe("transposition between keys", () => {
  it("takes the shortest way", () => {
    expect(transpositionBetween(getKey("C"), getKey("D"))).toBe(2);
    expect(transpositionBetween(getKey("C"), getKey("G"))).toBe(-5);
    expect(transpositionBetween(getKey("G"), getKey("C"))).toBe(5);
    expect(transpositionBetween(getKey("C"), getKey("C"))).toBe(0);
    expect(transpositionBetween(getKey("C"), getKey("Am"))).toBe(-3);
  });
});
