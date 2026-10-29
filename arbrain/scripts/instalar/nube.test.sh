#!/usr/bin/env bash
# Pruebas de las funciones puras de nube.sh (23 oct 2026). No tocan el sistema: carpetas temporales y git local.
#   bash arbrain/scripts/instalar/nube.test.sh
# La instalación de verdad (systemd, ufw, sshd, Tailscale) la prueba nube-prueba.sh en un Ubuntu real.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; fail=0
export NUBE_SOLO_FUNCIONES=1 NUBE_RAIZ="$T/raiz"
# shellcheck source=/dev/null
. "$AQUI/nube.sh"
check() { if [ "$2" = "$3" ]; then echo "OK   $1"; else echo "FAIL $1 (esperaba «$3», obtuve «$2»)"; fail=1; fi; }

# 1. sshd: solo llave, y gana a 50-cloud-init (archivo 01-)
check "sshd sin contraseñas" "$(texto_sshd | grep -c '^PasswordAuthentication no$')" 1
check "sshd root solo con llave" "$(texto_sshd | grep -c '^PermitRootLogin prohibit-password$')" 1
check "drop-in va primero" "$(basename "$CONF_SSH")" "01-arbrain.conf"
check "drop-in bajo NUBE_RAIZ" "${CONF_SSH#"$T"/raiz/etc/ssh/}" "sshd_config.d/01-arbrain.conf"

check "instala bubblewrap (sin él Claude Code no corre en Linux)" "$(printf '%s\n' $PAQUETES | grep -cx bubblewrap)" 1

# 2. actualizaciones automáticas
check "unattended activado" "$(texto_auto_upgrades | grep -c 'Unattended-Upgrade "1"')" 1

# 3. escribir_si_cambia: idempotente
F="$T/raiz/etc/x/a.conf"
echo hola | escribir_si_cambia "$F" 600; check "primera escritura cambia" "$?" 0
echo hola | escribir_si_cambia "$F" 600; check "segunda escritura no cambia" "$?" 1
echo otra | escribir_si_cambia "$F" 600; check "contenido nuevo cambia" "$?" 0
check "modo 600" "$(ls -l "$F" | cut -c1-10)" "-rw-------"

# 4. slug de la nube
check "slug simple" "$(slug_nube 'Mi-VPS.ejemplo.com')" "nube-mi-vps"
check "slug raro" "$(slug_nube 'srv_01 ÑÑ!!')" "nube-srv-01"
check "slug vacío" "$(slug_nube '...')" "nube-servidor"
S="$(slug_nube 'un-nombre-de-maquina-larguisimo-de-verdad')"; check "slug ≤ 24" "${#S}" 24

# 5. identidad ajena
L="$(printf '%s\n' .claude/hooks/.host-slug .claude/hooks/tmp/flush-state.json .claude/hooks/tmp/compile-state.json arbrain/server/store/x.db .claude/memory/MEMORY.md arbrain/scripts/servidor.mjs restore/x | rutas_ajenas | tr '\n' ' ')"
check "rutas ajenas" "$L" ".claude/hooks/.host-slug .claude/hooks/tmp/flush-state.json .claude/hooks/tmp/compile-state.json arbrain/server/store/x.db "

# 6. fuera_de_capa: solo lo que no es capa del alumno cuenta como código distinto del firmado
R="$T/repo"; mkdir -p "$R/arbrain/scripts" "$R/.claude/skills/del-autor" "$R/.claude/memory"
( cd "$R" && git init -q && git config user.name t && git config user.email t@t \
  && echo 1 > arbrain/scripts/a.mjs && echo s > .claude/skills/del-autor/SKILL.md && echo m > .claude/memory/MEMORY.md \
  && git add -A && git commit -qm base && git tag -a v0.0.1 -m v )
check "copia igual a la etiqueta" "$(fuera_de_capa "$R" v0.0.1)" ""
( cd "$R" && echo yo >> .claude/memory/MEMORY.md && mkdir -p .claude/skills/mia mi-negocio mi-marca .claude/hooks/tmp && echo x > .claude/skills/mia/SKILL.md \
  && echo n > mi-negocio/plan.md && echo 'html:root{--primary:red}' > mi-marca/tema.css && echo laptop > .claude/hooks/.host-slug && echo '{}' > .claude/hooks/tmp/flush-state.json && git add -A && git commit -qm capa )
