#!/usr/bin/env bash
# Requisitos de Arbrain sin pedirle comandos a la persona (22 oct 2026, prueba de Windows de Daniel: «que se instale
# Python, que se instale Node.js… sin preguntarme nada»). Lo corre INSTALAR.md después de clonar y verificar la firma,
# así que este archivo ya viene firmado. Bash de macOS, Linux o Git Bash de Windows.
#
#   bash arbrain/scripts/instalar/requisitos.sh
#
# Qué hace, solo si falta:
#   - Node 22: el oficial de nodejs.org, comprobado contra su SHASUMS256, en ~/.arbrain/node (sin administrador).
#   - Python 3: macOS lo trae con las herramientas de línea de comandos (ventana del sistema «Instalar»); Windows con
#     winget para tu usuario (sin administrador); Linux te da el comando con sudo.
#   - Claude Code (el programa de terminal): con el instalador oficial de claude.ai, sin administrador. Quien solo tiene
#     la app de escritorio de Claude lo necesita: Arbrain le pide a ESE programa que piense con tu cuenta.
#   - ~/.arbrain/entorno.sh: deja lo recién instalado a la vista de esta misma sesión de Claude Code, sin cerrarla
#     (`. ~/.arbrain/entorno.sh` antes de cada comando). También agrega Node a tu PATH para terminales nuevas.
#
# Salida: líneas «· …» de avance y, al final, UNA línea de estado:
#   REQUISITOS_OK node=<v> python=<v> claude=<v> sesion=<si|no>
#   REQUISITOS_ESPERA <motivo>     (algo del sistema está instalándose: espera y vuelve a correr este script)
#   REQUISITOS_FALTA <motivo>      (necesita a la persona; el motivo dice qué)
# Nunca lee ni muestra llaves ni la sesión de Claude: de `claude auth status` solo toma si hay sesión.
set -uo pipefail

ARB="$HOME/.arbrain"
mkdir -p "$ARB"
di() { printf '· %s\n' "$*"; }
espera() { printf 'REQUISITOS_ESPERA %s\n' "$*"; exit 3; }
falta() { printf 'REQUISITOS_FALTA %s\n' "$*"; exit 4; }

case "$(uname -s)" in
  Darwin) SO=mac ;;
  MINGW*|MSYS*|CYGWIN*) SO=win ;;
  Linux) SO=linux; uname -r | grep -qi microsoft && falta "estás en WSL: abre Claude Code en Windows, no dentro de WSL" ;;
  *) falta "sistema no reconocido: $(uname -s)" ;;
esac
case "$(uname -m)" in arm64|aarch64) ARQ=arm64 ;; x86_64|amd64) ARQ=x64 ;; *) falta "arquitectura no soportada: $(uname -m)" ;; esac

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
win() { cygpath -w "$1"; }

# ── entorno.sh: PATH de esta sesión con lo recién instalado (se reescribe entero en cada corrida) ─────────────────────
escribir_entorno() {
  cat > "$ARB/entorno.sh" <<'ENTORNO'
# Arbrain (requisitos.sh): lo recién instalado, visible en esta sesión de Claude Code sin cerrarla.
for _d in "$HOME/.arbrain/node/bin" "$HOME/.arbrain/node" "$HOME/.arbrain/bin" "$HOME/.local/bin"; do
  [ -d "$_d" ] && case ":$PATH:" in *":$_d:"*) ;; *) PATH="$_d:$PATH" ;; esac
done
if command -v cygpath >/dev/null 2>&1; then
  # Windows: Python de winget (por usuario) antes que el alias falso de la Microsoft Store, y lo que haya en el PATH del
  # registro (lo que un instalador agregó después de abrir Claude Code).
  for _d in "$LOCALAPPDATA"/Programs/Python/Python3*/ "$LOCALAPPDATA"/Programs/Python/Python3*/Scripts/ "$PROGRAMFILES/Git/cmd"; do
    _u="$(cygpath -u "$_d" 2>/dev/null)"; [ -d "$_u" ] && PATH="${_u%/}:$PATH"
  done
  _w="$(powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','User')+';'+[Environment]::GetEnvironmentVariable('Path','Machine')" 2>/dev/null | tr -d '\r')"
  [ -n "$_w" ] && PATH="$PATH:$(cygpath -up "$_w" 2>/dev/null)"
fi
export PATH
PY=python3; "$PY" -c 'import sys; assert sys.version_info[0] == 3' >/dev/null 2>&1 || PY=python
export PY
ENTORNO
}
escribir_entorno
# shellcheck source=/dev/null
. "$ARB/entorno.sh"

