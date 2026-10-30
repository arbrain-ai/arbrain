#!/usr/bin/env bash
# Smoke del artefacto de Linux (carril F, empaquetado alumno, 11 oct 2026).
#
#   smoke-linux.sh <Arbrain.AppImage | arbrain.deb> [carpeta-salida]
#
# Lanza la app instalada como la vería un alumno sin nada previo: HOME temporal (y XDG_* dentro), Node fuera del PATH
# (y, con SMOKE_OCULTAR_NODE=1 en CI, los node del sistema renombrados para que el lanzador no los encuentre por ruta
# absoluta), bajo Xvfb. Espera a que la app levante su Next y su daemon, descubre sus puertos (archivo de estado del
# contrato si existe; si no, los sockets que escuchan los procesos de la app) y comprueba el daemon y Next según el
# contrato del daemon: v2 (secretos en memoria) = daemon `GET /vivo` 200 y /health 401 sin token, Next /api/version 200
# y `/` sin la entrada de la app → /sin-sesion 200 (o 401/403); v1 (secretos en archivo) = /health 200 con token y
# página inicial 200 con la entrada. Comprueba que nada escucha fuera de localhost y guarda una captura de la ventana.
# Imprime «SMOKE OK» o «SMOKE FALLO: <motivo>» y sale 0 o 1.
#
# Variables:
#   SMOKE_ESPERA_S        espera máxima por servicio (180)
#   SMOKE_OCULTAR_NODE    1 = renombra con sudo los `node` del sistema durante la prueba (solo en runners desechables)
#   SMOKE_DAEMON_TOKEN    token del daemon (contrato v1: archivo `daemon-token` de la carpeta de configuración de la
#                         app). En v2 no hay archivo: el daemon se reconoce por `GET /vivo` 200 y /health 401 sin token.
#   SMOKE_ESTADO_GLOB     patrón extra de archivo de estado (relativo al HOME temporal), p. ej. '.config/*/daemon.json'
#   SMOKE_DESKTOP_SECRET  secreto de la app para su entrada (v1: archivo `desktop-secret`). En v2 se comprueba que Next
#                         sirve y que sin la entrada `/` lleva a /sin-sesion (o 401/403); la captura muestra la ventana.
#   SMOKE_ACEPTAR_401     1 = un /health 401 (daemon vivo, token desconocido) cuenta como aviso y no como fallo
set -uo pipefail

# Solo Linux desechable (runner de CI, contenedor o VM): lanza una app con ventana, oculta node con sudo e instala .deb.
[ "$(uname -s)" = "Linux" ] || { echo "smoke-linux.sh solo corre en Linux (runner, contenedor o VM), nunca en una Mac en uso."; exit 2; }
ARTEFACTO=${1:?uso: smoke-linux.sh <AppImage|deb> [salida]}
SALIDA=${2:-${SMOKE_SALIDA:-$PWD/smoke-salida}}
ESPERA=${SMOKE_ESPERA_S:-180}
mkdir -p "$SALIDA"
SALIDA=$(cd "$SALIDA" && pwd)
ARTEFACTO=$(cd "$(dirname "$ARTEFACTO")" && pwd)/$(basename "$ARTEFACTO")
LOG_APP="$SALIDA/app.log"
REPORTE="$SALIDA/reporte.txt"
: > "$REPORTE"

di() { echo "$*" | tee -a "$REPORTE"; }
PID_APP=; PID_XVFB=; OCULTOS=()
limpiar() {
  [ -n "$PID_APP" ] && { pkill -TERM -s "$PID_APP" 2>/dev/null; kill "$PID_APP" 2>/dev/null; sleep 2; pkill -KILL -s "$PID_APP" 2>/dev/null; }
  for p in $(procesos_app); do kill -KILL "$p" 2>/dev/null; done
  [ -n "$PID_XVFB" ] && kill "$PID_XVFB" 2>/dev/null
  for n in "${OCULTOS[@]+"${OCULTOS[@]}"}"; do sudo mv "$n.oculto-smoke" "$n" 2>/dev/null; done
}
trap limpiar EXIT
fallo() {
  captura "fallo" || true
  di ""; di "SMOKE FALLO: $*"
  if [ -s "$LOG_APP" ]; then echo "--- últimas líneas de la app ---"; tail -n 80 "$LOG_APP"; fi
  exit 1
}

