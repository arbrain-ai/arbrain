#!/usr/bin/env bash
# Pantalla virtual del modo servidor (1 nov 2026; diseño y evidencia: docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md).
# Le da manos a Levy en TU NUBE: una pantalla que no existe físicamente (Xvfb), con un navegador real (Google Chrome) y
# el puente de accesibilidad de Linux (AT-SPI), para que abra sitios, los lea y llene formularios con tu compu apagada.
# Tú la ves en vivo desde tu Arbrain o tu teléfono (Ajustes › Computer use › «Ver la pantalla de tu servidor»), solo
# por tu red privada de Tailscale y con tu sesión: no abre ningún puerto a internet y no toca el firewall.
#
#   bash arbrain/scripts/instalar/nube.sh pantalla           (nube.sh solo despacha a este archivo)
#   bash arbrain/scripts/instalar/pantalla.sh [instalar]
#   bash arbrain/scripts/instalar/pantalla.sh estado
#   bash arbrain/scripts/instalar/pantalla.sh quitar          (quita el marcador: computer use vuelve a «no disponible»)
#
# Corre como root (o con sudo sin contraseña) en el servidor, después de nube.sh. Solo Ubuntu/Debian amd64 con apt.
# Qué deja (cada paso mira antes de cambiar: una segunda corrida dice cambios=0):
#   1. Paquetes de Ubuntu (sus repositorios firmados): la pantalla (xvfb, xauth), el gestor de ventanas que da el foco
#      (openbox), el bus de sesión y el de accesibilidad (dbus, at-spi2-core), lo que usa el ayudante de las manos
#      (python3-pyatspi, python3-xlib, python3-pil, xdotool) y fuentes para que las páginas se lean (con emoji).
#   2. Google Chrome estable desde el repositorio firmado de Google. Para la primera instalación se baja su llave, se
#      comprueba su huella y queda en /etc/apt/keyrings con un repo `signed-by` (esa llave solo vale para ese repo).
#      Desde Chrome 156 el propio paquete migra ese repo a su `google-chrome.sources` (deb822, firmado con su llavero de
#      /usr/share/keyrings); a partir de ahí este script deja que el paquete lo mantenga y quita el de arranque para que
#      no haya dos. Por qué Chrome y no Chromium: en Ubuntu 24.04 Chromium es un snap, y un snap dentro de un servicio de
#      systemd (sin sesión de escritorio) suele no arrancar; el .deb de Google sí, y Ubuntu ya trae su perfil de AppArmor
#      (`/etc/apparmor.d/chrome`, con userns) para que su sandbox funcione sin root.
#   3. Políticas de Chrome solo para lo que no debe pasar en una pantalla sin dueño mirando: sin gestor de contraseñas,
#      sin autocompletar tarjetas ni direcciones, sin seguir vivo en segundo plano, sin preguntar si es el predeterminado.
#   4. El marcador /etc/arbrain/pantalla-virtual.json (de root, 644). La edición cliente de Arbrain lo lee para ofrecer
#      computer use en Linux. Lo pone root: Levy (que corre sin root) no puede «instalarse» la pantalla él solo. El
#      interruptor de Ajustes sigue naciendo APAGADO: lo enciende la persona.
#   5. La pantalla NO arranca aquí: la enciende el ayudante de las manos la primera vez que Levy la usa y se apaga sola
#      tras un rato sin uso (arbrain/server/manos-linux/manos_linux.py).
#
# Salida: líneas «+ cambié…», «= ya estaba…», «· …» y UNA línea final:
#   PANTALLA_OK navegador=<versión> marcador=<ruta> cambios=<n>
#   PANTALLA_FALTA <motivo>
# Nunca imprime llaves ni contraseñas. Pruebas de las funciones puras: arbrain/scripts/instalar/pantalla.test.sh.
set -u

RAIZ="${PANTALLA_RAIZ:-}"                   # pruebas: prefijo para /etc (nunca en un servidor de verdad)
CAMBIOS=0
MARCADOR="$RAIZ/etc/arbrain/pantalla-virtual.json"
LLAVERO="$RAIZ/etc/apt/keyrings/google-chrome.gpg"
REPO="$RAIZ/etc/apt/sources.list.d/google-chrome.list"
REPO_PAQUETE="$RAIZ/etc/apt/sources.list.d/google-chrome.sources"   # el que crea y mantiene el paquete de Chrome
POLITICAS="$RAIZ/etc/opt/chrome/policies/managed/arbrain-pantalla.json"
NAVEGADOR=/usr/bin/google-chrome-stable
URL_LLAVE=https://dl.google.com/linux/linux_signing_key.pub
# Huella de la llave de firma de Linux de Google (https://www.google.com/linuxrepositories/): si la llave bajada no es
# esta, no se instala nada. Subllaves rotan; la principal es esta.
HUELLA_GOOGLE=EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796
PAQUETES="xvfb xauth openbox dbus at-spi2-core python3-pyatspi gir1.2-atspi-2.0 python3-xlib python3-pil xdotool fonts-liberation fonts-noto-core fonts-noto-color-emoji"

