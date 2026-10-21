#!/usr/bin/env python3
"""diario_guard.py: el candado anti doble proceso del diario a mano.

PASO 0 del protocolo (references/diario.md). Antes de escribir NADA pregunta:
esta(s) foto(s), ¿ya se procesaron?

La huella es el md5 del archivo original, estampado en el encabezado del texto literal.
Nombre y fecha mienten (el teléfono renumera, el chat vuelve a guardar); el md5 no.

Uso (Python 3.9+, macOS, Windows o Linux; en Windows quizá `python` o `py`):
    python3 diario_guard.py                         # autodetecta imágenes de <=36 h en ~/Downloads
    python3 diario_guard.py foto1.HEIC foto2.jpg    # explícito
    python3 diario_guard.py --carpeta <dir>         # buscar en otra carpeta de entrada
    python3 diario_guard.py --noche 2026-10-12      # ¿esa noche ya tiene archivo?

Salida JSON: {"verdict": ..., "fotos": [...], "ultimas_noches": [...]}
  NUEVA         -> correr el pipeline completo (pasos 1-8)
  YA_PROCESADA  -> NO reescribir nada: responder con lo que ya quedó
  PARCIAL       -> procesar SOLO las fotos nuevas (añadir al archivo de esa noche)
  SIN_FOTOS     -> preguntar dónde está la foto
"""
import hashlib
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]          # raíz del repo del dueño
DIARIO = REPO / ".claude" / "diario"
ENTRADA = Path(os.environ.get("ARBRAIN_DIARIO_ENTRADA") or (Path.home() / "Downloads"))
VENTANA_H = 36
EXTENSIONES = {".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp"}


def md5(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:10]


def huellas_registradas() -> dict:
    """{md5corto: archivo_de_diario} leyendo los encabezados ya escritos."""
    out = {}
    if not DIARIO.exists():
        return out
    for f in sorted(DIARIO.glob("*.md")):
        txt = f.read_text(encoding="utf-8", errors="ignore")[:1500]
        for tok in txt.replace("(", " ").replace(")", " ").replace(",", " ").split():
            t = tok.strip("`.;:")
            if t.startswith("md5:") and len(t) > 6:
                out[t[4:]] = f.name
    return out


def ignoradas() -> dict:
    """{md5corto: motivo}: fotos que NO son entrada de diario (hojas viejas, capturas)."""
    f = DIARIO / ".ignoradas"
    out = {}
    if f.exists():
        for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            h, _, motivo = line.partition(" ")
            out[h] = motivo.strip() or "sin motivo"
    return out


def candidatas(carpeta: Path) -> list:
    if not carpeta.is_dir():
        return []
    limite = time.time() - VENTANA_H * 3600
    fs = [p for p in carpeta.iterdir()
          if p.is_file() and p.suffix.lower() in EXTENSIONES and p.stat().st_mtime > limite]
    return sorted(fs, key=lambda p: p.stat().st_mtime, reverse=True)


def main():
    args = sys.argv[1:]
    if "--noche" in args:
        noche = args[args.index("--noche") + 1]
        f = DIARIO / f"{noche}.md"
        print(json.dumps({"noche": noche, "existe": f.exists(),
                          "archivo": str(f) if f.exists() else None}, ensure_ascii=False))
        return

    carpeta = ENTRADA
    if "--carpeta" in args:
        i = args.index("--carpeta")
        carpeta = Path(args[i + 1]).expanduser()
        args = args[:i] + args[i + 2:]

    fotos = [Path(a).expanduser() for a in args if not a.startswith("--")] or candidatas(carpeta)
    reg, ign = huellas_registradas(), ignoradas()
    detalle, nuevas = [], 0
    for p in fotos:
        if not p.exists():
            detalle.append({"foto": str(p), "estado": "NO_EXISTE"})
            continue
        h = md5(p)
        ya, ig = reg.get(h), ign.get(h)
        estado = "IGNORADA" if ig else ("YA_PROCESADA" if ya else "NUEVA")
        nuevas += 1 if estado == "NUEVA" else 0
        detalle.append({"foto": p.name, "ruta": str(p), "md5": h,
                        "mtime": time.strftime("%Y-%m-%d %H:%M", time.localtime(p.stat().st_mtime)),
                        "estado": estado, "en": ya or ig})

    reales = [d for d in detalle if d["estado"] in ("NUEVA", "YA_PROCESADA")]
    if not reales:
        verdict = "SIN_FOTOS"
    elif nuevas == len(reales):
        verdict = "NUEVA"
    elif nuevas == 0:
        verdict = "YA_PROCESADA"
    else:
        verdict = "PARCIAL"

    print(json.dumps({
        "verdict": verdict,
        "carpeta": str(carpeta),
        "fotos": detalle,
        "ultimas_noches": [f.stem for f in sorted(DIARIO.glob("*.md"))[-4:]] if DIARIO.exists() else [],
        "hint": {"NUEVA": "correr pipeline 1-8",
                 "YA_PROCESADA": "NO reescribir: responder con lo que ya quedó",
                 "PARCIAL": "procesar SOLO las fotos NUEVA (añadir al archivo de esa noche)",
                 "SIN_FOTOS": "preguntar dónde está la foto"}[verdict],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
