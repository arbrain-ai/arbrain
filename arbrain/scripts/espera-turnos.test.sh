#!/bin/bash
# Prueba de espera-turnos.sh contra una base temporal con el esquema real. No toca la base viva.
set -u
D=$(mktemp -d); export CLAUDECLAW_DB="$D/t.db"; HERE="$(cd "$(dirname "$0")" && pwd)"
sqlite3 "$CLAUDECLAW_DB" "CREATE TABLE chat_runtime_turns (turn_id TEXT PRIMARY KEY, owner TEXT, account TEXT, conversation_id TEXT, fingerprint TEXT, input_json TEXT, snapshot_json TEXT, status TEXT NOT NULL, native_thread_id TEXT, native_turn_id TEXT, worker_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
. "$HERE/espera-turnos.sh"; export ESPERA_TURNOS_PASO=1; fail=0
ahora() { echo $(( $(date +%s) * 1000 )); }
ins() { sqlite3 "$CLAUDECLAW_DB" "INSERT INTO chat_runtime_turns(turn_id,status,created_at,updated_at) VALUES('$1','$2',$3,$3);"; }
check() { if [ "$2" = "$3" ]; then echo "OK   $1"; else echo "FAIL $1 (esperaba $3, obtuve $2)"; fail=1; fi; }

# 1. sin turnos: vuelve de inmediato
s=$(date +%s); esperar_sin_turnos >/dev/null; check "sin turnos no espera" "$(( $(date +%s) - s < 2 ))" 1

# 2. turno en curso que termina a los 3 s: espera y luego sigue
ins a running "$(ahora)"; ( sleep 3; sqlite3 "$CLAUDECLAW_DB" "UPDATE chat_runtime_turns SET status='completed' WHERE turn_id='a'" ) &
s=$(date +%s); out=$(ESPERA_TURNOS_TOPE=30 esperar_sin_turnos); e=$(( $(date +%s) - s ))
check "espera mientras corre el turno (>=3 s)" "$(( e >= 3 ))" 1; check "no espera de más (<10 s)" "$(( e < 10 ))" 1
echo "$out" | grep -q "sin turnos activos" ; check "avisa que terminó" "$?" 0; wait

# 3. turno que nunca termina: respeta el tope y reinicia igual
ins b waiting "$(ahora)"; s=$(date +%s); out=$(ESPERA_TURNOS_TOPE=4 esperar_sin_turnos); e=$(( $(date +%s) - s ))
check "tope: sale entre 4 y 9 s" "$(( e >= 4 && e < 9 ))" 1; echo "$out" | grep -q "tope de 4s"; check "avisa el tope" "$?" 0
sqlite3 "$CLAUDECLAW_DB" "UPDATE chat_runtime_turns SET status='completed'"

# 4. fila huérfana vieja (1 h sin actividad): no bloquea
ins c running "$(( $(ahora) - 3600000 ))"; s=$(date +%s); esperar_sin_turnos >/dev/null; check "huérfano viejo no bloquea" "$(( $(date +%s) - s < 2 ))" 1

# 5. base ilegible: no bloquea
CLAUDECLAW_DB=/no/existe; s=$(date +%s); esperar_sin_turnos >/dev/null 2>&1; check "base ilegible no bloquea" "$(( $(date +%s) - s < 2 ))" 1
rm -rf "$D"; exit $fail
