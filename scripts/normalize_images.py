#!/usr/bin/env python3
"""
normalize_images.py — recorta y estandariza las fotos elegidas.

Lee scripts/selections.json (slug -> archivo elegido, generado por review.html),
toma cada candidato desde images/_candidates/<slug>/<archivo> y lo recorta de
forma centrada a 960×660 (16:11), JPEG calidad 85, sin metadata, en
images/places/<slug>.jpg.

Uso:
    python scripts/normalize_images.py
    python scripts/normalize_images.py --only machu-picchu
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    CANDIDATES_DIR,
    PLACES_DIR,
    SELECTIONS_JSON,
    TARGET_H,
    TARGET_W,
)


def normalize_one(src_path: Path, dest_path: Path) -> None:
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im)  # respeta orientación
        im = im.convert("RGB")
        # Recorte centrado al aspect ratio destino, luego resize.
        fitted = ImageOps.fit(
            im, (TARGET_W, TARGET_H), method=Image.LANCZOS, centering=(0.5, 0.5)
        )
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        # save sin exif/metadata: armamos una imagen nueva.
        fitted.save(dest_path, format="JPEG", quality=85, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Procesar solo este slug")
    args = parser.parse_args()

    if not SELECTIONS_JSON.exists():
        raise SystemExit(
            f"No existe {SELECTIONS_JSON}. Abrí scripts/review.html, elegí una "
            "foto por lugar y descargá selections.json a scripts/."
        )

    selections = json.loads(SELECTIONS_JSON.read_text(encoding="utf-8"))
    if not isinstance(selections, dict):
        raise SystemExit("selections.json debe ser un objeto { slug: archivo }")

    ok = 0
    errors = 0
    for slug, fname in selections.items():
        if args.only and slug != args.only:
            continue
        src = CANDIDATES_DIR / slug / fname
        if not src.exists():
            print(f"✗ {slug}: no existe {src}", file=sys.stderr)
            errors += 1
            continue
        dest = PLACES_DIR / f"{slug}.jpg"
        try:
            normalize_one(src, dest)
            print(f"✓ {slug} → {dest.relative_to(PLACES_DIR.parent.parent)}")
            ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"✗ {slug}: {exc}", file=sys.stderr)
            errors += 1

    print(f"\nListo: {ok} imágenes normalizadas a {TARGET_W}×{TARGET_H}, {errors} errores.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
