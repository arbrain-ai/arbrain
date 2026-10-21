"""Modelo de datos de una edicion (edicion.json): mapeo de tiempos, plantillas y subtitulos.

La edicion es DATOS. Todo lo que apunta al video original (cortes, zooms, subtitulos) usa TIEMPO DE FUENTE;
render.py lo traduce a tiempo de salida. Lo que ve el dueño en el visor es tiempo de la VERSION (salida):
fuente_a_version / version_a_fuente hacen la traduccion en los dos sentidos, con velocidades por tramo.
"""
from __future__ import annotations

import re
from pathlib import Path

from _comun import leer_json, normalizar
from corte_limpio import construir_frases, toks

VELOCIDAD_MIN, VELOCIDAD_MAX = 0.5, 2.0
NUMEROS = {"uno", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "cien", "mil", "millon"}
MARCADORES = {"clave", "importante", "nunca", "siempre", "error", "primero", "segundo", "tercero", "recuerda", "ojo",
              "secreto", "problema", "solucion", "resultado", "regla", "ahorra", "gana", "pierde", "no", "ninguno"}


# ---------------------------------------------------------------- estructura
def edicion_vacia(nombre: str, fuente: str, palabras: str = "palabras.json", fps: int = 30) -> dict:
    return {
        "version": 1, "nombre": nombre, "base": None, "tratamiento": "limpia",
        "fuente": fuente, "palabras": palabras, "fps": fps,
        "cortes": [],
        "zooms": [],
        "tarjetas": [],
        "subtitulos": {"modo": "ninguno", "frases": [], "estilo": {}},
        "vertical": {"modo": "recorte", "foco_x": 0.5, "duracion_max": None, "desde": 0.0},
        "marca": {"logo": True},
        "audio": {"fade": 0.02, "loudnorm": False},
        "historial": [],
    }


def normalizar_cortes(cortes: list[dict], fps: float = 30.0) -> list[dict]:
    """Ordena, ajusta a la rejilla de fotogramas, acota velocidad, fusiona solapes. Rechaza tramos vacios."""
    lim = []
    for c in sorted(cortes, key=lambda c: c["inicio"]):
        ini = round(float(c["inicio"]) * fps) / fps
        fin = round(float(c["fin"]) * fps) / fps
        if fin - ini < 2 / fps:
            continue
        vel = min(max(float(c.get("velocidad", 1.0)), VELOCIDAD_MIN), VELOCIDAD_MAX)
        lim.append({"inicio": round(ini, 4), "fin": round(fin, 4), "velocidad": round(vel, 3), **({"nota": c["nota"]} if c.get("nota") else {})})
    res: list[dict] = []
    for c in lim:
        if res and c["inicio"] < res[-1]["fin"] - 1e-6:
            c["inicio"] = res[-1]["fin"]
            if c["fin"] - c["inicio"] < 2 / fps:
                continue
        # une tramos contiguos de la misma velocidad
        if res and abs(c["inicio"] - res[-1]["fin"]) < 1e-6 and res[-1]["velocidad"] == c["velocidad"]:
            res[-1]["fin"] = c["fin"]
        else:
            res.append(c)
    return res


# ---------------------------------------------------------------- tiempos
def lineas(cortes: list[dict]) -> list[tuple[float, float, float, float, float]]:
    """[(sal_ini, sal_fin, src_ini, src_fin, vel)] en orden."""
    out, t = [], 0.0
    for c in cortes:
        largo = (c["fin"] - c["inicio"]) / c["velocidad"]
        out.append((t, t + largo, c["inicio"], c["fin"], c["velocidad"]))
        t += largo
    return out


def duracion_salida(cortes: list[dict]) -> float:
    ls = lineas(cortes)
    return ls[-1][1] if ls else 0.0


def version_a_fuente(cortes: list[dict], t: float) -> float:
    ls = lineas(cortes)
    if not ls:
        return t
    t = min(max(t, 0.0), ls[-1][1])
    for (s0, s1, f0, f1, v) in ls:
        if s0 <= t <= s1:
            return f0 + (t - s0) * v
    return ls[-1][3]


