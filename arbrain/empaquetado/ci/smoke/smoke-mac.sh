#!/usr/bin/env bash
# Smoke del .dmg de macOS (vigía E2E, 12 oct 2026). Hermano de smoke-linux.sh y smoke-windows.ps1.
#
#   smoke-mac.sh <Arbrain_x.y.z_aarch64.dmg | Arbrain.app> [carpeta-salida]
#
# Solo en un runner desechable de GitHub Actions (macos-15): monta el .dmg, copia Arbrain.app a una carpeta temporal,
# la lanza con HOME temporal y SIN Node (renombra con sudo los `node` del sistema y los quita del PATH), descubre los
# puertos de la app (daemon.json de su carpeta de datos o los sockets en escucha de su árbol de procesos) y comprueba
# el contrato del daemon como Linux y Windows: v2 = daemon `GET /vivo` 200 y /health 401 sin token; Next /api/version
# 200 y `/` sin la entrada de la app → /sin-sesion 200 (o 401/403). Falla si algo escucha fuera de localhost. Caos:
# mata con -9 el daemon y el Next y la app debe levantarlos en el mismo puerto en < 60 s (SMOKE_CAOS=0 lo apaga).
# Captura con screencapture. Imprime «SMOKE OK (...)» o «SMOKE FALLO: <motivo>» y sale 0 o 1.
#
# Nunca en la Mac de Daniel: lanza una app con ventana, renombra node con sudo y toma capturas de pantalla.
set -uo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "smoke-mac.sh solo corre en macOS (runner de CI)."; exit 2; }
[ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${SMOKE_MAC_DESECHABLE:-0}" = "1" ] || {
  echo "smoke-mac.sh solo corre en un runner desechable (GITHUB_ACTIONS=true o SMOKE_MAC_DESECHABLE=1), nunca en una Mac en uso."; exit 2; }
ARTEFACTO=${1:?uso: smoke-mac.sh <dmg|app> [salida]}
SALIDA=${2:-${SMOKE_SALIDA:-$PWD/smoke-salida}}
ESPERA=${SMOKE_ESPERA_S:-180}
mkdir -p "$SALIDA"; SALIDA=$(cd "$SALIDA" && pwd)
ARTEFACTO=$(cd "$(dirname "$ARTEFACTO")" && pwd)/$(basename "$ARTEFACTO")
LOG_APP="$SALIDA/app.log"; REPORTE="$SALIDA/reporte.txt"; : > "$REPORTE"

