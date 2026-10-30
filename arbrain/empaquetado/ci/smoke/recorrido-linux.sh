#!/usr/bin/env bash
# Recorrido completo del .deb YA INSTALADO (smoke-instaladores.yml, 13 oct 2026).
#
#   recorrido-linux.sh <arbrain.deb> [carpeta-salida]
#
# Corre DESPUÉS de smoke-linux.sh (que instala con apt y prueba daemon, Next, localhost y caos). Aquí, como un
# escritorio Ubuntu de verdad: Xvfb + gestor de ventanas (openbox) + sesión D-Bus + GNOME Keyring desbloqueado (el
# llavero Secret Service que usa la app) + bus de accesibilidad. Luego:
#   1. lanza la app con HOME/XDG temporales y espera su ventana;
#   2. recorrido.py --motor atspi: primer arranque con dos llaves FALSAS (canarios), capturas y duración por paso;
#   3. cierra la ventana como una persona (wmctrl -c) y mide si todo el árbol de procesos se va;
#   4. huella_secretos.py: ningún canario en texto plano en disco (HOME temporal, /tmp, /var/tmp, instalación, HOME real);
#   5. el llavero tiene las entradas (atributos, sin valores);
#   6. apt-get remove + purge y revisa restos.
# Escribe recorrido-linux.json y tiempos.json; imprime «RECORRIDO-LINUX OK» o «RECORRIDO-LINUX FALLO: …».
# Solo en un runner, contenedor o VM desechable.
set -uo pipefail
[ "$(uname -s)" = "Linux" ] || { echo "recorrido-linux.sh solo corre en Linux desechable."; exit 2; }
DEB=${1:?uso: recorrido-linux.sh <deb> [salida]}
SALIDA=${2:-$PWD/recorrido-salida}
AQUI=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$SALIDA"; SALIDA=$(cd "$SALIDA" && pwd)
REPORTE="$SALIDA/reporte.txt"; : > "$REPORTE"
di() { echo "$*" | tee -a "$REPORTE"; }
FALLOS=(); AVISOS=(); declare -A T
medir_ini() { _t0=$(date +%s.%N); }
medir_fin() { T[$1]=$(python3 -c "print(round($(date +%s.%N)-$_t0,1))"); }

PAQUETE=$(dpkg-deb -f "$DEB" Package)
BIN=$(dpkg -L "$PAQUETE" 2>/dev/null | grep -E '^/usr/bin/[^/]+$' | head -n1)
[ -x "${BIN:-}" ] || { di "RECORRIDO-LINUX FALLO: $PAQUETE no está instalado (¿corrió smoke-linux.sh antes?)"; exit 1; }
di "== Recorrido Linux: $PAQUETE → $BIN ($(uname -m), $(. /etc/os-release && echo "$PRETTY_NAME"))"
dpkg -L "$PAQUETE" | grep -vE '^/usr/share/(doc|icons|applications)' > "$SALIDA/archivos-paquete.txt"
INSTALACION=$(dpkg -L "$PAQUETE" | grep -E '^/usr/lib/[^/]+$' | head -n1)

HOME_REAL=$HOME
HOME_ALUMNO=$(mktemp -d /tmp/arbrain-recorrido-home.XXXX)
export HOME="$HOME_ALUMNO" XDG_CONFIG_HOME="$HOME_ALUMNO/.config" XDG_DATA_HOME="$HOME_ALUMNO/.local/share" \
  XDG_CACHE_HOME="$HOME_ALUMNO/.cache" XDG_STATE_HOME="$HOME_ALUMNO/.local/state" XDG_RUNTIME_DIR="$HOME_ALUMNO/.run"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
DESDE=$(( $(date +%s) - 5 ))

Xvfb :98 -screen 0 1600x1000x24 -nolisten tcp >"$SALIDA/xvfb.log" 2>&1 &
PID_XVFB=$!
export DISPLAY=:98
sleep 2
openbox </dev/null >"$SALIDA/openbox.log" 2>&1 &
PID_WM=$!
sleep 1
limpiar() { kill "$PID_WM" "$PID_XVFB" 2>/dev/null; }
trap limpiar EXIT

# Canarios: llaves falsas con formato válido. Solo las recibe el proceso de Python, nunca la app.
al() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }
CAN_A="sk-""ant-api03-smoke$(al 40)"
CAN_O="sk-""or-v1-smoke$(al 48 | tr 'A-Z' 'a-z')"

