#!/usr/bin/env bash
# Arbrain en TU NUBE: un servidor Linux tuyo, sin pantalla, que mantiene tu cerebro corriendo con la compu apagada
# (23 oct 2026, modo espejo N3; diseño: docs/builds/cerebro-24-7-2026-10-23/DISENO.md §1.4 y §2.1). Lo corre
# INSTALAR-NUBE.md (la rama servidor de INSTALAR.md) DESPUÉS de clonar y verificar la firma de Arbrain como root o con
# sudo sin contraseña, en el servidor. Solo Debian/Ubuntu con systemd.
#
#   bash arbrain/scripts/instalar/nube.sh [instalar] [--mi-arbrain <git url>] [--usuario <nombre>]
#        [--zona <America/Mexico_City>] [--espejo [--rol lider --cita "<palabras de la persona>" | --rol ventana]]
#   bash arbrain/scripts/instalar/nube.sh estado
#   bash arbrain/scripts/instalar/nube.sh llave            (la persona pega su llave de OpenRouter CON tope; no se ve)
#   bash arbrain/scripts/instalar/nube.sh claude           (la persona entra con su cuenta de Claude para el CHAT)
#   bash arbrain/scripts/instalar/nube.sh telefono         (publica la web SOLO en su red de Tailscale: `serve`, nunca funnel)
#   bash arbrain/scripts/instalar/nube.sh codigo           (código de un solo uso para entrar; sale solo en SU terminal)
#   bash arbrain/scripts/instalar/nube.sh conectar         (claude + llave + código, en una sola terminal de la persona)
#
# «Solo en tu servidor» (29 oct 2026; guía INSTALAR-NUBE.md): la misma instalación, sin computadora detrás. La persona
# entra desde el navegador de cualquier computadora o su teléfono por su Tailscale. El chat que ella escribe usa su
# cuenta de Claude (login oficial de Claude Code en el servidor: nunca `setup-token`); las rutinas que corren solas van
# por su llave de OpenRouter con tope (Haiku 5.5; server/src/cliente/rutinas-llave.ts). Lo que exige su terminal (login
# de Claude, llave, código) nunca pasa por la salida de quien corre este script: va a /dev/tty.
#
# Qué deja (cada paso mira antes de cambiar: una segunda corrida dice cambios=0 y no reinicia nada):
#   1. Paquetes que falten: git, curl, python3, ufw, unattended-upgrades, openssh-server, bubblewrap. Si Ubuntu 24.04
#      bloquea a bwrap sin root (AppArmor), un perfil solo para bwrap (/etc/apparmor.d/arbrain-bwrap). Con --zona, la
#      zona horaria de la persona (las rutinas corren a su hora; un VPS nace en UTC).
#   2. SSH solo por llave (/etc/ssh/sshd_config.d/01-arbrain.conf: PasswordAuthentication no; ClientAliveInterval 20
#      para que una sesión callada no la corte el router). Antes comprueba que hay
#      al menos una llave autorizada para root o para quien usa sudo: sin ella NO toca SSH (no te deja fuera).
#   3. Firewall (ufw): niega todo lo entrante salvo SSH y la red privada de Tailscale; deja salir.
#   4. Actualizaciones automáticas de seguridad (unattended-upgrades).
#   5. Tailscale instalado con su instalador oficial, SIN iniciar sesión (eso lo hace la persona: `tailscale up`).
#   6. Un usuario sin root (`arbrain`, sin contraseña ni sudo) con su copia en /home/arbrain/Arbrain: un clon de su
#      `mi-arbrain` (--mi-arbrain) o, si no hay, la copia verificada de la que sale este script. Identidad propia: lo
#      que traiga de otra máquina (.host-slug, compile-state.json, flush-state.json, store/) se aparta a
#      ~/.arbrain/identidad-ajena/ y se escribe su slug `nube-<host>`. El código de Arbrain se verifica otra vez contra
#      la etiqueta firmada; si su mi-arbrain trae código distinto de la versión firmada, se detiene.
#   7. Node 22, Python y Claude Code para ese usuario (requisitos.sh) y su capa sembrada.
#   8. El servicio de sistema `arbrain.service` (systemd): arranca con la máquina `servidor.mjs iniciar
#      --sin-navegador`, se levanta si se cae y escucha solo en 127.0.0.1.
#   9. Con --espejo, el modo espejo encendido ANTES del servicio (ver «GANCHO ESPEJO» abajo).
#  10. La llave: se pide aparte con `nube.sh llave`.
#
# Salida: líneas «+ cambié…», «= ya estaba…», «· …» y UNA línea final:
#   NUBE_OK version=<v> servicio=active web=http://127.0.0.1:<p> usuario=<u> cambios=<n> llave=<falta|tope:<usd>> tailscale=<…> espejo=<…>
#   NUBE_ESPERA <motivo>     (Arbrain está arrancando o compilando: vuelve a correr `nube.sh estado` cada 15 s)
#   NUBE_FALTA <motivo>      (necesita a la persona o el servidor no sirve; el motivo dice qué)
#   NUBE_LLAVE_GITHUB <llave pública>   (su mi-arbrain es privado: hay que darle a esta nube una llave de despliegue)
# Nunca imprime llaves ni contraseñas. Pruebas: arbrain/scripts/instalar/nube.test.sh (funciones con NUBE_RAIZ) y la
# E2E en un Ubuntu real: arbrain/scripts/instalar/nube-prueba.sh (runner de GitHub y contenedor con systemd).
# Sin pipefail a propósito: `cmd | grep -q` corta la tubería y pipefail lo leería como falla (sshd -T, ufw).
set -u

RAIZ="${NUBE_RAIZ:-}"                       # pruebas: prefijo para /etc y /home (nunca en un servidor de verdad)
U="${NUBE_USUARIO:-arbrain}"
ESPERA_SEG="${NUBE_ESPERA_SEG:-60}"
CAMBIOS=0
SERVICIO=arbrain.service
CONF_SSH="$RAIZ/etc/ssh/sshd_config.d/01-arbrain.conf"
CONF_APT="$RAIZ/etc/apt/apt.conf.d/20auto-upgrades"
UNIDAD="$RAIZ/etc/systemd/system/$SERVICIO"
# Ubuntu 23.10+ (24.04 incluido) trae kernel.apparmor_restrict_unprivileged_userns=1: un usuario sin root no puede crear
# el espacio de nombres que bwrap necesita («setting up uid map: Permission denied»), y sin bwrap Claude Code no corre.
# Probado el 27 oct en el kernel 6.8 de Ubuntu 24.04: falla sin perfil, pasa con este perfil. Solo afecta a /usr/bin/bwrap.
PERFIL_BWRAP="$RAIZ/etc/apparmor.d/arbrain-bwrap"
# bubblewrap: en Linux, Claude Code no arranca sin él cuando Arbrain le pide aislar el entorno de sus subprocesos
# (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, cliente/cofre.ts): sin bwrap ninguna rutina ni chat corre en la nube (N4, 23 oct).
PAQUETES="git curl ca-certificates python3 ufw unattended-upgrades openssh-server bubblewrap"
# Lo que nunca se copia de otra máquina (lección del 24 sep: al clonar máquinas se cruzaron identidades).
AJENOS_RE='(^|/)(\.host-slug|compile-state\.json|flush-state\.json)$|(^|/)store/'

di() { printf '· %s\n' "$*"; }
cambio() { CAMBIOS=$((CAMBIOS + 1)); printf '+ %s\n' "$*"; }
igual() { printf '= %s\n' "$*"; }
falta() { printf 'NUBE_FALTA %s\n' "$*"; exit 4; }

# ── Funciones puras (las prueba nube.test.sh) ─────────────────────────────────────────────────────────────────────────

