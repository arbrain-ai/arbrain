#!/usr/bin/env python3
"""Contacto en frío: registro de contactados, los cinco números y revisor de huellas de un borrador.

Sin servicios ni llaves: solo biblioteca estándar de Python 3. Nunca envía nada.

    python3 frio.py agregar --negocio "Clínica X" [--categoria …] [--ciudad …] [--telefono …] [--sitio …]
                            [--correo …] [--diagnostico …] [--notas …]
    python3 frio.py existe  [--correo …] [--telefono …] [--sitio …] [--negocio … --ciudad …]
    python3 frio.py marcar  (--correo … | --telefono … | --sitio … | --negocio …) [--estado …] [--canal …]
                            [--resultado …] [--verificado …] [--nota …] [--fecha AAAA-MM-DD]
    python3 frio.py numeros
    python3 frio.py revisar <archivo.txt> [--primer-correo]

El registro vive en `.claude/memory/project/mi-negocio/contacto-en-frio/contactados.csv` del cerebro (se busca la
carpeta `.claude/` subiendo desde el directorio actual). `--dir <carpeta>` usa otra.

Códigos de salida: 0 bien, 1 «no existe» (existe) o hallazgos (revisar), 2 error de uso, 3 duplicado (agregar).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
import unicodedata
from pathlib import Path

COLUMNAS = [
    "id", "negocio", "categoria", "ciudad", "telefono", "sitio", "correo", "verificado", "diagnostico",
    "canal", "fecha_alta", "fecha_contacto", "estado", "fecha_respuesta", "resultado", "notas",
]
ESTADOS = ["nuevo", "enviado", "rebote", "respondio", "agendado", "no", "descartado"]
RESULTADOS = ["positivo", "neutro", "negativo"]
VERIFICADO = ["si", "no", "invalido"]
CONTACTADOS = {"enviado", "rebote", "respondio", "agendado", "no"}
RESPONDIERON = {"respondio", "agendado", "no"}
CARPETA_REL = Path(".claude/memory/project/mi-negocio/contacto-en-frio")


# ---------------------------------------------------------------- utilidades

def hoy() -> str:
    return dt.date.today().isoformat()


def plano(texto: str) -> str:
    """Minúsculas, sin acentos ni signos: para comparar nombres."""
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def solo_digitos(tel: str) -> str:
    return re.sub(r"\D", "", tel or "")


def dominio(sitio: str) -> str:
    s = (sitio or "").strip().lower()
    s = re.sub(r"^[a-z]+://", "", s)
    s = s.split("/")[0].split("?")[0]
    return s[4:] if s.startswith("www.") else s


def carpeta(arg: str | None) -> Path:
    if arg:
        return Path(arg).expanduser().resolve()
    aqui = Path.cwd().resolve()
    for p in [aqui, *aqui.parents]:
        if (p / ".claude").is_dir():
            return p / CARPETA_REL
    return aqui / CARPETA_REL


def leer(ruta: Path) -> list[dict]:
    if not ruta.exists():
        return []
    with ruta.open(newline="", encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    return [{c: (fila.get(c) or "") for c in COLUMNAS} for fila in filas]


def escribir(ruta: Path, filas: list[dict]) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS)
        w.writeheader()
        w.writerows(filas)
    tmp.replace(ruta)


def coincide(fila: dict, correo="", telefono="", sitio="", negocio="", ciudad="") -> str:
    """Devuelve por qué llave coincide la fila, o cadena vacía."""
    if correo and fila["correo"].strip().lower() == correo.strip().lower():
        return "correo"
    d = solo_digitos(telefono)
    if len(d) >= 7 and solo_digitos(fila["telefono"])[-10:] == d[-10:]:
        return "telefono"
    if sitio and dominio(fila["sitio"]) and dominio(fila["sitio"]) == dominio(sitio):
        return "sitio"
    if negocio and plano(fila["negocio"]) == plano(negocio):
        if not ciudad or not fila["ciudad"] or plano(fila["ciudad"]) == plano(ciudad):
            return "negocio"
    return ""


def buscar(filas, a) -> list[tuple[dict, str]]:
    claves = dict(correo=a.correo or "", telefono=a.telefono or "", sitio=a.sitio or "",
                  negocio=a.negocio or "", ciudad=getattr(a, "ciudad", "") or "")
    out = []
    for f in filas:
        por = coincide(f, **claves)
        if por:
            out.append((f, por))
    return out


def resumen(f: dict) -> str:
    partes = [f["negocio"], f["ciudad"], f["correo"] or f["telefono"] or f["sitio"]]
    est = f["estado"] + (f" ({f['resultado']})" if f["resultado"] else "")
    fecha = f["fecha_contacto"] or f["fecha_alta"]
    return f"#{f['id']} " + " · ".join(p for p in partes if p) + f" · {est} · {fecha}"


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:.1f}%" if b else "sin datos"


# ---------------------------------------------------------------- comandos

def cmd_agregar(a, ruta: Path) -> int:
    if not a.negocio:
        print("Falta --negocio.", file=sys.stderr)
        return 2
    filas = leer(ruta)
    dup = buscar(filas, a)
    if dup:
        print("Ya está en el registro; no se agregó:")
        for f, por in dup:
            print(f"  {resumen(f)}  (coincide por {por})")
        return 3
    nuevo_id = max([int(f["id"]) for f in filas if f["id"].isdigit()] or [0]) + 1
    fila = {c: "" for c in COLUMNAS}
    fila.update(id=str(nuevo_id), negocio=a.negocio.strip(), categoria=a.categoria or "", ciudad=a.ciudad or "",
                telefono=a.telefono or "", sitio=a.sitio or "", correo=(a.correo or "").strip().lower(),
                diagnostico=a.diagnostico or "", notas=a.notas or "", fecha_alta=hoy(), estado="nuevo")
    filas.append(fila)
    escribir(ruta, filas)
    print(f"Agregado: {resumen(fila)}")
    return 0


def cmd_existe(a, ruta: Path) -> int:
    if not any([a.correo, a.telefono, a.sitio, a.negocio]):
        print("Da al menos una llave: --correo, --telefono, --sitio o --negocio.", file=sys.stderr)
        return 2
    dup = buscar(leer(ruta), a)
    if not dup:
        print("No está en el registro.")
        return 1
    print("Ya está en el registro:")
    for f, por in dup:
        print(f"  {resumen(f)}  (coincide por {por})")
    return 0


def cmd_marcar(a, ruta: Path) -> int:
    if not any([a.correo, a.telefono, a.sitio, a.negocio]):
        print("Di a quién: --correo, --telefono, --sitio o --negocio.", file=sys.stderr)
        return 2
    filas = leer(ruta)
    dup = buscar(filas, a)
    if not dup:
        print("No está en el registro. Agrégalo primero con `agregar`.", file=sys.stderr)
        return 2
    if len(dup) > 1:
        print("Coincide con varios; usa una llave más precisa:", file=sys.stderr)
        for f, por in dup:
            print(f"  {resumen(f)}  (por {por})", file=sys.stderr)
        return 2
    f = dup[0][0]
    fecha = a.fecha or hoy()
    if a.estado:
        f["estado"] = a.estado
        if a.estado == "enviado" and not f["fecha_contacto"]:
            f["fecha_contacto"] = fecha
        if a.estado in RESPONDIERON and not f["fecha_respuesta"]:
            f["fecha_respuesta"] = fecha
            if a.estado == "agendado" and not a.resultado:
                f["resultado"] = "positivo"
            if a.estado == "no" and not a.resultado:
                f["resultado"] = "negativo"
    if a.canal:
        f["canal"] = a.canal if not f["canal"] or a.canal in f["canal"].split("+") else f"{f['canal']}+{a.canal}"
    if a.resultado:
        f["resultado"] = a.resultado
    if a.verificado:
        f["verificado"] = a.verificado
    if a.nota:
        f["notas"] = (f["notas"] + " | " if f["notas"] else "") + f"{fecha}: {a.nota}"
    escribir(ruta, filas)
    print(f"Actualizado: {resumen(f)}")
    return 0


def cmd_numeros(a, ruta: Path) -> int:
    filas = leer(ruta)
    if not filas:
        print(f"Registro vacío ({ruta}). Agrega el primer negocio con `agregar`.")
        return 0
    contactados = [f for f in filas if f["estado"] in CONTACTADOS or f["fecha_contacto"]]
    rebotes = [f for f in contactados if f["estado"] == "rebote"]
    entregados = len(contactados) - len(rebotes)
    respondieron = [f for f in contactados if f["estado"] in RESPONDIERON or f["fecha_respuesta"]]
    positivas = [f for f in respondieron if f["resultado"] == "positivo"]
    agendados = [f for f in filas if f["estado"] == "agendado"]
    hace7 = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    semana = [f for f in positivas if f["fecha_respuesta"] >= hace7]
    hace90 = (dt.date.today() - dt.timedelta(days=90)).isoformat()
    reciclables = [f for f in contactados if f["estado"] == "enviado" and f["fecha_contacto"]
                   and f["fecha_contacto"] <= hace90]

    print(f"Registro: {len(filas)} negocios · {len(contactados)} contactados · {len(agendados)} agendados")
    print()
    print("Los cinco números")
    print("  Entrega a bandeja:        sin medir aquí (usa cuentas de prueba en cada lote, email.md §6)")
    print(f"  Rebote:                   {pct(len(rebotes), len(contactados))}  ({len(rebotes)} de {len(contactados)})"
          "  · sano: menos de 3%")
    print(f"  Respuesta:                {pct(len(respondieron), entregados)}  ({len(respondieron)} de {entregados})"
          "  · sano: 3 a 5%")
    print(f"  Positivas:                {pct(len(positivas), len(respondieron))}  ({len(positivas)} de"
          f" {len(respondieron)})  · referencia: cerca de 45%")
    print(f"  Conversaciones, 7 días:   {len(semana)}")
    print()
    print("Llaves (cuántos se pueden alcanzar por cada canal)")
    for col in ["correo", "telefono", "sitio"]:
        n = sum(1 for f in filas if f[col].strip())
        print(f"  {col:<9} {n} de {len(filas)} ({pct(n, len(filas))})")
    invalidos = sum(1 for f in filas if f["verificado"] == "invalido")
    sin_verificar = sum(1 for f in filas if f["correo"] and not f["verificado"] and f["estado"] == "nuevo")
    if sin_verificar or invalidos:
        print(f"  correos sin verificar por enviar: {sin_verificar} · inválidos: {invalidos}")
    if reciclables:
        print(f"\nSin respuesta hace más de 90 días (se pueden volver a contactar, con registro): {len(reciclables)}")
    if contactados and len(contactados) >= 50 and len(respondieron) / max(entregados, 1) < 0.015:
        print("\nAlerta: respuesta menor a 1.5% con 50+ contactos. Revisa lista u oferta antes que volumen"
              " (SKILL.md §8).")
    if contactados and len(rebotes) / len(contactados) > 0.05:
        print("\nAlerta: rebote arriba de 5%. Para y verifica la lista antes del siguiente lote.")
    return 0


TRAMPA = [
    "garantizado", "garantizada", "garantizamos", "100%", "urgente", "oferta", "$$$", "gratis", "descuento",
    "promoción", "promocion", "haz clic", "haga clic", "click aquí", "click aqui", "clic aquí", "clic aqui",
    "gana dinero", "sin costo", "última oportunidad", "ultima oportunidad", "aprovecha", "compra ya",
]
# En el cuerpo pueden ir con naturalidad («una pieza gratis»); en el asunto delatan la venta.
SOLO_EN_ASUNTO = ("gratis", "oferta", "descuento", "sin costo")
BAJA = re.compile(r"\b(stop|darte de baja|darse de baja|dar de baja|unsubscribe|desuscrib\w*)\b", re.I)
ENLACE = re.compile(r"(https?://\S+|www\.\S+|\b[\w-]+\.(com|mx|net|org|io|co|es|ai|app|link|ly)(/\S*)?\b)", re.I)
CALENDARIO = re.compile(r"(calendly|cal\.com|agenda aqu|agendar aqu|reserva aqu|book a call)", re.I)


def cmd_revisar(a, _ruta: Path) -> int:
    p = Path(a.archivo)
    if not p.exists():
        print(f"No existe {p}.", file=sys.stderr)
        return 2
    texto = p.read_text(encoding="utf-8")
    bajo = texto.lower()
    hallazgos: list[str] = []

    lineas = texto.strip().splitlines()
    asunto = ""
    if lineas and lineas[0].lower().startswith("asunto:"):
        asunto = lineas[0].split(":", 1)[1].strip()
        cuerpo = "\n".join(lineas[1:]).strip()
    else:
        cuerpo = texto.strip()

    if asunto:
        n = len(asunto.split())
        if n > 6:
            hallazgos.append(f"Asunto de {n} palabras: mejor 3 a 5 y que suene a colega, no a venta.")
        for w in TRAMPA:
            if w in asunto.lower():
                hallazgos.append(f"Palabra trampa en el asunto: «{w}».")

    # Un dominio dentro de una dirección de correo (hola@ejemplo.com) no es un enlace.
    enlaces = [m.group(0) for m in ENLACE.finditer(cuerpo) if m.start() == 0 or cuerpo[m.start() - 1] != "@"]
    if a.primer_correo and enlaces:
        hallazgos.append(f"Enlace en el primer correo ({', '.join(enlaces[:3])}): los filtros lo leen como phishing.")
    elif len(enlaces) > 1:
        hallazgos.append(f"{len(enlaces)} enlaces: uno como máximo, y solo cuando ya respondió.")
    if CALENDARIO.search(cuerpo):
        hallazgos.append("Enlace o invitación de calendario: pide compromiso antes de dar valor.")
    if re.search(r"<\s*(img|a|div|table|p|br|span)\b|<html", bajo):
        hallazgos.append("HTML o imágenes: de persona a persona es texto plano.")
    if BAJA.search(cuerpo):
        hallazgos.append("Pie tipo «responde STOP / darte de baja»: es la marca de un envío masivo.")
    for w in TRAMPA:
        if w in cuerpo.lower() and w not in SOLO_EN_ASUNTO:
            hallazgos.append(f"Palabra trampa: «{w}».")
    if re.search(r"\{[^{}]*\|[^{}]*\}", texto):
        hallazgos.append("Tiene variación sin resolver {a|b}: lee todas las combinaciones antes de enviar.")
    if re.search(r"\{\{[^}]+\}\}", texto):
        hallazgos.append("Tiene campos sin llenar {{…}}.")
    palabras = len(re.findall(r"\w+", cuerpo))
    if palabras > 120:
        hallazgos.append(f"Cuerpo de {palabras} palabras: 2 a 4 frases (unas 50 a 90 palabras) se leen; más se archiva.")
    frases = [s for s in re.split(r"[.!?¿¡]+\s", cuerpo) if len(s.split()) > 2]
    if len(frases) > 6:
        hallazgos.append(f"{len(frases)} frases: máximo 5.")
    if re.search(r"(como (hablamos|quedamos)|me encant[oó] tu (publicaci|post))", bajo):
        hallazgos.append("Relación o personalización que suena falsa («como hablamos», «me encantó tu publicación»).")
    if re.search(r"(no me (has )?contestado|veo que no (me )?respond)", bajo):
        hallazgos.append("Seguimiento con culpa («veo que no me contestaste»).")

    if not hallazgos:
        print(f"{p.name}: sin huellas de envío masivo. La aprobación sigue siendo del dueño.")
        return 0
    print(f"{p.name}: {len(hallazgos)} hallazgo(s)")
    for h in dict.fromkeys(hallazgos):
        print(f"  - {h}")
    return 1


# ---------------------------------------------------------------- entrada

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Contacto en frío: registro, números y revisor. Nunca envía.")
    ap.add_argument("--dir", help="carpeta del registro (por defecto, la del cerebro)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def llaves(p, con_ciudad=True):
        p.add_argument("--correo")
        p.add_argument("--telefono")
        p.add_argument("--sitio")
        p.add_argument("--negocio")
        if con_ciudad:
            p.add_argument("--ciudad")

    p = sub.add_parser("agregar")
    llaves(p)
    for c in ["categoria", "diagnostico", "notas"]:
        p.add_argument(f"--{c}")
    p = sub.add_parser("existe")
    llaves(p)
    p = sub.add_parser("marcar")
    llaves(p)
    p.add_argument("--estado", choices=ESTADOS)
    p.add_argument("--canal")
    p.add_argument("--resultado", choices=RESULTADOS)
    p.add_argument("--verificado", choices=VERIFICADO)
    p.add_argument("--nota")
    p.add_argument("--fecha")
    sub.add_parser("numeros")
    p = sub.add_parser("revisar")
    p.add_argument("archivo")
    p.add_argument("--primer-correo", action="store_true")

    a = ap.parse_args(argv)
    if getattr(a, "fecha", None) and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.fecha):
        print("--fecha va como AAAA-MM-DD.", file=sys.stderr)
        return 2
    ruta = carpeta(a.dir) / "contactados.csv"
    return {"agregar": cmd_agregar, "existe": cmd_existe, "marcar": cmd_marcar,
            "numeros": cmd_numeros, "revisar": cmd_revisar}[a.cmd](a, ruta)


if __name__ == "__main__":
    sys.exit(main())
