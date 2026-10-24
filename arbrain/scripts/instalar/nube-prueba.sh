#!/usr/bin/env bash
# Prueba de punta a punta de la rama servidor (nube.sh) en un Ubuntu REAL con systemd (23 oct 2026, modo espejo N3).
# La corren el workflow e2e-nube.yml de arbrain-ai/e2e-instalacion (runner ubuntu-latest) y el contenedor local de
# docs/builds/modo-espejo-2026-10-23/nube/contenedor.sh. Como root, en una máquina DESECHABLE (cambia SSH y firewall).
#
#   sudo bash nube-prueba.sh --copia <carpeta git o .bundle de la copia del alumno> [--huellas publicadas|ninguna]
#
# Qué simula, sin modelo: un VPS recién rentado (root con la llave de su laptop), los comandos literales del PASO 3 de
# INSTALAR.md contra un espejo local de la copia con etiqueta firmada por una llave desechable que se AGREGA al ancla
# (precedente: e2e-reinstalar.yml), un mi-arbrain «de la laptop» con identidad ajena sembrada, y luego nube.sh.
# Comprueba con comandos: servicio active/enabled como usuario sin root, web en 127.0.0.1, sshd solo llave (y una
# conexión real con contraseña rechazada), ufw negando entrantes (y una conexión real bloqueada desde un contenedor si
# hay docker), actualizaciones automáticas, Tailscale instalado sin sesión, identidad propia, restart y kill -9
# sobrevividos, llave sin tope rechazada y con tope guardada (OpenRouter falso), y segunda corrida con cambios=0.
# Termina con «NUBE_PRUEBA verde» o «NUBE_PRUEBA FALLAS=<n>» (código 1). Nunca imprime llaves.
set -u   # sin pipefail: `cmd | grep -q` cortaría la tubería
[ "$(id -u)" = 0 ] || { echo "corre esto como root (máquina desechable)"; exit 2; }
export HOME=/root
COPIA=""; HUELLAS=ninguna; PLAZO_MIN="${NUBE_PRUEBA_PLAZO_MIN:-40}"
while [ $# -gt 0 ]; do case "$1" in --copia) COPIA="$2"; shift 2 ;; --huellas) HUELLAS="$2"; shift 2 ;; *) echo "opción: $1"; exit 2 ;; esac; done
[ -n "$COPIA" ] || { echo "falta --copia"; exit 2; }
T=/srv/nube-prueba; mkdir -p "$T"; EVID="$T/evidencia.txt"; : > "$EVID"
FALLAS=0
log() { printf '%s\n' "$*" | tee -a "$EVID"; }
ok() { log "OK   $*"; }
mal() { log "FAIL $*"; FALLAS=$((FALLAS + 1)); }
probar() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else mal "$d"; fi; }
t0=$(date +%s); seg() { echo $(( $(date +%s) - t0 )); }
export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null && command -v curl >/dev/null && command -v ssh-keygen >/dev/null || { apt-get update -qq && apt-get install -y -qq git curl openssh-client ca-certificates python3 >/dev/null; }

# ── 0 · VPS recién rentado: root con la llave pública de «su laptop» ───────────────────────────────────────────────────
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$T/laptop" ] || ssh-keygen -q -t ed25519 -N '' -C laptop-de-prueba -f "$T/laptop"
grep -qF "$(cut -d' ' -f2 "$T/laptop.pub")" /root/.ssh/authorized_keys 2>/dev/null || cat "$T/laptop.pub" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# ── 1 · Espejo local de la copia con etiqueta de prueba (si no existe ya: la segunda corrida lo reusa) ────────────────
if [ ! -d "$T/espejo.git" ]; then
  rm -rf "$T/trabajo"; git clone -q "$COPIA" "$T/trabajo" || { echo "no pude abrir la copia $COPIA"; exit 2; }
  V="v$(cat "$T/trabajo/VERSION")"
  MSJ="Arbrain $V (prueba de la nube, no es una versión)"
  if [ "$HUELLAS" = publicadas ]; then
    git -C "$T/trabajo" fetch -q --no-tags https://github.com/arbrain-ai/arbrain.git "refs/tags/$V:refs/tags/real-$V" \
      && MSJ="$MSJ