MARCA="arbrain-smoke-$$-$RANDOM"
# Procesos de la app: todos los que heredaron la marca en su entorno (Tauri, Next y daemon heredan el entorno).
procesos_app() {
  local p
  for p in /proc/[0-9]*; do
    tr '\0' '\n' < "$p/environ" 2>/dev/null | grep -qx "SMOKE_MARCA=$MARCA" && echo "${p#/proc/}"
  done
}
# «puerto dirección» de cada socket TCP en escucha de los procesos de la app.
escuchas_app() {
  local pids; pids=$(procesos_app | tr '\n' '|'); pids=${pids%|}
  [ -n "$pids" ] || return 0
  ss -ltnpH 2>/dev/null | grep -E "pid=($pids)," | awk '{n=split($4,a,":"); print a[n], $4}' | sort -u
}
captura() {
  local nombre="captura-${1:-ventana}.png"
  [ -n "${DISPLAY:-}" ] || return 1
  if command -v import >/dev/null; then import -display "$DISPLAY" -window root "$SALIDA/$nombre" 2>/dev/null && { di "captura: $SALIDA/$nombre"; return 0; }; fi
  if command -v xwd >/dev/null && command -v convert >/dev/null; then
    xwd -display "$DISPLAY" -root -silent | convert xwd:- "$SALIDA/$nombre" 2>/dev/null && { di "captura: $SALIDA/$nombre"; return 0; }
  fi
  di "aviso: no se pudo capturar (falta imagemagick o x11-apps)"; return 1
}

di "== Smoke Linux: $(basename "$ARTEFACTO") ($(uname -m), $(. /etc/os-release && echo "$PRETTY_NAME"))"

# 1. Entorno limpio: HOME temporal y XDG dentro de él (Tauri usa XDG para app_data_dir y app_config_dir).
HOME_ALUMNO=$(mktemp -d /tmp/arbrain-alumno-home.XXXX)
export HOME="$HOME_ALUMNO" XDG_CONFIG_HOME="$HOME_ALUMNO/.config" XDG_DATA_HOME="$HOME_ALUMNO/.local/share" \
  XDG_CACHE_HOME="$HOME_ALUMNO/.cache" XDG_STATE_HOME="$HOME_ALUMNO/.local/state"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
di "HOME temporal: $HOME_ALUMNO"

# 2. Instalar o preparar el artefacto ANTES de quitar Node (apt y dpkg no lo necesitan, pero así el orden es claro).
case "$ARTEFACTO" in
  *.AppImage)
    chmod +x "$ARTEFACTO"
    LANZAR=("$ARTEFACTO")
    export APPIMAGE_EXTRACT_AND_RUN=1  # sin FUSE en el runner
    ;;
  *.deb)
    # Las dependencias del .deb (webkit2gtk, bubblewrap, socat, libdbus…) vienen del repositorio: sin índices de apt
    # (contenedores que los borran) no se pueden resolver.
    if [ -z "$(ls -A /var/lib/apt/lists 2>/dev/null | grep -v -e '^lock$' -e '^partial$' -e '^auxfiles$')" ]; then
      sudo apt-get update >"$SALIDA/apt-update.log" 2>&1 || di "aviso: apt-get update falló (ver apt-update.log)"
    fi
    sudo apt-get install -y "$ARTEFACTO" >"$SALIDA/apt-install.log" 2>&1 || { tail -n 30 "$SALIDA/apt-install.log"; fallo "apt no instaló el .deb"; }
    paquete=$(dpkg-deb -f "$ARTEFACTO" Package)
    # El .deb trae también el Node embebido (/usr/bin/arbrain-node): dpkg -L no garantiza orden y lanzar ese Node
    # sale a los 3 s (falso «la app terminó sola», 21 oct 2026). Se elige el ejecutable que no es el sidecar.
    binario=$(dpkg -L "$paquete" | grep -E '^/usr/bin/[^/]+$' | grep -v -E '/[^/]*-node$' | head -n1)
    [ -x "$binario" ] || fallo "el .deb ($paquete) no instaló un ejecutable en /usr/bin"
    di ".deb instalado: $paquete → $binario (depende de: $(dpkg-deb -f "$ARTEFACTO" Depends))"
    LANZAR=("$binario")
    ;;
  *) fallo "artefacto desconocido: $ARTEFACTO" ;;
