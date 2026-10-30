#!/bin/sh
# Lanzador de los ganchos de Python del alumno (23 oct 2026). Uso en .claude/settings.json:
#   sh "$CLAUDE_PROJECT_DIR/.claude/hooks/py.sh" <gancho> [banderas]
# En macOS y Linux es lo mismo que antes: `python3 <gancho>.py`. En Windows, `python3` suele ser el alias de la
# Microsoft Store (no corre nada) y un Python instalado después de abrir Claude Code no está en su PATH: sin esto, el
# recuerdo de memoria y el freno de «enviar, borrar, pagar» no corrían. Aquí se busca el Python real (python3, python,
# el lanzador `py` o el de winget para el usuario) y se fuerza UTF-8 para que los acentos no salgan rotos.
# Solo corre los ganchos de esta lista, siempre de esta carpeta. Sin Python, se omite sin tronar (como session-start.sh),
# pero AVISA (0.2.15, A10): deja `.claude/hooks/tmp/sin-python.json` (Arbrain lo lee y lo muestra en Ajustes › Permisos
# y seguridad) y lo dice por stderr. Antes salía con 0 en silencio y nadie sabía que memoria, diario y candado no corrían.
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
nombre="$1"
[ $# -gt 0 ] && shift
case "$nombre" in
  memory-recall) gancho="$raiz/.claude/hooks/memory-recall.py" ;;
  candado-freno) gancho="$raiz/.claude/hooks/candado-freno.py" ;;
  candado-pantalla) gancho="$raiz/.claude/hooks/candado-pantalla.py" ;;
  capture-conversation) gancho="$raiz/.claude/hooks/capture-conversation.py" ;;
  agenda-context) gancho="$raiz/.claude/hooks/agenda-context.py" ;;
  intent-context) gancho="$raiz/.claude/hooks/intent-context.py" ;;
  *) exit 0 ;;
esac
[ -f "$gancho" ] || exit 0

case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) exec python3 "$gancho" "$@" ;;
esac

export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
sirve() { "$@" -I -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' </dev/null >/dev/null 2>&1; }
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1 && sirve "$p"; then exec "$p" "$gancho" "$@"; fi
done
if command -v py >/dev/null 2>&1 && sirve py -3; then exec py -3 "$gancho" "$@"; fi
if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
  for p in "$(cygpath -u "$LOCALAPPDATA")"/Programs/Python/Python3*/python.exe; do
    if [ -x "$p" ] && sirve "$p"; then exec "$p" "$gancho" "$@"; fi
  done
fi
mkdir -p "$raiz/.claude/hooks/tmp" 2>/dev/null
printf '{"t":%s000,"gancho":"%s"}\n' "$(date +%s)" "$nombre" > "$raiz/.claude/hooks/tmp/sin-python.json" 2>/dev/null
echo "Arbrain: no encontré Python 3.8 o más nuevo, así que el gancho «$nombre» no corrió. Instala Python (python.org, marca «Add python.exe to PATH») y vuelve a abrir Arbrain." >&2
exit 0