$(git -C "$T/trabajo" tag -l --format='%(contents)' "real-$V" | grep -E '^programa ')" && git -C "$T/trabajo" tag -d "real-$V" >/dev/null
  fi
  ssh-keygen -q -t ed25519 -N '' -C prueba -f "$T/firma"
  git -C "$T/trabajo" -c user.name=prueba -c user.email=prueba@ci -c gpg.format=ssh -c user.signingkey="$T/firma" tag -s "$V" -m "$MSJ" HEAD
  git init -q --bare "$T/espejo.git"
  git -C "$T/trabajo" push -q "$T/espejo.git" "HEAD:refs/heads/main" "refs/tags/$V"
  git -C "$T/espejo.git" symbolic-ref HEAD refs/heads/main
fi
git config --global url."file://$T/espejo.git".insteadOf https://github.com/arbrain-ai/arbrain.git
mkdir -p /root/.config/arbrain
if [ ! -s /root/.config/arbrain/firmas-permitidas ]; then
  sed -n '/^arbrain-publicacion /p;/^arbrain-reserva /p' "$T/trabajo/INSTALAR.md" > /root/.config/arbrain/firmas-permitidas
  echo "prueba namespaces=\"git\" $(cut -d' ' -f1,2 "$T/firma.pub")" >> /root/.config/arbrain/firmas-permitidas
fi
log "· copia $(git -C "$T/espejo.git" rev-parse --short main) · huellas=$HUELLAS · $(lsb_release -ds 2>/dev/null || head -1 /etc/os-release)"

# ── 2 · PASO 3 de INSTALAR.md, literal (sacado del propio INSTALAR.md de la copia) ────────────────────────────────────
bloque() { awk -v n="$1" '/^## PASO 3/{p=1} p&&/^```bash/{c++; if(c==n){b=1; next}} b&&/^```/{exit} b' "$T/trabajo/INSTALAR.md"; }
if [ ! -d /root/Arbrain ]; then
  cd /root && bloque 1 > "$T/paso3a.sh" && bloque 2 > "$T/paso3b.sh"
  bash "$T/paso3a.sh" | tee -a "$EVID" | grep -q '^FIRMA_OK' && ok "PASO 3: FIRMA_OK con el guion literal" || mal "PASO 3 no dio FIRMA_OK"
  bash "$T/paso3b.sh" && ok "PASO 3: rama mi-arbrain" || mal "PASO 3: rama mi-arbrain"
fi
grep -q 'INSTALAR-NUBE' /root/Arbrain/INSTALAR.md && ok "INSTALAR.md trae el desvío a la rama servidor" || mal "INSTALAR.md no trae el desvío"
[ -f /root/Arbrain/INSTALAR-NUBE.md ] && ok "la copia trae INSTALAR-NUBE.md" || mal "falta INSTALAR-NUBE.md en la copia"

# ── 3 · El mi-arbrain «de la laptop», con identidad y estado de OTRA máquina versionados por error ───────────────────
if [ ! -d /srv/mi-arbrain.git ]; then
  rm -rf "$T/laptop-copia"; git clone -q --branch mi-arbrain /root/Arbrain "$T/laptop-copia"
  ( cd "$T/laptop-copia" && mkdir -p .claude/hooks/tmp .claude/memory/project \
    && echo laptop-de-prueba > .claude/hooks/.host-slug && echo '{"laptop":true}' > .claude/hooks/tmp/flush-state.json \
    && printf -- '---\nname: desde la laptop\n---\nEsto lo escribí en mi laptop.\n' > .claude/memory/project/desde-la-laptop.md \
    && git -c user.name=laptop -c user.email=l@l add -f -A && git -c user.name=laptop -c user.email=l@l commit -qm "Laptop: memoria y (por error) su identidad" )
  git init -q --bare /srv/mi-arbrain.git && git -C "$T/laptop-copia" push -q /srv/mi-arbrain.git mi-arbrain
  chmod -R a+rX /srv/mi-arbrain.git
  git config --system --add safe.directory /srv/mi-arbrain.git   # solo prueba: el repo «de GitHub» es de root