esac

# 3. Sin Node: en CI (SMOKE_OCULTAR_NODE=1) se renombran todos los `node` del sistema, incluidos los de rutas absolutas que
#    prueba el lanzador (/usr/local/bin/node, /usr/bin/node); después se quitan del PATH las carpetas que aún tengan uno.
if [ "${SMOKE_OCULTAR_NODE:-0}" = "1" ]; then
  candidatos=$( { echo "$PATH" | tr ':' '\n' | sed 's|$|/node|'; printf '%s\n' /usr/local/bin/node /usr/bin/node /opt/homebrew/bin/node; } | sort -u)
  for n in $candidatos; do
    [ -e "$n" ] || continue
    sudo mv "$n" "$n.oculto-smoke" && OCULTOS+=("$n") && di "node del sistema oculto: $n"
  done
fi
PATH_LIMPIO=$(echo "$PATH" | tr ':' '\n' | while read -r d; do [ -n "$d" ] && [ ! -x "$d/node" ] && echo "$d"; done | paste -sd: -)
export PATH="$PATH_LIMPIO"
if command -v node >/dev/null; then fallo "sigue habiendo node en el PATH: $(command -v node)"; fi
for n in /usr/local/bin/node /usr/bin/node; do [ -x "$n" ] && di "aviso: $n existe (el lanzador podría usarlo por ruta absoluta; en CI usa SMOKE_OCULTAR_NODE=1)"; done
di "Node fuera del PATH: ok"

# 4. Pantalla virtual (si no hay DISPLAY) para la ventana y la captura.
if [ -z "${DISPLAY:-}" ]; then
  command -v Xvfb >/dev/null || fallo "falta Xvfb (apt install xvfb)"
  Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >"$SALIDA/xvfb.log" 2>&1 &
  PID_XVFB=$!; export DISPLAY=:99; sleep 2
fi
# WebKitGTK sin GPU en el runner.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 NO_AT_BRIDGE=1

# 5. Lanzar. setsid: la app queda como líder de su sesión y se limpia entera al final.
lanzador=()
command -v dbus-run-session >/dev/null && lanzador=(dbus-run-session --)
SMOKE_MARCA="$MARCA" setsid ${lanzador[@]+"${lanzador[@]}"} "${LANZAR[@]}" >"$LOG_APP" 2>&1 &
PID_APP=$!
di "app lanzada (pid $PID_APP): ${LANZAR[*]}"

