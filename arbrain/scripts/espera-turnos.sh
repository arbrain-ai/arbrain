#!/bin/bash
# Espera a que el daemon no tenga turnos de Levy en curso antes de reiniciar la web (deploy.sh).
# Un turno vive en el journal SQLite del agent-server (chat_runtime_turns); Next solo retransmite su SSE, así que
# reiniciar la web a mitad de un turno corta lo que ve Daniel aunque el turno siga en el daemon.
# Uso: source espera-turnos.sh; esperar_sin_turnos     (devuelve 0 siempre: tras el tope se reinicia igual)
# Variables: CLAUDECLAW_DB, ESPERA_TURNOS_TOPE (s, 900), ESPERA_TURNOS_PASO (s, 5), ESPERA_TURNOS_FRESCO (s, 900)
CLAUDECLAW_DB="${CLAUDECLAW_DB:-$HOME/Developer/artificial-brain/arbrain/server/store/claudeclaw.db}"

turnos_activos() {
  # created_at/updated_at son ms. Solo cuenta turnos con actividad reciente: una fila huérfana de un crash viejo
  # no debe bloquear el deploy. Si la base no se puede leer, cuenta 0 (no bloquear) y lo dice en stderr.
  local n
  n=$(/usr/bin/sqlite3 -readonly "$CLAUDECLAW_DB" \
    "SELECT COUNT(*) FROM chat_runtime_turns WHERE status IN ('queued','dispatching','running','waiting') AND updated_at > (strftime('%s','now') - ${ESPERA_TURNOS_FRESCO:-900}) * 1000;" 2>/dev/null) || {
    echo "espera-turnos: no pude leer $CLAUDECLAW_DB, sigo sin esperar" >&2; echo 0; return; }
  echo "${n:-0}"
}

esperar_sin_turnos() {
  local tope="${ESPERA_TURNOS_TOPE:-900}" paso="${ESPERA_TURNOS_PASO:-5}" t=0 n
  while :; do
    n=$(turnos_activos)
    [ "$n" -eq 0 ] && { [ "$t" -gt 0 ] && echo "espera-turnos: sin turnos activos tras ${t}s"; return 0; }
    if [ "$t" -ge "$tope" ]; then echo "espera-turnos: tope de ${tope}s con $n turno(s) activo(s), reinicio igual"; return 0; fi
    [ "$t" -eq 0 ] && echo "espera-turnos: $n turno(s) de Levy en curso, espero (tope ${tope}s)"
    sleep "$paso"; t=$((t + paso))
  done
}