di() { echo "$*" | tee -a "$REPORTE"; }
PID_APP=; MONTAJE=; OCULTOS=()
descendientes() { # $1 pid → él y todos sus descendientes
  local cola=("$1") p h
  while [ ${#cola[@]} -gt 0 ]; do
    p=${cola[0]}; cola=("${cola[@]:1}"); echo "$p"
    for h in $(pgrep -P "$p" 2>/dev/null); do cola+=("$h"); done
  done
}
procesos_app() { [ -n "$PID_APP" ] && kill -0 "$PID_APP" 2>/dev/null && descendientes "$PID_APP"; }
escuchas_app() { # «puerto dirección» de cada socket TCP en escucha del árbol de la app
  local pids; pids=$(procesos_app | paste -sd, -)
  [ -n "$pids" ] || return 0
  lsof -nP -a -iTCP -sTCP:LISTEN -p "$pids" 2>/dev/null | awk 'NR>1{n=split($9,a,":"); print a[n], $9}' | sort -u
}
captura() { screencapture -x "$SALIDA/captura-${1:-ventana}.png" 2>/dev/null && di "captura: $SALIDA/captura-${1:-ventana}.png" || di "aviso: screencapture falló"; }
limpiar() {
  for p in $(procesos_app | sort -rn); do kill -KILL "$p" 2>/dev/null; done
  [ -n "$MONTAJE" ] && hdiutil detach "$MONTAJE" -quiet 2>/dev/null
  for n in "${OCULTOS[@]+"${OCULTOS[@]}"}"; do sudo mv "$n.oculto-smoke" "$n" 2>/dev/null; done
}
trap limpiar EXIT
fallo() {
  captura fallo || true
  if [ -n "${APP:-}" ]; then  # diagnóstico: qué vio la app de su propio paquete
    di "--- diagnóstico del paquete ---"
    di "ejecutable vivo: $(ps -o command= -p "$PID_APP" 2>/dev/null || echo '(ya no)')"
    ls -la "$APP/Contents/Resources" 2>&1 | sed 's/^/  /' | tee -a "$REPORTE" >/dev/null
    ls -la "$APP/Contents/Resources/daemon/dist/index.js" "$APP/Contents/MacOS" 2>&1 | sed 's/^/  /' | tee -a "$REPORTE" >/dev/null
    di "xattr: $(xattr "$APP" 2>/dev/null | tr '\n' ' ')"
  fi
  di ""; di "SMOKE FALLO: $*"
  [ -s "$LOG_APP" ] && { echo "--- últimas líneas de la app ---"; tail -n 80 "$LOG_APP"; }
  exit 1
}

di "== Smoke macOS: $(basename "$ARTEFACTO") ($(uname -m), macOS $(sw_vers -productVersion))"

# 1. HOME temporal: Tauri resuelve ~/Library/Application Support/<identificador> desde $HOME.
# Ruta física (pwd -P): en macOS /tmp es un enlace a /private/tmp y Tauri se niega a resolver current_exe() con un
# enlace en la ruta (StartingBinary, sin «process-relaunch-dangerous-allow-symlink-macos») → resource_dir() falla y la
# app dice «falta resources/daemon» aunque el paquete esté completo (runs 38327749337 y 38330616257, 12 oct). Un alumno
# la instala en /Applications, sin enlaces.
HOME_ALUMNO=$(cd "$(mktemp -d /tmp/arbrain-alumno-home.XXXX)" && pwd -P)
mkdir -p "$HOME_ALUMNO/Library/Application Support" "$HOME_ALUMNO/Library/Caches" "$HOME_ALUMNO/Library/Logs"
export HOME="$HOME_ALUMNO"
di "HOME temporal: $HOME_ALUMNO"

# 2. Montar el .dmg y copiar la app (como la arrastraría el alumno a Aplicaciones).
APPS="$HOME_ALUMNO/Applications"; mkdir -p "$APPS"
case "$ARTEFACTO" in
  *.dmg)
    MONTAJE=$(mktemp -d /tmp/arbrain-dmg.XXXX)
    hdiutil attach "$ARTEFACTO" -nobrowse -readonly -mountpoint "$MONTAJE" -quiet || fallo "hdiutil no montó el .dmg"
    origen=$(find "$MONTAJE" -maxdepth 1 -name '*.app' | head -n1)
    [ -n "$origen" ] || fallo "el .dmg no trae ninguna .app"
    ditto "$origen" "$APPS/$(basename "$origen")" || fallo "no se pudo copiar $(basename "$origen")"
    APP="$APPS/$(basename "$origen")"
    ;;
  *.app) ditto "$ARTEFACTO" "$APPS/$(basename "$ARTEFACTO")"; APP="$APPS/$(basename "$ARTEFACTO")" ;;
  *) fallo "artefacto desconocido: $ARTEFACTO" ;;
esac
EJE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist" 2>/dev/null)
[ -x "$APP/Contents/MacOS/$EJE" ] || fallo "la app no trae su ejecutable ($EJE)"
di "app: $APP ($(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist" 2>/dev/null) $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null))"
codesign -dv "$APP" 2>&1 | grep -E '^(Authority|Signature|TeamIdentifier)' | sed 's/^/  firma: /' | tee -a "$REPORTE" || true

# 3. Sin Node: renombrar los del sistema (runner desechable) y quitar del PATH las carpetas que aún tengan uno.
if [ "${SMOKE_OCULTAR_NODE:-1}" = "1" ]; then
  for n in $( { echo "$PATH" | tr ':' '\n' | sed 's|$|/node|'; printf '%s\n' /usr/local/bin/node /opt/homebrew/bin/node; } | sort -u); do
    [ -e "$n" ] || continue
    sudo mv "$n" "$n.oculto-smoke" && OCULTOS+=("$n") && di "node del sistema oculto: $n"
  done
fi
export PATH=$(echo "$PATH" | tr ':' '\n' | while read -r d; do [ -n "$d" ] && [ ! -x "$d/node" ] && echo "$d"; done | paste -sd: -)
command -v node >/dev/null && fallo "sigue habiendo node en el PATH: $(command -v node)"
di "Node fuera del PATH: ok"

# 4. Lanzar el ejecutable directo (open(1) no hereda HOME).
"$APP/Contents/MacOS/$EJE" >"$LOG_APP" 2>&1 &
PID_APP=$!
di "app lanzada (pid $PID_APP)"

