#!/bin/zsh
# Instala el motor de Arbrain en el Studio. NO lo corre ningún deploy: Daniel lo decide.
#   ./instalar.sh            compila release, copia el binario a ~/.local/bin y deja el plist
#   ./instalar.sh --cargar   además lo carga en launchd (o lo RELEVA si ya hay un motor vivo)
# Nunca mata un motor vivo: si ya hay uno, el binario nuevo entra por relevo (SCM_RIGHTS).
set -euo pipefail
cd "$(dirname "$0")"
cargo build --release
mkdir -p "$HOME/.local/bin" "$HOME/.config/arbrain"
BIN="$HOME/.local/bin/arbrain-motor"
cp -f target/release/arbrain-motor "$BIN.nuevo" && mv -f "$BIN.nuevo" "$BIN"   # reemplazo atómico; el proceso vivo conserva su imagen
PL="$HOME/Library/LaunchAgents/com.arbrain.motor.plist"
sed -e "s#__BIN__#$BIN#" -e "s#__HOME__#$HOME#g" com.arbrain.motor.plist > "$PL"
echo "binario: $BIN · plist: $PL"
[[ "${1:-}" == "--cargar" ]] || { echo "sin --cargar: nada arrancó"; exit 0; }
if "$BIN" --estado >/dev/null 2>&1; then
  echo "hay un motor vivo: relevo sin matar"
  nohup "$BIN" --relevo >/dev/null 2>&1 &
else
  launchctl bootstrap "gui/$(id -u)" "$PL"
fi
sleep 2; "$BIN" --estado | head -c 400; echo