check "capa, skill propia e identidad no cuentan" "$(fuera_de_capa "$R" v0.0.1)" ""
( cd "$R" && echo 2 >> .claude/skills/del-autor/SKILL.md && git commit -qam skill )
check "skill del autor cambiada sí cuenta" "$(fuera_de_capa "$R" v0.0.1)" ".claude/skills/del-autor/SKILL.md"
( cd "$R" && git checkout -q HEAD~1 -- .claude/skills/del-autor/SKILL.md && echo malo >> arbrain/scripts/a.mjs && git commit -qam codigo )
check "código cambiado sí cuenta" "$(fuera_de_capa "$R" v0.0.1)" "arbrain/scripts/a.mjs"
( cd "$R" && git checkout -q HEAD~1 -- arbrain/scripts/a.mjs && mkdir -p arbrain/cerebro/maquinas arbrain/cerebro/reportes arbrain/cerebro/enviados arbrain/cerebro/latidos \
  && echo '{}' > arbrain/cerebro/lider.json && echo '{}' > arbrain/cerebro/maquinas/laptop-1.json && echo b > arbrain/cerebro/reportes/brief.md \
  && echo '{}' > arbrain/cerebro/enviados/laptop-1.jsonl && echo '{}' > arbrain/cerebro/latidos/laptop-1.json && git add -A && git commit -qm espejo )
check "lo que sube el espejo (líder, máquinas, reportes, folios, latidos) no cuenta" "$(fuera_de_capa "$R" v0.0.1)" ""
( cd "$R" && echo x > arbrain/cerebro/sembrar.py && git add -A && git commit -qm sembrador )
check "código de arbrain/cerebro fuera de lo que sube el espejo sí cuenta" "$(fuera_de_capa "$R" v0.0.1)" "arbrain/cerebro/sembrar.py"
# La lista de nube.sh es la del motor (si el motor agrega una carpeta del cerebro, esta prueba avisa).
if command -v node >/dev/null 2>&1 && [ -f "$AQUI/../espejo/lib/viaja.mjs" ]; then
  MOTOR="$(cd "$AQUI/../espejo/lib" && node --input-type=module -e '
    const src = (await import("node:fs")).readFileSync("viaja.mjs", "utf8")
    const m = /const CEREBRO = \[([\s\S]*?)\]/.exec(src)[1]
    const v = await import("./viaja.mjs")
    const nombres = { LIDER: v.LIDER, CONFIG_VERSIONADA: v.CONFIG_VERSIONADA, MAQUINAS_DIR: v.MAQUINAS_DIR, LATIDOS_DIR: v.LATIDOS_DIR, ENVIADOS_DIR: v.ENVIADOS_DIR }
    const lista = m.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/^`\$\{(\w+)\}\/`$/, (_, n) => nombres[n] + "/").replace(/^(\w+)$/, (_, n) => nombres[n] ?? n).replace(/^\x27|\x27$/g, ""))
    process.stdout.write(lista.sort().join(" "))')"
  NUBE_L="$(sed -n '/Lo que el modo espejo sube del cerebro/,/latidos/p' "$AQUI/nube.sh" | grep -oE 'arbrain/cerebro/[a-z.]+(/\*)?' | sed 's|/\*$|/|' | sort | tr '\n' ' ' | sed 's/ $//')"
  [ -n "$MOTOR" ] && check "nube.sh trata como del alumno lo mismo que el motor sube ($(echo "$MOTOR" | wc -w | tr -d " ") rutas)" "$NUBE_L" "$MOTOR" || check "lista del motor legible" vacia llena
fi

