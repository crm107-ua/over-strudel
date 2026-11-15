---
title: Introducción
---
# Introducción

**Over Strudel** es un entorno de *live coding* en el navegador: escribes un patrón de [Strudel](https://strudel.cc) y la
partitura se dibuja al instante a la derecha. Lo importante es que la relación es **bidireccional**: si pones o mueves notas
en la partitura, el código se reescribe solo, y siempre suena exactamente lo que ves.

## Qué hace

- **Código → partitura.** Un editor Monaco a la izquierda; cada cambio se evalúa en un Web Worker aislado y se engrava con VexFlow.
- **Partitura → código.** Clic, arrastrar, rueda del ratón, teclado: cada edición genera código Strudel canónico y lo verifica.
- **Reproducción.** Un cursor recorre la partitura y se iluminan las notas y los trozos de código que suenan.
- **Exportación.** Toda la obra a **PDF en hojas A4** con compases justificados.
- **Toda la API de Strudel.** Más de 700 nombres de función aceptados, bancos de sonidos y tempo con `setcpm`.

## Cómo está organizada la pantalla

| Zona | Qué contiene |
| --- | --- |
| Cabecera | Logo, selector de **ejemplo**, número de **compases**, **Exportar PDF**, guía y esta documentación, y el botón **Reproducir** (único). |
| Izquierda | Editor de código Strudel con autocompletado de funciones y de nombres de sonido. |
| Derecha | La partitura: barra de edición (modo, nota/silencio, duración, tonalidad, deshacer), hojas y paginador. |
| Pie | Estado de la evaluación, compases, tempo (`♩ = BPM`) y enlace al código fuente (AGPL-3.0). |

## Una idea clave

> **1 ciclo de Strudel = 1 compás de 4/4.**

El resto de la documentación parte de ahí: véase *Tiempo y compases*.
