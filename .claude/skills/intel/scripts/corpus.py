#!/usr/bin/env python3
"""Corpus de inteligencia externa: transcripts verbatim con minuto, fichas de ruteo encima y citas verificables.

Autocontenido: solo la biblioteca estándar de Python y, para bajar de YouTube, el programa `yt-dlp` en el PATH.
No usa llaves ni servicios. Todo vive en carpetas de texto que se pueden buscar con `rg`.

    python3 corpus.py bajar <url> --corpus <dir> [--idioma en] [--limite N] [--desde AAAAMMDD] [--min-segundos S]
                                   [--cookies-del-navegador chrome] [--sin-componentes-remotos]
    python3 corpus.py texto <subs.srt|.vtt|.json|.txt> --corpus <dir> --id <id> --titulo "…" [--url …] [--fecha AAAA-MM-DD]
    python3 corpus.py indice <corpus> [--titulo "…"]
    python3 corpus.py buscar <corpus|transcript> "frase exacta"
    python3 corpus.py link <transcript.md> <mm:ss|hh:mm:ss>
    python3 corpus.py ficha <corpus> <id>              # esqueleto de ficha con su huella, si aún no existe
    python3 corpus.py pendientes <corpus>
    python3 corpus.py validar <corpus> [--ficha <archivo>]

Forma de un corpus (una carpeta por fuente; p. ej. contenido/intel/<referente>/youtube/):
    transcripts/<AAAAMMDD>_<id>.md   verbatim intacto: cabecera, descripción y líneas «`[mm:ss]` texto»
    fichas/<AAAAMMDD>_<id>.md        ficha de ruteo (references/fichas.md); nunca sustituye al verbatim
    _index.json                      metadatos de lo bajado
    INDICE.md                        por mes: título → ficha o verbatim, con la tesis si hay ficha

Código de salida: 0 bien, 1 hallazgos (validar, pendientes) o fallo parcial, 2 error de uso.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.request

def _leer(ruta: str) -> str:
    with open(ruta, encoding="utf-8", errors="ignore") as f:
        return f.read()


def _escribir(ruta: str, texto: str) -> None:
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)


TOL_CITA = 150  # segundos de gracia entre el ancla de una cita y donde de verdad aparece
SECCIONES_CON_CITA = ("ideas clave", "modelos y marcos", "citas textuales", "entidades y cifras")


# ------------------------------------------------------------------ tiempo
def hms(seg: float | int | None) -> str:
    if seg is None:
        return "?"
    seg = int(float(seg))
    h, m, s = seg // 3600, (seg % 3600) // 60, seg % 60
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def segundos(t: str) -> int | None:
    t = str(t).strip("[]` ")
    if not re.fullmatch(r"\d{1,2}(:\d{2}){1,2}", t):
        return None
    partes = [int(p) for p in t.split(":")]
    while len(partes) < 3:
        partes.insert(0, 0)
    h, m, s = partes
    return h * 3600 + m * 60 + s


# ------------------------------------------------------------------ subtítulos
def parse_vtt(texto: str) -> list[tuple[int, str]]:
    """VTT o SRT → [(segundo, texto)] sin etiquetas ni líneas repetidas (los automáticos repiten mucho)."""
    out, ultimo, cur = [], None, None
    for crudo in texto.splitlines():
        linea = crudo.strip()
        m = re.match(r"(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,]\d+\s+-->", linea)
        if m:
            h = int(m.group(1) or 0)
            cur = h * 3600 + int(m.group(2)) * 60 + int(m.group(3))
            continue
        if not linea or linea == "WEBVTT" or linea.startswith(("Kind:", "Language:", "NOTE")) or linea.isdigit():
            continue
        limpio = re.sub(r"<[^>]+>", "", linea).strip()
        if not limpio or limpio == ultimo or cur is None:
            continue
        out.append((cur, limpio))
        ultimo = limpio
    return out


def parse_entrada(ruta: str) -> list[tuple[int | None, str]]:
    """Subtítulos (.srt/.vtt), salida de Whisper en JSON con `segments`, o texto plano (sin tiempos)."""
    crudo = _leer(ruta)
    if ruta.endswith(".json"):
        d = json.loads(crudo)
        return [(int(s["start"]), s["text"].strip()) for s in d.get("segments", []) if s.get("text", "").strip()]
    if ruta.endswith((".srt", ".vtt")) or "-->" in crudo[:2000]:
        return parse_vtt(crudo)
    lineas = []
    for l in crudo.splitlines():
        m = re.match(r"\s*`?\[(\d{1,2}(?::\d{2}){1,2})\]`?\s*(.+)", l)
        if m:
            lineas.append((segundos(m.group(1)), m.group(2).strip()))
        elif l.strip():
            lineas.append((None, l.strip()))
    return lineas


def escribir_transcript(ruta: str, meta: dict, lineas: list[tuple[int | None, str]]) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(f"# {meta.get('titulo') or meta['id']}\n\n")
        f.write(f"- **Video ID:** `{meta['id']}`\n- **URL:** {meta.get('url') or '?'}\n")
        f.write(f"- **Fecha:** {meta.get('fecha') or '?'}\n- **Duracion:** {hms(meta.get('duracion'))}\n")
        if meta.get("canal"):
            f.write(f"- **Canal:** {meta['canal']}\n")
        if meta.get("vistas") is not None:
            f.write(f"- **Vistas al bajarlo:** {meta['vistas']} ({dt.date.today().isoformat()})\n")
        f.write(f"- **Subs:** {meta.get('subs') or '?'}\n")
        if meta.get("descripcion"):
            f.write("\n## Descripción\n\n" + meta["descripcion"].strip() + "\n")
        f.write("\n---\n\n## Transcript\n\n")
        if not lineas:
            f.write("_(sin subtitulos disponibles)_\n")
        for t, txt in lineas:
            f.write(f"`[{hms(t)}]` {txt}\n" if t is not None else f"{txt}\n")


# ------------------------------------------------------------------ bajar (yt-dlp)
def _ytdlp(args: list[str], extra: list[str]) -> dict:
    r = subprocess.run(["yt-dlp", "--no-warnings", *extra, *args], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else "yt-dlp falló")
    return json.loads(r.stdout)


def _url_subs(info: dict, idioma: str):
    subs, auto = info.get("subtitles") or {}, info.get("automatic_captions") or {}
    prefs = (idioma, f"{idioma}-orig", f"{idioma}-US", f"{idioma}-GB", f"{idioma}-419", f"{idioma}-MX", f"{idioma}-ES")
    for fuente in (subs, auto):
        for lang in [*prefs, *[k for k in fuente if k.startswith(idioma)]]:
            for f in fuente.get(lang, []):
                if f.get("ext") == "vtt":
                    return f["url"], lang, fuente is subs
    return None, None, None


def cmd_bajar(a) -> int:
    if not shutil.which("yt-dlp"):
        print("Falta yt-dlp. Instálalo (pip install -U yt-dlp, o brew install yt-dlp) y vuelve a correr.", file=sys.stderr)
        return 2
    extra = [] if a.sin_componentes_remotos else ["--remote-components", "ejs:github"]
    if a.cookies_del_navegador:
        extra += ["--cookies-from-browser", a.cookies_del_navegador]
    tdir = os.path.join(a.corpus, "transcripts")
    os.makedirs(tdir, exist_ok=True)
    hechos = {os.path.basename(p)[:-3].split("_", 1)[-1] for p in glob.glob(os.path.join(tdir, "*.md"))}
    lista = _ytdlp(["--flat-playlist", "-J", a.url], extra)
    entradas = lista.get("entries") or [lista]
    # Un canal sin pestaña trae sus pestañas (videos, shorts, en vivo) como entradas anidadas.
    planas = []
    for e in entradas:
        planas.extend(e.get("entries") or [e]) if isinstance(e, dict) else None
    videos = [e for e in planas if e and e.get("id") and len(str(e["id"])) == 11]
    if a.limite:
        videos = videos[: a.limite]
    idx_ruta = os.path.join(a.corpus, "_index.json")
    indice = json.loads(_leer(idx_ruta)) if os.path.exists(idx_ruta) else {"videos": []}
    por_id = {v["id"]: v for v in indice["videos"]}
    fallos, nuevos = [], 0
    print(f"{len(videos)} candidatos, {len(hechos & {v['id'] for v in videos})} ya bajados", file=sys.stderr)
    for i, v in enumerate(videos):
        vid = v["id"]
        if vid in hechos:
            continue
        if a.min_segundos and v.get("duration") and v["duration"] < a.min_segundos:
            continue
        url_v = f"https://www.youtube.com/watch?v={vid}"
        try:
            info = _ytdlp(["-J", "--skip-download", url_v], extra)
        except Exception as e:  # noqa: BLE001
            fallos.append((vid, str(e)[:160]))
            print(f"[{i}] FALLA {vid}: {str(e)[:120]}", file=sys.stderr)
            continue
        fecha = info.get("upload_date") or "00000000"
        if a.desde and fecha < a.desde:
            continue
        surl, lang, manual = _url_subs(info, a.idioma)
        lineas = []
        if surl:
            try:
                req = urllib.request.Request(surl, headers={"User-Agent": "Mozilla/5.0"})
                lineas = parse_vtt(urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore"))
            except Exception as e:  # noqa: BLE001
                fallos.append((vid, f"subtítulos: {e}"))
        nombre = f"{fecha}_{vid}.md"
        meta = {"id": vid, "titulo": info.get("title"), "url": url_v,
                "fecha": f"{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}" if fecha != "00000000" else None,
                "duracion": info.get("duration"), "canal": info.get("channel") or info.get("uploader"),
                "vistas": info.get("view_count"), "descripcion": info.get("description") or "",
                "subs": f"{'manual' if manual else 'auto'} ({lang})" if lang else "ninguno"}
        escribir_transcript(os.path.join(tdir, nombre), meta, lineas)
        por_id[vid] = {"id": vid, "titulo": meta["titulo"], "fecha": fecha, "duracion": meta["duracion"],
                       "vistas": meta["vistas"], "archivo": nombre, "lineas": len(lineas), "subs": meta["subs"]}
        nuevos += 1
        print(f"[{i}] OK {fecha} {(meta['titulo'] or '')[:60]} ({len(lineas)} líneas, {meta['subs']})", file=sys.stderr)
        time.sleep(a.pausa)
    indice["videos"] = sorted(por_id.values(), key=lambda x: x["fecha"], reverse=True)
    indice["fuente"], indice["actualizado"] = a.url, dt.date.today().isoformat()
    _escribir(idx_ruta, json.dumps(indice, ensure_ascii=False, indent=2))
    print(json.dumps({"nuevos": nuevos, "fallos": fallos, "corpus": a.corpus}, ensure_ascii=False))
    return 1 if fallos and not nuevos else 0


def cmd_texto(a) -> int:
    lineas = parse_entrada(a.entrada)
    fecha = (a.fecha or "0000-00-00").replace("-", "")
    nombre = f"{fecha}_{a.id}.md"
    ultimo = max((t for t, _ in lineas if t is not None), default=None)
    meta = {"id": a.id, "titulo": a.titulo, "url": a.url, "fecha": a.fecha, "duracion": ultimo,
            "canal": a.canal, "subs": a.subs, "descripcion": ""}
    ruta = os.path.join(a.corpus, "transcripts", nombre)
    if os.path.exists(ruta) and not a.reemplazar:
        print(f"Ya existe {ruta}: el verbatim no se pisa (usa --reemplazar si de verdad cambió la fuente).", file=sys.stderr)
        return 1
    escribir_transcript(ruta, meta, lineas)
    print(json.dumps({"transcript": ruta, "lineas": len(lineas)}, ensure_ascii=False))
    return 0


# ------------------------------------------------------------------ lectura de transcripts
def leer_transcript(ruta: str) -> dict:
    txt = _leer(ruta)
    cab = lambda k: (re.search(rf"^- \*\*{k}:\*\* `?([^`\n]+)`?", txt, re.M) or [None, None])[1]
    cuerpo = txt.split("## Transcript", 1)[-1]
    lineas = []
    for l in cuerpo.splitlines():
        m = re.match(r"`\[(\d{1,2}(?::\d{2}){1,2})\]`\s?(.*)", l)
        if m:
            lineas.append((segundos(m.group(1)), m.group(2)))
        elif l.strip() and not l.startswith("_("):
            lineas.append((None, l.strip()))
    titulo = (re.search(r"^# (.+)$", txt, re.M) or [None, "?"])[1]
    return {"titulo": titulo, "id": cab("Video ID"), "url": cab("URL"), "fecha": cab("Fecha"), "lineas": lineas,
            "sha": hashlib.sha256(cuerpo.encode("utf-8")).hexdigest()[:16]}


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = "".join(c if (c.isalnum() or c.isspace()) else " " for c in s)
    return re.sub(r"\s+", " ", s).strip()


def mapa_texto(lineas):
    """Texto normalizado del verbatim entero y, por cada carácter, el segundo de su línea."""
    partes, tiempos, ultimo = [], [], 0
    for t, txt in lineas:
        n = normalizar(txt)
        if not n:
            continue
        ultimo = t if t is not None else ultimo
        partes.append(n)
        tiempos.extend([ultimo] * (len(n) + 1))
    return " ".join(partes), tiempos


def encontrar(lineas, frase: str, cerca: int | None = None):
    """→ (segundo, apariciones) de la frase en el verbatim; con `cerca`, la aparición más próxima a ese segundo."""
    texto, tiempos = mapa_texto(lineas)
    aguja = normalizar(frase)
    if not aguja:
        return None, 0
    pos = [m.start() for m in re.finditer(re.escape(aguja), texto)]
    if not pos:
        return None, 0
    ts = [tiempos[p] for p in pos]
    if cerca is None:
        return ts[0], len(ts)
    return min(ts, key=lambda t: abs(t - cerca)), len(ts)


def link(meta: dict, seg: int | None) -> str:
    vid, url = meta.get("id"), meta.get("url") or ""
    if seg is None:
        return url
    if vid and len(vid) == 11 and ("youtu" in url or not url or url == "?"):
        return f"https://youtu.be/{vid}?t={seg}"
    return f"{url} (minuto {hms(seg)})"


def transcripts_de(ruta: str) -> list[str]:
    if os.path.isfile(ruta):
        return [ruta]
    return sorted(glob.glob(os.path.join(ruta, "**", "transcripts", "*.md"), recursive=True))


# ------------------------------------------------------------------ comandos de lectura
def cmd_buscar(a) -> int:
    hubo = 0
    for p in transcripts_de(a.donde):
        meta = leer_transcript(p)
        seg, n = encontrar(meta["lineas"], a.frase)
        if seg is not None:
            hubo += 1
            print(f"{p}\t[{hms(seg)}]\t{n} vez/veces\t{link(meta, seg)}")
    if not hubo:
        print("No aparece tal cual. Prueba un tramo más corto o contiguo; si sigue sin salir, no está en el corpus.")
        return 1
    return 0


def cmd_link(a) -> int:
    meta = leer_transcript(a.transcript)
    seg = segundos(a.minuto)
    if seg is None:
        print("El minuto va como mm:ss o hh:mm:ss.", file=sys.stderr)
        return 2
    print(link(meta, seg))
    return 0


def _fichas_dir(corpus):
    return os.path.join(corpus, "fichas")


def cmd_ficha(a) -> int:
    cand = glob.glob(os.path.join(a.corpus, "transcripts", f"*_{a.id}.md")) or glob.glob(os.path.join(a.corpus, "transcripts", f"{a.id}.md"))
    if not cand:
        print(f"No hay transcript de {a.id} en {a.corpus}/transcripts.", file=sys.stderr)
        return 2
    t = cand[0]
    meta = leer_transcript(t)
    destino = os.path.join(_fichas_dir(a.corpus), os.path.basename(t))
    if os.path.exists(destino):
        print(f"Ya existe {destino}: edítala, no la dupliques.", file=sys.stderr)
        return 1
    os.makedirs(_fichas_dir(a.corpus), exist_ok=True)
    sin_verbatim = not any(meta["lineas"])
    esqueleto = f"""---
