#!/usr/bin/env bash
# Respaldo de tu Arbrain en TU GitHub, en un repositorio privado (22 oct 2026, prueba de Windows de Daniel: «cada
# usuario debería tener su propio repositorio en GitHub»). Lo ofrece INSTALAR.md al final; se puede correr cuando sea.
#
#   bash ~/Arbrain/arbrain/scripts/instalar/respaldo-github.sh [carpeta]     (por defecto ~/Arbrain)
#
# Se corre las veces que haga falta; cada vez avanza lo que pueda y termina con UNA línea:
#   RESPALDO_CODIGO <código>   se abrió github.com/login/device: la persona escribe ese código y autoriza. Vuelve a
#                              correr el script cada 10 s hasta que cambie.
#   RESPALDO_OK <dirección>    tu rama mi-arbrain quedó en tu repo privado mi-arbrain (remoto «origin»).
#   RESPALDO_FALTA <motivo>
# Usa gh (la herramienta oficial de GitHub): si no está, baja la última versión de github.com/cli/cli a ~/.arbrain/bin
# comprobada contra su archivo de huellas. Nunca muestra ni guarda tokens fuera de gh, y nunca sube nada al repo de
# Arbrain (el remoto «dani» es de solo lectura).
set -uo pipefail

CARPETA="${1:-$HOME/Arbrain}"
ARB="$HOME/.arbrain"; mkdir -p "$ARB/bin"
[ -f "$ARB/entorno.sh" ] && . "$ARB/entorno.sh"
case ":$PATH:" in *":$ARB/bin:"*) ;; *) PATH="$ARB/bin:$PATH" ;; esac
falta() { printf 'RESPALDO_FALTA %s\n' "$*"; exit 4; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
abrir() { case "$(uname -s)" in Darwin) open "$1" ;; MINGW*|MSYS*|CYGWIN*) cmd.exe //c start "" "$1" ;; *) xdg-open "$1" ;; esac >/dev/null 2>&1 || true; }

git -C "$CARPETA" rev-parse --is-inside-work-tree >/dev/null 2>&1 || falta "no encuentro tu Arbrain en $CARPETA"

# ── gh ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  case "$(uname -s)" in Darwin) SO=macOS; EXT=zip ;; MINGW*|MSYS*|CYGWIN*) SO=windows; EXT=zip ;; *) SO=linux; EXT=tar.gz ;; esac
  case "$(uname -m)" in arm64|aarch64) ARQ=arm64 ;; *) ARQ=amd64 ;; esac
  V="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | sed -n 's/.*"tag_name": *"v\([0-9.]*\)".*/\1/p' | head -1)"
  [ -n "$V" ] || falta "no pude consultar la versión de gh (¿sin internet?)"
  N="gh_${V}_${SO}_${ARQ}.${EXT}"; BASE="https://github.com/cli/cli/releases/download/v$V"
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/$N" "$BASE/$N" && curl -fsSL -o "$TMP/sumas" "$BASE/gh_${V}_checksums.txt" || falta "no pude bajar gh"
  [ "$(grep " $N\$" "$TMP/sumas" | cut -d' ' -f1)" = "$(sha256 "$TMP/$N")" ] || falta "gh bajado no coincide con su huella oficial; no se usa"
  if [ "$EXT" = zip ]; then
    if [ "$SO" = windows ]; then "$(cygpath -u "$SYSTEMROOT")/System32/tar.exe" -xf "$(cygpath -w "$TMP/$N")" -C "$(cygpath -w "$TMP")"
    else (cd "$TMP" && unzip -q "$N"); fi
  else tar -xzf "$TMP/$N" -C "$TMP"; fi
  # El zip de Windows trae bin/gh.exe en la raíz; los demás, dentro de una carpeta con el nombre del archivo.
  BIN="$(find "$TMP" -path '*bin/gh' -o -path '*bin/gh.exe' | head -1)"
  [ -n "$BIN" ] && cp "$BIN" "$ARB/bin/" || falta "no pude instalar gh"
  rm -rf "$TMP"
  command -v gh >/dev/null 2>&1 || falta "gh no responde"
fi

# ── Sesión de GitHub (código de un solo uso en el navegador) ──────────────────────────────────────────────────────────
if ! gh auth status -h github.com >/dev/null 2>&1; then
  LOG="$ARB/gh-login.log"
  CODIGO="$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}' "$LOG" 2>/dev/null | tail -1)"
  VIVO=no; [ -f "$ARB/gh-login.pid" ] && kill -0 "$(cat "$ARB/gh-login.pid")" 2>/dev/null && VIVO=si
  if [ "$VIVO" = no ] || [ -z "$CODIGO" ]; then
    (printf '\n' | gh auth login -h github.com -p https --web --skip-ssh-key > "$LOG" 2>&1 & echo $! > "$ARB/gh-login.pid")
    for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 1; CODIGO="$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}' "$LOG" 2>/dev/null | tail -1)"; [ -n "$CODIGO" ] && break; done
    [ -n "$CODIGO" ] || falta "GitHub no dio código de acceso: $(tail -2 "$LOG")"
    abrir "https://github.com/login/device"
  fi
  printf 'RESPALDO_CODIGO %s\n' "$CODIGO"
  exit 3
fi
rm -f "$ARB/gh-login.pid" "$ARB/gh-login.log"

# ── Repo privado mi-arbrain y empuje de tu rama ───────────────────────────────────────────────────────────────────────
YO="$(gh api user --jq .login)" || falta "no pude leer tu usuario de GitHub"
gh repo view "$YO/mi-arbrain" >/dev/null 2>&1 \
  || gh repo create "$YO/mi-arbrain" --private --description "Mi Arbrain: respaldo privado" >/dev/null \
  || falta "no pude crear tu repositorio privado mi-arbrain"
[ "$(gh repo view "$YO/mi-arbrain" --json visibility --jq .visibility)" = "PRIVATE" ] || falta "github.com/$YO/mi-arbrain ya existe y NO es privado: no subo nada ahí"
URL="https://github.com/$YO/mi-arbrain.git"
if git -C "$CARPETA" remote get-url origin >/dev/null 2>&1; then
  [ "$(git -C "$CARPETA" remote get-url origin)" = "$URL" ] || falta "ya tienes otro remoto «origin» ($(git -C "$CARPETA" remote get-url origin)); no lo cambio"
else
  git -C "$CARPETA" remote add origin "$URL"
fi
gh auth setup-git -h github.com >/dev/null 2>&1
git -C "$CARPETA" push -q -u origin mi-arbrain || falta "no pude subir tu rama mi-arbrain"
printf 'RESPALDO_OK https://github.com/%s/mi-arbrain\n' "$YO"
