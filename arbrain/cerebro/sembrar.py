#!/usr/bin/env python3
"""Siembra tu capa de Arbrain desde la semilla, sin pisar nada tuyo.

    python3 arbrain/cerebro/sembrar.py            # siembra lo que falte
    python3 arbrain/cerebro/sembrar.py --revisar  # solo dice qué sembraría

Qué hace (distribución por GitHub, 21 oct 2026):
  - La semilla vive en arbrain/cerebro/semilla/ con la misma forma de carpetas que tu cerebro
    (.claude/memory/, .claude/plan/objetivos.md, .claude/now.md, ...). Viene con Arbrain y cambia con cada versión.
  - Tu memoria, tu plan, tu diario y tus skills propias son TUYOS: el repo del autor nunca los trae (ver CAPAS.json).
  - Este script copia de la semilla a su lugar solo los archivos que no existen. Nunca sobrescribe, nunca borra.
  - Lo que ya sembró queda anotado en .arbrain-sembrado.json (clave «semilla»): si después borras un archivo
    sembrado, no vuelve a aparecer.
Solo usa la biblioteca estándar de Python 3 (macOS, Linux y Windows).
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
SEMILLA = AQUI / "semilla"
MARCA = RAIZ / ".arbrain-sembrado.json"


def leer_marca() -> dict:
    try:
        return json.loads(MARCA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def version() -> str | None:
    try:
        return (RAIZ / "VERSION").read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def main(argv: list[str]) -> int:
    revisar = "--revisar" in argv
    if not SEMILLA.is_dir():
        print(f"No hay semilla en {SEMILLA}: nada que sembrar.")
        return 0
    marca = leer_marca()
    previos = set((marca.get("semilla") or {}).get("archivos") or [])
    sembrados, ya_estaban, borrados_por_ti = [], 0, 0
    for origen in sorted(p for p in SEMILLA.rglob("*") if p.is_file()):
        rel = origen.relative_to(SEMILLA).as_posix()
        destino = RAIZ / rel
        if destino.exists() or destino.is_symlink():
            ya_estaban += 1
            continue
        if rel in previos:
            borrados_por_ti += 1  # lo sembramos antes y lo borraste: se respeta
            continue
        sembrados.append(rel)
        if not revisar:
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origen, destino)
    verbo = "Sembraría" if revisar else "Sembré"
    print(f"{verbo} {len(sembrados)} archivo(s); {ya_estaban} ya estaban (no se tocaron); {borrados_por_ti} los borraste tú (no vuelven).")
    for rel in sembrados:
        print(f"  + {rel}")
    if not revisar and sembrados:
        marca["semilla"] = {"version": version(), "archivos": sorted(previos | set(sembrados))}
        MARCA.write_text(json.dumps(marca, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
