#!/usr/bin/env bash
# Prueba de punta a punta del modo espejo con DOS clones locales («laptop» y «nube») contra un repo git desnudo que
# hace de GitHub. Sin red, sin llaves reales (se arman en tiempo de ejecución), OpenRouter simulado en 127.0.0.1.
# Todo vive en un temporal propio; al salir se apaga el OpenRouter simulado (por su PID, nunca por patrón).
#
#   bash arbrain/scripts/espejo/prueba-dos-maquinas.sh            (Mac o Linux; necesita git ≥ 2.28 y Node ≥ 20)
#
# Última línea: PRUEBA_DOS_MAQUINAS OK <n>/<n>  o  PRUEBA_DOS_MAQUINAS FALLA <fallas> de <n>. Código de salida 0 = todo verde.
set -uo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(mktemp -d "${TMPDIR:-/tmp}/espejo-e2e.XXXXXX")"
PASA=0; FALLA=0; FAKE_PID=""
fin() { [ -n "$FAKE_PID" ] && kill "$FAKE_PID" 2>/dev/null; wait 2>/dev/null; }
trap fin EXIT
ok() { PASA=$((PASA + 1)); echo "  PASA  $*"; }
mal() { FALLA=$((FALLA + 1)); echo "  FALLA $*"; }
chequeo() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else mal "$d"; fi; }
no() { ! "$@"; }
seccion() { echo; echo "── $*"; }

export ARBRAIN_ESPEJO_AHORA="2026-10-23T07:00:00"
export GIT_AUTHOR_DATE="2026-10-23T07:00:00" GIT_COMMITTER_DATE="2026-10-23T07:00:00"
unset ARBRAIN_ESPEJO_OPENROUTER_URL
echo "Prueba de dos máquinas · $(uname -s) $(uname -m) · git $(git --version | awk '{print $3}') · node $(node --version)"
echo "Carpeta: $RAIZ"

# Llaves de prueba: nunca reales, armadas aquí para que ningún escáner las vea escritas en el código.
PRE="sk-or"; LLAVE_CON="${PRE}-v1-contope$(printf 'c%.0s' $(seq 1 48))"; LLAVE_SIN="${PRE}-v1-sintope$(printf 's%.0s' $(seq 1 48))"
SEMBRADA="${PRE}-v1-sembrada$(printf '9%.0s' $(seq 1 48))"; MANUAL="${PRE}-v1-amano$(printf '7%.0s' $(seq 1 48))"
REFRESH="1//0$(printf 'R%.0s' $(seq 1 40))"

# ── OpenRouter simulado: GET /api/v1/key responde según la llave (con tope = 10, sin tope = null). ──────────────────
cat > "$RAIZ/openrouter-falso.mjs" <<'EOF'
import http from 'node:http'
import { writeFileSync } from 'node:fs'
const s = http.createServer((req, res) => {
  const k = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  const limit = k.includes('contope') ? 10 : k.includes('sintope') ? null : undefined
  if (req.url !== '/api/v1/key' || limit === undefined) { res.writeHead(401); return res.end('{}') }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ data: { label: 'prueba', limit, usage: 1.25, limit_remaining: limit == null ? null : limit - 1.25, is_free_tier: false } }))
})
s.listen(0, '127.0.0.1', () => writeFileSync(process.argv[2], String(s.address().port)))
EOF
node "$RAIZ/openrouter-falso.mjs" "$RAIZ/puerto" & FAKE_PID=$!
for _ in $(seq 1 50); do [ -s "$RAIZ/puerto" ] && break; sleep 0.1; done
export ARBRAIN_ESPEJO_OPENROUTER_URL="http://127.0.0.1:$(cat "$RAIZ/puerto")/api/v1/key"

