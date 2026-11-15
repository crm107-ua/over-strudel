import { describe, expect, it } from "vitest";
import { diatonicToMidi, locate, midiToDiatonic, pixelOf, slotOfX, xOfSlot, yOfMidi, type Geometry } from "./hit";

// one system, two measures, grand staff. stave at y=30, bass at y=120
const pts = (x0: number): [number, number][] => [0, 4, 8, 12, 16].map((s) => [s, x0 + s * 10] as [number, number]);
const geo: Geometry = {
  systems: [{ staveY: 30, bassY: 120 }],
  measures: [
    { sys: 0, x: 10, w: 200, pts: pts(60) },
    { sys: 0, x: 210, w: 200, pts: pts(230) },
  ],
};

describe("pitch <-> staff position", () => {
  it("round trips natural notes", () => {
    for (const m of [36, 40, 48, 60, 62, 64, 67, 71, 72, 84]) {
      expect(diatonicToMidi(midiToDiatonic(m))).toBe(m);
    }
    expect(diatonicToMidi(midiToDiatonic(61))).toBe(60); // sharps sit on their natural
  });

  it("treble: E4 on the bottom line, F5 on the top line; bass: G2 bottom, A3 top", () => {
    expect(yOfMidi(64, "treble", 30)).toBe(110);
    expect(yOfMidi(77, "treble", 30)).toBe(70);
    expect(yOfMidi(43, "bass", 120)).toBe(200);
    expect(yOfMidi(57, "bass", 120)).toBe(160);
    expect(yOfMidi(60, "treble", 30)).toBe(120); // middle C: first ledger line below
  });
});

describe("x <-> slot", () => {
  it("is linear between control points and invertible", () => {
    expect(xOfSlot(pts(60), 2)).toBe(80);
    expect(slotOfX(pts(60), 80)).toBe(2);
    expect(slotOfX(pts(60), 10)).toBe(0);
    expect(slotOfX(pts(60), 999)).toBe(16);
  });
});

describe("locate", () => {
  it("finds measure, slot, staff and pitch", () => {
    const l = locate(geo, 100 + 6, 110)!; // slot 4 of measure 0, bottom treble line
    expect(l).toMatchObject({ measure: 0, slot: 4, staff: "treble", midi: 64 });
    const m1 = locate(geo, 230 + 80 + 6, 200)!; // measure 1, slot 8, G2
    expect(m1).toMatchObject({ measure: 1, slot: 8, staff: "bass", midi: 43 });
  });

  it("snaps to the nearest sixteenth and clamps inside the measure", () => {
    expect(locate(geo, 100 + 6 + 4, 110)!.slot).toBe(4);
    expect(locate(geo, 100 + 6 + 6, 110)!.slot).toBe(5);
    expect(locate(geo, 15, 110)!.slot).toBe(0);
    expect(locate(geo, 400, 110)!.slot).toBe(15);
  });

  it("returns null outside the staves", () => {
    expect(locate(geo, 100, 5)).toBeNull();
    expect(locate(geo, 100, 400)).toBeNull();
  });

  it("pixelOf is null for a measure that is not on the shown page", () => {
    const sparse: Geometry = { systems: geo.systems, measures: [undefined as never, geo.measures[1]] };
    expect(pixelOf(sparse, 4, 60, false)).toBeNull();
    expect(pixelOf(sparse, 16 + 4, 60, false)).not.toBeNull();
  });

  it("locate works with a sparse measure list (only the shown page has geometry)", () => {
    const sparse: Geometry = { systems: geo.systems, measures: [undefined as never, geo.measures[1]] };
    expect(locate(sparse, 230 + 80 + 6, 110)).toMatchObject({ measure: 1, slot: 8 });
  });

  it("pixelOf is the inverse of locate for a note", () => {
    const { x, y } = pixelOf(geo, 16 + 8, 67, true)!;
    expect(locate(geo, x, y)).toMatchObject({ measure: 1, slot: 8, midi: 67 });
    const b = pixelOf(geo, 4, 48, true)!;
    expect(locate(geo, b.x, b.y)).toMatchObject({ measure: 0, slot: 4, staff: "bass", midi: 48 });
  });
});
