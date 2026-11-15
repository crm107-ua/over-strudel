---
title: Importar partituras
---
# Importar partituras

El botón **Importar** de la cabecera convierte una partitura existente en **código Strudel** y la carga en el editor. Acepta:

| Formato | Cómo se lee | Precisión |
| --- | --- | --- |
| **MusicXML** (`.musicxml`, `.xml`) y **MXL** (`.mxl`) | Directamente en tu navegador | Exacta: es la partitura ya codificada (MuseScore, Finale, Sibelius, Dorico, LilyPond… la exportan). |
| **PDF** | Reconocimiento óptico de música con **Audiveris** en el servidor | Depende del PDF: muy alta en partituras limpias grabadas por ordenador; menor en escaneos y fotos. |

El PDF no se guarda: se procesa y se descarta. El reconocimiento tarda entre 30 y 90 segundos y muestra el progreso.

## Qué se importa

- **Notas** con su altura exacta, duración y posición, acordes, varias voces y varias partes (se fusionan en una partitura).
- **Ligaduras de unión**: una nota ligada es *una* nota, también a través de la barra de compás.
- **Armadura** (`// @tonalidad`), **tempo** (`setcpm`) y **título** (`// @titulo`).
- **Dinámicas** (*pp, p, mp, mf, f, ff…*) como `gain`, y **staccato / tenuto** como `clip`.
- **Anacrusa**: las notas se colocan al final del primer compás para que el tiempo fuerte caiga en la barra.
- **Repeticiones** y **casillas 1ª / 2ª**: se desenrollan (opción).
- **Partes transpositoras**: se importa la altura real.

## Qué se aproxima o se omite (el informe lo dice)

- El editor trabaja en **4/4**: los compases de otro tipo (3/4, 6/8…) se colocan en compases de 4/4 (con silencio al final si son más cortos; los más largos ocupan varios).
- **Tresillos y grupos especiales** se aproximan a la rejilla de semicorcheas.
- **Notas de adorno**, percusión sin altura y microtonos (se redondean).
- **Cambios de tempo y de tonalidad**: se conservan el tempo y la armadura iniciales (las notas suenan bien).
- **Saltos** (D.C., D.S., coda): no se desenrollan.
- Hasta **64 compases**: si la pieza es más larga, eliges desde qué compás importar.

## Después de importar

La partitura queda cargada y editable como cualquier otra. `Ctrl+Z` devuelve el código que tenías antes. Al ser código generado
desde la partitura, las ediciones posteriores siguen la forma canónica.

> **Revisa siempre un PDF reconocido.** Lo que más falla en el reconocimiento óptico son las ligaduras de unión, los tresillos y
> los símbolos poco habituales. Si tienes el MusicXML, úsalo: es exacto.

## Para quien despliega

El reconocimiento corre en un contenedor aparte (`omr`, ver `docs/DEPLOYMENT.md`): sin puertos publicados, en una red interna sin
salida a internet, sin privilegios y con límites de memoria. Sin él, el botón sigue aceptando MusicXML y MXL.
