#!/usr/bin/env python3
"""Imprime el JSON EXACTO que el agente pasa a la herramienta `mostrar` (MCP `cabina`, vista `documento`)
para abrir una version, un par o trio de versiones, los finales o la carpeta de entrega dentro de Arbrain.
Este script NO abre nada por si mismo: abrir es una accion del agente con `mostrar`.

  abrir.py version RUTA.mp4 [--tiempo 130.4] [--comparar OTRA.mp4] [--titulo X]
  abrir.py par A.mp4 B.mp4 [--tiempo S]          # lado a lado / alternando
  abrir.py trio A.mp4 B.mp4 C.mp4 [--tiempo S]   # los 3 editores en paralelo
  abrir.py carpeta DIR                           # una carpeta se abre como entrega
  abrir.py entrega --proyecto P [--titulo T] [--nota N]   # escribe/actualiza entrega.json y da el JSON de la carpeta

Contrato del visor: ruta (absoluta), titulo (nombre de la pestaña), compararCon (ruta de otra version),
versiones (lista de rutas, para 3), tiempo (segundos donde abrir). Si el cliente NO tiene Arbrain:
usa el reproductor del sistema (macOS: open RUTA · Windows: start "" RUTA · Linux: xdg-open RUTA); la
experiencia de primera (comparar, marcar un instante) es el visor de Arbrain.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from _comun import escribir_json, leer_json, salir


def payload_version(ruta: str | Path, comparar: str | Path | None = None, tiempo: float | None = None,
                    titulo: str | None = None, versiones: list[str | Path] | None = None) -> dict:
    ruta = Path(ruta).expanduser().resolve()
    p: dict = {"vista": "documento", "ruta": str(ruta), "titulo": titulo or ruta.stem}
    if comparar:
        p["compararCon"] = str(Path(comparar).expanduser().resolve())
    if versiones:
        p["versiones"] = [str(Path(v).expanduser().resolve()) for v in versiones]
    if tiempo is not None:
        p["tiempo"] = round(float(tiempo), 2)
    return p


def escribir_entrega(proyecto: Path, titulo: str | None = None, nota: str | None = None) -> Path:
    """entrega.json = {"titulo", "finales": [rutas relativas], "piezas": [rutas relativas], "nota"}."""
    proyecto = proyecto.resolve()
    previa = leer_json(proyecto / "entrega.json") if (proyecto / "entrega.json").is_file() else {}
    finales = sorted(p.relative_to(proyecto).as_posix() for p in (proyecto / "finales").glob("*.mp4")) if (proyecto / "finales").is_dir() else []
    piezas = sorted(p.relative_to(proyecto).as_posix() for p in (proyecto / "versiones").glob("*.mp4")
                    if not p.name.endswith(".vertical.mp4")) if (proyecto / "versiones").is_dir() else []
    datos = {"titulo": titulo or previa.get("titulo") or proyecto.name, "finales": finales, "piezas": piezas,
             "nota": nota if nota is not None else previa.get("nota", "")}
    return escribir_json(proyecto / "entrega.json", datos)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("version")
    v.add_argument("ruta")
    v.add_argument("--tiempo", type=float)
    v.add_argument("--comparar")
    v.add_argument("--titulo")
    for n, k in (("par", 2), ("trio", 3)):
        s = sub.add_parser(n)
        s.add_argument("rutas", nargs=k)
        s.add_argument("--tiempo", type=float)
    c = sub.add_parser("carpeta")
    c.add_argument("dir")
    e = sub.add_parser("entrega")
    e.add_argument("--proyecto", required=True)
    e.add_argument("--titulo")
    e.add_argument("--nota")
    a = ap.parse_args()

    if a.cmd == "version":
        out = payload_version(a.ruta, a.comparar, a.tiempo, a.titulo)
    elif a.cmd == "par":
        out = payload_version(a.rutas[0], comparar=a.rutas[1], tiempo=a.tiempo,
                              titulo=f"{Path(a.rutas[0]).stem} vs {Path(a.rutas[1]).stem}")
    elif a.cmd == "trio":
        out = payload_version(a.rutas[0], versiones=a.rutas, tiempo=a.tiempo,
                              titulo=" · ".join(Path(r).stem for r in a.rutas))
    elif a.cmd == "carpeta":
        d = Path(a.dir).expanduser().resolve()
        if not d.is_dir():
            salir(f"No es una carpeta: {d}")
        out = {"vista": "documento", "ruta": str(d), "titulo": d.name}
    else:
        proy = Path(a.proyecto).expanduser().resolve()
        ruta = escribir_entrega(proy, a.titulo, a.nota)
        out = {"vista": "documento", "ruta": str(proy), "titulo": a.titulo or proy.name}
        print(f"entrega.json escrito en {ruta}", file=__import__("sys").stderr)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
