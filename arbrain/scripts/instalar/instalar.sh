#!/usr/bin/env bash
# Instalar Arbrain en un solo bloque (3 nov 2026, vuelta 2 del primer uso: «11 permisos» y «el primer hola no se
# contesta», docs/builds/primer-uso-2026-11-03/MARCADOR.md). Junta lo que antes eran los PASOS 3 a 9 de INSTALAR.md.
# Lo corre el PASO 2 de INSTALAR.md DESPUÉS de verificar la firma de la versión, desde la etiqueta firmada misma
# (`git show vX.Y.Z:arbrain/scripts/instalar/instalar.sh`): este archivo viaja firmado.
#
#   bash instalar.sh <carpeta de Arbrain> [--sin-sesion] [--reemplazar-app-vieja]
#
# Reentrante: cada vez hace lo que falta y sale cuando necesita a la persona o cuando se acaba su plazo (9 min, para
# caber en una llamada de Claude Code). Claude vuelve a correr EL MISMO bloque hasta `INSTALAR_OK`.
#
# Orden (el que pedía el marcador): rama mi-arbrain → requisitos → arranque en segundo plano (baja el programa) →
# inicio de sesión de Claude Code (el navegador de la persona, mientras baja) → su capa → «Corriendo» → arranque
# automático → esperar la sesión → la app. **La app no se abre sin sesión de Claude** (salvo --sin-sesion: quien no
# paga Pro o Max y conectará OpenRouter en la pantalla Llaves). Arbrain nunca ve la sesión: la abre el Claude Code de
# la persona con su login oficial; de `claude auth status` solo se toma si hay sesión (decisión del 12 oct 2026).
#
# Salida: líneas «· …» de avance, `INSTALAR_FASE <fase> <ms> <resultado>` (para el marcador de primer uso; Claude no
# se las enseña a nadie), `CARPETA_ANTERIOR <ruta> memorias=<n> skills=<m>` si encontró una carpeta de trabajo, y al
# final UNA línea de estado:
#   INSTALAR_OK version=<v> sesion=<si|no> app=<abierta|navegador|instalada> llave_api=<si|no>
#   INSTALAR_SIGUE <login|bajando|sesion> <para la persona>   (vuelve a correr el mismo bloque)
#   INSTALAR_ESPERA <motivo>                                  (algo del sistema se instala: espera 30 s y repite)
#   INSTALAR_FALTA <motivo>                                   (necesita a la persona; luego repite)
#   INSTALAR_PREGUNTA app-vieja                               (hay otra app «Arbrain»: pregunta y repite con --reemplazar-app-vieja)
#
# Solo para pruebas (el marcador de primer uso; nadie más las pone): ARBRAIN_INSTALAR_PLAZO_S (plazo por corrida),
# ARBRAIN_INSTALAR_SIN_ARRANQUE_AUTO=1 (no registra el arranque automático), ARBRAIN_INSTALAR_APP_DESTINO (carpeta de
# la app), ARBRAIN_INSTALAR_APP_SIN_ABRIR=1 y ARBRAIN_INSTALAR_LOGIN (orden que abre el login en vez de
# `claude auth login --claudeai`).
set -uo pipefail

D="${1:?uso: instalar.sh <carpeta de Arbrain> [--sin-sesion] [--reemplazar-app-vieja]}"; shift
SIN_SESION=0; APP_VIEJA=""
for a in "$@"; do case "$a" in --sin-sesion) SIN_SESION=1 ;; --reemplazar-app-vieja) APP_VIEJA=--reemplazar-app-vieja ;; *) echo "INSTALAR_FALTA opción desconocida: $a"; exit 2 ;; esac; done
cd "$D" || { echo "INSTALAR_FALTA no encuentro $D"; exit 4; }
ARB="$HOME/.arbrain"; mkdir -p "$ARB"
PLAZO_S="${ARBRAIN_INSTALAR_PLAZO_S:-540}"
ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time*1000' 2>/dev/null || echo $(( $(date +%s) * 1000 )); }
T0=$(ms)
di() { printf '· %s\n' "$*"; }
quedan() { [ $(( ($(ms) - T0) / 1000 )) -lt "$PLAZO_S" ]; }
FASE_T=$T0
fase() { local t; t=$(ms); printf 'INSTALAR_FASE %s %s %s\n' "$1" "$((t - FASE_T))" "${2:-ok}"; FASE_T=$t; }
vivo() { [ -f "$1" ] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }
sesion() { claude auth status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).loggedIn?0:1)}catch{process.exit(1)}})'; }
V="$(cat VERSION 2>/dev/null)"

# ── 1. Su rama: todo lo suyo vive en mi-arbrain ──────────────────────────────────────────────────────────────────────
if [ "$(git branch --show-current)" != mi-arbrain ]; then
  git switch -q mi-arbrain 2>/dev/null || git switch -q -c mi-arbrain || { echo "INSTALAR_FALTA no pude crear la rama mi-arbrain"; exit 4; }
