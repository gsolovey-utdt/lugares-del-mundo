#!/usr/bin/env python3
"""
fetch_images.py — baja candidatos de imágenes de Pexels para cada lugar.

Lee scripts/places_seed.csv (columnas: place_name, country, search_query, ...),
y por cada lugar baja hasta N fotos a images/_candidates/<slug>/, junto con un
<slug>/candidates.json que guarda autor / URL / licencia de cada foto (para
después armar images/CREDITS.md).

Requiere la API key de Pexels en la variable de entorno PEXELS_API_KEY
(NUNCA se commitea). Conseguila gratis en https://www.pexels.com/api/

Uso:
    set PEXELS_API_KEY=...        (Windows cmd)   /   $env:PEXELS_API_KEY="..." (PowerShell)
    python scripts/fetch_images.py
    python scripts/fetch_images.py --per-place 5
    python scripts/fetch_images.py --only machu-picchu --force

Cache: si una carpeta de candidatos ya tiene imágenes, se saltea (salvo --force).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import CANDIDATES_DIR, SEED_CSV, slugify  # noqa: E402

PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
# Tamaño que descargamos como candidato (lo recorta normalize_images.py).
PREFERRED_SRC = ("large2x", "large", "original", "landscape")
PAUSE_SECONDS = 0.6  # cortesía con el rate limit (200 req/hora en el plan free)


def get_api_key() -> str:
    key = os.environ.get("PEXELS_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "Falta PEXELS_API_KEY en el entorno.\n"
            '  PowerShell:  $env:PEXELS_API_KEY="tu_key"\n'
            "  cmd:         set PEXELS_API_KEY=tu_key"
        )
    return key


def read_seed() -> list[dict]:
    raw = SEED_CSV.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    reader = csv.DictReader(raw.decode("utf-8").splitlines())
    return [r for r in reader if (r.get("place_name") or "").strip()]


def search_pexels(session: requests.Session, query: str, per_page: int) -> list[dict]:
    params = {"query": query, "per_page": per_page, "orientation": "landscape"}
    resp = session.get(PEXELS_SEARCH_URL, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"    ✗ Pexels HTTP {resp.status_code}: {resp.text[:160]}", file=sys.stderr)
        return []
    return resp.json().get("photos", [])


def pick_src(photo: dict) -> tuple[str, str]:
    """Devuelve (size_name, url) según preferencia."""
    src = photo.get("src", {})
    for name in PREFERRED_SRC:
        if src.get(name):
            return name, src[name]
    # último recurso: cualquier src
    for name, url in src.items():
        if url:
            return name, url
    return "", ""


def download(session: requests.Session, url: str, dest: Path) -> bool:
    try:
        resp = session.get(url, timeout=60)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    ✗ download error: {exc}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-place", type=int, default=5, help="Candidatos por lugar (default 5)")
    parser.add_argument("--only", help="Procesar solo este slug (ej. machu-picchu)")
    parser.add_argument("--force", action="store_true", help="Rebajar aunque ya existan candidatos")
    args = parser.parse_args()

    key = get_api_key()
    rows = read_seed()
    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"Authorization": key, "User-Agent": "lugares-del-mundo/1.0"})

    done = 0
    skipped = 0
    for row in rows:
        place_name = row["place_name"].strip()
        country = (row.get("country") or "").strip()
        query = (row.get("search_query") or place_name).strip()
        slug = slugify(place_name)

        if args.only and slug != args.only:
            continue

        out_dir = CANDIDATES_DIR / slug
        existing = list(out_dir.glob("*.jpg")) if out_dir.exists() else []
        if existing and not args.force:
            skipped += 1
            print(f"• {slug}: ya tiene {len(existing)} candidatos (skip)")
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"▶ {slug}  «{query}»")
        photos = search_pexels(session, query, args.per_place)
        time.sleep(PAUSE_SECONDS)

        meta = []
        for i, photo in enumerate(photos[: args.per_place], start=1):
            size_name, url = pick_src(photo)
            if not url:
                continue
            fname = f"{slug}-{i}.jpg"
            if download(session, url, out_dir / fname):
                meta.append(
                    {
                        "file": fname,
                        "place_name": place_name,
                        "country": country,
                        "query": query,
                        "pexels_id": photo.get("id"),
                        "pexels_url": photo.get("url"),
                        "photographer": photo.get("photographer"),
                        "photographer_url": photo.get("photographer_url"),
                        "alt": photo.get("alt"),
                        "src_size": size_name,
                        "src_url": url,
                        "license": "Pexels License (https://www.pexels.com/license/)",
                    }
                )
                print(f"    ✓ {fname}  por {photo.get('photographer')}")

        (out_dir / "candidates.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if not meta:
            print(f"    ⚠ sin resultados para «{query}»", file=sys.stderr)
        done += 1

    # Índice para review.html: lista de lugares con candidatos en disco.
    index = []
    for row in rows:
        slug = slugify(row["place_name"].strip())
        cdir = CANDIDATES_DIR / slug
        cand = sorted(p.name for p in cdir.glob("*.jpg")) if cdir.exists() else []
        if cand:
            index.append(
                {
                    "slug": slug,
                    "place_name": row["place_name"].strip(),
                    "country": (row.get("country") or "").strip(),
                    "candidates": cand,
                }
            )
    (CANDIDATES_DIR / "_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\nListo: {done} lugares procesados, {skipped} salteados (ya tenían fotos).")
    print(f"Candidatos en: {CANDIDATES_DIR}")
    print("Ahora abrí scripts/review.html para elegir una foto por lugar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