# 6. Descubrir puertos. Primero un archivo de estado del contrato (si la app lo escribe); si no, los sockets en escucha.
leer_estado() {
  local f
  local patrones=("${SMOKE_ESTADO_GLOB:-}" '.config/*/daemon*.json' '.local/share/*/daemon*.json' '.config/*/estado*.json' '.local/share/*/estado*.json' '.config/arbrain/*.json')
  shopt -s nullglob
  for g in "${patrones[@]}"; do
    [ -n "$g" ] || continue
    for f in "$HOME_ALUMNO"/$g; do
      python3 - "$f" <<'PY' && return 0
import json, re, sys
try: d = json.load(open(sys.argv[1]))
except Exception: sys.exit(1)
plano = {}
def recorrer(x, pre=""):
    if isinstance(x, dict):
        for k, v in x.items(): recorrer(v, f"{pre}{k}.".lower())
    else: plano[pre.rstrip(".")] = x
recorrer(d)
puerto = next((v for k, v in plano.items() if re.search(r"(daemon|claudeclaw|servidor).*(port|puerto)|^(port|puerto)$", k) and str(v).isdigit()), None)
url = next((v for k, v in plano.items() if re.search(r"(daemon|claudeclaw).*url|^url$", k) and isinstance(v, str)), None)
token = next((v for k, v in plano.items() if re.search(r"token", k) and isinstance(v, str)), None)
if not (puerto or url): sys.exit(1)
if url and not puerto:
    m = re.search(r":(\d+)", url); puerto = m and m.group(1)
print(f"ESTADO_ARCHIVO={sys.argv[1]}"); print(f"ESTADO_PUERTO={puerto}"); print(f"ESTADO_TOKEN={token or ''}")
PY
    done
  done
  return 1
}