di() { printf '· %s\n' "$*"; }
cambio() { CAMBIOS=$((CAMBIOS + 1)); printf '+ %s\n' "$*"; }
igual() { printf '= %s\n' "$*"; }
falta() { printf 'PANTALLA_FALTA %s\n' "$*"; exit 4; }

# ── Funciones puras (las prueba pantalla.test.sh) ─────────────────────────────────────────────────────────────────────

# La línea del repo de Google, atada a su llavero (signed-by): esa llave no vale para ningún otro repo.
texto_repo_chrome() { # <arquitectura> <llavero>
  printf '### Arbrain (pantalla.sh): repo de arranque de Google Chrome (el paquete lo migra a google-chrome.sources).\n'
  printf 'deb [arch=%s signed-by=%s] https://dl.google.com/linux/chrome/deb/ stable main\n' "$1" "${2#"$RAIZ"}"
}

# ¿Es nuestro repo de arranque? (se quita cuando el paquete ya trae el suyo)
es_repo_de_arranque() { [ -f "$1" ] && head -1 "$1" | grep -q '^### Arbrain (pantalla.sh)'; }

# Políticas de la pantalla: una pantalla sin nadie mirando no guarda contraseñas ni tarjetas ni se queda viva sola.
texto_politicas_chrome() {
  cat <<'POL'
{
  "PasswordManagerEnabled": false,
  "AutofillCreditCardEnabled": false,
  "AutofillAddressEnabled": false,
  "PaymentMethodQueryEnabled": false,
  "BackgroundModeEnabled": false,
  "DefaultBrowserSettingEnabled": false,
  "MetricsReportingEnabled": false,
  "PromotionsEnabled": false,
  "BrowserSignin": 0,
  "SyncDisabled": true
}
POL
}

# El marcador que lee Arbrain (politica.ts y disponibilidad.ts): sin fecha, para que una segunda corrida no lo cambie.
texto_marcador() { # <navegador>
  printf '{\n  "pantalla_virtual": 1,\n  "navegador": "%s",\n  "geometria": "1440x900x24",\n  "instalo": "arbrain/scripts/instalar/pantalla.sh"\n}\n' "$1"
}

# Paquetes que faltan, de la lista de stdin (uno por línea), según `instalado` (dpkg; en pruebas, una función falsa).
faltantes() { local p f=""; while IFS= read -r p; do [ -n "$p" ] && ! instalado "$p" && f="$f $p"; done; printf '%s' "${f# }"; }

# Escribe stdin en <ruta> solo si cambia. Devuelve 0 si escribió, 1 si ya estaba igual.
escribir_si_cambia() {
  local ruta="$1" modo="${2:-644}" tmp
  tmp="$(mktemp)"; cat > "$tmp"
  if [ -f "$ruta" ] && cmp -s "$tmp" "$ruta"; then rm -f "$tmp"; return 1; fi
  mkdir -p "$(dirname "$ruta")"
  chmod "$modo" "$tmp"; mv "$tmp" "$ruta"
  return 0
}

# ── Utilidades del sistema ────────────────────────────────────────────────────────────────────────────────────────────

instalado() { dpkg -s "$1" >/dev/null 2>&1; }

comprobar_servidor() {
  [ "$(uname -s)" = Linux ] || falta "la pantalla virtual es para tu servidor Linux; en tu compu Arbrain ya usa tu pantalla"
  command -v apt-get >/dev/null 2>&1 || falta "solo sé instalar en Ubuntu o Debian (apt)"
  if [ "$(id -u)" != 0 ]; then
    if sudo -n true 2>/dev/null; then exec sudo -n bash "$0" "$@"; fi
    falta "necesito root (o sudo sin contraseña) para instalar paquetes"
  fi
  local a; a="$(dpkg --print-architecture)"
  [ "$a" = amd64 ] || falta "Google Chrome para Linux solo existe en amd64 (este servidor es $a)"
}

# needrestart (Ubuntu) escribe su reporte tras cada apt-get install: aquí no reinicia nada y ensucia la salida.
export NEEDRESTART_SUSPEND=1
apt_actualizar() { DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1; }

# ── Pasos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

paso_paquetes() {
  local f
  f="$(printf '%s\n' $PAQUETES | faltantes)"
  if [ -z "$f" ]; then igual "paquetes de la pantalla (Xvfb, openbox, AT-SPI, ayudante)"; return; fi
  di "Instalando: $f"
  apt_actualizar || falta "apt-get update falló (¿sin internet?)"
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $f >/dev/null || falta "no pude instalar: $f"
  cambio "instalé: $f"
}

