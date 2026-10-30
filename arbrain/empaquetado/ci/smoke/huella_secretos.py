#!/usr/bin/env python3
"""¿Quedó alguna llave en texto plano en disco? (smoke-instaladores.yml, 13 oct 2026)

    python -I huella_secretos.py --desde <epoch> --salida <json> <carpeta> [<carpeta> ...]

Busca los canarios (`RECORRIDO_CANARIO_ANTHROPIC`, `RECORRIDO_CANARIO_OPENROUTER`, por entorno; nunca por argumento)
en UTF-8 y UTF-16LE dentro de todo archivo modificado desde `--desde` en las carpetas dadas. También avisa de
archivos de secretos del contrato v1 que ya no deben existir (`daemon-token`, `desktop-secret`). Escribe solo rutas
y la huella sha256 del canario, nunca el valor. Sale 1 si encuentra algo.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

MAX = 300 * 1024 * 1024
VIEJOS = {"daemon-token", "desktop-secret"}


def main():
    for flujo in (sys.stdout, sys.stderr):  # consola cp1252 del runner de Windows
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=float, required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("carpetas", nargs="+")
    a = ap.parse_args()
    canarios = {k: os.environ.get(k, "") for k in ("RECORRIDO_CANARIO_ANTHROPIC", "RECORRIDO_CANARIO_OPENROUTER")}
    canarios = {k: v for k, v in canarios.items() if v}
    if not canarios:
        print("sin canarios en el entorno")
        return 2
    agujas = []
    for k, v in canarios.items():
        agujas.append((k, "utf-8", v.encode()))
        agujas.append((k, "utf-16le", v.encode("utf-16le")))
    largo = max(len(x[2]) for x in agujas)
    hallazgos, viejos, revisados, omitidos, bytes_ = [], [], 0, 0, 0
    for c in a.carpetas:
        base = Path(c)
        if not base.exists():
            continue
        for raiz, dirs, archivos in os.walk(base, onerror=lambda e: None):
            for nombre in archivos:
                p = Path(raiz) / nombre
                try:
                    st = p.lstat()
                except OSError:
                    continue
                if not p.is_file() or p.is_symlink() or st.st_mtime < a.desde:
                    continue
                if nombre in VIEJOS:
                    viejos.append(str(p))
                if st.st_size > MAX:
                    omitidos += 1
                    continue
                try:
                    with open(p, "rb") as f:
                        cola = b""
                        while True:
                            bloque = f.read(8 * 1024 * 1024)
                            if not bloque:
                                break
                            datos = cola + bloque
                            for k, cod, aguja in agujas:
                                if aguja in datos:
                                    hallazgos.append({"ruta": str(p), "llave": k, "codificacion": cod})
                            cola = datos[-largo:]
                    revisados += 1
                    bytes_ += st.st_size
                except OSError:
                    omitidos += 1
    unicos = {(h["ruta"], h["llave"]): h for h in hallazgos}
    res = {
        "ok": not unicos and not viejos,
        "carpetas": a.carpetas,
        "archivos_revisados": revisados,
        "mb_revisados": round(bytes_ / 1024 / 1024, 1),
        "omitidos": omitidos,
        "canarios_sha256": {k: hashlib.sha256(v.encode()).hexdigest()[:16] for k, v in canarios.items()},
        "hallazgos": list(unicos.values()),
        "archivos_v1_de_secretos": viejos,
    }
    Path(a.salida).write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"secretos en disco: {revisados} archivos ({res['mb_revisados']} MB) · hallazgos {len(unicos)} · archivos v1 {len(viejos)}")
    for h in unicos.values():
        print(f"  LLAVE EN TEXTO PLANO: {h['ruta']} ({h['llave']}, {h['codificacion']})")
    for v in viejos:
        print(f"  archivo de secretos v1: {v}")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
