#!/usr/bin/env python3
"""
build_credits.py — arma images/CREDITS.md con la atribución de Pexels.

Para cada lugar elegido en scripts/selections.json, busca los metadatos en
images/_candidates/<slug>/candidates.json y escribe una entrada con autor,
link a la foto en Pexels y la licencia.

Uso:
    python scripts/build_credits.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import CANDIDATES_DIR, CREDITS_MD, SELECTIONS_JSON  # noqa: E402


def main() -> int:
    if not SELECTIONS_JSON.exists():
        raise SystemExit(f"No existe {SELECTIONS_JSON}.")

    selections = json.loads(SELECTIONS_JSON.read_text(encoding="utf-8"))

    lines = [
        "# Créditos de imágenes",
        "",
        "Todas las fotos provienen de [Pexels](https://www.pexels.com/) y se usan",
        "bajo la [Licencia de Pexels](https://www.pexels.com/license/) "
        "(uso gratuito, sin atribución obligatoria; la incluimos igual).",
        "",
        "| Lugar | Foto | Autor/a |",
        "|-------|------|---------|",
    ]

    missing = []
    for slug in sorted(selections):
        fname = selections[slug]
        cand_json = CANDIDATES_DIR / slug / "candidates.json"
        entry = None
        if cand_json.exists():
            for m in json.loads(cand_json.read_text(encoding="utf-8")):
                if m.get("file") == fname:
                    entry = m
                    break
        if not entry:
            missing.append(slug)
            lines.append(f"| {slug} | `{fname}` | (metadatos no encontrados) |")
            continue

        place = entry.get("place_name") or slug
        photo_url = entry.get("pexels_url") or ""
        author = entry.get("photographer") or "—"
        author_url = entry.get("photographer_url") or ""
        photo_link = f"[ver en Pexels]({photo_url})" if photo_url else "—"
        author_cell = f"[{author}]({author_url})" if author_url else author
        lines.append(f"| {place} | {photo_link} | {author_cell} |")

    lines.append("")
    CREDITS_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(selections)} créditos → {CREDITS_MD}")
    if missing:
        print(f"⚠ sin metadatos: {', '.join(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