fi

NUBE=/root/Arbrain/arbrain/scripts/instalar/nube.sh
correr_nube() { NUBE_ESPERA_SEG="${1:-0}" bash "$NUBE" --mi-arbrain file:///srv/mi-arbrain.git 2>&1 | tee "$T/nube-$2.log" | tee -a "$EVID" | tail -1; }
esperar_corriendo() {
  local fin=$(( $(date +%s) + PLAZO_MIN * 60 )) l
  while [ "$(date +%s)" -lt "$fin" ]; do
    l="$(bash "$NUBE" estado 2>/dev/null | tail -1)"
    case "$l" in NUBE_ESTADO*) echo "$l"; return 0 ;; esac
    sleep 15
  done
  echo "$l"; return 1
}

# ── 4 · Primera corrida ───────────────────────────────────────────────────────────────────────────────────────────────
log "· [$(seg) s] nube.sh, primera corrida"
L1="$(correr_nube 0 1)"
case "$L1" in NUBE_OK*|NUBE_ESPERA*) ok "primera corrida: ${L1%% *}" ;; *) mal "primera corrida: $L1" ;; esac
E="$(esperar_corriendo)" && ok "[$(seg) s] Arbrain corriendo: $E" || { mal "Arbrain no llegó a correr en $PLAZO_MIN min: $E"; journalctl -u arbrain -n 80 --no-pager | tee -a "$EVID"; log "NUBE_PRUEBA FALLAS=$FALLAS (corto aquí: sin Arbrain corriendo lo demás no se puede probar)"; exit 1; }
PUERTO="$(printf '%s' "$E" | sed -n 's|.*web=http://127\.0\.0\.1:\([0-9]*\).*|\1|p')"

# ── 5 · Comprobaciones por comando ────────────────────────────────────────────────────────────────────────────────────
probar "systemctl is-active arbrain" systemctl is-active -q arbrain
probar "systemctl is-enabled arbrain (arranca con la máquina)" systemctl is-enabled -q arbrain
systemctl status arbrain --no-pager -n 0 2>&1 | head -6 | tee -a "$EVID"
PID="$(systemctl show -p MainPID --value arbrain)"
[ "$(ps -o user= -p "$PID" 2>/dev/null | tr -d ' ')" = arbrain ] && ok "corre como el usuario arbrain (pid $PID)" || mal "el proceso no corre como arbrain"
id -nG arbrain | tr ' ' '\n' | grep -qxE 'sudo|wheel|admin' && mal "arbrain tiene sudo" || ok "arbrain sin sudo"
passwd -S arbrain 2>/dev/null | awk '{print $2}' | grep -qE '^(L|NP|LK)$' && ok "arbrain sin contraseña utilizable ($(passwd -S arbrain | awk '{print $2}'))" || mal "arbrain tiene contraseña"
web_ok() { local _i; for _i in $(seq 1 30); do curl -fsS -o /dev/null "http://127.0.0.1:$PUERTO/api/version" && return 0; sleep 2; done; return 1; }
probar "web responde en 127.0.0.1:$PUERTO/api/version (hasta 60 s)" web_ok
if ss -ltnp 2>/dev/null | grep node | grep -vE '127\.0\.0\.1:|\[::1\]:|\[::ffff:127\.0\.0\.1\]:' | grep -q .; then mal "node escucha fuera de 127.0.0.1: $(ss -ltnp | grep node | grep -vE '127\.0\.0\.1:|\[::1\]:')"; else ok "node solo escucha en 127.0.0.1"; fi
sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' && ok "sshd -T: passwordauthentication no" || mal "sshd acepta contraseñas"
sshd -T 2>/dev/null | grep -qi '^permitrootlogin without-password\|^permitrootlogin prohibit-password' && ok "sshd -T: root solo con llave" || mal "root entra con contraseña"
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
# shellcheck disable=SC2086
ssh $SSHO -o BatchMode=yes -i "$T/laptop" root@127.0.0.1 true 2>/dev/null && ok "SSH con la llave de la laptop entra" || mal "SSH con llave no entra"
# shellcheck disable=SC2086
R="$(ssh $SSHO -o BatchMode=yes -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive root@127.0.0.1 true 2>&1)"
case "$R" in *"Permission denied (publickey)"*) ok "SSH con contraseña rechazado: «${R##*: }»" ;; *) mal "SSH sin llave no fue rechazado como se espera: $R" ;; esac
ufw status verbose | tee -a "$EVID" | grep -q 'Default: deny (incoming)' && ok "ufw: niega entrantes" || mal "ufw no niega entrantes"
ufw status | grep -q '^Status: active' && ok "ufw activo" || mal "ufw apagado"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  GW="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null)"
  python3 -m http.server 8099 --bind 0.0.0.0 >/dev/null 2>&1 & HS=$!; sleep 1
  docker run --rm alpine sh -c "nc -z -w 4 $GW 8099" >/dev/null 2>&1 && mal "un puerto abierto (8099) es alcanzable desde fuera" || ok "desde fuera (contenedor → $GW:8099) bloqueado por el firewall"
  docker run --rm alpine sh -c "nc -z -w 4 $GW 22" >/dev/null 2>&1 && ok "desde fuera, SSH (22) sí pasa" || mal "SSH bloqueado desde fuera"
  kill "$HS" 2>/dev/null
