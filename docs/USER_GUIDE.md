# User guide

This guide explains how Over Strudel turns Strudel code into a score, how to write music directly on the staff, and every
shortcut. (The same content is available inside the app under **Guía del lenguaje**, in Spanish.)

## 1. Time: one cycle = one measure

Strudel measures time in **cycles**. Over Strudel engraves **each cycle as a 4/4 measure**. The code does not "know" how
many measures there are: a phrase such as `note("c4 e4 g4 c5")` lasts one cycle and Strudel repeats it forever. The app
only *looks at* the first N cycles and draws each of them, which is why that example produces N identical measures.

To get a piece that changes from measure to measure, give one element per cycle with `< >`:

```js
// @compases 4
note("<c4 e4 g4 c5>")             // measure 1: C · 2: E · 3: G · 4: high C
note("<[c4 e4] [g4 b4]>")         // two alternating measures
```

`.slow(2)` makes a phrase last two measures; `.every(2, rev)` applies a transformation every second measure.

## 2. Directives

Directives are ordinary `//` comments (Strudel ignores them) that tell the *notation* how to draw. They can be on any line.

| Directive | Values | Meaning |
| --- | --- | --- |
| `// @compases N` | `1`–`64` | Number of measures. When present, the *Compases* field is locked and shows `@compases N`. |
| `// @pentagrama` | `auto` (default), `piano`, `sol` | `auto`: a second (bass) staff appears only if some note is below middle C (C4). `piano`: always two staves. `sol`: always one staff (low notes use ledger lines). |
| `// @tonalidad` | `C G D A E B F# C# F Bb Eb Ab Db Gb Cb`, minor with `m` | Key signature, drawn on every system. |

English aliases also work: `@measures`, `@staff`, `@key`.

### Why two staves?

It is the **grand staff** (like a piano): treble clef on top, bass clef below, joined by a brace. Both staves are the
*same* measure at the same time. Notes below middle C go to the bass staff, the rest stay in the treble staff.

### Several voices at once

`stack(a, b, c)` plays layers together. Notes that start and end together form a chord; overlapping material with
different lengths becomes separate **voices** (stems up and down).

## 3. Quantisation, dynamics, articulation

- Every event is rounded to the nearest **sixteenth note**. Triplets and irregular subdivisions are approximated (there is
  no tuplet notation yet).
- `gain` → dynamics: below 0.5 is *p*, up to 0.85 is *mf*, higher is *f*. A dynamic is printed only where it changes.
- `clip` → articulation: ≤ 0.5 is staccato, > 1 is tenuto.

## 4. Key signature

Choose the key in the toolbar (or write the directive). The signature appears on every system, accidentals are drawn
relative to it, and notes are spelled correctly (B♭ in F major, A♯ in G major).

- With **Transponder** on, changing the key transposes the *whole piece* to the new tonic (by the shortest way).
- With it off, only the signature and spelling change; the notes sound the same.
- Clicking the F line in G major writes F♯ unless you pick ♭ ♮ ♯ explicitly.

## 5. Writing on the staff

The score and the code are **the same document**. Whatever you do on the staff, the code is regenerated and re-evaluated.
Rests are never stored — they are derived — so measures always add up exactly.

The generated code always has this shape (each step carries its length in sixteenths after `@`):

```js
// @compases 2
note(`
  c4@4 [e4,g4]@4 ~@8
  c5@16
`)
  .gain(`0.7@4 0.7@4 ~@8 0.95@16`)
  .slow(2)
```

### Sequential entry (default)

- Every measure starts as a **whole-note rest**.
- A click writes the **next** element in the measure you click, right after what is already there. The horizontal
  position of the click does not matter; it only selects the pitch (and the measure you work in). The violet line and the
  card next to the pointer show exactly where it will go.
- The duration comes from the toolbar (`1`–`5`, `.`). It never crosses the barline: it is cut to what is left, and
  figures that no longer fit are disabled. The default figure shrinks to what remains in the measure.
- The free part of the measure is always written with the subdivision you would expect — after a quarter note you get a
  quarter rest and a half rest — never with stray eighth rests or dotted rests.
- **A full measure accepts nothing** (the card says *Compás lleno*) and **measures are never created automatically**.
  Use **＋ Compás** (toolbar or the block at the end of the score).
- `Alt`+click places the input cursor where you click inside that measure; from there you **overwrite**. The ⏮ ⏭ buttons
  move it to the start or to the end of what is written.
- **Rest mode** works exactly like note mode but writes rests (replacing whatever is there). Switch between **Nota** and
  **Silencio** at any moment with the buttons or `R`; both mix freely in the same measure. `Enter` writes at the cursor
  without the mouse (a rest in rest mode, otherwise the last pitch).

### Free entry

Notes are placed where you click, snapped to the sixteenth grid. Drag to the right to draw a longer note. A note that
starts on the same beat with the same length joins the chord; a new note overwrites what it covers on that staff
(`Alt`+click puts it in another voice instead).

### Editing existing notes

Click a note to select it; a small menu appears next to it (pitch, duration, accidental, dynamic, articulation, delete).
Drag to move it, use the **mouse wheel** over it to change its pitch (`Shift` = octave), right-click to delete.

## 6. Sheets

The score fills the whole panel and is split into **sheets** according to the window size. Use the pager at the bottom or
`PageUp` / `PageDown` / `Home` / `End`. While playing, the sheet turns by itself to follow the cursor.

## 7. Keyboard map

The score pane must have focus (click on it).

| Keys | Action |
| --- | --- |
| `1` `2` `3` `4` `5` | Duration: sixteenth · eighth · quarter · half · whole |
| `.` | Dot (×1.5) |
| `↑` `↓` / `Shift`+`↑` `↓` | Selected note up/down a semitone / an octave |
| `←` `→` / `Shift`+`←` `→` | Move by a sixteenth / a beat |
| `+` `-` | Lengthen / shorten by a sixteenth |
| `J` | Join with the next note of the same pitch |
| `S` `T` | Staccato · tenuto (toggle) |
| `P` `M` `F` `0` | Dynamic *p* · *mf* · *f* · remove |
| `Del` / `Backspace` | Delete (the space becomes a rest) |
| `R` | Switch between note mode and rest mode |
| `Enter` | Write at the cursor |
| `Tab` / `Shift`+`Tab` | Next / previous note |
| `Ctrl`+`A` · `Esc` | Select all · clear selection |
| `Ctrl`+`D` | Duplicate the selection right after itself |
| `Ctrl`+`Z` / `Ctrl`+`Y` | Undo / redo (also restores hand-written code) |
| `Space` | Play / stop |
| `PageUp` `PageDown` `Home` `End` | Previous / next / first / last sheet |
| `Ctrl`/`⌘`+`Enter` *(in the code editor)* | Evaluate now and update the audio |

Mouse: click, `Alt`+click, `Shift`+click (add to selection), drag a note, right-click a note, wheel over a note.

## 8. Undo and hand-written code

Editing from the staff regenerates the code in its canonical form, so hand-written constructs such as `every()` are not
preserved. **Undo brings the original code back.** A chord shares a single dynamic and articulation.
