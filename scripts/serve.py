#!/usr/bin/env python3
"""
serve.py — servidor estático MULTI-HILO para desarrollo local.

`python -m http.server` es de un solo hilo y se traba cuando muchas imágenes
cargan a la vez (p. ej. la grilla de scripts/review.html con cientos de fotos).
Este usa ThreadingHTTPServer para atender pedidos en paralelo.

Uso (desde la raíz del proyecto):
    python scripts/serve.py            # puerto 8123
    python scripts/serve.py 9000       # otro puerto
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Sirviendo {ROOT} en http://localhost:{port}  (Ctrl+C para cortar)")
    print(f"  Juego:  http://localhost:{port}/index.html")
    print(f"  Review: http://localhost:{port}/scripts/review.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer detenido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