else log "· (sin docker: la prueba de conexión desde fuera no corre aquí)"; fi
apt-config dump | grep -q 'APT::Periodic::Unattended-Upgrade "1"' && ok "unattended-upgrades encendido" || mal "unattended-upgrades apagado"
probar "unattended-upgrades instalado" dpkg -s unattended-upgrades
tailscale version >/dev/null 2>&1 && ok "tailscale instalado: $(tailscale version | head -1)" || mal "tailscale no instalado"
TS="$(tailscale status 2>&1 | head -1)"; case "$TS" in *"Logged out"*|*"NeedsLogin"*|*"not running"*|*"failed to connect"*|*"Log in"*) ok "tailscale sin sesión (la inicia la persona): ${TS:0:60}" ;; *) mal "tailscale con sesión o estado raro: $TS" ;; esac
H=/home/arbrain/Arbrain
SLUG="$(cat "$H/.claude/hooks/.host-slug" 2>/dev/null)"
case "$SLUG" in nube-*) ok "identidad propia: $SLUG" ;; *) mal "identidad: «$SLUG»" ;; esac
find /home/arbrain/.arbrain/identidad-ajena -name flush-state.json 2>/dev/null | grep -q . && ok "estado de la laptop apartado en identidad-ajena" || mal "flush-state.json de la laptop no se apartó"
[ -f "$H/.claude/memory/project/desde-la-laptop.md" ] && ok "la memoria de la laptop llegó por mi-arbrain" || mal "falta la memoria de la laptop"
[ -z "$(runuser -u arbrain -- git -C "$H" status --porcelain)" ] && ok "git status limpio en la nube" || mal "git status sucio: $(runuser -u arbrain -- git -C "$H" status --porcelain | head -3)"
[ "$(runuser -u arbrain -- git -C "$H" remote get-url origin)" = file:///srv/mi-arbrain.git ] && ok "origin = su mi-arbrain" || mal "origin no es su mi-arbrain"
[ "$(runuser -u arbrain -- git -C "$H" branch --show-current)" = mi-arbrain ] && ok "rama mi-arbrain" || mal "rama equivocada"
ls /home/arbrain/.local/share/ai.arbrain.servidor/daemon/store >/dev/null 2>&1 && ok "store/ propio de esta nube" || log "· (store/ aún vacío)"

# ── 6 · Reinicio y kill ───────────────────────────────────────────────────────────────────────────────────────────────
systemctl restart arbrain && E="$(esperar_corriendo)" && ok "[$(seg) s] sobrevive systemctl restart" || mal "no volvió tras restart: $E"
P1="$(systemctl show -p MainPID --value arbrain)"; kill -9 "$P1"
sleep 3; E="$(esperar_corriendo)"; P2="$(systemctl show -p MainPID --value arbrain)"
[ -n "$P2" ] && [ "$P2" != 0 ] && [ "$P2" != "$P1" ] && case "$E" in NUBE_ESTADO*) true ;; *) false ;; esac && ok "[$(seg) s] sobrevive kill -9 (pid $P1 → $P2)" || mal "no volvió tras kill -9: $E"

