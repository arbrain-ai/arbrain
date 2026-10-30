#!/bin/bash
# Prueba de caos de la edición cliente (resiliencia, 12 oct 2026). Detalle y alcance: arbrain/scripts/caos-cliente.mts.
#
#   arbrain/scripts/caos.sh [--copia <dir>] [--reporte <json>]
#
# Sin --copia genera una copia nueva del alumno desde HEAD (generador del empaquetado, con su escáner de fugas) en
# /tmp/arbrain-caos-copia-<fecha>. Todo corre aislado: HOME temporal, puertos libres que nunca son 3000/3099/3218/3300,
# y solo se matan los procesos que lanza la prueba. Sale 0 si todo cumplió el SLA (detección y recuperación < 60 s,
# el mensaje llegó exactamente una vez y la persona leyó la verdad).
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
COPIA=""; REPORTE=""
while [ $# -gt 0 ]; do case "$1" in --copia) COPIA=$2; shift 2 ;; --reporte) REPORTE=$2; shift 2 ;; *) echo "opción desconocida: $1"; exit 2 ;; esac; done
if [ -z "$COPIA" ]; then
  COPIA=/tmp/arbrain-caos-copia-$(date +%Y%m%d%H%M%S)
  node "$REPO/arbrain/empaquetado/generador/generar.mjs" --salida "$COPIA"
fi
# Rutas relativas al cwd de quien llama: el `cd` de abajo las rompería (la CI pasa smoke-salida/caos.json; run 38270745112).
case "$REPORTE" in ''|/*) ;; *) REPORTE="$PWD/$REPORTE" ;; esac
case "$COPIA" in /*) ;; *) COPIA="$PWD/$COPIA" ;; esac
cd "$REPO/arbrain"
exec npx tsx scripts/caos-cliente.mts --copia "$COPIA" ${REPORTE:+--reporte "$REPORTE"}
