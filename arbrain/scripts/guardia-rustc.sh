#!/bin/bash
# guardia-rustc.sh — envoltura de rustc para el Studio (25 oct 2026, firma de Daniel: «de acuerdo opción 2»).
#
# `npm run desktop:*` ya pasa por scripts/compilacion-pesada.mjs. Esto cubre el `cargo build/check/test` crudo que
# lanzan los agentes: cargo llama a esta envoltura en CADA invocación de rustc (la primera dependencia incluida),
# así que la guardia actúa antes de escribir gigas, no al final.
#   1. Piso de disco: con menos de 15 GB libres, rustc no corre.
#   2. Checkout designado: el src-tauri de la app original (con tauri.original.conf.json) solo compila su target
#      dentro de $DESIGNADO ($HOME/Developer/artificial-brain/arbrain). Un worktree no levanta otro target de ~20 GB.
#   3. Pausa del vigía de disco: mientras exista ~/.claudeclaw/builds-pausa, cada rustc espera (máx. 30 min).
# Instalación (solo Studio, global a cargo): ~/.cargo/config.toml → [build] rustc-wrapper = "<esta ruta>".
# Fuera de macOS no hace nada: solo ejecuta rustc.
set -u
[ "$(uname)" = "Darwin" ] || exec "$@"

PISO_GB=15; [ "${ARBRAIN_PISO_DISCO_GB:-0}" -gt 15 ] 2>/dev/null && PISO_GB="$ARBRAIN_PISO_DISCO_GB"   # solo puede subir
DESIGNADO="$HOME/Developer/artificial-brain/arbrain/src-tauri"
PAUSA="${ARBRAIN_COMPILACION_ESTADO:-$HOME/.claudeclaw}/builds-pausa"

# Sondeos de cargo (`rustc -vV`, `--print`): sin --out-dir no compilan nada.
outdir=""; prev=""
for a in "$@"; do
  [ "$prev" = "--out-dir" ] && outdir="$a"
  case "$a" in --out-dir=*) outdir="${a#--out-dir=}";; esac
  prev="$a"
done
[ -n "$outdir" ] || exec "$@"

libres_kb=$(df -k "$HOME" 2>/dev/null | awk 'NR==2{print $4}')
libres_gb=$(( ${libres_kb:-0} / 1048576 ))
sim="${ARBRAIN_DISCO_LIBRE_GB_SIMULADO:-}"   # prueba: solo puede BAJAR la lectura real
[ -n "$sim" ] && [ "${sim%.*}" -lt "$libres_gb" ] 2>/dev/null && libres_gb="${sim%.*}"
if [ "$libres_gb" -lt "$PISO_GB" ]; then
  echo "guardia-rustc: DISCO con ${libres_gb} GB libres, el piso es ${PISO_GB} GB. No compilo (una compilación de Rust escribe 10-20 GB). Libera espacio primero: FORCE=1 bash arbrain/server/scripts/sistema-janitor.sh" >&2
  exit 75
fi

# ¿Este target es de una copia de la app original fuera del checkout designado?
case "$outdir" in
  */src-tauri/target*)
    st="${outdir%%/src-tauri/target*}/src-tauri"
    if [ -f "$st/tauri.original.conf.json" ]; then
      st_real=$(cd "$st" 2>/dev/null && pwd -P); des_real=$(cd "$DESIGNADO" 2>/dev/null && pwd -P)
      if [ -n "$st_real" ] && [ "$st_real" != "$des_real" ]; then
        echo "guardia-rustc: src-tauri solo se compila en el checkout designado ($DESIGNADO), no en $st. Cada copia levantaba su propio target de ~20 GB. Verifica en la web del Studio (127.0.0.1:3300) o compila en el checkout designado." >&2
        exit 75
      fi
    fi;;
esac

espera=0
while [ -e "$PAUSA" ] && [ "$espera" -lt 1800 ]; do
  [ "$espera" = 0 ] && echo "guardia-rustc: builds en pausa por el vigía de disco ($(head -1 "$PAUSA" 2>/dev/null)); espero." >&2
  sleep 5; espera=$((espera + 5))
done
[ -e "$PAUSA" ] && { echo "guardia-rustc: 30 min en pausa sin que el disco se recupere. No compilo." >&2; exit 75; }
exec "$@"
