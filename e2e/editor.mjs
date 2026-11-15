// End-to-end check of the bidirectional editor in a real browser.
// usage: node e2e/editor.mjs [baseUrl] [chromePath] [screenshotPath]
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = process.argv[3] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOT = process.argv[4] ?? "e2e-final.png";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
let dialogs = 0;
page.on("pageerror", (e) => pageErrors.push(e.message));
const renderErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && /VexFlow render failed/.test(m.text())) renderErrors.push(m.text().slice(0, 160));
});
page.on("dialog", (d) => {
  dialogs++;
  d.accept();
});

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
  if (!ok) failed++;
};
const wait = (ms) => page.waitForTimeout(ms);

// the Monaco model text (the code the user sees)
const editorText = () => page.evaluate(() => Array.from(document.querySelectorAll(".monaco-editor .view-line")).map((l) => l.textContent.replace(/\u00a0/g, " ")).join("\n"));
const setCode = async (code) => {
  await page.locator(".monaco-editor").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(code);
  await wait(1500);
};
const alerts = async () => (await page.locator("[role=alert]").allInnerTexts()).filter(Boolean);
const layout = () =>
  page.evaluate(() => {
    const l = window.__osLayout;
    return l && { systems: l.systems, measures: l.measures.map((m) => ({ sys: m.sys, x: m.x, w: m.w, pts: m.pts })) };
  });
const NAT = [0, 2, 4, 5, 7, 9, 11];
const diatonic = (m) => {
  const pc = m % 12;
  let i = 0;
  for (let k = 0; k < 7; k++) if (NAT[k] <= pc) i = k;
  return (Math.floor(m / 12) - 1) * 7 + i;
};
const xOf = (pts, slot) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, xa] = pts[i];
    const [b, xb] = pts[i + 1];
    if (slot >= a && slot < b) return xa + ((xb - xa) * (slot - a)) / (b - a);
  }
  return pts.at(-1)[1];
};
/** screen point of a notehead: absolute slot + natural midi */
const pointOf = async (abs, midi, bass = false) => {
  const l = await layout();
  const mi = Math.floor(abs / 16);
  const m = l.measures[mi];
  const sys = l.systems[m.sys];
  const y0 = bass ? sys.bassY : sys.staveY;
  const box = await page.getByTestId("score-pane").boundingBox();
  return { x: box.x + xOf(m.pts, abs - mi * 16) + 6, y: box.y + y0 + 80 - (diatonic(midi) - (bass ? 18 : 30)) * 5 };
};
const click = async (abs, midi, bass = false) => {
  const p = await pointOf(abs, midi, bass);
  await page.mouse.click(p.x, p.y);
  await wait(500);
};
const focusScore = () => page.getByTestId("score-pane").focus();

await page.goto(BASE);
await wait(9000);
// the original flow places notes where you click: free entry, quarter notes
await page.getByRole("button", { name: "Entrada libre" }).click();
await page.getByRole("button", { name: /Negra/ }).click();

// 1. start from an empty 2-measure score
await setCode("// @compases 2\nsilence\n");
check("empty score renders (2 measures)", (await layout())?.measures.length === 2);

// 2. clicking the staff writes code
await click(0, 60); // c4 quarter
await click(4, 64); // e4
await click(8, 67); // g4
let code = await editorText();
check("clicks generate canonical code", /c4@4/.test(code) && /e4@4/.test(code) && /g4@4/.test(code) && code.includes("@compases 2"), code);
check("no error banner after edits", (await alerts()).length === 0, JSON.stringify(await alerts()));

// 3. same beat + same length -> chord
await click(0, 67);
code = await editorText();
check("same beat fuses into a chord", /\[c4,g4\]@4/.test(code), code);

