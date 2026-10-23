#!/usr/bin/env python3
"""Bajar a tierra: la pluma del ritual mes → semana → día (skill `bajar-a-tierra`).

    python3 .claude/skills/bajar-a-tierra/scripts/plan.py estado
    python3 .claude/skills/bajar-a-tierra/scripts/plan.py mes --texto "3,000 USD cobrados de 2 clientes"
    python3 .claude/skills/bajar-a-tierra/scripts/plan.py semana --resultado "..." --resultado "..." --resultado "..."
    python3 .claude/skills/bajar-a-tierra/scripts/plan.py dia --objetivo "..." --tarea "..." --tarea "..." --tarea "..."
    python3 .claude/skills/bajar-a-tierra/scripts/plan.py lienzos

Qué hace:
  - `estado` (solo lectura, JSON): la meta a 90 días de su expediente, dónde va en el programa (`camino`, con el día de
    hoy recalculado desde su inicio), el objetivo del mes, los resultados de la semana
    y el objetivo y las tareas de hoy, y `falta`: lo primero que hay que bajar a tierra (mes, semana, día o nada).
  - `mes`, `semana` y `dia` escriben en `.claude/plan/objetivos.md` con el formato que leen el Calendario del panel, el
    puente y now.md (`## Octubre 2026` · `**Mes:**` · `### Semana 19-25` · `**Foco:**` · `#### Jue 22` · `- [ ]`).
    `dia` además pone el objetivo en `.claude/plan/calendario.json` como tarea de hoy con la etiqueta `objetivo` y sus
    tareas como casillas de su descripción: así el Día del Calendario enseña el objetivo con sus 3 casillas.
  - `lienzos` redibuja «Mi plan · mes, semana y día» y «Calendario de 12 semanas» con lo escrito (API del lienzo de
    Arbrain; solo dentro de la app, con `MISSION_CONTROL_ORIGIN` y `ARBRAIN_PASE_AGENTE`).
Reglas: nunca inventa (solo escribe lo que recibe), nunca pisa un objetivo distinto sin `--reemplazar`, no toca lo que
no es suyo, escribe de forma atómica y si un archivo no se puede leer, no lo sobrescribe. `--revisar` no escribe.
Solo biblioteca estándar de Python 3 (macOS, Windows y Linux).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre"]
DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
VACIO = "_(Vacío. Dile a Levy «planeemos el mes» y lo llenan juntos.)_"
REGISTRO = re.compile(r"<!--\s*arbrain-objectives-v1\s*\n([\s\S]*?)\n-->")
SEP = " · "
LIENZO_PLAN = "Mi plan · mes, semana y día"
LIENZO_12 = "Calendario de 12 semanas"


class Alto(Exception):
    """Un alto con mensaje para Levy (código 3: hay que preguntarle al dueño)."""

    def __init__(self, msg: str, codigo: int = 3):
        super().__init__(msg)
        self.codigo = codigo


# ── Raíz, fecha y lectura ────────────────────────────────────────────────────────────────────────────────────────────

def raiz() -> Path:
    for v in ("ARBRAIN_PLAN_RAIZ", "ARBRAIN_HOME", "CLAUDE_PROJECT_DIR"):
        if os.environ.get(v) and (Path(os.environ[v]) / ".claude").is_dir():
            return Path(os.environ[v])
    aqui = Path(__file__).resolve()
    if len(aqui.parents) > 4 and (aqui.parents[4] / ".claude").is_dir():
        return aqui.parents[4]
    return Path.cwd()


def leer(ruta: Path) -> str | None:
    try:
        return ruta.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def escribir(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(ruta.parent), prefix=f".{ruta.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        os.replace(tmp, ruta)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def zona(cal: dict | None) -> dt.tzinfo | None:
    nombre = (cal or {}).get("zona")
    if isinstance(nombre, str) and nombre:
        try:
            from zoneinfo import ZoneInfo
            return ZoneInfo(nombre)
        except Exception:
            return None
    return None


def hoy_de(args, cal: dict | None) -> dt.date:
    if getattr(args, "hoy", None):
        return dt.date.fromisoformat(args.hoy)
    tz = zona(cal)
    return (dt.datetime.now(tz) if tz else dt.datetime.now()).date()


def lunes(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


def clave(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).lower().split())


def limpio(s: str, maximo: int = 300) -> str:
    """Texto de una línea: sin saltos, sin marcas de comentario ni de casilla al inicio."""
    s = " ".join((s or "").replace("<!--", "").replace("-->", "").split())
    s = re.sub(r"^(- \[[ xX]\]\s*|\*\*\w+:\*\*\s*|#+\s*)", "", s)
    return s[:maximo]


# ── objetivos.md: lectura ─────────────────────────────────────────────────────────────────────────────────────────────

def sin_comentarios(lineas: list[str]) -> list[bool]:
    """Para cada línea, ¿está dentro de un comentario HTML? (el instructivo de arriba y el registro de la app)."""
    dentro, out = False, []
    for l in lineas:
        if not dentro and "<!--" in l:
            dentro = "-->" not in l.split("<!--", 1)[1]
            out.append(True)
        elif dentro:
            out.append(True)
            if "-->" in l:
                dentro = False
        else:
            out.append(False)
    return out


def leer_plan(texto: str, hoy: dt.date) -> dict:
    """Lo vigente hoy: mes, foco de la semana (y sus resultados), casillas de hoy y de toda la semana en 12 semanas."""
    out = {"mes": None, "semana": None, "dia": [], "focos": {}}
    # Registro de la app (scope/start/end/title): cuenta igual que lo escrito a mano.
    m = REGISTRO.search(texto)
    if m:
        try:
            for g in json.loads(m.group(1)).get("goals") or []:
                if g.get("status") == "dropped" or not str(g.get("title") or "").strip():
                    continue
                if g.get("start", "") <= hoy.isoformat() < g.get("end", ""):
                    k = {"month": "mes", "week": "semana"}.get(g.get("scope"))
                    if k and not out[k]:
                        out[k] = g["title"].strip()
                    elif g.get("scope") == "day":
                        out["dia"].append(g["title"].strip())
                if g.get("scope") == "week" and g.get("start"):
                    out["focos"].setdefault(g["start"], g["title"].strip())
        except (ValueError, AttributeError, TypeError):
            pass
    lineas = texto.splitlines()
    oculto = sin_comentarios(lineas)
    anio = mes = None
    semana = dia = None
    for l, o in zip(lineas, oculto):
        if o:
            continue
        if l.startswith("## "):
            anio = mes = semana = dia = None
            x = re.match(r"^##\s+(\S+)\s+(\d{4})\s*$", l)
            if x and x.group(1).lower() in MESES:
                anio, mes = int(x.group(2)), MESES.index(x.group(1).lower()) + 1
        elif l.startswith("### "):
            semana = dia = None
            x = re.match(r"^###\s+Semana\s+(\d{1,2})", l)
            if mes and x:
                try:
                    semana = lunes(dt.date(anio, mes, int(x.group(1))))
                except ValueError:
                    semana = None
        elif l.startswith("#### "):
            dia = None
            x = re.match(r"^####\s+\S+\s+(\d{1,2})\b", l)
            if mes and x:
                try:
                    dia = dt.date(anio, mes, int(x.group(1)))
                except ValueError:
                    dia = None
        if mes and l.startswith("**Mes:**") and (anio, mes) == (hoy.year, hoy.month) and not out["mes"]:
            out["mes"] = l.split("**Mes:**", 1)[1].strip() or None
        elif semana and l.startswith("**Foco:**"):
            foco = l.split("**Foco:**", 1)[1].strip()
            if foco:
                out["focos"].setdefault(semana.isoformat(), foco)
                if semana == lunes(hoy) and not out["semana"]:
                    out["semana"] = foco
        elif dia == hoy and re.match(r"^- \[[ xX]\]", l):
            t = re.sub(r"^- \[[ xX]\]\s*", "", l).strip()
            if t and clave(t) not in {clave(x) for x in out["dia"]}:
                out["dia"].append(t)
    return out


def leer_meta(r: Path) -> dict:
    """La meta a 90 días de su expediente (project/meta-90-dias.md o el fechado más reciente)."""
    carpeta = r / ".claude" / "memory" / "project"
    candidatos = [carpeta / "meta-90-dias.md"] + sorted(carpeta.glob("meta-90-dias-*.md"), reverse=True)
    for ruta in candidatos:
        t = leer(ruta)
        if not t or "arbrain:expediente pendiente" in t:
            continue
        linea = next((l for l in t.splitlines() if re.search(r"meta a 90 d[ií]as", l, re.I) and ":" in l), None)
        nicho = next((l for l in t.splitlines() if "nicho natural" in l.lower()), None)
        if not linea:
            continue
        texto = limpio(linea.split(":", 1)[1].replace("**", ""), 300)
        num = re.search(r"(\d[\d.,]*)\s*(USD|MXN)?", texto)
        fecha = re.search(r"(\d{4}-\d{2}-\d{2})", texto)
        return {"presente": True, "texto": texto, "monto": num.group(1) if num else None,
                "moneda": (num.group(2) if num and num.group(2) else None), "fecha": fecha.group(1) if fecha else None,
                "nicho": limpio(nicho.split(":", 1)[1].replace("**", ""), 400) if nicho and ":" in nicho else None,
                "archivo": ruta.relative_to(r).as_posix()}
    return {"presente": False, "texto": None, "monto": None, "moneda": None, "fecha": None, "nicho": None, "archivo": None}


def leer_camino(r: Path, hoy: dt.date) -> dict:
    """Dónde va en el programa (project/mi-camino.md, lo trae el puente de Arbrain). El día de hoy se recalcula desde
    `inicio`: el archivo es la foto del día en que llegó (`traido`), y `fresco` dice si esa foto es de hoy."""
    vacio = {"presente": False, "traido": None, "fresco": False, "inicio": None, "dia_hoy": None, "semana_hoy": None,
             "siguiente_paso": None, "casillas_faltan": [], "archivo": None}
    ruta = r / ".claude" / "memory" / "project" / "mi-camino.md"
    t = leer(ruta)
    if not t or "arbrain:camino pendiente" in t:
        return vacio
    campos = dict(re.findall(r"^(traido|inicio):\s*(\d{4}-\d{2}-\d{2})\s*$", t, re.M))
    paso = next((l for l in t.splitlines() if "**Mi siguiente paso:**" in l), None)
    out = dict(vacio, presente=True, traido=campos.get("traido"), inicio=campos.get("inicio"),
               fresco=campos.get("traido") == hoy.isoformat(), archivo=ruta.relative_to(r).as_posix(),
               siguiente_paso=limpio(paso.split(":**", 1)[1], 400) if paso else None,
               casillas_faltan=[int(n) for n in re.findall(r"^\s*- Falta la (\d+)", t, re.M)])
    if out["inicio"]:
        try:
            n = (hoy - dt.date.fromisoformat(out["inicio"])).days + 1
            out["dia_hoy"] = n
            out["semana_hoy"] = (n - 1) // 7 + 1 if n >= 1 else None
        except ValueError:
            pass
    return out


def leer_calendario(r: Path) -> tuple[dict | None, str | None]:
    t = leer(r / ".claude" / "plan" / "calendario.json")
    if t is None or not t.strip():
        return None, None
    try:
        d = json.loads(t)
    except ValueError:
        return None, "calendario.json no es JSON válido: no lo toco hasta que se corrija."
    if not isinstance(d, dict) or not isinstance(d.get("eventos"), list) or not isinstance(d.get("tareas"), list):
        return None, "calendario.json no tiene «eventos» y «tareas»: no lo toco."
    return d, None


def estado(r: Path, hoy: dt.date) -> dict:
    cal, err_cal = leer_calendario(r)
    texto = leer(r / ".claude" / "plan" / "objetivos.md") or ""
    plan = leer_plan(texto, hoy)
    tareas_hoy, objetivos_cal = [], []
    for t in (cal or {}).get("tareas") or []:
        if not isinstance(t, dict) or str(t.get("fecha") or "")[:10] != hoy.isoformat():
            continue
        if "objetivo" in [str(e).lower() for e in t.get("etiquetas") or []]:
            objetivos_cal.append(t.get("titulo"))
            tareas_hoy += [re.sub(r"^- \[[ xX]\]\s*", "", l).strip() for l in str(t.get("descripcion") or "").splitlines()
                           if re.match(r"^- \[[ xX]\]", l)]
        else:
            tareas_hoy.append(t.get("titulo"))
    dia = list(plan["dia"])
    for o in objetivos_cal:
        if o and clave(o) not in {clave(x) for x in dia}:
            dia.append(o)
    semana = plan["semana"]
    falta = "mes" if not plan["mes"] else "semana" if not semana else "dia" if not dia else None
    return {
        "hoy": hoy.isoformat(), "dia_semana": DIAS[hoy.weekday()],
        "meta_90": leer_meta(r),
        "camino": leer_camino(r, hoy),
        "mes": plan["mes"],
        "semana": {"lunes": lunes(hoy).isoformat(), "texto": semana, "resultados": semana.split(SEP) if semana else []},
        "dia": {"objetivos": dia, "tareas": [t for t in tareas_hoy if t]},
        "falta": falta,
        "avisos": [err_cal] if err_cal else [],
    }


# ── objetivos.md: escritura ──────────────────────────────────────────────────────────────────────────────────────────

class Doc:
    def __init__(self, texto: str | None):
        base = texto if texto is not None else "# Objetivos\n"
        self.lineas = [l for l in base.splitlines() if l.strip() != VACIO]
        self.cambio = texto is None or len(self.lineas) != len(base.splitlines())

    def texto(self) -> str:
        return "\n".join(self.lineas).rstrip("\n") + "\n"

    def visibles(self) -> list[int]:
        return [i for i, o in enumerate(sin_comentarios(self.lineas)) if not o]

    def fin_contenido(self) -> int:
        """Antes del registro de la app (si está al final) y de `## Pendientes`; si no, al final."""
        for i in self.visibles():
            if self.lineas[i].strip().lower() == "## pendientes":
                return i
        m = [i for i, l in enumerate(self.lineas) if re.match(r"^\s*<!--\s*arbrain-objectives-v1", l)]
        return m[0] if m else len(self.lineas)

    def insertar(self, i: int, nuevas: list[str]) -> None:
        if i > 0 and self.lineas[i - 1].strip() and nuevas and nuevas[0].startswith("#"):
            nuevas = [""] + nuevas
        if i < len(self.lineas) and self.lineas[i].strip() and nuevas and nuevas[-1].strip():
            nuevas = nuevas + [""]
        self.lineas[i:i] = nuevas
        self.cambio = True

    def seccion(self, inicio: int, nivel: int) -> int:
        """Fin (exclusivo) de la sección que abre `inicio` con `nivel` almohadillas."""
        vis = set(self.visibles())
        for j in range(inicio + 1, len(self.lineas)):
            l = self.lineas[j]
            if j in vis and re.match(r"^#{1,%d}\s" % nivel, l):
                return j
            if re.match(r"^\s*<!--\s*arbrain-objectives-v1", l):
                return j
        return len(self.lineas)

    def mes(self, anio: int, mes: int) -> int:
        for i in self.visibles():
            x = re.match(r"^##\s+(\S+)\s+(\d{4})\s*$", self.lineas[i])
            if x and x.group(1).lower() == MESES[mes - 1] and int(x.group(2)) == anio:
                return i
        # Meses en orden: antes del primer mes posterior, si lo hay.
        destino = self.fin_contenido()
        for i in self.visibles():
            x = re.match(r"^##\s+(\S+)\s+(\d{4})\s*$", self.lineas[i])
            if x and x.group(1).lower() in MESES and (int(x.group(2)), MESES.index(x.group(1).lower()) + 1) > (anio, mes):
                destino = i
                break
        self.insertar(destino, [f"## {MESES[mes - 1].capitalize()} {anio}", ""])
        return self.mes(anio, mes)

    def linea_en(self, inicio: int, fin: int, prefijo: str) -> int | None:
        vis = set(self.visibles())
        for j in range(inicio + 1, fin):
            if j in vis and self.lineas[j].startswith(prefijo):
                return j
            if j in vis and self.lineas[j].startswith("#"):
                return None
        return None

    def poner(self, encabezado: int, nivel: int, prefijo: str, valor: str, reemplazar: bool, que: str) -> str:
        fin = self.seccion(encabezado, nivel)
        j = self.linea_en(encabezado, fin, prefijo)
        nueva = f"{prefijo} {valor}"
        if j is not None:
            actual = self.lineas[j][len(prefijo):].strip()
            if clave(actual) == clave(valor):
                return "igual"
            if actual and not reemplazar:
                raise Alto(f"Ya hay {que}: «{actual}». Pregúntale al dueño si lo cambia; con su sí, repite con --reemplazar.")
            self.lineas[j] = nueva
            self.cambio = True
            return "reemplazado"
        self.insertar(encabezado + 1, [nueva])
        return "escrito"

    def semana(self, anio: int, mes: int, a: int, b: int) -> int:
        i_mes = self.mes(anio, mes)
        fin = self.seccion(i_mes, 2)
        vis = set(self.visibles())
        destino = fin
        for j in range(i_mes + 1, fin):
            x = re.match(r"^###\s+Semana\s+(\d{1,2})\s*[-–]\s*(\d{1,2})", self.lineas[j]) if j in vis else None
            if x:
                if int(x.group(1)) <= a <= int(x.group(2)) or int(x.group(1)) <= b <= int(x.group(2)):
                    return j
                if int(x.group(1)) > b and destino == fin:
                    destino = j
            # Un día ya escrito a mano sin semana: la semana nueva va antes, para que quede dentro.
            y = re.match(r"^####\s+\S+\s+(\d{1,2})\b", self.lineas[j]) if j in vis else None
            if y and int(y.group(1)) >= a and destino == fin:
                destino = j
        self.insertar(destino, [f"### Semana {a}-{b}", ""])
        return self.semana(anio, mes, a, b)

    def dia(self, d: dt.date) -> int:
        # Si el día ya está escrito en su mes (con o sin semana), ese es.
        i_mes = self.mes(d.year, d.month)
        vis = set(self.visibles())
        for j in range(i_mes + 1, self.seccion(i_mes, 2)):
            x = re.match(r"^####\s+\S+\s+(\d{1,2})\b", self.lineas[j]) if j in vis else None
            if x and int(x.group(1)) == d.day:
                return j
        a, b = tramo_en_mes(d)
        i_sem = self.semana(d.year, d.month, a, b)
        fin = self.seccion(i_sem, 3)
        vis = set(self.visibles())
        destino = fin
        for j in range(i_sem + 1, fin):
            x = re.match(r"^####\s+\S+\s+(\d{1,2})\b", self.lineas[j]) if j in vis else None
            if x:
                if int(x.group(1)) == d.day:
                    return j
                if int(x.group(1)) > d.day and destino == fin:
                    destino = j
        self.insertar(destino, [f"#### {DIAS[d.weekday()]} {d.day:02d}", ""])
        return self.dia(d)

    def casilla(self, i_dia: int, texto: str) -> str:
        fin = self.seccion(i_dia, 4)
        for j in range(i_dia + 1, fin):
            x = re.match(r"^- \[[ xX]\]\s*(.*)$", self.lineas[j])
            if x and clave(x.group(1)) == clave(texto):
                return "igual"
        ultimo = i_dia
        for j in range(i_dia + 1, fin):
            if re.match(r"^- \[[ xX]\]", self.lineas[j]):
                ultimo = j
        self.lineas[ultimo + 1:ultimo + 1] = [f"- [ ] {texto}"]
        self.cambio = True
        return "escrito"


def tramo_en_mes(d: dt.date) -> tuple[int, int]:
    """Días (a, b) de la semana de `d` (lunes a domingo) dentro del mes de `d`."""
    lu = lunes(d)
    do = lu + dt.timedelta(days=6)
    a = lu.day if lu.month == d.month else 1
    b = do.day if do.month == d.month else (dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1) - dt.timedelta(days=1)).day
    return a, b


def escribir_mes(doc: Doc, hoy: dt.date, texto: str, reemplazar: bool) -> str:
    return doc.poner(doc.mes(hoy.year, hoy.month), 2, "**Mes:**", texto, reemplazar, "objetivo del mes")


def escribir_semana(doc: Doc, hoy: dt.date, resultados: list[str], reemplazar: bool) -> list[str]:
    """La semana (lunes a domingo); si cruza de mes, se parte en dos con el mismo foco (regla del parser)."""
    foco = SEP.join(resultados)
    hechos, lu = [], lunes(hoy)
    meses_vistos = []
    for k in range(7):
        d = lu + dt.timedelta(days=k)
        if (d.year, d.month) in meses_vistos:
            continue
        meses_vistos.append((d.year, d.month))
        a, b = tramo_en_mes(d)
        hechos.append(doc.poner(doc.semana(d.year, d.month, a, b), 3, "**Foco:**", foco, reemplazar, "foco de esta semana"))
    return hechos


# ── calendario.json ──────────────────────────────────────────────────────────────────────────────────────────────────

def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", clave(s)).strip("-")
    return s[:40] or "x"


def ahora_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def escribir_calendario(r: Path, cal: dict | None, hoy: dt.date, objetivo: str, tareas: list[str], hora: str | None,
                        minutos: int, revisar: bool) -> dict:
    ruta = r / ".claude" / "plan" / "calendario.json"
    if cal is None:
        if leer(ruta) not in (None, ""):
            raise Alto("calendario.json no se puede leer: no lo toco. Corrígelo y repite.", 4)
        cal = {"version": 1, "eventos": [], "tareas": [], "recibos": {}}
    ident = f"obj-{hoy.isoformat()}-{slug(objetivo)}"
    descripcion = "\n".join(f"- [ ] {t}" for t in tareas)
    sello = ahora_iso()
    tarea = next((t for t in cal["tareas"] if isinstance(t, dict) and t.get("id") == ident), None)
    resultado = {"tarea_objetivo": ident}
    if tarea is None:
        cal["tareas"].append({"id": ident, "titulo": objetivo, "descripcion": descripcion, "fecha": hoy.isoformat(),
                              "duracionMin": None, "prioridad": 1, "hecha": False, "hechaEn": None,
                              "etiquetas": ["objetivo", "bajar-a-tierra"], "creada": sello, "actualizado": sello})
        resultado["objetivo"] = "escrito"
    else:
        # Respeta las casillas ya marcadas; agrega solo las que faltan.
        actuales = str(tarea.get("descripcion") or "").splitlines()
        nuevas = [f"- [ ] {t}" for t in tareas if clave(t) not in {clave(re.sub(r'^- \[[ xX]\]\s*', '', l)) for l in actuales}]
        if nuevas:
            tarea["descripcion"] = "\n".join([l for l in actuales if l.strip()] + nuevas)
            tarea["actualizado"] = sello
        resultado["objetivo"] = "actualizado" if nuevas else "igual"
    if hora:
        if not re.match(r"^\d{2}:\d{2}$", hora):
            raise Alto("--hora va como HH:MM (24 horas).", 2)
        tz = zona(cal)  # sin zona en calendario.json: la del sistema PARA ESA FECHA (horario de verano incluido)
        inicio = dt.datetime.combine(hoy, dt.time.fromisoformat(hora), tzinfo=tz) if tz else \
            dt.datetime.combine(hoy, dt.time.fromisoformat(hora)).astimezone()
        fin = inicio + dt.timedelta(minutes=minutos)
        ev = f"bloque-{ident}"
        if not any(isinstance(e, dict) and e.get("id") == ev for e in cal["eventos"]):
            cal["eventos"].append({"id": ev, "titulo": objetivo, "inicio": inicio.isoformat(timespec="seconds"),
                                   "fin": fin.isoformat(timespec="seconds"), "todoElDia": False,
                                   "descripcion": "Objetivo del día · [levy]", "creado": sello, "actualizado": sello})
            resultado["bloque"] = ev
    if not revisar:
        escribir(ruta, json.dumps(cal, ensure_ascii=False, indent=2) + "\n")
        json.loads(leer(ruta) or "")  # relee: sigue siendo JSON válido
    return resultado


# ── Lienzos ──────────────────────────────────────────────────────────────────────────────────────────────────────────

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


def semanas_del_mes(hoy: dt.date) -> list[dt.date]:
    """Los lunes de las semanas (lunes a domingo) que tocan el mes de `hoy`."""
    primero = dt.date(hoy.year, hoy.month, 1)
    ultimo = dt.date(hoy.year + (hoy.month == 12), hoy.month % 12 + 1, 1) - dt.timedelta(days=1)
    d, out = lunes(primero), []
    while d <= ultimo:
        out.append(d)
        d += dt.timedelta(days=7)
    return out


def spec_mi_plan(est: dict, focos: dict, hoy: dt.date) -> dict:
    nodos = [{"id": "mes", "role": "deliverable", "title": "Objetivo del mes",
              "caption": est["mes"] or "Sin objetivo del mes todavía: dile a Levy «bájame a tierra el mes».",
              "chips": [{"text": f"{MESES[hoy.month - 1].upper()} {hoy.year}"}]}]
    aristas = []
    for n, lu in enumerate(semanas_del_mes(hoy), 1):
        foco = focos.get(lu.isoformat())
        do = lu + dt.timedelta(days=6)
        items = foco.split(SEP)[:5] if foco else ["Foco: …"]
        nodos.append({"id": f"s{n}", "role": "module", "title": f"Semana {n} · {lu.day}/{lu.month} al {do.day}/{do.month}",
                      "items": [limpio(i, 80) for i in items],
                      **({"chips": [{"text": "ESTA SEMANA"}]} if lu == lunes(hoy) else {})})
        aristas.append({"from": "mes", "to": f"s{n}"})
    dia = est["dia"]
    nodos.append({"id": "hoy", "role": "card", "title": "Objetivo de hoy",
                  "items": [limpio(x, 80) for x in (dia["objetivos"][:2] + [f"☐ {t}" for t in dia["tareas"][:3]])] or ["Lo único que mueve la semana"],
                  "chips": [{"text": f"{DIAS[hoy.weekday()].upper()} {hoy.day}"}]})
    actual = next((f"s{n}" for n, lu in enumerate(semanas_del_mes(hoy), 1) if lu == lunes(hoy)), "s1")
    aristas.append({"from": actual, "to": "hoy"})
    nodos.append({"id": "levy", "role": "agent", "title": "Levy lo baja al calendario",
                  "caption": "Cada mañana: «buenos días». Para replanear: «bájame a tierra el mes, la semana o el día»."})
    aristas.append({"from": "levy", "to": "hoy", "kind": "agente", "label": "agenda"})
    return {"title": LIENZO_PLAN, "nodes": nodos, "edges": aristas}


def spec_12(est: dict, focos: dict, hoy: dt.date) -> dict:
    meta = est["meta_90"]
    fin = dt.date.fromisoformat(meta["fecha"]) if meta.get("fecha") else None
    # 12 semanas que terminan en la semana de la fecha de su meta. Si hoy queda fuera de esa ventana (meta a más de 12
    # semanas, ya vencida o sin fecha), las 12 semanas empiezan esta semana.
    inicio = lunes(fin) - dt.timedelta(weeks=11) if fin else lunes(hoy)
    if not inicio <= lunes(hoy) <= inicio + dt.timedelta(weeks=11):
        inicio = lunes(hoy)
    nodos = [{"id": "meta", "role": "trigger", "title": "Meta de las 12 semanas",
              "caption": meta["texto"] or "Una cifra y una fecha. Si no se puede comprobar, aún no es meta."}]
    titulos = ["Mes 1 · Arranque", "Mes 2 · Tracción", "Mes 3 · Cierre"]
    for m in range(3):
        items = []
        for s in range(4):
            n = m * 4 + s
            lu = inicio + dt.timedelta(weeks=n)
            foco = focos.get(lu.isoformat())
            marca = " ◀ hoy" if lu == lunes(hoy) else ""
            items.append(limpio(f"Semana {n + 1} ({lu.day}/{lu.month}) · {foco.split(SEP)[0] if foco else '…'}{marca}", 90))
        nodos.append({"id": f"m{m + 1}", "role": "module", "title": titulos[m], "items": items})
    nodos += [{"id": "revision", "role": "callout", "index": 1, "title": "Revisión semanal",
               "caption": "Cada domingo: qué se cumplió, qué se mueve, qué se mata."},
              {"id": "cierre", "role": "deliverable", "title": "¿Se cumplió la meta?",
               "caption": f"El {fin.isoformat()}: evidencia, no sensación." if fin else "Evidencia, no sensación."}]
    aristas = [{"from": "meta", "to": "m1"}, {"from": "m1", "to": "m2"}, {"from": "m2", "to": "m3"},
               {"from": "m3", "to": "cierre"}, {"from": "revision", "to": "m2", "kind": "agente", "label": "ajusta"}]
    return {"title": LIENZO_12, "nodes": nodos, "edges": aristas}


def lienzos(r: Path, hoy: dt.date, revisar: bool) -> dict:
    est = estado(r, hoy)
    focos = leer_plan(leer(r / ".claude" / "plan" / "objetivos.md") or "", hoy)["focos"]
    specs = [(LIENZO_PLAN, "mi-plan", spec_mi_plan(est, focos, hoy)), (LIENZO_12, "doce-semanas", spec_12(est, focos, hoy))]
    if revisar:
        return {"revisar": True, "specs": {n: s for n, _, s in specs}}
    base = os.environ.get("MISSION_CONTROL_ORIGIN", "").rstrip("/")
    if not base or not os.environ.get("ARBRAIN_PASE_AGENTE"):
        return {"lienzos": "sin_app", "detalle": "Solo dentro de la app Arbrain (falta MISSION_CONTROL_ORIGIN o el pase)."}
    st, lista = _pedir("GET", f"{base}/api/canvas/pages")
    if st != 200:
        return {"lienzos": "no_responde", "detalle": f"El lienzo respondió {st}."}
    paginas = lista.get("paginas") or lista.get("pages") or []
    out = {}
    for nombre, region, spec in specs:
        pag = next((p for p in paginas if (p.get("nombre") or p.get("name")) == nombre), None)
        if not pag:
            out[nombre] = "no_existe (el dueño lo borró o nunca se sembró: no lo recreo sin su pedido)"
            continue
        st, r2 = _pedir("POST", f"{base}/api/canvas/pages/{pag['id']}/region",
                        {"regionId": region, "theme": "claro", "targetAspect": 1.6, "spec": spec})
        juez = (r2.get("judge") or {})
        out[nombre] = {"status": st, "ok": r2.get("ok", st == 200), "paginaId": pag["id"],
                       "juez": juez.get("ok"), "bloqueados": r2.get("bloqueados") or []}
    return {"lienzos": out}


# ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="plan.py", description="Bajar a tierra: mes → semana → día.")
    ap.add_argument("--hoy", help="AAAA-MM-DD (por defecto, hoy en su zona)")
    ap.add_argument("--revisar", action="store_true", help="no escribe: dice qué haría")
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("estado")
    p = sub.add_parser("mes")
    p.add_argument("--texto", required=True)
    p.add_argument("--reemplazar", action="store_true")
    p = sub.add_parser("semana")
    p.add_argument("--resultado", action="append", required=True)
    p.add_argument("--reemplazar", action="store_true")
    p = sub.add_parser("dia")
    p.add_argument("--objetivo", required=True)
    p.add_argument("--tarea", action="append", default=[])
    p.add_argument("--hora", help="HH:MM: además bloquea el objetivo en el calendario a esa hora")
    p.add_argument("--minutos", type=int, default=60)
    sub.add_parser("lienzos")
    for s in sub.choices.values():  # --hoy y --revisar también después de la orden
        s.add_argument("--hoy", dest="hoy_sub")
        s.add_argument("--revisar", dest="revisar_sub", action="store_true")
    args = ap.parse_args(argv)
    args.hoy = args.hoy_sub or args.hoy
    args.revisar = args.revisar or args.revisar_sub

    r = raiz()
    cal, _ = leer_calendario(r)
    hoy = hoy_de(args, cal)
    ruta_obj = r / ".claude" / "plan" / "objetivos.md"
    try:
        if args.orden == "estado":
            print(json.dumps(estado(r, hoy), ensure_ascii=False, indent=1))
            return 0
        if args.orden == "lienzos":
            print(json.dumps(lienzos(r, hoy, args.revisar), ensure_ascii=False, indent=1))
            return 0
        doc = Doc(leer(ruta_obj))
        res: dict = {"hoy": hoy.isoformat()}
        if args.orden == "mes":
            texto = limpio(args.texto)
            if not texto:
                raise Alto("El objetivo del mes no puede ir vacío.", 2)
            res["mes"] = escribir_mes(doc, hoy, texto, args.reemplazar)
        elif args.orden == "semana":
            resultados = [limpio(x, 160) for x in args.resultado if limpio(x)]
            if not 3 <= len(resultados) <= 5:
                raise Alto(f"La semana lleva de 3 a 5 resultados; llegaron {len(resultados)}.", 2)
            res["semana"] = escribir_semana(doc, hoy, resultados, args.reemplazar)
        elif args.orden == "dia":
            objetivo = limpio(args.objetivo)
            tareas = [limpio(t, 160) for t in args.tarea if limpio(t)]
            if not objetivo:
                raise Alto("El objetivo del día no puede ir vacío.", 2)
            if len(tareas) != 3:
                raise Alto(f"El día lleva su objetivo y 3 tareas; llegaron {len(tareas)}.", 2)
            res["dia"] = doc.casilla(doc.dia(hoy), objetivo)
            res["calendario"] = escribir_calendario(r, cal, hoy, objetivo, tareas, args.hora, args.minutos, args.revisar)
        if doc.cambio and not args.revisar:
            escribir(ruta_obj, doc.texto())
        res["revisar"] = bool(args.revisar)
        res["estado"] = estado(r, hoy) if not args.revisar else None
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0
    except Alto as e:
        print(json.dumps({"alto": str(e)}, ensure_ascii=False))
        return e.codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