MARCA="arbrain-recorrido-$$-$RANDOM"
# «Conectar con OpenRouter» abre el navegador del sistema (xdg-open). Aquí un navegador falso anota la URL y nada más:
# un Chrome de verdad en el runner tapa la ventana y se queda con el teclado.
NAVEGADOR="$HOME_ALUMNO/.navegador-falso"
printf '#!/bin/sh\necho "$1" >> "%s"\n' "$HOME_ALUMNO/navegador-url.txt" > "$NAVEGADOR"; chmod +x "$NAVEGADOR"
mkdir -p "$HOME_ALUMNO/bin"; cp "$NAVEGADOR" "$HOME_ALUMNO/bin/xdg-open"  # xdg-open respeta el navegador por defecto del runner
export BROWSER="$NAVEGADOR" RECORRIDO_NAVEGADOR_LOG="$HOME_ALUMNO/navegador-url.txt" PATH="$HOME_ALUMNO/bin:$PATH"
export SALIDA AQUI BIN MARCA CAN_A CAN_O
# Todo lo que necesita la misma sesión D-Bus (llavero, accesibilidad, app y conductor) corre dentro de dbus-run-session.
dbus-run-session -- bash -s <<'DENTRO' 2>&1 | tee -a "$SALIDA/sesion.log"
set -uo pipefail
di() { echo "$*" | tee -a "$SALIDA/reporte.txt"; }
procesos_app() { for p in /proc/[0-9]*; do tr '\0' '\n' < "$p/environ" 2>/dev/null | grep -qx "SMOKE_MARCA=$MARCA" && echo "${p#/proc/}"; done; }
ahora() { date +%s.%N; }
dur() { python3 -c "print(round($(ahora)-$1,1))"; }
: > "$SALIDA/tiempos-dentro.txt"

# GNOME Keyring con la colección «login» creada y desbloqueada (como tras iniciar sesión en Ubuntu).
eval "$(printf 'smoke' | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)"
eval "$(gnome-keyring-daemon --start --components=secrets 2>/dev/null)"
export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK 2>/dev/null
if printf 'x' | secret-tool store --label='prueba del recorrido' recorrido prueba 2>/dev/null && [ "$(secret-tool lookup recorrido prueba 2>/dev/null)" = x ]; then
  di "llavero (Secret Service): disponible y desbloqueado"; secret-tool clear recorrido prueba 2>/dev/null
else di "aviso: el llavero de prueba no quedó usable"; fi

# Accesibilidad: el bus AT-SPI (lo usa recorrido.py para leer la pantalla; xdotool hace los clics y el teclado).
/usr/libexec/at-spi-bus-launcher --launch-immediately </dev/null >/dev/null 2>&1 &
sleep 1
unset NO_AT_BRIDGE
export GTK_A11Y=atspi WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1

t=$(ahora)
SMOKE_MARCA="$MARCA" setsid "$BIN" </dev/null >"$SALIDA/app.log" 2>&1 &
PID_APP=$!
ventana=$(timeout 90 xdotool search --sync --onlyvisible --name '^Arbrain' 2>/dev/null | head -n1)
echo "lanzar_y_ventana $(dur "$t")" >> "$SALIDA/tiempos-dentro.txt"
if [ -n "$ventana" ]; then
  xdotool windowactivate "$ventana" 2>/dev/null; xdotool windowsize "$ventana" 1440 920 2>/dev/null; xdotool windowmove "$ventana" 0 0 2>/dev/null
  di "ventana: '$(xdotool getwindowname "$ventana")' (id $ventana)"
else di "FALLO: la app no mostró ventana en 90 s"; echo "FALLO ventana" >> "$SALIDA/fallos-dentro.txt"; fi

t=$(ahora)
RECORRIDO_CANARIO_ANTHROPIC="$CAN_A" RECORRIDO_CANARIO_OPENROUTER="$CAN_O" \
  timeout 1500 /usr/bin/python3 -I "$AQUI/recorrido.py" --motor atspi --salida "$SALIDA" </dev/null 2>&1 | tee "$SALIDA/recorrido.log"
[ "${PIPESTATUS[0]}" = 0 ] || echo "FALLO recorrido del primer arranque (ver recorrido.json)" >> "$SALIDA/fallos-dentro.txt"
echo "recorrido_primer_arranque $(dur "$t")" >> "$SALIDA/tiempos-dentro.txt"

# El llavero tiene las entradas de Arbrain (solo atributos; nunca la línea «secret =»).
timeout 20 secret-tool search --all service ai.arbrain.app 2>/dev/null | grep -vE '^secret *=' > "$SALIDA/llavero.txt" || true
# (keyring-rs: service = ai.arbrain.app, username = nombre de la llave)
di "llavero tras el recorrido: $(grep -c '^\[' "$SALIDA/llavero.txt" 2>/dev/null || echo 0) entrada(s)"

# Cerrar como una persona (el gestor de ventanas manda WM_DELETE_WINDOW). Todo el árbol debe irse solo.
antes=$(procesos_app | tr '\n' ' ')
di "procesos antes de cerrar: $antes"
t=$(ahora)
wmctrl -c Arbrain 2>/dev/null || xdotool search --name '^Arbrain' windowclose 2>/dev/null
for _ in $(seq 1 50); do [ -z "$(procesos_app)" ] && break; sleep 0.5; done
echo "cerrar_ventana $(dur "$t")" >> "$SALIDA/tiempos-dentro.txt"
quedan=$(for p in $(procesos_app); do echo "$(cat /proc/$p/comm 2>/dev/null)#$p"; done | tr '\n' ' ')
if [ -n "$quedan" ]; then
  if echo "$quedan" | grep -q node; then echo "FALLO tras cerrar la ventana siguen vivos en 25 s: $quedan" >> "$SALIDA/fallos-dentro.txt"
  else echo "AVISO tras cerrar la ventana siguen vivos en 25 s: $quedan" >> "$SALIDA/fallos-dentro.txt"; fi
  for p in $(procesos_app); do kill -KILL "$p" 2>/dev/null; done
