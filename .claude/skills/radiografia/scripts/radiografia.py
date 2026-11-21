#!/usr/bin/env python3
"""Radiografía de un negocio: de las respuestas del dueño al mapa del sistema y a la Radiografía (skill `radiografia`).

    R=".claude/skills/radiografia/scripts/radiografia.py"
    python3 $R nueva <slug> --negocio "Nombre del negocio"     # crea clientes/<slug>/radiografia.json (vacío)
    python3 $R revisar <slug>                                  # qué falta, qué está por medir, orden y costos
    python3 $R armar <slug> [--reemplazar]                     # escribe embudo.json, radiografia.md y lienzo.json
    python3 $R lienzo <slug> [--revisar]                       # dibuja el mapa en el Lienzo de Arbrain

Dónde: `.claude/memory/project/clientes/<slug>/` (la ficha del cliente sigue en `clientes/<slug>.md`, skill
`clientes`). `--carpeta <ruta>` usa otra carpeta (pruebas, ejemplos o su propio negocio).

Qué hace:
  - `radiografia.json` guarda lo que respondió el dueño, etapa por etapa (las seis del estándar `arbrain.embudo/v1`),
    lo que se repite a mano, sus números, el cuello de botella con su evidencia y los arreglos propuestos.
  - `armar` lo convierte en tres archivos: `embudo.json` (el mapa, mismo estándar que lee el panel Tu negocio),
    `radiografia.md` (la página para el dueño: qué arreglar primero, en qué orden y cuánto cuesta no arreglarlo) y
    `lienzo.json` (el spec que dibuja el Lienzo).
  - El costo de no arreglar sale solo de números escritos: horas a mano × costo por hora, y ventas perdidas con su
    cuenta a la vista. Lo que no tiene número queda «por medir», nunca 0.
  - El orden: primero lo que ataca el cuello de botella; después, más costo por menos esfuerzo. Si los arreglos traen
    `orden`, manda el que acordaron.
Reglas: nunca inventa (solo escribe lo que recibe), no pisa un archivo editado a mano sin `--reemplazar`, escribe de
forma atómica y `revisar` no escribe nada. Código 2: faltan datos (la lista dice cuáles). Código 3: un archivo ya existe
o se editó a mano. Solo biblioteca estándar de Python 3 (macOS, Windows y Linux).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ESQUEMA = "arbrain.radiografia/v1"
ESQUEMA_EMBUDO = "arbrain.embudo/v1"
ETAPAS = ["Adquisición", "Nutrición", "Conversión", "Bienvenida", "Entrega", "Expansión"]
SLUG_ETAPA = {"Adquisición": "adquisicion", "Nutrición": "nutricion", "Conversión": "conversion",
              "Bienvenida": "bienvenida", "Entrega": "entrega", "Expansión": "expansion"}
# Los cuatro bloques que ve el dueño: marketing → venta → entrega → números.
BLOQUES = [
    ("marketing", "Marketing · cómo llegan", ["Adquisición", "Nutrición"]),
    ("venta", "Venta · cómo compran", ["Conversión"]),
    ("entrega", "Entrega · cómo se cumple", ["Bienvenida", "Entrega", "Expansión"]),
]
ESFUERZO = {"bajo": 1, "medio": 2, "alto": 3}
SEMANAS_POR_MES = 52 / 12
MARCA = "arbrain:radiografia"
PALABRA_IA = re.compile(r"(?<![A-Za-zÁÉÍÓÚáéíóúñÑ])(IA|AI)(?![A-Za-zÁÉÍÓÚáéíóúñÑ])|inteligencia artificial", re.I)


class Alto(Exception):
    """Algo impide escribir sin el sí del dueño (código 3)."""


# ── Archivos ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def raiz() -> Path:
    if os.environ.get("ARBRAIN_RAIZ"):
        return Path(os.environ["ARBRAIN_RAIZ"])
    return Path(__file__).resolve().parents[4]


def carpeta_de(slug: str | None, carpeta: str | None) -> Path:
    if carpeta:
        return Path(carpeta).expanduser().resolve()
    if not slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("El slug va en minúsculas y con guiones (ferreteria-la-tuerca).")
    return raiz() / ".claude" / "memory" / "project" / "clientes" / slug


def escribir(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.")
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    os.replace(tmp, ruta)


def relativa(ruta: Path) -> str:
    try:
        return ruta.resolve().relative_to(raiz().resolve()).as_posix()
    except ValueError:
        return ruta.as_posix()


def huella(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]


# ── Números ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def es_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def fmt(x: float) -> str:
    if abs(x - round(x)) < 0.05:
        return f"{int(round(x)):,}"
    return f"{x:,.1f}"


def dinero(x: float | None, moneda: str) -> str:
    return "por medir" if x is None else f"{int(round(x)):,} {moneda}".strip()


def costo_hora(d: dict) -> float | None:
    for n in d.get("numeros") or []:
        if n.get("clave") == "costo_hora" and es_num(n.get("valor")):
            return float(n["valor"])
    return None


def horas_mes(t: dict) -> float | None:
    v, m = t.get("veces_semana"), t.get("minutos")
    if es_num(v) and es_num(m):
        return round(v * m / 60 * SEMANAS_POR_MES, 1)
    return None


def costo_arreglo(d: dict, a: dict) -> dict:
    """Lo que cuesta al mes no arreglarlo: tiempo (horas a mano × costo por hora) + ventas perdidas (con su cuenta)."""
    tareas = {t["id"]: t for t in d.get("tareas_a_mano") or [] if t.get("id")}
    ch = costo_hora(d)
    horas, horas_por_medir = 0.0, []
    for tid in a.get("tareas") or []:
        h = horas_mes(tareas.get(tid, {}))
        if h is None:
            horas_por_medir.append(tid)
        else:
            horas += h
    tiempo = round(horas * ch, 2) if (ch is not None and horas) else (0.0 if not a.get("tareas") else None)
    vp = a.get("ventas_perdidas") or {}
    ventas = float(vp["mensual"]) if es_num(vp.get("mensual")) else None
    partes, por_medir = [], []
    if a.get("tareas"):
        if tiempo is None:
            por_medir.append("el costo por hora del equipo" if horas else "las horas de sus tareas")
        else:
            partes.append(tiempo)
        if horas_por_medir and horas:
            por_medir.append("horas de " + ", ".join(horas_por_medir))
    if vp:
        if ventas is None:
            por_medir.append("las ventas que se pierden")
        else:
            partes.append(ventas)
    mensual = round(sum(partes), 2) if partes else None
    return {"horas_mes": round(horas, 1), "tiempo_mes": tiempo if a.get("tareas") else None, "ventas_mes": ventas,
            "mensual": mensual, "por_medir": por_medir, "cuenta_ventas": vp.get("cuenta")}


def ordenar(d: dict) -> list[dict]:
    """Primero lo que ataca el cuello; luego más costo por menos esfuerzo; lo que no tiene costo va al final."""
    arreglos = d.get("arreglos") or []
    if arreglos and all(isinstance(a.get("orden"), int) for a in arreglos):
        return sorted(arreglos, key=lambda a: a["orden"])
    cuello = (d.get("cuello") or {}).get("etapa")

    def clave(par):
        i, a = par
        c = costo_arreglo(d, a)["mensual"]
        peso = ESFUERZO.get(a.get("esfuerzo"), 3)
        return (0 if a.get("etapa") == cuello else 1, 0 if c is not None else 1, -(c or 0) / peso, peso, i)

    return [a for _, a in sorted(enumerate(arreglos), key=clave)]


# ── Revisar ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def txt(x) -> bool:
    return isinstance(x, str) and x.strip() != ""


def revisar(d: dict) -> dict:
    err, avisos, por_medir = [], [], []
    if d.get("esquema") != ESQUEMA:
        err.append(f"«esquema» debe ser «{ESQUEMA}».")
    if not txt(d.get("negocio")):
        err.append("Falta «negocio».")
    if not (isinstance(d.get("fecha"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["fecha"])):
        err.append("«fecha» va como AAAA-MM-DD (el día de la Radiografía).")
    if not txt((d.get("meta") or {}).get("texto")):
        err.append("Falta la meta del dueño (meta.texto): «¿qué te gustaría que pasara en tu negocio en 3 meses?», en un número.")
    if not txt(d.get("moneda")):
        err.append("Falta «moneda» (EUR, USD, MXN…).")
    etapas = {e.get("etapa"): e for e in d.get("etapas") or [] if isinstance(e, dict)}
    faltan = [e for e in ETAPAS if e not in etapas]
    if faltan:
        err.append("Faltan etapas: " + ", ".join(faltan) + ". Si una no existe en este negocio, escríbela con "
                   "opera_hoy=false y qué pasa en su lugar.")
    for nombre, e in etapas.items():
        if nombre not in ETAPAS:
            err.append(f"Etapa desconocida «{nombre}»: van {', '.join(ETAPAS)}.")
            continue
        if not txt(e.get("que_pasa")):
            err.append(f"{nombre}: falta «que_pasa» (cómo pasa hoy, en palabras del dueño).")
        if not isinstance(e.get("opera_hoy"), bool):
            err.append(f"{nombre}: «opera_hoy» es true o false.")
        n = e.get("numero") or {}
        if not txt(n.get("nombre")):
            err.append(f"{nombre}: falta «numero.nombre» (qué se cuenta en esta etapa).")
        elif n.get("valor") is None:
            por_medir.append(f"{nombre}: {n['nombre']}")
            if not txt(n.get("como_medirlo")):
                err.append(f"{nombre}: sin número, «numero.como_medirlo» dice cómo se va a medir.")
        elif not (txt(n.get("fuente")) and txt(n.get("medido_en"))):
            err.append(f"{nombre}: un número escrito lleva «fuente» y «medido_en».")
    for n in d.get("numeros") or []:
        if not txt(n.get("nombre")):
            err.append("Cada número de «numeros» lleva «nombre».")
        elif n.get("valor") is None:
            por_medir.append(n["nombre"])
        elif not (txt(n.get("fuente")) and txt(n.get("medido_en"))):
            err.append(f"Número «{n['nombre']}»: lleva «fuente» y «medido_en».")
    ids = set()
    for t in d.get("tareas_a_mano") or []:
        tid = t.get("id")
        if not txt(tid) or tid in ids:
            err.append(f"Cada tarea a mano lleva un «id» único ({tid!r}).")
        ids.add(tid)
        if not txt(t.get("tarea")):
            err.append(f"Tarea {tid}: falta «tarea».")
        if t.get("etapa") not in ETAPAS:
            err.append(f"Tarea {tid}: «etapa» es una de {', '.join(ETAPAS)}.")
        if horas_mes(t) is None:
            por_medir.append(f"Horas de «{t.get('tarea') or tid}»")
    cu = d.get("cuello") or {}
    if cu.get("etapa") not in ETAPAS or not txt(cu.get("frase")) or not txt(cu.get("evidencia")) or not txt(cu.get("fecha")):
        err.append("Falta el cuello de botella: «cuello» con etapa, frase, evidencia (lo que lo prueba) y fecha. Uno solo.")
    arreglos = d.get("arreglos") or []
    if not arreglos:
        err.append("Faltan los arreglos («arreglos»): qué arreglar, en qué etapa y con qué esfuerzo.")
    aids = set()
    for a in arreglos:
        aid = a.get("id")
        if not txt(aid) or aid in aids:
            err.append(f"Cada arreglo lleva un «id» único ({aid!r}).")
        aids.add(aid)
        if not txt(a.get("que")):
            err.append(f"Arreglo {aid}: falta «que».")
        if a.get("etapa") not in ETAPAS:
            err.append(f"Arreglo {aid}: «etapa» es una de {', '.join(ETAPAS)}.")
        if a.get("esfuerzo") not in ESFUERZO:
            err.append(f"Arreglo {aid}: «esfuerzo» es bajo, medio o alto.")
        for tid in a.get("tareas") or []:
            if tid not in ids:
                err.append(f"Arreglo {aid}: la tarea «{tid}» no existe en «tareas_a_mano».")
        vp = a.get("ventas_perdidas")
        if vp is not None and es_num(vp.get("mensual")) and not txt(vp.get("cuenta")):
            err.append(f"Arreglo {aid}: las ventas perdidas llevan su «cuenta» a la vista.")
    if len(arreglos) > 5:
        avisos.append(f"{len(arreglos)} arreglos: una Radiografía que se cumple trae de 3 a 5. Deja el resto en «después».")
    if arreglos and cu.get("etapa") and not any(a.get("etapa") == cu["etapa"] for a in arreglos):
        avisos.append("Ningún arreglo ataca el cuello de botella: mejorar otra etapa no mueve el resultado.")
    if costo_hora(d) is None and d.get("tareas_a_mano"):
        avisos.append("Sin «costo_hora» en «numeros»: el tiempo a mano sale en horas, no en dinero.")
    textos = [d.get("siguiente_paso") or "", cu.get("frase") or ""] + [a.get("que", "") + " " + a.get("por_que", "")
                                                                          for a in arreglos]
    if any(PALABRA_IA.search(t) for t in textos):
        avisos.append("La página habla de IA: al dueño se le habla de su negocio y de su número, no de la herramienta.")
    if not txt(d.get("siguiente_paso")):
        avisos.append("Sin «siguiente_paso»: cierra con una línea (el piloto o la instalación de tu oferta).")
    orden = ordenar(d) if not err else []
    moneda = d.get("moneda") or ""
    return {"ok": not err, "errores": err, "avisos": avisos, "por_medir": por_medir,
            "orden": [{"id": a.get("id"), "que": a.get("que"),
                       "cuesta_al_mes": dinero(costo_arreglo(d, a)["mensual"], moneda)} for a in orden]}


# ── Salidas ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def ejecutores(roles: list | None) -> list[dict]:
    out = []
    for r in roles or ["dueño"]:
        r = str(r).strip()
        out.append({"tipo": "persona", "rol": "fundador"} if r.lower() in ("dueño", "dueña", "fundador") else
                   {"tipo": "persona", "rol": r})
    return out


def embudo(d: dict, ruta_datos: str) -> dict:
    etapas = {e["etapa"]: e for e in d["etapas"]}
    cu = d["cuello"]
    out = []
    for i, nombre in enumerate(ETAPAS, 1):
        e = etapas[nombre]
        n = e.get("numero") or {}
        mide = {"nombre": n["nombre"], "fuente": n.get("fuente") or "por definir con el dueño",
                "frecuencia": n.get("frecuencia") or "a mano",
                "dueno": ejecutores([n.get("dueno") or "dueño"])[0], "hay_numero": n.get("valor") is not None,
                "valor": n.get("valor")}
        if n.get("valor") is None:
            mide["como_medirlo"] = n["como_medirlo"]
        else:
            mide["medido_en"] = n["medido_en"]
            if n.get("ventana"):
                mide["ventana"] = n["ventana"]
        cuello = {"es": False}
        if cu["etapa"] == nombre:
            cuello = {"es": True, "frase": cu["frase"],
                      "evidencia": {"ruta": ruta_datos, "fecha": cu["fecha"], "detalle": cu["evidencia"]}}
        out.append({"id": f"negocio.{SLUG_ETAPA[nombre]}", "orden": i, "embudo": "negocio", "etapa": nombre,
                    "nombre": e.get("nombre") or nombre, "que_pasa": e["que_pasa"], "opera_hoy": e["opera_hoy"],
                    "skills": [], "rutinas": [], "ejecuta": ejecutores(e.get("ejecuta")), "mide": mide,
                    "cuello": cuello})
    aristas = [{"desde": a["id"], "hacia": b["id"], "tipo": "flujo",
                "estado": "opera" if a["opera_hoy"] and b["opera_hoy"] else "por construir"}
               for a, b in zip(out, out[1:])]
    return {"esquema": ESQUEMA_EMBUDO, "negocio": d["negocio"], "generado": d["fecha"],
            "reglas": ["mapa del sistema hecho en la Radiografía: se regenera desde radiografia.json (skill radiografia)",
                       "valor null = por medir, nunca 0; un solo cuello, con su evidencia"],
            "embudos": [{"id": "negocio", "nombre": (d.get("contexto") or {}).get("que_vende") or d["negocio"],
                         "kicker": "EMBUDO", "frase": (d.get("contexto") or {}).get("a_quien") or "", "tipo": "oferta"}],
            "etapas": out, "aristas": aristas}


def corto(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def valor_numero(n: dict, moneda: str) -> str:
    v = n.get("valor")
    if v is None:
        return "por medir"
    u = n.get("unidad") or ""
    return (fmt(v) if es_num(v) else str(v)) + (f" {u}" if u else "")


def spec_lienzo(d: dict) -> dict:
    etapas = {e["etapa"]: e for e in d["etapas"]}
    cu = d["cuello"]["etapa"]
    moneda = d["moneda"]
    nodos = [{"id": "meta", "role": "trigger", "title": "Lo que quiere el dueño", "caption": corto(d["meta"]["texto"], 200)}]
    aristas = []
    previo = "meta"
    tareas = d.get("tareas_a_mano") or []
    for bid, titulo, nombres in BLOQUES:
        items = []
        for nm in nombres:
            e = etapas[nm]
            items.append(corto(f"{nm}: {e['que_pasa']}", 95))
            n = e.get("numero") or {}
            items.append(corto(f"  {n.get('nombre', 'número')}: {valor_numero(n, moneda)}", 70))
        con_cuello = cu in nombres
        nodo = {"id": bid, "role": "risk" if con_cuello else "module", "title": titulo, "items": items}
        chips = [{"text": "CUELLO DE BOTELLA"}] if con_cuello else []
        if any(not etapas[nm]["opera_hoy"] for nm in nombres):
            chips.append({"text": "INCOMPLETO"})
        if chips:
            nodo["chips"] = chips
        if con_cuello:
            nodo["caption"] = corto(d["cuello"]["frase"], 140)
        nodos.append(nodo)
        aristas.append({"from": previo, "to": bid})
        previo = bid
    nums = [corto(f"{n['nombre']}: {valor_numero(n, moneda)}", 60) for n in (d.get("numeros") or [])][:7]
    nodos.append({"id": "numeros", "role": "deliverable", "title": "Números", "items": nums or ["Por medir"]})
    aristas.append({"from": previo, "to": "numeros"})
    if tareas:
        top = sorted(tareas, key=lambda t: -(horas_mes(t) or 0))[:5]
        items = [corto(f"{t['tarea']} · {fmt(horas_mes(t)) + ' h/mes' if horas_mes(t) is not None else 'horas por medir'}", 70)
                 for t in top]
        total = sum(horas_mes(t) or 0 for t in tareas)
        nodos.append({"id": "a-mano", "role": "tray", "title": "Lo que se repite a mano", "items": items,
                      "caption": f"{fmt(total)} horas al mes entre todas las tareas medidas."})
        for bid, _, nombres in BLOQUES:
            if any(t.get("etapa") in nombres for t in tareas):
                aristas.append({"from": bid, "to": "a-mano", "kind": "hueco", "label": "a mano"})
    # Qué arreglar primero, en orden: después de los números, una cadena 1 → 2 → 3.
    previo = "numeros"
    for i, a in enumerate(ordenar(d)[:3], 1):
        c = costo_arreglo(d, a)["mensual"]
        nodos.append({"id": f"arreglo-{i}", "role": "callout", "index": i, "title": corto(a["que"], 75),
                      "caption": f"{a['etapa']} · no arreglarlo cuesta {dinero(c, moneda)} al mes."})
        aristas.append({"from": previo, "to": f"arreglo-{i}", "kind": "fragil" if i == 1 else "flujo",
                        "label": "primero" if i == 1 else "luego"})
        previo = f"arreglo-{i}"
    return {"title": titulo_lienzo(d), "nodes": nodos, "edges": aristas}


def titulo_lienzo(d: dict) -> str:
    return f"Mapa del sistema · {d['negocio']}" + (" (ejemplo)" if d.get("ejemplo") else "")


def pagina(d: dict) -> str:
    moneda = d["moneda"]
    etapas = {e["etapa"]: e for e in d["etapas"]}
    cu = d["cuello"]
    L = []
    if d.get("ejemplo"):
        L += ["> **EJEMPLO INVENTADO.** Negocio y números ficticios para enseñar la forma; no es un cliente real.", ""]
    L += [f"# Radiografía · {d['negocio']}", "",
          f"Borrador del {d['fecha']} · {'Radiografía completa' if d.get('modo') == 'completa' else 'Radiografía exprés'}"
          " · la revisa y la manda tu consultor.", "",
          "## Lo que quieres", "", d["meta"]["texto"], ""]
    ctx = d.get("contexto") or {}
    if ctx:
        partes = [ctx.get("que_vende"), ctx.get("a_quien"), ctx.get("equipo")]
        herr = ", ".join(ctx.get("herramientas") or [])
        L += [" · ".join(p for p in partes if p) + (f" · Herramientas: {herr}." if herr else ""), ""]
    flujo = []
    for bid, titulo, nombres in BLOQUES:
        nombre_b = titulo.split(" · ")[0]
        flujo.append(f"**{nombre_b} (cuello)**" if cu["etapa"] in nombres else nombre_b)
    L += ["## Tu negocio hoy, como sistema", "", " → ".join(flujo + ["Números"]), "",
          "| Bloque | Etapa | Qué pasa hoy | Su número |", "|---|---|---|---|"]
    for bid, titulo, nombres in BLOQUES:
        for nm in nombres:
            e = etapas[nm]
            n = e.get("numero") or {}
            marca = " ⚠ cuello" if nm == cu["etapa"] else ("" if e["opera_hoy"] else " (no existe hoy)")
            L.append(f"| {titulo.split(' · ')[0]} | {nm}{marca} | {e['que_pasa']} | "
                     f"{n.get('nombre', '')}: {valor_numero(n, moneda)} |")
    L += ["", f"**Dónde se atora:** {cu['frase']}", "", f"Lo que lo muestra: {cu['evidencia']} ({cu['fecha']}).", ""]
    nums = d.get("numeros") or []
    if nums:
        L += ["## Tus números", "", "| Número | Valor | De dónde sale | Fecha |", "|---|---|---|---|"]
        for n in nums:
            L.append(f"| {n['nombre']} | {valor_numero(n, moneda)} | {n.get('fuente') or '—'} | {n.get('medido_en') or '—'} |")
        L.append("")
    tareas = d.get("tareas_a_mano") or []
    ch = costo_hora(d)
    if tareas:
        L += ["## Lo que se repite a mano", "",
              "| Tarea | Quién | Veces por semana | Minutos | Horas al mes | Cuesta al mes |", "|---|---|---|---|---|---|"]
        for t in sorted(tareas, key=lambda t: -(horas_mes(t) or 0)):
            h = horas_mes(t)
            costo = dinero(round(h * ch, 2) if (h is not None and ch is not None) else None, moneda)
            L.append(f"| {t['tarea']} | {t.get('quien') or '—'} | {fmt(t['veces_semana']) if es_num(t.get('veces_semana')) else 'por medir'} | "
                     f"{fmt(t['minutos']) if es_num(t.get('minutos')) else 'por medir'} | "
                     f"{fmt(h) if h is not None else 'por medir'} | {costo} |")
        total_h = sum(horas_mes(t) or 0 for t in tareas)
        L += ["", f"Entre todas: **{fmt(total_h)} horas al mes** hechas a mano"
              + (f", unos **{dinero(total_h * ch, moneda)}** de tiempo del equipo." if ch is not None else
                 " (el costo, por medir: falta el costo por hora del equipo)."), ""]
    L += ["## Qué arreglar primero", "",
          "En este orden. El primero ataca el cuello: mientras ahí se pierda, mejorar lo demás no mueve el resultado.", ""]
    total, faltan = 0.0, []
    for i, a in enumerate(ordenar(d), 1):
        c = costo_arreglo(d, a)
        L.append(f"{i}. **{a['que']}** ({a['etapa']} · esfuerzo {a['esfuerzo']}). {a.get('por_que') or ''}".rstrip())
        detalle = []
        if c["tiempo_mes"] is not None:
            detalle.append(f"{fmt(c['horas_mes'])} h al mes a mano ≈ {dinero(c['tiempo_mes'], moneda)}")
        elif a.get("tareas"):
            detalle.append(f"{fmt(c['horas_mes'])} h al mes a mano (en dinero: por medir)")
        if c["ventas_mes"] is not None:
            detalle.append(f"{dinero(c['ventas_mes'], moneda)} en ventas que se pierden ({c['cuenta_ventas']})")
        if c["mensual"] is not None:
            total += c["mensual"]
            L.append(f"   - No arreglarlo cuesta **{dinero(c['mensual'], moneda)} al mes**: " + "; ".join(detalle) + ".")
        else:
            L.append("   - No arreglarlo cuesta: por medir" + (f" ({'; '.join(detalle)})" if detalle else "") + ".")
        if c["por_medir"]:
            faltan.append(f"{a['que']}: " + ", ".join(c["por_medir"]))
    L += ["", "## Cuánto te cuesta no arreglarlo", ""]
    if total:
        L += [f"Lo que sí tiene número: **{dinero(total, moneda)} al mes**, unos **{dinero(total * 3, moneda)} en 90 días** "
              f"y **{dinero(total * 12, moneda)} en un año** si todo sigue igual.", ""]
    else:
        L += ["Todavía sin número: lo primero es medir (ver abajo).", ""]
    if faltan:
        L += ["Sin contar (por medir): " + "; ".join(faltan) + ".", ""]
    pm = revisar(d)["por_medir"]
    if pm:
        L += ["## Por medir", "", "Si no se mide, no vas a poder ver tu resultado. Esto se cuenta primero:", ""]
        L += [f"- {x}" for x in pm] + [""]
    if txt(d.get("siguiente_paso")):
        L += ["## Siguiente paso", "", d["siguiente_paso"], ""]
    return "\n".join(L).rstrip() + "\n"


# ── Escritura con respeto a lo editado a mano ────────────────────────────────────────────────────────────────────────

def poner_md(ruta: Path, cuerpo: str, reemplazar: bool) -> str:
    cabeza = f"<!-- {MARCA} huella={huella(cuerpo)} · se regenera desde radiografia.json; si la editas a mano, se respeta -->\n"
    if ruta.exists() and not reemplazar:
        viejo = ruta.read_text(encoding="utf-8")
        m = re.match(rf"<!-- {MARCA} huella=([0-9a-f]+)[^\n]*-->\n", viejo)
        if not m or huella(viejo[m.end():]) != m.group(1):
            raise Alto(f"{ruta.name} se editó a mano: no lo piso sin --reemplazar (con el sí del dueño).")
    escribir(ruta, cabeza + cuerpo)
    return "escrito"


def poner_json(ruta: Path, datos: dict, reemplazar: bool) -> str:
    def sin(x):
        return {k: v for k, v in x.items() if k != "huella_radiografia"}

    datos = dict(datos)
    datos["huella_radiografia"] = huella(json.dumps(sin(datos), ensure_ascii=False, sort_keys=True))
    if ruta.exists() and not reemplazar:
        try:
            viejo = json.loads(ruta.read_text(encoding="utf-8"))
        except ValueError:
            raise Alto(f"{ruta.name} existe y no es JSON válido: no lo toco.")
        if viejo.get("huella_radiografia") != huella(json.dumps(sin(viejo), ensure_ascii=False, sort_keys=True)):
            raise Alto(f"{ruta.name} existe y no lo escribió la Radiografía (o se editó a mano): no lo piso sin --reemplazar.")
    escribir(ruta, json.dumps(datos, ensure_ascii=False, indent=2) + "\n")
    json.loads(ruta.read_text(encoding="utf-8"))
    return "escrito"


# ── Órdenes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def plantilla(negocio: str, hoy: dt.date) -> dict:
    vacia = {"que_pasa": "", "opera_hoy": True, "ejecuta": ["dueño"],
             "numero": {"nombre": "", "valor": None, "fuente": "", "medido_en": None, "como_medirlo": ""}}
    return {"esquema": ESQUEMA, "negocio": negocio, "giro": "", "ejemplo": False, "fecha": hoy.isoformat(),
            "modo": "expres", "moneda": "",
            "meta": {"texto": "", "fuente": ""},
            "contexto": {"que_vende": "", "a_quien": "", "equipo": "", "herramientas": []},
            "etapas": [dict(vacia, etapa=e, numero=dict(vacia["numero"])) for e in ETAPAS],
            "tareas_a_mano": [], "numeros": [], "cuello": {"etapa": "", "frase": "", "evidencia": "", "fecha": ""},
            "arreglos": [], "siguiente_paso": ""}


def leer_datos(c: Path) -> dict:
    ruta = c / "radiografia.json"
    if not ruta.exists():
        raise FileNotFoundError(f"No hay {relativa(ruta)}: empieza con «nueva».")
    return json.loads(ruta.read_text(encoding="utf-8"))


def armar(c: Path, reemplazar: bool) -> tuple[int, dict]:
    d = leer_datos(c)
    r = revisar(d)
    if not r["ok"]:
        return 2, r
    hechos = {
        "embudo.json": poner_json(c / "embudo.json", embudo(d, relativa(c / "radiografia.json")), reemplazar),
        "radiografia.md": poner_md(c / "radiografia.md", pagina(d), reemplazar),
        "lienzo.json": poner_json(c / "lienzo.json", spec_lienzo(d), True),  # spec derivado: siempre se regenera
    }
    return 0, {"ok": True, "carpeta": relativa(c), "archivos": hechos, "avisos": r["avisos"],
               "por_medir": r["por_medir"], "orden": r["orden"]}


def _pedir(metodo: str, url: str, cuerpo: dict | None = None) -> tuple[int, dict]:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={
        "Authorization": f"Bearer {os.environ.get('ARBRAIN_PASE_AGENTE', '')}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def lienzo(c: Path, revisar_solo: bool) -> tuple[int, dict]:
    d = leer_datos(c)
    r = revisar(d)
    if not r["ok"]:
        return 2, r
    spec = spec_lienzo(d)
    if revisar_solo:
        return 0, {"revisar": True, "spec": spec}
    base = os.environ.get("MISSION_CONTROL_ORIGIN", "").rstrip("/")
    if not base or not os.environ.get("ARBRAIN_PASE_AGENTE"):
        return 0, {"lienzo": "sin_app", "detalle": "Solo dentro de la app Arbrain (falta MISSION_CONTROL_ORIGIN o el pase). "
                   "El mapa queda en embudo.json y radiografia.md."}
    st, lista = _pedir("GET", f"{base}/api/canvas/pages")
    if st != 200:
        return 0, {"lienzo": "no_responde", "detalle": f"El lienzo respondió {st}."}
    nombre = titulo_lienzo(d)
    pag = next((p for p in (lista.get("paginas") or lista.get("pages") or [])
                if (p.get("nombre") or p.get("name")) == nombre), None)
    creada = False
    if not pag:
        st, nueva = _pedir("POST", f"{base}/api/canvas/pages", {"nombre": nombre})
        pag = nueva.get("pagina") if st == 200 else None
        if not pag:
            return 0, {"lienzo": "no_se_creo", "detalle": f"Crear la página respondió {st}."}
        creada = True
    st, r2 = _pedir("POST", f"{base}/api/canvas/pages/{pag['id']}/region",
                    {"regionId": "radiografia", "theme": "claro", "targetAspect": 1.6, "spec": spec})
    juez = r2.get("judge") or {}
    return 0, {"lienzo": nombre, "paginaId": pag["id"], "creada": creada, "status": st, "ok": r2.get("ok", st == 200),
               "juez": juez.get("ok"), "bloqueados": r2.get("bloqueados") or []}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Radiografía de un negocio: preguntas → mapa del sistema → qué arreglar.")
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in ("nueva", "revisar", "armar", "lienzo"):
        p = sub.add_parser(nombre)
        p.add_argument("slug", nargs="?")
        p.add_argument("--carpeta")
        if nombre == "nueva":
            p.add_argument("--negocio", required=True)
            p.add_argument("--fecha")
        if nombre == "armar":
            p.add_argument("--reemplazar", action="store_true")
        if nombre == "lienzo":
            p.add_argument("--revisar", action="store_true")
    a = ap.parse_args(argv)
    try:
        c = carpeta_de(a.slug, a.carpeta)
        if a.orden == "nueva":
            ruta = c / "radiografia.json"
            if ruta.exists():
                raise Alto(f"Ya existe {relativa(ruta)}: continúa esa Radiografía en lugar de empezar otra.")
            hoy = dt.date.fromisoformat(a.fecha) if a.fecha else dt.date.today()
            escribir(ruta, json.dumps(plantilla(a.negocio, hoy), ensure_ascii=False, indent=2) + "\n")
            codigo, out = 0, {"ok": True, "creado": relativa(ruta)}
        elif a.orden == "revisar":
            out = revisar(leer_datos(c))
            codigo = 0 if out["ok"] else 2
        elif a.orden == "armar":
            codigo, out = armar(c, a.reemplazar)
        else:
            codigo, out = lienzo(c, a.revisar)
    except Alto as e:
        codigo, out = 3, {"alto": str(e)}
    except (FileNotFoundError, ValueError) as e:
        codigo, out = 2, {"error": str(e)}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