fi
git config --local pull.ff only
git config user.name >/dev/null || git config --local user.name "Mi Arbrain"
git config user.email >/dev/null || git config --local user.email "yo@mi-arbrain.local"
fase rama

# ── 2. Requisitos (Node 22, Python 3, Claude Code de terminal) ───────────────────────────────────────────────────────
R="$(bash arbrain/scripts/instalar/requisitos.sh 2>&1)"; RC=$?
printf '%s\n' "$R" | grep '^· ' || true
ULT="$(printf '%s\n' "$R" | grep '^REQUISITOS_' | tail -1)"
case "$ULT" in
  REQUISITOS_OK*) ;;
  REQUISITOS_ESPERA*) fase requisitos espera; echo "INSTALAR_ESPERA ${ULT#REQUISITOS_ESPERA }"; exit 3 ;;
  REQUISITOS_FALTA*) fase requisitos falta; echo "INSTALAR_FALTA ${ULT#REQUISITOS_FALTA }"; exit 4 ;;
  *) fase requisitos error; echo "INSTALAR_FALTA los requisitos terminaron sin estado (código $RC): $(printf '%s\n' "$R" | tail -2 | tr '\n' ' ')"; exit 4 ;;
esac
# shellcheck source=/dev/null
. "$ARB/entorno.sh"
SES=no; case "$ULT" in *sesion=si*) SES=si ;; esac
fase requisitos "sesion=$SES"

# ── 3. Arranque en segundo plano: baja Arbrain ya compilado mientras sigue lo demás ──────────────────────────────────
estado() { (cd arbrain && node scripts/servidor.mjs estado 2>/dev/null | head -1); }
if ! estado | grep -q Corriendo && ! vivo "$ARB/arranque.pid"; then
  # Sin `cd … && nohup … &`: ese `&` mandaría al fondo una subcapa que se queda con la salida de este bloque abierta.
  (cd arbrain || exit; nohup node scripts/servidor.mjs --sin-navegador > "$ARB/arranque.log" 2>&1 </dev/null & echo $! > "$ARB/arranque.pid")
  di "Arbrain arranca en segundo plano (baja el programa ya compilado, verificado con la firma de $V)"
fi
fase arranque

# ── 4. Sesión de Claude Code: el login oficial, en su navegador, justo después de los requisitos ─────────────────────
if [ "$SES" = no ] && [ "$SIN_SESION" = 0 ] && ! vivo "$ARB/login-claude.pid"; then
  if [ -n "${ARBRAIN_INSTALAR_LOGIN:-}" ]; then
    nohup bash -c "$ARBRAIN_INSTALAR_LOGIN" > "$ARB/login-claude.log" 2>&1 </dev/null & echo $! > "$ARB/login-claude.pid"
  else
    nohup claude auth login --claudeai > "$ARB/login-claude.log" 2>&1 </dev/null & echo $! > "$ARB/login-claude.pid"
  fi
  date +%s > "$ARB/login-claude.desde"
  fase login abierto
  echo "INSTALAR_SIGUE login Se abrió tu navegador para entrar a tu cuenta de Claude: entra y pulsa «Autorizar». Mientras, sigo instalando."
  exit 0
fi
fase login "$([ "$SES" = si ] && echo ya || echo esperando)"

# ── 5. Lo que ya tenía (solo lectura): carpetas de trabajo con CLAUDE.md y .claude, cerebro de la app 0.1.x ─────────
if [ ! -f "$ARB/carpetas-anteriores.txt" ]; then
  case "$(uname -s)" in
    Darwin) APPDIR="$HOME/Library/Application Support/ai.arbrain.app" ;;
    MINGW*|MSYS*|CYGWIN*) APPDIR="${APPDATA:-$HOME/AppData/Roaming}/ai.arbrain.app" ;;
    *) APPDIR="${XDG_DATA_HOME:-$HOME/.local/share}/ai.arbrain.app" ;;
  esac
  {
    ls -d "$APPDIR/cerebro" 2>/dev/null
    for r in "$HOME/Developer" "$HOME/Documents" "$HOME/Desktop" "$HOME/Projects" "$HOME"; do
      find "$r" -maxdepth 3 \( -name node_modules -o -name .git -o -name Library -o -name AppData -o -path "$HOME/Arbrain*" \) -prune \
        -o -name CLAUDE.md -print 2>/dev/null
    done | while read -r f; do d="$(dirname "$f")"; [ -d "$d/.claude" ] && echo "$d"; done
    find "$HOME" "$HOME/Desktop" "$HOME/Documents" -maxdepth 2 -type d -name semilla-cerebro 2>/dev/null
  } | sort -u > "$ARB/carpetas-anteriores.txt"
fi
N_CARPETAS=0
while read -r c; do
  [ -n "$c" ] || continue
  N_CARPETAS=$((N_CARPETAS + 1))
  base="$c"; [ -d "$c/.claude" ] || base="$c/.."
  echo "CARPETA_ANTERIOR $c memorias=$(find "$base/.claude/memory" -type f 2>/dev/null | wc -l | tr -d ' ') skills=$(find "$base/.claude/skills" -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
