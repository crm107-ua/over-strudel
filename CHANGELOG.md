# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [0.2.0] - 2026-11-15

### Added
- **Full Strudel API.** All 733 function names and synonyms of the reference are available in the score evaluator and in
  the audio engine, verified by tests (every name defined, ~65 reference examples evaluated) and by the browser e2e.
- **REPL semantics in the notation:** `$:` / `d1:` labelled patterns, muted `_x:` and solo `S$:`, `all`, `each`, `hush`,
  `setcps`/`setcpm`, `cpm`. Previously code using them failed to draw.
- **Tempo:** `setcpm` is read, shown in the status bar (♩ = BPM) and preserved when the score is edited.
- Functions missing from the published packages: `stackCenter`, `stackRepeat` (also chainable), `juxFlip`/`juxFlipBy`,
  `isquare`/`isquare2`, `isobite`, `ftranspose`, `setDefaultJoin`, and the aliases `delays`, `distortion`, `datt`, `fme`,
  `bb`, `pwr`, `pws`.
- Audio/visual/device-only functions (`pianoroll`, `scope`, `spiral`, `midi*`, `osc`, motion sensors, `samples`…) are
  accepted and never break the score (installed only where the real implementation is absent).
- **Sounds:** drum machines, Dirt-Samples, EmuSP12, piano, mridangam and the 139 VCSL instruments (`sax`, `harp`, `kalimba`,
  `timpani2`, `xylophone_soft_pp`…) load on first play; the editor autocompletes function and sound names.

## [0.1.1] - 2026-11-15

### Changed
- Sequential entry: you can click **anywhere** in a measure. The note follows the pointer and, on click, glides into its
  structured place (first free point of the measure).
- Clicking a **full** measure now **subdivides its last note** (whole → two halves → half + two quarters …) instead of
  doing nothing; measures are still never created implicitly.

### Fixed
- After deleting a note the following clicks did nothing (the measure was still remembered as "written"); the freed space
  is now refilled in place.
- Deployment: `docker-compose.prod.yml` runs the app in Docker on a VPS — loopback only, non-root user, read-only
  filesystem, no capabilities, memory/process limits, health check — replacing the PM2 process.
- Tests: 209 unit/integration tests and 105 end-to-end checks.

## [0.1.0] - 2026-11-15

First public release.

### Added
- Live notation: Monaco editor → isolated Web Worker (Strudel) → quantised 4/4 sixteenth grid → VexFlow score, with
  hot reload, error banner that keeps the last valid score, and a 1.5 s evaluation timeout.
- Engraving: grand staff, polyphonic voices, chords, ties across barlines, dynamics (`gain`), articulations (`clip`),
  measure numbers, beams, accidentals relative to the key signature.
- Directives `// @compases`, `// @pentagrama`, `// @tonalidad`; key signatures (15 major + 15 minor) with correct
  spelling and optional transposition of the whole piece.
- Bidirectional editing: the score and the code are the same document; edits regenerate canonical Strudel code which is
  re-evaluated to verify it; unlimited undo/redo.
- Sequential entry of notes and rests (measure starts as a whole rest, rests read as subdivisions, full measures accept
  nothing, measures are never created implicitly), free entry, rest mode, input cursor, floating note menu, drag, mouse
  wheel pitch, right-click delete, keyboard map.
- Paginated sheets that fill the panel, pager, page turns during playback.
- Playback through `@strudel/web` with a score cursor, lit-up sounding notes and highlighted code tokens.
- Light and dark score; shadcn/ui (Base UI) component set.
- Docker Compose + Nginx, standalone Next.js build.
- Test suite: unit/integration tests with the real Strudel engine (round-trip property tests, store fuzzing) and
  end-to-end browser checks.

### Licensing
- Released under AGPL-3.0-or-later, as required by the bundled Strudel packages; the app footer links to the source.
