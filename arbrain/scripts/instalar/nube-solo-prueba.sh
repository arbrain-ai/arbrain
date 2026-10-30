#!/usr/bin/env bash
# Prueba de punta a punta de «Solo en tu servidor» (29 oct 2026; guía INSTALAR-NUBE.md) en un Ubuntu REAL con systemd.
# La corren el workflow e2e-solo-servidor.yml de arbrain-ai/e2e-instalacion (runner ubuntu-latest) y el contenedor de
# docs/builds/nube-primero-2026-10-29/contenedor.sh. Como root, en una máquina DESECHABLE (cambia SSH y firewall).
#
#   sudo bash nube-solo-prueba.sh --copia <carpeta git o .bundle de la copia del alumno> [--huellas publicadas|ninguna]
#
# A diferencia de nube-prueba.sh (la nube como espejo de una laptop), aquí NO hay computadora detrás: un VPS recién
# rentado, los comandos literales del PASO 3 de INSTALAR.md y `nube.sh` sin --mi-arbrain. Luego, lo que la guía hace
# para entrar desde el navegador o el teléfono, con Tailscale SIMULADO (no se inicia sesión en ninguna tailnet):
#   - `tailscale-falso.mjs` en la unidad (drop-in SOLO de prueba) anota lo que Arbrain le pide a Tailscale;
#   - `tailnet-falso.mjs` hace lo que hace `tailscale serve` en la red: HTTPS para <servidor>.ejemplo.ts.net con un
#     certificado propio (curl lo verifica con --cacert) y reenvío a la web en 127.0.0.1 con X-Forwarded-Proto: https.
# Comprueba con comandos: nube.sh telefono → serve (nunca funnel) y TELEFONO_ENCENDIDO; por la «tailnet», sin sesión
# /chat → /sin-sesion y API 401; el código de un solo uso sale SOLO en la terminal (pty de `script`), nunca en stdout ni
# sin terminal; con él, cookie Secure y /chat 200; el primer arranque sabe que vive en un servidor; nube.sh claude sin
# terminal no corre; el login oficial de Claude Code en un servidor sin pantalla muestra su enlace (sin entrar a ninguna
# cuenta); llave con tope (OpenRouter falso) y motor de suscripción a la vez (chat y rutinas separados); kill -9 y
# reinicio: Tailscale vuelve a publicar y la web responde otra vez por la tailnet; nada escucha fuera de 127.0.0.1; ufw
# sin puertos nuevos; ninguna unidad de usuario de más; segunda corrida con cambios=0.
# Termina con «NUBE_SOLO_PRUEBA verde» o «NUBE_SOLO_PRUEBA FALLAS=<n>» (código 1). Nunca imprime llaves ni el código.
set -u   # sin pipefail: `cmd | grep -q` cortaría la tubería
[ "$(id -u)" = 0 ] || { echo "corre esto como root (máquina desechable)"; exit 2; }
export HOME=/root
COPIA=""; HUELLAS=ninguna; PLAZO_MIN="${NUBE_PRUEBA_PLAZO_MIN:-40}"
while [ $# -gt 0 ]; do case "$1" in --copia) COPIA="$2"; shift 2 ;; --huellas) HUELLAS="$2"; shift 2 ;; *) echo "opción: $1"; exit 2 ;; esac; done
[ -n "$COPIA" ] || { echo "falta --copia"; exit 2; }
T=/srv/nube-solo-prueba; mkdir -p "$T"; EVID="$T/evidencia.txt"; : > "$EVID"
FALLAS=0
log() { printf '%s\n' "$*" | tee -a "$EVID"; }
ok() { log "OK   $*"; }
mal() { log "FAIL $*"; FALLAS=$((FALLAS + 1)); }
t0=$(date +%s); seg() { echo $(( $(date +%s) - t0 )); }
export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null && command -v curl >/dev/null && command -v ssh-keygen >/dev/null && command -v openssl >/dev/null && command -v script >/dev/null \
  || { apt-get update -qq && apt-get install -y -qq git curl openssh-client ca-certificates python3 openssl bsdutils >/dev/null; }

# ── 0 · VPS recién rentado: root con la llave pública de «su computadora» (solo para entrar por SSH) ──────────────────
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$T/compu" ] || ssh-keygen -q -t ed25519 -N '' -C compu-de-prueba -f "$T/compu"
grep -qF "$(cut -d' ' -f2 "$T/compu.pub")" /root/.ssh/authorized_keys 2>/dev/null || cat "$T/compu.pub" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# ── 1 · Espejo local de la copia con etiqueta de prueba (la segunda corrida lo reusa) ───────────────────────────────
if [ ! -d "$T/espejo.git" ]; then
  rm -rf "$T/trabajo"; git clone -q "$COPIA" "$T/trabajo" || { echo "no pude abrir la copia $COPIA"; exit 2; }
  V="v$(cat "$T/trabajo/VERSION")"
  MSJ="Arbrain $V (prueba de solo servidor, no es una versión)"
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
log "· copia $(git -C "$T/espejo.git" rev-parse --short main) · huellas=$HUELLAS · $(lsb_release -ds 2>/dev/null || head -1 /etc/os-release) · $(uname -m)"

# ── 2 · La guía: una pregunta, tres caminos; el de «solo servidor» lleva a INSTALAR-NUBE.md ────────────────────────────
I=/root/Arbrain
bloque() { awk -v n="$1" '/^## PASO 3/{p=1} p&&/^```bash/{c++; if(c==n){b=1; next}} b&&/^```/{exit} b' "$T/trabajo/INSTALAR.md"; }
if [ ! -d "$I" ]; then
  cd /root && bloque 1 > "$T/paso3a.sh" && bloque 2 > "$T/paso3b.sh"
  bash "$T/paso3a.sh" | tee -a "$EVID" | grep -q '^FIRMA_OK' && ok "PASO 3: FIRMA_OK con el guion literal" || mal "PASO 3 no dio FIRMA_OK"
  bash "$T/paso3b.sh" && ok "PASO 3: rama mi-arbrain" || mal "PASO 3: rama mi-arbrain"
fi
grep -q 'Solo en tu servidor' "$I/INSTALAR.md" && grep -q 'Instala Arbrain solo en mi servidor siguiendo' "$I/INSTALAR.md" && ok "INSTALAR.md trae los tres caminos y el prompt de solo servidor" || mal "INSTALAR.md sin los tres caminos"
grep -q 'Hostinger KVM 2' "$I/INSTALAR-NUBE.md" && grep -qi 'revisa el precio el día que compres' "$I/INSTALAR-NUBE.md" && ok "INSTALAR-NUBE.md trae el plan recomendado y «revisa el precio»" || mal "INSTALAR-NUBE.md sin el plan recomendado"

NUBE="$I/arbrain/scripts/instalar/nube.sh"
H=/home/arbrain; A="$H/Arbrain"
esperar_corriendo() {
  local fin=$(( $(date +%s) + PLAZO_MIN * 60 )) l
  while [ "$(date +%s)" -lt "$fin" ]; do
    l="$(bash "$NUBE" estado 2>/dev/null | tail -1)"
    case "$l" in NUBE_ESTADO*) echo "$l"; return 0 ;; esac
    sleep 15
  done
  echo "$l"; return 1
}

