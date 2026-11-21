#!/usr/bin/env python3
"""Censo de un canal: qué enlaza cada mes en sus descripciones y qué pide en el habla, y en qué punto del video.

Lee (solo lectura) los transcripts de un corpus de la skill `intel` (`corpus.py bajar` guarda descripción, fecha,
duración y líneas «`[mm:ss]` texto»). Solo biblioteca estándar.

    python3 censo.py <corpus> [--llamado nombre=regex …] [--desde AAAA-MM] [--hasta AAAA-MM] [--top 8]
                     [--salida censo.md] [--json]

Límites que el reporte repite: cuenta el habla de los subtítulos y la descripción tal como estaban el día que se
bajaron; no ve tarjetas en pantalla, comentarios fijados ni ediciones anteriores. Es descripción, no causalidad.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import glob
import json
import os
import re
import sys
from urllib.parse import urlparse

def _leer(ruta: str) -> str:
    with open(ruta, encoding="utf-8", errors="ignore") as f:
        return f.read()


def _escribir(ruta: str, texto: str) -> None:
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)


URL = re.compile(r"https?://[^\s)\]>\"']+")
ACORTADORES = {"bit.ly", "geni.us", "tinyurl.com", "linktr.ee", "stan.store", "beacons.ai", "t.co", "lnk.bio"}


def segundos(t: str):
    p = [int(x) for x in t.split(":")]
    while len(p) < 3:
        p.insert(0, 0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def leer(ruta: str) -> dict:
    txt = _leer(ruta)
    cab = lambda k: (re.search(rf"^- \*\*{k}:\*\* `?([^`\n]+)`?", txt, re.M) or [None, None])[1]
    fecha = cab("Fecha") or "?"
    dur = cab("Duracion")
    dur_s = segundos(dur) if dur and re.fullmatch(r"\d{1,2}(:\d{2}){1,2}", dur) else None
    desc = ""
    m = re.search(r"^## Descripción\n(.*?)(?=^---$|^## Transcript)", txt, re.S | re.M)
    if m:
        desc = m.group(1).strip()
    lineas = [(segundos(a), b) for a, b in re.findall(r"^`\[(\d{1,2}(?::\d{2}){1,2})\]`\s?(.*)$", txt.split("## Transcript", 1)[-1], re.M)]
    titulo = (re.search(r"^# (.+)$", txt, re.M) or [None, "?"])[1]
    return {"archivo": os.path.basename(ruta), "titulo": titulo, "fecha": fecha, "duracion": dur_s, "descripcion": desc, "lineas": lineas}


def dominio(url: str) -> str:
    d = urlparse(url).netloc.lower()
    return d[4:] if d.startswith("www.") else d


def censo(corpus: str, llamados: dict[str, str], desde: str = "", hasta: str = "", top: int = 8) -> dict:
    rx = {k: re.compile(v, re.I) for k, v in llamados.items()}
    meses = collections.OrderedDict()
    sin_fecha = 0
    for ruta in sorted(glob.glob(os.path.join(corpus, "**", "transcripts", "*.md"), recursive=True)):
        v = leer(ruta)
        mes = v["fecha"][:7] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v["fecha"]) else None
        if not mes:
            sin_fecha += 1
            continue
        if (desde and mes < desde) or (hasta and mes > hasta):
            continue
        M = meses.setdefault(mes, {"videos": 0, "con_habla": 0, "dominios": collections.Counter(),
                                   "acortadores": 0, "llamados": {k: {"videos": 0, "posiciones": []} for k in rx}})
        M["videos"] += 1
        doms = {dominio(u) for u in URL.findall(v["descripcion"])}
        for d in doms:
            M["dominios"][d] += 1
        M["acortadores"] += 1 if doms & ACORTADORES else 0
        if v["lineas"]:
            M["con_habla"] += 1
        for k, r in rx.items():
            primero = next((t for t, l in v["lineas"] if r.search(l)), None)
            en_desc = bool(r.search(v["descripcion"]))
            if primero is not None or en_desc:
                M["llamados"][k]["videos"] += 1
            if primero is not None and v["duracion"]:
                M["llamados"][k]["posiciones"].append(round(100 * primero / v["duracion"]))
    for M in meses.values():
        M["dominios"] = M["dominios"].most_common(top)
        for L in M["llamados"].values():
            p = sorted(L["posiciones"])
            L["mediana_pct"] = p[len(p) // 2] if p else None
    return {"corpus": corpus, "generado": dt.date.today().isoformat(), "llamados": llamados,
            "sin_fecha": sin_fecha, "meses": dict(sorted(meses.items()))}


def markdown(r: dict) -> str:
    out = [f"# Censo de `{r['corpus']}`", "",
           f"Generado {r['generado']} con `censo.py`. Límite: habla de los subtítulos y descripción tal como estaban al "
           "bajarlos; no ve tarjetas en pantalla, comentarios fijados ni ediciones anteriores. Descripción, no causalidad.", ""]
    if r["sin_fecha"]:
        out += [f"{r['sin_fecha']} transcript(s) sin fecha quedaron fuera.", ""]
    if r["llamados"]:
        out += ["Llamados contados (expresiones regulares):", ""] + [f"- **{k}:** `{v}`" for k, v in r["llamados"].items()] + [""]
        cab = "| Mes | Videos | Con habla | " + " | ".join(f"{k} (videos · posición mediana)" for k in r["llamados"]) + " |"
        out += [cab, "|" + "---|" * (3 + len(r["llamados"]))]
        for mes, M in r["meses"].items():
            celdas = []
            for k in r["llamados"]:
                L = M["llamados"][k]
                celdas.append(f"{L['videos']} · {str(L['mediana_pct']) + ' %' if L['mediana_pct'] is not None else 'sin dato'}")
            out.append(f"| {mes} | {M['videos']} | {M['con_habla']} | " + " | ".join(celdas) + " |")
        out.append("")
        out.append("Posición: en qué parte del video aparece el llamado por primera vez en el habla (0 % el inicio, 100 % el final). "
                   "La cuenta de videos incluye los que solo lo traen en la descripción.")
        out.append("")
    out += ["## Destinos enlazados en las descripciones", "", "| Mes | Videos | Con acortador | Dominios más enlazados (videos) |", "|---|---|---|---|"]
    for mes, M in r["meses"].items():
        doms = ", ".join(f"{d} ({n})" for d, n in M["dominios"]) or "ninguno"
        out.append(f"| {mes} | {M['videos']} | {M['acortadores']} | {doms} |")
    out += ["", "Un acortador esconde el destino final: ábrelo y anota a dónde lleva antes de concluir nada."]
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="censo.py", description=__doc__.split("\n\n")[0])
    p.add_argument("corpus")
    p.add_argument("--llamado", action="append", default=[], help="nombre=expresión regular (repetible)")
    p.add_argument("--desde", default="")
    p.add_argument("--hasta", default="")
    p.add_argument("--top", type=int, default=8)
    p.add_argument("--salida", default="")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    if not glob.glob(os.path.join(a.corpus, "**", "transcripts", "*.md"), recursive=True):
        print(f"No hay transcripts en {a.corpus}. Bájalos primero con la skill intel (corpus.py bajar).", file=sys.stderr)
        return 2
    llamados = {}
    for l in a.llamado:
        if "=" not in l:
            print(f"--llamado va como nombre=regex: {l}", file=sys.stderr)
            return 2
        k, v = l.split("=", 1)
        try:
            re.compile(v)
        except re.error as e:
            print(f"Expresión inválida en {k}: {e}", file=sys.stderr)
            return 2
        llamados[k.strip()] = v
    r = censo(a.corpus, llamados, a.desde, a.hasta, a.top)
    texto = json.dumps(r, ensure_ascii=False, indent=2) if a.json else markdown(r)
    if a.salida:
        os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
        _escribir(a.salida, texto)
        print(a.salida)
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())