# ── «GitHub» y la copia del alumno ya respaldada (lo que deja respaldo-github.sh). ───────────────────────────────────
GH="$RAIZ/github/mi-arbrain.git"
git init -q --bare -b mi-arbrain "$GH"
S="$RAIZ/semilla"; mkdir -p "$S/arbrain/scripts" "$S/.claude/memory" "$S/.claude/plan"
git init -q -b mi-arbrain "$S"
mkdir -p "$S/arbrain/scripts/espejo" && cp -R "$AQUI/lib" "$AQUI/espejo.mjs" "$AQUI/supervisor.mjs" "$S/arbrain/scripts/espejo/"   # el motor, sin sus pruebas
echo cliente > "$S/arbrain/EDICION"
printf '# Mi cerebro\n' > "$S/CLAUDE.md"
printf '{"alumno":[".claude/memory/",".claude/plan/",".claude/now.md",".claude/diario/",".claude/daily/",".claude/knowledge/",".claude/settings.local.json","CLAUDE.local.md",".arbrain-sembrado.json","mi-negocio/"],"skills_del_autor":["canvas"]}\n' > "$S/CAPAS.json"
printf '.env\n.env.*\n!.env.example\n*.pem\n*.key\nstore/\n*.db\nlogs/\n*.log\n.claude/settings.local.json\nnode_modules/\n' > "$S/.gitignore"
printf '# Memoria\n' > "$S/.claude/memory/MEMORY.md"
printf '# Objetivos\n\nMeta: 10 clientes\n\nSemana: cerrar la ventana\n' > "$S/.claude/plan/objetivos.md"
printf '# Ahora\n(sin generar)\n' > "$S/.claude/now.md"
git -C "$S" add -A && git -C "$S" -c user.name=Alumno -c user.email=alumno@ejemplo.com commit -qm "Mi capa: semilla"
git -C "$S" remote add origin "$GH" && git -C "$S" push -q -u origin mi-arbrain

L="$RAIZ/laptop"; N="$RAIZ/nube"
git clone -q -b mi-arbrain "$GH" "$L"; git clone -q -b mi-arbrain "$GH" "$N"
for d in "$L" "$N"; do git -C "$d" config user.name "Alumno"; git -C "$d" config user.email "alumno@ejemplo.com"; done
E() { local d="$1"; shift; (cd "$d" && node arbrain/scripts/espejo/espejo.mjs "$@"); }
EJ() { E "$@" --json; }
enOrigen() { git -C "$GH" log -p --all; }
enOrigenNombres() { git -C "$GH" log --all --name-only --format=; }
contiene() { grep -q -- "$2" <<<"$1"; }

seccion "0 · Apagado por defecto"
chequeo "sin activar, el rol es full (como hoy)" test "$(E "$L" rol)" = full
R="$(echo "$LLAVE_SIN" | EJ "$L" cerca --rutina brief-manana --llave-stdin)"
chequeo "sin activar, la cerca deja correr sin pedir tope ni tocar git" contiene "$R" '"codigo":"apagado"'
chequeo "sin activar, no aparece estado del espejo" test ! -e "$L/.arbrain-espejo"

seccion "1 · Alta de las dos máquinas, nadie se elige solo"
E "$L" activar --host laptop-dc >/dev/null; E "$N" activar --host nube-dc >/dev/null; E "$L" sincronizar >/dev/null
chequeo "las dos quedaron dadas de alta en «GitHub»" test "$(git -C "$GH" ls-tree --name-only mi-arbrain arbrain/cerebro/maquinas/ | wc -l | tr -d ' ')" = 2
chequeo "sin líder declarado: laptop es ventana" test "$(E "$L" rol)" = chat
chequeo "sin líder declarado: nube es ventana" test "$(E "$N" rol)" = chat
R="$(echo "$LLAVE_CON" | EJ "$N" cerca --rutina brief-manana --llave-stdin)"
chequeo "sin líder declarado, nadie corre rutinas" contiene "$R" '"codigo":"no_mandas"'
chequeo "el estado local nunca entra a git" no contiene "$(enOrigenNombres)" '.arbrain-espejo'

seccion "2 · La persona elige: «que la nube mande»"
R="$(EJ "$L" lider elegir nube-dc --cita "que la nube mande")"
chequeo "la elección se sube con su cita" contiene "$(git -C "$GH" show mi-arbrain:arbrain/cerebro/lider.json)" 'que la nube mande'
E "$N" sincronizar >/dev/null
chequeo "nube pasa a full" test "$(E "$N" rol)" = full
chequeo "laptop sigue en chat" test "$(E "$L" rol)" = chat

seccion "3 · Archivos por máquina no chocan"
mkdir -p "$L/.claude/daily" "$N/.claude/daily"
printf 'nota de la laptop\n' > "$L/$(E "$L" por-maquina .claude/daily/2026-10-23.md)"
printf 'nota de la nube\n' > "$N/$(E "$N" por-maquina .claude/daily/2026-10-23.md)"
E "$L" sincronizar >/dev/null; E "$N" sincronizar >/dev/null; E "$L" sincronizar >/dev/null
chequeo "laptop tiene la nota de la nube" grep -q 'nota de la nube' "$L/.claude/daily/2026-10-23.nube-dc.md"
chequeo "nube tiene la nota de la laptop" grep -q 'nota de la laptop' "$N/.claude/daily/2026-10-23.laptop-dc.md"
chequeo "sin copias de conflicto" test -z "$(find "$L/.claude" "$N/.claude" -name '*.conflicto-*')"

