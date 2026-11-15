# Architecture

Over Strudel is a Next.js (App Router) single-page application. Everything runs in the browser; the server only serves
static assets.

## 1. Data flow

```mermaid
flowchart TB
  subgraph UI thread
    Monaco[Monaco editor] --> Store
    Score[ScoreView · VexFlow] --> Store
    Store[(Zustand store<br/>code · doc · score · selection · history)]
    Store --> Score
    Store --> Monaco
  end
  Store -- code, cycles --> Client[strudelClient<br/>ids · timeout · supersede]
  Client -- postMessage --> Worker
  subgraph Web Worker
    Worker[strudelRuntime<br/>evaluate + queryArc]
  end
  Worker -- RawEvent[] --> Store
  Store -- play --> Audio[audioEngine<br/>@strudel/web]
  Audio -- cycle position --> Playhead[rAF playhead]
  Playhead --> Score
  Playhead --> Monaco
```

1. **Code → score.** Monaco text → (debounce 300 ms) → Web Worker evaluates it with the Strudel transpiler and queries the
   first N cycles → raw events (fractional times, value, gain, clip, source offsets) → quantised to sixteenths → `Doc` →
   `buildScore` → VexFlow.
2. **Score → code.** Pointer/keyboard → a pure edit operation on the `Doc` → `generateCode` writes canonical Strudel →
   the store shows the new score immediately and evaluates the new code in the background to **verify** that Strudel
   reproduces exactly the edited document.
3. **Playback.** Audio runs on the main thread (`@strudel/web`, WebAudio does not exist in workers). A single
   `requestAnimationFrame` loop publishes the scheduler's cycle position to the score cursor and the code highlighter
   without going through React state.

## 2. Modules

| Path | Responsibility |
| --- | --- |
| `src/lib/strudelRuntime.ts` | Evaluates Strudel code (core + mini + tonal) and extracts onset events. Shared by the Worker and the tests. |
| `src/workers/strudel.worker.ts`, `src/lib/strudelClient.ts` | Worker entry point; client with request ids, supersede-older-request and a 1.5 s kill-and-recreate timeout (infinite loops cannot freeze the UI). |
| `src/lib/middleware/` | `quantize` (fractions → sixteenths), `pitch`, `dynamics`, `rests` (figure decomposition), `buildScore` (voices, chords, ties, rests, dynamic marks). |
| `src/lib/edit/doc.ts` | The editable document and **all pure edit operations**. |
| `src/lib/edit/codegen.ts` | `Doc` → canonical Strudel code. |
| `src/lib/edit/hit.ts` | Pixel ↔ measure / sixteenth / pitch geometry for pointer editing. |
| `src/lib/edit/shortcuts.ts`, `noteInfo.ts` | Keyboard map (also rendered in the guide); note names and durations. |
| `src/lib/strudelExtras.ts` | Compatibility layer: the REPL semantics the plain evaluator lacks (`$:`, `all`, `each`, `hush`, `setcpm`, `cpm`), functions missing from the published packages (`stackCenter`, `stackRepeat`, `juxFlip`, `isquare`, `isobite`, `setDefaultJoin`…), aliases and pass-through stubs for audio/visual/device-only functions. Used by the Worker and by the audio engine. |
| `src/lib/strudelApi.ts`, `sounds.ts` | The API name list the app guarantees (tested) and the sample banks loaded on first play. |
| `src/lib/keys.ts`, `directives.ts` | Key signatures; `// @…` directives. |
| `src/store/useScore.ts` | Zustand store: document, selection, history, entry state, verification loop. |
| `src/components/` | `ScoreView` (engraving, sheets, pointer interaction), `NotePopover`, `EditToolbar`, `Toolbar`, `Editor`, `ScorePager`, `GuideModal`, … and `ui/` (shadcn/ui). |

## 3. The document

```ts
interface DocEvent { id: number; start: number; dur: number; midi: number; gain?: number; clip?: number }
interface Doc      { measures: number; events: DocEvent[] }
```

- Time is a grid of **16 slots per measure** (sixteenth notes); `start` is absolute. A note crossing a barline stays
  **one** event (it is tied when drawn and stays one attack when played).
- **Rests are never stored.** They are derived from the gaps, so a measure always adds up exactly and "write a rest" is
  simply "silence this range".
- Voices, chords and staves are *derived* (`allocateVoices`, staff by pitch: below C4 → bass when the grand staff is on).
- Invariant: events of a chord (same `start` and `dur`) share one dynamic (`gain`) and one articulation (`clip`) — that is
  all the generated code can express per step. `normalize` enforces it.

### Edit operations (all pure, all tested)

`addNote`, `moveEvents`, `setDuration`, `nudgeDuration`, `transpose`, `transposeAll`, `joinNext`, `deleteEvents`,
`setDynamic`, `setArticulation`, `setAccidental`, `addMeasure`, `removeLastMeasure`, `clearRange`, `entryTarget`,
`fillPointer`. New material overwrites what it overlaps on the same staff unless layered (`Alt`).

## 4. Figures and rests

`rests.ts › decompose(start, length, kind)` turns a span into engraved figures.

- **Notes** may start on any beat (a half note on beat 2 is the normal syncopation); shorter figures stay inside their
  beat. Dotted notes are allowed.
- **Rests** are stricter: only undotted figures, each aligned to its own size (a half rest only on beat 1 or 3, a whole
  rest only at the bar start). The free space of a measure therefore always reads as whole / half / quarter / eighth rests
  *in that order of subdivision* and never as stray eighths: after a quarter note you get *quarter rest + half rest*.

