#!/usr/bin/env bash
# Desinstalar Arbrain sin borrar nada (23 oct 2026, para reinstalar desde cero: Daniel lo muestra en vivo en la grupal).
# Lo pide la persona («desinstala Arbrain») y lo corre Claude Code siguiendo INSTALAR.md › «Desinstalar». Bash de
# macOS, Linux o Git Bash de Windows.
#
#   bash ~/Arbrain/arbrain/scripts/instalar/desinstalar.sh [carpeta]      (por defecto ~/Arbrain)
#
# Qué hace, en orden: cierra la app de escritorio (abierta volvería a encender Arbrain), apaga Arbrain y su arranque
# automático y MUEVE (no borra) a ~/Arbrain-respaldos/<fecha>-desinstalado/ la carpeta de Arbrain, sus datos
# (conversaciones, contraseña y llaves, con los mismos permisos privados), la app y sus accesos directos. Node, Python,
# Git y Claude Code se quedan: son herramientas de la computadora, no de Arbrain. El ancla de firmas
# (~/.config/arbrain/firmas-permitidas) también se queda. Para volver atrás: mover las carpetas de regreso (las rutas
# originales quedan en RESTAURAR.txt dentro del respaldo).
#
# Salida: líneas «· …» y, al final, UNA línea: DESINSTALADO <respaldo> · DESINSTALAR_FALTA <motivo>
set -uo pipefail

di() { printf '· %s\n' "$*"; }
falta() { printf 'DESINSTALAR_FALTA %s\n' "$*"; exit 4; }

# Se copia a una carpeta temporal y corre desde ahí: así puede mover la carpeta de Arbrain que lo contiene.
if [ -z "${ARBRAIN_DESINSTALAR_COPIA:-}" ]; then
  T="$(mktemp -d)"; cp "$0" "$T/desinstalar.sh" || exit 1
  cd "$HOME" || exit 1
  ARBRAIN_DESINSTALAR_COPIA=1 exec bash "$T/desinstalar.sh" "$@"
fi
cd "$HOME" || exit 1
# shellcheck source=/dev/null
. "$HOME/.arbrain/entorno.sh" 2>/dev/null || true

REPO="${1:-$HOME/Arbrain}"
case "$(uname -s)" in
  Darwin) SO=mac; DATOS="$HOME/Library/Application Support/ai.arbrain.servidor" ;;
  MINGW*|MSYS*|CYGWIN*) SO=win; DATOS="$(cygpath -u "$APPDATA")/ai.arbrain.servidor" ;;
  *) SO=linux; DATOS="${XDG_DATA_HOME:-$HOME/.local/share}/ai.arbrain.servidor" ;;
esac
[ -z "${ARBRAIN_SERVIDOR_DATOS:-}" ] || DATOS="$ARBRAIN_SERVIDOR_DATOS"
CFG_APP="$HOME/.config/arbrain/escritorio.json"

if [ ! -f "$REPO/arbrain/EDICION" ] && [ ! -d "$DATOS" ] && [ ! -f "$CFG_APP" ]; then
  falta "no encontré Arbrain instalado en esta computadora (ni $REPO, ni sus datos, ni la app)"
fi
if [ -d "$REPO" ] && [ ! -f "$REPO/arbrain/EDICION" ]; then
  falta "$REPO no es una copia de Arbrain del alumno (le falta arbrain/EDICION): no la toco"
fi

R="$HOME/Arbrain-respaldos/$(date +%Y-%m-%d-%H%M%S)-desinstalado"
mkdir -p "$R" || falta "no pude crear $R"
: > "$R/RESTAURAR.txt"
mover() { # $1 origen · $2 nombre dentro del respaldo
  [ -e "$1" ] || return 0
  if mv "$1" "$R/$2" 2>/dev/null; then
    printf '%s  →  %s\n' "$R/$2" "$1" >> "$R/RESTAURAR.txt"; di "Guardé $(basename "$1") en el respaldo."
  else
    falta "no pude mover $1 (¿una ventana o una terminal la tiene abierta? Ciérrala y vuelve a intentarlo)"
  fi
}

# 1. La app de escritorio: cerrarla (solo la del alumno: se busca por su id o por su ruta exacta).
APP=""
[ -f "$CFG_APP" ] && APP="$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).app||""))}catch{}' "$CFG_APP" 2>/dev/null)"
case "$SO" in
  mac) osascript -e 'if application id "ai.arbrain.escritorio" is running then tell application id "ai.arbrain.escritorio" to quit' >/dev/null 2>&1 || true ;;
  win)
    [ -z "$APP" ] || powershell.exe -NoProfile -Command "Get-Process -Name Arbrain -ErrorAction SilentlyContinue | Where-Object { \$_.Path -eq '$APP' } | Stop-Process -Force" >/dev/null 2>&1 || true
    ;;
  linux)
    if [ -n "$APP" ]; then
      for pid in $(ps -eo pid=,args= | awk -v a="$APP" '$2 == a { print $1 }'); do kill "$pid" 2>/dev/null || true; done
    fi
    ;;
esac
sleep 1

# 2. Apagar Arbrain y su arranque automático (con el script de la propia copia).
if [ -f "$REPO/arbrain/scripts/servidor.mjs" ] && command -v node >/dev/null 2>&1; then
  ( cd "$REPO/arbrain" && node scripts/servidor.mjs detener >/dev/null 2>&1; node scripts/servidor.mjs arranque-automatico desactivar >/dev/null 2>&1 ) || true
  di "Apagué Arbrain y su arranque automático."
fi

# 3. La app y sus accesos directos.
case "$SO" in
  mac) [ -n "$APP" ] && [ -d "$APP" ] && mover "$APP" "Arbrain.app" ;;
  win)
    if [ -n "$APP" ]; then
      D="$(dirname "$(cygpath -u "$APP")")"
      [ -d "$D" ] && mover "$D" "Arbrain-app"
      INICIO="$(cygpath -u "$APPDATA")/Microsoft/Windows/Start Menu/Programs/Arbrain.lnk"
      ESCRITORIO="$(cygpath -u "$(powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')" | tr -d '\r')")/Arbrain.lnk"
      for l in "$INICIO" "$ESCRITORIO"; do
        [ -f "$l" ] || continue
        # Solo el acceso que apunta a la app del alumno (el de la app 0.1.x u otra se queda).
        destino="$(powershell.exe -NoProfile -Command "(New-Object -ComObject WScript.Shell).CreateShortcut('$(cygpath -w "$l")').TargetPath" | tr -d '\r')"
        [ "$destino" = "$APP" ] && mover "$l" "$(basename "$(dirname "$l")")-Arbrain.lnk"
      done
    fi
    ;;
  linux)
    [ -n "$APP" ] && [ -d "$(dirname "$APP")" ] && mover "$(dirname "$APP")" "arbrain-escritorio"
    mover "${XDG_DATA_HOME:-$HOME/.local/share}/applications/ai.arbrain.escritorio.desktop" "ai.arbrain.escritorio.desktop"
    ;;
esac
mover "$CFG_APP" "escritorio.json"

# 4. Sus datos (conversaciones, lienzos, contraseña, llaves) y la carpeta de Arbrain (memoria, plan, skills).
mover "$DATOS" "datos-ai.arbrain.servidor"
mover "$REPO" "$(basename "$REPO")"
mover "$HOME/.arbrain/arranque.log" "arranque.log"

printf 'DESINSTALADO %s\n' "$R"
