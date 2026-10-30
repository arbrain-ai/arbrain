#!/usr/bin/env python3
"""Exporta una version a sus finales listos para subir. NUNCA publica ni sube nada.

  exportar.py --proyecto P --version v2.1 --nombre mi-video [--vertical-max 40] [--solo horizontal|vertical]

Produce finales/<nombre>-horizontal.mp4 (1920x1080) y finales/<nombre>-vertical.mp4 (1080x1920):
H.264 + AAC, yuv420p, faststart, sonoridad a -16 LUFS (loudnorm de dos pasadas, video sin reencodar en la 2a).
Mide duracion y resolucion, escribe entrega.json y deja el JSON para abrir la carpeta en el visor.
Publicar (YouTube, redes, correo, comunidad) solo si el dueño lo pide EXPLICITO; esta skill no incluye codigo de publicacion.
"""
from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path

from _comun import correr, exe, ffmpeg, fmt_tiempo, leer_json, salir, sondear
from abrir import escribir_entrega
from render import render


def medir_sonoridad(ruta: Path) -> dict | None:
    r = correr([exe("ffmpeg"), "-hide_banner", "-nostats", "-i", str(ruta), "-vn", "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr.decode("utf-8", "replace"), re.S)
    return json.loads(m.group(0)) if m else None


def exportar_formato(ed_ruta: Path, formato: str, destino: Path, proyecto: Path) -> dict:
    with tempfile.TemporaryDirectory(prefix="cerebro-export-") as tmp:
        bruto = Path(tmp) / f"{formato}.mp4"
        r = render(ed_ruta, formato, "final", bruto, proyecto)
        if r.get("avisos"):
            salir("EXPORT DETENIDO: hay frases clave truncadas que no se pudieron completar:\n- " + "\n- ".join(r["avisos"]) +
                  "\nCorrige el texto en el edicion.json (o marca 'manual': true si es intencional) y vuelve a exportar.")
        info = sondear(bruto)
        medido = medir_sonoridad(bruto) if info["tiene_audio"] else None
        destino.parent.mkdir(parents=True, exist_ok=True)
        if medido:
            af = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={medido['input_i']}:measured_TP={medido['input_tp']}:"
                  f"measured_LRA={medido['input_lra']}:measured_thresh={medido['input_thresh']}:"
                  f"offset={medido['target_offset']}:linear=true")
            ffmpeg(["-i", str(bruto), "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-movflags", "+faststart", str(destino)], mensaje="No pude normalizar el audio")
        else:
            ffmpeg(["-i", str(bruto), "-c", "copy", "-movflags", "+faststart", str(destino)])
    info = sondear(destino)
    final = medir_sonoridad(destino) if info["tiene_audio"] else None
    return {"ruta": str(destino), "resolucion": f"{info['ancho']}x{info['alto']}", "duracion": round(info["duracion"], 2),
            "duracion_legible": fmt_tiempo(info["duracion"]),
            "sonoridad_lufs": round(float(final["input_i"]), 1) if final else None,
            "pico_db": round(float(final["input_tp"]), 1) if final else None, "tamano_mb": round(destino.stat().st_size / 1e6, 1)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proyecto", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--nombre", required=True, help="Nombre base de los finales (sin espacios raros)")
    ap.add_argument("--vertical-max", type=float, help="Duracion maxima del vertical en segundos (termina en fin de frase)")
    ap.add_argument("--solo", choices=["horizontal", "vertical"])
    ap.add_argument("--titulo")
    ap.add_argument("--nota")
    a = ap.parse_args()
    proyecto = Path(a.proyecto).expanduser().resolve()
    ed_ruta = proyecto / "versiones" / f"{a.version}.edicion.json"
    if not ed_ruta.is_file():
        salir(f"No existe {ed_ruta}")
    if a.vertical_max:
        ed = leer_json(ed_ruta)
        ed.setdefault("vertical", {})["duracion_max"] = a.vertical_max
        tmp = ed_ruta.with_name(f"{a.version}.export.edicion.json")
        tmp.write_text(json.dumps(ed, ensure_ascii=False), encoding="utf-8")
        usar = tmp
    else:
        usar, tmp = ed_ruta, None
    nombre = re.sub(r"[^A-Za-z0-9._-]+", "-", a.nombre).strip("-")
    res = {}
    try:
        for f in (["horizontal", "vertical"] if not a.solo else [a.solo]):
            res[f] = exportar_formato(usar, f, proyecto / "finales" / f"{nombre}-{f}.mp4", proyecto)
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)  # solo el archivo temporal que este script creo
    ruta_entrega = escribir_entrega(proyecto, a.titulo, a.nota)
    res["entrega_json"] = str(ruta_entrega)
    res["mostrar_carpeta"] = {"vista": "documento", "ruta": str(proyecto), "titulo": a.titulo or proyecto.name}
    res["publicado"] = False
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
