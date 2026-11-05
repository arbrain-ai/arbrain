#!/usr/bin/env bash
# Hoja de cuadros: 30 cuadros equiespaciados (6x5) de un video, en <video>.hoja.jpg. Requiere ffmpeg y ffprobe.
# Uso: bash hoja.sh <video> [salida.jpg]
set -euo pipefail
v="$1"; out="${2:-${v%.*}.hoja.jpg}"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$v")
ffmpeg -v error -y -i "$v" -vf "fps=$(python3 -c "print(30/$d)"),scale=400:-2,tile=6x5:padding=4" -frames:v 1 "$out"
echo "$out (un cuadro cada $(python3 -c "print(round($d/30,1))") s)"
