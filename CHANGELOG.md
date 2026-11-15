# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

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
- Docker Compose + Nginx, PM2 configuration (`ecosystem.config.cjs`), standalone Next.js build.
- Test suite: 119 unit/integration tests with the real Strudel engine (round-trip property tests, store fuzzing) and
  93 end-to-end browser checks.

### Licensing
- Released under AGPL-3.0-or-later, as required by the bundled Strudel packages; the app footer links to the source.