# ── 3 · nube.sh sin computadora detrás (sin --mi-arbrain) ─────────────────────────────────────────────────────────────
log "· [$(seg) s] nube.sh, primera corrida (solo servidor)"
L1="$(NUBE_ESPERA_SEG=0 bash "$NUBE" 2>&1 | tee "$T/nube-1.log" | tee -a "$EVID" | tail -1)"
case "$L1" in NUBE_OK*|NUBE_ESPERA*) ok "primera corrida: ${L1%% *}" ;; *) mal "primera corrida: $L1" ;; esac
E="$(esperar_corriendo)" && ok "[$(seg) s] Arbrain corriendo: $E" || { mal "Arbrain no llegó a correr en $PLAZO_MIN min: $E"; journalctl -u arbrain -n 80 --no-pager | tee -a "$EVID"; log "NUBE_SOLO_PRUEBA FALLAS=$FALLAS (corto aquí)"; exit 1; }
systemctl is-active -q arbrain && systemctl is-enabled -q arbrain && ok "arbrain.service activo y al arranque" || mal "servicio"
PID="$(systemctl show -p MainPID --value arbrain)"
[ "$(ps -o user= -p "$PID" 2>/dev/null | tr -d ' ')" = arbrain ] && ok "corre como el usuario arbrain, sin sudo" || mal "el proceso no corre como arbrain"
grep -q '"ARBRAIN_SERVIDOR_NUBE=1"' /etc/systemd/system/arbrain.service && ok "la unidad marca que vive en un servidor (ARBRAIN_SERVIDOR_NUBE=1)" || mal "la unidad no trae ARBRAIN_SERVIDOR_NUBE=1"
[ -z "$(runuser -u arbrain -- git -C "$A" remote get-url origin 2>/dev/null)" ] && ok "sin computadora detrás: no hay origin (su semilla propia)" || mal "hay un origin inesperado"
case "$(cat "$A/.claude/hooks/.host-slug" 2>/dev/null)" in nube-*) ok "identidad propia: $(cat "$A/.claude/hooks/.host-slug")" ;; *) mal "identidad del servidor" ;; esac

