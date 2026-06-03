# Lugares del Mundo 🌍

Web app educativa y gamificada para chicos/as: se muestra un **lugar famoso**
(foto + nombre) y hay que adivinar **de qué país es**, entre 3 opciones.
Proyecto hermano de [Comidas del Mundo](../comidas-del-mundo), con la misma
mecánica.

100% estática (sin build ni bundler). Se despliega en GitHub Pages.

## Cómo correr local

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

## Mecánica

- 4 niveles: **Fácil, Intermedio, Difícil, Relámpago** (⚡ 3 s por pregunta).
- 10 rondas por nivel, 5 vidas, puntaje, comodín para ganar vidas.
- Feedback con dato curioso + mapa mundial que resalta el país correcto
  (jsvectormap, vendorizado en `vendor/`).
- Colección final de lo aprendido, mapa de países visitados y página de
  sugerencias.

## Dataset

30+ países (los principales de `COUNTRY_META` en `app.js`) × 3 lugares icónicos
= ~93 cartas. Se eligen monumentos antiguos / naturales / sin problemas de
libertad de panorama.

Fuente de verdad: `data/places.csv` →
`python scripts/build_places.py` → `data/places.js` (`window.PLACES_DATA`).

## Pipeline de imágenes (Pexels)

Las imágenes se curan semi-automáticamente. Requiere `PEXELS_API_KEY` en una
variable de entorno (nunca se commitea).

```bash
export PEXELS_API_KEY=...            # tu key de Pexels
python scripts/fetch_images.py        # baja 4-5 candidatos por lugar a images/_candidates/
# abrir scripts/review.html y elegir uno por lugar (genera scripts/selections.json)
python scripts/normalize_images.py    # recorta a 960×660 JPEG q85 → images/places/
python scripts/build_credits.py       # arma images/CREDITS.md con atribución Pexels
python scripts/build_places.py        # data/places.csv → data/places.js
```

Estandarización de imágenes: 960×660 (16:11), JPEG calidad ~85, sin metadata.

## Scripts

| Script | Qué hace |
|--------|----------|
| `scripts/places_seed.csv` | Semilla: `place_name, country, search_query, fun_fact` |
| `scripts/fetch_images.py` | Baja candidatos de Pexels + un `.json` de licencia por foto |
| `scripts/review.html` | Grilla local para elegir una foto por lugar |
| `scripts/normalize_images.py` | Pillow: recorte centrado a 960×660 |
| `scripts/build_credits.py` | Junta los `.json` → `images/CREDITS.md` |
| `scripts/build_places.py` | `places.csv` → `data/places.js`, valida países contra `COUNTRY_META` |

## Analytics (Supabase, opcional)

Logueo fire-and-forget de sesiones, respuestas, textos finales y sugerencias en
tablas `ldm_*` (ver `supabase/schema.sql`). Si Supabase no está disponible, el
juego funciona igual.