texto_sshd() {
  cat <<'SSHD'
# Arbrain (nube.sh): SSH solo con llave. Va primero (01-) para ganarle a 50-cloud-init.conf de los proveedores.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
PubkeyAuthentication yes
# Una sesión callada (la persona buscando su llave) no se cae por el router: el servidor da señal cada 20 s (30 oct).
ClientAliveInterval 20
ClientAliveCountMax 6
SSHD
}

texto_auto_upgrades() {
  cat <<'APT'
// Arbrain (nube.sh): actualizaciones automáticas de seguridad (la lista de orígenes es la de 50unattended-upgrades).
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
}

texto_perfil_bwrap() { # <ruta de bwrap>
  cat <<PERFIL
# Arbrain (nube.sh): deja a bubblewrap crear su espacio de nombres sin root (Ubuntu 24.04 lo restringe por defecto).
abi <abi/4.0>,
include <tunables/global>

profile arbrain-bwrap $1 flags=(unconfined) {
  userns,

  include if exists <local/arbrain-bwrap>
}
PERFIL
}

# Zona IANA válida (America/Mexico_City). Pura salvo por mirar que exista en zoneinfo (NUBE_ZONEINFO en pruebas).
zona_valida() {
  printf '%s' "$1" | grep -qE '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$|^UTC$' || return 1
  [ -f "${NUBE_ZONEINFO:-/usr/share/zoneinfo}/$1" ]
}

# Escribe stdin en <ruta> solo si cambia. Devuelve 0 si escribió, 1 si ya estaba igual.
escribir_si_cambia() {
  local ruta="$1" modo="${2:-644}" tmp
  tmp="$(mktemp)"; cat > "$tmp"
  if [ -f "$ruta" ] && cmp -s "$tmp" "$ruta"; then rm -f "$tmp"; return 1; fi
  mkdir -p "$(dirname "$ruta")"
  chmod "$modo" "$tmp"; mv "$tmp" "$ruta"
  return 0
}

# nube-<host> en minúsculas, [a-z0-9-], máximo 24 (lo mismo que sanitiza .claude/hooks/host.ts).
slug_nube() {
  local h
  h="$(printf '%s' "${1%%.*}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//')"
  printf 'nube-%s' "${h:-servidor}" | cut -c1-24 | sed 's/-*$//'
}

# Lista (una por línea) las rutas de stdin que son identidad o estado de otra máquina.
rutas_ajenas() { grep -E "$AJENOS_RE" || true; }