# ── 4 · Tailscale SIMULADO: drop-in de prueba con el tailscale falso (no se toca ninguna tailnet) ────────────────────
TS_HOST=mi-vps.ejemplo.ts.net; FALSO_DIR="$H/.tailscale-falso"
runuser -u arbrain -- mkdir -p "$FALSO_DIR"
mkdir -p /etc/systemd/system/arbrain.service.d
cat > /etc/systemd/system/arbrain.service.d/zz-prueba-tailscale-falso.conf <<UNIDAD
# SOLO PRUEBA (nube-solo-prueba.sh): Arbrain habla con un tailscale falso que anota sus argumentos.
[Service]
Environment="ARBRAIN_TAILSCALE=$A/arbrain/scripts/servidor/tailscale-falso.mjs" "ARBRAIN_TAILSCALE_FALSO_DIR=$FALSO_DIR" "ARBRAIN_TAILSCALE_FALSO_HOST=$TS_HOST"
UNIDAD
systemctl daemon-reload && systemctl restart arbrain
E="$(esperar_corriendo)" && ok "[$(seg) s] reinicio con el tailscale falso: corriendo" || mal "no volvió con el drop-in: $E"

L="$(bash "$NUBE" telefono 2>&1 | tee "$T/telefono.log" | tail -1)"
[ "$L" = "TELEFONO_ENCENDIDO https://$TS_HOST" ] && ok "nube.sh telefono → $L" || { mal "nube.sh telefono: $L"; cat "$T/telefono.log" | tee -a "$EVID"; }
REG() { cut -c1-400 "$FALSO_DIR/registro.jsonl" 2>/dev/null | python3 -c 'import json,sys
for l in sys.stdin:
  try: print(" ".join(json.loads(l)["args"]))
  except Exception: pass'; }
PUERTO="$(printf '%s' "$E" | sed -n 's|.*web=http://127\.0\.0\.1:\([0-9]*\).*|\1|p')"
REG | grep -qx "serve --bg --yes --https=443 http://127.0.0.1:$PUERTO" && ok "Tailscale recibió: serve --bg --yes --https=443 http://127.0.0.1:$PUERTO" || mal "serve esperado no llegó: $(REG | tr '\n' ';')"
tailscale debug prefs 2>/dev/null | grep -q '"OperatorUser": *"arbrain"' && ok "Tailscale real: arbrain quedó como operador (publica sin root)" || log "· (Tailscale real sin sesión: el operador se fija al iniciar sesión; en el VPS real nube.sh telefono lo vuelve a pedir)"

# La «tailnet»: HTTPS con certificado propio para el nombre .ts.net, reenvío con X-Forwarded-Proto: https.
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$TS_HOST" -addext "subjectAltName=DNS:$TS_HOST" \
  -keyout "$T/tailnet.key" -out "$T/tailnet.pem" >/dev/null 2>&1
NODE="$(runuser -u arbrain -- bash -c '. ~/.arbrain/entorno.sh 2>/dev/null; command -v node')"
"$NODE" "$A/arbrain/scripts/servidor/tailnet-falso.mjs" --dir "$FALSO_DIR" --host "$TS_HOST" --puerto 443 --cert "$T/tailnet.pem" --llave "$T/tailnet.key" > "$T/tailnet.log" 2>&1 &
TN=$!; sleep 1
TC=(curl -sS --max-time 30 --cacert "$T/tailnet.pem" --resolve "$TS_HOST:443:127.0.0.1")
tn() { "${TC[@]}" -o /dev/null -w '%{http_code}' "https://$TS_HOST$1" "${@:2}"; }
fin=$(( $(date +%s) + 180 )); s=0
while [ "$(date +%s)" -lt "$fin" ]; do s="$(tn /sin-sesion)"; [ "$s" = 200 ] && break; sleep 3; done
[ "$s" = 200 ] && ok "por la tailnet (https://$TS_HOST, certificado verificado): /sin-sesion 200" || mal "la web no respondió por la tailnet: $s · $(tail -2 "$T/tailnet.log")"
P="$("${TC[@]}" "https://$TS_HOST/sin-sesion" 2>/dev/null)"
case "$P" in *'data-servidor="1"'*nube.sh\ codigo*) case "$P" in *"servido por tu computadora"*) mal "/sin-sesion en el servidor habla de «tu computadora»" ;; *) ok "/sin-sesion en el servidor: el código sale de su Claude Code o nube.sh codigo (no de «tu computadora»)" ;; esac ;; *) mal "/sin-sesion en el servidor no dice de dónde sale el código" ;; esac
R="$("${TC[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "https://$TS_HOST/chat")"
case "$R" in 30[1278]\ *sin-sesion*) ok "sin sesión: /chat → /sin-sesion ($R)" ;; *) mal "sin sesión /chat: $R" ;; esac
[ "$(tn /api/telefono)" = 401 ] && ok "sin sesión: /api/telefono 401" || mal "sin sesión /api/telefono no dio 401"
# Directo a la web (sin pasar por la tailnet): otro nombre .ts.net, o el suyo sin HTTPS, no entran.
W="http://127.0.0.1:$PUERTO/sin-sesion"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: otra.ejemplo.ts.net" -H 'X-Forwarded-Proto: https' "$W")" = 421 ] && ok "otro nombre de la tailnet → 421" || mal "otro Host no dio 421"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: $TS_HOST" "$W")" = 421 ] && ok "su nombre sin HTTPS (sin X-Forwarded-Proto) → 421" || mal "su Host en claro no dio 421"

