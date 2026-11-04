#!/bin/bash
# Arranque DENTRO del pod de RunPod. Adaptación de hanxiao/DeepSeek-V4.1-Flash-1017-FP8-abliterated-4x-RTX-PRO-6000
# (Apache-2.0, commit 1777471, 27 oct 2026): allá es una VM de Google con Docker; aquí el pod YA ES el contenedor, así
# que lo que hanxiao monta con `docker run -v` aquí se copia encima, y Caddy no hace falta (el proxy HTTPS de RunPod
# pone el TLS y vLLM revisa la llave Bearer con VLLM_API_KEY).
#
# Orden: 1) vigía (el autoapagado corre desde el segundo cero) 2) pesos (del volumen o de Hugging Face)
#        3) parches del tokenizador 4) servir vLLM en 0.0.0.0:8000.
# Variables (las pone ds41.py arrancar): DS41_MOTOR (lil|vllm) DS41_DATOS MODEL_REPO MODEL_REV SERVED_MODEL_NAME
#   VLLM_API_KEY DS41_MAXLEN DS41_SPEC DS41_ENGRAM DS41_COPIAR_LOCAL, más las del vigía (vigia.py).
set -uo pipefail
DATOS=${DS41_DATOS:-/workspace/ds41}
PESOS=$DATOS/models/ds41-abl
L=$DATOS/logs
mkdir -p "$L" "$DATOS/cache"
exec > >(tee -a "$L/arranque-$(date -u +%Y%m%d-%H%M%S).log") 2>&1
t() { echo "[$(date -u +%H:%M:%S)Z] $*"; }
PY=$(command -v python3 || echo /opt/venv/bin/python)
AQUI=/opt/ds41
falla() { t "FALLA: $*"; "$PY" "$AQUI/vigia.py" --apagar-ya "arranque: $*"; sleep infinity; }

: "${MODEL_REPO:=mrfakename/DeepSeek-V4.1-Flash-1017-abliterated}"
: "${MODEL_REV:=517efab9ccfef7f714dbd7d679f181a86f43ccf9}"
: "${SERVED_MODEL_NAME:=DeepSeek-V4.1-Flash-1017-abliterated}"
: "${DS41_MOTOR:=lil}"
: "${DS41_MAXLEN:=1048576}"
: "${DS41_SPEC:=3}"
: "${DS41_ENGRAM:=disk}"
[ -n "${VLLM_API_KEY:-}" ] || falla "sin VLLM_API_KEY: no sirvo un endpoint sin llave"
export VLLM_API_KEY

t "pod ${RUNPOD_POD_ID:-?} en ${RUNPOD_DC_ID:-?}, ${RUNPOD_GPU_COUNT:-?} GPU, motor $DS41_MOTOR"
nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader || true

# 1) Vigía
nohup "$PY" "$AQUI/vigia.py" >> "$L/vigia.out" 2>&1 &

# 2) Pesos: 48 archivos, 510.3 GB. Una marca por revisión dice que la descarga terminó entera.
MARCA="$PESOS/.completo-$MODEL_REV"
if [ -f "$MARCA" ]; then
  t "pesos ya en el volumen ($(du -sh "$PESOS" 2>/dev/null | cut -f1)); se saltó la descarga"
