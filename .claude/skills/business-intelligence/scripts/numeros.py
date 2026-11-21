#!/usr/bin/env python3
"""Números del negocio desde un CSV de cobros, sin adivinar columnas (skill `business-intelligence`).

    N=".claude/skills/business-intelligence/scripts/numeros.py"
    python3 $N columnas <csv>                                   # encabezados y filas, sin mostrar datos de clientes
    python3 $N resumen <csv> --fecha COL --monto COL [opciones] [--por dia|semana|mes] [--desde F] [--hasta F]
    python3 $N comparar <csv> --fecha COL --monto COL [opciones] --dias N [--hasta F]
    python3 $N comparar <csv> ... --mes-a-la-fecha [--hasta F]

Opciones de columnas (los nombres exactos salen de `columnas`):
    --moneda COL | --moneda-fija USD     moneda de cada fila (nunca se suman monedas distintas)
    --estado COL --estado-ok a,b         solo filas con ese estado (p. ej. paid,succeeded)
    --reembolso COL --comision COL       para separar bruto, reembolsos, comisiones y neto
    --tipo COL                           alta / renovación / lo que traiga: cuenta por tipo
    --centavos                           los montos vienen en centavos
    --fecha-zona UTC                     zona en la que viene la fecha (por defecto UTC)
    --zona America/Mexico_City           zona del negocio para agrupar por día (por defecto UTC)

Qué devuelve (JSON): la cobertura (primera y última fecha, filas leídas, usadas y descartadas con su motivo), los
totales por moneda y por período y, en `comparar`, dos ventanas del mismo largo. Si una ventana se sale de la
cobertura, sale `comparable: false` con la razón: falta de dato no es cero.
Reglas: solo lee (nunca escribe), no imprime valores de clientes, no inventa columnas. Código 2: error de uso o columna
que no existe. Solo biblioteca estándar de Python 3.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python < 3.9
    ZoneInfo = None


class ErrorUso(Exception):
    pass


def zona(nombre: str):
    if nombre.upper() == "UTC":
        return dt.timezone.utc
    m = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", nombre)
    if m:
        signo = 1 if m.group(1) == "+" else -1
        return dt.timezone(signo * dt.timedelta(hours=int(m.group(2)), minutes=int(m.group(3))))
    if ZoneInfo is None:
        raise ErrorUso(f"No puedo cargar la zona «{nombre}» en este Python; usa un desfase como -06:00.")
    try:
        return ZoneInfo(nombre)
    except Exception:
        raise ErrorUso(f"No conozco la zona «{nombre}». En Windows instala tzdata (pip install tzdata) "
                       "o usa un desfase como -06:00.")


FORMATOS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"]


def leer_fecha(texto: str, tz_origen) -> dt.datetime | None:
    t = (texto or "").strip()
    if not t:
        return None
    if re.fullmatch(r"\d{10}(\.\d+)?", t):  # marca de tiempo Unix en segundos
        return dt.datetime.fromtimestamp(float(t), dt.timezone.utc)
    iso = t.replace("Z", "+00:00")
    try:
        f = dt.datetime.fromisoformat(iso)
    except ValueError:
        f = None
        for fmt in FORMATOS:
            try:
                f = dt.datetime.strptime(t, fmt)
                break
            except ValueError:
                continue
        if f is None:
            return None
    if f.tzinfo is None:
        f = f.replace(tzinfo=tz_origen)
    return f


def leer_monto(texto: str, centavos: bool) -> Decimal | None:
    t = (texto or "").strip()
    if not t:
        return None
    t = re.sub(r"[^\d,.\-]", "", t)
    if not t or t in "-.,":
        return None
    if "," in t and "." in t:
        # El separador decimal es el último que aparece.
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        partes = t.split(",")
        t = t.replace(",", ".") if len(partes) == 2 and len(partes[1]) in (1, 2) else t.replace(",", "")
    try:
        v = Decimal(t)
    except InvalidOperation:
        return None
    return v / 100 if centavos else v


def abrir(ruta: str):
    p = Path(ruta)
    if not p.is_file():
        raise ErrorUso(f"No encuentro el archivo {ruta}.")
    texto = p.read_text(encoding="utf-8-sig", errors="replace")
    muestra = texto[:4096]
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t")
    except csv.Error:
        dialecto = csv.excel
    return list(csv.DictReader(texto.splitlines(), dialect=dialecto))


def cmd_columnas(a) -> dict:
    filas = abrir(a.csv)
    encabezados = list(filas[0].keys()) if filas else []
    llenas = {h: sum(1 for f in filas if (f.get(h) or "").strip()) for h in encabezados}
    return {"archivo": a.csv, "filas": len(filas), "columnas": [{"nombre": h, "filas_con_valor": llenas[h]}
                                                                for h in encabezados]}


def cargar(a):
    filas = abrir(a.csv)
    if not filas:
        raise ErrorUso("El CSV no tiene filas.")
    encabezados = set(filas[0].keys())
    for opcion in ("fecha", "monto", "moneda", "estado", "reembolso", "comision", "tipo"):
        col = getattr(a, opcion, None)
        if col and col not in encabezados:
            raise ErrorUso(f"La columna «{col}» (--{opcion}) no existe. Corre `columnas` para ver las que hay.")
    if not a.moneda and not a.moneda_fija:
        raise ErrorUso("Falta la moneda: --moneda COL o --moneda-fija USD.")
    tz_origen, tz_negocio = zona(a.fecha_zona), zona(a.zona)
    ok = {e.strip().lower() for e in (a.estado_ok or "").split(",") if e.strip()}
    if a.estado and not ok:
        raise ErrorUso("Con --estado pasa también --estado-ok (los estados que cuentan como cobro).")
    usadas, descartes = [], {}

    def descartar(motivo):
        descartes[motivo] = descartes.get(motivo, 0) + 1

    for f in filas:
        if a.estado and (f.get(a.estado) or "").strip().lower() not in ok:
            descartar("estado fuera de --estado-ok")
            continue
        fecha = leer_fecha(f.get(a.fecha), tz_origen)
        if fecha is None:
            descartar("fecha ilegible o vacía")
            continue
        monto = leer_monto(f.get(a.monto), a.centavos)
        if monto is None:
            descartar("monto ilegible o vacío")
            continue
        moneda = (a.moneda_fija or (f.get(a.moneda) or "")).strip().upper()
        if not moneda:
            descartar("moneda vacía")
            continue
        reembolso = leer_monto(f.get(a.reembolso), a.centavos) if a.reembolso else Decimal(0)
        comision = leer_monto(f.get(a.comision), a.centavos) if a.comision else Decimal(0)
        usadas.append({
            "dia": fecha.astimezone(tz_negocio).date(),
            "moneda": moneda,
            "bruto": monto,
            "reembolso": reembolso or Decimal(0),
            "comision": comision or Decimal(0),
            "tipo": ((f.get(a.tipo) or "").strip() or "(vacío)") if a.tipo else None,
        })
    if not usadas:
        raise ErrorUso(f"Ninguna fila sirvió. Descartes: {descartes}")
    dias = [u["dia"] for u in usadas]
    cobertura = {
        "desde": min(dias).isoformat(), "hasta": max(dias).isoformat(), "zona": a.zona,
        "filas_leidas": len(filas), "filas_usadas": len(usadas), "descartes": descartes,
        "nota": "La cobertura es lo que trae el archivo. Fuera de estas fechas no hay dato (no es cero).",
    }
    return usadas, cobertura


def dinero(v: Decimal) -> str:
    return str(v.quantize(Decimal("0.01")))


def totales(filas) -> dict:
    por_moneda = {}
    for u in filas:
        t = por_moneda.setdefault(u["moneda"], {"cobros": 0, "bruto": Decimal(0), "reembolsos": Decimal(0),
                                                "comisiones": Decimal(0), "por_tipo": {}})
        t["cobros"] += 1
        t["bruto"] += u["bruto"]
        t["reembolsos"] += u["reembolso"]
        t["comisiones"] += u["comision"]
        if u["tipo"] is not None:
            t["por_tipo"][u["tipo"]] = t["por_tipo"].get(u["tipo"], 0) + 1
    salida = {}
    for m, t in sorted(por_moneda.items()):
        salida[m] = {"cobros": t["cobros"], "bruto": dinero(t["bruto"]), "reembolsos": dinero(t["reembolsos"]),
                     "comisiones": dinero(t["comisiones"]),
                     "neto": dinero(t["bruto"] - t["reembolsos"] - t["comisiones"])}
        if t["por_tipo"]:
            salida[m]["por_tipo"] = dict(sorted(t["por_tipo"].items()))
    return salida


def fecha_arg(texto: str | None) -> dt.date | None:
    if not texto:
        return None
    try:
        return dt.date.fromisoformat(texto)
    except ValueError:
        raise ErrorUso(f"Fecha «{texto}» inválida: usa AAAA-MM-DD.")


def clave_periodo(dia: dt.date, por: str) -> str:
    if por == "dia":
        return dia.isoformat()
    if por == "semana":
        lunes = dia - dt.timedelta(days=dia.weekday())
        return f"semana del {lunes.isoformat()}"
    return dia.strftime("%Y-%m")


def cmd_resumen(a) -> dict:
    usadas, cob = cargar(a)
    desde, hasta = fecha_arg(a.desde), fecha_arg(a.hasta)
    c0, c1 = dt.date.fromisoformat(cob["desde"]), dt.date.fromisoformat(cob["hasta"])
    avisos = []
    if desde and desde < c0:
        avisos.append(f"--desde {desde} es anterior a los datos ({c0}): antes de {c0} no hay dato.")
    if hasta and hasta > c1:
        avisos.append(f"--hasta {hasta} es posterior a los datos ({c1}): después de {c1} no hay dato.")
    sel = [u for u in usadas if (not desde or u["dia"] >= desde) and (not hasta or u["dia"] <= hasta)]
    periodos = {}
    for u in sel:
        periodos.setdefault(clave_periodo(u["dia"], a.por), []).append(u)
    if a.por in ("semana", "mes") and sel:
        avisos.append("El primer y el último período pueden estar incompletos: revisa la cobertura antes de compararlos.")
    return {
        "cobertura": cob,
        "ventana": {"desde": (desde or c0).isoformat(), "hasta": (hasta or c1).isoformat()},
        "total": totales(sel),
        "por_periodo": {k: totales(v) for k, v in sorted(periodos.items())},
        "avisos": avisos,
    }


def ventana(usadas, inicio: dt.date, fin: dt.date) -> dict:
    sel = [u for u in usadas if inicio <= u["dia"] <= fin]
    return {"desde": inicio.isoformat(), "hasta": fin.isoformat(), "dias": (fin - inicio).days + 1,
            "total": totales(sel) if sel else {}}


def cmd_comparar(a) -> dict:
    usadas, cob = cargar(a)
    c0, c1 = dt.date.fromisoformat(cob["desde"]), dt.date.fromisoformat(cob["hasta"])
    hasta = fecha_arg(a.hasta) or c1
    if a.mes_a_la_fecha:
        ini = hasta.replace(day=1)
        fin_prev_mes = ini - dt.timedelta(days=1)
        ini_prev = fin_prev_mes.replace(day=1)
        dia_prev = min(hasta.day, fin_prev_mes.day)
        actual = (ini, hasta)
        anterior = (ini_prev, ini_prev.replace(day=dia_prev))
        regla = f"mes a la fecha: del 1 al {hasta.day} contra los mismos días del mes anterior"
    else:
        if not a.dias or a.dias < 1:
            raise ErrorUso("Pasa --dias N (N ≥ 1) o --mes-a-la-fecha.")
        actual = (hasta - dt.timedelta(days=a.dias - 1), hasta)
        anterior = (actual[0] - dt.timedelta(days=a.dias), actual[0] - dt.timedelta(days=1))
        regla = f"{a.dias} días contra los {a.dias} anteriores"
    razones = []
    if anterior[0] < c0:
        razones.append(f"La ventana anterior empieza el {anterior[0]} y los datos empiezan el {c0}.")
    if actual[1] > c1:
        razones.append(f"La ventana actual termina el {actual[1]} y los datos terminan el {c1}.")
    va, vb = ventana(usadas, *actual), ventana(usadas, *anterior)
    salida = {"cobertura": cob, "regla": regla, "actual": va, "anterior": vb, "comparable": not razones,
              "razones": razones}
    if not razones:
        cambios = {}
        for m in sorted(set(va["total"]) | set(vb["total"])):
            x = Decimal(va["total"].get(m, {}).get("neto", "0"))
            y = Decimal(vb["total"].get(m, {}).get("neto", "0"))
            cambio = {"neto_actual": dinero(x), "neto_anterior": dinero(y), "diferencia": dinero(x - y)}
            cambio["cambio_pct"] = None if y == 0 else str(((x - y) / y * 100).quantize(Decimal("0.1")))
            cobros = va["total"].get(m, {}).get("cobros", 0) + vb["total"].get(m, {}).get("cobros", 0)
            if cobros < 10:
                cambio["aviso"] = "Menos de 10 cobros entre las dos ventanas: reporta conteos, no tendencias."
            cambios[m] = cambio
        salida["cambio_por_moneda"] = cambios
    return salida


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Números del negocio desde un CSV de cobros.")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("columnas")
    c.add_argument("csv")
    for nombre in ("resumen", "comparar"):
        s = sub.add_parser(nombre)
        s.add_argument("csv")
        s.add_argument("--fecha", required=True)
        s.add_argument("--monto", required=True)
        s.add_argument("--moneda")
        s.add_argument("--moneda-fija")
        s.add_argument("--estado")
        s.add_argument("--estado-ok")
        s.add_argument("--reembolso")
        s.add_argument("--comision")
        s.add_argument("--tipo")
        s.add_argument("--centavos", action="store_true")
        s.add_argument("--fecha-zona", default="UTC")
        s.add_argument("--zona", default="UTC")
        s.add_argument("--hasta")
        if nombre == "resumen":
            s.add_argument("--desde")
            s.add_argument("--por", choices=["dia", "semana", "mes"], default="mes")
        else:
            s.add_argument("--dias", type=int)
            s.add_argument("--mes-a-la-fecha", action="store_true")
    return p


def main(argv=None) -> int:
    a = parser().parse_args(argv)
    try:
        salida = {"columnas": cmd_columnas, "resumen": cmd_resumen, "comparar": cmd_comparar}[a.cmd](a)
    except ErrorUso as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(salida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