# 7. Gancho del espejo: qué hace según el estado (pura) y cómo lee `espejo.mjs estado --json`
check "espejo: apagado → activar" "$(plan_espejo no - - nube-x ventana)" activar
check "espejo: apagado y líder pedido → activar (luego elige)" "$(plan_espejo no - - nube-x lider)" activar
check "espejo: ya activo de ventana → nada" "$(plan_espejo si nube-x laptop-1 nube-x ventana)" nada
check "espejo: activo, pide mando → elegir" "$(plan_espejo si nube-x laptop-1 nube-x lider)" elegir
check "espejo: ya manda → nada (idempotente)" "$(plan_espejo si nube-x nube-x nube-x lider)" nada
check "espejo: sin --rol no cambia quién manda" "$(plan_espejo si nube-x laptop-1 nube-x '')" nada
check "espejo: la copia ya tiene otro nombre → no lo cambia" "$(plan_espejo si nube-viejo nube-viejo nube-x lider)" otro-nombre
check "estado JSON → campos" "$(printf '%s\n' 'ruido' '{"activo":true,"host":"nube-x","lider":"laptop-1"}' | campos_espejo)" "si nube-x laptop-1"
check "estado sin líder" "$(echo '{"activo":true,"host":"nube-x","lider":null}' | campos_espejo)" "si nube-x -"
check "estado ilegible → apagado" "$(echo 'no es json' | campos_espejo)" "no - -"
R1="$(bash "$AQUI/nube.sh" instalar --espejo --rol lider 2>&1 | tail -1)"
case "$R1" in "NUBE_FALTA para que esta nube mande necesito las palabras de la persona"*) check "--rol lider sin --cita se niega" si si ;; *) check "--rol lider sin --cita se niega" "$R1" "NUBE_FALTA para que esta nube mande…" ;; esac
R2="$(bash "$AQUI/nube.sh" instalar --rol lider --cita "que la nube mande" 2>&1 | tail -1)"
check "--rol lider sin --espejo se niega" "$R2" "NUBE_FALTA --rol lider va con --espejo"

# 8. La copia generada trae lo que usa la rama servidor
check "nube.sh ejecutable" "$([ -x "$AQUI/nube.sh" ] && echo si)" si
check "sintaxis de nube.sh" "$(bash -n "$AQUI/nube.sh" && echo si)" si
check "sintaxis de nube-prueba.sh" "$(bash -n "$AQUI/nube-prueba.sh" && echo si)" si
check "sintaxis de nube-solo-prueba.sh" "$(bash -n "$AQUI/nube-solo-prueba.sh" && echo si)" si

# 9. Solo en tu servidor (29 oct): la sesión de Claude se lee sin datos de la cuenta y lo de la persona exige su terminal
check "sesión de suscripción → plan" "$(echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max","email":"a@b.c"}' | python3 -c "$LEER_SESION_PY")" "si max"
check "sesión por API no cuenta como su cuenta" "$(echo '{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}' | python3 -c "$LEER_SESION_PY")" "no"
check "sin sesión" "$(echo '{"loggedIn":false}' | python3 -c "$LEER_SESION_PY")" "no"
check "salida ilegible" "$(echo 'no es json' | python3 -c "$LEER_SESION_PY")" "no"
check "nunca imprime el correo" "$(echo '{"loggedIn":true,"apiProvider":"firstParty","subscriptionType":"pro","email":"a@b.c"}' | python3 -c "$LEER_SESION_PY" | grep -c '@')" 0
mkdir -p "$T/cfg" && echo '{"motor":"suscripcion"}' > "$T/cfg/motor-claude.json"
check "motor elegido" "$(python3 -c "$LEER_MOTOR_PY" "$T/cfg/motor-claude.json")" suscripcion
check "motor sin archivo" "$(python3 -c "$LEER_MOTOR_PY" "$T/cfg/no-existe.json")" "-"
check "sin terminal no hay terminal" "$(hay_terminal < /dev/null 2>/dev/null && echo si || echo no)" "$(setsid true 2>/dev/null; { : < /dev/tty; } 2>/dev/null && echo si || echo no)"
cuerpo() { awk -v f="$1() {" 'index($0, f) == 1 {p = 1} p {print} p && /^}$/ {exit}' "$AQUI/nube.sh"; }
check "cuerpo de una orden se lee" "$(cuerpo orden_claude | head -1)" "orden_claude() {"
for o in claude telefono codigo conectar; do
  check "nube.sh conoce «$o»" "$(grep -c "^elif \[ \"\$ORDEN\" = $o \]; then orden_$o$" "$AQUI/nube.sh")" 1
done
for o in claude codigo conectar; do
  check "nube.sh $o escribe en /dev/tty y se niega sin terminal" "$(cuerpo "orden_$o" | grep -c 'hay_terminal ||')" 1
done
check "nube.sh telefono usa serve, nunca funnel" "$(cuerpo orden_telefono | grep -c funnel)" 0

rm -rf "$T"
[ "$fail" = 0 ] && echo "nube.test.sh: todo verde" || echo "nube.test.sh: HAY FALLAS"
exit $fail