seccion "4 · Choque real: las dos editan la misma línea"
sed_i() { local f="$1" a="$2" b="$3"; node -e 'const fs=require("fs");const [f,a,b]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(a,b))' "$f" "$a" "$b"; }
sed_i "$L/.claude/plan/objetivos.md" 'Meta: 10 clientes' 'Meta: 12 clientes (laptop)'
sed_i "$N/.claude/plan/objetivos.md" 'Meta: 10 clientes' 'Meta: 15 clientes (nube)'
E "$L" sincronizar >/dev/null
R="$(EJ "$N" sincronizar)"
chequeo "el ciclo de la nube reporta el choque y sigue" contiene "$R" '"choques":\[{'
E "$L" sincronizar >/dev/null
COPIA="$(find "$L/.claude/plan" -name 'objetivos.conflicto-laptop-dc-*.md' | head -1)"
chequeo "queda la copia objetivos.conflicto-laptop-dc-<fecha>.md" test -n "$COPIA"
chequeo "la copia guarda la versión de la laptop" grep -q '12 clientes (laptop)' "${COPIA:-/nada}"
chequeo "el archivo guarda la versión de la nube" grep -q '15 clientes (nube)' "$L/.claude/plan/objetivos.md"
chequeo "nada se perdió en «GitHub» (las dos versiones viven en mi-arbrain)" sh -c "git -C '$GH' grep -q '12 clientes (laptop)' mi-arbrain -- .claude/plan && git -C '$GH' grep -q '15 clientes (nube)' mi-arbrain -- .claude/plan"
chequeo "la nube anotó el aviso de choque" grep -q '"tipo":"choque"' "$N/.arbrain-espejo/avisos.jsonl"

seccion "5 · now.md solo lo escribe el líder"
printf '# Ahora\nescrito por la laptop\n' > "$L/.claude/now.md"
E "$L" sincronizar >/dev/null
chequeo "lo que escribió la laptop no llega a «GitHub»" no contiene "$(enOrigen)" 'escrito por la laptop'
chequeo "la versión de la laptop quedó apartada, no perdida" sh -c "grep -rq 'escrito por la laptop' '$L/.arbrain-espejo/apartados'"
printf '# Ahora\nbrief de la nube 07:00\n' > "$N/.claude/now.md"
E "$N" sincronizar >/dev/null; E "$L" sincronizar >/dev/null
chequeo "lo que escribe la nube sí llega a la laptop" grep -q 'brief de la nube' "$L/.claude/now.md"

seccion "6 · Secretos sembrados: rechazados antes del push"
printf 'OPENROUTER_API_KEY=%s\n' "$SEMBRADA" > "$N/.claude/memory/.env"
printf '{"OPENROUTER_API_KEY":"%s"}\n' "$SEMBRADA" > "$N/.claude/memory/llaves.json"
printf '{"refresh_token":"%s","client_id":"x"}\n' "$REFRESH" > "$N/.claude/plan/google-token.json"
printf '# Nota\nmi llave es %s\n' "$SEMBRADA" > "$N/.claude/memory/nota-con-llave.md"
printf '# Nota limpia\nsin secretos\n' > "$N/.claude/memory/nota-limpia.md"
R="$(EJ "$N" sincronizar)"
chequeo "llaves.json rechazado" contiene "$R" 'llaves.json'
chequeo "token OAuth rechazado" contiene "$R" 'google-token.json'
chequeo "nota con sk-or-… rechazada" contiene "$R" 'nota-con-llave.md'
chequeo "la nota limpia sí subió" contiene "$(enOrigenNombres)" 'nota-limpia.md'
chequeo "ninguna llave en git log -p de «GitHub»" sh -c "! git -C '$GH' log -p --all | grep -q -e '$SEMBRADA' -e '$REFRESH'"
chequeo "ningún .env / llaves.json / token en el historial" sh -c "! git -C '$GH' log --all --name-only --format= | grep -q -e '\.env' -e 'llaves.json' -e 'google-token.json'"
chequeo "los secretos siguen en la máquina (no se borra nada)" test -f "$N/.claude/memory/nota-con-llave.md"

