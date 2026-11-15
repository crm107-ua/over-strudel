---
title: Despliegue y licencia
---
# Despliegue y licencia

## Ejecutar en local

```bash
git clone https://github.com/crm107-ua/over-strudel.git
cd over-strudel
npm install
npm run dev          # http://localhost:3000
```

Requisitos: Node.js ≥ 20.9.

## Docker

```bash
docker compose up -d --build                                  # Nginx en el puerto 80 delante de la app
docker compose -f docker-compose.prod.yml up -d --build       # solo la app, en 127.0.0.1:4244 (VPS tras tu Nginx)
```

La variante de producción corre como usuario no root, con sistema de ficheros de solo lectura, sin capacidades de Linux, con
límites de memoria y procesos, *healthcheck* y reinicio automático. La guía completa está en `docs/DEPLOYMENT.md` del repositorio.

## Pruebas

Más de 200 pruebas unitarias y de integración (con el **motor real de Strudel**: documentos aleatorios → código → Strudel →
documento deben coincidir) y un recorrido extremo a extremo en un Chrome real.

## Licencia

**AGPL-3.0-or-later.** Over Strudel incluye Strudel, que es AGPL, así que toda la aplicación se distribuye bajo los mismos
términos. Si ejecutas una versión modificada como servicio de red debes ofrecer su código fuente: el pie de la aplicación enlaza
al repositorio. Las fuentes musicales usadas para el PDF (Bravura, Academico) están bajo la licencia SIL OFL 1.1.

## Limitaciones conocidas

- Solo 4/4. Tresillos y subdivisiones irregulares se aproximan a la rejilla de semicorcheas.
- Los sonidos sin altura (batería) no se notan.
- Editar desde la partitura reescribe el código en forma canónica.
- Un acorde comparte una dinámica y una articulación.
- MIDI, OSC y sensores se aceptan pero no producen datos reales.
