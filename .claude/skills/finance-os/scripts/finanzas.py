#!/usr/bin/env python3
"""Finanzas del dueño en archivos locales, capturadas por conversación (skill `finance-os`).

    F=".claude/skills/finance-os/scripts/finanzas.py"
    python3 $F iniciar --moneda-base MXN [--umbral 5000]
    python3 $F cuenta agregar "Banco principal" --tipo banco --moneda MXN [--no-liquida] [--nota "..."]
    python3 $F cuenta cerrar "Banco principal"          # activa=no; nunca se borra
    python3 $F cuentas
    python3 $F mov --fecha 2026-03-05 --tipo gasto --cuenta "Banco principal" --moneda MXN --monto 8500 \
                   --categoria equipo --nota "Monitor"  [--probar]
    python3 $F mov --tipo transferencia --cuenta "Pasarela" --moneda USD --monto 1000 \
                   --contracuenta "Banco principal" --contramoneda MXN --contramonto 17250 --fecha 2026-03-06
    python3 $F lote movimientos-nuevos.csv [--probar] [--permitir-duplicados]
    python3 $F foto --fecha 2026-03-31 --saldo "Banco principal=152000" --saldo "Tarjeta=-8400" [--tc USD=17.2]
    python3 $F fijo agregar "Internet" --dia 5 --moneda MXN --monto 600 --cuenta "Tarjeta" --categoria servicios
    python3 $F fijo baja "Internet"
    python3 $F bascula [--desde 2026-02-28 --hasta 2026-03-31]
    python3 $F resumen

Dónde: `.claude/memory/project/finanzas/` (o `--carpeta <ruta>`): `config.json`, `cuentas.csv`, `movimientos.csv`,
`fotos.csv`, `cambios.csv`, `fijos.csv`. Son texto plano: el dueño los puede abrir en una hoja de cálculo.

La báscula: entre dos fotos de saldos, por cada moneda,
    gasto derivado = ingresos + transferencias netas que entraron a esa moneda − cambio de patrimonio.
Préstamos, pagos de deuda y transferencias no son gasto ni ingreso: mueven dinero entre cuentas propias (por cobrar y
tarjetas incluidas). Lo que el derivado no explica con lo registrado y los cobros fijos es la «hormiga». Si sale
negativa, algo falta: un ingreso sin registrar, una cuenta fuera de la foto o un gasto duplicado.

Reglas: nunca borra ni edita una fila (las correcciones son filas nuevas con --corrige; `anula` la deja sin efecto),
nunca inventa un saldo ni un tipo de cambio, escribe de forma atómica y `--probar` no escribe. Código 2: error de uso o
dato inválido (el mensaje dice cuál y qué valores valen). Solo biblioteca estándar de Python 3.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import datetime as dt
import io
import json
import os
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]  # .claude/
CARPETA = RAIZ / "memory" / "project" / "finanzas"

TIPOS_CUENTA = ["banco", "efectivo", "credito", "inversion", "por_cobrar", "deuda", "pasarela", "cripto"]
TIPOS_MOV = ["gasto", "ingreso", "transferencia", "prestamo", "pago_deuda", "anula"]
CON_CONTRACUENTA = {"transferencia", "prestamo", "pago_deuda"}
CATEGORIAS_GASTO = ["vivienda", "servicios", "despensa", "comida-fuera", "transporte", "salud", "educacion",
                    "suscripciones", "equipo", "negocio", "comisiones", "impuestos", "viajes", "personal",
                    "familia", "compras", "otros"]
CATEGORIAS_INGRESO = ["ventas", "servicios-cobrados", "salario", "intereses", "otros"]

COLUMNAS = {
    "cuentas.csv": ["nombre", "tipo", "moneda", "liquida", "activa", "nota"],
    "movimientos.csv": ["id", "fecha", "tipo", "cuenta", "contracuenta", "moneda", "monto", "contramoneda",
                        "contramonto", "categoria", "nota", "corrige", "fuente"],
    "fotos.csv": ["fecha", "cuenta", "moneda", "saldo", "nota"],
    "cambios.csv": ["fecha", "moneda", "tc"],
    "fijos.csv": ["nombre", "dia", "moneda", "monto", "cuenta", "categoria", "activo"],
}


class ErrorUso(Exception):
    pass


# ---------- archivos ----------

def escribir_atomico(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp-", suffix=ruta.suffix)
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(texto)
    os.replace(tmp, ruta)


def leer_csv(carpeta: Path, nombre: str) -> list[dict]:
    ruta = carpeta / nombre
    if not ruta.exists():
        raise ErrorUso(f"No existe {ruta}. Corre `iniciar` primero.")
    with ruta.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def guardar_csv(carpeta: Path, nombre: str, filas: list[dict]) -> None:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNAS[nombre], extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for fila in filas:
        w.writerow({k: fila.get(k, "") for k in COLUMNAS[nombre]})
    escribir_atomico(carpeta / nombre, buf.getvalue())


def leer_config(carpeta: Path) -> dict:
    ruta = carpeta / "config.json"
    if not ruta.exists():
        raise ErrorUso(f"No existe {ruta}. Corre `iniciar --moneda-base XXX` primero.")
    return json.loads(ruta.read_text(encoding="utf-8"))


# ---------- valores ----------

def num(texto, campo: str) -> Decimal:
    try:
        return Decimal(str(texto).replace(",", "").replace("$", "").strip())
    except (InvalidOperation, AttributeError):
        raise ErrorUso(f"«{texto}» no es un número válido para {campo}.")


def fecha(texto: str, campo: str = "fecha") -> dt.date:
    try:
        return dt.date.fromisoformat(str(texto).strip())
    except ValueError:
        raise ErrorUso(f"«{texto}» no es una fecha válida para {campo}: usa AAAA-MM-DD.")


def dinero(v: Decimal) -> str:
    return str(v.quantize(Decimal("0.01")))


def mapa_cuentas(carpeta: Path) -> dict:
    return {c["nombre"]: c for c in leer_csv(carpeta, "cuentas.csv")}


# ---------- iniciar y cuentas ----------

def cmd_iniciar(a, carpeta: Path) -> dict:
    if (carpeta / "config.json").exists():
        raise ErrorUso(f"Ya hay finanzas en {carpeta}. No se pisan.")
    config = {"moneda_base": a.moneda_base.upper(), "umbral": str(num(a.umbral, "umbral")),
              "categorias_gasto": CATEGORIAS_GASTO, "categorias_ingreso": CATEGORIAS_INGRESO}
    escribir_atomico(carpeta / "config.json", json.dumps(config, ensure_ascii=False, indent=2) + "\n")
    for nombre in COLUMNAS:
        guardar_csv(carpeta, nombre, [])
    return {"ok": True, "carpeta": str(carpeta), "config": config}


def cmd_cuenta(a, carpeta: Path) -> dict:
    cuentas = leer_csv(carpeta, "cuentas.csv")
    nombres = {c["nombre"] for c in cuentas}
    if a.accion == "agregar":
        if a.nombre in nombres:
            raise ErrorUso(f"Ya existe la cuenta «{a.nombre}».")
        if a.tipo not in TIPOS_CUENTA:
            raise ErrorUso(f"Tipo «{a.tipo}» desconocido. Valen: {', '.join(TIPOS_CUENTA)}.")
        if not a.moneda:
            raise ErrorUso("Falta --moneda.")
        liquida = "no" if a.no_liquida or a.tipo in ("por_cobrar", "deuda") else "si"
        fila = {"nombre": a.nombre, "tipo": a.tipo, "moneda": a.moneda.upper(), "liquida": liquida, "activa": "si",
                "nota": a.nota or ""}
        guardar_csv(carpeta, "cuentas.csv", cuentas + [fila])
        return {"ok": True, "cuenta": fila}
    if a.nombre not in nombres:
        raise ErrorUso(f"No existe la cuenta «{a.nombre}». Hay: {', '.join(sorted(nombres)) or '(ninguna)'}.")
    for c in cuentas:
        if c["nombre"] == a.nombre:
            c["activa"] = "no"
    guardar_csv(carpeta, "cuentas.csv", cuentas)
    return {"ok": True, "cerrada": a.nombre, "nota": "Sigue en el archivo para que las fotos viejas cuadren."}


def cmd_cuentas(a, carpeta: Path) -> dict:
    return {"cuentas": leer_csv(carpeta, "cuentas.csv")}


# ---------- movimientos ----------

def validar_mov(m: dict, cuentas: dict, config: dict, existentes: dict) -> dict:
    tipo = (m.get("tipo") or "").strip()
    if tipo not in TIPOS_MOV:
        raise ErrorUso(f"Tipo «{tipo}» desconocido. Valen: {', '.join(TIPOS_MOV)}.")
    f = fecha(m.get("fecha") or dt.date.today().isoformat())
    limpio = {k: (m.get(k) or "").strip() for k in COLUMNAS["movimientos.csv"]}
    limpio["fecha"], limpio["tipo"] = f.isoformat(), tipo
    if tipo == "anula":
        if limpio["corrige"] not in existentes:
            raise ErrorUso("`anula` necesita --corrige con el id de un movimiento que exista.")
        return limpio
    if limpio["corrige"] and limpio["corrige"] not in existentes:
        raise ErrorUso(f"--corrige {limpio['corrige']}: no existe ese movimiento.")
    activas = {n for n, c in cuentas.items() if c["activa"] == "si"}
    cuenta = limpio["cuenta"]
    if cuenta not in cuentas:
        raise ErrorUso(f"No existe la cuenta «{cuenta}». Activas: {', '.join(sorted(activas)) or '(ninguna)'}.")
    if cuenta not in activas:
        raise ErrorUso(f"La cuenta «{cuenta}» está cerrada.")
    moneda = (limpio["moneda"] or cuentas[cuenta]["moneda"]).upper()
    if moneda != cuentas[cuenta]["moneda"]:
        raise ErrorUso(f"«{cuenta}» es en {cuentas[cuenta]['moneda']}, no en {moneda}.")
    limpio["moneda"] = moneda
    monto = num(limpio["monto"], "monto")
    if monto <= 0:
        raise ErrorUso("El monto va en positivo; el tipo dice hacia dónde va. Una devolución es una corrección.")
    limpio["monto"] = str(monto)
    if tipo in ("gasto", "ingreso"):
        validas = config["categorias_gasto"] if tipo == "gasto" else config["categorias_ingreso"]
        if limpio["categoria"] not in validas:
            raise ErrorUso(f"Categoría «{limpio['categoria']}» no vale para {tipo}. Valen: {', '.join(validas)}.")
        limpio["contracuenta"] = limpio["contramoneda"] = limpio["contramonto"] = ""
    if tipo in CON_CONTRACUENTA:
        cc = limpio["contracuenta"]
        if cc not in activas:
            raise ErrorUso(f"{tipo} necesita --contracuenta activa. Activas: {', '.join(sorted(activas))}.")
        if cc == cuenta:
            raise ErrorUso("La cuenta y la contracuenta son la misma.")
        cm = (limpio["contramoneda"] or cuentas[cc]["moneda"]).upper()
        if cm != cuentas[cc]["moneda"]:
            raise ErrorUso(f"«{cc}» es en {cuentas[cc]['moneda']}, no en {cm}.")
        limpio["contramoneda"] = cm
        if cm == moneda and not limpio["contramonto"]:
            limpio["contramonto"] = limpio["monto"]
        if not limpio["contramonto"]:
            raise ErrorUso(f"Entre monedas distintas ({moneda} → {cm}) falta --contramonto: lo que llegó de verdad. "
                           "El tipo de cambio se lee de ahí, no se estima.")
        limpio["contramonto"] = str(num(limpio["contramonto"], "contramonto"))
    return limpio


def clave_dup(m: dict) -> tuple:
    return (m["fecha"], m["tipo"], m["cuenta"], m["moneda"], dinero(Decimal(m["monto"] or 0)), m["nota"])


def agregar_movs(carpeta: Path, nuevos: list[dict], probar: bool, permitir_dup: bool) -> dict:
    config, cuentas = leer_config(carpeta), mapa_cuentas(carpeta)
    movs = leer_csv(carpeta, "movimientos.csv")
    existentes = {m["id"]: m for m in movs}
    claves = {clave_dup(m) for m in movs if m["tipo"] != "anula"}
    siguiente = max([int(m["id"][1:]) for m in movs if m["id"][1:].isdigit()] or [0]) + 1
    listos, errores, duplicados = [], [], []
    for i, m in enumerate(nuevos, 1):
        try:
            v = validar_mov(m, cuentas, config, existentes)
        except ErrorUso as e:
            errores.append(f"fila {i}: {e}")
            continue
        if v["tipo"] != "anula" and clave_dup(v) in claves and not permitir_dup:
            duplicados.append(f"fila {i}: {v['fecha']} {v['cuenta']} {v['monto']} «{v['nota']}» ya está registrado")
            continue
        v["id"] = f"m{siguiente:05d}"
        siguiente += 1
        claves.add(clave_dup(v))
        existentes[v["id"]] = v
        listos.append(v)
    if errores or duplicados:
        raise ErrorUso("No escribí nada. " + " | ".join(errores + duplicados)
                       + (" (si de verdad se repite, --permitir-duplicados)" if duplicados else ""))
    if not probar:
        guardar_csv(carpeta, "movimientos.csv", movs + listos)
    umbral = Decimal(config.get("umbral") or 0)
    chicos = [m["id"] for m in listos if m["tipo"] == "gasto" and m.get("fuente") != "estado-de-cuenta"
              and Decimal(m["monto"]) < umbral]
    salida = {"ok": True, "probar": probar, "agregados": listos}
    if chicos:
        salida["aviso"] = (f"{len(chicos)} gasto(s) bajo el umbral ({config['umbral']}): la báscula ya los captura. "
                           "Regístralos solo si el dueño insiste.")
    return salida


def cmd_mov(a, carpeta: Path) -> dict:
    m = {k: getattr(a, k, None) for k in COLUMNAS["movimientos.csv"] if k != "id"}
    return agregar_movs(carpeta, [m], a.probar, a.permitir_duplicados)


def cmd_lote(a, carpeta: Path) -> dict:
    ruta = Path(a.archivo)
    if not ruta.is_file():
        raise ErrorUso(f"No encuentro {ruta}.")
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        filas = list(csv.DictReader(f))
    if not filas:
        raise ErrorUso("El lote no tiene filas.")
    return agregar_movs(carpeta, filas, a.probar, a.permitir_duplicados)


def movimientos_vigentes(carpeta: Path) -> list[dict]:
    """Sin los movimientos corregidos ni anulados: cuenta la última corrección de cada cadena."""
    movs = leer_csv(carpeta, "movimientos.csv")
    corregidos = {m["corrige"] for m in movs if m["corrige"]}
    return [m for m in movs if m["id"] not in corregidos and m["tipo"] != "anula"]


# ---------- fotos, cambios y fijos ----------

def cmd_foto(a, carpeta: Path) -> dict:
    f = fecha(a.fecha)
    if f > dt.date.today():
        raise ErrorUso(f"La foto del {f} es del futuro: una foto es el saldo real de un día que ya pasó.")
    cuentas = mapa_cuentas(carpeta)
    activas = {n for n, c in cuentas.items() if c["activa"] == "si"}
    saldos = {}
    for par in a.saldo or []:
        if "=" not in par:
            raise ErrorUso(f"«{par}»: usa \"Cuenta=saldo\".")
        nombre, valor = par.rsplit("=", 1)
        nombre = nombre.strip()
        if nombre not in activas:
            raise ErrorUso(f"«{nombre}» no es una cuenta activa. Activas: {', '.join(sorted(activas))}.")
        saldos[nombre] = num(valor, f"saldo de {nombre}")
    faltan = sorted(activas - set(saldos))
    if faltan and not a.parcial:
        raise ErrorUso(f"Faltan saldos de: {', '.join(faltan)}. La báscula necesita todas las cuentas activas "
                       "(tarjetas en negativo). Si de verdad no hay dato, --parcial y lo anoto.")
    fotos = leer_csv(carpeta, "fotos.csv")
    if any(x["fecha"] == f.isoformat() for x in fotos):
        raise ErrorUso(f"Ya hay una foto del {f}. Una foto no se edita: usa otra fecha o pide corregirla a mano.")
    nota = a.nota or ""
    if faltan:
        nota = (nota + " " if nota else "") + f"[parcial: sin {', '.join(faltan)}]"
    nuevas = [{"fecha": f.isoformat(), "cuenta": n, "moneda": cuentas[n]["moneda"], "saldo": str(v), "nota": nota}
              for n, v in sorted(saldos.items())]
    cambios = leer_csv(carpeta, "cambios.csv")
    nuevos_tc = []
    for par in a.tc or []:
        if "=" not in par:
            raise ErrorUso(f"«{par}»: usa MONEDA=tipo (p. ej. USD=17.2).")
        mon, valor = par.split("=", 1)
        nuevos_tc.append({"fecha": f.isoformat(), "moneda": mon.strip().upper(), "tc": str(num(valor, "tc"))})
    guardar_csv(carpeta, "fotos.csv", fotos + nuevas)
    if nuevos_tc:
        guardar_csv(carpeta, "cambios.csv", cambios + nuevos_tc)
    return {"ok": True, "fecha": f.isoformat(), "saldos": nuevas, "tipos_de_cambio": nuevos_tc, "faltan": faltan}


def cmd_fijo(a, carpeta: Path) -> dict:
    fijos = leer_csv(carpeta, "fijos.csv")
    if a.accion == "agregar":
        cuentas, config = mapa_cuentas(carpeta), leer_config(carpeta)
        if a.cuenta not in cuentas:
            raise ErrorUso(f"No existe la cuenta «{a.cuenta}».")
        if a.categoria not in config["categorias_gasto"]:
            raise ErrorUso(f"Categoría «{a.categoria}» no vale. Valen: {', '.join(config['categorias_gasto'])}.")
        if not 1 <= a.dia <= 31:
            raise ErrorUso("--dia va de 1 a 31.")
        fila = {"nombre": a.nombre, "dia": str(a.dia), "moneda": cuentas[a.cuenta]["moneda"],
                "monto": str(num(a.monto, "monto")), "cuenta": a.cuenta, "categoria": a.categoria, "activo": "si"}
        guardar_csv(carpeta, "fijos.csv", fijos + [fila])
        return {"ok": True, "fijo": fila}
    hay = False
    for x in fijos:
        if x["nombre"] == a.nombre and x["activo"] == "si":
            x["activo"], hay = "no", True
    if not hay:
        raise ErrorUso(f"No hay un fijo activo llamado «{a.nombre}».")
    guardar_csv(carpeta, "fijos.csv", fijos)
    return {"ok": True, "baja": a.nombre}


def fijos_en(fijos: list[dict], ini: dt.date, fin: dt.date) -> list[tuple[dict, dt.date]]:
    """Cobros fijos cuyo día cae en (ini, fin]. Día 31 en un mes de 30 cae el último día."""
    caen = []
    y, m = ini.year, ini.month
    while (y, m) <= (fin.year, fin.month):
        for x in fijos:
            if x["activo"] != "si":
                continue
            d = dt.date(y, m, min(int(x["dia"]), calendar.monthrange(y, m)[1]))
            if ini < d <= fin:
                caen.append((x, d))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return caen


# ---------- báscula y resumen ----------

def fechas_de_fotos(carpeta: Path) -> list[dt.date]:
    return sorted({fecha(x["fecha"]) for x in leer_csv(carpeta, "fotos.csv")})


def foto_en(carpeta: Path, f: dt.date) -> dict:
    filas = [x for x in leer_csv(carpeta, "fotos.csv") if x["fecha"] == f.isoformat()]
    if not filas:
        raise ErrorUso(f"No hay foto del {f}. Fotos: {', '.join(d.isoformat() for d in fechas_de_fotos(carpeta))}.")
    return {"cuentas": {x["cuenta"]: (x["moneda"], Decimal(x["saldo"])) for x in filas},
            "parcial": any("[parcial" in x["nota"] for x in filas)}


def tc_en(carpeta: Path, moneda: str, f: dt.date, base: str) -> Decimal | None:
    if moneda == base:
        return Decimal(1)
    validos = [x for x in leer_csv(carpeta, "cambios.csv") if x["moneda"] == moneda and fecha(x["fecha"]) <= f]
    return Decimal(max(validos, key=lambda x: x["fecha"])["tc"]) if validos else None


def bascula(carpeta: Path, ini: dt.date, fin: dt.date) -> dict:
    config = leer_config(carpeta)
    base = config["moneda_base"]
    f0, f1 = foto_en(carpeta, ini), foto_en(carpeta, fin)
    avisos = []
    solo0 = sorted(set(f0["cuentas"]) - set(f1["cuentas"]))
    solo1 = sorted(set(f1["cuentas"]) - set(f0["cuentas"]))
    if solo0 or solo1:
        avisos.append(f"Las dos fotos no tienen las mismas cuentas (solo en la primera: {solo0 or '-'}; solo en la "
                      f"segunda: {solo1 or '-'}). Una cuenta que falta cuenta como saldo 0: confirma con el dueño.")
    if f0["parcial"] or f1["parcial"]:
        avisos.append("Alguna foto es parcial: el gasto derivado de esa moneda no es confiable.")
    monedas = {m for m, _ in f0["cuentas"].values()} | {m for m, _ in f1["cuentas"].values()}
    movs = [m for m in movimientos_vigentes(carpeta) if ini < fecha(m["fecha"]) <= fin]
    monedas |= {m["moneda"] for m in movs} | {m["contramoneda"] for m in movs if m["contramoneda"]}
    con_estado = {m["cuenta"] for m in movs if m["tipo"] == "gasto" and m["fuente"] == "estado-de-cuenta"}
    fijos = fijos_en(leer_csv(carpeta, "fijos.csv"), ini, fin)
    por_moneda = {}
    for mon in sorted(monedas):
        pat0 = sum((s for m, s in f0["cuentas"].values() if m == mon), Decimal(0))
        pat1 = sum((s for m, s in f1["cuentas"].values() if m == mon), Decimal(0))
        ingresos = sum((Decimal(m["monto"]) for m in movs if m["tipo"] == "ingreso" and m["moneda"] == mon), Decimal(0))
        registrados = [m for m in movs if m["tipo"] == "gasto" and m["moneda"] == mon]
        gasto_reg = sum((Decimal(m["monto"]) for m in registrados), Decimal(0))
        entra = sum((Decimal(m["contramonto"]) for m in movs if m["tipo"] in CON_CONTRACUENTA
                     and m["contramoneda"] == mon), Decimal(0))
        sale = sum((Decimal(m["monto"]) for m in movs if m["tipo"] in CON_CONTRACUENTA and m["moneda"] == mon),
                   Decimal(0))
        neto_trans = entra - sale
        delta = pat1 - pat0
        derivado = ingresos + neto_trans - delta
        fijos_mon = [(x, d) for x, d in fijos if x["moneda"] == mon and x["cuenta"] not in con_estado]
        fijos_total = sum((Decimal(x["monto"]) for x, _ in fijos_mon), Decimal(0))
        hormiga = derivado - gasto_reg - fijos_total
        fila = {
            "patrimonio_inicio": dinero(pat0), "patrimonio_fin": dinero(pat1), "cambio_patrimonio": dinero(delta),
            "ingresos_registrados": dinero(ingresos), "transferencias_netas": dinero(neto_trans),
            "gasto_derivado": dinero(derivado),
            "desglose": {"registrado": dinero(gasto_reg), "fijos_esperados": dinero(fijos_total),
                         "hormiga": dinero(hormiga)},
            "fijos": [{"nombre": x["nombre"], "dia": d.isoformat(), "monto": x["monto"]} for x, d in fijos_mon],
            "mayores_registrados": [{"id": m["id"], "fecha": m["fecha"], "monto": m["monto"], "categoria": m["categoria"],
                         "nota": m["nota"]} for m in sorted(registrados, key=lambda m: -Decimal(m["monto"]))[:10]],
        }
        if derivado < 0:
            fila["aviso"] = ("Gasto derivado negativo: el patrimonio subió más de lo que explican los ingresos. "
                             "Falta registrar un ingreso o una foto tiene un saldo de más.")
        elif hormiga < 0:
            fila["aviso"] = ("Hormiga negativa: lo registrado supera a lo que salió. Falta un ingreso, falta una "
                             "cuenta en la foto, un fijo ya no corre o hay un gasto duplicado.")
        por_moneda[mon] = fila
    dias = (fin - ini).days
    consolidado = None
    tcs = {mon: tc_en(carpeta, mon, fin, base) for mon in por_moneda}
    sin_tc = sorted(m for m, t in tcs.items() if t is None)
    if sin_tc:
        avisos.append(f"Sin tipo de cambio para {', '.join(sin_tc)} al {fin}: no consolido en {base} "
                      "(se dicta en la foto con --tc).")
    else:
        consolidado = {"moneda": base, "nota": f"Conversión contable con el tipo de cambio al {fin}.",
                       "gasto_derivado": dinero(sum(Decimal(f["gasto_derivado"]) * tcs[m] for m, f in por_moneda.items())),
                       "ingresos": dinero(sum(Decimal(f["ingresos_registrados"]) * tcs[m] for m, f in por_moneda.items())),
                       "patrimonio_fin": dinero(sum(Decimal(f["patrimonio_fin"]) * tcs[m] for m, f in por_moneda.items()))}
    return {"desde": ini.isoformat(), "hasta": fin.isoformat(), "dias": dias, "por_moneda": por_moneda,
            "consolidado": consolidado, "avisos": avisos,
            "condicion": "El gasto derivado es exacto solo si los ingresos están completos: un ingreso sin registrar "
                         "infla el gasto en ese mismo monto."}


def cmd_bascula(a, carpeta: Path) -> dict:
    fotos = fechas_de_fotos(carpeta)
    if a.desde and a.hasta:
        ini, fin = fecha(a.desde), fecha(a.hasta)
    elif len(fotos) >= 2:
        ini, fin = fotos[-2], fotos[-1]
    else:
        raise ErrorUso("La báscula necesita dos fotos de saldos. Hay " + str(len(fotos)) + ".")
    if ini >= fin:
        raise ErrorUso("--desde tiene que ser anterior a --hasta.")
    return bascula(carpeta, ini, fin)


def cmd_resumen(a, carpeta: Path) -> dict:
    config = leer_config(carpeta)
    base = config["moneda_base"]
    fotos = fechas_de_fotos(carpeta)
    if not fotos:
        return {"tienes": None, "nota": "Sin fotos de saldos todavía: no sé cuánto tiene. Pide la primera foto."}
    ultima = fotos[-1]
    cuentas = mapa_cuentas(carpeta)
    foto = foto_en(carpeta, ultima)
    tienes = {}
    for nombre, (mon, saldo) in foto["cuentas"].items():
        t = tienes.setdefault(mon, {"liquido": Decimal(0), "no_liquido": Decimal(0)})
        t["liquido" if cuentas.get(nombre, {}).get("liquida", "si") == "si" else "no_liquido"] += saldo
    edad = (dt.date.today() - ultima).days
    salida = {"tienes": {"fecha_foto": ultima.isoformat(), "dias_de_antiguedad": edad,
                         "por_moneda": {m: {k: dinero(v) for k, v in t.items()} for m, t in sorted(tienes.items())}}}
    if edad > 35:
        salida["tienes"]["aviso"] = f"La última foto tiene {edad} días: lo que tiene hoy puede ser distinto."
    tramos = [bascula(carpeta, fotos[i], fotos[i + 1]) for i in range(max(0, len(fotos) - 4), len(fotos) - 1)]
    if tramos:
        salida["ultimo_tramo"] = tramos[-1]
        consolidables = [t for t in tramos if t["consolidado"]]
        tc = {m: tc_en(carpeta, m, ultima, base) for m in tienes}
        if consolidables and all(v is not None for v in tc.values()):
            mensual = [Decimal(t["consolidado"]["gasto_derivado"]) * Decimal("30.44") / t["dias"]
                       for t in consolidables if t["dias"] > 0]
            prom = sum(mensual, Decimal(0)) / len(mensual)
            liquido = sum((tienes[m]["liquido"] * tc[m] for m in tienes), Decimal(0))
            salida["runway"] = {
                "liquido": dinero(liquido), "gasto_mensual_promedio": dinero(prom), "moneda": base,
                "meses": None if prom <= 0 else str((liquido / prom).quantize(Decimal("0.1"))),
                "tramos_usados": len(mensual),
                "confianza": "baja (un solo tramo)" if len(mensual) < 2 else "media (promedio de tramos medidos)",
                "nota": "Runway = líquido ÷ gasto mensual derivado de la báscula. Es la única cifra que proyecta.",
            }
    else:
        salida["nota"] = "Con una sola foto se sabe lo que tiene, no lo que gasta: la báscula necesita la segunda."
    return salida


# ---------- CLI ----------

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Finanzas del dueño en archivos locales.")
    p.add_argument("--carpeta", default=str(CARPETA))
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("iniciar")
    s.add_argument("--moneda-base", required=True)
    s.add_argument("--umbral", default="5000")
    s = sub.add_parser("cuenta")
    s.add_argument("accion", choices=["agregar", "cerrar"])
    s.add_argument("nombre")
    s.add_argument("--tipo", default="banco")
    s.add_argument("--moneda")
    s.add_argument("--no-liquida", action="store_true")
    s.add_argument("--nota")
    sub.add_parser("cuentas")
    s = sub.add_parser("mov")
    for campo in ("fecha", "tipo", "cuenta", "contracuenta", "moneda", "monto", "contramoneda", "contramonto",
                  "categoria", "nota", "corrige", "fuente"):
        s.add_argument("--" + campo, required=campo in ("tipo",))
    s.add_argument("--probar", action="store_true")
    s.add_argument("--permitir-duplicados", action="store_true")
    s = sub.add_parser("lote")
    s.add_argument("archivo")
    s.add_argument("--probar", action="store_true")
    s.add_argument("--permitir-duplicados", action="store_true")
    s = sub.add_parser("foto")
    s.add_argument("--fecha", required=True)
    s.add_argument("--saldo", action="append")
    s.add_argument("--tc", action="append")
    s.add_argument("--parcial", action="store_true")
    s.add_argument("--nota")
    s = sub.add_parser("fijo")
    s.add_argument("accion", choices=["agregar", "baja"])
    s.add_argument("nombre")
    s.add_argument("--dia", type=int, default=1)
    s.add_argument("--moneda")
    s.add_argument("--monto", default="0")
    s.add_argument("--cuenta")
    s.add_argument("--categoria", default="suscripciones")
    s = sub.add_parser("bascula")
    s.add_argument("--desde")
    s.add_argument("--hasta")
    sub.add_parser("resumen")
    return p


COMANDOS = {"iniciar": cmd_iniciar, "cuenta": cmd_cuenta, "cuentas": cmd_cuentas, "mov": cmd_mov, "lote": cmd_lote,
            "foto": cmd_foto, "fijo": cmd_fijo, "bascula": cmd_bascula, "resumen": cmd_resumen}


def main(argv=None) -> int:
    a = parser().parse_args(argv)
    try:
        salida = COMANDOS[a.cmd](a, Path(a.carpeta))
    except ErrorUso as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(salida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
