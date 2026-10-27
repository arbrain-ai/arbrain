#!/usr/bin/env bash
# La prueba de dos máquinas y las unitarias dentro de un contenedor Linux real (Debian, usuario sin root).
#   bash arbrain/scripts/espejo/prueba-linux.sh        (necesita docker; en el Studio, colima)
# El contenedor es --rm: no queda nada vivo al terminar.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
docker run --rm --user node -e TZ=America/Mexico_City -v "$AQUI:/espejo:ro" node:22-bookworm bash -c \
  'head -1 /etc/os-release; bash /espejo/prueba-dos-maquinas.sh && node --test /espejo/pruebas/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"'
