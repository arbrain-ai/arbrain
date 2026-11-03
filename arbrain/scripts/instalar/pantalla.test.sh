#!/usr/bin/env bash
# Pruebas de las funciones puras de pantalla.sh (1 nov 2026). No tocan el sistema: carpetas temporales.
#   bash arbrain/scripts/instalar/pantalla.test.sh
# La instalación de verdad (apt, repo de Google, Chrome, marcador) se probó en el VPS de pruebas:
# docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; fail=0
export PANTALLA_SOLO_FUNCIONES=1 PANTALLA_RAIZ="$T/raiz"
# shellcheck source=/dev/null
. "$AQUI/pantalla.sh"
check() { if [ "$2" = "$3" ]; then echo "OK   $1"; else echo "FAIL $1 (esperaba «$3», obtuve «$2»)"; fail=1; fi; }

# 1. Lo que instala: la pantalla, el foco, los buses, el ayudante y fuentes; nada de VNC ni de puertos.
for p in xvfb xauth openbox dbus at-spi2-core python3-pyatspi python3-xlib python3-pil xdotool fonts-noto-color-emoji; do
  check "instala $p" "$(printf '%s\n' $PAQUETES | grep -cx "$p")" 1
done
check "no instala servidores de escritorio remoto (VNC, noVNC, websockify)" "$(printf '%s\n' $PAQUETES | grep -cE 'vnc|websockify')" 0

# 2. Repo de Google: firmado solo por su llave (signed-by), amd64, sin [trusted=yes]
R="$(texto_repo_chrome amd64 "$LLAVERO")"
check "repo con signed-by a su llavero" "$(printf '%s\n' "$R" | grep -c '^deb \[arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg\] https://dl.google.com/linux/chrome/deb/ stable main$')" 1
check "repo sin trusted=yes" "$(printf '%s\n' "$R" | grep -c 'trusted')" 0
check "el repo de arranque se reconoce como nuestro" "$(printf '%s\n' "$R" > "$T/r.list"; es_repo_de_arranque "$T/r.list" && echo si || echo no)" si
printf 'deb https://otro/ stable main\n' > "$T/otro.list"
check "un repo ajeno no se toma por nuestro (no se borra)" "$(es_repo_de_arranque "$T/otro.list" && echo si || echo no)" no
check "llavero bajo PANTALLA_RAIZ" "${LLAVERO#"$T"/raiz}" "/etc/apt/keyrings/google-chrome.gpg"
check "huella de la llave de Google fijada" "$HUELLA_GOOGLE" "EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796"

# 3. Políticas de Chrome: JSON válido; sin contraseñas, tarjetas ni modo de fondo
P="$(texto_politicas_chrome)"
check "políticas: JSON válido" "$(printf '%s' "$P" | python3 -c 'import json,sys; json.load(sys.stdin); print("si")')" si
for k in '"PasswordManagerEnabled": false' '"AutofillCreditCardEnabled": false' '"BackgroundModeEnabled": false'; do
  check "política $k" "$(printf '%s\n' "$P" | grep -cF "$k")" 1
done
check "políticas en la carpeta administrada de Chrome" "${POLITICAS#"$T"/raiz}" "/etc/opt/chrome/policies/managed/arbrain-pantalla.json"

# 4. Marcador: el que leen politica.ts y disponibilidad.ts; JSON válido y sin fecha (idempotente)
M="$(texto_marcador /usr/bin/google-chrome-stable)"
check "marcador en /etc/arbrain (lo escribe root)" "${MARCADOR#"$T"/raiz}" "/etc/arbrain/pantalla-virtual.json"
check "marcador: JSON con el navegador" "$(printf '%s' "$M" | python3 -c 'import json,sys; print(json.load(sys.stdin)["navegador"])')" /usr/bin/google-chrome-stable
check "marcador sin fecha (una segunda corrida no lo cambia)" "$(printf '%s\n' "$M" | grep -cE '20[0-9]{2}-')" 0
check "marcador igual en cada corrida" "$(texto_marcador x | sha256sum | cut -c1-12)" "$(texto_marcador x | sha256sum | cut -c1-12)"
check "el marcador que lee la web es el mismo" "$(grep -c "'/etc/arbrain/pantalla-virtual.json'" "$AQUI/../../src/features/permisos/lib/disponibilidad.ts")" 1
check "el marcador que lee el daemon es el mismo" "$(grep -c "'/etc/arbrain/pantalla-virtual.json'" "$AQUI/../../server/src/manos/adaptadores/linux.ts")" 1

# 5. Paquetes que faltan: según `instalado` (aquí, uno falso)
instalado() { case "$1" in xvfb|openbox) return 0 ;; *) return 1 ;; esac; }
check "faltantes: solo los que no están" "$(printf '%s\n' xvfb openbox xdotool | faltantes)" "xdotool"
check "faltantes: nada si todo está" "$(printf '%s\n' xvfb openbox | faltantes)" ""

# 6. escribir_si_cambia: idempotente
F="$T/raiz/etc/arbrain/x.json"
echo hola | escribir_si_cambia "$F" 644; check "primera escritura cambia" "$?" 0
echo hola | escribir_si_cambia "$F" 644; check "segunda escritura no cambia" "$?" 1
check "modo 644" "$(ls -l "$F" | cut -c1-10)" "-rw-r--r--"

# 7. Despacho: nube.sh pantalla llega aquí (sin root: dice qué falta, no instala nada)
S="$(bash "$AQUI/nube.sh" pantalla orden-que-no-existe 2>&1 | tail -1)"
check "nube.sh pantalla despacha a pantalla.sh" "$S" "PANTALLA_FALTA orden desconocida: orden-que-no-existe (instalar, estado o quitar)"
check "nube.sh lo anuncia en su ayuda" "$(grep -c 'nube.sh pantalla' "$AQUI/nube.sh")" 1

rm -rf "$T"
[ "$fail" = 0 ] && echo "pantalla.test.sh: todo verde" || echo "pantalla.test.sh: HAY FALLAS"
exit $fail
