---
title: Escribir en el pentagrama
---
# Escribir en el pentagrama

La partitura y el código son **el mismo documento**. Si pones notas en la partitura, se regenera el código y suena lo que ves.
Los compases siempre cuadran: los silencios se calculan solos.

## Dos modos de entrada

| | **Secuencial** (por defecto) | **Libre** |
| --- | --- | --- |
| Clic | En cualquier punto del compás: la nota se coloca sola en el primer hueco libre; en un compás **lleno** subdivide la última nota | La nota se coloca donde haces clic |
| Duración | De la barra (`1`–`5`, `.`); nunca cruza la barra de compás | Igual, o arrastra en horizontal para dibujarla |
| Silencios | **Modo Silencio** escribe silencios igual que notas (`R` alterna) | Clic en modo silencio |
| Cursor | `Alt`+clic lo mueve (y entonces sobrescribe desde ahí) | — |

## Escribir en secuencia

Cada compás empieza como una **redonda de silencio**. De tu clic solo cuenta la **altura** (y el compás); la nota aparece donde
apuntas y al hacer clic se **desliza a su sitio estructurado**.

- **Se escribe en orden:** cada clic ocupa el primer hueco libre, a continuación de lo escrito.
- **Compás lleno → subdivide:** redonda → dos blancas → blanca + dos negras → … hasta semicorcheas. Nunca se crean compases solos: se añaden con **＋ Compás**.
- **Borrar libera el espacio:** si quitas una nota, los siguientes clics rellenan ese hueco sin tocar el resto.
- **Lo libre** se escribe como silencios de la subdivisión que toca (tras una negra: negra + blanca), nunca corcheas sueltas.

## Editar notas

- **Seleccionar:** clic en la nota; aparece un mini-menú con altura, duración, alteración, dinámica y articulación.
- **Cambiar altura:** rueda del ratón sobre la nota, o `↑` / `↓`.
- **Mover:** arrastrar.
- **Quitar:** clic derecho, `Supr` o el ✕ del mini-menú.
- **Acordes:** dos notas con el mismo inicio y duración se funden en un acorde. Con `Alt`+clic se superponen en otra voz.
- **Deshacer / rehacer:** `Ctrl+Z` / `Ctrl+Y` (también recupera el código escrito a mano).

## El código que se genera

```js
// @compases 2
note(`
  c4@4 [e4,g4]@4 ~@8
  c5@16
`)
  .gain(`0.7@4 0.7@4 ~@8 0.95@16`)
  .slow(2)
```

Cada paso lleva su duración en semicorcheas tras la `@`. El código generado es un **punto fijo**: evaluarlo y regenerarlo
produce el mismo texto. Se conservan el tempo (`setcpm`) y las directivas.

> **Limitación:** al editar desde la partitura el código se reescribe en esta forma canónica (no conserva `every()`, funciones,
> `$:`…). `Ctrl+Z` lo restaura.

## Atajos de teclado

(con la partitura enfocada)

{{SHORTCUTS}}

Globales: `Ctrl/⌘ + Enter` evalúa y actualiza el audio; `Re Pág` / `Av Pág` e `Inicio` / `Fin` cambian de hoja.
