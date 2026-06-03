#!/usr/bin/env python3
"""
build_places.py — regenera data/places.js a partir de un CSV.

El CSV puede ser un archivo local o una URL (ej. el "publicar en la web → CSV"
de Google Sheets). Si no se pasa argumento, busca data/places.csv en el repo.

Uso:
    python scripts/build_places.py
    python scripts/build_places.py data/places.csv
    python scripts/build_places.py --dry-run

Columnas esperadas en el CSV (header en la primera fila):
    place_name, country, image,
    fun_fact,
    distractors_easy, distractors_medium, distractors_hard

A diferencia de Comidas del Mundo, NO hay columna `answer_label`: el texto de
feedback ("<lugar> está en <país>") se arma en app.js a partir de place_name.

`distractors_*` acepta exactamente 2 valores separados por `|`
(con espacios opcionales alrededor).

Columnas ignoradas si están presentes: search_query, notes.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_JS = ROOT / "app.js"
DEFAULT_CSV = ROOT / "data" / "places.csv"
OUT_JS = ROOT / "data" / "places.js"
IMAGES_DIR = ROOT

REQUIRED_COLUMNS = [
    "place_name",
    "country",
    "image",
    "fun_fact",
    "distractors_easy",
    "distractors_medium",
    "distractors_hard",
]
LIST_SPLIT_RE = re.compile(r"\s*\|\s*")


def normalize_country(value: str) -> str:
    """Réplica de normalizeCountry() en app.js: sin tildes, minúsculas, espacios colapsados."""
    s = unicodedata.normalize("NFD", value or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_country_meta_keys(app_js: Path) -> set[str]:
    """Extrae las claves de COUNTRY_META en app.js para validar contra ellas."""
    text = app_js.read_text(encoding="utf-8")
    m = re.search(r"const\s+COUNTRY_META\s*=\s*\{(.*?)\};", text, re.DOTALL)
    if not m:
        raise SystemExit("No encontré COUNTRY_META en app.js")
    block = m.group(1)
    # Extrae las claves: pueden estar entre comillas ("reino unido") o no (japon).
    keys = set()
    for key_match in re.finditer(r'(?:"([^"]+)"|([a-zA-Z_][a-zA-Z_0-9 ]*))\s*:\s*\{', block):
        key = key_match.group(1) or key_match.group(2)
        keys.add(normalize_country(key))
    return keys


def read_csv_source(source: str) -> str:
    """Lee el CSV desde una URL o un path local y devuelve el texto."""
    if source.startswith(("http://", "https://")):
        print(f"GET {source}", file=sys.stderr)
        with urllib.request.urlopen(source, timeout=30) as resp:
            raw = resp.read()
    else:
        raw = Path(source).read_bytes()
    # Sacamos BOM si vino de Sheets/Excel.
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return raw.decode("utf-8")


def split_list(cell: str) -> list[str]:
    if not cell:
        return []
    return [part.strip() for part in LIST_SPLIT_RE.split(cell) if part.strip()]


def parse_rows(csv_text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise SystemExit("CSV vacío o sin header")
    missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise SystemExit(f"Faltan columnas obligatorias: {missing}")
    return [row for row in reader if any((v or "").strip() for v in row.values())]


def validate_row(row: dict, idx: int, country_keys: set[str]) -> tuple[dict | None, list[str]]:
    errors: list[str] = []

    def field(name: str) -> str:
        return (row.get(name) or "").strip()

    place_name = field("place_name")
    country = field("country")
    image = field("image")
    fun_fact = field("fun_fact")

    if not place_name:
        errors.append("place_name vacío")
    if not country:
        errors.append("country vacío")
    elif normalize_country(country) not in country_keys:
        errors.append(
            f"country '{country}' no está en COUNTRY_META — agregalo en app.js o corregí el nombre"
        )
    if not image:
        errors.append("image vacía")
    if not fun_fact:
        errors.append("fun_fact vacío")

    distractors = {}
    for lvl in ("easy", "medium", "hard"):
        col = f"distractors_{lvl}"
        items = split_list(field(col))
        if len(items) != 2:
            errors.append(f"{col} debe tener 2 elementos (encontrados {len(items)})")
        for d in items:
            if normalize_country(d) == normalize_country(country):
                errors.append(f"{col}: '{d}' es igual al país correcto")
        distractors[lvl] = items

    if errors:
        return None, errors

    place = {
        "place_name": place_name,
        "country": country,
        "image": image,
        "fun_fact": fun_fact,
        "distractors": distractors,
    }
    return place, []


def js_string(value: str) -> str:
    """Serializa un string como string literal de JS (compatible con JSON)."""
    return json.dumps(value, ensure_ascii=False)


def emit_places_js(places: list[dict]) -> str:
    lines = [
        "// AUTO-GENERADO desde data/places.csv — NO EDITAR A MANO.",
        "// Para regenerar: `python scripts/build_places.py [csv_path_o_url]`",
        "window.PLACES_DATA = [",
    ]
    for place in places:
        lines.append("  {")
        lines.append(f'    place_name: {js_string(place["place_name"])},')
        lines.append(f'    country: {js_string(place["country"])},')
        lines.append(f'    image: {js_string(place["image"])},')
        lines.append(f'    fun_fact: {js_string(place["fun_fact"])},')
        d = place["distractors"]
        lines.append("    distractors: {")
        for lvl in ("easy", "medium", "hard"):
            items = ", ".join(js_string(x) for x in d[lvl])
            lines.append(f"      {lvl}: [{items}],")
        lines.append("    },")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        nargs="?",
        default=str(DEFAULT_CSV),
        help="Path local o URL del CSV (default: data/places.csv)",
    )
    parser.add_argument("--out", default=str(OUT_JS), help="Path de salida del .js")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Valida e imprime resumen, no escribe nada",
    )
    args = parser.parse_args()

    country_keys = load_country_meta_keys(APP_JS)
    csv_text = read_csv_source(args.source)
    rows = parse_rows(csv_text)

    places: list[dict] = []
    errors: list[str] = []
    warnings: list[str] = []

    for idx, row in enumerate(rows, start=2):  # fila 2 = primera de datos
        place, row_errors = validate_row(row, idx, country_keys)
        if row_errors:
            for e in row_errors:
                errors.append(f"fila {idx} ({(row.get('place_name') or '').strip() or '?'}): {e}")
            continue
        # warnings: imagen faltante
        if place["image"] and not (IMAGES_DIR / place["image"]).exists():
            warnings.append(
                f"fila {idx} ({place['place_name']}): imagen no existe en disco: {place['image']}"
            )
        places.append(place)

    if warnings:
        print(f"⚠ {len(warnings)} warnings:", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)

    if errors:
        print(f"✗ {len(errors)} errores — no se escribió nada:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    js_text = emit_places_js(places)

    if args.dry_run:
        print(f"OK (dry-run): {len(places)} lugares válidos", file=sys.stderr)
        return 0

    out_path = Path(args.out)
    out_path.write_text(js_text, encoding="utf-8")
    print(f"OK: {len(places)} lugares → {out_path}", file=sys.stderr)

    # resumen extra: países usados
    countries_used = sorted({p["country"] for p in places})
    print(f"   países: {len(countries_used)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
