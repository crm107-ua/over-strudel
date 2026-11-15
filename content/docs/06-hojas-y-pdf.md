---
title: Hojas y exportación a PDF
---
# Hojas y exportación a PDF

## Hojas en pantalla

La partitura ocupa todo el panel y se reparte en **hojas** según el tamaño de la ventana (más ancha o más alta = más compases por
hoja). El paginador de la parte inferior muestra:

- **Hoja N de M**, botones primera/anterior/siguiente/última y **números de hoja** para saltar directamente.
- **Compases a–b de T · k por hoja**.
- Si la pieza dura más de lo dibujado, un aviso con **Dibujar todos**.

`Re Pág` / `Av Pág` cambian de hoja y, al reproducir, la hoja avanza sola siguiendo el cursor.

## Exportar a PDF

El botón **Exportar PDF** de la cabecera descarga **toda la partitura** (no solo la hoja visible) en hojas **A4 verticales**:

- **Vectorial**: las notas, claves y números se incrustan como contornos, sin depender de fuentes.
- **Compases justificados**: cada sistema ocupa el ancho completo; los compases reciben ancho proporcional a su densidad (un
  compás con muchas notas tiene más espacio) y un máximo de 4 por sistema. El último sistema no se estira de más.
- **Cabecera y pie**: título (`// @titulo Mi pieza`), tonalidad, tempo y número de compases; pie con `n / N`.
- Siempre en tinta negra sobre blanco, aunque la partitura esté en modo oscuro.

```js
// @titulo Estudio en Sol
// @tonalidad G
setcpm(25)
```