# 5. Descubrir puertos y comprobar el contrato.
DAEMON_PUERTO=; WEB_PUERTO=; DAEMON_DESC=; WEB_DESC=; DAEMON_RARO=
inicio=$(date +%s)
while [ $(( $(date +%s) - inicio )) -lt "$ESPERA" ]; do
  kill -0 "$PID_APP" 2>/dev/null || fallo "la app terminó sola a los $(( $(date +%s) - inicio )) s"
  estado=$(find "$HOME_ALUMNO/Library/Application Support" -maxdepth 2 -name 'daemon*.json' 2>/dev/null | head -n1)
  extra=
  [ -n "$estado" ] && extra=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); p=d.get("port") or d.get("puerto"); print(p or "")' "$estado" 2>/dev/null)
  while read -r puerto _dir; do
    [ -n "$puerto" ] || continue
    [ "$puerto" = "$DAEMON_PUERTO" ] || [ "$puerto" = "$WEB_PUERTO" ] && continue
    vivo=$(curl -s -m 5 -w '\n%{http_code}' "http://127.0.0.1:$puerto/vivo" || true)
    vivo_cod=${vivo##*$'\n'}; vivo_cuerpo=${vivo%$'\n'*}
    salud=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$puerto/health" || true)
    if [ "$vivo_cod" = "200" ] && echo "$vivo_cuerpo" | grep -q '"ok": *true'; then
      if [ "$salud" = "401" ]; then DAEMON_PUERTO=$puerto; DAEMON_DESC="/vivo 200, /health 401 sin token"; di "daemon en :$puerto → /vivo 200 · /health sin token 401"
      else DAEMON_RARO="$puerto (/vivo 200 pero /health $salud sin token)"; fi
      continue
    fi
    [ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$puerto/api/version" || true)" = "200" ] || continue
    jar=$(mktemp)
    web=$(curl -s -m 20 -L -c "$jar" -b "$jar" -o "$SALIDA/inicio.html" -w '%{http_code} %{url_effective}' "http://127.0.0.1:$puerto/" || true)
    if { [ "${web%% *}" = "200" ] && grep -qi '<html' "$SALIDA/inicio.html"; } || [ "${web%% *}" = "401" ] || [ "${web%% *}" = "403" ]; then
      WEB_PUERTO=$puerto; WEB_DESC="/api/version 200, / sin la entrada → ${web%% *}"; di "Next en :$puerto → /api/version 200 · / sin la entrada → ${web%% *} en ${web#* }"
    fi
  done < <(escuchas_app; [ -n "$extra" ] && echo "$extra 127.0.0.1:$extra")
  [ -n "$DAEMON_PUERTO" ] && [ -n "$WEB_PUERTO" ] && break
  sleep 2
done

di "sockets en escucha de la app:"; escuchas_app | sed 's/^/  /' | tee -a "$REPORTE"
fuera=$(escuchas_app | awk '{print $2}' | grep -vE '^(127\.0\.0\.1|\[::1\]|::1|localhost):' || true)
[ -z "$fuera" ] || fallo "la app escucha fuera de localhost: $(echo "$fuera" | tr '\n' ' ')"
sleep 3; captura ventana || true
[ -n "$WEB_PUERTO" ] || fallo "Next no contestó en ningún puerto de la app en ${ESPERA}s"
[ -n "$DAEMON_PUERTO" ] || fallo "${DAEMON_RARO:+daemon en :$DAEMON_RARO}${DAEMON_RARO:-ningún proceso de la app responde /vivo en ${ESPERA}s}"

# 6. Caos: matar daemon y Next con -9; la app los levanta sola en el mismo puerto en < 60 s.
pid_en_puerto() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n1; }
CAOS=
if [ "${SMOKE_CAOS:-1}" = "1" ]; then
  for objetivo in "daemon $DAEMON_PUERTO /vivo" "web $WEB_PUERTO /api/version"; do
    set -- $objetivo
    pid=$(pid_en_puerto "$2"); [ -n "$pid" ] || fallo "caos: no encontré el proceso del $1 en :$2"
    kill -9 "$pid" 2>/dev/null || true
    t0=$SECONDS; s=
    while [ $((SECONDS - t0)) -lt 60 ]; do
      nuevo=$(pid_en_puerto "$2")
      if [ -n "$nuevo" ] && [ "$nuevo" != "$pid" ] && [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$2$3" || true)" = 200 ]; then s=$((SECONDS - t0)); break; fi
      sleep 1
    done
    [ -n "$s" ] || fallo "caos: mataron el $1 (pid $pid) y la app no lo levantó en :$2 en 60 s"
    di "caos: $1 (pid $pid) muerto con -9 → de vuelta en :$2 en ${s}s"; CAOS="$CAOS $1 ${s}s"
  done
fi

di ""
di "SMOKE OK (mac $(uname -m): daemon :$DAEMON_PUERTO $DAEMON_DESC; Next :$WEB_PUERTO $WEB_DESC; sin node en PATH${CAOS:+; caos:$CAOS})"
