#!/usr/bin/env python3
"""Revisa que la maquina pueda correr la skill: Python, ffmpeg/ffprobe, Pillow, fuente tipografica, claves de API.
Imprime solo NOMBRES de variables (nunca sus valores)."""
from __future__ import annotations

import platform
import shutil
import sys

from _comun import cargar_fuente, correr, variable


def main() -> None:
    ok = True
    print(f"Sistema: {platform.system()} {platform.release()} · Python {sys.version.split()[0]}")
    if sys.version_info < (3, 9):
        print("  FALTA: Python 3.9 o superior")
        ok = False
    for exe in ("ffmpeg", "ffprobe"):
        ruta = shutil.which(exe)
        print(f"  {exe}: {ruta or 'NO ENCONTRADO'}")
        ok &= bool(ruta)
    if shutil.which("ffmpeg"):
        r = correr(["ffmpeg", "-hide_banner", "-encoders"])
        for cod in ("libx264", "aac", "libmp3lame"):
            hay = cod.encode() in r.stdout
            print(f"  codec {cod}: {'si' if hay else 'NO (hace falta un ffmpeg completo)'}")
            ok &= hay or cod == "libmp3lame"
    try:
        import PIL

        print(f"  Pillow {PIL.__version__}: si")
    except ImportError:
        print("  Pillow: NO. Instala con: python3 -m pip install pillow")
        ok = False
    f = cargar_fuente(None, 40)
    print(f"  tipografia para subtitulos: {getattr(f, 'path', 'predeterminada de Pillow')}")
    claves = [k for k in ("GROQ_API_KEY", "OPENAI_API_KEY", "LEMONFOX_API_KEY") if variable(k)]
    print(f"  claves de transcripcion encontradas: {', '.join(claves) or 'ninguna (usa --palabras o faster-whisper local)'}")
    print("LISTO" if ok else "Hay carencias arriba.")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
