---
title: Crear con IA
---
# Crear con IA

El botón **Crear con IA** de la cabecera le pide a **Gemini** (Google) que transcriba una pieza clásica a código Strudel, y la
carga en el editor lista para reproducirse y editarse en la partitura.

## Cómo se usa

1. Pulsa **Crear con IA**.
2. Escribe el título en el buscador (o elige una sugerencia: hay unas 60 piezas conocidas, y también acepta texto libre).
3. Elige cuántos **compases** quieres (4–64; por defecto 16) e introduce la **contraseña**.
4. Pulsa **Generar**. Tarda entre uno y tres minutos y muestra el avance.
5. Revisa el resumen (notas, compases, tonalidad, tempo, observaciones de la IA) y pulsa **Cargar en el editor**.
   `Ctrl+Z` devuelve el código que tenías.

La contraseña se pide cada vez; el navegador la recuerda solo mientras la pestaña esté abierta.

## Qué genera

La IA transcribe **el comienzo de la pieza** (su tema principal) con su melodía **y** su acompañamiento, en el formato exacto
que el editor lee y escribe, con la tonalidad y el tempo reales:

```js
// @titulo Para Elisa — Beethoven
// @compases 12
// @tonalidad Am
setcpm(66/4)
stack(
  note(`
    ~@14 e5@1 d#5@1
    e5@1 d#5@1 e5@1 b4@1 d5@1 c5@1 a4@2 ~@1 c4@1 e4@1 a4@1 b4@2 ~@1 e4@1
    ...
  `)
    .slow(12),
  note(`
    ...
  `)
    .slow(12)
)
```

Cada línea es un compás y las duraciones de cada línea suman exactamente 16 semicorcheas. Como el editor solo trabaja en 4/4,
una pieza en otro compás (3/8, 6/8, 12/8…) se escribe con sus duraciones reales y se corta en líneas de 4/4: las barras de
compás originales ya no coinciden con las líneas, y la IA lo avisa en sus observaciones.

## Cómo se garantiza que funcione

Antes de entregar nada, el servidor **comprueba el código** compás a compás: formato, directivas, tonalidad, tempo, que cada
línea sume 16 y que todas las capas tengan el mismo número de compases. Si algo falla, **se le devuelve el error exacto a la IA**
para que lo corrija (hasta tres veces). Nunca se entrega código que el editor no pueda leer. Después, el editor lo evalúa con el
motor real de Strudel como cualquier otro código.

## Límites honestos

- Es una **transcripción de memoria** de un modelo de lenguaje: acierta la estructura y casi siempre la melodía de piezas muy
  conocidas, pero puede equivocarse en notas sueltas, voces internas o pasajes largos. **Escúchala y compárala con la partitura.**
- Solo el comienzo de la pieza, hasta 64 compases, en 4/4; sin tresillos (se aproximan a semicorcheas).
- Necesita que el servidor tenga configurada la clave de Gemini; si no, el botón lo indica.

## Para quien despliega

La clave (`GEMINI_API_KEY`) y la contraseña (`GENERATE_PASSWORD`) viven **solo** en el entorno del servidor (un `.env` junto al
`docker-compose.prod.yml`, fuera de git); el navegador nunca ve la clave. Hay límite de intentos por contraseña incorrecta y un
máximo de generaciones simultáneas. Opcionalmente `GEMINI_MODEL` fija el modelo; por defecto se usa `gemini-3-flash-preview` y,
si no tiene cuota o está saturado, `gemini-2.5-flash`.
