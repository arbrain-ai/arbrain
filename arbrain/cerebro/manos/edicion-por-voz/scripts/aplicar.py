#!/usr/bin/env python3
"""Pulir hablando: traduce lo que dice el dueño a operaciones sobre el edicion.json de ESA version y
re-renderiza como revision nueva (v2 -> v2.1 -> v2.2), conservando la anterior.

  aplicar.py nueva  --proyecto P --nombre v1 --plantilla sobria|dinamica|limpia [--sin-render]
  aplicar.py op     --ruta /abs/versiones/v2.mp4 --ops '[...]' [--tiempo 130.4] [--mensaje "..."]
  aplicar.py op     --proyecto P --version v2 --ops-archivo ops.json
  aplicar.py siguiente --proyecto P --version v2       # nombre de la proxima revision (v2.1, v2.2 ...)
  aplicar.py validar --ruta versiones/v2.edicion.json  # revisa un edicion.json escrito a mano por un editor
  aplicar.py mensaje --texto "⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/v2.mp4\\nquita esto"
  aplicar.py tiempo --ruta /abs/v2.mp4 --tiempo 130.4         # version -> fuente (y de vuelta)

MENSAJE DEL VISOR. El visor de Arbrain deja marcar un instante y manda al agente un mensaje cuya primera
linea es EXACTAMENTE:
    ⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/ruta/v2.mp4
seguida del comentario del dueño. Ese tiempo es de la LINEA DE TIEMPO DE LA VERSION MIRADA (no de la fuente):
aplicar.py lo mapea a tiempo de fuente con los cortes y velocidades de esa version. «quita el minuto 2:10» tambien
es tiempo de la version que mira. Pasa --mensaje con el texto completo o --tiempo/--ruta ya separados.

OPERACIONES (lista JSON; tiempos en segundos de la VERSION salvo "fuente": true):
  {"op":"quitar_tramo","desde":128,"hasta":131}       o con --tiempo: {"op":"quitar_tramo","alrededor":1.5}
  {"op":"quitar_frase"}                                 la frase que se dice en la marca (o {"en": 130.4})
  Varias marcas en un mensaje: {"op":"quitar_frase","marca":2} (1 = la primera, ordenadas por tiempo).
  {"op":"acelerar","desde":0,"hasta":40,"velocidad":1.15}   (absoluta; 1.0 = normal; o "factor":1.1 relativo)
  {"op":"apretar_pausas","desde":0,"hasta":60,"pausa_max":0.35}   recorta pausas internas
  {"op":"subtitulos","modo":"frases_clave|por_frase|ninguno"}
  {"op":"subtitulo","desde":10,"hasta":13,"texto":"Tres prioridades","destacar":true}   agrega uno a mano
  {"op":"quitar_subtitulo","en":12}
  {"op":"tarjeta","en":130.4,"texto":"Tres prioridades"}   la frase en grande a casi pantalla completa 1.2-2 s
  {"op":"quitar_tarjetas"}
  {"op":"zoom","en":130.4,"duracion":2.4,"escala":1.12,"foco_x":0.5}   o desde/hasta
  {"op":"quitar_zoom","desde":0,"hasta":60}
  {"op":"vertical","duracion_max":40,"desde":0,"foco_x":0.5,"modo":"recorte|fondo_difuso"}
  {"op":"logo","activo":false}
TODOS los tiempos son de la version original que mira el dueño: se traducen juntos antes de ejecutar, asi que varias operaciones no se desplazan entre si.
Orden cronologico siempre; reordenar fragmentos no esta soportado en la ruta ligera.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from pathlib import Path

import _edicion as E
from _comun import escribir_json, fmt_tiempo, leer_json, parse_tiempo, salir
from abrir import payload_version

PATRON_MENSAJE = re.compile(r"⏱\s*(?P<tipo>Video|Audio)\s*«(?P<archivo>[^»]*)»\s*·\s*(?P<legible>[^(]*?)\s*\(tiempo=(?P<t>[0-9.,:]+)\)\s*·\s*ruta=(?P<ruta>.+)")


def parsear_mensaje(texto: str) -> dict:
    """Parsea el mensaje del visor. Puede traer VARIAS marcas: bloques separados por una linea en blanco, cada uno con
    su cabecera ⏱ y su comentario (ordenados por tiempo). Devuelve {marcas:[{tipo,archivo,tiempo,ruta,comentario}], ...}
    y, por comodidad, los campos de la PRIMERA marca (archivo, tiempo, ruta, comentario) en la raiz."""
    marcas, actual = [], None
    for linea in texto.strip().splitlines():
        m = PATRON_MENSAJE.search(linea)
        if m and linea.lstrip().startswith("⏱"):
            actual = {"tipo": m["tipo"], "archivo": m["archivo"].strip(), "tiempo": parse_tiempo(m["t"]),
                      "ruta": os.path.realpath(m["ruta"].strip()), "legible": m["legible"].strip(), "_com": []}
            marcas.append(actual)
        elif actual is not None:
            actual["_com"].append(linea)
    for mk in marcas:
        mk["comentario"] = "\n".join(mk.pop("_com")).strip()
    if not marcas:
        return {"marcas": [], "archivo": None, "tiempo": None, "ruta": None, "comentario": texto.strip()}
    return {"marcas": marcas, **{k: marcas[0][k] for k in ("archivo", "tiempo", "ruta", "comentario")}}


def separar_nombre(nombre: str) -> tuple[str, int]:
    m = re.match(r"^(.*?)(?:\.(\d+))?$", nombre)
    return m.group(1), int(m.group(2) or 0)


def siguiente_nombre(vdir: Path, nombre: str) -> str:
    base, _ = separar_nombre(nombre)
    mayor = 0
    for p in vdir.glob(f"{base}.*.edicion.json"):
        mm = re.match(rf"^{re.escape(base)}\.(\d+)\.edicion\.json$", p.name)
        if mm:
            mayor = max(mayor, int(mm.group(1)))
    return f"{base}.{mayor + 1}"


# ---------------------------------------------------------------- operaciones
# Los tiempos que da el dueño son de la VERSION ORIGINAL que mira. Antes de ejecutar nada, TODAS las operaciones se
# traducen a tiempo de fuente contra esa version (asi varias operaciones o varias marcas no se desplazan entre si).
RADIO_POR_DEFECTO = {"quitar_tramo": 1.5, "acelerar": 4.0, "ritmo": 4.0, "quitar_zoom": 3.0, "subtitulo": 1.2, "zoom": 1.2}


def a_fuente(op: dict, cortes0: list[dict], marcas: list[float]) -> dict:
    op = dict(op)
    if op.get("fuente"):
        return op
    v2f = lambda t: round(E.version_a_fuente(cortes0, parse_tiempo(t)), 3)  # noqa: E731
    ref = None
    if "marca" in op:
        if not 1 <= int(op["marca"]) <= len(marcas):
            salir(f"La operacion pide la marca {op['marca']} pero solo hay {len(marcas)}.")
        ref = marcas[int(op["marca"]) - 1]
    elif "en" in op:
        ref = parse_tiempo(op["en"])
    elif "desde" not in op and marcas:
        ref = marcas[0]
    if "desde" in op and "hasta" in op:
        op["desde"], op["hasta"] = v2f(op["desde"]), v2f(op["hasta"])
    elif ref is not None:
        r = float(op.get("alrededor", float(op.get("duracion", 0)) / 2 or RADIO_POR_DEFECTO.get(op["op"], 1.5)))
        op["desde"], op["hasta"] = v2f(max(0.0, ref - r)), v2f(ref + r)
    if ref is not None:
        op["en"] = v2f(ref)
    op["fuente"] = True
    return op


class Contexto:
    def __init__(self, ed: dict, proyecto: Path):
        self.ed, self.proyecto = ed, proyecto
        self.palabras = E.cargar_palabras(proyecto, ed)
        self.notas: list[str] = []

    def req(self, op: dict, *claves: str):
        for k in claves:
            if k not in op:
                salir(f"La operacion {op['op']} necesita {', '.join(claves)} o una marca de tiempo (--tiempo / mensaje del visor).")


def _vt(cx: Contexto, f: float) -> str:  # tiempo de fuente -> texto de la version original (para las notas)
    return fmt_tiempo(f)


def op_quitar_tramo(cx: Contexto, op: dict):
    cx.req(op, "desde", "hasta")
    antes = E.duracion_salida(cx.ed["cortes"])
    cx.ed["cortes"] = E.quitar_fuente(cx.ed["cortes"], op["desde"], op["hasta"])
    cx.notas.append(f"quitar_tramo fuente {_vt(cx, op['desde'])}-{_vt(cx, op['hasta'])} ({antes - E.duracion_salida(cx.ed['cortes']):.1f} s menos)")


def op_quitar_frase(cx: Contexto, op: dict):
    cx.req(op, "en")
    s = op["en"]
    fr = E.frases_de(cx.palabras)
    hit = next((f for f in fr if f["inicio"] - 0.05 <= s <= f["fin"] + 0.05), None) or \
        min(fr, key=lambda f: min(abs(f["inicio"] - s), abs(f["fin"] - s)))
    k = fr.index(hit)
    ant = fr[k - 1]["fin"] if k else 0.0
    sig = fr[k + 1]["inicio"] if k + 1 < len(fr) else hit["fin"] + 0.3
    a = hit["inicio"] - min(0.12, (hit["inicio"] - ant) / 2)
    b = hit["fin"] + min(0.18, (sig - hit["fin"]) / 2)
    antes = E.duracion_salida(cx.ed["cortes"])
    cx.ed["cortes"] = E.quitar_fuente(cx.ed["cortes"], a, b)
    cx.notas.append(f"quitar_frase «{hit['texto']}» ({fmt_tiempo(hit['inicio'])}-{fmt_tiempo(hit['fin'])} de la fuente, "
                    f"{antes - E.duracion_salida(cx.ed['cortes']):.1f} s menos)")


def op_acelerar(cx: Contexto, op: dict):
    cx.req(op, "desde", "hasta")
    fa, fb = op["desde"], op["hasta"]
    if "factor" in op:  # relativo: se aplica por tramo
        for c in [c for c in cx.ed["cortes"] if c["fin"] > fa and c["inicio"] < fb]:
            v = min(max(c["velocidad"] * float(op["factor"]), E.VELOCIDAD_MIN), E.VELOCIDAD_MAX)
            cx.ed["cortes"] = E.velocidad_fuente(cx.ed["cortes"], max(fa, c["inicio"]), min(fb, c["fin"]), v)
    else:
        cx.ed["cortes"] = E.velocidad_fuente(cx.ed["cortes"], fa, fb, min(max(float(op["velocidad"]), E.VELOCIDAD_MIN), E.VELOCIDAD_MAX))
    cx.notas.append(f"acelerar fuente {fmt_tiempo(fa)}-{fmt_tiempo(fb)} -> {op.get('velocidad', op.get('factor'))}x")


def op_apretar_pausas(cx: Contexto, op: dict):
    from _comun import resolver_fuente

    pmax = float(op.get("pausa_max", 0.35))
    fa = op.get("desde", 0.0)
    fb = op.get("hasta", 1e9)
    antes = E.duracion_salida(cx.ed["cortes"])
    acotado = [c for c in cx.ed["cortes"] if c["fin"] > fa and c["inicio"] < fb]
    resto = [c for c in cx.ed["cortes"] if c not in acotado]
    nuevo = E.topar_pausas(acotado, cx.palabras, pmax, resolver_fuente(cx.ed, cx.proyecto))
    cx.ed["cortes"] = sorted(resto + nuevo, key=lambda c: c["inicio"])
    cx.notas.append(f"apretar_pausas a {pmax} s ({antes - E.duracion_salida(cx.ed['cortes']):.1f} s menos)")


def op_subtitulos(cx: Contexto, op: dict):
    E.regenerar_subtitulos(cx.ed, cx.palabras, op["modo"])
    cx.notas.append(f"subtitulos modo {op['modo']} ({len(cx.ed['subtitulos']['frases'])} frases)")


def op_subtitulo(cx: Contexto, op: dict):
    cx.req(op, "desde", "hasta")
    cx.ed["subtitulos"].setdefault("frases", []).append({"inicio": round(op["desde"], 3), "fin": round(max(op["hasta"], op["desde"] + 0.8), 3),
                                                         "texto": op["texto"], **({"destacar": True} if op.get("destacar", True) else {})})
    cx.ed["subtitulos"]["frases"].sort(key=lambda s: s["inicio"])
    if cx.ed["subtitulos"].get("modo") == "ninguno":
        cx.ed["subtitulos"]["modo"] = "frases_clave"
    cx.notas.append(f"subtitulo «{op['texto']}»")


def op_quitar_subtitulo(cx: Contexto, op: dict):
    cx.req(op, "en")
    antes = len(cx.ed["subtitulos"]["frases"])
    cx.ed["subtitulos"]["frases"] = [f for f in cx.ed["subtitulos"]["frases"] if not (f["inicio"] - 0.1 <= op["en"] <= f["fin"] + 0.1)]
    cx.notas.append(f"quitar_subtitulo ({antes - len(cx.ed['subtitulos']['frases'])} quitados)")


def op_zoom(cx: Contexto, op: dict):
    cx.req(op, "desde", "hasta")
    cx.ed["zooms"].append({"inicio": round(op["desde"], 3), "fin": round(op["hasta"], 3), "escala": float(op.get("escala", 1.12)),
                           "foco_x": float(op.get("foco_x", 0.5)), "foco_y": float(op.get("foco_y", 0.42))})
    cx.ed["zooms"].sort(key=lambda z: z["inicio"])
    cx.notas.append(f"zoom {op.get('escala', 1.12)}x en fuente {fmt_tiempo(op['desde'])}-{fmt_tiempo(op['hasta'])}")


def op_tarjeta(cx: Contexto, op: dict):
    cx.req(op, "desde", "texto")
    ini = op["desde"]
    fin = min(max(op.get("hasta", ini + 1.6), ini + 1.2), ini + 2.0)
    cx.ed.setdefault("tarjetas", []).append({"inicio": round(ini, 3), "fin": round(fin, 3), "texto": op["texto"]})
    cx.ed["tarjetas"].sort(key=lambda t: t["inicio"])
    cx.notas.append(f"tarjeta de frase clave «{op['texto']}»")


def op_quitar_tarjetas(cx: Contexto, op: dict):
    fa, fb = op.get("desde", 0.0), op.get("hasta", 1e9)
    antes = len(cx.ed.get("tarjetas", []))
    cx.ed["tarjetas"] = [t for t in cx.ed.get("tarjetas", []) if t["fin"] < fa or t["inicio"] > fb]
    cx.notas.append(f"quitar_tarjetas ({antes - len(cx.ed['tarjetas'])} quitadas)")


def op_quitar_zoom(cx: Contexto, op: dict):
    fa, fb = op.get("desde", 0.0), op.get("hasta", 1e9)
    antes = len(cx.ed["zooms"])
    cx.ed["zooms"] = [z for z in cx.ed["zooms"] if z["fin"] < fa or z["inicio"] > fb]
    cx.notas.append(f"quitar_zoom ({antes - len(cx.ed['zooms'])} quitados)")


def op_vertical(cx: Contexto, op: dict):
    v = cx.ed.setdefault("vertical", {})
    for k in ("duracion_max", "desde", "foco_x", "modo"):
        if k in op:
            v[k] = op[k]
    cx.notas.append(f"vertical { {k: v.get(k) for k in ('duracion_max', 'desde', 'foco_x', 'modo')} }")


def op_logo(cx: Contexto, op: dict):
    cx.ed.setdefault("marca", {})["logo"] = bool(op.get("activo", True))
    cx.notas.append(f"logo {'si' if cx.ed['marca']['logo'] else 'no'}")


OPS = {"quitar_tramo": op_quitar_tramo, "quitar_frase": op_quitar_frase, "acelerar": op_acelerar, "ritmo": op_acelerar,
       "apretar_pausas": op_apretar_pausas, "subtitulos": op_subtitulos, "subtitulo": op_subtitulo,
       "quitar_subtitulo": op_quitar_subtitulo, "tarjeta": op_tarjeta, "quitar_tarjetas": op_quitar_tarjetas, "zoom": op_zoom, "quitar_zoom": op_quitar_zoom, "vertical": op_vertical,
       "logo": op_logo}
SIN_TIEMPO = {"subtitulos", "vertical", "logo", "apretar_pausas"}  # no necesitan marca


# ---------------------------------------------------------------- comandos
def render_borrador(ed_ruta: Path, proyecto: Path) -> dict:
    from render import render

    return render(ed_ruta, "horizontal", "borrador", proyecto=proyecto)


def cmd_nueva(a) -> None:
    from ficha import ficha_o_neutra
    from _comun import sondear, resolver_fuente

    proyecto = Path(a.proyecto).expanduser().resolve()
    corte = leer_json(proyecto / "corte.json")
    pj = leer_json(proyecto / "palabras.json")
    fuente = Path(corte["fuente"])
    try:
        fuente_rel = fuente.relative_to(proyecto).as_posix()
    except ValueError:
        fuente_rel = str(fuente)
    fps = min(round(sondear(fuente)["fps"] or 30), 30)
    ed = E.construir_plantilla(a.plantilla, a.nombre, corte, fuente_rel, fps, pj["palabras"], ficha_o_neutra(str(proyecto)), str(fuente))
    ed["historial"].append({"fecha": dt.datetime.now().isoformat(timespec="seconds"), "creada_con": a.plantilla})
    ruta = escribir_json(proyecto / "versiones" / f"{a.nombre}.edicion.json", ed)
    salida = {"edicion": str(ruta), "plantilla": a.plantilla, "duracion_estimada": round(E.duracion_salida(ed["cortes"]), 2)}
    if not a.sin_render:
        salida["render"] = render_borrador(ruta, proyecto)
        salida["mostrar"] = payload_version(salida["render"]["salida"])
    print(json.dumps(salida, ensure_ascii=False, indent=2))


def cmd_op(a) -> None:
    marcas: list[float] = []
    comentario = ""
    if a.mensaje:
        m = parsear_mensaje(a.mensaje)
        comentario = "\n".join(mk["comentario"] for mk in m["marcas"]) if m["marcas"] else m["comentario"]
        marcas = [mk["tiempo"] for mk in m["marcas"]]
        if m["ruta"] and not a.ruta:
            a.ruta = m["ruta"]
    if a.tiempo is not None:
        marcas = [a.tiempo] + marcas
    if a.ruta:
        mp4 = Path(os.path.realpath(Path(a.ruta).expanduser()))
        nombre = mp4.name[:-len(".vertical.mp4")] if mp4.name.endswith(".vertical.mp4") else mp4.stem
        ruta_ed = mp4.with_name(f"{nombre}.edicion.json")
        proyecto = mp4.parent.parent
    else:
        if not (a.proyecto and a.version):
            salir("Indica --ruta del mp4 de la version, o --proyecto y --version.")
        proyecto = Path(a.proyecto).expanduser().resolve()
        nombre = a.version
        ruta_ed = proyecto / "versiones" / f"{nombre}.edicion.json"
    if not ruta_ed.is_file():
        salir(f"No existe {ruta_ed}")
    ed = leer_json(ruta_ed)
    if a.ops_archivo:
        ops = leer_json(a.ops_archivo)
    elif a.ops:
        ops = json.loads(a.ops)
    else:
        salir("Falta --ops o --ops-archivo: traduce la peticion del dueño a operaciones (ver --help).")
    ops = ops if isinstance(ops, list) else [ops]
    cortes0 = [dict(c) for c in ed["cortes"]]
    duracion_antes = E.duracion_salida(cortes0)
    cx = Contexto(ed, proyecto)
    fuente_marcas = [round(E.version_a_fuente(cortes0, t), 3) for t in marcas]
    for op in ops:
        if op.get("op") not in OPS:
            salir(f"Operacion desconocida '{op.get('op')}'. Validas: {', '.join(OPS)}")
    for op in ops:  # todo se traduce primero contra la version ORIGINAL, luego se ejecuta en orden
        OPS[op["op"]](cx, op if op["op"] in SIN_TIEMPO and "desde" not in op else a_fuente(op, cortes0, marcas))
    ed["cortes"] = E.normalizar_cortes(ed["cortes"], ed.get("fps", 30))
    if not ed["cortes"]:
        salir("Despues de esas operaciones no queda video. No se guardo nada.")
    nuevo = siguiente_nombre(ruta_ed.parent, nombre)
    ed["nombre"], ed["base"] = nuevo, nombre
    ed["historial"].append({"fecha": dt.datetime.now().isoformat(timespec="seconds"), "de": nombre, "ops": ops,
                            "mensaje": comentario or a.mensaje, "marcas_version": marcas, "marcas_fuente": fuente_marcas})
    nueva_ed = escribir_json(ruta_ed.with_name(f"{nuevo}.edicion.json"), ed)
    res = {"nueva_revision": nuevo, "edicion": str(nueva_ed), "base": nombre, "cambios": cx.notas,
           "tiempo_marcado": {"version": marcas[0] if marcas else None, "fuente": fuente_marcas[0] if fuente_marcas else None,
                              "todas_version": marcas, "todas_fuente": fuente_marcas},
           "duracion_antes": round(duracion_antes, 2), "duracion_despues": round(E.duracion_salida(ed["cortes"]), 2)}
    if not a.sin_render:
        res["render"] = render_borrador(nueva_ed, proyecto)
        t_nuevo = E.fuente_a_version(ed["cortes"], fuente_marcas[0]) if fuente_marcas else None
        res["mostrar"] = payload_version(res["render"]["salida"], comparar=ruta_ed.with_name(f"{nombre}.mp4"), tiempo=t_nuevo,
                                         titulo=nuevo)
    print(json.dumps(res, ensure_ascii=False, indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("nueva")
    n.add_argument("--proyecto", required=True)
    n.add_argument("--nombre", required=True)
    n.add_argument("--plantilla", choices=["sobria", "dinamica", "limpia"], default="sobria")
    n.add_argument("--sin-render", action="store_true")
    o = sub.add_parser("op")
    o.add_argument("--ruta")
    o.add_argument("--proyecto")
    o.add_argument("--version")
    o.add_argument("--ops")
    o.add_argument("--ops-archivo")
    o.add_argument("--tiempo", type=parse_tiempo)
    o.add_argument("--mensaje")
    o.add_argument("--sin-render", action="store_true")
    m = sub.add_parser("mensaje")
    m.add_argument("--texto", required=True)
    sg = sub.add_parser("siguiente")
    sg.add_argument("--proyecto", required=True)
    sg.add_argument("--version", required=True)
    va = sub.add_parser("validar")
    va.add_argument("--ruta", required=True, help="Ruta de un .edicion.json")
    t = sub.add_parser("tiempo")
    t.add_argument("--ruta", required=True)
    t.add_argument("--tiempo", type=parse_tiempo, required=True)
    a = ap.parse_args()

    if a.cmd == "nueva":
        cmd_nueva(a)
    elif a.cmd == "op":
        cmd_op(a)
    elif a.cmd == "siguiente":
        print(siguiente_nombre(Path(a.proyecto).expanduser().resolve() / "versiones", a.version))
    elif a.cmd == "validar":
        ruta = Path(a.ruta).expanduser().resolve()
        problemas = E.validar_edicion(leer_json(ruta), ruta.parent.parent)
        print("OK" if not problemas else "PROBLEMAS:\n- " + "\n- ".join(problemas))
        raise SystemExit(0 if not problemas else 2)
    elif a.cmd == "mensaje":
        print(json.dumps(parsear_mensaje(a.texto.replace("\\n", "\n")), ensure_ascii=False, indent=2))
    else:
        mp4 = Path(a.ruta).expanduser().resolve()
        ed = leer_json(mp4.with_name(f"{mp4.stem}.edicion.json"))
        f = E.version_a_fuente(ed["cortes"], a.tiempo)
        print(json.dumps({"tiempo_version": a.tiempo, "tiempo_fuente": round(f, 3),
                          "de_vuelta": round(E.fuente_a_version(ed["cortes"], f) or 0, 3)}, indent=2))


if __name__ == "__main__":
    main()
