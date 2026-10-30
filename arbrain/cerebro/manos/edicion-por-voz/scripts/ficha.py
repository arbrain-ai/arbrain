#!/usr/bin/env python3
"""Ficha de marca del dueño: se crea UNA vez por conversacion y se reutiliza siempre.

Vive en ~/.cerebro/ficha-de-marca.json (o $CEREBRO_HOME). Un proyecto puede traer la suya
(<proyecto>/ficha-de-marca.json) y gana sobre la global.

Uso:
  ficha.py preguntas                       # las 5 preguntas, en orden, para hacerlas una a una
  ficha.py ver [--proyecto P]              # imprime la ficha efectiva (o dice que falta)
  ficha.py guardar --json '{...}' [--proyecto P]   # fusiona campos en la ficha (la crea si no existe)
  ficha.py validar [--proyecto P]
  ficha.py proveedor [--proyecto P]        # que proveedor recibiria el audio y si ya se confirmo
  ficha.py confirmar-proveedor --proveedor groq [--proyecto P]   # SOLO tras decirselo al dueño
  ficha.py plantilla                       # imprime la ficha de ejemplo neutra
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from _comun import casa_cerebro, escribir_json, leer_json, salir

PLANTILLA = Path(__file__).resolve().parent.parent / "references" / "ficha-de-marca.ejemplo.json"

PREGUNTAS = [
    ("colores_y_logo", "¿Qué colores representan tu marca? Dime uno o dos en hex (o descríbelos) y, si tienes logo, la ruta del archivo."),
    ("tono", "¿Cómo suena tu contenido y a quién le hablas? Una frase de cada cosa (por ejemplo: «directo y cálido, a dueños de negocios pequeños»)."),
    ("referentes", "Dime 2 o 3 videos que te gusten como vara (URL o archivo) y qué te gusta de cada uno."),
    ("ritmo_y_subtitulos", "¿Prefieres ritmo calmado, medio o rápido? ¿Y subtítulos: ninguno, solo en frases clave o en cada frase?"),
    ("privacidad", "Para transcribir, el audio de tus videos se envía al proveedor que tengas configurado (OpenAI, Groq o LemonFox). ¿Estás de acuerdo con ese envío? Lo preguntamos solo esta vez."),
]

CAMPOS_REQUERIDOS = ["paleta", "tono", "preferencias"]


def ruta_ficha(proyecto: str | None) -> Path:
    if proyecto:
        p = Path(proyecto).expanduser() / "ficha-de-marca.json"
        if p.is_file():
            return p
    return casa_cerebro() / "ficha-de-marca.json"


def cargar(proyecto: str | None) -> dict | None:
    r = ruta_ficha(proyecto)
    return leer_json(r) if r.is_file() else None


def ficha_o_neutra(proyecto: str | None) -> dict:
    """Para render: la ficha del dueño o, si aun no existe, la neutra de ejemplo."""
    return cargar(proyecto) or leer_json(PLANTILLA)


def fusionar(base: dict, nuevo: dict) -> dict:
    for k, v in nuevo.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            fusionar(base[k], v)
        else:
            base[k] = v
    return base


def validar(f: dict) -> list[str]:
    fallas = []
    for c in CAMPOS_REQUERIDOS:
        if c not in f:
            fallas.append(f"falta '{c}'")
    pal = f.get("paleta", {})
    for c in ("primario", "texto"):
        if c not in pal:
            fallas.append(f"paleta.{c} falta")
    for k, v in pal.items():
        if isinstance(v, str) and v.startswith("#") and len(v) != 7:
            fallas.append(f"paleta.{k} no es hex de 6 digitos: {v}")
    if len(f.get("referentes", [])) > 3:
        fallas.append("referentes: maximo 3")
    return fallas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for n in ("ver", "validar", "proveedor", "guardar", "confirmar-proveedor"):
        s = sub.add_parser(n)
        s.add_argument("--proyecto")
        if n == "guardar":
            s.add_argument("--json", required=True, help="Campos a fusionar en la ficha (JSON)")
            s.add_argument("--en-proyecto", action="store_true", help="Guardar en <proyecto>/ficha-de-marca.json")
        if n == "confirmar-proveedor":
            s.add_argument("--proveedor", required=True, choices=["openai", "groq", "lemonfox", "local"])
    sub.add_parser("preguntas")
    sub.add_parser("plantilla")
    a = ap.parse_args()

    if a.cmd == "preguntas":
        for i, (clave, texto) in enumerate(PREGUNTAS, 1):
            print(f"{i}. [{clave}] {texto}")
        print("\nHazlas UNA a UNA (espera la respuesta antes de la siguiente) y guarda con: ficha.py guardar --json '{...}'")
        return
    if a.cmd == "plantilla":
        print(PLANTILLA.read_text(encoding="utf-8"))
        return

    if a.cmd == "ver":
        f = cargar(a.proyecto)
        if not f:
            print(json.dumps({"existe": False, "ruta": str(casa_cerebro() / "ficha-de-marca.json"),
                              "nota": "Aun no hay ficha: haz las 5 preguntas (ficha.py preguntas). Mientras tanto el render usa la plantilla neutra."},
                             ensure_ascii=False, indent=2))
        else:
            print(json.dumps({"existe": True, "ruta": str(ruta_ficha(a.proyecto)), "ficha": f}, ensure_ascii=False, indent=2))
        return

    if a.cmd == "validar":
        f = cargar(a.proyecto)
        if not f:
            salir("No hay ficha. Crea una con las 5 preguntas.")
        fallas = validar(f)
        print("OK" if not fallas else "FALLAS: " + "; ".join(fallas))
        raise SystemExit(0 if not fallas else 2)

    if a.cmd == "guardar":
        try:
            nuevo = json.loads(a.json)
        except json.JSONDecodeError as e:
            salir(f"--json no es JSON valido: {e}")
        destino = (Path(a.proyecto).expanduser() / "ficha-de-marca.json") if (a.en_proyecto and a.proyecto) else casa_cerebro() / "ficha-de-marca.json"
        base = leer_json(destino) if destino.is_file() else {"version": 1}
        fusionar(base, nuevo)
        base["actualizada"] = dt.date.today().isoformat()
        escribir_json(destino, base)
        print(f"Ficha guardada en {destino}")
        fallas = validar(base)
        if fallas:
            print("Aun incompleta: " + "; ".join(fallas))
        return

    if a.cmd == "proveedor":
        from transcribir import detectar_proveedor  # import tardio: evita ciclo

        f = cargar(a.proyecto) or {}
        priv = f.get("privacidad", {})
        prov = detectar_proveedor(Path(a.proyecto).expanduser() if a.proyecto else None, solo_nombre=True)
        print(json.dumps({"proveedor_detectado": prov, "confirmado": priv.get("proveedor_confirmado"),
                          "fecha": priv.get("confirmado_en"),
                          "hay_que_preguntar": prov is not None and priv.get("proveedor_confirmado") != prov},
                         ensure_ascii=False, indent=2))
        return

    if a.cmd == "confirmar-proveedor":
        destino = casa_cerebro() / "ficha-de-marca.json"
        if a.proyecto and (Path(a.proyecto).expanduser() / "ficha-de-marca.json").is_file():
            destino = Path(a.proyecto).expanduser() / "ficha-de-marca.json"
        base = leer_json(destino) if destino.is_file() else {"version": 1}
        base.setdefault("privacidad", {}).update({"proveedor_confirmado": a.proveedor,
                                                  "confirmado_en": dt.datetime.now().isoformat(timespec="seconds")})
        escribir_json(destino, base)
        print(f"Confirmado el envio de audio a '{a.proveedor}' (guardado en {destino}).")


if __name__ == "__main__":
    main()