# ── 7 · Llave: sin tope se rechaza, con tope se guarda (OpenRouter falso en 127.0.0.1) ─────────────────────────────────
cat > "$T/openrouter-falso.py" <<'PY'
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        a = self.headers.get("Authorization", "")
        if self.path != "/api/v1/key" or not a.startswith("Bearer sk-or-"): self.send_response(401); self.end_headers(); return
        lim = None if "sintope" in a else 10
        b = json.dumps({"data": {"label": "nube", "limit": lim, "limit_remaining": lim, "usage": 0, "is_free_tier": False}}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", 8787), H).serve_forever()
PY
python3 "$T/openrouter-falso.py" & OR=$!; sleep 1
export NUBE_OPENROUTER_API=http://127.0.0.1:8787
L="$(printf 'sk-or-v1-sintope-abcdefghijklmnop\n' | bash "$NUBE" llave --stdin 2>&1 | tail -1)"
case "$L" in NUBE_LLAVE_FALTA*tope*) ok "llave sin tope rechazada: ${L:0:90}" ;; *) mal "llave sin tope no se rechazó: $L" ;; esac
L="$(printf 'sk-ant-oat01-abcdefghijklmnop\n' | bash "$NUBE" llave --stdin 2>&1 | tail -1)"
case "$L" in NUBE_LLAVE_FALTA*) ok "token de suscripción rechazado" ;; *) mal "token de suscripción aceptado: $L" ;; esac
CLAVE="sk-or-v1-contope-abcdefghijklmnop$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
L="$(printf '%s\n' "$CLAVE" | bash "$NUBE" llave --stdin 2>&1 | tail -1)"
case "$L" in NUBE_LLAVE_OK*tope=10*) ok "llave con tope guardada: $L" ;; *) mal "llave con tope: $L" ;; esac
unset NUBE_OPENROUTER_API; kill "$OR" 2>/dev/null
LL=/home/arbrain/.local/share/ai.arbrain.servidor/daemon/config/llaves.json
[ "$(stat -c %a "$LL" 2>/dev/null)" = 600 ] && [ "$(stat -c %U "$LL")" = arbrain ] && grep -q '"OPENROUTER_API_KEY"' "$LL" && ok "llaves.json 0600 de arbrain con la llave (sin mostrarla)" || mal "llaves.json"
{ grep -rqsF "$CLAVE" "$H" || runuser -u arbrain -- git -C "$H" log -p --all | grep -qF "$CLAVE"; } && mal "¡la llave quedó dentro de la copia git!" || ok "la llave no está en la copia git"
E="$(esperar_corriendo)"; case "$E" in *llave=tope:10*) ok "estado: llave=tope:10 y Arbrain corriendo" ;; *) mal "estado tras la llave: $E" ;; esac

# ── 8 · Segunda corrida: nada cambia ──────────────────────────────────────────────────────────────────────────────────
P3="$(systemctl show -p MainPID --value arbrain)"
L2="$(correr_nube 120 2)"
case "$L2" in NUBE_OK*cambios=0*) ok "segunda corrida idempotente: $L2" ;; *) mal "segunda corrida: $L2"; grep '^+ ' "$T/nube-2.log" | tee -a "$EVID" ;; esac
[ "$(systemctl show -p MainPID --value arbrain)" = "$P3" ] && ok "la segunda corrida no reinició el servicio" || mal "la segunda corrida reinició el servicio"

log "· [$(seg) s] fin"
if [ "$FALLAS" = 0 ]; then log "NUBE_PRUEBA verde"; exit 0; else log "NUBE_PRUEBA FALLAS=$FALLAS"; exit 1; fi