done < "$ARB/carpetas-anteriores.txt"
fase carpetas "$N_CARPETAS"

# ── 6. Su capa: la semilla (solo agrega lo que falta, nunca pisa) ────────────────────────────────────────────────────
"$PY" arbrain/cerebro/sembrar.py >/dev/null || { echo "INSTALAR_FALTA no pude sembrar tu capa"; exit 4; }
git add -A
git diff --cached --quiet || git commit -qm "Mi capa: semilla de la versión $V"
fase semilla

# ── 7. Esperar «Corriendo» ───────────────────────────────────────────────────────────────────────────────────────────
LISTO=""
while :; do
  if estado | grep -q Corriendo; then LISTO=1; break; fi
  if ! vivo "$ARB/arranque.pid" && grep -q 'ERROR' "$ARB/arranque.log" 2>/dev/null; then
    fase programa error
    echo "INSTALAR_FALTA Arbrain no arrancó: $(grep 'ERROR' "$ARB/arranque.log" | tail -1 | cut -c1-240)"
    exit 4
  fi
  quedan || break
  sleep 3
done
if [ -z "$LISTO" ]; then
  fase programa bajando
  echo "INSTALAR_SIGUE bajando Sigo bajando y verificando Arbrain ($(tail -1 "$ARB/arranque.log" 2>/dev/null | cut -c1-120))."
  exit 0
fi
fase programa corriendo

# ── 8. Que vuelva solo al prender la computadora ─────────────────────────────────────────────────────────────────────
if [ "${ARBRAIN_INSTALAR_SIN_ARRANQUE_AUTO:-}" = 1 ]; then fase arranque-auto omitido
else (cd arbrain && node scripts/servidor.mjs arranque-automatico activar >/dev/null 2>&1); fase arranque-auto; fi

# ── 9. Esperar la sesión de Claude: sin ella, la app no se abre ──────────────────────────────────────────────────────
if [ "$SES" = no ] && [ "$SIN_SESION" = 0 ]; then
  while ! sesion; do
    if ! vivo "$ARB/login-claude.pid"; then
      # El login terminó (lo cerró, venció o falló) sin sesión: la siguiente corrida lo vuelve a abrir.
      rm -f "$ARB/login-claude.pid"
      fase sesion no
      echo "INSTALAR_SIGUE sesion Todavía no entras a tu cuenta de Claude. Vuelvo a abrir tu navegador para que autorices."
      exit 0
    fi
    quedan || { fase sesion esperando; echo "INSTALAR_SIGUE sesion Arbrain ya está listo; falta que autorices tu cuenta de Claude en el navegador."; exit 0; }
    sleep 3
  done
  SES=si
  kill "$(cat "$ARB/login-claude.pid" 2>/dev/null)" 2>/dev/null; rm -f "$ARB/login-claude.pid"
fi
fase sesion "$SES"
LLAVE=no; [ -n "${ANTHROPIC_API_KEY:-}" ] && LLAVE=si

# ── 10. La app de escritorio, verificada con la firma, y abierta ya con su sesión ────────────────────────────────────
APP=abierta
ARGS=(instalar)
[ -n "${ARBRAIN_INSTALAR_APP_DESTINO:-}" ] && ARGS+=(--destino "$ARBRAIN_INSTALAR_APP_DESTINO")
[ "${ARBRAIN_INSTALAR_APP_SIN_ABRIR:-}" = 1 ] && { ARGS+=(--sin-abrir); APP=instalada; }
[ -n "$APP_VIEJA" ] && ARGS+=("$APP_VIEJA")
if [ -f "$ARB/instalado-$V" ]; then
  [ "$APP" = abierta ] && (cd arbrain && node scripts/servidor.mjs abrir >/dev/null 2>&1)
  APP="$(cat "$ARB/instalado-$V")"
else
  E="$(cd arbrain && node scripts/escritorio.mjs "${ARGS[@]}" 2>&1)"; EC=$?
  case $EC in
    0) ;;
    3) fase app app-vieja; printf '%s\n' "$E" | tail -3; echo "INSTALAR_PREGUNTA app-vieja"; exit 0 ;;
    *) APP=navegador
       printf '%s\n' "$E" | tail -2 | sed 's/^/· app: /'
       [ "${ARBRAIN_INSTALAR_APP_SIN_ABRIR:-}" = 1 ] || (cd arbrain && node scripts/servidor.mjs abrir --navegador >/dev/null 2>&1) ;;
  esac
  echo "$APP" > "$ARB/instalado-$V"
fi
fase app "$APP"

# ── 11. Cierre: todo guardado en su rama ─────────────────────────────────────────────────────────────────────────────
SUCIO="$(git status --short | wc -l | tr -d ' ')"
[ "$SUCIO" = 0 ] || di "Quedaron $SUCIO cambios sin guardar en ~/Arbrain"
fase cierre "rama=$(git branch --show-current) sucio=$SUCIO"
echo "INSTALAR_OK version=$V sesion=$SES app=$APP llave_api=$LLAVE"
