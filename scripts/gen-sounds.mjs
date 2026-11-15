// Lists the sound names available in the sample banks Over Strudel loads (see src/lib/sounds.ts) into
// src/lib/docs/soundBanks.json. Run manually:  node scripts/gen-sounds.mjs
import { writeFileSync } from "node:fs";
const DOUGH = "https://raw.githubusercontent.com/felixroos/dough-samples/main";
const files = { drumMachines: "tidal-drum-machines", piano: "piano", dirt: "Dirt-Samples", emu: "EmuSP12", vcsl: "vcsl", mridangam: "mridangam" };
const out = {};
for (const [k, f] of Object.entries(files)) {
  const j = await (await fetch(`${DOUGH}/${f}.json`)).json();
  const keys = Object.keys(j).filter((x) => !x.startsWith("_"));
  out[k] = k === "vcsl" || k === "dirt" || k === "emu" || k === "piano" || k === "mridangam"
    ? keys.map((n) => [n, Array.isArray(j[n]) ? j[n].length : typeof j[n] === "object" ? Object.keys(j[n]).length : 1])
    : keys;
}
// drum machines are "<Bank>_<instrument>": split them
const banks = {};
for (const k of out.drumMachines) {
  const i = k.lastIndexOf("_");
  (banks[k.slice(0, i)] ??= []).push(k.slice(i + 1));
}
out.drumMachines = banks;
writeFileSync(new URL("../src/lib/docs/soundBanks.json", import.meta.url), JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])));
