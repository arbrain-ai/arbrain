#!/bin/sh
# Typecheck por turnos (13 nov 2026, traducción en paralelo): un solo `tsc --noEmit` a la vez en esta copia (cada uno
# usa ~2.3 GB). Espera su turno con un candado de carpeta; si el dueño del candado murió (más de 10 min), lo toma.
# Uso: sh scripts/i18n/tsc-turno.sh [filtro]   → con filtro, solo imprime los errores cuyas líneas lo contienen.
cd "$(dirname "$0")/../.." || exit 1
CANDADO="/tmp/arbrain-ingles-tsc.lock"
while ! mkdir "$CANDADO" 2>/dev/null; do
  if [ -n "$(find "$CANDADO" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then rmdir "$CANDADO" 2>/dev/null; continue; fi
  sleep 3
done
trap 'rmdir "$CANDADO" 2>/dev/null' EXIT INT TERM
SALIDA=$(npx tsc --noEmit 2>&1)
CODIGO=$?
if [ -n "$1" ]; then
  echo "$SALIDA" | grep -E "$1" || echo "(sin errores que coincidan con: $1)"
  echo "total de líneas de error en el proyecto: $(echo "$SALIDA" | grep -c 'error TS')"
else
  echo "$SALIDA" | tail -60
fi
exit $CODIGO