def fuente_a_version(cortes: list[dict], s: float, cerca: bool = True) -> float | None:
    """Tiempo de fuente -> tiempo de la version. Si ese instante fue cortado: el inicio del siguiente tramo (o None)."""
    ls = lineas(cortes)
    for (s0, s1, f0, f1, v) in ls:
        if f0 <= s <= f1:
            return s0 + (s - f0) / v
    if not cerca:
        return None
    for (s0, s1, f0, f1, v) in ls:
        if f0 > s:
            return s0
    return ls[-1][1] if ls else None


def intervalo_version_a_fuente(cortes: list[dict], t0: float, t1: float) -> list[tuple[float, float]]:
    """Un intervalo de la version -> intervalos de fuente (uno por tramo tocado)."""
    res = []
    for (s0, s1, f0, f1, v) in lineas(cortes):
        a, b = max(t0, s0), min(t1, s1)
        if b - a > 1e-6:
            res.append((f0 + (a - s0) * v, f0 + (b - s0) * v))
    return res


def quitar_fuente(cortes: list[dict], a: float, b: float) -> list[dict]:
    """Quita [a,b] (tiempo de fuente) de los cortes, partiendo los tramos que lo cruzan."""
    res = []
    for c in cortes:
        if b <= c["inicio"] or a >= c["fin"]:
            res.append(dict(c))
            continue
        if a > c["inicio"]:
            res.append({**c, "fin": a})
        if b < c["fin"]:
            res.append({**c, "inicio": b})
    return res


def velocidad_fuente(cortes: list[dict], a: float, b: float, vel: float) -> list[dict]:
    """Fija la velocidad de [a,b] (fuente), partiendo los tramos en las fronteras."""
    res = []
    for c in cortes:
        if b <= c["inicio"] or a >= c["fin"]:
            res.append(dict(c))
            continue
        if a > c["inicio"]:
            res.append({**c, "fin": a})
        res.append({**c, "inicio": max(a, c["inicio"]), "fin": min(b, c["fin"]), "velocidad": vel})
        if b < c["fin"]:
            res.append({**c, "inicio": b})
    return res


# ---------------------------------------------------------------- palabras y frases
def cargar_palabras(proyecto: Path, ed: dict) -> list[dict]:
    ruta = Path(ed.get("palabras", "palabras.json"))
    if not ruta.is_absolute():
        ruta = proyecto / ruta
    return leer_json(ruta)["palabras"] if ruta.is_file() else []


def en_cortes(cortes: list[dict], p: dict) -> dict | None:
    mid = (p["inicio"] + p["fin"]) / 2
    for c in cortes:
        if c["inicio"] - 1e-3 <= mid <= c["fin"] + 1e-3:
            return c
    return None


def palabras_vivas(palabras: list[dict], cortes: list[dict]) -> list[dict]:
    """Palabras que sobreviven al corte, con indice del tramo en 'tramo'."""
    vivas = []
    for p in palabras:
        c = en_cortes(cortes, p)
        if c is not None:
            vivas.append({**p, "tramo": cortes.index(c)})
    return vivas


def frases_de(palabras: list[dict]) -> list[dict]:
    return construir_frases(palabras) if palabras else []


def _clausulas(ws: list[dict]) -> list[list[dict]]:
    out, cur = [], []
    for k, w in enumerate(ws):
        cur.append(w)
        nxt = ws[k + 1] if k + 1 < len(ws) else None
        if nxt is None or w["w"].rstrip().endswith((",", ";", ":", ".", "?", "!")) or (nxt["inicio"] - w["fin"]) >= 0.25:
            out.append(cur)
            cur = []
    return out


def puntaje(ws: list[dict]) -> float:
    ts = [normalizar(w["w"]) for w in ws]
    s = 0.45 * sum(1 for t in ts if len(t) >= 7)
    s += 2.0 * any(t.isdigit() or t in NUMEROS for t in ts)
    s += 1.5 * any(t in MARCADORES for t in ts)
    n = len(ws)
    if n < 3:
        s -= 2
    if n > 10:
        s -= (n - 10) * 0.6
    return s