# ── 5 · El código para entrar: SOLO en la terminal de la persona ──────────────────────────────────────────────────────
L="$(bash "$NUBE" codigo < /dev/null 2>&1 | tail -1)"
case "$L" in NUBE_CODIGO_FALTA*terminal*) ok "sin terminal (como lo correría Claude) no hay código: ${L:0:70}" ;; *) mal "sin terminal: $L" ;; esac
setsid bash -c "script -q -e -c 'bash $NUBE codigo > $T/codigo-stdout.txt 2>&1' $T/codigo-tty.txt" < /dev/null > /dev/null 2>&1
COD="$(grep -oE '[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}' "$T/codigo-tty.txt" | tail -1)"
[ -n "$COD" ] && ok "con su terminal: el código salió en la terminal" || mal "no salió código en la terminal: $(tr -d '\r' < "$T/codigo-tty.txt" | tail -3)"
grep -q "^NUBE_CODIGO_OK https://$TS_HOST" "$T/codigo-stdout.txt" && ! grep -qE '[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}' "$T/codigo-stdout.txt" && ok "stdout solo dice NUBE_CODIGO_OK $(cat "$T/codigo-stdout.txt" | tail -1 | cut -d' ' -f2) (sin el código)" || mal "stdout del código: $(cat "$T/codigo-stdout.txt")"
JAR="$T/cookies.txt"; rm -f "$JAR"
R="$("${TC[@]}" -c "$JAR" -D "$T/entrar.h" -o /dev/null -w '%{http_code}' -H "Origin: https://$TS_HOST" --data-urlencode "contrasena=$COD" "https://$TS_HOST/api/desktop/entrar")"
grep -qi '^set-cookie: arbrain_escritorio=s1\..*; *Secure' "$T/entrar.h" && [ "$R" = 200 ] && ok "entrar con el código por la tailnet: 200, cookie Secure" || mal "entrar con código: $R $(grep -i '^set-cookie' "$T/entrar.h" | sed 's/=s1\.[0-9a-f]*/=s1.…/')"
R="$("${TC[@]}" -o /dev/null -w '%{http_code}' -H "Origin: https://$TS_HOST" --data-urlencode "contrasena=$COD" "https://$TS_HOST/api/desktop/entrar")"
[ "$R" = 303 ] && ok "el mismo código no sirve dos veces" || mal "el código sirvió dos veces ($R)"
COD=""
R="$("${TC[@]}" -b "$JAR" -L --max-redirs 4 -o "$T/chat.html" -w '%{http_code} %{url_effective}' "https://$TS_HOST/chat")"
case "$R" in 200\ *sin-sesion*) mal "con sesión /chat cayó en /sin-sesion" ;; 200\ *) ok "con sesión, desde el «teléfono»: /chat → ${R#200 https://$TS_HOST} 200" ;; *) mal "con sesión /chat: $R" ;; esac
"${TC[@]}" -b "$JAR" "https://$TS_HOST/manifest-cliente.json" | grep -q '"name": *"Tu Arbrain"' && ok "PWA «Tu Arbrain» por la tailnet (manifest)" || mal "manifest-cliente.json por la tailnet"
P="$("${TC[@]}" -b "$JAR" "https://$TS_HOST/api/primer-arranque")"
printf '%s' "$P" | grep -q '"servidor":true' && ok "el primer arranque sabe que vive en un servidor (muestra los tres caminos con «Aquí estás» en solo servidor)" || mal "primer arranque sin servidor:true: ${P:0:160}"