paso_repo_chrome() {
  local tmp huella
  if instalado google-chrome-stable && [ -s "$REPO_PAQUETE" ]; then
    # El paquete ya mantiene su repo firmado: dos entradas del mismo repo solo darían avisos en cada apt update.
    if es_repo_de_arranque "$REPO"; then rm -f "$REPO"; cambio "quité el repo de arranque: Chrome mantiene el suyo (google-chrome.sources, firmado)"
    else igual "repo de Google Chrome (lo mantiene su paquete, firmado)"; fi
    return
  fi
  if [ ! -s "$LLAVERO" ]; then
    command -v gpg >/dev/null 2>&1 || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gpg >/dev/null || falta "no pude instalar gpg"; }
    tmp="$(mktemp -d)"
    curl -fsSL --max-time 60 "$URL_LLAVE" -o "$tmp/llave.pub" || { rm -rf "$tmp"; falta "no pude bajar la llave de firma de Google ($URL_LLAVE)"; }
    gpg --batch --quiet --homedir "$tmp" --dearmor -o "$tmp/llave.gpg" "$tmp/llave.pub" 2>/dev/null || { rm -rf "$tmp"; falta "la llave de Google no se pudo leer"; }
    huella="$(gpg --batch --homedir "$tmp" --with-colons --show-keys "$tmp/llave.gpg" 2>/dev/null | awk -F: '$1=="fpr"{print $10}' | tr '\n' ' ')"
    case " $huella " in *" $HUELLA_GOOGLE "*) ;; *) rm -rf "$tmp"; falta "la llave bajada de Google no tiene la huella esperada; no instalo nada" ;; esac
    install -D -m 644 "$tmp/llave.gpg" "$LLAVERO"; rm -rf "$tmp"
    cambio "llave de firma de Google en ${LLAVERO#"$RAIZ"} (huella verificada)"
  else igual "llave de firma de Google"; fi
  if texto_repo_chrome amd64 "$LLAVERO" | escribir_si_cambia "$REPO" 644; then cambio "repo de arranque de Google Chrome con signed-by"; else igual "repo de arranque de Google Chrome"; fi
}

paso_chrome() {
  if instalado google-chrome-stable; then igual "Google Chrome ($("$NAVEGADOR" --version 2>/dev/null | awk '{print $NF}'))"; return; fi
  apt_actualizar || falta "apt-get update falló con el repo de Google"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends google-chrome-stable >/dev/null || falta "no pude instalar google-chrome-stable"
  cambio "instalé Google Chrome ($("$NAVEGADOR" --version 2>/dev/null | awk '{print $NF}'))"
}

paso_politicas() {
  if texto_politicas_chrome | escribir_si_cambia "$POLITICAS" 644; then cambio "políticas de Chrome para la pantalla (sin contraseñas ni tarjetas guardadas)"; else igual "políticas de Chrome"; fi
}

paso_marcador() {
  if texto_marcador "$NAVEGADOR" | escribir_si_cambia "$MARCADOR" 644; then cambio "marcador ${MARCADOR#"$RAIZ"}: computer use disponible en esta nube (nace apagado)"; else igual "marcador ${MARCADOR#"$RAIZ"}"; fi
}

orden_instalar() {
  comprobar_servidor instalar
  di "Preparo la pantalla virtual de tu nube (servidor $(hostname))."
  paso_paquetes
  paso_repo_chrome
  paso_chrome
  es_repo_de_arranque "$REPO" && paso_repo_chrome   # tras instalar, el paquete ya trae su repo: se quita el de arranque
  paso_politicas
  paso_marcador
  printf 'PANTALLA_OK navegador=%s marcador=%s cambios=%s\n' "$("$NAVEGADOR" --version 2>/dev/null | awk '{print $NF}')" "${MARCADOR#"$RAIZ"}" "$CAMBIOS"
}

orden_estado() {
  local f nav
  f="$(printf '%s\n' $PAQUETES google-chrome-stable | faltantes)"
  nav="$("$NAVEGADOR" --version 2>/dev/null | awk '{print $NF}')"
  if [ -s "$MARCADOR" ] && [ -z "$f" ]; then printf 'PANTALLA_OK navegador=%s marcador=%s cambios=0\n' "${nav:-?}" "${MARCADOR#"$RAIZ"}"
  elif [ -s "$MARCADOR" ]; then printf 'PANTALLA_FALTA paquetes: %s (vuelve a correr: nube.sh pantalla)\n' "$f"; exit 4
  else printf 'PANTALLA_FALTA no instalada (corre: nube.sh pantalla)\n'; exit 4; fi
}

orden_quitar() {
  comprobar_servidor quitar
  if [ -e "$MARCADOR" ]; then rm -f "$MARCADOR"; cambio "quité el marcador: computer use ya no se ofrece en esta nube (los paquetes se quedan)"; else igual "sin marcador"; fi
  printf 'PANTALLA_QUITADA cambios=%s\n' "$CAMBIOS"
}

[ "${PANTALLA_SOLO_FUNCIONES:-}" = 1 ] && return 0 2>/dev/null

case "${1:-instalar}" in
  instalar) orden_instalar ;;
  estado) orden_estado ;;
  quitar) orden_quitar ;;
  *) falta "orden desconocida: $1 (instalar, estado o quitar)" ;;
esac
