#!/usr/bin/env python3
"""
os_audit.py — Auditoria READ-ONLY de Arbrain (tu cerebro artificial).

Verifica que lo que el sistema DICE de si mismo coincida con lo que hay en disco.
NUNCA arregla, mueve, renombra ni borra. Solo reporta.

Origen: Nate Herk, "Steal My Exact AI OS Setup" (Ek1NBfnnTH0, jul 2026), tip #2
("have AI audit itself"), traducido a nuestro vocabulario y con un check que el
no tiene: ORGANOS (el patron organo-zombie: un cron vivo en apariencia que no produce).

Uso:
    python3 .claude/skills/os-audit/scripts/os_audit.py              # markdown a stdout
    python3 .claude/skills/os-audit/scripts/os_audit.py --json
    python3 .claude/skills/os-audit/scripts/os_audit.py --write      # guarda en .claude/audits/
    python3 .claude/skills/os-audit/scripts/os_audit.py --check freshness

Semaforo: VERDE = sin hallazgos · AMBAR = degradado, no miente · ROJO = el sistema
miente sobre si mismo (un consumidor tomaria una decision con dato falso).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CLAUDE = ROOT / ".claude"

VERDE, AMBAR, ROJO = "VERDE", "AMBAR", "ROJO"
_ORDER = {VERDE: 0, AMBAR: 1, ROJO: 2}


def worst(*estados: str) -> str:
    return max(estados, key=lambda e: _ORDER[e]) if estados else VERDE


def age_hours(p: Path) -> float | None:
    if not p.exists():
        return None
    return (time.time() - p.stat().st_mtime) / 3600


def sh(*args: str, cwd: Path = ROOT) -> str:
    try:
        return subprocess.run(
            args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60
        ).stdout.strip()
    except Exception:
        return ""


def du_mb(p: Path) -> float:
    total = 0
    for dirpath, _, files in os.walk(p):
        for f in files:
            fp = Path(dirpath) / f
            try:
                total += fp.stat().st_size
            except OSError:
                pass
    return total / 1_048_576


# ---------------------------------------------------------------- check 1
# ROUTING INTEGRITY — los punteros de los documentos-router existen en disco.

ROUTERS = [
    ROOT / "CLAUDE.md",
    CLAUDE / "memory" / "MEMORY.md",
    CLAUDE / "memory" / "MEMORY-indice.md",
    CLAUDE / "skills" / "artificial-brain" / "references" / "medula.md",
]

# rutas dentro de backticks que parecen paths del repo
PATH_RX = re.compile(r"`([A-Za-z0-9_./-]+\.(?:md|py|ts|tsx|json|sh|html|db|csv|sql))`")
# nombres genericos que aparecen como ejemplo, no como puntero
ROUTING_SKIP = re.compile(
    r"^(package\.json|README\.md|CLAUDE\.md|SKILL\.md|\.env|index\.json|"
    r"settings\.json|tsconfig\.json|AGENTS\.md|MEMORY\.md)$"
)
# ruido: el repo real, no lo que auditamos
PODA = {"node_modules", ".git", ".next", "dist", "build", "worktrees",
        "skills-archive", "venv", ".venv", "__pycache__"}

_indice_cache: dict[str, set[str]] | None = None


def indice_repo() -> dict[str, set[str]]:
    """Todos los paths del repo, indexados por basename, para resolver por sufijo."""
    global _indice_cache
    if _indice_cache is not None:
        return _indice_cache
    idx: dict[str, set[str]] = {}
    for dirpath, dirnames, files in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in PODA]
        rel_dir = Path(dirpath).relative_to(ROOT)
        for f in files:
            idx.setdefault(f, set()).add(str(rel_dir / f))
        for d in dirnames:
            idx.setdefault(d, set()).add(str(rel_dir / d))
    _indice_cache = idx
    return idx


# Si tus apps viven en repos hermanos fuera de este (p. ej. una carpeta `software/` al
# lado del repo), declara esa carpeta en ARBRAIN_HERMANOS para que sus punteros resuelvan.
HERMANOS = Path(os.environ["ARBRAIN_HERMANOS"]).expanduser() if os.environ.get("ARBRAIN_HERMANOS") \
    else ROOT.parent / "software"

# repos que pueden NO estar clonados en esta maquina. Un puntero hacia ellos no es
# un puntero roto: es un puntero EXTERNO, no verificable localmente. Distinguirlos
# importa — si el audit grita lobo, se deja de leer, y entonces no sirve de nada.
# Agrega aqui los nombres de tus repos hermanos cuando los cites desde los routers.
REPOS_EXTERNOS: set[str] = set()


def es_externo(raw: str, linea: str) -> bool:
    """¿La linea que contiene el puntero nombra un repo hermano?"""
    return any(r in linea for r in REPOS_EXTERNOS) and not (ROOT / raw).exists()


def resuelve(raw: str, router: Path) -> bool:
    """¿El puntero apunta a algo real? Resuelve relativo al root, al router, al
    workspace hermano (HERMANOS), o por sufijo dentro del repo."""
    for c in (ROOT / raw, CLAUDE / raw, router.parent / raw,
              CLAUDE / "skills" / raw, HERMANOS / raw):
        if c.exists():
            return True
    # un basename suelto (`mc-event.py`) es una MENCION, no una ruta: basta con que exista
    # en algun lado del repo. Un path con `/` debe resolver por sufijo exacto.
    idx = indice_repo()
    base = Path(raw).name
    candidatos = idx.get(base, set())
    if "/" not in raw:
        return bool(candidatos)
    return any(p == raw or p.endswith("/" + raw) for p in candidatos)


def check_routing() -> dict:
    hallazgos = []
    revisados = 0
    externos = 0
    for router in ROUTERS:
        if not router.exists():
            hallazgos.append(
                {"nivel": ROJO, "router": str(router.relative_to(ROOT)),
                 "detalle": f"el router NO existe: {router.relative_to(ROOT)}"}
            )
            continue
        texto = router.read_text(encoding="utf-8", errors="ignore")
        vistos = set()
        for linea in texto.splitlines():
            for m in PATH_RX.finditer(linea):
                raw = m.group(1)
                if ROUTING_SKIP.match(Path(raw).name) or raw.startswith(("http", "~")):
                    continue
                if raw in vistos:
                    continue
                vistos.add(raw)
                revisados += 1
                if resuelve(raw, router):
                    continue
                if es_externo(raw, linea):
                    externos += 1
                    continue
                hallazgos.append(
                    {"nivel": ROJO, "router": str(router.relative_to(ROOT)),
                     "detalle": f"puntero roto en `{router.relative_to(ROOT)}`: {raw}"}
                )
    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "routing",
        "titulo": "Routing integrity",
        "pregunta": "¿Todo lo que los routers prometen existe en disco?",
        "estado": estado,
        "metrica": f"{revisados} punteros unicos, {len(hallazgos)} rotos, "
                   f"{externos} externos (repo hermano sin clon local)",
        "hallazgos": hallazgos,
    }


# ---------------------------------------------------------------- check 2
# INDEX TRUTH — los indices dicen la verdad sobre lo que hay.

# formato nuevo del indice (cirugia 23 ago 2026): `carpeta/archivo.md` entre backticks.
# Se acepta tambien el viejo `](carpeta/archivo.md)` — durante un tiempo convivieron.
MEM_LINK_RX = re.compile(r"[`(](user|feedback|project|reference)/([^`)]+\.md)[`)]")


def check_index_truth() -> dict:
    hallazgos = []
    mem_dir = CLAUDE / "memory"
    # Índices de entrada + referencias alcanzables: progressive disclosure.
    # No tratar como huérfano lo que se abre desde una referencia canónica.
    index_files = ["MEMORY.md", "MEMORY-user.md", "MEMORY-indice.md", "MEMORY-archivo.md"]
    indexados: set[str] = set()
    pendientes = list(index_files)
    visitados = set()
    while pendientes:
        nombre = pendientes.pop(0)
        if nombre in visitados:
            continue
        visitados.add(nombre)
        index = mem_dir / nombre
        if not index.exists():
            if nombre in index_files and nombre != "MEMORY-archivo.md":
                hallazgos.append({"nivel": ROJO, "detalle": f"{nombre} no existe"})
            continue
        texto = index.read_text(encoding="utf-8", errors="ignore")
        # Enlaces Markdown y referencias locales, incluidos ../reference y
        # nombres dentro de la misma carpeta. Solo archivos reales de memoria;
        # las menciones históricas de ficheros externos no son promesas del índice.
        relative_refs = re.findall(r"`([^`\n]+\.md)`|\]\(([^)\n]+\.md)(?:#[^)]*)?\)", texto)
        for inline, markdown in relative_refs:
            raw = inline or markdown
            if "://" in raw or raw.startswith("/"):
                continue
            target = (index.parent / raw).resolve()
            if target.is_file() and target.is_relative_to(mem_dir.resolve()):
                rel = str(target.relative_to(mem_dir.resolve()))
                if rel not in index_files:
                    indexados.add(rel)
                if rel not in visitados:
                    pendientes.append(rel)
        for carpeta, resto in MEM_LINK_RX.findall(texto):
            rel = f"{carpeta}/{resto}"
            target = mem_dir / rel
            if not target.resolve().is_relative_to(mem_dir.resolve()):
                hallazgos.append({"nivel": ROJO, "detalle": f"{nombre} apunta fuera de memoria: {rel}"})
                continue
            if any(c in rel for c in "*?["):
                # Patrones en prosa no son rutas literales. Expandir los glob
                # válidos; dejar visible como ambiguo lo que no resuelve.
                matches = [p for p in mem_dir.glob(rel) if p.is_file() and
                           p.resolve().is_relative_to(mem_dir.resolve())]
                if not matches:
                    hallazgos.append({"nivel": AMBAR, "detalle": f"{nombre} menciona un patron sin coincidencias: {rel}"})
                for match in matches:
                    linked = str(match.relative_to(mem_dir))
                    indexados.add(linked)
                    if linked not in visitados:
                        pendientes.append(linked)
                continue
            indexados.add(rel)
            if not target.is_file():
                hallazgos.append(
                    {"nivel": ROJO, "detalle": f"{nombre} apunta a un archivo que no existe: {rel}"}
                )
            elif rel not in visitados:
                pendientes.append(rel)

    en_disco = {
        str(p.relative_to(mem_dir))
        for p in mem_dir.rglob("*.md")
        if p.name not in index_files
    }
    huerfanos = sorted(en_disco - indexados)
    for h in huerfanos:
        hallazgos.append(
            {"nivel": AMBAR, "detalle": f"huerfano (existe pero el indice no lo conoce): {h}"}
        )

    # skills: directorios vs skills cargables (con SKILL.md)
    skills_dir = CLAUDE / "skills"
    dirs = sorted(p.name for p in skills_dir.iterdir() if p.is_dir()) if skills_dir.exists() else []
    cargables = sorted(p.name for p in skills_dir.iterdir() if (p / "SKILL.md").exists()) if skills_dir.exists() else []
    carcasas = sorted(set(dirs) - set(cargables))
    for c in carcasas:
        peso = du_mb(skills_dir / c)
        hallazgos.append(
            {"nivel": AMBAR,
             "detalle": f"carcasa sin SKILL.md en skills/: {c} ({peso:.0f} MB) — "
                        f"{'DUPLICA la version archivada' if (CLAUDE / 'skills-archive' / c).exists() else 'huerfana'}"}
        )


    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "index_truth",
        "titulo": "Index truth",
        "pregunta": "¿Los indices coinciden con el disco?",
        "estado": estado,
        "metrica": f"memoria: {len(indexados)} indexados / {len(en_disco)} en disco · "
                   f"skills: {len(cargables)} cargables / {len(dirs)} directorios",
        "hallazgos": hallazgos,
        "datos": {"skills_cargables": cargables, "carcasas": carcasas, "huerfanos": huerfanos},
    }


# ---------------------------------------------------------------- check 3
# FRESHNESS — las capas volatiles estan frescas o se declaran viejas.

FRESH = [
    (".claude/now.md", 24, "espejo del calendario (se regenera al iniciar sesion)"),
]


def check_freshness() -> dict:
    hallazgos = []
    detalle_metrica = []
    for rel, limite_h, que in FRESH:
        p = ROOT / rel
        h = age_hours(p)
        if h is None:
            hallazgos.append({"nivel": ROJO, "detalle": f"{rel} no existe ({que})"})
            continue
        detalle_metrica.append(f"{Path(rel).name}: {h:.0f}h")
        if h > limite_h * 3:
            hallazgos.append(
                {"nivel": ROJO,
                 "detalle": f"{rel} tiene {h:.0f}h (limite {limite_h}h) — {que}. "
                            f"Sus numeros NO se citan como actuales."}
            )
        elif h > limite_h:
            hallazgos.append(
                {"nivel": AMBAR, "detalle": f"{rel} tiene {h:.0f}h (limite {limite_h}h) — {que}"}
            )

    # daily log: alimenta al knowledge compiler
    dailies = sorted((CLAUDE / "daily").glob("*.md"), key=lambda p: p.stat().st_mtime)
    if dailies:
        h = age_hours(dailies[-1])
        detalle_metrica.append(f"daily: {h:.0f}h")
        if h > 48:
            hallazgos.append(
                {"nivel": AMBAR,
                 "detalle": f"ultimo daily log ({dailies[-1].name}) tiene {h:.0f}h — "
                            f"el knowledge compiler no tiene con que trabajar"}
            )
    else:
        hallazgos.append({"nivel": AMBAR, "detalle": "no hay daily logs"})

    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "freshness",
        "titulo": "Freshness",
        "pregunta": "¿Las capas volatiles estan frescas, o sirven datos viejos como actuales?",
        "estado": estado,
        "metrica": " · ".join(detalle_metrica),
        "hallazgos": hallazgos,
    }


# ---------------------------------------------------------------- check 4
# ORGANOS — el check que Nate no tiene: ¿algun organo lleva dias sin producir?
# Regla dura: "no medible" NUNCA se reporta como cero.
#
# El daemon de Arbrain corre en esta misma maquina y guarda sus crons en
# arbrain/server/store/claudeclaw.db. Si algun dia el daemon vive en otra maquina,
# este check debe preguntarle a ESE daemon antes de declararse ciego: un audit que se
# declara ciego teniendo el cable a la mano es el mismo pecado que persigue.


def _juzgar(tareas: list, fuente: str) -> dict:
    """Aplica el criterio de zombie a un censo de crons."""
    hallazgos = []
    ahora = time.time()
    activos = [t for t in tareas
               if t.get("status") == "active"
               and not str(t.get("id", "")).endswith("-migrated")
               and t.get("schedule")]
    nuevos = []
    for t in activos:
        jid, sched, lr, res = t["id"], t["schedule"], t.get("last_run"), t.get("last_result")
        if lr is None:
            nuevos.append(jid)
            continue
        # last_run viene en SEGUNDOS. Dividirlo entre 1000 daba "20,649 dias sin correr"
        # y pintaba de zombie a TODO el sistema — un falso rojo es tan dañino como un
        # falso verde.
        dias = (ahora - lr) / 86400
        # El umbral tiene que ser funcion del PERIODO del cron, no un 7 fijo. Con el 7 fijo,
        # todo cron mensual (`0 8 1 * *`) salia ZOMBIE los dias 8-31 de cada mes: 22 dias sin
        # correr es su salud, no su muerte. Un audit que grita lobo se deja de leer, que es
        # la unica forma de que un sensor bueno no sirva.
        umbral = 7.0
        campos = sched.split()
        if len(campos) == 5:
            dom, mes, dow = campos[2], campos[3], campos[4]
            if mes != "*":                      # anual o por meses concretos
                umbral = 400.0
            elif dom != "*" and dow == "*":     # mensual (dia N del mes)
                umbral = 40.0
            elif dow != "*" and dom == "*":     # semanal
                umbral = 14.0
        if dias > umbral:
            hallazgos.append({"nivel": ROJO,
                              "detalle": f"{jid}: {dias:.0f} dias sin correr ({sched}, umbral {umbral:.0f}d) — ORGANO ZOMBIE"})
        elif dias > 2 and not re.search(r"\* \* [0-6]$|1 \* \*", sched):
            hallazgos.append({"nivel": AMBAR,
                              "detalle": f"{jid}: {dias:.1f} dias sin correr ({sched})"})
        # NO buscar "error" dentro del texto libre: el resultado lo escribe un LLM y
        # "Sin errores." o "0 errores" matchean igual que un fallo real.
        # La convencion de los prompts de cron es explicita: si algo fallo, el resultado
        # ARRANCA con ⚠️ (o con "Error:" si fallo la ejecucion). Ese es el sensor.
        if res and str(res).lstrip().startswith("Error:"):
            hallazgos.append({"nivel": ROJO,
                              "detalle": f"{jid}: la última ejecución falló — {str(res).strip()[:150]}"})
        elif res and str(res).lstrip().startswith("⚠️"):
            hallazgos.append({"nivel": AMBAR,
                              "detalle": f"{jid} reporto un problema — {str(res).strip()[:150]}"})
    if nuevos:
        hallazgos.append({"nivel": AMBAR,
                          "detalle": f"nunca han corrido (normal si son nuevos): {', '.join(nuevos)}"})
    return {
        "check": "organos", "titulo": "Organos (crons)",
        "pregunta": "¿Algun organo esta vivo en apariencia pero sin producir?",
        "estado": worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE,
        "metrica": f"{len(activos)} activos · fuente: {fuente}",
        "hallazgos": hallazgos,
    }


def check_organos() -> dict:
    db = ROOT / "arbrain" / "server" / "store" / "claudeclaw.db"
    maquina = os.uname().nodename.split(".")[0]

    if not db.exists():
        return {
            "check": "organos", "titulo": "Organos (crons)",
            "pregunta": "¿Algun organo esta vivo en apariencia pero sin producir?",
            "estado": AMBAR, "metrica": "scheduler DB ausente",
            "hallazgos": [{"nivel": AMBAR,
                           "detalle": "no hay scheduler DB en esta maquina (¿el daemon de Arbrain "
                                      "nunca arranco?) — SENSOR CIEGO, no cero"}],
        }

    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        activos = con.execute(
            "select id, schedule, last_run, next_run, last_result from scheduled_tasks "
            "where status='active'"
        ).fetchall()
        total = con.execute("select count(*) from scheduled_tasks").fetchone()[0]
        con.close()
    except Exception as e:
        return {
            "check": "organos", "titulo": "Organos (crons)",
            "pregunta": "¿Algun organo esta vivo en apariencia pero sin producir?",
            "estado": ROJO, "metrica": "DB ilegible",
            "hallazgos": [{"nivel": ROJO, "detalle": f"scheduler DB ilegible: {e}"}],
        }

    if total == 0:
        # La DB es legible y es la del daemon real de esta maquina: 0 jobs es una
        # MEDICION (no hay organos programados), no un sensor ciego.
        return {
            "check": "organos", "titulo": "Organos (crons)",
            "pregunta": "¿Algun organo esta vivo en apariencia pero sin producir?",
            "estado": VERDE,
            "metrica": f"0 jobs programados en '{maquina}'",
            "hallazgos": [],
        }

    return _juzgar([
        {"id": jid, "schedule": sched, "last_run": last_run, "next_run": next_run,
         "last_result": last_result, "status": "active"}
        for jid, sched, last_run, next_run, last_result in activos
    ], f"scheduler local en {maquina}")


# ---------------------------------------------------------------- check 5
# BLOAT — lo que ya decidimos que no debe existir, ¿volvio a existir?

# (ruta relativa al repo, motivo). Cuando se mate o se mueva algo, se agrega aqui:
# asi el audit defiende la decision. Ejemplo:
#   ("docs/viejo", "movido a docs/nuevo/ el 2026-03-12 — NO recrear"),
PROHIBIDOS: list[tuple[str, str]] = []


def user_skill_duplicates(home: Path) -> list[dict]:
    """Same named skill in provider roots must resolve to one canonical file."""
    found = {}
    for provider in (".claude", ".agents", ".codex"):
        folder = home / provider / "skills"
        if not folder.is_dir():
            continue
        for skill in folder.iterdir():
            source = skill / "SKILL.md"
            if source.is_file():
                found.setdefault(skill.name, set()).add(str(source.resolve()))
    return [{"nivel": AMBAR,
             "detalle": f"skill de usuario duplicada: {name} en {len(paths)} archivos independientes; comparar antes de consolidar"}
            for name, paths in sorted(found.items()) if len(paths) > 1]


def check_bloat() -> dict:
    hallazgos = user_skill_duplicates(Path.home())
    # 6 sep 2026: aliases are legitimate; an independent copy is the regression.
    sensor = CLAUDE / "hooks" / "codex-context.py"
    if sensor.exists():
        try:
            result = subprocess.run([sys.executable, str(sensor), "--check"],
                                    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=5)
            if result.returncode:
                hallazgos.append({"nivel": ROJO, "detalle": result.stdout.strip() or result.stderr.strip()})
        except (OSError, subprocess.TimeoutExpired) as exc:
            hallazgos.append({"nivel": AMBAR, "detalle": f"Sensor de cerebro compartido no disponible: {exc}"})
    else:
        hallazgos.append({"nivel": ROJO, "detalle": "Falta el sensor .claude/hooks/codex-context.py"})
    for rel, motivo in PROHIBIDOS:
        if (ROOT / rel).exists():
            hallazgos.append({"nivel": ROJO, "detalle": f"resucito lo prohibido: {rel} — {motivo}"})

    # skills que estan vivas Y archivadas a la vez (clash)
    skills_dir, archive = CLAUDE / "skills", CLAUDE / "skills-archive"
    if skills_dir.exists() and archive.exists():
        for p in skills_dir.iterdir():
            if p.is_dir() and (archive / p.name).exists() and (p / "SKILL.md").exists():
                hallazgos.append(
                    {"nivel": ROJO,
                     "detalle": f"clash: '{p.name}' esta VIVA y ARCHIVADA a la vez — "
                                f"el tombstone miente o la resurreccion no se documento"}
                )

    # los worktrees son checkouts de git, NO parte del cerebro. Sumarlos al peso de
    # .claude/ mezcla dos cosas distintas y produce un ambar que no dice nada util.
    wt_dir = CLAUDE / "worktrees"
    peso_wt = du_mb(wt_dir) if wt_dir.exists() else 0
    peso = (du_mb(CLAUDE) - peso_wt) if CLAUDE.exists() else 0

    # EL PESO SOLO NO ES UN HALLAZGO. Una skill puede cargar videos o imagenes de
    # referencia que su propia SKILL.md declara norte estetico: carga legitima, no basura.
    # Marcar ambar por pesar seria gritar lobo, y un audit al que se le grita lobo se
    # deja de leer. Se reporta el desglose como DATO; el ambar se reserva para lo que
    # es verificablemente sobra (prohibidos, clash, worktrees ya mergeados).
    pesados = sorted(
        ((p.name, du_mb(p)) for p in (CLAUDE / "skills").iterdir() if p.is_dir()),
        key=lambda x: -x[1],
    )[:3] if (CLAUDE / "skills").exists() else []
    desglose = " · ".join(f"{n} {m:.0f} MB" for n, m in pesados if m >= 10)

    # worktrees: lo que importa no es el peso, es si guardan trabajo UNICO
    sueltos = 0
    if wt_dir.exists():
        for w in sorted(p for p in wt_dir.iterdir() if p.is_dir()):
            head = sh("git", "-C", str(w), "rev-parse", "HEAD")
            if not head:
                continue
            sueltos += 1
            mergeado = subprocess.run(
                ["git", "merge-base", "--is-ancestor", head, "main"],
                cwd=ROOT, capture_output=True
            ).returncode == 0
            sucio = [l for l in sh("git", "-C", str(w), "status", "--porcelain").splitlines()
                     if l.strip() and not l.startswith("??")]
            peso_w = du_mb(w)
            if mergeado and not sucio:
                hallazgos.append(
                    {"nivel": AMBAR,
                     "detalle": f"worktree '{w.name}' ({peso_w:.0f} MB): HEAD ya mergeado en main "
                                f"y sin cambios propios — candidato a poda. "
                                f"REQUIERE FIRMA: `git worktree remove {w.relative_to(ROOT)}`"}
                )
            else:
                hallazgos.append(
                    {"nivel": ROJO,
                     "detalle": f"worktree '{w.name}' ({peso_w:.0f} MB): "
                                f"{'tiene trabajo NO mergeado' if not mergeado else ''}"
                                f"{' y ' if not mergeado and sucio else ''}"
                                f"{f'{len(sucio)} cambios sin commitear' if sucio else ''} — "
                                f"NO podar sin rescatar"}
                )

    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "bloat", "titulo": "Bloat y clash",
        "pregunta": "¿Volvio a existir lo que ya decidimos matar?",
        "estado": estado,
        "metrica": (f".claude/ = {peso:.0f} MB + {peso_wt:.0f} MB en {sueltos} worktree(s)"
                    + (f" · lo pesado: {desglose}" if desglose else "")),
        "hallazgos": hallazgos,
    }


# ---------------------------------------------------------------- check 6
# HIGIENE — trabajo que existe solo en este disco (el patron "codigo vivo fuera de git").

def check_higiene() -> dict:
    hallazgos = []
    status = sh("git", "status", "--porcelain")
    lineas = [l for l in status.splitlines() if l.strip()]
    untracked = [l[3:] for l in lineas if l.startswith("??")]
    modificados = [l[3:] for l in lineas if l.startswith(" M") or l.startswith("M ")]

    if len(lineas) > 25:
        hallazgos.append(
            {"nivel": AMBAR,
             "detalle": f"{len(lineas)} archivos sin commitear ({len(untracked)} untracked, "
                        f"{len(modificados)} modificados) — trabajo que solo existe en este disco"}
        )

    # commits locales sin pushear: el respaldo remoto (origin) no tiene ese trabajo
    ahead = sh("git", "rev-list", "--count", "@{u}..HEAD")
    if ahead.isdigit() and int(ahead) > 0:
        hallazgos.append(
            {"nivel": AMBAR,
             "detalle": f"{ahead} commit(s) locales sin pushear — ese trabajo no tiene respaldo remoto"}
        )

    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "higiene", "titulo": "Higiene de git",
        "pregunta": "¿Hay trabajo que solo existe en este disco?",
        "estado": estado,
        "metrica": f"{len(lineas)} archivos sin commitear · {ahead or '0'} commits sin pushear",
        "hallazgos": hallazgos,
    }



# ---------------------------------------------------------------------------
# PRESUPUESTO — lo que se paga en CADA conversacion (nace 23 ago 2026)
# El fallo que atrapa: el indice de memoria vuelve a engordar hasta ser un segundo
# corpus. Paso entre el 19 jul y el 23 ago (81KB -> 158KB = ~1,400 tokens/dia
# cobrados para siempre). La causa raiz fue medir en LINEAS lo que se cobra en CHARS.
# ---------------------------------------------------------------------------

# Anatomia v2 (cirugia 31 ago 2026): MEMORY.md = esencia importada (Reglas Vivas + user/);
# MEMORY-indice.md NO se importa — lo sirve el hook memory-recall.py por triggers.
PRESUPUESTO = [
    (".claude/memory/MEMORY.md", 18000, "esencia de memoria (@import, nivel 0)", True),
    (".claude/memory/MEMORY-indice.md", 90000, "indice completo (hook recall, no importado)", False),
    ("CLAUDE.md", 32000, "el router raiz", True),
]
ENTRY_MAX = 400


def check_presupuesto() -> dict:
    hallazgos = []
    for rel, techo, que, importado in PRESUPUESTO:
        f = ROOT / rel
        if not f.exists():
            hallazgos.append({"nivel": ROJO, "detalle": f"{rel} NO EXISTE ({que})"})
            continue
        n = len(f.read_text(encoding="utf-8", errors="ignore"))
        r = n / techo
        costo = f" — ~{n/3.6:,.0f} tokens en cada conversacion" if importado else ""
        if r > 1:
            hallazgos.append({"nivel": ROJO,
                "detalle": f"{rel} {n:,} chars = {r*100:.0f}% del techo ({techo:,}){costo}"})
        elif r > 0.85:
            hallazgos.append({"nivel": AMBAR,
                "detalle": f"{rel} al {r*100:.0f}% del presupuesto — comprimir al escribir; el techo se ROTA, no se sube"})

    for rel in (".claude/memory/MEMORY.md", ".claude/memory/MEMORY-indice.md"):
        idx = ROOT / rel
        if idx.exists():
            largas = [l for l in idx.read_text(encoding="utf-8", errors="ignore").splitlines()
                      if l.startswith("- `") and len(l) > ENTRY_MAX]
            if largas:
                hallazgos.append({"nivel": ROJO,
                    "detalle": f"{Path(rel).name}: {len(largas)} entradas pasan de {ENTRY_MAX} chars (el detalle va en el ARCHIVO): "
                               + ", ".join(re.sub(r"^- `([^`]+)`.*", r"\1", l) for l in largas[:4])})

    # El recall pasivo depende del hook memory-recall (cirugia v2): si muere, el indice
    # entero se vuelve invisible en silencio — el organo necesita su sensor.
    recall = ROOT / ".claude/hooks/memory-recall.py"
    if not recall.exists():
        hallazgos.append({"nivel": ROJO, "detalle": "memory-recall.py NO EXISTE — el indice no llega a ninguna conversacion"})
    else:
        try:
            # El mismo Python que corre la auditoría: en Windows `python3` suele ser el alias de la Microsoft Store.
            st = subprocess.run([sys.executable, str(recall), "--selftest"], capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=20,
                                env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"})
            if st.returncode != 0:
                hallazgos.append({"nivel": ROJO,
                    "detalle": f"selftest del recall FALLA: {(st.stdout or st.stderr).strip()[:160]}"})
        except Exception as e:
            hallazgos.append({"nivel": ROJO, "detalle": f"selftest del recall no corre: {e}"})
        settings = ROOT / ".claude/settings.json"
        # En la copia del alumno el gancho va por el lanzador: `sh .../py.sh memory-recall`.
        if settings.exists() and "memory-recall" not in settings.read_text(encoding="utf-8", errors="ignore"):
            hallazgos.append({"nivel": ROJO,
                "detalle": "memory-recall.py existe pero NO esta registrado en settings.json (UserPromptSubmit)"})

    metrica = []
    for rel, techo, _, importado in PRESUPUESTO:
        f = ROOT / rel
        if f.exists():
            n = len(f.read_text(encoding="utf-8", errors="ignore"))
            unidad = f"{n/3.6:,.0f} tok" if importado else f"{n/1000:.0f}K chars"
            metrica.append(f"{Path(rel).name} {unidad} ({n*100//techo}%)")

    estado = worst(*[h["nivel"] for h in hallazgos]) if hallazgos else VERDE
    return {
        "check": "presupuesto",
        "titulo": "Presupuesto",
        "pregunta": "¿Cuanto contexto se paga en CADA conversacion, y sigue dentro del techo?",
        "estado": estado,
        "metrica": " · ".join(metrica),
        "hallazgos": hallazgos,
    }


CHECKS = {
    "routing": check_routing,
    "index_truth": check_index_truth,
    "freshness": check_freshness,
    "presupuesto": check_presupuesto,
    "organos": check_organos,
    "bloat": check_bloat,
    "higiene": check_higiene,
}

EMOJI = {VERDE: "🟢", AMBAR: "🟡", ROJO: "🔴"}


def render_md(reporte: dict) -> str:
    out = [
        f"# OS Audit — {reporte['fecha']}",
        "",
        f"> Read-only. Maquina: `{reporte['maquina']}` · HEAD: `{reporte['head']}`",
        f"> Generado por `.claude/skills/os-audit/scripts/os_audit.py`. **No arregla nada.**",
        "",
        f"## Veredicto: {EMOJI[reporte['estado']]} {reporte['estado']}",
        "",
        "| Check | Estado | Metrica |",
        "|---|---|---|",
    ]
    for c in reporte["checks"]:
        out.append(f"| {c['titulo']} | {EMOJI[c['estado']]} {c['estado']} | {c['metrica']} |")
    out.append("")

    for c in reporte["checks"]:
        if not c["hallazgos"]:
            continue
        out += [f"### {EMOJI[c['estado']]} {c['titulo']}", f"*{c['pregunta']}*", ""]
        for h in c["hallazgos"]:
            out.append(f"- {EMOJI[h['nivel']]} {h['detalle']}")
        out.append("")

    if reporte["estado"] == VERDE:
        out.append("Sin hallazgos. El sistema dice la verdad sobre si mismo.")
    else:
        out += [
            "---",
            "",
            "## Que haria falta",
            "",
            "Este reporte NO ejecuta nada. Los fixes se proponen en conversacion y los firma el dueño.",
            "Regla: lo aditivo (indexar, documentar) se puede hacer directo; lo que MUEVE o BORRA",
            "se propone y espera firma del dueño.",
        ]
    return "\n".join(out)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):  # consola cp1252 de Windows: los emojis del informe no truenan
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Auditoria read-only de Arbrain")
    ap.add_argument("--json", action="store_true", help="salida JSON")
    ap.add_argument("--write", action="store_true", help="guarda el reporte en .claude/audits/")
    ap.add_argument("--check", choices=list(CHECKS), help="corre un solo check")
    ap.add_argument("--cron", action="store_true",
                    help="modo watchdog: escribe el reporte, calla salvo ROJO, exit 0 siempre")
    args = ap.parse_args()
    if args.cron:
        args.write = True

    seleccion = [args.check] if args.check else list(CHECKS)
    resultados = [CHECKS[c]() for c in seleccion]

    reporte = {
        "fecha": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z"),
        "maquina": os.uname().nodename.split(".")[0],
        "head": sh("git", "rev-parse", "--short", "HEAD"),
        "estado": worst(*[r["estado"] for r in resultados]),
        "checks": resultados,
    }

    destino = None
    if args.write:
        dest = CLAUDE / "audits"
        dest.mkdir(exist_ok=True)
        destino = dest / f"{datetime.now().strftime('%Y-%m-%d')}-os-audit.md"
        destino.write_text(render_md(reporte), encoding="utf-8")

    if args.cron:
        # Watchdog silencioso: solo habla si hay problema real. El ambar
        # queda registrado en el reporte; interrumpir por un ambar entrena a ignorarlo.
        # Exit 0 SIEMPRE: el job no fallo, el sistema es el que tiene hallazgos.
        if reporte["estado"] == ROJO:
            rojos = [h["detalle"] for c in reporte["checks"]
                     for h in c["hallazgos"] if h["nivel"] == ROJO]
            print(f"🔴 OS Audit ROJO — el sistema esta mintiendo sobre si mismo "
                  f"({len(rojos)} hallazgo(s)):")
            for r in rojos[:8]:
                print(f"  · {r}")
            if destino:
                print(f"\nReporte completo: {destino.relative_to(ROOT)}")
        sys.exit(0)

    if args.json:
        print(json.dumps(reporte, indent=2, ensure_ascii=False))
    else:
        print(render_md(reporte))
    if destino:
        print(f"\n→ {destino.relative_to(ROOT)}", file=sys.stderr)

    sys.exit(0 if reporte["estado"] == VERDE else 1)


if __name__ == "__main__":
    main()