else di "cerrar la ventana: todo el árbol se fue"; fi
gnome-keyring-daemon -r -d >/dev/null 2>&1; pkill -u "$(id -u)" -f gnome-keyring-daemon 2>/dev/null || true
DENTRO

while read -r k v; do [ -n "$k" ] && T[$k]=$v; done < "$SALIDA/tiempos-dentro.txt"
while read -r tipo resto; do
  case "$tipo" in FALLO) FALLOS+=("$resto") ;; AVISO) AVISOS+=("$resto") ;; esac
done < <(cat "$SALIDA/fallos-dentro.txt" 2>/dev/null)

# Logs de la app.
mkdir -p "$SALIDA/logs-app"
find "$HOME_ALUMNO" -path '*ai.arbrain.app/logs/*.log' -type f -exec cp {} "$SALIDA/logs-app/" \; 2>/dev/null
(cd "$HOME_ALUMNO" && find . -type f | sort) > "$SALIDA/archivos-perfil.txt"

# Ningún secreto en texto plano en disco.
medir_ini
RECORRIDO_CANARIO_ANTHROPIC="$CAN_A" RECORRIDO_CANARIO_OPENROUTER="$CAN_O" sudo -E /usr/bin/python3 -I "$AQUI/huella_secretos.py" \
  --desde "$DESDE" --salida "$SALIDA/secretos.json" "$HOME_ALUMNO" /tmp /var/tmp ${INSTALACION:+"$INSTALACION"} "$HOME_REAL" /root 2>&1 | tee -a "$REPORTE"
[ "${PIPESTATUS[0]}" = 0 ] || FALLOS+=("hay llaves en texto plano en disco (ver secretos.json)")
sudo chown "$(id -u)" "$SALIDA/secretos.json" 2>/dev/null
medir_fin buscar_secretos

# Desinstalar (remove y purge) y revisar restos.
medir_ini
sudo apt-get remove -y "$PAQUETE" >"$SALIDA/apt-remove.log" 2>&1; COD_REMOVE=$?
sudo apt-get purge -y "$PAQUETE" >>"$SALIDA/apt-remove.log" 2>&1
medir_fin desinstalar
RESTOS=$(while read -r f; do [ -f "$f" ] && echo "$f"; done < "$SALIDA/archivos-paquete.txt" | head -20)
ESTADO=$(dpkg-query -W -f='${Status}' "$PAQUETE" 2>/dev/null || echo "no instalado")
di "desinstalar: apt remove $COD_REMOVE en ${T[desinstalar]} s · estado dpkg: $ESTADO · binario sigue: $([ -e "$BIN" ] && echo sí || echo no) · restos: $(echo -n "$RESTOS" | grep -c . || true)"
[ "$COD_REMOVE" = 0 ] || FALLOS+=("apt-get remove salió con $COD_REMOVE")
[ -e "$BIN" ] && FALLOS+=("la desinstalación dejó $BIN")
[ -n "$RESTOS" ] && FALLOS+=("la desinstalación dejó archivos del paquete: $(echo "$RESTOS" | head -3 | tr '\n' ' ')")

python3 - "$SALIDA" <<PY
import json, sys
s = sys.argv[1]
t = {$(for k in "${!T[@]}"; do printf '"%s": %s, ' "$k" "${T[$k]}"; done)}
json.dump(t, open(f"{s}/tiempos.json", "w"), indent=2)
json.dump({"tiempos": t, "fallos": $(printf '%s\n' "${FALLOS[@]+"${FALLOS[@]}"}" | python3 -c 'import json,sys; print(json.dumps([l for l in sys.stdin.read().splitlines() if l]))'),
           "avisos": $(printf '%s\n' "${AVISOS[@]+"${AVISOS[@]}"}" | python3 -c 'import json,sys; print(json.dumps([l for l in sys.stdin.read().splitlines() if l]))'),
           "estado_dpkg_tras_purge": "$ESTADO"}, open(f"{s}/recorrido-linux.json", "w"), ensure_ascii=False, indent=2)
PY
for a in "${AVISOS[@]+"${AVISOS[@]}"}"; do di "aviso: $a"; done
if [ ${#FALLOS[@]} -gt 0 ]; then di "RECORRIDO-LINUX FALLO: $(IFS='; '; echo "${FALLOS[*]}")"; exit 1; fi
di "RECORRIDO-LINUX OK"