# ── 6 · Su cuenta de Claude para el CHAT: login oficial, solo con su terminal ──────────────────────────────────────────
L="$(bash "$NUBE" claude < /dev/null 2>&1 | tail -1)"
case "$L" in NUBE_CLAUDE_FALTA*terminal*) ok "nube.sh claude sin terminal no corre: ${L:0:60}" ;; *) mal "nube.sh claude sin terminal: $L" ;; esac
CL="$(runuser -u arbrain -- bash -c '. ~/.arbrain/entorno.sh 2>/dev/null; command -v claude')"
if [ -n "$CL" ]; then
  # Una terminal de verdad (pty de Python, con la entrada abierta: `script` sin terminal le manda fin de archivo y el
  # login no dibuja nada). Solo se mira que salga el enlace y la invitación a pegar el código; luego se corta: no se
  # entra a ninguna cuenta y el enlace no se guarda en la evidencia.
  cat > "$T/login-pty.py" <<'PY'
import os, pty, re, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1], "auth", "login", "--claudeai"])
out, t = b"", time.time()
while time.time() - t < 40 and b"Paste code" not in out:
    if select.select([fd], [], [], 1)[0]:
        try: out += os.read(fd, 4096)
        except OSError: break
os.kill(pid, 9)
s = out.decode("utf8", "replace")
print("enlace=%s paste=%s" % (bool(re.search(r"https://[a-z.]*claude[.](ai|com)/[^ \x07\x1b]*oauth", s)), "Paste code" in s))
PY
  R="$(runuser -u arbrain -- env -i HOME="$H" PATH="$(dirname "$CL"):/usr/bin:/bin" TERM=xterm-256color LANG=C.UTF-8 python3 "$T/login-pty.py" "$CL" 2>&1 | tail -1)"
  case "$R" in "enlace=True paste=True") ok "login oficial de Claude Code sin pantalla: muestra su enlace (claude.com) y pide «Paste code here if prompted»" ;; *) mal "claude auth login sin pantalla: $R" ;; esac
else mal "Claude Code no quedó instalado para arbrain"; fi

# ── 7 · Rutinas por su llave con tope (OpenRouter falso) mientras el chat va con su cuenta ────────────────────────────
cat > "$T/openrouter-falso.py" <<'PY'
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        a = self.headers.get("Authorization", "")
        if self.path != "/api/v1/key" or not a.startswith("Bearer sk-or-"): self.send_response(401); self.end_headers(); return
        b = json.dumps({"data": {"label": "nube", "limit": 10, "limit_remaining": 10, "usage": 0, "is_free_tier": False}}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", 8787), H).serve_forever()
PY
python3 "$T/openrouter-falso.py" & OR=$!; sleep 1
CLAVE="sk-or-v1-contope-abcdefghijklmnop$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
L="$(printf '%s\n' "$CLAVE" | NUBE_OPENROUTER_API=http://127.0.0.1:8787 bash "$NUBE" llave --stdin 2>&1 | tail -1)"
kill "$OR" 2>/dev/null
case "$L" in NUBE_LLAVE_OK*tope=10*) ok "llave de rutinas con tope guardada: $L" ;; *) mal "llave: $L" ;; esac
CFG="$H/.local/share/ai.arbrain.servidor/daemon/config"
printf '{"motor":"suscripcion","elegido":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | runuser -u arbrain -- bash -c "umask 077; cat > '$CFG/motor-claude.json'"
systemctl restart arbrain
E="$(esperar_corriendo)"
case "$E" in *llave=tope:10*chat=claude-sin-sesion*) ok "estado: rutinas con llave tope:10 y chat con su cuenta de Claude (aquí sin sesión: no se entra a ninguna cuenta en la CI)" ;; *) mal "estado tras llave y motor: $E" ;; esac
case "$E" in *sandbox=ok*) ok "estado: aislamiento de Claude Code completo (bwrap y socat)" ;; *) mal "estado: el aislamiento no está completo: $E" ;; esac
[ -f "$CFG/nube-llave.json" ] && ! grep -q "$CLAVE" "$CFG/nube-llave.json" && ok "marca de tope (nube-llave.json) sin la llave" || mal "marca de tope"
{ grep -rqsF "$CLAVE" "$A" || runuser -u arbrain -- git -C "$A" log -p --all | grep -qF "$CLAVE"; } && mal "¡la llave quedó en la copia git!" || ok "la llave no está en la copia git"
CLAVE=""

