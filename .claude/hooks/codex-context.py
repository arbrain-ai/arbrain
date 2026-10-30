#!/usr/bin/env python3
"""Codex adapter for the shared brain. No memory copy and no second index.

Edición del alumno: solo lee archivos; no ejecuta nada (red team 2, C-1).

SessionStart (startup/resume/clear/compact) returns the canonical MEMORY.md and now.md.
--check is the read-only drift sensor, also called by os-audit.
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAX_CONTEXT_CHARS = 8000
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


def context(root=ROOT):
    notes = check_links(root)
    parts = [
        "Memoria compartida de Levy. Fuente única: CLAUDE.md + .claude/. "
        "AGENTS.md y los directorios de compatibilidad son enlaces, no copias. "
        "Guardar memoria solo en .claude/memory/ mediante memory-manager. "
        "El índice apunta: abrir el archivo de detalle antes de opinar. "
        "now.md es una foto fechada; las métricas se consultan en vivo."
    ]
    for relative in (".claude/memory/MEMORY.md", ".claude/now.md"):
        path = root / relative
        try:
            # Bound both disk reads and model context; never silently truncate a file.
            with path.open(encoding="utf-8") as stream:
                text = stream.read(MAX_CONTEXT_CHARS + 1)
            if len(text) > MAX_CONTEXT_CHARS:
                raise ValueError("supera el presupuesto; abrir el archivo con herramientas")
            if not text.strip():
                raise ValueError("archivo vacío")
            parts.append(f"\nFuente: {relative}\n{text}")
            if relative.endswith("now.md") and time.time() - path.stat().st_mtime > 3600:
                notes.append("now.md tiene más de una hora: confirmar la agenda con el dueño antes de planificar.")
        except (OSError, UnicodeError, ValueError) as exc:
            notes.append(f"No se cargó {relative}: {exc}")
    result = "\n".join(parts)
    if len(result) > MAX_CONTEXT_CHARS:
        notes.append("La memoria de arranque supera el presupuesto: abrir MEMORY.md y now.md "
                     "antes de responder; no asumir que se cargaron.")
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
