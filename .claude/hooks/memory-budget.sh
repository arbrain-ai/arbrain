#!/bin/bash
# Sensor del presupuesto de contexto — nace el 23 ago 2026 (cirugía v1), aprende la anatomía v2
# el 31 ago 2026 (split esencia/índice + hook memory-recall).
# El fallo que existe para atrapar: que lo IMPORTADO vuelva a engordar hasta ser un segundo corpus.
# Pasó entre el 19 jul y el 23 ago (81KB -> 158KB = +1,400 tokens/día cobrados en CADA conversación).
# Uso: bash .claude/hooks/memory-budget.sh    ·    lo llama también la skill os-audit.
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}" || exit 1
# Windows (Git Bash): `python3` puede ser el alias de la Microsoft Store, que no corre nada; UTF-8 forzado para los ✓/✗.
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
py=python3
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -I -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' </dev/null >/dev/null 2>&1; then py=$p; break; fi
done
exec "$py" -I - <<'PY'  # -I: sin la carpeta actual en sys.path (un módulo homónimo del workspace no se importa)
import re, sys
# -I también ignora PYTHONIOENCODING: en una consola cp1252 de Windows los ✓/✗ tronaban (CI de Windows, rc3 0.2.16).
for _f in (sys.stdout, sys.stderr):
    try: _f.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
from pathlib import Path
# MEMORY.md se importa SIEMPRE -> techo duro chico. El índice no se importa (lo sirve el hook
# memory-recall por triggers), pero se acota igual para que la rotación a MEMORY-archivo.md siga viva.
# CLAUDE.md es el contrato de Arbrain: llega y se actualiza con cada versión, no lo engorda tu memoria. Su techo cubre
# el contrato publicado con holgura (la prueba arbrain/empaquetado/generador/pruebas/memory-budget.test.mjs lo cuida);
# antes era 9,000 y marcaba en rojo un CLAUDE.md que el alumno no puede recortar sin pelear con cada actualización.
MEM_MAX, IDX_MAX, CLA_MAX, ENTRY_MAX, WARN = 6000, 90000, 18000, 400, 0.85
mem = Path('.claude/memory/MEMORY.md').read_text(encoding='utf-8')
idx = Path('.claude/memory/MEMORY-indice.md').read_text(encoding='utf-8')
usr = Path('.claude/memory/MEMORY-user.md').read_text(encoding='utf-8')
cla = Path('CLAUDE.md').read_text(encoding='utf-8')
fail = warn = False

for name, txt, mx, imported in [('MEMORY.md', mem, MEM_MAX, True),
                                ('MEMORY-indice.md', idx, IDX_MAX, False),
                                ('MEMORY-user.md', usr, 18000, False),
                                ('CLAUDE.md', cla, CLA_MAX, True)]:
    n = len(txt); r = n/mx
    flag = '✗' if r > 1 else ('⚠' if r > WARN else '·')
    tok = f"~{n/3.6:>6,.0f} tokens" if imported else "(no importado)"
    print(f"{flag} {name:17} {n:>7,} / {mx:>6,} chars  ({r*100:4.0f}%)  {tok}")
    if r > 1: fail = True
    elif r > WARN: warn = True

for name, txt in [('MEMORY.md', mem), ('MEMORY-indice.md', idx), ('MEMORY-user.md', usr)]:
    largas = [l for l in txt.splitlines() if l.startswith('- `') and len(l) > ENTRY_MAX]
    if largas:
        print(f"✗ {name}: {len(largas)} entradas sobre {ENTRY_MAX} chars (el detalle va en el ARCHIVO):")
        for l in largas[:8]: print(f"    {len(l):>4} · {l[:64]}")
        fail = True

# entradas de project/feedback/reference NO viven en el archivo importado (contrato v2)
fugadas = [l for l in mem.splitlines()
           if re.match(r'^- `(project|feedback|reference)/', l)]
if fugadas:
    print(f"✗ {len(fugadas)} entradas project/feedback/reference en MEMORY.md (van en MEMORY-indice.md):")
    for l in fugadas[:5]: print(f"    {l[:70]}")
    fail = True

rotos = [p for p in sorted(set(re.findall(r'`((?:user|project|feedback|reference)/[^`]+\.md)`', mem + idx + usr)))
         if 'AAAA-MM-DD' not in p and not Path('.claude/memory', p).exists()]  # los ejemplos de la plantilla no cuentan
if rotos:
    print("✗ punteros rotos:", *rotos, sep="\n    "); fail = True

muertos = [i[1:] for i in re.findall(r'^@\S+', cla, re.M) if not Path(i[1:]).exists()]
if muertos:
    print("✗ @import muerto en CLAUDE.md:", *muertos, sep="\n    "); fail = True

if fail: print("\n→ ARREGLAR antes de seguir agregando memoria.")
elif warn:
    print("\n⚠ sobre el 85% del presupuesto. El techo NO se sube: se ROTA.")
    print("  MEMORY-indice.md: mover entradas de project/ con más de 90 días a MEMORY-archivo.md")
    print("  (el hook memory-recall también matchea el archivo, así que el recall sobrevive).")
    print("  MEMORY.md (esencia): solo Reglas Vivas + user/; si engorda, consolidar reglas, no rotar.")
else: print("\n✓ presupuesto de contexto en verde")
sys.exit(1 if fail else 0)
PY