DAEMON_PUERTO=; WEB_PUERTO=; WEB_SIN_INICIO=; TOKEN=${SMOKE_DAEMON_TOKEN:-}; DAEMON_401=; DAEMON_RARO=; DAEMON_DESC=; WEB_DESC=
inicio=$(date +%s)
while [ $(( $(date +%s) - inicio )) -lt "$ESPERA" ]; do
  if ! kill -0 "$PID_APP" 2>/dev/null && [ -z "$(procesos_app)" ]; then fallo "la app terminó sola a los $(( $(date +%s) - inicio )) s"; fi
  # v1: token por instalación en app_config_dir/daemon-token (0600). En v2 no existe (por apertura, en memoria).
  if [ -z "$TOKEN" ]; then
    ft=$(find "$HOME_ALUMNO" -maxdepth 4 -type f -name 'daemon-token' 2>/dev/null | head -n1)
    [ -n "$ft" ] && TOKEN=$(tr -d ' \n\r' < "$ft") && di "token del daemon: leído de $ft (${#TOKEN} caracteres)"
  fi
  if [ -z "${ESTADO_ARCHIVO:-}" ] && estado=$(leer_estado); then
    eval "$(echo "$estado" | grep -E '^ESTADO_(ARCHIVO|PUERTO|TOKEN)=' | sed 's/=\(.*\)/="\1"/')"
    di "archivo de estado: $ESTADO_ARCHIVO (puerto $ESTADO_PUERTO)"
    [ -z "$TOKEN" ] && TOKEN=$ESTADO_TOKEN
  fi
  while read -r puerto _dir; do
    [ -n "$puerto" ] || continue
    [ "$puerto" = "$DAEMON_PUERTO" ] || [ "$puerto" = "$WEB_PUERTO" ] && continue
    # Daemon. Contrato v2: `GET /vivo` = 200 sin credencial, y /health sin token = 401 (los tokens viven en memoria de
    # la app y van por stdin; ya no hay archivo que leer). v1: /health 200 con el token del archivo `daemon-token`.
    vivo=$(curl -s -m 5 -w '\n%{http_code}' "http://127.0.0.1:$puerto/vivo" || true)
    vivo_cod=${vivo##*$'\n'}; vivo_cuerpo=${vivo%$'\n'*}
    cab=(); [ -n "$TOKEN" ] && cab=(-H "Authorization: Bearer $TOKEN")
    cuerpo=$(curl -s -m 5 ${cab[@]+"${cab[@]}"} -w '\n%{http_code}' "http://127.0.0.1:$puerto/health" || true)
    codigo=${cuerpo##*$'\n'}; cuerpo=${cuerpo%$'\n'*}
    if [ "$vivo_cod" = "200" ] && echo "$vivo_cuerpo" | grep -q '"ok": *true'; then
      if [ "$codigo" = "200" ] && echo "$cuerpo" | grep -q '"ok"'; then
        DAEMON_PUERTO=$puerto; DAEMON_DESC="/vivo 200, /health 200 con token"; di "daemon en :$puerto → /vivo $vivo_cuerpo · /health 200 $cuerpo"
      elif [ "$codigo" = "401" ] && [ -z "$TOKEN" ]; then
        DAEMON_PUERTO=$puerto; DAEMON_DESC="/vivo 200, /health 401 sin token (contrato ≥ v2)"; di "daemon en :$puerto → /vivo 200 $vivo_cuerpo · /health sin token 401 (protegido; contrato ≥ v2: el token no está en disco)"
      else
        DAEMON_RARO="$puerto (/vivo 200 pero /health $codigo${TOKEN:+ con token})"
      fi
      continue
    fi
    if [ "$codigo" = "200" ] && echo "$cuerpo" | grep -q '"ok"'; then DAEMON_PUERTO=$puerto; DAEMON_401=; DAEMON_DESC="/health 200 (contrato v1)"; di "daemon en :$puerto → /health 200 $cuerpo"; continue; fi
    if [ "$codigo" = "401" ] && echo "$cuerpo" | grep -qi 'unauthorized'; then DAEMON_401=$puerto; continue; fi
    # Next: /api/version contesta 200 sin sesión. v1: la página inicial se pide como la app (/api/desktop/sesion con el
    # secreto del archivo desktop-secret) = 200 con HTML. v2 (secreto en memoria): sin la entrada de la app, `/` debe
    # redirigir a /sin-sesion (200 con HTML) o negar con 401/403: cuenta como servidor arriba y con la puerta cerrada.
    [ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$puerto/api/version" || true)" = "200" ] || continue
    SECRETO=${SMOKE_DESKTOP_SECRET:-$(f=$(find "$HOME_ALUMNO" -maxdepth 4 -type f -name 'desktop-secret' 2>/dev/null | head -n1); [ -n "$f" ] && tr -d ' \n\r' < "$f")}
    if [ -n "$SECRETO" ]; then url="http://127.0.0.1:$puerto/api/desktop/sesion?t=$SECRETO&a=/"; else url="http://127.0.0.1:$puerto/"; fi
    jar=$(mktemp)
    web=$(curl -s -m 20 -L -c "$jar" -b "$jar" -o "$SALIDA/inicio.html" -w '%{http_code} %{url_effective}' "$url" || true)
    if [ -n "$SECRETO" ] && [ "${web%% *}" = "200" ] && grep -qi '<html' "$SALIDA/inicio.html"; then
      WEB_PUERTO=$puerto; WEB_DESC="página inicial 200 con la entrada de la app"; di "Next en :$puerto → página inicial 200 (final ${web#* }; con la entrada de la app)"
    elif [ -z "$SECRETO" ] && { { [ "${web%% *}" = "200" ] && grep -qi '<html' "$SALIDA/inicio.html"; } || [ "${web%% *}" = "401" ] || [ "${web%% *}" = "403" ]; }; then
      WEB_PUERTO=$puerto; WEB_DESC="/api/version 200, / sin la entrada de la app → ${web%% *} ${web#*$puerto}"
      di "Next en :$puerto → /api/version 200 · / sin la entrada de la app → ${web%% *} en ${web#* } (contrato ≥ v2: el secreto no está en disco)"
    else
      WEB_SIN_INICIO="$puerto (${web%% *} en ${web#* }${SECRETO:+, con secreto}${SECRETO:-, sin desktop-secret})"
    fi
  done < <(escuchas_app; [ -n "${ESTADO_PUERTO:-}" ] && echo "$ESTADO_PUERTO 127.0.0.1:$ESTADO_PUERTO")
  [ -n "$DAEMON_PUERTO" ] && [ -n "$WEB_PUERTO" ] && break
  sleep 2
done

di "procesos de la app: $(procesos_app | tr '\n' ' ')"
di "sockets en escucha de la app:"; escuchas_app | sed 's/^/  /' | tee -a "$REPORTE"
# Nada fuera de localhost (AUDITORIA: «nada escucha fuera de localhost»).
fuera=$(escuchas_app | awk '{print $2}' | grep -vE '^(127\.0\.0\.1|\[::1\]|::1|\[::ffff:127\.0\.0\.1\]):' || true)
[ -z "$fuera" ] || fallo "la app escucha fuera de localhost: $(echo "$fuera" | tr '\n' ' ')"

sleep 3; captura "ventana" || true

[ -n "$WEB_PUERTO" ] || fallo "${WEB_SIN_INICIO:+Next contesta en :$WEB_SIN_INICIO pero la página inicial no dio 200}${WEB_SIN_INICIO:-Next no contestó en ningún puerto de la app en ${ESPERA}s}"
if [ -z "$DAEMON_PUERTO" ]; then
  if [ -n "$DAEMON_401" ]; then
    msg="daemon en :$DAEMON_401 da /health 401 y no responde /vivo (contrato v2) ni hay token (v1: daemon-token o SMOKE_DAEMON_TOKEN)"
    if [ "${SMOKE_ACEPTAR_401:-0}" = "1" ]; then di "aviso: $msg"; DAEMON_PUERTO="$DAEMON_401 (401)"; else fallo "$msg"; fi
  elif [ -n "$DAEMON_RARO" ]; then
    fallo "daemon en :$DAEMON_RARO"
  else
    fallo "ningún proceso de la app responde /vivo ni /health en ${ESPERA}s (¿el daemon no viaja con la app o no arrancó?)"
  fi
fi

# 7. Caos (resiliencia, 12 oct 2026; SMOKE_CAOS=0 lo apaga): se mata con -9 el daemon y luego el Next de la app y la
#    app tiene que levantarlos sola en el MISMO puerto en < 60 s (supervisores de src-tauri: daemon.rs y
#    salud_cliente.rs). La prueba local del mensaje que llega una sola vez es arbrain/scripts/caos.sh.
pid_en_puerto() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }
volvio_en() { # $1 puerto · $2 ruta · $3 pid muerto → segundos hasta 200 con un pid nuevo, o vacío
  local t0=$SECONDS
  while [ $((SECONDS - t0)) -lt 60 ]; do
    local nuevo; nuevo=$(pid_en_puerto "$1")
    if [ -n "$nuevo" ] && [ "$nuevo" != "$3" ] && [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2" || true)" = 200 ]; then echo $((SECONDS - t0)); return 0; fi
    sleep 1
  done
}
if [ "${SMOKE_CAOS:-1}" = "1" ] && [[ "$DAEMON_PUERTO" =~ ^[0-9]+$ ]] && [[ "$WEB_PUERTO" =~ ^[0-9]+$ ]]; then
  for objetivo in "daemon $DAEMON_PUERTO /vivo" "web $WEB_PUERTO /api/version"; do
    set -- $objetivo
    pid=$(pid_en_puerto "$2")
    [ -n "$pid" ] || fallo "caos: no encontré el proceso del $1 en :$2"
    kill -9 "$pid" 2>/dev/null || true
    s=$(volvio_en "$2" "$3" "$pid")
    [ -n "$s" ] || fallo "caos: mataron el $1 (pid $pid) y la app no lo levantó en :$2 en 60 s"
    di "caos: $1 (pid $pid) muerto con -9 → la app lo levantó en :$2 en ${s}s"; SMOKE_CAOS_HECHO="${SMOKE_CAOS_HECHO:-; caos:} $1 ${s}s"
  done
  sleep 2; captura "tras-caos" || true
fi

di ""
di "SMOKE OK (linux $(uname -m): daemon :$DAEMON_PUERTO ${DAEMON_DESC:-/health 401 aceptado}; Next :$WEB_PUERTO ${WEB_DESC}; sin node en PATH${SMOKE_CAOS_HECHO:-})"
