#!/usr/bin/env bash
# Arbrain en TU NUBE: un servidor Linux tuyo, sin pantalla, que mantiene tu cerebro corriendo con la compu apagada
# (23 oct 2026, modo espejo N3; diseño: docs/builds/cerebro-24-7-2026-10-23/DISENO.md §1.4 y §2.1). Lo corre
# INSTALAR-NUBE.md (la rama servidor de INSTALAR.md) DESPUÉS de clonar y verificar la firma de Arbrain como root o con
# sudo sin contraseña, en el servidor. Solo Debian/Ubuntu con systemd.
#
#   bash arbrain/scripts/instalar/nube.sh [instalar] [--mi-arbrain <git url>] [--usuario <nombre>]
#        [--espejo [--rol lider --cita "<palabras de la persona>" | --rol ventana]]
#   bash arbrain/scripts/instalar/nube.sh estado
#   bash arbrain/scripts/instalar/nube.sh llave            (la persona pega su llave de OpenRouter CON tope; no se ve)
#
# Qué deja (cada paso mira antes de cambiar: una segunda corrida dice cambios=0 y no reinicia nada):
#   1. Paquetes que falten: git, curl, python3, ufw, unattended-upgrades, openssh-server, bubblewrap.
#   2. SSH solo por llave (/etc/ssh/sshd_config.d/01-arbrain.conf: PasswordAuthentication no). Antes comprueba que hay
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
SSHD
}

texto_auto_upgrades() {
  cat <<'APT'
// Arbrain (nube.sh): actualizaciones automáticas de seguridad (la lista de orígenes es la de 50unattended-upgrades).
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
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
      .claude/settings.local.json|CLAUDE.local.md|.arbrain-sembrado.json|mi-negocio/*) continue ;;
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
    cambio "SSH solo con llave (sin contraseñas)"
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
  e="$(estado_servidor)"
  printf '· Arbrain: %s\n· firewall=%s ssh=%s actualizaciones=%s tailscale=%s llave=%s\n' "${e:-sin copia}" "$fw" "$ssh" "$apt" "$ts" "${llave:-falta}"
  case "$e" in
    *Corriendo*) printf 'NUBE_ESTADO servicio=%s web=http://127.0.0.1:%s firewall=%s ssh=%s actualizaciones=%s tailscale=%s llave=%s\n' "$srv" "$(puerto_web)" "$fw" "$ssh" "$apt" "$ts" "${llave:-falta}" ;;
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
  paso_tailscale
  paso_usuario
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
  printf 'NUBE_OK version=%s servicio=%s web=http://127.0.0.1:%s usuario=%s cambios=%s llave=%s tailscale=%s espejo=%s\n' \
    "${v#v}" "$(systemctl is-active "$SERVICIO")" "$(puerto_web)" "$U" "$CAMBIOS" "$(estado_llave)" "$(estado_tailscale)" "$ESPEJO"
}

[ "${NUBE_SOLO_FUNCIONES:-}" = 1 ] && return 0 2>/dev/null

ORDEN=instalar; MI_ARBRAIN=""; CON_ESPEJO=0; ESPEJO_ROL=""; ESPEJO_CITA=""
case "${1:-}" in instalar|estado|llave) ORDEN="$1"; shift ;; esac
if [ "$ORDEN" = instalar ]; then
  ARGS=("$@")
  while [ $# -gt 0 ]; do
    case "$1" in
      --mi-arbrain) MI_ARBRAIN="${2:-}"; shift 2 ;;
      --usuario) U="${2:-}"; shift 2 ;;
      --espejo) CON_ESPEJO=1; shift ;;
      --rol) ESPEJO_ROL="${2:-}"; shift 2 ;;
      --cita) ESPEJO_CITA="${2:-}"; shift 2 ;;
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
else orden_llave "$@"
fi