## 5. Canonical code

```js
// @compases 2
// @tonalidad G                          (only when not C major)
note(`
  c4@4 [e4,g4]@4 ~@8                     one line per measure; every step = name@length-in-sixteenths
  c5@16
`)
  .gain(`0.7@4 0.7@4 ~@8 0.95@16`)         same step structure, one value per step
  .slow(2)                               the whole sequence spans N measures = N cycles
```

Weighted steps make every step an exact multiple of 1/16 cycle, so a note can cross barlines and remain a single event.
Overlapping material becomes `stack(note(...), note(...))`. The generator is a pure function and its output is a **fixed
point**: evaluating it and regenerating yields identical text (tested on random documents against the real engine).

## 6. Sequential entry contract

State: `entryMode` (`sequence` | `free`), `noteKind` (`note` | `rest`), `cursor` (absolute sixteenth), `cursorPinned`,
`reach` (how far entry has written per staff and measure), `lastEntered` (ids, used by the view's glide animation).

`entryTarget(doc, cursor, clickedMeasure, staff, grand, wantDur, reach, pinned)` decides where the next element goes. It
works **inside one measure** (the clicked one, or the cursor's for keyboard entry), never leaves it and **never creates
measures** (a measure that does not exist is not a target):

1. **Free space** — the element goes to `firstFree` (the first slot, from `reach` on, that no note covers: right after what is
   written, or the hole left by a deleted note). Its length is cut to the free space, so it never crosses the barline and
   never overwrites what follows.
2. **Full measure** — the **last note** (the group that starts inside the measure and ends at its barline) is subdivided:
   it keeps the largest plain figure strictly shorter than itself (`floorFigure(d - 1)`) and the new element takes the
   rest: whole → 8+8, last half → 4+4, … down to sixteenths. `null` only when nothing can be split (a sixteenth, a rest at
   the end, or a note that started in the previous measure).
3. A cursor moved on purpose (`pinned`, `Alt`+click) writes at that point and overwrites from there.

In rest mode the same targets apply but nothing is added: the range is cleared (`clearRange`), so a subdivided half becomes a
rest. After each entry the default figure shrinks to the longest plain figure that still fits (`floorFigure`).

`reach` exists because rests are not stored: after "note, rest, rest" the measure is complete although it ends in a gap.
It is forgotten by every ordinary edit (`commit` clears it), by hand-edited code, loads and undo/redo — so deleting a note
frees its space — and it drops when a rest subdivides a measure.

**View.** In sequential mode the preview follows the pointer (click anywhere); on click `ScoreView` records where the note
was dropped, `enterAt` writes it, and once the new layout is drawn a copy glides from the click point to the real
position while the real note is hidden (`lastEntered`).

## 7. Key signatures

`keys.ts` models the 15 major and 15 minor keys by their number of fifths. The signature is drawn on every system;
`spell(midi, fifths)` chooses flats in flat keys and sharps otherwise; VexFlow's `Accidental.applyAccidentals` draws
accidentals relative to the signature; a click on a staff line resolves through `applyKeyToNatural`. Changing the key can
also `transposeAll` by the shortest interval between tonics. The key lives in the code as `// @tonalidad`.

## 8. Rendering and sheets

`ScoreView` draws only the measures of the **shown sheet**: sheet size = panel size, so measures per system and systems per
sheet follow from the available width and height. The layout it captures (control points per measure, systems, SVG
elements per note id) is **sparse and indexed by absolute measure**; pointer hit-testing, the playback cursor and the
note menu all read from it. During playback an off-sheet measure turns the page.

VexFlow draws some parts with explicit black strokes; the dark score therefore sets the context ink *and* overrides
`[stroke="black"]` / `#444` in CSS.

## 9. Verification loop and history

Every edit (`commit`) updates the store immediately, records an undo snapshot (`{code, doc, selection}`), regenerates the
code and calls `evaluate(code, expectedDoc)`. The evaluation result is compared (`canonical`, id-free) with the edited
document; a mismatch adopts the evaluation and shows a warning. Mouse-wheel turns share one undo step.

## 10. Testing strategy

| Layer | Tooling | What it guarantees |
| --- | --- | --- |
| Pure operations, geometry, keys, figures | Vitest | Rules and invariants (measures always complete, rests as subdivisions, entry contract). |
| Codegen | Vitest + **real Strudel** | Document → code → engine → document is the identity, for random documents in several keys; code is a fixed point. |
| Store | Vitest + real Strudel + fuzz | After any random action sequence the code on screen reproduces the score. |
| UI | Playwright (`playwright-core`) driving real Chrome | Pointer, keyboard, drag, wheel, undo, pagination, playback, themes, API coverage, PDF, docs. |

Vitest needs the ESM build of `@kabelsalat/web` (Node would pick its IIFE build): see the alias in `vitest.config.mts`.

## 11. Design decisions

- **Rests are derived, not stored** — keeps measures exact by construction and makes note/rest entry the same operation.
- **Canonical code instead of patching the user's AST** — robust and verifiable, at the cost of rewriting hand-written
  code the first time you edit from the staff (undo restores it).
- **Worker for evaluation, main thread for audio** — the UI never blocks, WebAudio stays available.
- **AGPL-3.0-or-later** — Strudel is AGPL, and the application bundles and serves it, so the combined work is AGPL too.
  The footer links to the source for the network-use clause.