def subtitulos_clave(palabras: list[dict], cortes: list[dict], cada: float = 9.0) -> list[dict]:
    """Elige frases clave (aprox. una cada 'cada' segundos de la version). El AGENTE puede reemplazarlas."""
    vivas = palabras_vivas(palabras, cortes)
    if not vivas:
        return []
    objetivo = max(1, int(round(duracion_salida(cortes) / cada)))
    cands = []
    for f in frases_de(vivas):
        for cl in _clausulas(vivas[f["i0"]:f["i1"] + 1]):
            if 3 <= len(cl) <= 8:
                cierra = cl[-1] is vivas[f["i1"]]  # la clausula termina la frase: no queda colgada a medias
                cands.append((puntaje(cl) + (1.5 if cierra else -1.5), cl))
    cands.sort(key=lambda x: -x[0])
    elegidas, usados = [], []
    for sc, cl in cands:
        if len(elegidas) >= objetivo:
            break
        ini = cl[0]["inicio"]
        if any(abs(ini - u) < cada * 0.6 for u in usados):
            continue
        usados.append(ini)
        elegidas.append(cl)
    elegidas.sort(key=lambda cl: cl[0]["inicio"])
    return [_sub(cl, destacar=True) for cl in elegidas]


def subtitulos_por_frase(palabras: list[dict], cortes: list[dict], max_palabras: int = 7) -> list[dict]:
    vivas = palabras_vivas(palabras, cortes)
    subs = []
    for f in frases_de(vivas):
        for cl in _clausulas(vivas[f["i0"]:f["i1"] + 1]):
            for k in range(0, len(cl), max_palabras):
                trozo = cl[k:k + max_palabras]
                if len(cl) - (k + max_palabras) == 1:  # no dejar una palabra huerfana
                    trozo = cl[k:k + max_palabras + 1]
                    subs.append(_sub(trozo))
                    break
                subs.append(_sub(trozo))
    # evitar solapes: cada subtitulo termina antes de que empiece el siguiente
    for i in range(len(subs) - 1):
        if subs[i]["fin"] > subs[i + 1]["inicio"]:
            subs[i]["fin"] = round(subs[i + 1]["inicio"] - 0.02, 3)
    return [s for s in subs if s["fin"] - s["inicio"] > 0.2]


def _sub(ws: list[dict], destacar: bool = False) -> dict:
    texto = " ".join(w["w"] for w in ws).strip(" ,;:")
    texto = texto[:1].upper() + texto[1:]
    return {"inicio": round(ws[0]["inicio"] - 0.05, 3), "fin": round(ws[-1]["fin"] + 0.25, 3), "texto": texto,
            **({"destacar": True} if destacar else {})}


def zooms_en_frases(subs: list[dict], escala: float = 1.12, alternar: bool = True) -> list[dict]:
    zs = []
    for i, s in enumerate(subs):
        ini, fin = s["inicio"] - 0.2, s["fin"] + 0.2
        if fin - ini < 1.6:
            fin = ini + 1.6
        zs.append({"inicio": round(max(0, ini), 3), "fin": round(fin, 3), "escala": escala,
                   "foco_x": (0.47 if i % 2 == 0 else 0.53) if alternar else 0.5, "foco_y": 0.42})
    # sin solapes
    for i in range(len(zs) - 1):
        if zs[i]["fin"] > zs[i + 1]["inicio"] - 0.3:
            zs[i]["fin"] = round(zs[i + 1]["inicio"] - 0.3, 3)
    return [z for z in zs if z["fin"] - z["inicio"] > 1.0]


