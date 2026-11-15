---
title: Tiempo y compases
---
# Tiempo y compases

En Strudel todo se mide en **ciclos**. Over Strudel dibuja **cada ciclo como un compás de 4/4**. El código no «sabe» cuántos
compases hay: `note("c4 e4 g4 c5")` dura **un ciclo** y Strudel lo repite sin fin. La aplicación solo *mira* los primeros N
ciclos y dibuja cada uno; por eso ese ejemplo muestra N compases idénticos.

## Cuántos compases se dibujan

Con una directiva en cualquier línea (es un comentario, Strudel lo ignora):

```js
// @compases 8
```

Si no hay directiva, manda el selector **Compases** de la cabecera (1–64). Con directiva, el selector se bloquea y muestra
`@compases 8`.

## La duración real de la pieza

Over Strudel mide cuánto tarda el patrón en repetirse exactamente (hasta 32 compases). Si la pieza es **más larga** que lo que
se dibuja, el paginador lo avisa: *«La pieza completa dura 16 compases (se dibujan 8) — Dibujar todos»*. Un clic ajusta el
número de compases (o la directiva `@compases`).

## Que cada compás sea distinto

Reparte **un elemento por ciclo** con `< >`:

```js
// @compases 4
note("<c4 e4 g4 c5>")          // compás 1: do · 2: mi · 3: sol · 4: do agudo
note("<[c4 e4] [g4 b4]>")      // alterna dos compases distintos
```

También sirven `.slow(2)` (una frase dura 2 compases) y `.every(2, rev)` (transformación cada 2 compases).

## Varias voces

`stack(a, b, c)` toca las capas a la vez. Si se solapan con distinta duración se dibujan como **voces separadas** (plicas
arriba y abajo); notas con el mismo inicio y duración forman un **acorde**.

## Dinámicas y articulaciones

- `.gain(x)`: menor de 0,5 → *p*; hasta 0,85 → *mf*; más → *f* (solo se escribe cuando cambia).
- `.clip(x)`: ≤ 0,5 → *staccato*; > 1 → *tenuto*.

## Cuantización

Strudel usa tiempo continuo; la partitura, una rejilla de **semicorcheas**. Cada evento se redondea a la más cercana. Los
tresillos y las subdivisiones irregulares se aproximan (aún no hay notación de grupos especiales).
