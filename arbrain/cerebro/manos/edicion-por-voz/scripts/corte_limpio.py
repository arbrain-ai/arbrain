#!/usr/bin/env python3
"""Corte limpio: el script PROPONE, el agente DECIDE por significado, el script APLICA.

  corte_limpio.py proponer --proyecto P   lee palabras.json, escribe decisiones.json y frases.txt (lista numerada)
  corte_limpio.py ver      --proyecto P   imprime la lista numerada de frases con tiempos y marcas de propuesta
  corte_limpio.py aplicar  --proyecto P   lee decisiones.json (ya editado) y escribe corte.json + corte-limpio.txt

Que propone (todo editable en decisiones.json):
  - repeticion / falso arranque: frases adyacentes parecidas -> se quita la anterior, se conserva la ultima
  - autocorreccion: «..., perdon, ...» que repite el inicio -> se quita lo dicho antes de corregirse
  - muletilla: eh, em, mm... (y «este», «o sea» como "revisar", sin aplicar por defecto)
  - silencio largo: se acorta a un respiro (por defecto 0.6 s), nunca se elimina del todo

El agente lee frases.txt y decide con el criterio de oficio: respiracion e intencion. Una repeticion
que es enfasis deliberado se conserva; una demostracion o un matiz se conserva. Marca "aplicar": false
en lo que no debe cortarse, o agrega en "manual": quitar_frases (ids), quitar_tramos ([[ini,fin]]), conservar_frases.

Los cortes siempre caen en los huecos entre palabras (nunca a media palabra) y se ajustan al punto de
menor energia del audio cerca de cada frontera para que no haya clics.
"""
from __future__ import annotations

import argparse
from array import array
from difflib import SequenceMatcher
from pathlib import Path

from _comun import correr, escribir_json, exe, fmt_tiempo, leer_json, normalizar, salir

UMBRAL_SILENCIO = 1.0     # hueco entre palabras que se acorta
RESPIRO = 0.6             # lo que queda de ese hueco
LEAD, TAIL = 0.12, 0.18   # aire que se conserva antes/despues de cada tramo
MULETILLAS = {"eh", "ehh", "ehhh", "em", "emm", "mm", "mmm", "mmmm", "ehm", "uh", "um", "aa", "aah", "hm", "hmm"}
MULETILLAS_REVISAR = {"este", "pues", "bueno"}
CORRECCION = {"perdon", "digo", "perdona", "corrijo", "rectifico"}


# ---------------------------------------------------------------- frases
def construir_frases(palabras: list[dict]) -> list[dict]:
    frases, ini = [], 0
    for k, p in enumerate(palabras):
        ultimo = k == len(palabras) - 1
        gap = (palabras[k + 1]["inicio"] - p["fin"]) if not ultimo else 99
        corta = (ultimo or p.get("fin_segmento") or p["w"].rstrip().endswith((".", "?", "!", "…"))
                 or gap >= 0.8 or (k - ini + 1) >= 20)
        if corta:
            tr = palabras[ini:k + 1]
            frases.append({"id": len(frases) + 1, "inicio": tr[0]["inicio"], "fin": tr[-1]["fin"],
                           "texto": " ".join(x["w"] for x in tr), "i0": ini, "i1": k})
            ini = k + 1
    return frases


def toks(txt: str) -> list[str]:
    return normalizar(txt).split()


def prefijo_comun(a: list[str], b: list[str]) -> int:
    n = 0
    for x, y in zip(a, b):
        if x == y or SequenceMatcher(None, x, y).ratio() >= 0.85:
            n += 1
        else:
            break
    return n


