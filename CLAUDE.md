# CLAUDE.md — Lugares del Mundo

## Comunicación
- Referirse al usuario como **Guillermo**.

## Qué es
Web app educativa y gamificada para chicos/as. Se muestra un **lugar famoso**
(foto + nombre) y el jugador adivina **de qué país es**, entre 3 opciones.
Proyecto hermano de **Comidas del Mundo**
(`..\comidas-del-mundo`), del que clona casi toda la arquitectura.

App 100% estática (sin build/bundler), vanilla JS. Se despliega en GitHub Pages.

## Arquitectura (clon de Comidas del Mundo)
- `app.js`: IIFE con toda la lógica. Consume `window.PLACES_DATA`. Contiene
  `COUNTRY_META` (no tocar; idéntico a comidas), 4 niveles
  (`LEVEL_ORDER`/`LEVELS`, Relámpago = 3000 ms), 5 vidas, comodín, mapa de
  feedback con jsvectormap, carrusel final de 5 páginas, sugerencias.
- `index.html`: 6 pantallas. Carga vendor/jsvectormap, `data/places.js`,
  Supabase + Twemoji (CDN), `app.js`.
- `styles.css`: igual a comidas (mismas clases, incluidas `.food-*`/`.foods-grid`
  que se reusan tal cual como hooks de CSS; no son visibles al usuario).
- `vendor/jsvectormap/`: vendorizado, no se toca.

### Diferencias con comidas (decididas con Guillermo, 2026-06-03)
- `FOODS_DATA`→`PLACES_DATA`, `food_name`→`place_name`.
- **Sin columna `answer_label`**: el texto de feedback ("<lugar> está en <país>")
  se arma en `app.js` desde `place_name`.
- Tablas Supabase con prefijo `ldm_` (mismo proyecto que comidas, fire-and-forget).
- Comodín: tipo `place_from_description` en vez de `food_from_description`.

## Datos e imágenes
- Fuente de verdad: `data/places.csv` → `python scripts/build_places.py` →
  `data/places.js`. El builder valida países contra `COUNTRY_META`.
- Dataset: 31 países principales × 3 lugares = 93 cartas. Siempre monumentos
  antiguos / naturales / sin problema de libertad de panorama.
- Imágenes vía Pexels (`PEXELS_API_KEY` en entorno, NUNCA commiteada), curación
  semi-automática, normalizadas a 960×660 JPEG q85. Ver README para el pipeline.

## Estado actual (2026-06-03)
- FASE 1 ✅ `scripts/places_seed.csv` (93 lugares + fun_facts borrador; Guillermo
  revisará los fun_facts más adelante).
- FASE 2 ✅ scaffold completo (index.html, app.js adaptado, styles, manifest, sw,
  build_places.py, supabase/schema.sql, README). `data/places.js` es un stub
  vacío hasta tener imágenes y distractores.
- Pendiente: FASE 3 imágenes (necesita PEXELS_API_KEY), FASE 4 distractores +
  build, FASE 5 deploy a GitHub Pages.

## Notas
- No existe `CNAME` todavía (sin dominio propio definido). En GitHub Pages
  andará en `gsolovey-utdt.github.io/lugares-del-mundo/`. Agregar `CNAME` si
  Guillermo define un dominio.
- Las imágenes del carrusel de inicio en `index.html` apuntan a slugs que
  recién existirán tras FASE 3 (machu-picchu, coliseo-de-roma, taj-mahal).