# ¿Qué archivos de <repo> difieren de la etiqueta <v> fuera de la capa del alumno? (vacío = el código es el firmado)
# Capa: lo que el generador marca como CAPA_ALUMNO, sus skills nuevas, lo que el espejo sube del cerebro y lo que esta
# máquina aparta como ajeno.
fuera_de_capa() {
  local repo="$1" v="$2" f skill
  git -C "$repo" diff --name-only "$v" HEAD -- 2>/dev/null | while IFS= read -r f; do
    case "$f" in
      .claude/memory/*|.claude/plan/*|.claude/now.md|.claude/diario/*|.claude/daily/*|.claude/knowledge/*) continue ;;
      .claude/settings.local.json|CLAUDE.local.md|.arbrain-sembrado.json|mi-negocio/*|mi-marca/*) continue ;;
      # Lo que el modo espejo sube del cerebro (la lista CEREBRO de arbrain/scripts/espejo/lib/viaja.mjs; nube.test.sh
      # comprueba que sigan iguales): es de la persona, no código de Arbrain.
      arbrain/cerebro/meta/*|arbrain/cerebro/sentidos/*|arbrain/cerebro/memoria/*|arbrain/cerebro/manos/*|arbrain/cerebro/dolor/*) continue ;;
      arbrain/cerebro/reportes/*|arbrain/cerebro/lider.json|arbrain/cerebro/espejo.json|arbrain/cerebro/maquinas/*) continue ;;
      arbrain/cerebro/latidos/*|arbrain/cerebro/enviados/*) continue ;;
      .claude/skills/*)
        skill="${f#.claude/skills/}"; skill="${skill%%/*}"
        git -C "$repo" cat-file -e "$v:.claude/skills/$skill" 2>/dev/null || continue ;;
    esac
    printf '%s\n' "$f" | rutas_ajenas | grep -q . && continue
    printf '%s\n' "$f"
  done
}

# ── Utilidades del sistema ────────────────────────────────────────────────────────────────────────────────────────────

HOME_U() { printf '%s/home/%s' "$RAIZ" "$U"; }
# Corre un bloque de bash como el usuario de Arbrain, con un entorno limpio (nada de las variables de root).
como_u() {
  runuser -u "$U" -- env -i HOME="$(HOME_U)" USER="$U" LOGNAME="$U" SHELL=/bin/bash LANG=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin bash -c "$1"
}
instalado() { dpkg -s "$1" >/dev/null 2>&1; }
firmas() { printf '%s/.config/arbrain/firmas-permitidas' "$1"; }
verificar_etiqueta() { # <repo> <v> <ancla>
  git -C "$1" -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile="$3" verify-tag "$2" >/dev/null 2>&1
}

comprobar_servidor() {
  [ "$(uname -s)" = Linux ] || falta "esto es para un servidor Linux; en tu compu sigue INSTALAR.md normal"
  [ -d /run/systemd/system ] || falta "este Linux no arranca con systemd (¿un contenedor sin init?); usa un servidor (VPS) normal de Ubuntu o Debian"
  command -v apt-get >/dev/null 2>&1 || falta "solo sé instalar en Ubuntu o Debian (apt); renta el servidor con Ubuntu 24.04"
  if [ "$(id -u)" != 0 ]; then
    if sudo -n true 2>/dev/null; then exec sudo -n NUBE_USUARIO="$U" NUBE_ESPERA_SEG="$ESPERA_SEG" bash "$0" "$@"; fi
    falta "necesito entrar como root (o con sudo sin contraseña) en tu servidor para dejarlo seguro"
  fi
}

# Hay alguna llave SSH autorizada para root o para quien usó sudo (si no, apagar contraseñas te dejaría fuera).
hay_llave_ssh() {
  local f
  for f in "$RAIZ/root/.ssh/authorized_keys" ${SUDO_USER:+"$(getent passwd "$SUDO_USER" | cut -d: -f6)/.ssh/authorized_keys"}; do
    [ -s "$f" ] && grep -qE '^(ssh-|ecdsa-|sk-)' "$f" && return 0
  done
  return 1
}

# ── Pasos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

paso_paquetes() {
  local p faltan=""
  for p in $PAQUETES; do instalado "$p" || faltan="$faltan $p"; done
  if [ -z "$faltan" ]; then igual "paquetes del sistema"; return; fi
  di "Instalando:$faltan"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null || falta "apt-get update falló (¿sin internet?)"
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $faltan >/dev/null || falta "no pude instalar:$faltan"
  cambio "instalé:$faltan"
}

paso_ssh() {
  hay_llave_ssh || falta "tu servidor no tiene ninguna llave SSH autorizada (root ni tu usuario). Agrega la llave pública de tu laptop en el panel de tu proveedor (o en ~/.ssh/authorized_keys) y vuelve a correrme: sin ella, cerrar las contraseñas te dejaría fuera"
  # Ubuntu 24.04 arranca sshd por socket: /run/sshd lo crea el servicio al primer uso y `sshd -t` sin ella falla.
  [ -d /run/sshd ] || install -d -m 755 /run/sshd
  if texto_sshd | escribir_si_cambia "$CONF_SSH" 644; then
    if ! sshd -t 2>/tmp/arbrain-sshd.err; then
      rm -f "$CONF_SSH"; falta "sshd rechazó la configuración ($(tail -1 /tmp/arbrain-sshd.err)); no cambié SSH"
    fi
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    cambio "SSH solo con llave (sin contraseñas) y con señal cada 20 s para que no se corte"
  else
    igual "SSH solo con llave"
  fi
  # SSH tiene que quedar escuchando (el firewall lo deja pasar): por socket (Ubuntu 24.04) o como servicio.
  if ! systemctl is-active -q ssh.socket 2>/dev/null && ! systemctl is-active -q ssh.service 2>/dev/null && ! systemctl is-active -q sshd.service 2>/dev/null; then
    { systemctl enable --now ssh.service || systemctl enable --now sshd.service; } >/dev/null 2>&1 && cambio "SSH encendido" || falta "no pude encender SSH"
  fi
  sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' || falta "SSH sigue aceptando contraseñas aunque lo pedí (revisa /etc/ssh/sshd_config)"
}

puerto_ssh() { sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}'; }

paso_firewall() {
  local p estado n=0
  p="$(puerto_ssh)"; p="${p:-22}"
  estado="$(ufw status verbose 2>/dev/null)"
  printf '%s' "$estado" | grep -q "Default: deny (incoming)" || { ufw default deny incoming >/dev/null; n=1; }
  printf '%s' "$estado" | grep -q "allow (outgoing)" || { ufw default allow outgoing >/dev/null; n=1; }
  ufw show added 2>/dev/null | grep -qx "ufw allow $p/tcp" || { ufw allow "$p/tcp" >/dev/null; n=1; }
  ufw show added 2>/dev/null | grep -qx "ufw allow in on tailscale0" || { ufw allow in on tailscale0 >/dev/null; n=1; }
  printf '%s' "$estado" | grep -q "^Status: active" || { ufw --force enable >/dev/null || falta "no pude encender el firewall (ufw)"; n=1; }
  ufw status 2>/dev/null | grep -q "^Status: active" || falta "el firewall no quedó encendido"
  if [ "$n" = 1 ]; then cambio "firewall: niega lo entrante salvo SSH ($p) y Tailscale"; else igual "firewall"; fi
}

paso_actualizaciones() {
  if texto_auto_upgrades | escribir_si_cambia "$CONF_APT" 644; then cambio "actualizaciones automáticas de seguridad"; else igual "actualizaciones automáticas de seguridad"; fi
  systemctl is-enabled apt-daily-upgrade.timer >/dev/null 2>&1 || { systemctl enable --now apt-daily-upgrade.timer >/dev/null 2>&1 && cambio "temporizador de actualizaciones"; }
}

# La hora de las rutinas es la de la máquina (scheduler.ts › CRON_TZ en la edición cliente). Un VPS nace en UTC: sin esto el
# «brief de las 7» de alguien en CDMX corre a la 1:00 (hallazgo 3 de la prueba real del 26 oct).
zona_actual() { timedatectl show -p Timezone --value 2>/dev/null || readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||'; }
paso_zona() {
  local z; z="$(zona_actual)"
  if [ -z "$ZONA" ]; then
    case "$z" in ""|UTC|Etc/UTC) di "Tu nube está en hora UTC: tus rutinas correrían con esa hora. Pásame tu zona con --zona (por ejemplo America/Mexico_City)." ;; *) igual "zona horaria $z" ;; esac
    return
  fi
  zona_valida "$ZONA" || falta "no reconozco la zona horaria «$ZONA» (ejemplo: America/Mexico_City)"
  if [ "$z" = "$ZONA" ]; then igual "zona horaria $ZONA"; return; fi
  timedatectl set-timezone "$ZONA" 2>/dev/null || { ln -sf "/usr/share/zoneinfo/$ZONA" /etc/localtime && echo "$ZONA" > /etc/timezone; } || falta "no pude poner la zona $ZONA"
  ZONA_CAMBIO=1; cambio "zona horaria $ZONA (tus rutinas corren a tu hora)"
}

# bwrap tiene que funcionar como el usuario de Arbrain (va después de paso_usuario).
prueba_bwrap() { runuser -u "$U" -- "$1" --ro-bind / / --dev /dev --proc /proc --unshare-user --unshare-pid --unshare-net true >/dev/null 2>&1; }
paso_bwrap() {
  local b; b="$(command -v bwrap)" || falta "falta bubblewrap"
  if prueba_bwrap "$b"; then igual "aislamiento de Claude Code (bubblewrap)"; return; fi
  if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] && ! command -v apparmor_parser >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends apparmor >/dev/null 2>&1 || falta "no pude instalar apparmor (lo necesita bubblewrap en Ubuntu 24.04)"
  fi
  [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] && command -v apparmor_parser >/dev/null 2>&1 \
    || falta "bubblewrap no funciona como $U y no es la restricción de AppArmor de Ubuntu: sin él Claude Code no corre aquí"
  texto_perfil_bwrap "$b" | escribir_si_cambia "$PERFIL_BWRAP" 644 || true
  apparmor_parser -r "$PERFIL_BWRAP" 2>/tmp/arbrain-apparmor.err || falta "AppArmor no aceptó el perfil de bubblewrap: $(tail -1 /tmp/arbrain-apparmor.err)"
  prueba_bwrap "$b" || falta "bubblewrap sigue sin funcionar como $U aun con el perfil de AppArmor: sin él Claude Code no corre aquí"
  cambio "aislamiento de Claude Code: perfil de AppArmor para bubblewrap (Ubuntu 24.04 lo bloquea sin root)"
}

paso_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then igual "Tailscale instalado"; return; fi
  di "Instalando Tailscale (instalador oficial de tailscale.com)…"
  curl -fsSL -o /tmp/arbrain-tailscale.sh https://tailscale.com/install.sh && sh /tmp/arbrain-tailscale.sh >/tmp/arbrain-tailscale.log 2>&1 || falta "no pude instalar Tailscale: $(tail -2 /tmp/arbrain-tailscale.log)"
  command -v tailscale >/dev/null 2>&1 || falta "Tailscale no quedó instalado"
  cambio "Tailscale instalado (sin iniciar sesión: eso lo haces tú)"
}

estado_tailscale() {
  command -v tailscale >/dev/null 2>&1 || { echo no-instalado; return; }
  local s; s="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("BackendState",""))' 2>/dev/null)"
  case "$s" in Running) echo conectado ;; NeedsLogin|NoState|Stopped|"") echo sin-sesion ;; *) echo "$s" ;; esac
}

paso_usuario() {
  if id "$U" >/dev/null 2>&1; then igual "usuario $U"; else
    useradd --create-home --shell /bin/bash --user-group "$U" || falta "no pude crear el usuario $U"
    cambio "usuario $U (sin contraseña ni sudo)"
  fi
  chmod 750 "$(HOME_U)"
  id -nG "$U" | tr ' ' '\n' | grep -qxE 'sudo|wheel|admin' && falta "el usuario $U tiene permisos de administrador; Arbrain debe correr sin ellos"
  # El ancla de firmas viaja de quien verificó (root) al usuario: la misma llave pública que verificó la copia.
  local ancla_u; ancla_u="$(firmas "$(HOME_U)")"
  if [ -f "$ancla_u" ] && cmp -s "$ANCLA" "$ancla_u"; then :; else
    install -d -o "$U" -g "$U" -m 700 "$(HOME_U)/.config" "$(HOME_U)/.config/arbrain"
    install -o "$U" -g "$U" -m 644 "$ANCLA" "$ancla_u"
    cambio "ancla de firmas de Arbrain para $U"
  fi
}

# Copia de Arbrain del usuario: su mi-arbrain o la copia verificada. Nunca pisa una que ya exista.
paso_copia() {
  local dest paquete; dest="$(HOME_U)/Arbrain"
  if [ -d "$dest/.git" ]; then igual "copia de Arbrain en $dest"; else
    paquete="$(mktemp -d /tmp/arbrain-nube.XXXXXX)"; chmod 755 "$paquete"
    git -C "$ORIGEN" bundle create -q "$paquete/arbrain.bundle" --all 2>/dev/null || git -C "$ORIGEN" bundle create "$paquete/arbrain.bundle" --all >/dev/null 2>&1 || falta "no pude empaquetar la copia verificada"
    chmod 644 "$paquete/arbrain.bundle"
    if [ -n "$MI_ARBRAIN" ]; then
      preparar_github
      como_u "git clone -q --branch mi-arbrain '$MI_ARBRAIN' ~/Arbrain" >/tmp/arbrain-clon.log 2>&1 || {
        rm -f "$paquete/arbrain.bundle"; rmdir "$paquete"
        if grep -qiE 'permission denied|could not read|not found|repository .* not found' /tmp/arbrain-clon.log; then pedir_llave_github; fi
        falta "no pude clonar tu mi-arbrain: $(tail -1 /tmp/arbrain-clon.log)"
      }
      como_u "cd ~/Arbrain && git fetch -q '$paquete/arbrain.bundle' 'refs/tags/*:refs/tags/*' && git remote add dani https://github.com/arbrain-ai/arbrain.git" || falta "no pude traer las etiquetas firmadas a tu mi-arbrain"
      cambio "clon de tu mi-arbrain en $dest"
    else
      como_u "git clone -q --origin dani '$paquete/arbrain.bundle' ~/Arbrain && cd ~/Arbrain && git remote set-url dani https://github.com/arbrain-ai/arbrain.git" || falta "no pude copiar Arbrain al usuario $U"
      cambio "copia verificada de Arbrain en $dest"
    fi
    rm -f "$paquete/arbrain.bundle"; rmdir "$paquete"
  fi
  como_u "cd ~/Arbrain && { [ \"\$(git branch --show-current)\" = mi-arbrain ] || git switch -q mi-arbrain 2>/dev/null || git switch -q -c mi-arbrain; } && git config --local pull.ff only && { git config user.name >/dev/null || git config --local user.name 'Mi Arbrain (nube)'; } && { git config user.email >/dev/null || git config --local user.email 'nube@mi-arbrain.local'; }" || falta "no pude dejar la rama mi-arbrain"
  # Verificación otra vez, ahora en SU copia: la etiqueta de su VERSION firmada y el código igual al firmado.
  local v; v="v$(cat "$dest/VERSION" 2>/dev/null)"
  como_u "cd ~/Arbrain && git -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile=\$HOME/.config/arbrain/firmas-permitidas verify-tag '$v'" >/dev/null 2>&1 \
    || falta "la versión $v de tu copia no está firmada por Arbrain; no la arranco"
  local raros; raros="$(como_u "cd ~/Arbrain && AJENOS_RE='$AJENOS_RE'
$(declare -f rutas_ajenas fuera_de_capa)
fuera_de_capa . '$v'" | head -5)"
  [ -z "$raros" ] || falta "tu mi-arbrain trae código de Arbrain distinto de la versión firmada $v (por ejemplo: $(printf '%s' "$raros" | tr '\n' ' ')). Actualiza tu laptop con «actualiza mi Arbrain» y vuelve a correrme"
}

# Identidad propia: aparta lo de otra máquina y escribe su slug. Lo versionado se marca skip-worktree para no borrárselo
# a la laptop en el siguiente push (la solución de fondo es que esas rutas estén en el .gitignore del alumno).
paso_identidad() {
  local dest slug aparte n=0 f; dest="$(HOME_U)/Arbrain"
  slug="$(slug_nube "$(hostname)")"
  aparte="$(HOME_U)/.arbrain/identidad-ajena/$(date +%Y%m%d-%H%M%S)"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ "$f" = ".claude/hooks/.host-slug" ] && [ "$(cat "$dest/$f" 2>/dev/null)" = "$slug" ] && continue
    como_u "cd ~/Arbrain && git update-index --skip-worktree -- '$f'" </dev/null 2>/dev/null
    if [ -e "$dest/$f" ]; then
      como_u "mkdir -p '$aparte/$(dirname "$f")' && mv '$dest/$f' '$aparte/$f'" </dev/null; n=$((n + 1))
    fi
  done <<EOF
$(como_u "cd ~/Arbrain && git ls-files" | rutas_ajenas)
EOF
  [ "$n" = 0 ] || cambio "aparté $n archivo(s) de identidad de otra máquina en $aparte"
  local excl="$dest/.git/info/exclude" linea
  for linea in ".claude/hooks/.host-slug" ".claude/hooks/tmp/" "compile-state.json" "flush-state.json" "store/"; do
    grep -qxF "$linea" "$excl" 2>/dev/null || { printf '%s\n' "$linea" | como_u "cat >> '$excl'"; }
  done
  if [ "$(cat "$dest/.claude/hooks/.host-slug" 2>/dev/null)" = "$slug" ]; then igual "identidad de esta máquina: $slug"; else
    como_u "mkdir -p ~/Arbrain/.claude/hooks && printf '%s\n' '$slug' > ~/Arbrain/.claude/hooks/.host-slug"
    cambio "identidad de esta máquina: $slug"
  fi
}

paso_requisitos() {
  local salida
  salida="$(como_u "cd ~/Arbrain && bash arbrain/scripts/instalar/requisitos.sh" 2>&1 | tail -1)"
  case "$salida" in
    REQUISITOS_OK*) igual "requisitos de $U: ${salida#REQUISITOS_OK }" ;;
    *) falta "requisitos del usuario $U: $salida" ;;
  esac
}

# Siembra lo que falte y guarda en git SOLO lo que sembró (lo que el daemon haya escrito en su capa no se toca aquí).
paso_capa() {
  local r
  r="$(como_u '. ~/.arbrain/entorno.sh && cd ~/Arbrain && a="$(git status --porcelain -uall | sort)" && $PY arbrain/cerebro/sembrar.py >/dev/null && d="$(git status --porcelain -uall | sort)" && n="$(comm -13 <(printf "%s\n" "$a") <(printf "%s\n" "$d") | cut -c4-)" && if [ -n "$n" ]; then printf "%s\n" "$n" | while IFS= read -r f; do git add -- "$f"; done && git commit -qm "Mi capa: semilla de la versión $(cat VERSION) (nube)" && echo SEMBRE; else echo IGUAL; fi')" \
    || falta "no pude sembrar tu capa"
  case "$r" in *SEMBRE*) cambio "capa sembrada y guardada en tu rama mi-arbrain" ;; *) igual "capa sembrada" ;; esac
}

texto_unidad() {
  como_u ". ~/.arbrain/entorno.sh && cd ~/Arbrain/arbrain && node --input-type=module -e '
    const m = await import(\"./scripts/servidor/arranque-auto.mjs\")
    const h = process.env.HOME, node = process.execPath
    const path = [node.slice(0, node.lastIndexOf(\"/\")), h + \"/.local/bin\", \"/usr/local/bin\", \"/usr/bin\", \"/bin\"].join(\":\")
    const datos = h + \"/.local/share/ai.arbrain.servidor\"
    process.stdout.write(m.unidadSystemdSistema({ comando: m.comandoArranque({ node, script: process.cwd() + \"/scripts/servidor.mjs\", datos }), path, usuario: process.env.USER, home: h, dir: process.cwd() }))
  '"
}

paso_servicio() {
  local texto
  texto="$(texto_unidad)" || falta "no pude armar el servicio de systemd"
  [ -n "$texto" ] || falta "el servicio de systemd salió vacío"
  if printf '%s\n' "$texto" | escribir_si_cambia "$UNIDAD" 644; then
    systemctl daemon-reload
    systemctl enable "$SERVICIO" >/dev/null 2>&1 || falta "systemd no aceptó $SERVICIO"
    if systemctl is-active -q "$SERVICIO"; then systemctl restart "$SERVICIO"; else systemctl start "$SERVICIO"; fi
    cambio "servicio $SERVICIO: arranca con el servidor y se levanta si se cae"
  else
    systemctl is-enabled -q "$SERVICIO" || { systemctl enable "$SERVICIO" >/dev/null 2>&1; cambio "servicio habilitado al arranque"; }
    if ! systemctl is-active -q "$SERVICIO"; then systemctl start "$SERVICIO"; cambio "servicio $SERVICIO encendido"
    elif [ "${ESPEJO_CAMBIO:-0}" = 1 ]; then systemctl restart "$SERVICIO"; cambio "servicio $SERVICIO reiniciado para tomar el espejo"
    elif [ "${ZONA_CAMBIO:-0}" = 1 ]; then systemctl restart "$SERVICIO"; cambio "servicio $SERVICIO reiniciado para tomar tu zona horaria"
    else igual "servicio $SERVICIO activo"; fi
  fi
}

# ── GANCHO ESPEJO ────────────────────────────────────────────────────────────────────────────────────────────────────
# Enciende el modo espejo (motor: arbrain/scripts/espejo/, contrato en docs/builds/modo-espejo-2026-10-23/motor/CONTRATO.md)
# si la persona lo pidió (--espejo) y la copia trae el motor. Va ANTES del servicio: el modo servidor decide su rol y su
# ciclo de sincronización al arrancar, así que si el espejo cambia con el servicio ya vivo, se reinicia (paso_servicio).
#   --espejo                      esta nube entra al espejo como ventana (no corre rutinas hasta que la persona elija)
#   --espejo --rol lider --cita   además queda al mando, con las palabras de la persona («que la nube mande»). Sin cita
#                                 no se elige: nadie se autopromueve (DISENO §2.2).
# El nombre de la nube en el espejo es su identidad (`nube-<host>`, la misma de .host-slug). Una segunda corrida con el
# mismo pedido no cambia nada. El espejo nace apagado (beta): sin --espejo esto solo informa.
ESPEJO_MJS="arbrain/scripts/espejo/espejo.mjs"
# Lee el estado del espejo (JSON de `espejo.mjs estado --json`) y lo deja en «activo host lider» (pura: la prueba nube.test.sh).
campos_espejo() { python3 -c 'import json,sys
try: j=json.loads(sys.stdin.read().strip().splitlines()[-1])
except Exception: j={}
print("si" if j.get("activo") else "no", j.get("host") or "-", j.get("lider") or "-")' 2>/dev/null || echo "no - -"; }
# ¿Hay que hacer algo? <activo> <host actual> <líder actual> <host pedido> <rol pedido> → nada | activar | elegir | otro-nombre
plan_espejo() {
  local activo="$1" host="$2" lider="$3" quiero="$4" rol="$5"
  if [ "$host" != "-" ] && [ "$host" != "$quiero" ]; then echo otro-nombre; return; fi
  if [ "$activo" != si ]; then echo activar; return; fi
  if [ "$rol" = lider ] && [ "$lider" != "$quiero" ]; then echo elegir; return; fi
  echo nada
}
gancho_espejo() {
  ESPEJO_CAMBIO=0
  local dest; dest="$(HOME_U)/Arbrain"
  if [ ! -f "$dest/$ESPEJO_MJS" ]; then ESPEJO=pendiente-motor; return; fi
  if [ "$CON_ESPEJO" != 1 ]; then ESPEJO=disponible-apagado; return; fi
  if [ -z "$(como_u "cd ~/Arbrain && git remote get-url origin 2>/dev/null")" ]; then ESPEJO=falta-mi-arbrain; return; fi
  local host est plan
  host="$(slug_nube "$(hostname)")"
  est="$(como_u ". ~/.arbrain/entorno.sh && cd ~/Arbrain && node $ESPEJO_MJS estado --json" </dev/null 2>/dev/null | campos_espejo)"
  # shellcheck disable=SC2086
  plan="$(plan_espejo $est "$host" "$ESPEJO_ROL")"
  case "$plan" in
    nada) igual "espejo encendido como $host ($([ "$ESPEJO_ROL" = lider ] && echo 'manda' || echo "manda ${est##* }"))"; ESPEJO="activo:$host"; return ;;
    otro-nombre) ESPEJO="fallo:esta_copia_ya_esta_en_el_espejo_con_otro_nombre_(${est#* })"; return ;;
  esac
  if [ "$plan" = activar ]; then
    como_u ". ~/.arbrain/entorno.sh && cd ~/Arbrain && node $ESPEJO_MJS activar --host '$host'" </dev/null >/tmp/arbrain-espejo.log 2>&1 \
      || { ESPEJO="fallo:$(tail -1 /tmp/arbrain-espejo.log | tr ' ' '_')"; return; }
    cambio "espejo encendido: esta nube es $host ($(tail -1 /tmp/arbrain-espejo.log | sed 's/^ESPEJO_[A-Z_]* //'))"
    ESPEJO_CAMBIO=1
  fi
  if [ "$ESPEJO_ROL" = lider ]; then
    # La cita viaja por stdin (nunca dentro de un comando de shell armado con texto de la persona).
    printf '%s' "$ESPEJO_CITA" | como_u ". ~/.arbrain/entorno.sh && cd ~/Arbrain && node $ESPEJO_MJS lider elegir '$host' --cita-stdin" >/tmp/arbrain-espejo.log 2>&1 \
      || { ESPEJO="fallo:$(tail -1 /tmp/arbrain-espejo.log | tr ' ' '_')"; return; }
    cambio "al mando: $host (elegido por ti: «$ESPEJO_CITA»)"
    ESPEJO_CAMBIO=1
  fi
  ESPEJO="activo:$host"
}

# ── GitHub (solo con --mi-arbrain por SSH): llave de despliegue propia de esta nube, solo para ese repo ───────────────
preparar_github() {
  case "$MI_ARBRAIN" in git@github.com:*|ssh://git@github.com/*) ;; *) return ;; esac
  local h; h="$(HOME_U)"
  [ -f "$h/.ssh/mi-arbrain" ] || {
    install -d -o "$U" -g "$U" -m 700 "$h/.ssh"
    como_u "ssh-keygen -q -t ed25519 -N '' -C 'arbrain-nube-$(hostname)' -f ~/.ssh/mi-arbrain" || falta "no pude crear la llave de despliegue"
    cambio "llave de despliegue de esta nube para tu mi-arbrain"
  }
  # Huella de github.com: la publicada en api.github.com (HTTPS) y, si no responde, la conocida.
  local kh="$h/.ssh/known_hosts"
  grep -q '^github.com ssh-ed25519 ' "$kh" 2>/dev/null || {
    { curl -fsSL https://api.github.com/meta 2>/dev/null | python3 -c 'import json,sys; [print("github.com",k) for k in json.load(sys.stdin)["ssh_keys"]]' 2>/dev/null \
      || echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'; } | como_u "cat >> ~/.ssh/known_hosts"
  }
  como_u "git config --global core.sshCommand 'ssh -i ~/.ssh/mi-arbrain -o IdentitiesOnly=yes'"
}
pedir_llave_github() {
  local pub; pub="$(cat "$(HOME_U)/.ssh/mi-arbrain.pub" 2>/dev/null)"
  [ -n "$pub" ] || return 0
  printf 'NUBE_LLAVE_GITHUB %s\n' "$pub"
  exit 3
}

# ── Órdenes ───────────────────────────────────────────────────────────────────────────────────────────────────────────

estado_servidor() { como_u ". ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain 2>/dev/null && node scripts/servidor.mjs estado 2>/dev/null | head -1"; }
estado_llave() { como_u ". ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain 2>/dev/null && node scripts/instalar/nube-llave.mjs estado 2>/dev/null" | sed -n 's/^NUBE_LLAVE estado=//p'; }
puerto_web() { estado_servidor | sed -n 's|.*http://127\.0\.0\.1:\([0-9]*\).*|\1|p'; }

orden_estado() {
  [ "$(id -u)" = 0 ] || { sudo -n true 2>/dev/null && exec sudo -n bash "$0" estado; falta "necesito root para revisar el firewall y SSH"; }
  local e srv fw ssh apt ts llave
  [ -d /run/sshd ] || install -d -m 755 /run/sshd
  srv="$(systemctl is-active "$SERVICIO" 2>/dev/null)"
  fw="$(ufw status 2>/dev/null | grep -q '^Status: active' && ufw status verbose | grep -q 'Default: deny (incoming)' && echo niega-entrantes || echo apagado)"
  ssh="$(sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' && echo solo-llave || echo acepta-contrasenas)"
  apt="$(apt-config dump 2>/dev/null | grep -q 'APT::Periodic::Unattended-Upgrade "1"' && echo si || echo no)"
  ts="$(estado_tailscale)"; llave="$(estado_llave)"
  # El chat: su cuenta de Claude (motor «Mi Claude Code» con sesión), su llave de OpenRouter, o nada todavía.
  local chat tel s
  s="$(sesion_claude)"
  case "$(motor_elegido):$s" in
    suscripcion:si*) chat="claude:${s#si }" ;;
    suscripcion:*) chat=claude-sin-sesion ;;
    *) case "${llave:-falta}" in falta) chat=falta ;; *) chat=openrouter ;; esac ;;
  esac
  tel="$(como_u '. ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain 2>/dev/null && node scripts/servidor.mjs telefono estado 2>/dev/null' </dev/null | grep '^TELEFONO_' | tail -1)"
  case "$tel" in "TELEFONO_ENCENDIDO "*) tel="${tel#TELEFONO_ENCENDIDO }" ;; *) tel=apagado ;; esac
  e="$(estado_servidor)"
  printf '· Arbrain: %s\n· firewall=%s ssh=%s actualizaciones=%s tailscale=%s llave=%s chat=%s tailnet=%s\n' "${e:-sin copia}" "$fw" "$ssh" "$apt" "$ts" "${llave:-falta}" "$chat" "$tel"
  case "$e" in
    *Corriendo*) printf 'NUBE_ESTADO servicio=%s web=http://127.0.0.1:%s firewall=%s ssh=%s actualizaciones=%s tailscale=%s llave=%s chat=%s tailnet=%s zona=%s\n' "$srv" "$(puerto_web)" "$fw" "$ssh" "$apt" "$ts" "${llave:-falta}" "$chat" "$tel" "$(zona_actual)" ;;
    *) printf 'NUBE_ESPERA Arbrain todavía no responde (servicio %s); la primera vez baja o compila el programa: vuelve a revisar en 15 s. Registro: journalctl -u arbrain -n 30\n' "$srv"; exit 3 ;;
  esac
}

orden_llave() {
  local yo="$U"
  if [ "$(id -u)" = 0 ]; then :; elif [ "$(id -un)" = "$U" ]; then :; else
    sudo -n true 2>/dev/null && exec sudo -n bash "$0" llave "$@"; falta "corre esto como root o como $U"
  fi
  local llave
  if [ "${1:-}" = "--stdin" ]; then IFS= read -r llave || true
  else
    [ -r /dev/tty ] || falta "necesito una terminal para que pegues tu llave sin que nadie la vea"
    printf 'Pega tu llave de OpenRouter para tu nube (la de tope, no la de tu laptop). No se ve al pegar: ' > /dev/tty
    IFS= read -rs llave < /dev/tty || true; printf '\n' > /dev/tty
  fi
  local salida
  if [ "$(id -u)" = 0 ]; then
    salida="$(printf '%s' "$llave" | runuser -u "$yo" -- env -i HOME="$(HOME_U)" PATH=/usr/local/bin:/usr/bin:/bin ${NUBE_OPENROUTER_API:+NUBE_OPENROUTER_API="$NUBE_OPENROUTER_API"} bash -c '. ~/.arbrain/entorno.sh; cd ~/Arbrain/arbrain && node scripts/instalar/nube-llave.mjs guardar --datos "$HOME/.local/share/ai.arbrain.servidor"')"
  else
    salida="$(printf '%s' "$llave" | bash -c '. ~/.arbrain/entorno.sh; cd ~/Arbrain/arbrain && node scripts/instalar/nube-llave.mjs guardar --datos "$HOME/.local/share/ai.arbrain.servidor"')"
  fi
  llave=""
  printf '%s\n' "$salida" | grep -v '^NUBE_LLAVE' || true
  case "$salida" in
    *NUBE_LLAVE_OK*)
      # El daemon toma las llaves al arrancar: se reinicia el servicio (con root) o se detiene y systemd lo levanta.
      # shellcheck disable=SC1090
      if [ "$(id -u)" = 0 ]; then systemctl restart "$SERVICIO"; else (cd ~/Arbrain/arbrain && . ~/.arbrain/entorno.sh && node scripts/servidor.mjs detener >/dev/null); fi
      printf '%s\n' "$salida" | grep '^NUBE_LLAVE_OK' ;;
    *) printf '%s\n' "$salida" | grep '^NUBE_LLAVE_FALTA' || echo "NUBE_LLAVE_FALTA no pude guardar la llave"; exit 4 ;;
  esac
}

# ── Lo que hace la persona en SU terminal (29 oct 2026): nada de esto sale por stdout ──────────────────────────────────

# ¿Hay una terminal de verdad? (`[ -r /dev/tty ]` mira permisos; abrirla es lo que falla sin terminal.)
hay_terminal() { { : < /dev/tty; } 2>/dev/null; }
# Como el usuario de Arbrain, con la terminal de la persona (entra y sale por /dev/tty, nunca por quien lanzó esto).
como_u_tty() {
  runuser -u "$U" -- env -i HOME="$(HOME_U)" USER="$U" LOGNAME="$U" SHELL=/bin/bash LANG=C.UTF-8 TERM="${TERM:-xterm-256color}" \
    PATH=/usr/local/bin:/usr/bin:/bin bash -c "$1" < /dev/tty > /dev/tty 2>&1
}

# El enlace de `claude auth login`, solo y clicable (30 oct 2026, VPS real): Claude Code lo pinta tras «visit:», en
# color, y la terminal lo parte en 5 o 6 renglones; copiarlo o abrirlo no era fluido (Terminal de Mac y la de Arbrain).
# `python3 -c "$ENLACE_PY" <orden…>` corre la orden en una pseudo-terminal propia y pasa todo tal cual en las dos
# direcciones; cuando ve el enlace de autorización lo vuelve a escribir en su propio renglón, sin prefijo ni color y
# como hipervínculo (OSC 8), justo antes de «Paste code here». Solo mira la SALIDA buscando ese enlace (que no es
# secreto: lleva el reto PKCE, no el código); lo que la persona escribe o pega va directo a Claude Code y no se lee ni
# se guarda. Si algo falla al buscar, sigue pasando todo sin tocarlo. La prueba: nube.test.sh.
ENLACE_PY='import os, pty, re, select, signal, struct, sys, termios, fcntl, tty
ENLACE = re.compile(rb"https://[A-Za-z0-9.-]+/[^\s\x07\x1b\"<>]*authorize\?[^\s\x07\x1b\"<>]*state=[^\s\x07\x1b\"<>]+(?=[\s\x07\x1b])")
def bloque(url):
    u = url.decode("ascii", "replace")
    return ("\r\n  Tu enlace para entrar, solo (clic para abrirlo; o selecciónalo completo y cópialo):\r\n\r\n"
            "\x1b]8;;" + u + "\x07" + u + "\x1b]8;;\x07\r\n\r\n").encode()
pid, fd = pty.fork()
if pid == 0:
    try: os.execvp(sys.argv[1], sys.argv[1:])
    finally: os._exit(127)
ent, sal = sys.stdin.fileno(), sys.stdout.fileno()
es_tty = os.isatty(ent)
def tamano(*_):
    try: fcntl.ioctl(fd, termios.TIOCSWINSZ, fcntl.ioctl(ent, termios.TIOCGWINSZ, b"\0" * 8))
    except Exception: pass
viejo = None
if es_tty:
    tamano(); signal.signal(signal.SIGWINCH, tamano)
    viejo = termios.tcgetattr(ent); tty.setraw(ent)
else:   # sin persona delante (pruebas): sin eco, así lo que entra nunca vuelve a salir
    a = termios.tcgetattr(fd); a[3] &= ~termios.ECHO; termios.tcsetattr(fd, termios.TCSANOW, a)
def escribe(b):
    while b: b = b[os.write(sal, b):]
cola, fase, fin, url = b"", "busca", -1, b""   # busca → linea (vio el enlace, espera el fin de su renglón) → listo
abierta = True
try:
    while True:
        fds = [fd] + ([ent] if abierta else [])
        try: listos = select.select(fds, [], [], 0.4)[0]
        except InterruptedError: continue
        if ent in listos:
            d = os.read(ent, 4096)
            if d: os.write(fd, d)
            else: abierta = False; es_tty or os.write(fd, b"\x04")   # fin de la entrada: EOF a la orden
        if fd in listos:
            try: d = os.read(fd, 65536)
            except OSError: d = b""
            if not d: escribe(cola); break
            cola += d
        try:
            if fase == "busca":
                m = ENLACE.search(cola)
                if m: url, fin, fase = m.group(0), m.end(), "linea"
                else:
                    corte = max(cola.rfind(b"https://"), cola.rfind(b"\x1b]8;"))
                    if corte < 0 or len(cola) - corte > 8192 or not listos: corte = len(cola)
                    escribe(cola[:corte]); cola = cola[corte:]
            if fase == "linea":
                n = cola.find(b"\n", fin)
                if n >= 0: escribe(cola[:n + 1] + bloque(url)); cola = cola[n + 1:]; fase = "listo"
                elif not listos: escribe(cola + b"\r\n" + bloque(url)); cola = b""; fase = "listo"
            if fase == "listo": escribe(cola); cola = b""
        except Exception:
            escribe(cola); cola = b""; fase = "listo"
finally:
    if viejo is not None: termios.tcsetattr(ent, termios.TCSAFLUSH, viejo)
sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]))'
# Vuelve a correr la orden como root si hace falta (con sudo sin contraseña).
a_root() {
  [ "$(id -u)" = 0 ] && return 0
  sudo -n true 2>/dev/null && exec sudo -n NUBE_USUARIO="$U" bash "$0" "$@"
  falta "necesito root (o sudo sin contraseña) en tu servidor para «$1»"
}
DATOS_U() { printf '%s/.local/share/ai.arbrain.servidor' "$(HOME_U)"; }
CONFIG_U() { printf '%s/daemon/config' "$(DATOS_U)"; }

# `claude auth status --json` del usuario de Arbrain → «si <plan>» o «no». Solo método y plan, nunca correo ni organización.
LEER_SESION_PY='import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
ok=d.get("loggedIn") is True and d.get("apiProvider") in (None,"firstParty") and bool(d.get("subscriptionType"))
print("si "+str(d.get("subscriptionType")) if ok else "no")'
sesion_claude() {
  como_u '. ~/.arbrain/entorno.sh 2>/dev/null; claude auth status --json 2>/dev/null' </dev/null | python3 -c "$LEER_SESION_PY" 2>/dev/null || echo no
}
LEER_MOTOR_PY='import json,sys
try: print(json.load(open(sys.argv[1])).get("motor") or "-")
except Exception: print("-")'
motor_elegido() { python3 -c "$LEER_MOTOR_PY" "$(CONFIG_U)/motor-claude.json" 2>/dev/null || echo -; }

esperar_corriendo() { # <segundos>
  local t=0
  while [ "$t" -lt "$1" ]; do estado_servidor | grep -q Corriendo && return 0; sleep 3; t=$((t + 3)); done
  return 1
}

# El chat con SU cuenta de Claude: el login OFICIAL de Claude Code (`claude auth login`) en su terminal. Claude Code
# muestra un enlace; ella entra en el navegador de su teléfono o su compu y, si le muestra un código, lo pega en esa
# terminal (code.claude.com/docs/en/authentication). Claude Code guarda la sesión en ~/.claude/.credentials.json (0600)
# del usuario de Arbrain; este script no la lee. Luego fija el motor «Mi Claude Code» y reinicia el servicio.
orden_claude() {
  a_root claude
  hay_terminal || { echo "NUBE_CLAUDE_FALTA necesito tu terminal: corre esto tú (ssh -t a tu servidor), no Claude"; exit 4; }
  como_u '. ~/.arbrain/entorno.sh 2>/dev/null; command -v claude' </dev/null >/dev/null || { echo "NUBE_CLAUDE_FALTA no encuentro Claude Code en tu servidor; vuelve a correr la instalación"; exit 4; }
  if [ "$(sesion_claude)" = no ]; then
    printf '\nEntra con tu cuenta de Claude (Pro o Max) para que el chat de tu Arbrain use tu plan.\n' > /dev/tty
    printf 'Claude Code te muestra un enlace (abajo te lo repito solo, listo para abrir o copiar): ábrelo en tu\n' > /dev/tty
    printf 'teléfono o tu compu, entra y autoriza; si te muestra un código, pégalo aquí. Las rutinas automáticas no\n' > /dev/tty
    printf 'usan tu plan: van por tu llave de OpenRouter con tope.\n\n' > /dev/tty
    como_u_tty ". ~/.arbrain/entorno.sh 2>/dev/null; CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 python3 -c $(printf %q "$ENLACE_PY") claude auth login --claudeai" || true
  fi
  local s; s="$(sesion_claude)"
  case "$s" in si*) ;; *) echo "NUBE_CLAUDE_FALTA no quedó la sesión de tu cuenta de Claude (¿se cerró o venció el enlace?); vuelve a correr: nube.sh claude"; exit 4 ;; esac
  if [ "$(motor_elegido)" != suscripcion ]; then
    printf '{"motor":"suscripcion","elegido":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | como_u "umask 077; mkdir -p '$(CONFIG_U)' && cat > '$(CONFIG_U)/motor-claude.json'"
    systemctl restart "$SERVICIO" 2>/dev/null || true
  fi
  echo "NUBE_CLAUDE_OK plan=${s#si }"
}

# La web SOLO dentro de su red de Tailscale (`tailscale serve` hacia 127.0.0.1; nunca funnel ni puertos abiertos). El
# usuario de Arbrain queda como operador de Tailscale para publicar sin root. La última línea es la de TELEFONO.md.
orden_telefono() {
  a_root telefono
  command -v tailscale >/dev/null 2>&1 || falta "Tailscale no está instalado; vuelve a correr la instalación"
  tailscale set --operator="$U" >/dev/null 2>&1 || true
  esperar_corriendo 90 || { echo "TELEFONO_SIN_SERVIDOR"; exit 3; }
  local out
  out="$(como_u '. ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain && node scripts/servidor.mjs telefono encender' </dev/null 2>&1)"
  printf '%s\n' "$out" | grep -v '^TELEFONO_' | sed 's/^\[arbrain\] /· /'
  printf '%s\n' "$out" | grep '^TELEFONO_' | tail -1
}

# Código de un solo uso (10 minutos) para entrar desde el navegador: se escribe SOLO en la terminal de la persona.
orden_codigo() {
  a_root codigo
  hay_terminal || { echo "NUBE_CODIGO_FALTA necesito tu terminal: corre esto tú (ssh -t a tu servidor), no Claude"; exit 4; }
  esperar_corriendo 90 || { echo "NUBE_CODIGO_FALTA Arbrain no está corriendo (revisa: nube.sh estado)"; exit 3; }
  local out url
  out="$(como_u '. ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain && node scripts/servidor.mjs telefono codigo' </dev/null 2>/dev/null | tail -1)"
  url="$(como_u '. ~/.arbrain/entorno.sh 2>/dev/null; cd ~/Arbrain/arbrain && node scripts/servidor.mjs telefono estado' </dev/null 2>/dev/null | sed -n 's/^TELEFONO_ENCENDIDO //p' | tail -1)"
  case "$out" in
    "TELEFONO_CODIGO "*)
      printf '\n  Abre %s en tu teléfono o tu compu (con Tailscale encendido)\n  y escribe este código (un solo uso, 10 minutos):  %s\n\n' "${url:-la dirección .ts.net de tu servidor}" "${out#TELEFONO_CODIGO }" > /dev/tty
      out=""; echo "NUBE_CODIGO_OK ${url:-sin-telefono}" ;;
    *) echo "NUBE_CODIGO_FALTA no pude pedir el código ($out)"; exit 4 ;;
  esac
}

# Lo que solo ella puede hacer, en UNA terminal: su cuenta de Claude (chat), su llave con tope (rutinas) y su código.
# Se puede volver a correr (30 oct 2026, VPS real: la sesión SSH se cortó a mitad mientras buscaba su llave): lo que ya
# quedó (su sesión de Claude, su llave con tope) se dice y se salta; el código es de un solo uso y siempre se da uno.
orden_conectar() {
  a_root conectar
  hay_terminal || { echo "NUBE_CONECTAR_FALTA necesito tu terminal: corre esto tú (ssh -t a tu servidor), no Claude"; exit 4; }
  local r c l k s t
  s="$(sesion_claude)"
  if [ "$(motor_elegido)" = suscripcion ] && [ "${s%% *}" = si ]; then
    printf '\n1/3 · Tu cuenta de Claude ya está conectada (plan %s): no hay que hacer nada.\n' "${s#si }" > /dev/tty
    c="NUBE_CLAUDE_OK plan=${s#si }"
  else
    printf '\n1/3 · ¿Pagas Claude Pro o Max y quieres que el chat use tu cuenta? [S/n] ' > /dev/tty
    IFS= read -r r < /dev/tty || r=n
    case "$r" in n|N|no|NO) c=saltado ;; *) c="$(bash "$0" claude 2>&1 | tail -1)" ;; esac
  fi
  t="$(estado_llave)"
  case "$t" in
    tope:*)
      printf '\n2/3 · Tu llave de OpenRouter ya está guardada (tope %s USD). Para cambiarla: nube.sh llave\n' "${t#tope:}" > /dev/tty
      l="NUBE_LLAVE_OK tope=${t#tope:}" ;;
    *)
      printf '\n2/3 · Tu llave de OpenRouter con tope, para las rutinas (Enter vacío para hacerlo después).\n' > /dev/tty
      printf '      Créala en https://openrouter.ai/settings/keys con «Credit limit» (por ejemplo 10).\n' > /dev/tty
      l="$(bash "$0" llave 2>&1 | tail -1)" ;;
  esac
  printf '\n3/3 · Tu código para entrar desde el navegador.\n' > /dev/tty
  k="$(bash "$0" codigo 2>&1 | tail -1)"
  printf 'NUBE_CONECTAR claude=%s llave=%s codigo=%s\n' "${c%% *}" "${l%% *}" "${k%% *}"
}

orden_instalar() {
  comprobar_servidor instalar "$@"
  ORIGEN="$(cd "$(dirname "$0")/../../.." && pwd)"
  ANCLA="$(firmas "$HOME")"
  [ -s "$ANCLA" ] || falta "no encuentro el ancla de firmas ($ANCLA): primero haz el PASO 3 de INSTALAR.md en este servidor"
  local v; v="v$(cat "$ORIGEN/VERSION")"
  verificar_etiqueta "$ORIGEN" "$v" "$ANCLA" || falta "la copia de la que salgo ($ORIGEN) no verifica la firma de $v; no instalo nada"
  [ -z "$(fuera_de_capa "$ORIGEN" "$v")" ] || falta "la copia de la que salgo tiene código distinto de la versión firmada $v"
  di "Arbrain $v verificado. Preparo tu nube (servidor $(hostname))."
  paso_paquetes
  paso_ssh
  paso_firewall
  paso_actualizaciones
  paso_zona
  paso_tailscale
  paso_usuario
  paso_bwrap
  paso_copia
  paso_identidad
  paso_requisitos
  paso_capa
  ESPEJO=pendiente-motor; gancho_espejo
  paso_servicio
  local t=0 e
  while :; do
    e="$(estado_servidor)"
    case "$e" in *Corriendo*) break ;; esac
    [ "$t" -ge "$ESPERA_SEG" ] && { printf 'NUBE_ESPERA Arbrain arrancando (la primera vez baja o compila el programa, de 2 a 15 minutos); revisa con: bash %s estado · cambios=%s\n' "$0" "$CAMBIOS"; exit 3; }
    sleep 5; t=$((t + 5))
  done
  printf 'NUBE_OK version=%s servicio=%s web=http://127.0.0.1:%s usuario=%s cambios=%s llave=%s tailscale=%s espejo=%s zona=%s\n' \
    "${v#v}" "$(systemctl is-active "$SERVICIO")" "$(puerto_web)" "$U" "$CAMBIOS" "$(estado_llave)" "$(estado_tailscale)" "$ESPEJO" "$(zona_actual)"
}

[ "${NUBE_SOLO_FUNCIONES:-}" = 1 ] && return 0 2>/dev/null

ORDEN=instalar; MI_ARBRAIN=""; ZONA=""; CON_ESPEJO=0; ESPEJO_ROL=""; ESPEJO_CITA=""
case "${1:-}" in instalar|estado|llave|claude|telefono|codigo|conectar) ORDEN="$1"; shift ;; esac
if [ "$ORDEN" = instalar ]; then
  ARGS=("$@")
  while [ $# -gt 0 ]; do
    case "$1" in
      --mi-arbrain) MI_ARBRAIN="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
      --usuario) U="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
      --zona) ZONA="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
      --espejo) CON_ESPEJO=1; shift ;;
      --rol) ESPEJO_ROL="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
      --cita) ESPEJO_CITA="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
      *) falta "opción desconocida: $1" ;;
    esac
  done
  case "$U" in [a-z_]*) ;; *) falta "usuario no válido: $U" ;; esac
  printf '%s' "$U" | grep -qE '^[a-z_][a-z0-9_-]{0,31}$' || falta "usuario no válido: $U"
  case "$ESPEJO_ROL" in ""|lider|ventana) ;; *) falta "--rol solo puede ser lider o ventana" ;; esac
  [ "$ESPEJO_ROL" != lider ] || [ "$CON_ESPEJO" = 1 ] || falta "--rol lider va con --espejo"
  [ "$ESPEJO_ROL" != lider ] || [ "${#ESPEJO_CITA}" -ge 3 ] || falta "para que esta nube mande necesito las palabras de la persona: --cita \"<lo que dijo, por ejemplo: que la nube mande>\". Nadie se autopromueve"
  orden_instalar ${ARGS[@]+"${ARGS[@]}"}
elif [ "$ORDEN" = estado ]; then orden_estado
elif [ "$ORDEN" = claude ]; then orden_claude
elif [ "$ORDEN" = telefono ]; then orden_telefono
elif [ "$ORDEN" = codigo ]; then orden_codigo
elif [ "$ORDEN" = conectar ]; then orden_conectar
else orden_llave "$@"
fi