# ---------------------------------------------------------------- propuestas
def proponer_cortes(palabras: list[dict], frases: list[dict]) -> list[dict]:
    props: list[dict] = []

    def agregar(tipo, motivo, i0, i1, aplicar, frases_ids=()):
        props.append({"id": f"p{len(props) + 1}", "tipo": tipo, "motivo": motivo, "palabras": [i0, i1],
                      "frases": list(frases_ids), "inicio": palabras[i0]["inicio"], "fin": palabras[i1]["fin"],
                      "texto": " ".join(x["w"] for x in palabras[i0:i1 + 1]), "aplicar": aplicar})

    # repeticiones / falsos arranques entre frases adyacentes (y a salto de una, por la muletilla suelta)
    for k in range(len(frases) - 1):
        a, b = frases[k], frases[k + 1]
        ta, tb = toks(a["texto"]), toks(b["texto"])
        if len(ta) < 1 or len(tb) < 2:
            continue
        completa = SequenceMatcher(None, ta, tb).ratio()
        pref = prefijo_comun(ta, tb)
        if len(ta) >= 3 and completa >= 0.72:
            agregar("repeticion", f"frase repetida (parecido {completa:.2f}); se conserva la ultima", a["i0"], a["i1"], True, [a["id"]])
        elif len(ta) <= 6 and pref >= max(2, min(len(ta) - 1, 3)) and len(tb) > len(ta) and pref < len(tb):
            agregar("falso_arranque", f"empieza igual que la frase siguiente y queda inconclusa ({pref} palabras en comun)",
                    a["i0"], a["i1"], True, [a["id"]])
        elif len(ta) <= 3 and len(tb) >= 4 and pref >= 1 and (b["inicio"] - a["fin"]) < 0.9 and a["texto"][-1:] not in ".?!":
            agregar("falso_arranque", "arranque corto seguido de la frase completa; revisa si es enfasis", a["i0"], a["i1"], False, [a["id"]])

    # autocorreccion dentro de una frase: «X, perdon, X'»
    for f in frases:
        ws = palabras[f["i0"]:f["i1"] + 1]
        for off, p in enumerate(ws):
            if normalizar(p["w"]) in CORRECCION and 0 < off < len(ws) - 1:
                antes = toks(" ".join(x["w"] for x in ws[:off]))
                despues = toks(" ".join(x["w"] for x in ws[off + 1:]))
                if prefijo_comun(antes, despues) >= 2:
                    agregar("autocorreccion", f"se corrige a si mismo («{p['w']}»); se quita lo dicho antes de corregirse",
                            f["i0"], f["i0"] + off, True, [f["id"]])
                break

    # muletillas sueltas
    for k, p in enumerate(palabras):
        n = normalizar(p["w"])
        if n in MULETILLAS:
            agregar("muletilla", f"muletilla «{p['w']}»", k, k, True)
        elif n in MULETILLAS_REVISAR:
            pre = p["inicio"] - palabras[k - 1]["fin"] if k else 9
            post = palabras[k + 1]["inicio"] - p["fin"] if k + 1 < len(palabras) else 9
            if pre >= 0.25 or post >= 0.25:
                agregar("muletilla", f"«{p['w']}» aislado por pausas; puede ser muletilla o parte del discurso", k, k, False)
    return props


def proponer_silencios(palabras: list[dict]) -> list[dict]:
    sil = []
    for k in range(len(palabras) - 1):
        gap = palabras[k + 1]["inicio"] - palabras[k]["fin"]
        if gap >= UMBRAL_SILENCIO:
            sil.append({"id": f"s{len(sil) + 1}", "despues_de_palabra": k, "inicio": palabras[k]["fin"],
                        "fin": palabras[k + 1]["inicio"], "duracion": round(gap, 2), "aplicar": True, "respiro": RESPIRO})
    return sil


def escribir_lista(proyecto: Path, d: dict) -> str:
    marca: dict[int, list[str]] = {}
    for p in d["propuestas"]:
        for fid in p["frases"]:
            marca.setdefault(fid, []).append(f"{p['id']} {p['tipo']}{'' if p['aplicar'] else ' (revisar)'}")
    lineas = [f"# Frases de {Path(d['fuente']).name} · {fmt_tiempo(d['duracion'])}", ""]
    for f in d["frases"]:
        extra = f"   <<< {'; '.join(marca[f['id']])}" if f["id"] in marca else ""
        lineas.append(f"[{f['id']:>3}] {fmt_tiempo(f['inicio']):>7} - {fmt_tiempo(f['fin']):>7}  {f['texto']}{extra}")
    lineas += ["", "# Propuestas de muletilla/autocorreccion sueltas y silencios (ver decisiones.json)"]
    for p in d["propuestas"]:
        if not p["frases"]:
            lineas.append(f"  {p['id']} {p['tipo']} {fmt_tiempo(p['inicio'])}: «{p['texto']}» {'aplicar' if p['aplicar'] else 'revisar'}")
    for s in d["silencios"]:
        lineas.append(f"  {s['id']} silencio de {s['duracion']} s en {fmt_tiempo(s['inicio'])} -> respiro de {s['respiro']} s")
    txt = "\n".join(lineas) + "\n"
    (proyecto / "frases.txt").write_text(txt, encoding="utf-8")
    return txt


