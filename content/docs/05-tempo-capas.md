---
title: Tempo, capas y REPL
---
# Tempo, capas y REPL

Over Strudel entiende las funciones del REPL de Strudel, no solo patrones sueltos.

## Tempo

```js
setcpm(35)     // 35 ciclos por minuto = 140 BPM en 4/4 (por defecto: 30 = 120 BPM)
setcps(0.5)    // ciclos por segundo
```

El tempo se muestra en el pie (`♩ = 140 BPM`) y se **conserva** al editar desde la partitura. Un ciclo es un compás de 4/4, así
que `BPM = cpm × 4`.

## Capas con `$:`

Cada línea `$:` es una capa; todas se dibujan juntas.

```js
setcpm(25)
$: note("c4 e4 g4 c5")
$: note("c3 g3").juxFlip(rev)
all(x => x.fast(2))            // se aplica al conjunto
```

| Sintaxis | Significado |
| --- | --- |
| `$: patrón` | Capa anónima |
| `d1:` … `d9:` / `.d1` | Capas con nombre |
| `_nombre: patrón` | Capa silenciada |
| `S$: patrón` | Solo esa capa (solo) |
| `all(f)` | Aplica `f` a todas las capas |
| `each(f)` | Aplica `f` a cada capa por separado |
| `hush()` | Detiene lo definido hasta ese punto |
| `.cpm(n)` | Velocidad de un patrón en ciclos por minuto |

## Funciones que solo afectan al sonido

`pianoroll`, `scope`, `spiral`, `midi`, `osc`, `samples`, sensores de movimiento… se **aceptan** y no rompen la partitura, pero
la notación las ignora. Los sensores valen 0. MIDI y OSC no envían datos reales en esta versión.
