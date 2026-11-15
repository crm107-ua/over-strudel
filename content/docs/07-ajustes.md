---
title: Ajustes y conservar tu código
---
# Ajustes y conservar tu código

El engranaje de la cabecera abre los **Ajustes**. Se guardan en **este navegador** (localStorage): no hace falta cuenta ni
servidor, y siguen ahí cuando vuelves a abrir la aplicación.

## Conservar mi código

Activado por defecto. Cuando el código lo escribiste tú, estas acciones **no lo reescriben**:

| Acción | Qué se toca |
| --- | --- |
| Cambiar la **tonalidad** | Solo la línea `// @tonalidad X` (se añade, cambia o quita). |
| Cambiar la tonalidad con **Transponer** activo | Además se añade `.transpose(n)` al final de la última sentencia (y se fusiona con uno anterior). Antes de aplicarlo, el código se evalúa con el motor real de Strudel y solo se usa si da exactamente la pieza transpuesta; si no, se regenera como antes. |
| **＋ Compás / － Compás** | Solo la línea `// @compases N`. El compás nuevo muestra lo que tu patrón produzca en ese ciclo. |

Lo que **sí** reescribe el código en su forma canónica (`Ctrl+Z` recupera el tuyo):

- Editar notas sueltas en la partitura: poner, mover, borrar, cambiar duración o dinámica.
- El código que ya fue generado desde la partitura (su `.slow(N)` está ligado al número de compases).

Desactiva el ajuste si prefieres que todo cambio desde la partitura regenere el código.