// 4. keyboard on the selection (the chord note just added is selected)
await focusScore();
await page.keyboard.press("ArrowUp");
await wait(700);
code = await editorText();
check("ArrowUp transposes a semitone (g4 -> g#4)", /g#4/.test(code), code);
await page.keyboard.press("Control+z");
await wait(800);
check("Ctrl+Z restores the pitch", !/g#4/.test(await editorText()), await editorText());
await page.keyboard.press("Control+y");
await wait(800);
check("Ctrl+Y redoes it", /g#4/.test(await editorText()));
await page.keyboard.press("Control+z");
await wait(600);

// 5. duration, dynamic, articulation on a selected note
await click(4, 64); // existing e4 -> selects it
await page.keyboard.press("4"); // half note
await wait(700);
check("key 4 makes the selected note a half note", /e4@8/.test(await editorText()), await editorText());
await page.keyboard.press("f");
await wait(700);
check("F writes a dynamic (.gain)", (await editorText()).includes(".gain("), await editorText());
check("dynamic is drawn in the score", (await page.locator("svg text").allTextContents()).some((t) => t.trim() === "f"));
await page.keyboard.press("s");
await wait(700);
check("S writes an articulation (.clip)", (await editorText()).includes(".clip("));

// 6. drag moves a note in time
const before = await editorText();
const from = await pointOf(4, 64);
const to = await pointOf(12, 64);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 5 });
await page.mouse.move(to.x, to.y, { steps: 5 });
await page.mouse.up();
await wait(800);
const after = await editorText();
check("dragging a note rewrites the code", after !== before && /e4@8/.test(after), after);

// 7. delete
await page.keyboard.press("Delete");
await wait(700);
check("Delete removes the selected note", !/e4@8/.test(await editorText()), await editorText());

// 8. code -> score still works after editing; editing hand-written code asks first
await setCode('// @compases 1\nnote("c4 e4 g4 c5").every(2, rev)\n');
check("typed code renders", (await layout())?.measures.length === 1 && (await alerts()).length === 0, JSON.stringify(await alerts()));
await click(2, 74); // an empty spot (slot 2, D5)
check("editing hand-written code shows NO alert", dialogs === 0, `${dialogs} dialog(s)`);
const regen = await editorText();
check("then the code is canonical again", /note\(/.test(regen) && !/every\(/.test(regen), regen);
await page.getByRole("button", { name: /Deshacer/ }).click();
await wait(700);
check("undo brings the hand-written code back", /every\(2, rev\)/.test(await editorText()), await editorText());

// 9. a pitch below middle C opens the grand staff
await setCode("// @compases 1\nsilence\n");
await click(0, 60);
check("single staff while all notes are >= C4", (await layout()).systems[0].bassY === null);
await click(8, 55); // G3 (ledger lines under the treble staff)
check("a note below C4 turns on the grand staff", (await layout()).systems[0].bassY !== null, JSON.stringify((await layout()).systems[0]));
await click(4, 48, true); // C3 on the bass staff
check("notes can be placed on the bass staff", /c3@\d+/.test(await editorText()), await editorText());

// 10. editing while playing hot-swaps without errors
await page.locator("button", { hasText: "Reproducir" }).first().click();
await wait(1500);
await click(12, 64, false);
await wait(800);
check("editing while playing keeps playing, no errors", (await page.locator("button", { hasText: "Detener" }).count()) > 0 && (await alerts()).length === 0, JSON.stringify(await alerts()));
await page.locator("button", { hasText: "Detener" }).first().click();

// 11. a single play button
const playBtns = await page.locator("button", { hasText: "Reproducir" }).count();
check("there is a single play button", playBtns === 1, String(playBtns));
check("there is no side panel any more", (await page.getByTestId("note-inspector").count()) === 0);

// 12. the preview lives AT THE CURSOR
await setCode("// @compases 1\nsilence\n");
await page.getByRole("button", { name: /Corchea/ }).click();
await page.getByRole("button", { name: "Sin alteración" }).click();
const h = await pointOf(4, 65); // F4
await page.mouse.move(h.x, h.y);
await wait(400);
check("a card follows the cursor: pitch", (await page.getByTestId("cursor-name").innerText()) === "Fa4", await page.getByTestId("cursor-name").innerText());
check("a card follows the cursor: length", (await page.getByTestId("cursor-dur").innerText()) === "1/8", await page.getByTestId("cursor-dur").innerText());
const cardBox = await page.getByTestId("cursor-preview").boundingBox();
check("the card sits right next to the pointer", cardBox && cardBox.x - h.x > 8 && cardBox.x - h.x < 60 && Math.abs(cardBox.y + cardBox.height / 2 - h.y) < 60, JSON.stringify(cardBox) + " vs " + JSON.stringify(h));
await page.getByRole("button", { name: "Sostenido" }).click();
await page.mouse.move(h.x + 1, h.y);
await wait(400);
check("the card shows the accidental", (await page.getByTestId("cursor-name").innerText()) === "Fa♯4", await page.getByTestId("cursor-name").innerText());
await page.mouse.click(h.x + 1, h.y);
await wait(600);
check("click places exactly the previewed note", /f#4@2/.test(await editorText()), await editorText());

// 13. selecting shows a small menu above the note; its X removes the note
await wait(300);
check("the note menu appears over the selected note", (await page.getByTestId("note-popover").count()) === 1);
check("the menu names the note", (await page.getByTestId("popover-name").innerText()) === "Fa♯4");
await page.getByTestId("popover-delete").click();
await wait(600);
check("the X in the menu removes the note", !/f#4/.test(await editorText()) && /silence/.test(await editorText()), await editorText());

// 14. drag to draw a longer note (7 slots to the right -> 8 sixteenths)
await page.getByRole("button", { name: "Sin alteración" }).click();
const a = await pointOf(2, 67);
const b = await pointOf(9, 67);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 5 });
await page.mouse.move(b.x, b.y, { steps: 5 });
await wait(200);
check("while dragging the card shows the growing length", (await page.getByTestId("cursor-dur").innerText()) === "1/2", await page.getByTestId("cursor-dur").innerText());
await page.mouse.up();
await wait(600);
check("drag-to-draw creates a note of that length", /g4@8/.test(await editorText()), await editorText());

// 15. right click removes a note
await page.mouse.click(a.x, a.y, { button: "right" });
await wait(600);
check("right click removes the note", !/g4/.test(await editorText()), await editorText());

// 16. wheel over a note changes its pitch
await click(0, 60); // c4 (an eighth); the pointer stays on it
await page.mouse.wheel(0, -120);
await wait(900);
check("wheel up raises the note a semitone", /c#4@2/.test(await editorText()), await editorText());
await page.getByRole("button", { name: /Deshacer/ }).click();
await wait(700);
check("one undo reverts the wheel turn", /c4@2/.test(await editorText()) && !/c#4/.test(await editorText()), await editorText());
await page.getByRole("button", { name: /Rehacer/ }).click();
await wait(700);

// 17. adding and removing measures
check("starts with 1 measure", (await layout()).measures.length === 1);
await page.getByTestId("add-measure-btn").click();
await wait(700);
check("＋ Compás adds a measure (code + score)", (await layout()).measures.length === 2 && /@compases 2/.test(await editorText()), await editorText());
await page.getByTestId("add-measure").click();
await wait(700);
check("the block at the end of the score also adds one", (await layout()).measures.length === 3 && /@compases 3/.test(await editorText()));
await click(40, 64); // a note inside measure 3
await page.getByTestId("remove-measure-btn").click();
await wait(700);
check("－ Compás removes the last one (and its notes)", (await layout()).measures.length === 2 && !/e4/.test(await editorText()), await editorText());
check("no error banner after measure edits", (await alerts()).length === 0, JSON.stringify(await alerts()));

// 18. dark mode for the score (including stems)
await page.getByTestId("theme-toggle").click();
await wait(900);
check("dark theme is applied to the score pane", (await page.locator("section.score-dark").count()) === 1);
const paper = await page.getByTestId("score-pane").evaluate((e) => getComputedStyle(e).backgroundColor);
check("score paper is dark", paper === "rgb(23, 26, 34)", paper);
const inks = await page.evaluate(() => {
  const pick = (sel) => [...document.querySelectorAll(`[data-testid=score-pane] svg ${sel}`)].map((e) => getComputedStyle(e).stroke);
  return { stems: pick(".vf-stem"), stave: pick(".vf-stave path") };
});
check("stems are drawn in the light ink", inks.stems.length > 0 && inks.stems.every((c) => c === "rgb(229, 231, 235)"), JSON.stringify(inks.stems));
check("staff lines are drawn in the light ink", inks.stave.length > 0 && inks.stave.every((c) => c === "rgb(229, 231, 235)"));
await page.screenshot({ path: SHOT.replace(".png", "-dark.png") });
await page.reload();
await wait(8000);
// a reload resets the editor state: back to free entry + quarter notes for the placement tests that follow
await page.getByRole("button", { name: "Entrada libre" }).click();
await page.getByRole("button", { name: /Negra/ }).click();
check("the theme persists after reload", (await page.locator("section.score-dark").count()) === 1);
await page.getByTestId("theme-toggle").click();
await wait(500);

// 19. the ghost note is a real upright note (head + vertical stem), not a flat bar
await setCode("// @compases 1\nsilence\n");
await page.getByRole("button", { name: /Negra/ }).click();
const gp = await pointOf(4, 62); // D4: below the middle line -> stem up
await page.mouse.move(gp.x, gp.y);
await wait(300);
const parts = await page.getByTestId("ghost-note").evaluate((svg) => ({
  heads: svg.querySelectorAll("ellipse").length,
  stems: [...svg.querySelectorAll("line")].map((l) => ({ dx: Math.abs(l.x2.baseVal.value - l.x1.baseVal.value), dy: Math.abs(l.y2.baseVal.value - l.y1.baseVal.value) })),
}));
check("the preview is a notehead + a stem", parts.heads === 1 && parts.stems.length === 1, JSON.stringify(parts));
check("the stem is vertical", parts.stems[0].dx === 0 && parts.stems[0].dy > 25, JSON.stringify(parts));
await page.getByRole("button", { name: /Redonda/ }).click();
await page.mouse.move(gp.x + 1, gp.y);
await wait(300);
check("a whole note has no stem", (await page.getByTestId("ghost-note").locator("line").count()) === 0);
await page.getByRole("button", { name: /Negra/ }).click();

// 20. right click on the STEM removes the note and the measure refills at once
await click(4, 62);
check("note placed", /d4@4/.test(await editorText()), await editorText());
const sb = await page.locator("[data-testid=score-pane] .vf-stem").first().boundingBox();
await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2, { button: "right" });
await wait(500);
check("right click on the stem removes the note", !/d4/.test(await editorText()) && /silence/.test(await editorText()), await editorText());
check("the measure is refilled with a rest immediately", (await page.locator("[data-testid=score-pane] .vf-stavenote").count()) === 1);

// 21. key signature: transposes the whole piece, draws the signature, clicks follow it
await setCode("// @compases 2\nnote(`c4 e4 g4 c5`)\n");
await page.getByTestId("key-select").click();
await page.getByRole("option", { name: "Re mayor" }).click();
await wait(1300);
let kcode = await editorText();
check("choosing a key writes the directive", /@tonalidad D/.test(kcode), kcode);
check("changing the key transposes the whole piece", /d4@4/.test(kcode) && /f#4@4/.test(kcode) && /a4@4/.test(kcode), kcode);
check("the key signature is drawn", (await page.locator("[data-testid=score-pane] svg [class*=keysig]").count()) > 0);
await page.getByRole("switch", { name: "Transponer la obra" }).click(); // transposition off: signature only
await page.getByTestId("key-select").click();
await page.getByRole("option", { name: "Mi mayor" }).click();
await wait(1300);
kcode = await editorText();
check("signature-only change keeps the notes", /@tonalidad E/.test(kcode) && /d4@4/.test(kcode), kcode);
await page.getByRole("button", { name: "Sin alteración" }).click(); // release the explicit natural -> follow the key
await click(8, 65); // the F line: F# in E major
await wait(300);
check("a click on the F line gives F# in E major", /f#4@\d+/.test(await editorText()), await editorText());

// 22. sheets (pagination)
await page.getByRole("switch", { name: "Transponer la obra" }).click();
await setCode("// @compases 30\nnote(`c4`)\n");
const total = Number((await page.getByTestId("page-total").innerText()).replace(/\D/g, ""));
check("a long score is split into sheets", total >= 3, `pages: ${total}`);
check("starts on sheet 1", (await page.getByTestId("sheet-label").innerText()).includes("Hoja 1 de"));
await page.getByRole("button", { name: "Hoja siguiente" }).click();
await wait(700);
check("next sheet", (await page.getByTestId("sheet-label").innerText()).includes("Hoja 2 de"), await page.getByTestId("sheet-label").innerText());
check("the measure range follows the sheet", /Compases (\d+)–/.test(await page.getByTestId("page-range").innerText()) && !/Compases 1–/.test(await page.getByTestId("page-range").innerText()));
await page.getByTestId("score-pane").focus();
await page.keyboard.press("PageDown");
await wait(600);
check("PageDown turns the sheet", (await page.getByTestId("sheet-label").innerText()).includes("Hoja 3 de"), await page.getByTestId("sheet-label").innerText());
await page.getByRole("button", { name: "Última hoja" }).click();
await wait(600);
check("last sheet", (await page.getByTestId("sheet-label").innerText()).includes(`Hoja ${total} de ${total}`), await page.getByTestId("sheet-label").innerText());
await page.getByTestId("page-input").fill("1");
await wait(600);
check("typing a sheet number jumps to it", (await page.getByTestId("sheet-label").innerText()).includes("Hoja 1 de"));
check("the sheet fills the whole panel width", await page.evaluate(() => { const p = document.querySelector("[data-testid=score-pane]").getBoundingClientRect(); const s = document.querySelector("[data-testid=score-pane]").parentElement.getBoundingClientRect(); return p.width > s.width - 40; }));

// 23. playback turns the sheet by itself (1 measure = 2 s)
await setCode("// @compases 12\nnote(`c4`)\n");
const perSheet = await page.evaluate(() => { const l = window.__osLayout; return l.measures.filter(Boolean).length; });
check("12 measures need more than one sheet here", perSheet < 12, `measures on sheet 1: ${perSheet}`);
await page.getByRole("button", { name: "Reproducir" }).click();
await wait(perSheet * 2000 + 4500);
check("the sheet follows the playback cursor", (await page.getByTestId("sheet-label").innerText()).includes("Hoja 2 de"), await page.getByTestId("sheet-label").innerText());
await page.getByRole("button", { name: "Detener" }).click();

// 24. regression: adding a measure and pressing play must keep the score on screen
await setCode("// @compases 2\nnote(`c4 e4 g4 c5`)\n");
await page.getByTestId("add-measure-btn").click();
await wait(900);
await page.getByRole("button", { name: "Reproducir" }).click();
await wait(3000);
const afterPlay = await page.evaluate(() => ({
  notes: document.querySelectorAll("[data-testid=score-pane] .vf-stavenote").length,
  label: document.querySelector("[data-testid=sheet-label]")?.textContent,
}));
check("add a measure + play: the score is still drawn", afterPlay.notes > 0 && !/Hoja 0|Hoja -/.test(afterPlay.label), JSON.stringify(afterPlay));
await page.getByRole("button", { name: "Detener" }).click();

// 25. free placement: the note follows the pointer exactly, then glides to its structured place
await setCode("// @compases 2\nsilence\n");
await page.getByTestId("add-measure-btn").click();
await wait(700);
const fp = await pointOf(36, 67); // an empty, freshly added measure (G4)
const rawX = fp.x + 7; // deliberately NOT on a grid position (just before the midpoint between two positions)
await page.mouse.move(rawX, fp.y);
await wait(300);
const gb = await page.getByTestId("ghost-note").boundingBox();
check("the preview sits exactly under the pointer, not forced onto the grid", gb && Math.abs(gb.x + 24 - rawX) < 3, `ghost centre ${gb && gb.x + 24} vs pointer ${rawX}`);
await page.mouse.click(rawX, fp.y);
const sawSettle = await page.waitForSelector("[data-testid=settle-note]", { state: "attached", timeout: 1500 }).then(() => true, () => false);
const settledAway = await page.waitForSelector("[data-testid=settle-note]", { state: "detached", timeout: 3000 }).then(() => true, () => false);
await wait(300);
const nhb = await page.locator("[data-testid=score-pane] .vf-note-selected .vf-notehead").first().boundingBox();
const landed = nhb ? Math.abs(nhb.x + nhb.width / 2 - rawX) : 999;
// either the note glided from the click point to its structured place, or that place already was where you clicked
check("the note ends where you clicked or glides there from it", sawSettle || landed < 5, `glide: ${sawSettle}, distance to click: ${landed.toFixed(1)}px`);
check("the glide ends and the real note is shown", settledAway && /g4@/.test(await editorText()), await editorText());


// 26. sequential entry: notes and rests are written one after another, at the cursor
await page.getByRole("button", { name: "Entrada secuencial" }).click();
await page.getByRole("button", { name: "Modo nota" }).click();
await setCode("// @compases 2\nsilence\n");
const seqX = async (m = 0) => { const l = await layout(); const box = await page.getByTestId("score-pane").boundingBox(); return { x: box.x + l.measures[m].x + 25, sys: l.systems[0], box }; };
const seqPoint = async (diatonicStep, m = 0) => { const { x, sys, box } = await seqX(m); return { x, y: box.y + sys.staveY + 80 - (diatonicStep - 30) * 5 }; };
const seqClick = async (diatonicStep, m = 0) => { const p = await seqPoint(diatonicStep, m); await page.mouse.click(p.x, p.y); await wait(550); };
check("a fresh measure is a single whole rest", (await page.locator("[data-testid=score-pane] .vf-stavenote").count()) === 2);

await page.getByRole("button", { name: /Blanca/ }).click();
let sp = await seqPoint(32); // G4, clicked far to the left of where the note will end up
await page.mouse.move(sp.x, sp.y);
await wait(300);
const gbox = await page.getByTestId("ghost-note").boundingBox();
check("the note follows the pointer: you can click ANYWHERE in the measure", gbox && Math.abs(gbox.x + 24 - sp.x) < 6, `ghost ${gbox && gbox.x + 24}, pointer ${sp.x}`);
const glide = page.waitForSelector("[data-testid=settle-note]", { state: "attached", timeout: 2500 }).then(() => true, () => false);
await page.mouse.click(sp.x, sp.y);
check("after the click the note glides from where you clicked to its structured place", await glide);
await wait(550);
check("first note: a half note at the start", /g4@8/.test(await editorText()), await editorText());
check("the free half of the measure reads as ONE half rest", (await page.locator("[data-testid=score-pane] .vf-stavenote").count()) === 3); // half note + half rest + whole rest (2nd measure)

await page.getByRole("button", { name: /Negra/ }).click();
await seqClick(33); // A4
check("second note: a quarter, right after the first", /g4@8 a4@4/.test(await editorText()), await editorText());
check("figures that no longer fit are disabled (only a quarter is left)", (await page.getByRole("button", { name: /Blanca/ }).isDisabled()) && (await page.getByRole("button", { name: /Redonda/ }).isDisabled()));

// rest mode: the same flow, switchable at any moment
await page.getByRole("button", { name: "Modo silencio" }).click();
await seqClick(30);
check("a rest is written like a note: the measure is now complete", /g4@8 a4@4 ~@4/.test(await editorText()), await editorText());
await page.getByRole("button", { name: "Modo nota" }).click();
// the first measure is now complete (half + quarter + quarter rest): more clicks there write nothing and add no measures
const fullCode = await editorText();
const measuresBefore = (await layout()).measures.length;
await seqClick(34);
await seqClick(31);
check("a complete measure accepts nothing and no measure is created", (await editorText()) === fullCode && (await layout()).measures.length === measuresBefore, await editorText());
const fp0 = await seqPoint(34);
await page.mouse.move(fp0.x, fp0.y);
await wait(300);
check("the card says the measure is full", (await page.getByTestId("cursor-name").innerText()) === "Compás lleno", await page.getByTestId("cursor-name").innerText());
await seqClick(34, 1); // B4 in the SECOND measure: it starts from its own whole rest
check("the second measure is written from its own start", /b4@4/.test(await editorText()) && /~@4\n\s+b4@4/.test(await editorText()), await editorText());
check("measure 1 = half + quarter + quarter rest, measure 2 = note + quarter rest + half rest", (await page.locator("[data-testid=score-pane] .vf-stavenote").count()) === 6);

// keyboard: R switches the mode, Enter writes at the cursor
await page.getByTestId("score-pane").focus();
await page.keyboard.press("r");
await wait(200);
check("R switches to rest mode", (await page.getByRole("button", { name: "Modo silencio" }).getAttribute("aria-pressed")) === "true");
const enterCode = await editorText();
await page.keyboard.press("Enter");
await wait(500);
check("Enter in rest mode writes a rest (the staff is unchanged) and creates no measure", (await editorText()) === enterCode && (await layout()).measures.length === 2, await editorText());
await page.keyboard.press("r");
await wait(200);
check("R switches back to note mode", (await page.getByRole("button", { name: "Modo nota" }).getAttribute("aria-pressed")) === "true");

// Alt+click moves the cursor without writing
const altBefore = (await editorText());
const ap = await seqPoint(32);
await page.keyboard.down("Alt");
await page.mouse.click(ap.x, ap.y);
await page.keyboard.up("Alt");
await wait(400);
check("Alt+click moves the cursor but writes nothing", (await editorText()) === altBefore);
check("no VexFlow render errors in sequential entry", renderErrors.length === 0, renderErrors.join(" | "));

const rightClickHead = async (i) => { const bb = await page.locator("[data-testid=score-pane] .vf-notehead").nth(i).boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: "right" }); };
// 27. a FULL measure is subdivided by each click (never a new measure); deleting a note frees its space again
await setCode("// @compases 2\nsilence\n");
await page.getByRole("button", { name: /Redonda/ }).click();
await seqClick(32, 0); // G4 whole note
check("a whole note fills the measure", /g4@16/.test(await editorText()), await editorText());
await seqClick(33, 0); // click on the full measure
check("a click on the full measure turns the whole note into TWO HALVES", /g4@8 a4@8/.test(await editorText()), await editorText());
await seqClick(34, 0);
check("and the next click turns the last half into two quarters", /g4@8 a4@4 b4@4/.test(await editorText()), await editorText());
check("no measure was created, ever", (await layout()).measures.length === 2 && /@compases 2/.test(await editorText()), await editorText());

await setCode("// @compases 1\nsilence\n");
await seqClick(32, 0);
check("start again from a whole note", /g4@16/.test(await editorText()), await editorText());
await rightClickHead(0);
await wait(550);
check("right click deletes the note: the measure is a whole rest again", /silence/.test(await editorText()), await editorText());
await seqClick(33, 0);
check("and the next click writes there again (the space is free)", /a4@16/.test(await editorText()), await editorText());

await setCode("// @compases 1\nsilence\n");
await page.getByRole("button", { name: /Negra/ }).click();
for (const step of [32, 33, 34, 35]) await seqClick(step, 0);
check("four quarters in order", /g4@4 a4@4 b4@4 c5@4/.test(await editorText()), await editorText());
await rightClickHead(1);
await wait(550);
check("deleting the second note leaves a hole", /g4@4 ~@4 b4@4 c5@4/.test(await editorText()), await editorText());
await seqClick(31, 0);
check("the next click refills THAT hole, in place, without touching the other notes", /g4@4 f4@4 b4@4 c5@4/.test(await editorText()), await editorText());

check("no VexFlow render errors during the whole run", renderErrors.length === 0, renderErrors.join(" | "));
await page.screenshot({ path: SHOT });
check("no browser dialog was ever shown", dialogs === 0, String(dialogs));
check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL E2E CHECKS PASSED");
process.exit(failed ? 1 : 0);