seccion "7 · Tope y folio (la nube manda)"
R="$(echo "$LLAVE_SIN" | EJ "$N" cerca --rutina brief-manana --llave-stdin)"; COD=$?
chequeo "llave sin tope: la rutina no corre" test "$COD" -ne 0
chequeo "y lo dice" contiene "$R" 'no tiene tope'
R="$(echo "$LLAVE_CON" | EJ "$N" cerca --rutina brief-manana --llave-stdin)"; COD=$?
chequeo "llave con tope: la rutina corre" test "$COD" -eq 0
chequeo "su folio quedó en «GitHub» antes de correr" contiene "$(git -C "$GH" show mi-arbrain:arbrain/cerebro/enviados/nube-dc.jsonl)" 'brief-manana:2026-10-23:-'
R="$(echo "$LLAVE_CON" | EJ "$N" cerca --rutina brief-manana --llave-stdin)"
chequeo "la misma rutina en la misma ventana no se repite (folio)" contiene "$R" '"codigo":"folio"'
chequeo "la llave nunca quedó en «GitHub»" sh -c "! git -C '$GH' log -p --all | grep -q -e contope -e sintope"

seccion "8 · El líder pierde el mando: «que mi compu mande»"
E "$L" sincronizar >/dev/null
E "$L" lider elegir laptop-dc --cita "que mi compu mande" >/dev/null
chequeo "la copia local de la nube aún dice que manda ella" grep -q '"lider": "nube-dc"' "$N/arbrain/cerebro/lider.json"
R="$(echo "$LLAVE_CON" | EJ "$N" cerca --rutina correo-semanal --llave-stdin)"; COD=$?
chequeo "la nube (líder viejo) no corre rutinas: confirma en origin" sh -c "[ $COD -ne 0 ] && grep -q 'no_mandas' <<'X'
$R
X"
E "$N" sincronizar >/dev/null
chequeo "tras sincronizar, la nube pasa a chat (apaga su scheduler)" test "$(E "$N" rol)" = chat
chequeo "laptop pasa a full" test "$(E "$L" rol)" = full
R="$(echo "$LLAVE_CON" | EJ "$L" cerca --rutina brief-manana --llave-stdin)"
chequeo "el nuevo líder no repite el brief que ya salió hoy (folio de la nube)" contiene "$R" 'nube-dc'

seccion "9 · Nadie se autopromueve"
E "$L" sincronizar >/dev/null; E "$N" sincronizar >/dev/null
R="$(ARBRAIN_ESPEJO_AHORA=2026-10-23T19:00:00 EJ "$N" sincronizar)"
chequeo "12 h sin latido del líder: la nube avisa" grep -q '"tipo":"lider_sin_latido"' "$N/.arbrain-espejo/avisos.jsonl"
chequeo "…pero sigue en chat" test "$(E "$N" rol)" = chat
chequeo "…y lider.json en «GitHub» sigue diciendo laptop-dc" contiene "$(git -C "$GH" show mi-arbrain:arbrain/cerebro/lider.json)" 'laptop-dc'
R="$(echo "$LLAVE_CON" | ARBRAIN_ESPEJO_AHORA=2026-10-23T19:00:00 EJ "$N" cerca --rutina brief-noche --llave-stdin)"
chequeo "…y no corre rutinas" contiene "$R" '"codigo":"no_mandas"'
chequeo "en el código, solo «lider elegir» escribe lider.json" test "$(grep -rn 'elegir(' "$AQUI/lib" "$AQUI/espejo.mjs" "$AQUI/supervisor.mjs" | grep -v 'export function elegir' | wc -l | tr -d ' ')" = 1

seccion "10 · Commit hecho a mano con una llave: la subida se bloquea entera"
printf 'pegué %s\n' "$MANUAL" > "$L/.claude/memory/a-mano.md"
git -C "$L" add .claude/memory/a-mano.md && git -C "$L" commit -qm "a mano"
R="$(EJ "$L" sincronizar)"
chequeo "el ciclo no sube y lo dice" contiene "$R" '"codigo":"secreto"'
chequeo "la llave no está en «GitHub»" sh -c "! git -C '$GH' log -p --all | grep -q '$MANUAL'"

echo
T=$((PASA + FALLA))
if [ "$FALLA" -eq 0 ]; then echo "PRUEBA_DOS_MAQUINAS OK $PASA/$T"; exit 0; fi
echo "PRUEBA_DOS_MAQUINAS FALLA $FALLA de $T"; exit 1