# ---------------------------------------------------------------- pausas, tarjetas y encuadres
def silencios_de_audio(fuente: str | Path, minimo: float) -> list[tuple[float, float]]:
    """Silencios reales del audio (ffmpeg silencedetect), con umbral adaptativo al ruido de fondo de ESA grabacion."""
    import re as _re
    from array import array

    from _comun import correr, exe

    r = correr([exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", str(fuente), "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"])
    m = array("h")
    m.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    if len(m) < 8000:
        return []
    v = 160  # ventanas de 20 ms
    niveles = sorted(20 * __import__("math").log10(max(1.0, (sum(x * x for x in m[i:i + v]) / v) ** 0.5) / 32768) for i in range(0, len(m) - v, v * 4))
    suelo = niveles[int(len(niveles) * 0.1)]
    umbral = min(max(suelo + 10, -50.0), -32.0)
    r = correr([exe("ffmpeg"), "-hide_banner", "-nostats", "-i", str(fuente), "-vn", "-af", f"silencedetect=n={umbral:.1f}dB:d={minimo:.2f}", "-f", "null", "-"])
    txt = r.stderr.decode("utf-8", "replace")
    ini = [float(x) for x in _re.findall(r"silence_start: (-?[0-9.]+)", txt)]
    fin = [float(x) for x in _re.findall(r"silence_end: ([0-9.]+)", txt)]
    return [(max(0.0, a), b) for a, b in zip(ini, fin)]


def topar_pausas(cortes: list[dict], palabras: list[dict], maximo: float, fuente: str | Path | None = None) -> list[dict]:
    """Recorta toda pausa mayor que 'maximo' (s) dejando 'maximo' de respiro (mitad a cada lado). Con la fuente usa los
    silencios REALES del audio; sin ella, los huecos entre palabras de la transcripcion."""
    res = [dict(c) for c in cortes]
    if fuente and Path(fuente).is_file():
        for a, b in silencios_de_audio(fuente, maximo + 0.08):
            if b - a > maximo + 0.08:
                res = quitar_fuente(res, a + maximo / 2, b - maximo / 2)
        return res
    vivas = [p for p in palabras if en_cortes(cortes, p)]
    for p, q in zip(vivas, vivas[1:]):
        gap = q["inicio"] - p["fin"]
        if gap > maximo + 0.04 and en_cortes(cortes, p) is en_cortes(cortes, q):
            res = quitar_fuente(res, p["fin"] + maximo / 2, q["inicio"] - maximo / 2)
    return res


def tarjetas_clave(palabras: list[dict], cortes: list[dict], cuantas: int = 3, duracion: tuple[float, float] = (1.3, 2.0)) -> list[dict]:
    """Tarjetas de frase clave (la frase en grande, a casi pantalla completa): las mejores, bien repartidas."""
    claves = subtitulos_clave(palabras, cortes, cada=max(8.0, duracion_salida(cortes) / max(cuantas, 1)))
    claves = sorted(claves, key=lambda s: -len(s["texto"]))[:cuantas] if len(claves) > cuantas else claves
    out = []
    for c in sorted(claves, key=lambda s: s["inicio"]):
        largo = min(max(c["fin"] - c["inicio"], duracion[0]), duracion[1])
        out.append({"inicio": round(c["inicio"], 3), "fin": round(c["inicio"] + largo, 3), "texto": c["texto"]})
    return out


def encuadres_alternados(palabras: list[dict], cortes: list[dict], escala: float = 1.15, minimo: float = 4.0) -> list[dict]:
    """Alternancia intencional plano medio / acercamiento: tramos de al menos 'minimo' s, uno si uno no; el
    acercamiento se sostiene toda la idea (sin parpadeos) y cambia de lado para que se sienta otra camara."""
    vivas = palabras_vivas(palabras, cortes)
    grupos, ini, fin = [], None, None
    for f in frases_de(vivas):
        if ini is None:
            ini = f["inicio"]
        fin = f["fin"]
        if fin - ini >= minimo:
            grupos.append((ini, fin))
            ini = None
    zs = []
    for k, (a, b) in enumerate(grupos):
        if k % 2 == 1:  # acercamiento
            zs.append({"inicio": round(a, 3), "fin": round(b + 0.1, 3), "escala": escala,
                       "foco_x": 0.46 if (k // 2) % 2 == 0 else 0.54, "foco_y": 0.42})
    return zs


# ---------------------------------------------------------------- plantillas de tratamiento
def construir_plantilla(plantilla: str, nombre: str, corte: dict, fuente_rel: str, fps: int, palabras: list[dict],
                        ficha: dict | None = None, fuente_abs: str | None = None) -> dict:
    ed = edicion_vacia(nombre, fuente_rel, fps=fps)
    ed["tratamiento"] = plantilla
    segs = [{"inicio": s["inicio"], "fin": s["fin"], "velocidad": 1.0} for s in corte["segmentos"]]
    pref = (ficha or {}).get("preferencias", {})
    if plantilla == "sobria":
        ed["cortes"] = normalizar_cortes(topar_pausas(normalizar_cortes(segs, fps), palabras, 0.5, fuente_abs), fps)
        ed["subtitulos"]["modo"] = "frases_clave"
        ed["subtitulos"]["frases"] = subtitulos_clave(palabras, ed["cortes"])
    elif plantilla == "dinamica":
        vel = {"calmado": 1.0, "medio": 1.08, "rapido": 1.15}.get(pref.get("ritmo", "medio"), 1.08)
        base = normalizar_cortes([{**s, "velocidad": max(vel, 1.08)} for s in segs], fps)
        ed["cortes"] = normalizar_cortes(topar_pausas(base, palabras, 0.3, fuente_abs), fps)
        ed["tarjetas"] = tarjetas_clave(palabras, ed["cortes"], 3)
        ed["zooms"] = encuadres_alternados(palabras, ed["cortes"])
        ed["subtitulos"]["modo"] = "por_frase"
        ed["subtitulos"]["frases"] = subtitulos_por_frase(palabras, ed["cortes"])
    elif plantilla == "limpia":
        ed["cortes"] = normalizar_cortes(segs, fps)
    else:
        raise SystemExit(f"Plantilla desconocida: {plantilla} (sobria | dinamica | limpia)")
    reparar_frases_clave(ed, palabras)
    return ed


def regenerar_subtitulos(ed: dict, palabras: list[dict], modo: str) -> None:
    ed["subtitulos"]["modo"] = modo
    if modo == "frases_clave":
        ed["subtitulos"]["frases"] = subtitulos_clave(palabras, ed["cortes"])
    elif modo == "por_frase":
        ed["subtitulos"]["frases"] = subtitulos_por_frase(palabras, ed["cortes"])
    else:
        ed["subtitulos"]["frases"] = []


# ---------------------------------------------------------------- vertical con duracion maxima
def recortar_a_duracion(cortes: list[dict], palabras: list[dict], maximo: float, desde: float = 0.0) -> tuple[list[dict], float, float]:
    """Ventana [desde, desde+maximo] de la version, terminando al final de una FRASE (nunca a media). Devuelve
    (cortes_recortados, desde_real, hasta_real) en tiempo de version."""
    total = duracion_salida(cortes)
    hasta = min(total, desde + maximo)
    if hasta < total:
        vivas = palabras_vivas(palabras, cortes)
        fin_frases = []
        for f in frases_de(vivas):
            fin_frases.append(fuente_a_version(cortes, f["fin"] + 0.15) or total)
        validos = [t for t in fin_frases if desde + maximo * 0.6 <= t <= hasta]
        if validos:
            hasta = max(validos)
    f0 = version_a_fuente(cortes, desde)
    f1 = version_a_fuente(cortes, hasta)
    res = []
    for c in cortes:
        if c["fin"] <= f0 or c["inicio"] >= f1:
            continue
        res.append({**c, "inicio": max(c["inicio"], f0), "fin": min(c["fin"], f1)})
    return res, desde, hasta


# ---------------------------------------------------------------- validacion
def validar_edicion(ed: dict, proyecto: Path) -> list[str]:
    """Problemas de un edicion.json escrito a mano (por un editor, por el agente)."""
    from _comun import resolver_fuente

    p: list[str] = []
    for k in ("fuente", "cortes"):
        if k not in ed:
            p.append(f"falta '{k}'")
    if p:
        return p
    if not resolver_fuente(ed, proyecto).is_file():
        p.append(f"la fuente no existe: {resolver_fuente(ed, proyecto)}")
    previo = -1.0
    for i, c in enumerate(ed["cortes"]):
        if c.get("fin", 0) <= c.get("inicio", 0):
            p.append(f"corte {i}: fin <= inicio")
        if c.get("inicio", 0) < previo - 1e-6:
            p.append(f"corte {i}: no esta en orden cronologico (reordenar no se soporta en la ruta ligera)")
        previo = max(previo, c.get("fin", 0))
        v = c.get("velocidad", 1.0)
        if not VELOCIDAD_MIN <= v <= VELOCIDAD_MAX:
            p.append(f"corte {i}: velocidad {v} fuera de {VELOCIDAD_MIN}-{VELOCIDAD_MAX}")
    for i, z in enumerate(ed.get("zooms", [])):
        if not 1.0 < z.get("escala", 1.0) <= 1.6:
            p.append(f"zoom {i}: escala {z.get('escala')} fuera de (1.0, 1.6]")
        if z.get("fin", 0) - z.get("inicio", 0) < 1.0:
            p.append(f"zoom {i}: dura menos de 1 s")
    for i, t in enumerate(ed.get("tarjetas", [])):
        if not 0.8 <= t.get("fin", 0) - t.get("inicio", 0) <= 3.0:
            p.append(f"tarjeta {i}: debe durar entre 0.8 y 3 s (recomendado 1.2 a 2)")
        if not t.get("texto"):
            p.append(f"tarjeta {i}: sin texto")
    if ed.get("subtitulos", {}).get("modo", "ninguno") not in ("ninguno", "frases_clave", "por_frase"):
        p.append("subtitulos.modo debe ser ninguno | frases_clave | por_frase")
    return p


# ---------------------------------------------------------------- frases completas y enfasis
def _tokens_vivos(vivas: list[dict]) -> list[str]:
    return [normalizar(w["w"]) for w in vivas]


def reparar_frases_clave(ed: dict, palabras: list[dict]) -> tuple[list[str], list[str]]:
    """Revisa subtitulos de modo frases_clave y tarjetas: cada frase clave debe TERMINAR en fin de frase de la
    transcripcion. Si quedo truncada y lo que falta es corto (<= 5 palabras), la completa con las palabras de la
    transcripcion (las mismas de frases.txt); si no puede, lo reporta. Los textos escritos a mano ('manual': true) o que
    no salen de la transcripcion no se tocan. Devuelve (reparadas, avisos)."""
    vivas = palabras_vivas(palabras, ed["cortes"])
    if not vivas:
        return [], []
    toks = _tokens_vivos(vivas)
    fin_frase = {f["i1"] for f in frases_de(vivas)}
    reparadas, avisos = [], []

    def revisar(item: dict, etiqueta: str):
        if item.get("manual"):
            return
        t = [x for x in normalizar(item["texto"]).split() if x]
        if not t:
            return
        n = len(t)
        pos = next((i for i in range(len(toks) - n + 1) if toks[i:i + n] == t), None)
        if pos is None:
            return  # no sale de la transcripcion (texto propio del editor)
        ultimo = pos + n - 1
        if ultimo in fin_frase:
            return
        sig = next((i for i in range(ultimo, len(vivas)) if i in fin_frase), ultimo)
        faltan = sig - ultimo
        if faltan <= 5:
            extra = " ".join(w["w"] for w in vivas[ultimo + 1:sig + 1]).strip(" ,;:")
            item["texto"] = item["texto"].rstrip(" ,;:") + " " + extra
            item["fin"] = round(max(item["fin"], vivas[sig]["fin"] + 0.25), 3)
            reparadas.append(f"{etiqueta}: completada «{item['texto']}»")
        else:
            avisos.append(f"{etiqueta}: «{item['texto']}» termina a media frase (faltan {faltan} palabras) y no se puede completar")

    if ed.get("subtitulos", {}).get("modo") == "frases_clave":
        for it in ed["subtitulos"].get("frases", []):
            revisar(it, "subtitulo")
    for it in ed.get("tarjetas", []):
        revisar(it, "tarjeta")
    return reparadas, avisos


def palabra_enfasis(texto: str) -> str | None:
    """La palabra que lleva el acento de color en un subtitulo clave: cifra o numero, marcador, o la mas larga."""
    ws = texto.split()
    cands = []
    for w in ws:
        n = normalizar(w)
        if not n:
            continue
        pts = 3.0 if (n.isdigit() or n in NUMEROS) else 2.0 if n in MARCADORES else 0.0
        pts += min(len(n), 12) / 12 if len(n) >= 6 else 0.0
        if pts > 0:
            cands.append((pts, w))
    return max(cands)[1] if cands else None
