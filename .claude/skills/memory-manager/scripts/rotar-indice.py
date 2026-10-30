#!/usr/bin/env python3
"""rotar-indice.py: el actuador del sensor de memoria («el techo no se sube, se ROTA»).

Cuando `bash .claude/hooks/memory-budget.sh` marca ⚠ o ✗ en MEMORY-indice.md, este script mueve las entradas de
`project/` con fecha en el nombre (`…-AAAA-MM-DD.md`) más viejas que --dias (90 por defecto) de MEMORY-indice.md a
MEMORY-archivo.md, ÍNTEGRAS, con sus disparadores: el recall (memory-recall.py) también lee el archivo y las marca
«rotada». No toca feedback/, reference/ ni user/. No mueve ni borra ningún archivo de memoria. Reversible con git.

Uso, desde la carpeta de tu cerebro:
  python3 .claude/skills/memory-manager/scripts/rotar-indice.py            (solo muestra qué rotaría)
  python3 .claude/skills/memory-manager/scripts/rotar-indice.py --aplicar  (lo escribe)
En Windows, `py` o `python` en lugar de `python3`.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

# <cerebro>/.claude/skills/memory-manager/scripts/rotar-indice.py → <cerebro>/.claude/memory
MEM = Path(__file__).resolve().parents[3] / "memory"
ENTRADA = re.compile(r"^- `project/([^`]*?(\d{4}-\d{2}-\d{2})[^`]*)`")


def leer(p):
    return p.read_text(encoding="utf-8") if p.exists() else ""


def main(argv=None, mem=MEM, hoy=None):
    ap = argparse.ArgumentParser(description="Rota entradas viejas de project/ del índice al archivo de memoria.")
    ap.add_argument("--dias", type=int, default=90)
    ap.add_argument("--aplicar", action="store_true")
    a = ap.parse_args(argv)
    indice, archivo = mem / "MEMORY-indice.md", mem / "MEMORY-archivo.md"
    if not indice.exists():
        print(f"No encuentro {indice}. Corre esto desde la carpeta de tu cerebro.")
        return 1
    hoy = hoy or dt.date.today()
    corte = hoy - dt.timedelta(days=a.dias)
    texto = leer(indice)
    quedan, salen = [], []
    for linea in texto.splitlines():
        m = ENTRADA.match(linea)
        try:
            vieja = bool(m) and dt.date.fromisoformat(m.group(2)) < corte
        except ValueError:
            vieja = False
        (salen if vieja else quedan).append(linea)
    despues = len("\n".join(quedan)) + 1
    print(f"Rotarían {len(salen)} entradas de project/ anteriores al {corte}: {len(texto):,} → {despues:,} caracteres.")
    for s in salen[:8]:
        print("  ", s[:110])
    if not a.aplicar or not salen:
        print("(solo vista; --aplicar para escribir)" if salen else "Nada que rotar.")
        return 0
    indice.write_text("\n".join(quedan).rstrip("\n") + "\n", encoding="utf-8")
    bloque = f"\n## project/ · rotadas {hoy} (más de {a.dias} días, `rotar-indice.py`)\n" + "\n".join(salen) + "\n"
    archivo.write_text(leer(archivo).rstrip("\n") + "\n" + bloque, encoding="utf-8")
    print(f"Hecho. Archivo: {archivo.name} (+{len(salen)}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