else
  t "bajando $MODEL_REPO@${MODEL_REV:0:8} a $PESOS"
  "$PY" -c 'import hf_xet' 2>/dev/null || "$PY" -m pip install -q 'huggingface_hub[hf_xet]' || falla "no pude instalar hf_xet"
  T0=$(date +%s)
  HF_XET_HIGH_PERFORMANCE=1 HF_XET_NUM_CONCURRENT_RANGE_GETS=64 HF_HUB_DISABLE_PROGRESS_BARS=1 \
    "$PY" -c "import sys; from huggingface_hub import snapshot_download as d; d(sys.argv[1], revision=sys.argv[2], local_dir=sys.argv[3], max_workers=48)" \
    "$MODEL_REPO" "$MODEL_REV" "$PESOS" || falla "la descarga de Hugging Face falló"
  S=$(( $(date +%s) - T0 + 1 ))
  B=$(du -sb "$PESOS" | cut -f1)
  N=$(ls "$PESOS"/*.safetensors 2>/dev/null | wc -l)
  t "descarga: $((B / 1000000000)) GB en ${S} s = $((B / 1000000 / S)) MB/s, $N safetensors"
  [ "$N" -ge 48 ] || falla "faltan safetensors ($N de 48)"
  touch "$MARCA"
fi
# Lectura del volumen: el dato que decide si conviene el volumen o bajar de Hugging Face cada vez.
UNO=$(ls "$PESOS"/*.safetensors | head -1)
T0=$(date +%s%N); cat "$UNO" > /dev/null; T1=$(date +%s%N)
t "lectura de $(basename "$UNO"): $(( $(stat -c %s "$UNO") * 1000 / ((T1 - T0) / 1000000 + 1) / 1000000 )) MB/s"
if [ "${DS41_COPIAR_LOCAL:-0}" = 1 ]; then
  t "copiando los pesos al disco local del contenedor (DS41_COPIAR_LOCAL=1)"
  T0=$(date +%s); mkdir -p /root/ds41-local && cp -r "$PESOS/." /root/ds41-local/ || falla "la copia local falló"
  t "copia local en $(( $(date +%s) - T0 )) s"; PESOS=/root/ds41-local
fi

# 3) Parches del tokenizador (los mismos dos de hanxiao). Siempre desde el original, para que reaplicar no los doble.
command -v patch >/dev/null || { apt-get update -qq && apt-get install -y -qq patch >/dev/null; } || falla "sin el programa patch"
SP=$("$PY" -c 'import os, vllm; print(os.path.join(os.path.dirname(vllm.__file__), "tokenizers"))') || falla "vLLM no está en la imagen"
patch -s -o /tmp/encoding-1017-vllm.py "$PESOS/encoding/encoding.py" < "$AQUI/parches/encoding-1017-vllm.patch" || falla "parche de encoding"
cp /tmp/encoding-1017-vllm.py "$SP/deepseek_v41_encoding.py"
if [ "$DS41_MOTOR" = lil ]; then
  [ -f "$SP/deepseek_v41.py.orig" ] || cp "$SP/deepseek_v41.py" "$SP/deepseek_v41.py.orig"
  patch -s -o "$SP/deepseek_v41.py" "$SP/deepseek_v41.py.orig" < "$AQUI/parches/deepseek_v41-placeholder.patch" || falla "parche del placeholder"
fi
t "parches aplicados en $SP"

# 4) Servir. Los cachés de kernels viven en el volumen: el segundo arranque no recompila.
mkdir -p "$DATOS/cache/root-cache" "$DATOS/cache/lil-cache"
export XDG_CACHE_HOME="$DATOS/cache/root-cache" HF_HUB_OFFLINE=1 OMP_NUM_THREADS=1
TP=${RUNPOD_GPU_COUNT:-4}
t "sirviendo $SERVED_MODEL_NAME, TP=$TP, contexto $DS41_MAXLEN"
if [ "$DS41_MOTOR" = lil ]; then
  # Receta LiL de hanxiao (vm/ds41-start.sh), igual salvo HOST (el proxy de RunPod entra por la red del contenedor).
  [ -e /cache ] || ln -s "$DATOS/cache/lil-cache" /cache
  export CHECKPOINT=original MODEL="$PESOS" SERVED_MODEL_NAME HOST=0.0.0.0 PORT=8000 TP \
    MAX_NUM_BATCHED_TOKENS=8192 GPU_MEMORY_UTILIZATION=0.95 \
    DSPARK_TOKENS="$DS41_SPEC" DSPARK_ADAPTIVE_VERIFICATION=true DSPARK_ADAPTIVE_VERIFICATION_COST_SCALE=0.5 \
    ENGRAM_TABLE_MEMORY="$DS41_ENGRAM" ENGRAM_DISK_RESIDENT_SCALES=true \
    VLLM_ENABLE_PCIE_ALLREDUCE=1 VLLM_PCIE_ALLREDUCE_BACKEND=b12x \
    VLLM_PCIE_ONESHOT_ALLREDUCE_MAX_SIZE=96KB VLLM_PCIE_ONESHOT_FUSED_ADD_RMS_NORM_MAX_SIZE=96KB \
    VLLM_PCIE_DMA_MIN_BYTES=6MB B12X_MHC_PDL=1 B12X_PCIE_ONESHOT_PDL=1 VLLM_MXFP8_LM_HEAD=1
  exec serve-ds41-flash.sh -- --max-cudagraph-capture-size 128 --max-model-len "$DS41_MAXLEN"
else
  # vLLM oficial (B300, H200, H100): receta SIN PROBAR con este checkpoint; la primera sesión la valida.
  exec vllm serve "$PESOS" --served-model-name "$SERVED_MODEL_NAME" \
    --tensor-parallel-size "$TP" --enable-expert-parallel \
    --tokenizer-mode deepseek_v41 --reasoning-parser deepseek_v41 \
    --tool-call-parser deepseek_v41 --enable-auto-tool-choice \
    --kv-cache-dtype fp8 --block-size 256 \
    --max-model-len "$DS41_MAXLEN" --max-num-seqs 8 --max-num-batched-tokens 8192 \
    --gpu-memory-utilization 0.92 \
    --default-chat-template-kwargs '{"thinking":true,"reasoning_effort":"max"}' \
    --speculative-config "{\"method\":\"dspark\",\"num_speculative_tokens\":$DS41_SPEC,\"draft_sample_method\":\"probabilistic\"}" \
    --enable-prefix-caching --enable-prompt-tokens-details --enable-force-include-usage \
    --host 0.0.0.0 --port 8000
fi
