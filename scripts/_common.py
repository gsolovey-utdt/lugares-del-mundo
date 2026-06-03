"""Utilidades compartidas por el pipeline de imágenes."""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

# En Windows la consola suele ser cp1252 y rompe con glyphs Unicode (▶, ✓, «»).
# Forzamos UTF-8 en la salida para todos los scripts del pipeline.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

ROOT = Path(__file__).resolve().parent.parent
SEED_CSV = ROOT / "scripts" / "places_seed.csv"
CANDIDATES_DIR = ROOT / "images" / "_candidates"
PLACES_DIR = ROOT / "images" / "places"
SELECTIONS_JSON = ROOT / "scripts" / "selections.json"
CREDITS_MD = ROOT / "images" / "CREDITS.md"

# Tamaño estándar de las imágenes finales (igual que Comidas del Mundo).
TARGET_W = 960
TARGET_H = 660


def slugify(value: str) -> str:
    """'Coliseo de Roma' -> 'coliseo-de-roma'. Sin tildes, minúsculas, guiones."""
    s = unicodedata.normalize("NFD", value or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
