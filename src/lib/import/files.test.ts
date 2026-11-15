import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readScoreBytes } from "./files";

const XML = '<?xml version="1.0"?><score-partwise><part-list/></score-partwise>';

describe("score file detection", () => {
  it("recognises a PDF by its header", () => {
    expect(readScoreBytes(strToU8("%PDF-1.7\n..."), "a.pdf").kind).toBe("pdf");
  });
  it("reads plain MusicXML (with BOM)", () => {
    const f = readScoreBytes(strToU8("﻿" + XML), "a.musicxml");
    expect(f.kind === "musicxml" && f.xml.startsWith("<?xml")).toBe(true);
  });
  it("reads .mxl through META-INF/container.xml", () => {
    const zip = zipSync({
      "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="score/main.xml"/></rootfiles></container>'),
      "score/main.xml": strToU8(XML),
      "other.xml": strToU8("<x/>"),
    });
    const f = readScoreBytes(zip, "a.mxl");
    expect(f.kind === "musicxml" && f.xml).toBe(XML);
  });
  it("falls back to the first xml of a zip without a container", () => {
    const f = readScoreBytes(zipSync({ "song.xml": strToU8(XML) }), "a.mxl");
    expect(f.kind === "musicxml" && f.xml).toBe(XML);
  });
  it("rejects other formats and broken zips", () => {
    expect(() => readScoreBytes(strToU8("hola"), "a.txt")).toThrow(/Formato/);
    expect(() => readScoreBytes(strToU8("PK\u0003\u0004garbage"), "a.mxl")).toThrow(/dañado/);
    expect(() => readScoreBytes(zipSync({ "a.txt": strToU8("x") }), "a.mxl")).toThrow(/ninguna partitura/);
  });
});
