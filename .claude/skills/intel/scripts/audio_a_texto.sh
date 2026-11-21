#!/usr/bin/env bash
# audio_a_texto.sh: audio (archivo o URL firmada) → transcripción con minuto, lista para `corpus.py texto`.
#
# Para videos SIN subtítulos (Bilibili, podcasts, una grabación). Si el video tiene subtítulos del creador, no uses
# esto: bájalos con `corpus.py bajar` o yt-dlp, que son mejores que cualquier reconocimiento de voz.
#
# Uso:
#   audio_a_texto.sh --audio-file grabacion.m4a --out nombre [--lang zh]
#   audio_a_texto.sh --audio-url "https://…firmada…" --referer "https://www.bilibili.com" --out nombre [--lang zh]
#
# Motor, el primero que haya:
#   1. `whisper` local (pip install openai-whisper): no necesita llave ni internet, más lento.
#   2. Groq Whisper large-v3 con la variable GROQ_API_KEY (tu llave, en el llavero o en tu entorno; este script no la
#      busca en archivos ni la imprime).
# Salida: <workdir>/<out>.json con `segments` (inicio en segundos y texto). Luego:
#   python3 .claude/skills/intel/scripts/corpus.py texto <workdir>/<out>.json --corpus <dir> --id <id> --titulo "…"
# Requiere: ffmpeg y curl.
set -euo pipefail

WORKDIR="${AUDIO_WORKDIR:-/tmp/audio-a-texto}"
LANG_CODE="zh"; OUT="audio"; AUDIO_URL=""; AUDIO_FILE=""; REFERER=""
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0 Safari/537.36"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --audio-url) AUDIO_URL="$2"; shift 2;;
    --audio-file) AUDIO_FILE="$2"; shift 2;;
    --referer) REFERER="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --lang) LANG_CODE="$2"; shift 2;;
    --workdir) WORKDIR="$2"; shift 2;;
    *) echo "argumento desconocido: $1" >&2; exit 2;;
  esac
done
command -v ffmpeg >/dev/null || { echo "Falta ffmpeg (brew install ffmpeg / winget install ffmpeg / apt install ffmpeg)." >&2; exit 2; }
mkdir -p "$WORKDIR"
RAW="$WORKDIR/${OUT}.raw"

# 1. El audio. Las URL firmadas caducan en minutos: descarga en cuanto la tengas. Los CDN cortan a media descarga;
#    --retry-all-errors y -C - reanudan.
if [[ -n "$AUDIO_FILE" ]]; then
  cp "$AUDIO_FILE" "$RAW"
elif [[ -n "$AUDIO_URL" ]]; then
  HDR=(-H "User-Agent: $UA"); [[ -n "$REFERER" ]] && HDR+=(-H "Referer: $REFERER")
  curl -sS -L --max-time 900 --retry 6 --retry-delay 2 --retry-all-errors -C - "${HDR[@]}" -o "$RAW" "$AUDIO_URL" || {
    rm -f "$RAW"; sleep 2; curl -sS -L --max-time 900 --retry 6 --retry-all-errors "${HDR[@]}" -o "$RAW" "$AUDIO_URL"; }
else
  echo "Da --audio-file o --audio-url." >&2; exit 2
fi
[[ -s "$RAW" ]] || { echo "El audio quedó vacío." >&2; exit 1; }
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RAW" 2>/dev/null | cut -d. -f1 || echo 0)"
echo "audio: $(wc -c < "$RAW") bytes, ${DUR:-?} s (si es mucho menos que el video, la descarga se truncó: vuelve a bajarla)" >&2

# 2. mp3 16 kHz mono: suficiente para reconocer voz y cabe en los límites del servicio.
MP3="$WORKDIR/${OUT}.mp3"
ffmpeg -y -i "$RAW" -ac 1 -ar 16000 -b:a 64k "$MP3" 2>/dev/null

if command -v whisper >/dev/null; then
  echo "transcribiendo con whisper local ($LANG_CODE)…" >&2
  whisper "$MP3" --language "$LANG_CODE" --output_format json --output_dir "$WORKDIR" >/dev/null
  echo "$WORKDIR/${OUT}.json"; exit 0
fi

[[ -n "${GROQ_API_KEY:-}" ]] || { echo "Sin whisper local ni GROQ_API_KEY: instala openai-whisper o pide al dueño su llave de Groq (va al llavero)." >&2; exit 2; }

# 3. Groq: tramos de 20 min (<25 MB cada uno); los inicios se desplazan para que el minuto sea el del video.
SEG_DIR="$WORKDIR/${OUT}_seg"; rm -rf "$SEG_DIR"; mkdir -p "$SEG_DIR"
ffmpeg -y -i "$MP3" -f segment -segment_time 1200 -c copy "$SEG_DIR/seg_%03d.mp3" 2>/dev/null
i=0; : > "$WORKDIR/${OUT}.partes"
for seg in "$SEG_DIR"/seg_*.mp3; do
  echo "tramo $i…" >&2
  curl -s --max-time 300 https://api.groq.com/openai/v1/audio/transcriptions \
    -H "Authorization: Bearer $GROQ_API_KEY" -F "file=@${seg}" -F "model=whisper-large-v3" \
    -F "language=${LANG_CODE}" -F "response_format=verbose_json" > "$SEG_DIR/r_$i.json"
  echo "$i $SEG_DIR/r_$i.json" >> "$WORKDIR/${OUT}.partes"; i=$((i+1))
done
python3 - "$WORKDIR/${OUT}.partes" "$WORKDIR/${OUT}.json" <<'PY'
import json, sys
segs = []
for linea in open(sys.argv[1]):
    n, ruta = linea.split()
    d = json.load(open(ruta))
    if "error" in d:
        sys.exit(f"el servicio respondió error en el tramo {n}: {d['error'].get('message', d['error'])}")
    for s in d.get("segments", []):
        segs.append({"start": s["start"] + int(n) * 1200, "text": s["text"]})
json.dump({"segments": segs}, open(sys.argv[2], "w"), ensure_ascii=False)
print(sys.argv[2])
PY