# ── Node 22 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
node_mayor() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_mayor)" -lt 22 ]; then
  case "$SO" in mac) NP="darwin-$ARQ"; EXT=tar.gz ;; linux) NP="linux-$ARQ"; EXT=tar.gz ;; win) NP="win-$ARQ"; EXT=zip ;; esac
  BASE="https://nodejs.org/dist/latest-v22.x"
  di "Instalando Node 22 para tu usuario (de nodejs.org, sin administrador)…"
  LINEA="$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -E "  node-v22\.[0-9]+\.[0-9]+-$NP\.$EXT\$" | head -1)"
  [ -n "$LINEA" ] || falta "no encontré Node 22 para $NP en nodejs.org (¿sin internet?)"
  SHA="${LINEA%% *}"; ARCHIVO="${LINEA##* }"
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/$ARCHIVO" "$BASE/$ARCHIVO" || falta "no se pudo bajar $ARCHIVO"
  [ "$(sha256 "$TMP/$ARCHIVO")" = "$SHA" ] || falta "Node bajado no coincide con su huella oficial; no se usa"
  rm -rf "$ARB/node.nuevo"; mkdir -p "$ARB/node.nuevo"
  if [ "$SO" = win ]; then
    "$(cygpath -u "$SYSTEMROOT")/System32/tar.exe" -xf "$(win "$TMP/$ARCHIVO")" -C "$(win "$ARB/node.nuevo")" || falta "no se pudo descomprimir Node"
  else
    tar -xzf "$TMP/$ARCHIVO" -C "$ARB/node.nuevo" || falta "no se pudo descomprimir Node"
  fi
  rm -rf "$ARB/node"; mv "$ARB/node.nuevo/${ARCHIVO%.$EXT}" "$ARB/node"; rm -rf "$ARB/node.nuevo" "$TMP"
  # Terminales nuevas: Node en el PATH de la persona.
  if [ "$SO" = win ]; then
    powershell.exe -NoProfile -Command "\$d='$(win "$ARB/node")'; \$p=[Environment]::GetEnvironmentVariable('Path','User'); if (-not ((\$p -split ';') -contains \$d)) { [Environment]::SetEnvironmentVariable('Path', ((\$p.TrimEnd(';') + ';' + \$d).TrimStart(';')), 'User') }" >/dev/null
  else
    for perfil in "$HOME/.zprofile" "$HOME/.bash_profile" "$HOME/.profile"; do
      { [ -f "$perfil" ] || [ "$perfil" = "$HOME/.zprofile" -a "$SO" = mac ] || [ "$perfil" = "$HOME/.profile" -a "$SO" = linux ]; } || continue
      grep -q '.arbrain/node/bin' "$perfil" 2>/dev/null || printf '\n# Arbrain: Node 22\nexport PATH="$HOME/.arbrain/node/bin:$PATH"\n' >> "$perfil"
    done
  fi
  . "$ARB/entorno.sh"
  [ "$(node_mayor)" -ge 22 ] || falta "instalé Node 22 pero no responde"
fi
di "Node $(node -v)"

# ── Python 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
if ! "$PY" -c 'import sys; assert sys.version_info >= (3, 8)' >/dev/null 2>&1; then
  case "$SO" in
    mac)
      xcode-select -p >/dev/null 2>&1 || { xcode-select --install >/dev/null 2>&1; espera "macOS abrió una ventana para instalar sus herramientas de línea de comandos (traen Python y Git): pulsa «Instalar» y espera a que termine (5 a 15 minutos)"; }
      ;;
    win)
      di "Instalando Python 3.12 para tu usuario (winget, sin administrador)…"
      winget.exe install --id Python.Python.3.12 -e --silent --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity >/dev/null 2>&1 \
        || falta "winget no pudo instalar Python. Instálalo desde https://www.python.org/downloads/ (marca «Add python.exe to PATH») y vuelve a correr este script"
      ;;
    linux) falta "falta Python 3: corre en una terminal  sudo apt update && sudo apt install -y python3  y vuelve a correr este script" ;;
  esac
  . "$ARB/entorno.sh"
  "$PY" -c 'import sys; assert sys.version_info >= (3, 8)' >/dev/null 2>&1 || espera "Python se está terminando de instalar; vuelve a correr este script en un minuto"
fi
di "Python $("$PY" -c 'import platform; print(platform.python_version())')"

# ── Claude Code (programa de terminal) ────────────────────────────────────────────────────────────────────────────────
if ! command -v claude >/dev/null 2>&1; then
  di "Instalando Claude Code para la terminal (instalador oficial de claude.ai, sin administrador)…"
  if [ "$SO" = win ]; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex" >/dev/null 2>&1
  else
    curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1
  fi
  . "$ARB/entorno.sh"
  command -v claude >/dev/null 2>&1 || falta "no pude instalar Claude Code de terminal. Sigue https://code.claude.com/docs/en/setup y vuelve a correr este script"
fi
CLAUDE_V="$(claude --version 2>/dev/null | head -1 | cut -d' ' -f1)"
SESION=no
claude auth status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).loggedIn?0:1)}catch{process.exit(1)}})' && SESION=si
di "Claude Code $CLAUDE_V · sesión: $SESION"

printf 'REQUISITOS_OK node=%s python=%s claude=%s sesion=%s\n' "$(node -v)" "$("$PY" -c 'import platform; print(platform.python_version())')" "$CLAUDE_V" "$SESION"
