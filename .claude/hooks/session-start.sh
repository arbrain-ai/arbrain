#!/bin/sh
# Arranque de sesión del alumno: corre session-start.ts con el `tsx` o el `node` del sistema.
# Red team 2 (C-1): nunca busca intérpretes dentro del workspace (node_modules) ni en otro checkout de git; lo que
# vive fuera de `.claude/hooks/` lo puede escribir un agente. Sin intérprete, se omite sin tronar.
dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
hook="$dir/.claude/hooks/session-start.ts"
if command -v tsx >/dev/null 2>&1; then
  exec tsx "$hook"
fi
if command -v node >/dev/null 2>&1; then
  # Node 22.18+ corre TypeScript sin tipos tal cual; uno más viejo falla y se omite.
  node --no-warnings "$hook" 2>/dev/null || exit 0
  exit 0
fi
exit 0
