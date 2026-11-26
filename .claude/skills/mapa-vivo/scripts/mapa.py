#!/usr/bin/env python3
"""Mapa vivo: el negocio de alguien (el tuyo o el de tu cliente) como un lienzo que se mueve.

    M=".claude/skills/mapa-vivo/scripts/mapa.py"
    python3 $M nuevo <slug> [--negocio "<nombre>"]     # crea clientes/<slug>/mapa.json con lo que ya se sabe
    python3 $M nuevo --propio                          # el tuyo: mi-negocio/mapa.json
    python3 $M revisar <slug>|--propio                 # qué falta, qué está pendiente y qué se dibujaría
    python3 $M armar <slug>|--propio                   # escribe las piezas vivas en <carpeta>/mapa/
    python3 $M lienzo <slug>|--propio [--ensayo]       # arma y dibuja «Mapa vivo · <negocio>» en el Lienzo

- La fuente es `mapa.json` (esquema `arbrain.mapa/v1`, ejemplo inventado en `references/ejemplo.json`). `nuevo` lo
  siembra con `radiografia.json`, `embudo.json` y `02-oferta.md` si existen; lo demás nace «pendiente» y se pregunta.
- Lo abierto, lo pendiente y lo «por medir» se dibujan como tales (guiones, puntos, su sello): nunca como dato.
- Cuatro capítulos con cámara (el norte, el sistema nervioso, la oferta, el vehículo) sobre la base
  `.claude/skills/canvas/scripts/lienzo_vivo.py`: lo que una mano mueva o edite en el Lienzo se respeta al volver a correr.
- `lienzo` solo corre dentro de la app Arbrain; fuera dice `sin_app`. Códigos: 0 bien, 2 faltan datos, 3 alto.
- Sin dependencias: Python 3 de fábrica. En Windows usa `python` si `python3` no existe.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import importlib.util
import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SKILLS = AQUI.parents[1]
sys.path.insert(0, str(SKILLS / "canvas" / "scripts"))
import lienzo_vivo as LV  # noqa: E402

ESQUEMA = "arbrain.mapa/v1"
ETAPAS = ["Adquisición", "Nutrición", "Conversión", "Bienvenida", "Entrega", "Expansión"]
PIEZAS_OFERTA = ["Avatar", "Promesa", "Vehículo", "Nueva oportunidad", "Dolores y deseos", "Urgencia y escasez",
                 "Diferenciación", "Bonos", "Garantía", "Precio", "Pitch y gran dominó"]
MOTIVOS = {"punto", "tuerca", "gota", "hoja", "rombo", "cuadro", "estrella"}
PALABRA_IA = re.compile(r"(?<![A-Za-zÁÉÍÓÚáéíóúñÑ])(IA|AI)(?![A-Za-zÁÉÍÓÚáéíóúñÑ])|inteligencia artificial", re.I)
SEMANAS_POR_MES = 52 / 12
# Las piezas vivas: id → (título, pasos del recorrido o función que los cuenta)
PIEZAS = {
    "ondas": ("Las ondas del porqué", lambda d: 2),
    "nervio": ("El sistema nervioso", lambda d: 3),
    "escalera": ("La escalera de valor", lambda d: 1),
    "hoja": ("La oferta en una página", lambda d: 2),
    "hilos": ("Los hilos del vehículo", lambda d: min(7, len((d.get("vehiculo") or {}).get("pasos") or [])) + 1),
}


class Alto(Exception):
    """Algo impide escribir sin el sí del dueño (código 3)."""


def txt(x) -> bool:
    return isinstance(x, str) and x.strip() != ""


def carpeta_de(slug: str | None, propio: bool, carpeta: str | None) -> Path:
    if carpeta:
        return Path(carpeta).expanduser().resolve()
    base = LV.raiz() / ".claude" / "memory" / "project"
    if propio:
        return base / "mi-negocio"
    if not slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("El slug va en minúsculas y con guiones (ferreteria-la-tuerca), o usa --propio para tu negocio.")
    return base / "clientes" / slug


def relativa(ruta: Path) -> str:
    try:
        return ruta.resolve().relative_to(LV.raiz().resolve()).as_posix()
    except ValueError:
        return ruta.as_posix()


def leer_json(ruta: Path) -> dict | None:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None


def leer_datos(c: Path) -> dict:
    d = leer_json(c / "mapa.json")
    if d is None:
        raise FileNotFoundError(f"No hay mapa.json en {relativa(c)}: empieza con «nuevo».")
    if d.get("esquema") != ESQUEMA:
        raise ValueError(f"mapa.json no dice esquema «{ESQUEMA}».")
    return d


# ── Sembrar: lo que ya se sabe entra solo; lo demás nace pendiente ───────────────────────────────────────────────────

def _radiografia():
    ruta = SKILLS / "radiografia" / "scripts" / "radiografia.py"
    if not ruta.exists():
        return None
    spec = importlib.util.spec_from_file_location("radiografia", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _horas(t: dict) -> float | None:
    v, m = t.get("veces_semana"), t.get("minutos")
    if isinstance(v, (int, float)) and isinstance(m, (int, float)):
        return v * m / 60 * SEMANAS_POR_MES
    return None


def _fecha_corta(iso: str | None) -> str | None:
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    try:
        f = dt.date.fromisoformat(str(iso))
        return f"{f.day} {meses[f.month - 1]}"
    except ValueError:
        return None


def vacio(negocio: str, para: str, hoy: dt.date) -> dict:
    return {
        "esquema": ESQUEMA, "negocio": negocio, "fecha": hoy.isoformat(), "para": para, "moneda": "",
        "marca": {"motivo": "punto"},
        "norte": {
            "luz": "Tu porqué" if para == "cliente" else "Mi porqué",
            "porque": {"texto": "", "estado": "pendiente"},
            "meta": {"texto": "", "de": "", "a": "", "unidad": "", "plazo": "", "estado": "pendiente"},
            "juego": {"texto": "", "estado": "pendiente"},
            "ondas": [], "tierra": "", "principios": [],
            "enfoque": {"texto": "", "estado": "pendiente", "abierto": ""},
        },
        "sistema": {
            "unidad": "", "etapas": [{"etapa": e, "que_pasa": "", "opera_hoy": False, "quien": [],
                                     "numero": {"nombre": "", "valor": None}} for e in ETAPAS],
            "cuello": None, "timonel": {"meta": "", "hoy": "", "empuje": ""}, "lazo": None,
        },
        "oferta": {"entrada": "", "escalera": [], "en_corto": "",
                   "hoja": [{"n": i + 1, "texto": "", "estado": "pendiente"} for i in range(11)]},
        "vehiculo": {"pasos": [], "destinos": {"titulo": "", "lista": []}, "costo": {"mes": "", "noventa": ""}, "llegada": ""},
        "ir_a": [],
    }


def sembrar_de_radiografia(d: dict, r: dict, c: Path) -> list[str]:
    """Pasa a `mapa.json` lo que la Radiografía ya midió. Devuelve qué se sembró, en palabras."""
    hecho = []
    R = _radiografia()
    moneda = r.get("moneda") or ""
    d["moneda"] = moneda
    if r.get("ejemplo"):
        d["ejemplo"] = True
    meta = (r.get("meta") or {}).get("texto")
    if txt(meta):
        d["norte"]["meta"].update({"texto": meta, "estado": "firmado", "sello": "lo dijo el dueño"})
        hecho.append("la meta")
    horas = {}
    for t in r.get("tareas_a_mano") or []:
        h = _horas(t)
        if h is not None and t.get("etapa"):
            horas[t["etapa"]] = horas.get(t["etapa"], 0) + h
    etapas = []
    for nombre in ETAPAS:
        e = next((x for x in r.get("etapas") or [] if x.get("etapa") == nombre), {})
        n = e.get("numero") or {}
        num = {"nombre": n.get("nombre") or "", "valor": None if n.get("valor") in (None, "") else str(n["valor"])}
        if num["valor"] is not None and _fecha_corta(n.get("medido_en")):
            num["medido_en"] = _fecha_corta(n.get("medido_en"))
        if num["valor"] is None and txt(n.get("como_medirlo")):
            num["como_medirlo"] = n["como_medirlo"]
        fila = {"etapa": nombre, "que_pasa": e.get("que_pasa") or "", "opera_hoy": bool(e.get("opera_hoy")),
                "quien": list(e.get("ejecuta") or []), "numero": num}
        if horas.get(nombre):
            fila["a_mano"] = {"horas_mes": int(round(horas[nombre]))}
        etapas.append(fila)
    d["sistema"]["etapas"] = etapas
    hecho.append("las seis etapas con sus números")
    cu = r.get("cuello") or {}
    if cu.get("etapa") in ETAPAS:
        d["sistema"]["cuello"] = {"etapa": cu["etapa"], "frase": cu.get("frase") or "", "se_van": "", "fuga": 0.66,
                                  "evidencia": cu.get("evidencia") or "", "fecha": cu.get("fecha") or ""}
        hecho.append("el cuello")
    ventas = next((n for n in r.get("numeros") or [] if "venta" in str(n.get("nombre", "")).lower() and n.get("valor") is not None), None)
    if ventas and isinstance(ventas.get("valor"), (int, float)):
        d["sistema"]["timonel"]["hoy"] = f"{int(ventas['valor']):,} {ventas.get('unidad') or moneda} al mes".replace("  ", " ")
    arreglos = (R.ordenar(r) if R else r.get("arreglos")) or []
    pasos, total, por_medir = [], 0.0, False
    for i, a in enumerate(arreglos[:7]):
        p = {"nombre": a.get("que") or "", "detalle": a.get("por_que") or "", "estado": "abierto" if i == 0 else "pendiente",
             "hilos": [a["etapa"]] if a.get("etapa") in ETAPAS else [], "peso": 3 if i == 0 else 1}
        if R:
            k = R.costo_arreglo(r, a)
            if k["horas_mes"]:
                p["quita"] = f"{int(round(k['horas_mes']))} h al mes"
            if k["ventas_mes"]:
                p["recupera"] = f"≈ {int(round(k['ventas_mes'])):,} {moneda} al mes".replace("  ", " ")
            if k["mensual"] is None or k["por_medir"]:
                por_medir = True
                p.setdefault("sello", "por medir")
            if k["mensual"]:
                total += k["mensual"]
                p["peso"] = max(p["peso"], 1.6)
        pasos.append(p)
    if pasos:
        d["vehiculo"]["pasos"] = pasos
        d["sistema"]["timonel"]["empuje"] = pasos[0]["nombre"]
        d["norte"]["enfoque"].update({"texto": pasos[0]["nombre"], "estado": "abierto"})
        if total:
            cien = lambda x: int(round(x / 100.0)) * 100
            d["vehiculo"]["costo"] = {"mes": f"≈ {cien(total):,} {moneda}".strip(), "noventa": f"≈ {cien(total * 3):,} {moneda}".strip(),
                                      "mes_num": cien(total),
                                      "nota": "Horas a mano más las ventas que hoy se van." + (" Parte, por medir." if por_medir else "")}
        hecho.append("los arreglos, en orden, con lo que cuesta no hacerlos")
    d["vehiculo"]["rotulos"] = {"pasos": "Qué se arregla primero", "pasos_glosa": "en este orden",
                                "costo": "Lo que cuesta no arreglarlo", "llegada": "A dónde llega"}
    d["vehiculo"]["destinos"] = {"titulo": "Tu sistema, etapa por etapa", "lista": [
        {"nombre": e["etapa"], "nota": ("no existe hoy" if not e["opera_hoy"] else e["numero"]["valor"] or "por medir")} for e in etapas]}
    ctx = r.get("contexto") or {}
    if txt(ctx.get("a_quien")):
        d["oferta"]["hoja"][0] = {"n": 1, "texto": ctx["a_quien"], "estado": "abierto", "sello": "de la radiografía"}
    if txt(ctx.get("que_vende")):
        d["oferta"]["escalera"] = [{"nombre": ctx["que_vende"], "kicker": "Lo que vende hoy", "estado": "opera", "peso": 2, "frente": True}]
    d["ir_a"] = [{"texto": "La Radiografía", "destino": f"doc:{relativa(c / 'radiografia.md')}"},
                 {"texto": "El mapa en datos", "destino": f"doc:{relativa(c / 'embudo.json')}"}]
    return hecho


def sembrar_de_embudo(d: dict, emb: dict) -> list[str]:
    """El embudo del dueño (`arbrain.embudo/v1`): la escalera sale de sus pisos y ofertas; el sistema, de su oferta principal."""
    hecho = []
    embudos = emb.get("embudos") or []
    ofertas = [x for x in embudos if x.get("tipo") != "piso"]
    if embudos:
        d["oferta"]["escalera"] = [{
            "nombre": x.get("nombre") or "", "kicker": x.get("kicker") or ("Piso" if x.get("tipo") == "piso" else "Oferta"),
            "voz": x.get("frase") or "", "estado": "pendiente" if x.get("estado") == "por construir" else "opera",
            "peso": 2.4 if ofertas and x is ofertas[0] else 1, "frente": bool(ofertas and x is ofertas[0])} for x in embudos[:5]]
        hecho.append("la escalera de valor (de tus pisos y ofertas)")
    principal = (ofertas[0] if ofertas else (embudos[0] if embudos else {})).get("id")
    suyas = [e for e in emb.get("etapas") or [] if e.get("embudo") == principal]
    if suyas:
        etapas = []
        for nombre in ETAPAS:
            e = next((x for x in suyas if x.get("etapa") == nombre), None)
            if not e:
                etapas.append({"etapa": nombre, "que_pasa": "", "opera_hoy": False, "quien": [], "numero": {"nombre": "", "valor": None}})
                continue
            m = e.get("mide") or {}
            quien = ["tú" if x.get("rol") == "fundador" else (x.get("rol") or ("Levy" if x.get("tipo") == "levy" else "una rutina")) for x in e.get("ejecuta") or []]
            etapas.append({"etapa": nombre, "que_pasa": e.get("que_pasa") or e.get("nombre") or "", "opera_hoy": bool(e.get("opera_hoy")),
                           "quien": quien, "numero": {"nombre": m.get("nombre") or "", "valor": None if m.get("valor") is None else str(m["valor"])}})
            if (e.get("cuello") or {}).get("es"):
                d["sistema"]["cuello"] = {"etapa": nombre, "frase": e["cuello"].get("frase") or "", "se_van": "", "fuga": 0.66,
                                          "fecha": (e["cuello"].get("evidencia") or {}).get("fecha") or ""}
        d["sistema"]["etapas"] = etapas
        hecho.append("las seis etapas de tu oferta principal")
    return hecho


def sembrar_de_oferta(d: dict, md: str) -> list[str]:
    """`02-oferta.md` (skill `oferta`): el estado de cada pieza sale de su tabla; el texto, de su primera línea escrita."""
    estados = {}
    for m in re.finditer(r"^\|\s*(\d{1,2})\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*$", md, re.M):
        estados[int(m.group(1))] = m.group(2).strip().lower()
    n_escritas = 0
    for i in range(1, 12):
        sec = re.search(rf"^##\s*{i}\s*·[^\n]*\n(.*?)(?=^##\s|\Z)", md, re.M | re.S)
        texto = ""
        for linea in (sec.group(1).splitlines() if sec else []):
            valor = linea.split(":", 1)[1].strip() if linea.lstrip().startswith("-") and ":" in linea else ""
            if valor and valor.lower() != "sin dato" and "___" not in valor:
                texto = valor
                break
        est = estados.get(i, "")
        estado = "firmado" if est.startswith("firmad") else "abierto" if (est.startswith("borrador") or texto) else "pendiente"
        d["oferta"]["hoja"][i - 1] = {"n": i, "texto": texto, "estado": estado if texto else "pendiente"}
        n_escritas += bool(texto)
    corto = re.search(r"^>\s*(?:En 2 o 3 renglones:)?\s*(.+)$", md, re.M)
    if corto and "[" not in corto.group(1):
        d["oferta"]["en_corto"] = corto.group(1).strip()
    return [f"{n_escritas} de las 11 piezas de tu oferta"] if n_escritas else []


def nuevo(c: Path, negocio: str | None, propio: bool, hoy: dt.date) -> dict:
    ruta = c / "mapa.json"
    if ruta.exists():
        raise Alto(f"Ya existe {relativa(ruta)}: continúa ese mapa en lugar de empezar otro.")
    r = leer_json(c / "radiografia.json")
    emb = leer_json(c / "embudo.json")
    nombre = negocio or (r or {}).get("negocio") or (emb or {}).get("negocio")
    if not txt(nombre):
        raise ValueError("Falta el nombre del negocio: --negocio \"<nombre>\".")
    d = vacio(nombre, "propio" if propio else "cliente", hoy)
    hecho = []
    if propio and emb:
        hecho += sembrar_de_embudo(d, emb)
    if r:
        hecho += sembrar_de_radiografia(d, r, c)
    oferta = c / "02-oferta.md"
    if propio and oferta.exists():
        hecho += sembrar_de_oferta(d, oferta.read_text(encoding="utf-8"))
        d["ir_a"].append({"texto": "Tu oferta, completa", "destino": f"doc:{relativa(oferta)}"})
    LV.guardar(ruta, json.dumps(d, ensure_ascii=False, indent=2) + "\n")
    return {"ok": True, "creado": relativa(ruta), "sembrado": hecho, "sigue": "revisar: dice qué falta preguntar"}


# ── Revisar ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def revisar(d: dict) -> dict:
    errores, faltan, avisos = [], [], []
    if not txt(d.get("negocio")):
        errores.append("negocio: falta el nombre")
    N, S, O, V = (d.get(k) or {} for k in ("norte", "sistema", "oferta", "vehiculo"))
    etapas = S.get("etapas") or []
    if [e.get("etapa") for e in etapas] != ETAPAS:
        errores.append("sistema.etapas: van las seis, en orden: " + ", ".join(ETAPAS))
    cu = S.get("cuello")
    if cu and cu.get("etapa") not in ETAPAS:
        errores.append("sistema.cuello.etapa: no es una de las seis etapas")
    if any(not isinstance(x, dict) or not (1 <= int(x.get("n", 0)) <= 11) for x in O.get("hoja") or []):
        errores.append("oferta.hoja: cada pieza lleva su número del 1 al 11")
    motivo = (d.get("marca") or {}).get("motivo")
    if motivo and motivo not in MOTIVOS:
        errores.append(f"marca.motivo: uno de {', '.join(sorted(MOTIVOS))}")
    for k in ("acento", "segundo"):
        v = (d.get("marca") or {}).get(k)
        if v and not re.fullmatch(r"#[0-9a-fA-F]{6}", str(v)):
            errores.append(f"marca.{k}: un color como #C2410C")
    destinos = {str(x.get("nombre") if isinstance(x, dict) else x).lower() for x in (V.get("destinos") or {}).get("lista") or []}
    for i, p in enumerate(V.get("pasos") or []):
        for h in p.get("hilos") or []:
            if str(h).lower() not in destinos and not str(h).isdigit():
                errores.append(f"vehiculo.pasos[{i + 1}].hilos: «{h}» no está en vehiculo.destinos.lista")
    # lo que conviene preguntar (no impide dibujar: se dibuja como pendiente)
    de_quien = "del dueño" if d.get("para") == "cliente" else "tuyo"
    if not txt((N.get("porque") or {}).get("texto")):
        faltan.append(f"norte.porque: su porqué, en sus palabras ({de_quien})")
    if not txt((N.get("meta") or {}).get("texto")):
        faltan.append("norte.meta: la meta a 3 meses, en un número")
    elif not txt((N.get("meta") or {}).get("a")):
        faltan.append("norte.meta.a: el número de la meta, suelto (se lee desde lejos)")
    if len(N.get("ondas") or []) < 3:
        faltan.append("norte.ondas: de 3 a 6 sistemas, del más chico al más grande (la persona, su negocio, su equipo, sus clientes…)")
    if not (N.get("principios") or []):
        faltan.append("norte.principios: de 3 a 5 reglas con las que decide")
    if not cu:
        faltan.append("sistema.cuello: la etapa donde más se pierde, con su evidencia (si faltan números, el cuello es medir)")
    elif not txt(cu.get("se_van")):
        faltan.append("sistema.cuello.se_van: cuántos se pierden ahí, como lo contaría el dueño («23 de 35 cotizaciones»)")
    if not txt(S.get("unidad")):
        faltan.append("sistema.unidad: qué fluye por su negocio (pedidos, cotizaciones, pacientes, alumnos…)")
    tim = S.get("timonel") or {}
    for k, q in (("meta", "la meta en corto"), ("hoy", "el número de hoy"), ("empuje", "qué se empuja primero")):
        if not txt(tim.get(k)):
            faltan.append(f"sistema.timonel.{k}: {q}")
    if not (O.get("escalera") or []):
        faltan.append("oferta.escalera: lo que vende, de la entrada a lo más grande (2 a 5 escalones; uno «frente»)")
    if not (V.get("pasos") or []):
        faltan.append("vehiculo.pasos: los pasos, en orden, con el hilo a lo que arregla o llena")
    if not txt(V.get("llegada")):
        faltan.append("vehiculo.llegada: a dónde llega al terminar")
    # estados: cuántos de cada uno, para decirlo en una línea
    cuenta = {k: 0 for k in ("firmado", "opera", "abierto", "pendiente", "idea")}
    for x in O.get("hoja") or []:
        cuenta[LV.estado_de(x.get("estado")) if txt(x.get("texto")) or LV.estado_de(x.get("estado")) == "idea" else "pendiente"] += 1
    sin_numero = [e["etapa"] for e in etapas if (e.get("numero") or {}).get("valor") in (None, "")]
    sin_fecha = [e["etapa"] for e in etapas if (e.get("numero") or {}).get("valor") not in (None, "") and not txt((e.get("numero") or {}).get("medido_en"))]
    if sin_fecha:
        avisos.append("números sin fecha (medido_en): " + ", ".join(sin_fecha))
    if d.get("para") == "cliente" and PALABRA_IA.search(json.dumps({k: d.get(k) for k in ("norte", "sistema", "oferta", "vehiculo")}, ensure_ascii=False)):
        avisos.append("el mapa nombra la IA: al dueño se le habla de su negocio y de su número")
    return {"ok": not errores, "errores": errores, "faltan": faltan, "avisos": avisos,
            "por_medir": sin_numero, "oferta": cuenta, "ejemplo": bool(d.get("ejemplo"))}


# ── Armar: las piezas vivas y la página ──────────────────────────────────────────────────────────────────────────────

def titulos(d: dict) -> dict:
    tu = d.get("para") == "cliente"
    base = {"norte": "Tu norte" if tu else "Mi norte", "sistema": "El sistema nervioso", "oferta": "La oferta", "vehiculo": "El vehículo"}
    return {**base, **{k: v for k, v in (d.get("titulos") or {}).items() if k in base and txt(v)}}


def _num(x) -> float | None:
    s = re.sub(r"[^0-9.]", "", str(x if x is not None else ""))
    try:
        return float(s) if s else None
    except ValueError:
        return None


def completar(d: dict) -> dict:
    """Lo que viaja dentro de las piezas: el mapa y, si hay con qué, el costo a escala contra lo que falta para la meta."""
    x = copy.deepcopy(d)
    costo = (x.get("vehiculo") or {}).get("costo") or {}
    meta = (x.get("norte") or {}).get("meta") or {}
    de, a, mes = _num(meta.get("de")), _num(meta.get("a")), _num(costo.get("mes_num"))
    if not costo.get("escala") and mes and de and a and a > de:
        moneda = x.get("moneda") or ""
        costo["escala"] = [{"rotulo": "se van al mes", "valor": mes, "texto": costo.get("mes") or f"≈ {int(mes):,} {moneda}".strip()},
                           {"rotulo": "faltan para la meta", "valor": a - de, "texto": f"{int(a - de):,} {moneda}".strip()}]
    return x


def armar_piezas(d: dict, salida: Path) -> dict:
    kit = (SKILLS / "canvas" / "assets" / "pieza" / "kit.js").read_text(encoding="utf-8")
    datos = completar(d)
    fichas = {}
    for pid, (titulo, pasos) in PIEZAS.items():
        fuente = (AQUI.parent / "assets" / "piezas" / f"{pid}.js").read_text(encoding="utf-8")
        html = LV.armar_pieza(pid, titulo, fuente, kit, datos, pasos(d))
        LV.guardar(salida / f"{pid}.html", html)
        fichas[pid] = LV.ficha_de(html)
    return fichas


def pagina(d: dict, fichas: dict, salida: Path) -> LV.Pagina:
    t = titulos(d)
    tu = d.get("para") == "cliente"
    N = d.get("norte") or {}
    tesis = {"norte": "A dónde vas y lo que no se negocia." if tu else "A dónde voy y lo que no negocio.",
             "sistema": "La información sube; las correcciones bajan.",
             "oferta": "Qué vendes, a quién y en qué términos." if tu else "Qué vendo, a quién y en qué términos.",
             "vehiculo": "Lo que te lleva de hoy a tu meta, paso por paso." if tu else "Lo que lleva a mi cliente de hoy a su resultado.",
             **{k: v for k, v in (d.get("tesis") or {}).items() if txt(v)}}
    nombre = f"Mapa vivo · {d['negocio']}" + (" (ejemplo)" if d.get("ejemplo") else "")
    P = LV.Pagina(nombre, columnas=2)
    liga = lambda pid: "doc:" + relativa(salida / f"{pid}.html")

    # 1 · el norte: las ondas (viva), las tres frases y los principios (nativos, editables) y a dónde ir
    c = P.capitulo("norte", t["norte"], tema=t["norte"], tinte="ambar", ceja="1 · a dónde vas" if tu else "1 · a dónde voy", tesis=tesis["norte"], color=LV.AMBAR)
    P.pieza("ondas", c.x0, c.baja(c.ancho * fichas["ondas"]["alto"] / fichas["ondas"]["ancho"], 50), c.ancho, liga("ondas"), fichas["ondas"], tema=c.tema)
    tercio, alto = (c.ancho - 120) / 3, 470
    y = c.baja(alto, 50)
    su = "Tu" if tu else "Mi"
    for i, (k, ceja) in enumerate((("porque", f"{su} porqué"), ("meta", f"{su} meta"), ("juego", f"{su} juego"))):
        f = N.get(k) or {}
        P.frase(f"norte:{k}", c.x0 + i * (tercio + 60), y, tercio, alto, ceja, f.get("texto") or "", f.get("estado") or "pendiente", f.get("sello"), tema=c.tema, tam=72)
    mitad = (c.ancho - 60) / 2
    y = c.y
    pr = [p for p in N.get("principios") or [] if txt(p.get("texto"))][:5]
    P.texto("norte:pri:ceja", c.x0 + 6, y, (f"{su}s principios").upper(), 34, 800, color=LV.MORADO, espaciado=6, tema=c.tema)
    yy = y + 78
    for i, p in enumerate(pr or [{"texto": "faltan por escribir", "estado": "pendiente"}]):
        ls = LV.cortar(p["texto"], mitad - 110, 46, 600)
        firme = LV.estado_de(p.get("estado")) in ("firmado", "opera")
        P.texto(f"norte:pri:{i + 1}:n", c.x0 + 6, yy, "—" if firme else "·", 46, 800, color=LV.MORADO, tema=c.tema)
        P.texto(f"norte:pri:{i + 1}", c.x0 + 84, yy, p["texto"], 46, 600, ancho=mitad - 110, cursiva=not firme, opacidad=1 if firme else .6, tema=c.tema)
        yy += 46 * 1.3 * len(ls) + 22
    enf = N.get("enfoque") or {}
    xe, alto_e = c.x0 + mitad + 60, 226
    P.frase("norte:enfoque", xe, y, mitad, alto_e, "El enfoque", enf.get("texto") or "", enf.get("estado") or "pendiente", enf.get("sello"), tema=c.tema, tam=62)
    if txt(enf.get("abierto")):
        P.texto("norte:enfoque:ab:k", xe + 8, y + alto_e + 30, "ABIERTO", 30, 800, color=LV.AMBAR, espaciado=5, tema=c.tema)
        P.texto("norte:enfoque:ab", xe + 230, y + alto_e + 24, enf["abierto"], 36, 600, ancho=mitad - 250, cursiva=True, opacidad=.72, tema=c.tema)
    docs = [b for b in d.get("ir_a") or [] if txt(b.get("texto")) and str(b.get("destino", "")).startswith(("doc:", "page:"))][:3]
    if docs:                                               # los documentos de fondo: tarjetas que los abren dentro de la app
        wd, hd = (mitad - 40 * (len(docs) - 1)) / len(docs), 128
        P.texto("norte:doc:ceja", xe + 8, c.fondo - hd - 34, "PARA IR AL FONDO", 30, 800, color=LV.MORADO, espaciado=5, tema=c.tema)
        for i, b in enumerate(docs):
            P.enlace(f"norte:doc:{i + 1}", xe + i * (wd + 40), c.fondo - hd + 24, wd, hd, b["texto"], b["destino"], tema=c.tema)
    c.y = max(yy, y + alto_e)

    # 2 · el sistema nervioso: una sola pieza viva (piensa, siente, se mueve)
    c = P.capitulo("sistema", t["sistema"], tema=t["sistema"], tinte="morado", ceja="2 · cómo se mueve", tesis=tesis["sistema"], color=LV.MORADO)
    P.pieza("nervio", c.x0, c.baja(c.ancho * fichas["nervio"]["alto"] / fichas["nervio"]["ancho"], 0), c.ancho, liga("nervio"), fichas["nervio"], tema=c.tema)

    # 3 · la oferta: la escalera de valor y la hoja de 11 piezas
    c = P.capitulo("oferta", t["oferta"], tema=t["oferta"], tinte="morado", ceja="3 · qué vendes" if tu else "3 · qué vendo", tesis=tesis["oferta"], color=LV.MORADO)
    P.pieza("escalera", c.x0, c.baja(c.ancho * fichas["escalera"]["alto"] / fichas["escalera"]["ancho"], 64), c.ancho, liga("escalera"), fichas["escalera"], tema=c.tema)
    P.pieza("hoja", c.x0, c.baja(c.ancho * fichas["hoja"]["alto"] / fichas["hoja"]["ancho"], 0), c.ancho, liga("hoja"), fichas["hoja"], tema=c.tema)

    # 4 · el vehículo: los pasos y sus hilos de oro
    c = P.capitulo("vehiculo", t["vehiculo"], tema=t["vehiculo"], tinte="ambar", ceja="4 · cómo llegas" if tu else "4 · cómo llega mi cliente", tesis=tesis["vehiculo"], color=LV.AMBAR)
    P.pieza("hilos", c.x0, c.baja(c.ancho * fichas["hilos"]["alto"] / fichas["hilos"]["ancho"], 0), c.ancho, liga("hilos"), fichas["hilos"], tema=c.tema)

    # el título de la página y la leyenda de estados (nativos)
    ceja = "Mapa vivo" + (" · ejemplo inventado" if d.get("ejemplo") else "") + (f" · {_fecha_corta(d.get('fecha'))} {str(d.get('fecha'))[:4]}" if _fecha_corta(d.get("fecha")) else "")
    bajada = d.get("bajada") or ("Tu negocio de punta a punta: a dónde vas, cómo se mueve, qué vendes y qué se arregla primero." if tu
                               else "Mi negocio de punta a punta: a dónde voy, cómo se mueve, qué vendo y cómo llega mi cliente.")
    P.titular("mapa", d["negocio"], bajada, ceja)
    P.leyenda("mapa:ley", 2 * LV.ANCHO + LV.HUECO, -300 - 104)
    return P


def armar(c: Path) -> tuple[int, dict, LV.Pagina | None]:
    d = leer_datos(c)
    r = revisar(d)
    if not r["ok"]:
        return 2, r, None
    salida = c / "mapa"
    fichas = armar_piezas(d, salida)
    P = pagina(d, fichas, salida)
    return 0, {"ok": True, "piezas": [relativa(salida / f"{p}.html") for p in PIEZAS], "pagina": P.nombre, "capitulos": P.encuadres(),
               "faltan": r["faltan"], "por_medir": r["por_medir"], "avisos": r["avisos"] + P.revisar()}, P


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Mapa vivo: el negocio como un lienzo que se mueve, con capítulos y recorrido.")
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in ("nuevo", "revisar", "armar", "lienzo"):
        p = sub.add_parser(nombre)
        p.add_argument("slug", nargs="?")
        p.add_argument("--propio", action="store_true")
        p.add_argument("--carpeta")
        if nombre == "nuevo":
            p.add_argument("--negocio")
            p.add_argument("--fecha")
        if nombre == "lienzo":
            p.add_argument("--ensayo", action="store_true")
            p.add_argument("--carpeta-lienzo")
    a = ap.parse_args(argv)
    try:
        c = carpeta_de(a.slug, a.propio, a.carpeta)
        if a.orden == "nuevo":
            hoy = dt.date.fromisoformat(a.fecha) if a.fecha else dt.date.today()
            codigo, out = 0, nuevo(c, a.negocio, a.propio, hoy)
        elif a.orden == "revisar":
            out = revisar(leer_datos(c))
            codigo = 0 if out["ok"] else 2
        else:
            codigo, out, P = armar(c)
            if a.orden == "lienzo" and P is not None:
                res = P.escribir(manifiesto=c / "mapa" / "lienzo.manifiesto.json", ensayo=a.ensayo, carpeta=a.carpeta_lienzo)
                out = {**out, **res}
                if res.get("bloqueados"):
                    out["candados"] = "Hay partes con candado en la página: pregúntale antes de tocarlas."
    except Alto as e:
        codigo, out = 3, {"alto": str(e)}
    except (FileNotFoundError, ValueError, KeyError) as e:
        codigo, out = 2, {"error": str(e)}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