# ---------------------------------------------------------------- energia (para no cortar con clic)
class Energia:
    def __init__(self, fuente: str):
        self.sr = 8000
        r = correr([exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", fuente, "-vn", "-ac", "1", "-ar", str(self.sr),
                    "-f", "s16le", "-"])
        self.m = array("h")
        if r.returncode == 0 and r.stdout:
            self.m.frombytes(r.stdout[: len(r.stdout) // 2 * 2])

    def rms(self, t: float, ventana: float = 0.01) -> float:
        a = max(0, int((t - ventana / 2) * self.sr))
        b = min(len(self.m), int((t + ventana / 2) * self.sr))
        if b <= a:
            return 1e9
        s = sum(x * x for x in self.m[a:b])
        return (s / (b - a)) ** 0.5

    def minimo_cerca(self, t: float, lo: float, hi: float, radio: float = 0.07) -> float:
        """Punto de menor energia en [t-radio, t+radio] acotado a [lo, hi] (el hueco permitido)."""
        if not len(self.m) or hi <= lo:
            return min(max(t, lo), hi)
        a, b = max(lo, t - radio), min(hi, t + radio)
        if b <= a:
            return min(max(t, lo), hi)
        mejor, mt = 1e18, t
        paso = 0.005
        x = a
        while x <= b + 1e-9:
            e = self.rms(x) + abs(x - t) * 30  # leve preferencia por quedarse cerca
            if e < mejor:
                mejor, mt = e, x
            x += paso
        return round(mt, 3)


# ---------------------------------------------------------------- aplicar
def aplicar(proyecto: Path) -> dict:
    d = leer_json(proyecto / "decisiones.json")
    pj = leer_json(proyecto / "palabras.json")
    palabras = pj["palabras"]
    n = len(palabras)
    mantener = [True] * n
    for p in d["propuestas"]:
        if p.get("aplicar"):
            for i in range(p["palabras"][0], p["palabras"][1] + 1):
                mantener[i] = False
    man = d.get("manual", {})
    by_id = {f["id"]: f for f in d["frases"]}
    for fid in man.get("quitar_frases", []):
        f = by_id[int(fid)]
        for i in range(f["i0"], f["i1"] + 1):
            mantener[i] = False
    for ini, fin in man.get("quitar_tramos", []):
        for i, p in enumerate(palabras):
            if ini <= (p["inicio"] + p["fin"]) / 2 <= fin:
                mantener[i] = False
    for fid in man.get("conservar_frases", []):
        f = by_id[int(fid)]
        for i in range(f["i0"], f["i1"] + 1):
            mantener[i] = True

    cortes_silencio = {s["despues_de_palabra"]: s.get("respiro", RESPIRO) for s in d["silencios"] if s.get("aplicar")}

    # tramos de palabras conservadas contiguas
    runs: list[tuple[int, int]] = []
    k = 0
    while k < n:
        if not mantener[k]:
            k += 1
            continue
        j = k
        while j + 1 < n and mantener[j + 1] and j not in cortes_silencio:
            j += 1
        runs.append((k, j))
        k = j + 1

    energia = Energia(pj["fuente"] if Path(pj["fuente"]).is_file() else d["fuente"])
    dur = pj.get("duracion") or palabras[-1]["fin"]
    segs: list[dict] = []
    for (ka, kb) in runs:
        prev_fin = palabras[ka - 1]["fin"] if ka > 0 else 0.0
        sig_ini = palabras[kb + 1]["inicio"] if kb + 1 < n else dur
        gap_prev, gap_sig = palabras[ka]["inicio"] - prev_fin, sig_ini - palabras[kb]["fin"]
        lead = min(LEAD, gap_prev / 2) if (ka - 1) not in cortes_silencio else min(cortes_silencio[ka - 1] / 2, gap_prev / 2)
        tail = min(TAIL, gap_sig / 2) if kb not in cortes_silencio else min(cortes_silencio[kb] / 2, gap_sig / 2)
        ini = palabras[ka]["inicio"] - max(lead, 0.0)
        fin = palabras[kb]["fin"] + max(tail, 0.0)
        # ajuste fino: menor energia dentro del hueco libre (no pisa palabras vecinas)
        ini = energia.minimo_cerca(ini, prev_fin, palabras[ka]["inicio"])
        fin = energia.minimo_cerca(fin, palabras[kb]["fin"], sig_ini)
        segs.append({"inicio": round(max(0.0, ini), 3), "fin": round(min(dur, fin), 3),
                     "texto": " ".join(x["w"] for x in palabras[ka:kb + 1])})
    # fusionar los que se tocan
    fus: list[dict] = []
    for s in segs:
        if fus and s["inicio"] <= fus[-1]["fin"] + 0.02:
            fus[-1]["fin"] = max(fus[-1]["fin"], s["fin"])
            fus[-1]["texto"] += " " + s["texto"]
        else:
            fus.append(dict(s))
    total = sum(s["fin"] - s["inicio"] for s in fus)
    quitadas = sum(1 for m in mantener if not m)
    corte = {"fuente": pj["fuente"], "duracion_original": round(dur, 3), "duracion_resultante": round(total, 3),
             "palabras_quitadas": quitadas, "segmentos": fus}
    escribir_json(proyecto / "corte.json", corte)
    (proyecto / "corte-limpio.txt").write_text(
        "\n".join(f"{i + 1:>2}. {fmt_tiempo(s['inicio'])}-{fmt_tiempo(s['fin'])}  {s['texto']}" for i, s in enumerate(fus)) + "\n",
        encoding="utf-8")
    return corte


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("accion", choices=["proponer", "ver", "aplicar"])
    ap.add_argument("--proyecto", required=True)
    a = ap.parse_args()
    proyecto = Path(a.proyecto).expanduser().resolve()
    if not (proyecto / "palabras.json").is_file():
        salir(f"Falta {proyecto / 'palabras.json'}: corre primero transcribir.py")

    if a.accion == "proponer":
        pj = leer_json(proyecto / "palabras.json")
        palabras = pj["palabras"]
        frases = construir_frases(palabras)
        d = {"fuente": pj["fuente"], "duracion": pj["duracion"],
             "instrucciones": "Lee frases.txt y decide por significado. Cambia 'aplicar' a false en lo que NO debe cortarse, "
                              "a true en lo que si; agrega en 'manual' quitar_frases / quitar_tramos / conservar_frases. "
                              "Luego: corte_limpio.py aplicar",
             "frases": frases, "propuestas": proponer_cortes(palabras, frases), "silencios": proponer_silencios(palabras),
             "manual": {"quitar_frases": [], "quitar_tramos": [], "conservar_frases": []}}
        escribir_json(proyecto / "decisiones.json", d)
        print(escribir_lista(proyecto, d))
        print(f"decisiones: {proyecto / 'decisiones.json'}\nlista: {proyecto / 'frases.txt'}")
    elif a.accion == "ver":
        d = leer_json(proyecto / "decisiones.json")
        print(escribir_lista(proyecto, d))
    else:
        if not (proyecto / "decisiones.json").is_file():
            salir("Falta decisiones.json: corre primero 'proponer'.")
        c = aplicar(proyecto)
        print(f"Corte limpio: {fmt_tiempo(c['duracion_original'])} -> {fmt_tiempo(c['duracion_resultante'])} "
              f"({len(c['segmentos'])} tramos, {c['palabras_quitadas']} palabras quitadas)\n{proyecto / 'corte.json'}")


if __name__ == "__main__":
    main()