id: {meta['id']}
transcript: ../transcripts/{os.path.basename(t)}
sha_transcript: {meta['sha']}
temas: []
sin_verbatim: {'true' if sin_verbatim else 'false'}
generado: {dt.date.today().isoformat()}
---
# {meta['titulo']}

**En una línea:** (la tesis o el valor del video, específica, de 6 a 32 palabras)

## Para qué abrirlo
- ¿(pregunta en español que este video responde mejor que otros)?

## Ideas clave
- [mm:ss] (la idea en español). «frase exacta del verbatim, en su idioma»

## Mapa por tramos
- [00:00] (de qué va este tramo)

## Modelos y marcos
- [mm:ss] **(nombre del marco):** (cómo funciona). «frase exacta»

## Citas textuales
- [mm:ss] «cita exacta, letra por letra»

## Entidades y cifras
- [mm:ss] (quién o qué; toda cifra atribuida: «dice que…»). «frase exacta»
"""
    _escribir(destino, esqueleto)
    print(destino)
    return 0


def leer_ficha(ruta: str) -> dict:
    txt = _leer(ruta)
    fm = {}
    m = re.match(r"---\n(.*?)\n---\n", txt, re.S)
    if m:
        for l in m.group(1).splitlines():
            if ":" in l:
                k, v = l.split(":", 1)
                fm[k.strip()] = v.strip()
    tesis = (re.search(r"^\*\*En una línea:\*\*\s*(.+)$", txt, re.M) or [None, ""])[1].strip()
    seccion, citas = None, []
    for n, l in enumerate(txt.splitlines(), 1):
        h = re.match(r"^##\s+(.+)$", l)
        if h:
            seccion = h.group(1).strip().lower()
            continue
        if seccion in SECCIONES_CON_CITA:
            mt = re.match(r"^\s*-\s*\[(\d{1,2}(?::\d{2}){1,2})\]", l)
            for cita in re.findall(r"«([^»]+)»", l):
                citas.append({"linea": n, "seccion": seccion, "t": segundos(mt.group(1)) if mt else None, "texto": cita})
    temas = [x.strip() for x in fm.get("temas", "[]").strip("[]").split(",") if x.strip()]
    return {"fm": fm, "tesis": tesis, "citas": citas, "temas": temas}


def cmd_validar(a) -> int:
    fichas = [a.ficha] if a.ficha else sorted(glob.glob(os.path.join(a.corpus, "**", "fichas", "*.md"), recursive=True))
    errores = []
    for f in fichas:
        t = os.path.join(os.path.dirname(os.path.dirname(f)), "transcripts", os.path.basename(f))
        if not os.path.exists(t):
            errores.append(f"{f}: no tiene su transcript ({t})")
            continue
        meta, fi = leer_transcript(t), leer_ficha(f)
        if fi["fm"].get("sha_transcript") and fi["fm"]["sha_transcript"] != meta["sha"]:
            errores.append(f"{f}: el verbatim cambió desde que se fichó (sha {fi['fm']['sha_transcript']} ≠ {meta['sha']}); vuelve a ficharlo")
        if fi["fm"].get("sin_verbatim") == "true":
            continue
        if not fi["tesis"] or fi["tesis"].startswith("("):
            errores.append(f"{f}: falta «En una línea»")
        if not fi["citas"]:
            errores.append(f"{f}: ninguna cita o evidencia entre «»: la ficha no prueba sus anclas")
        for c in fi["citas"]:
            if c["texto"].startswith("("):
                errores.append(f"{f}:{c['linea']}: quedó texto de la plantilla")
                continue
            seg, _ = encontrar(meta["lineas"], c["texto"], c["t"])
            if seg is None:
                errores.append(f"{f}:{c['linea']}: «{c['texto'][:60]}» no aparece tal cual en el verbatim")
            elif c["t"] is not None and abs(seg - c["t"]) > TOL_CITA:
                errores.append(f"{f}:{c['linea']}: «{c['texto'][:40]}» está en [{hms(seg)}], no en [{hms(c['t'])}]; corrige el ancla")
    for e in errores:
        print(e)
    print(f"{len(fichas)} ficha(s) revisada(s), {len(errores)} error(es)", file=sys.stderr)
    return 1 if errores else 0


def cmd_pendientes(a) -> int:
    pend = []
    for t in transcripts_de(a.corpus):
        f = os.path.join(os.path.dirname(os.path.dirname(t)), "fichas", os.path.basename(t))
        meta = leer_transcript(t)
        if not os.path.exists(f):
            pend.append((t, "sin ficha" + (" (sin subtítulos: ficha mínima con sin_verbatim: true)" if not meta["lineas"] else "")))
        elif leer_ficha(f)["fm"].get("sha_transcript") not in (None, meta["sha"]):
            pend.append((t, "ficha vieja: el verbatim cambió"))
    for t, motivo in pend:
        print(f"{t}\t{motivo}")
    print(f"{len(pend)} pendiente(s)", file=sys.stderr)
    return 1 if pend else 0


def cmd_indice(a) -> int:
    corpus = a.corpus.rstrip("/")
    items = []
    for t in sorted(glob.glob(os.path.join(corpus, "transcripts", "*.md"))):
        meta = leer_transcript(t)
        nombre = os.path.basename(t)
        f = os.path.join(corpus, "fichas", nombre)
        fi = leer_ficha(f) if os.path.exists(f) else None
        items.append((nombre.split("_", 1)[0], meta, nombre, fi))
    items.sort(key=lambda x: x[0], reverse=True)
    titulo = a.titulo or os.path.basename(corpus)
    con_ficha = sum(1 for *_, fi in items if fi)
    out = [f"# {titulo}\n", f"> {len(items)} items · {con_ficha} con ficha · generado {dt.date.today().isoformat()} por corpus.py\n"]
    if con_ficha:
        out.append("> Ruta: la tesis de cada item está aquí → su ficha con minutos → el verbatim en ese minuto.\n")
    mes = None
    for fecha, meta, nombre, fi in items:
        m = f"{fecha[:4]}-{fecha[4:6]}" if fecha.isdigit() and fecha != "00000000" else "sin fecha"
        if m != mes:
            out.append(f"\n## {m}\n")
            mes = m
        dia = f"{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}" if fecha.isdigit() and fecha != "00000000" else "?"
        vacio = "" if meta["lineas"] else " · sin subtítulos"
        if fi and fi["tesis"] and not fi["tesis"].startswith("("):
            temas = f" · _{', '.join(fi['temas'])}_" if fi["temas"] else ""
            out.append(f"- `{dia}` [{meta['titulo']}](fichas/{nombre}){vacio}: {fi['tesis']}{temas} · [verbatim](transcripts/{nombre})")
        else:
            out.append(f"- `{dia}` [{meta['titulo']}](transcripts/{nombre}){vacio}")
    open(os.path.join(corpus, "INDICE.md"), "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(os.path.join(corpus, "INDICE.md"))
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="corpus.py", description=__doc__.split("\n\n")[0])
    s = p.add_subparsers(dest="cmd", required=True)
    b = s.add_parser("bajar", help="baja transcripts y descripciones de un video, lista o canal de YouTube")
    b.add_argument("url")
    b.add_argument("--corpus", required=True)
    b.add_argument("--idioma", default="en", help="idioma de los subtítulos (en, es, zh-Hans…)")
    b.add_argument("--limite", type=int, default=0)
    b.add_argument("--desde", default="", help="solo videos publicados desde AAAAMMDD")
    b.add_argument("--min-segundos", type=int, default=0, help="salta clips más cortos que esto")
    b.add_argument("--cookies-del-navegador", default="", help="chrome, firefox, safari… si YouTube pide «no eres un bot»")
    b.add_argument("--sin-componentes-remotos", action="store_true", help="no pasar --remote-components ejs:github")
    b.add_argument("--pausa", type=float, default=0.5)
    t = s.add_parser("texto", help="convierte subtítulos o una transcripción local en un transcript del corpus")
    t.add_argument("entrada")
    t.add_argument("--corpus", required=True)
    t.add_argument("--id", required=True)
    t.add_argument("--titulo", required=True)
    t.add_argument("--url", default="")
    t.add_argument("--fecha", default="")
    t.add_argument("--canal", default="")
    t.add_argument("--subs", default="local")
    t.add_argument("--reemplazar", action="store_true")
    i = s.add_parser("indice")
    i.add_argument("corpus")
    i.add_argument("--titulo", default="")
    bu = s.add_parser("buscar")
    bu.add_argument("donde")
    bu.add_argument("frase")
    l = s.add_parser("link")
    l.add_argument("transcript")
    l.add_argument("minuto")
    fi = s.add_parser("ficha")
    fi.add_argument("corpus")
    fi.add_argument("id")
    pe = s.add_parser("pendientes")
    pe.add_argument("corpus")
    v = s.add_parser("validar")
    v.add_argument("corpus")
    v.add_argument("--ficha", default="")
    a = p.parse_args(argv)
    return {"bajar": cmd_bajar, "texto": cmd_texto, "indice": cmd_indice, "buscar": cmd_buscar, "link": cmd_link,
            "ficha": cmd_ficha, "pendientes": cmd_pendientes, "validar": cmd_validar}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