# ── 8 · Kill -9 y reinicio: Tailscale vuelve a publicar y la web responde otra vez por la tailnet ───────────────────────
rm -f "$FALSO_DIR/serve.json"
P1="$(systemctl show -p MainPID --value arbrain)"; kill -9 "$P1"; sleep 3
E="$(esperar_corriendo)"
fin=$(( $(date +%s) + 300 )); s=0
while [ "$(date +%s)" -lt "$fin" ]; do s="$(tn /api/version)"; [ "$s" = 200 ] && break; sleep 5; done
[ "$s" = 200 ] && ok "[$(seg) s] tras kill -9 (pid $P1 → $(systemctl show -p MainPID --value arbrain)) Tailscale volvió a publicar solo y la web responde por la tailnet" || mal "tras kill -9 la tailnet no responde: $s"
[ "$("${TC[@]}" -b "$JAR" -o /dev/null -w '%{http_code}' "https://$TS_HOST/api/telefono")" = 200 ] && ok "la sesión del teléfono sigue viva tras el reinicio" || mal "la sesión del teléfono se perdió"

# ── 9 · Nada abierto a internet ──────────────────────────────────────────────────────────────────────────────────────
REG | grep -q funnel && mal "se llamó a tailscale funnel" || ok "Tailscale: $(REG | wc -l) llamadas, ninguna a funnel"
if ss -ltnp 2>/dev/null | grep '"node"' | grep -vE '127\.0\.0\.1:|\[::1\]:|\[::ffff:127\.0\.0\.1\]:' | grep -q .; then mal "node escucha fuera de 127.0.0.1"; else ok "node solo escucha en 127.0.0.1 (también la tailnet simulada)"; fi
UFW="$(ufw show added 2>/dev/null | grep '^ufw ' | sort | tr '\n' ';')"
case "$UFW" in "ufw allow 22/tcp;ufw allow in on tailscale0;") ok "ufw: solo SSH y tailscale0 ($UFW)" ;; *) mal "ufw con reglas de más: $UFW" ;; esac
ls "$H"/.config/systemd/user/*arbrain* >/dev/null 2>&1 && mal "se creó una unidad de usuario de más" || ok "sin unidad de usuario de más (el arranque es la unidad de sistema)"

# ── 10 · Segunda corrida: nada cambia ────────────────────────────────────────────────────────────────────────────────
P3="$(systemctl show -p MainPID --value arbrain)"
L2="$(NUBE_ESPERA_SEG=120 bash "$NUBE" 2>&1 | tee "$T/nube-2.log" | tail -1)"
case "$L2" in NUBE_OK*cambios=0*) ok "segunda corrida idempotente: $L2" ;; *) mal "segunda corrida: $L2"; grep '^+ ' "$T/nube-2.log" | tee -a "$EVID" ;; esac
[ "$(systemctl show -p MainPID --value arbrain)" = "$P3" ] && ok "la segunda corrida no reinició el servicio" || mal "la segunda corrida reinició el servicio"

kill "$TN" 2>/dev/null
log "· [$(seg) s] fin"
if [ "$FALLAS" = 0 ]; then log "NUBE_SOLO_PRUEBA verde"; exit 0; else log "NUBE_SOLO_PRUEBA FALLAS=$FALLAS"; exit 1; fi
