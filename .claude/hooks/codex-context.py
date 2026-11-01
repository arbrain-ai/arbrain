#!/usr/bin/env python3
"""Codex adapter for the shared brain. No memory copy and no second index.

Edición del alumno: solo lee archivos; no ejecuta nada (red team 2, C-1).

SessionStart (startup/resume/clear/compact) returns the same files CLAUDE.md imports, in the same order: MEMORY.md,
RETRATO.md, su meta a 90 días, su camino en el programa y now.md (prefijo estable primero, agenda al final).
--check is the read-only drift sensor, also called by os-audit.
"""
import importlib.util
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Techo por archivo (1 nov 2026, sistema nervioso M3): con el techo único de 8,000, si MEMORY.md + now.md se pasaban,
# Codex no recibía ninguno, y el retrato, la meta y el camino ni se cargaban. Cada techo cubre el del archivo con
# holgura (MEMORY.md y RETRATO.md: 6,000 en memory-budget.sh y cliente/retrato.ts; now.md: el que corta agenda-context).
FILE_BUDGETS = {
    # La personalidad del autor (rama alumno-estratega): CLAUDE.md la importa primero cuando viaja.
    ".claude/memory/PERSONALIDAD.md": 9000,
    ".claude/memory/MEMORY.md": 8000,
    ".claude/memory/RETRATO.md": 8000,
    ".claude/memory/project/meta-90-dias.md": 6000,
    ".claude/memory/project/mi-camino.md": 6000,
    ".claude/now.md": 8000,
}
# Meta y camino llegan cuando conecta su programa: si todavía no existen, no es un error (como un @import que falta).
OPCIONALES = {".claude/memory/PERSONALIDAD.md", ".claude/memory/project/meta-90-dias.md", ".claude/memory/project/mi-camino.md"}
MAX_CONTEXT_CHARS = sum(FILE_BUDGETS.values()) + 2000
ALIASES = {
    "AGENTS.md": "CLAUDE.md",
    ".agents/skills": ".claude/skills",
    ".codex/hooks": ".claude/hooks",
    ".codex/memory": ".claude/memory",
    ".codex/skills": ".claude/skills",
    ".codex/now.md": ".claude/now.md",
}


def check_links(root=ROOT):
    errors = []
    for alias, canonical in ALIASES.items():
        try:
            if not (root / alias).samefile(root / canonical):
                errors.append(f"{alias} debe apuntar a {canonical}; apareció una copia divergente.")
        except OSError:
            errors.append(f"Enlace ausente/roto: {alias} → {canonical}.")
    return errors


def _agenda():
    """agenda-context.py, solo para juzgar la frescura de now.md con la misma regla que el turno de Claude."""
    spec = importlib.util.spec_from_file_location("codex_agenda", Path(__file__).with_name("agenda-context.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def context(root=ROOT):
    notes = check_links(root)
    parts = [
        "Memoria compartida de Levy. Fuente única: CLAUDE.md + .claude/. "
        "AGENTS.md y los directorios de compatibilidad son enlaces, no copias. "
        "Guardar memoria solo en .claude/memory/ mediante memory-manager. "
        "El índice apunta: abrir el archivo de detalle antes de opinar. "
        "now.md es una foto fechada; las métricas se consultan en vivo."
    ]
    for relative, budget in FILE_BUDGETS.items():
        path = root / relative
        if relative in OPCIONALES and not path.exists():
            continue
        try:
            # Bound both disk reads and model context; never silently truncate a file.
            with path.open(encoding="utf-8") as stream:
                text = stream.read(budget + 1)
            if len(text) > budget:
                raise ValueError("supera el presupuesto; abrir el archivo con herramientas")
            if not text.strip():
                raise ValueError("archivo vacío")
            parts.append(f"\nFuente: {relative}\n{text}")
            if relative.endswith("now.md"):
                try:
                    aviso = _agenda().now_frescura(root, text, path.stat().st_mtime)
                except Exception:
                    aviso = "now.md: no se pudo juzgar su frescura. " if time.time() - path.stat().st_mtime > 3600 else ""
                if aviso:
                    notes.append(aviso.strip())
        except (OSError, UnicodeError, ValueError) as exc:
            notes.append(f"No se cargó {relative}: {exc}")
    result = "\n".join(parts)
    if len(result) > MAX_CONTEXT_CHARS:
        notes.append("La memoria de arranque supera el presupuesto: abrir MEMORY.md, RETRATO.md, "
                     "project/meta-90-dias.md, project/mi-camino.md y now.md antes de responder; "
                     "no asumir que se cargaron.")
        result = parts[0]
    if notes:
        result = "ATENCIÓN AL CONTEXTO:\n" + "\n".join(notes) + "\n\n" + result
    return result, notes


def main():
    if "--check" in sys.argv:
        errors = check_links()
        print("\n".join(errors) if errors else "✓ Un solo cerebro: todos los alias resuelven al original.")
        return 1 if errors else 0
    text, notes = context()
    output = {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text}}
    if notes:
        output["systemMessage"] = " ".join(notes)
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
