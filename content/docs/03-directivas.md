---
title: Directivas y tonalidad
---
# Directivas y tonalidad

Las directivas son comentarios `//` con una `@` que le dicen a la **notación** cómo dibujar. Strudel las ignora.

| Directiva | Efecto |
| --- | --- |
| `// @compases N` | Número de compases a dibujar (1–64). Sobrescribe el selector. |
| `// @pentagrama auto` | (Por defecto) Segundo pentagrama solo si alguna nota está por debajo de Do central (C4). |
| `// @pentagrama piano` | Fuerza siempre los dos pentagramas (Sol + Fa) con llave. |
| `// @pentagrama sol` | Fuerza un único pentagrama (las notas graves usan líneas adicionales). |
| `// @tonalidad X` | Armadura: `C G D A E B F# C# F Bb Eb Ab Db Gb Cb`, y menores con `m` (`Am`, `F#m`…). |
| `// @titulo Mi pieza` | Título que aparece al exportar a PDF. |

## Por qué a veces salen dos pentagramas

Es el **pentagrama doble** del piano: arriba clave de Sol, abajo clave de Fa. Aparece solo cuando hay notas por debajo del
Do central. Los dos pentagramas son **el mismo compás** a la vez, no dos compases.

## Tonalidad

Elígela en la barra de edición o con la directiva. La armadura se dibuja en **todos los sistemas** y las notas se escriben con
su ortografía correcta (Si♭ en Fa mayor, La♯ en Sol mayor…). Con el interruptor **Transponer** activo, cambiar de tonalidad
transpone **toda la obra** a la nueva tónica (por el camino más corto); desactivado, solo cambia la armadura.

```js
// @tonalidad G       // Sol mayor
// @tonalidad Bb      // Si♭ mayor
// @tonalidad F#m     // Fa♯ menor
```
