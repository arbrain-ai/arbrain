#!/usr/bin/env python3
"""CANDADO 4 · NO PELEAR LA PANTALLA — PreToolUse (Bash). FALLA ABIERTO.

Origen: un relevo ejecutaba `open -b <app anterior>` cada vez que Arbrain quedaba al frente y le
quitaba la app a la persona cuando ella misma le daba clic. Regla: nunca un bucle que reactive apps.

Bloquea: traer ventanas al frente dentro de un bucle (while/for/until … do … done, `watch`,
AppleScript `repeat … end repeat`) o varias veces con `sleep` de por medio, o 3+ veces seguidas.
Traer al frente = `open` sin `-g` (incluye -a/-b), `osascript … activate|frontmost`.
Permite: un `open` suelto, `open -g` (segundo plano) aunque esté en bucle, y el texto que solo
menciona esos comandos (grep, echo entre comillas).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import candados_comun as C  # noqa: E402

CANDADO = 'pantalla'
CLAVES = re.compile(r'\bopen\b|osascript', re.I)
INICIO_BUCLE = {'while', 'until', 'for'}
RAZON = ('No pelear la pantalla: este comando trae ventanas al frente {como}. Le roba el foco a tu dueño '
         'mientras trabaja. Usa `open -g` (segundo plano) o un `open` suelto, y arregla '
         'la causa en vez de reactivar apps en bucle.')


def comando(seg: list[str]) -> tuple[str, list[str]]:
    return C.programa(seg)


def roba_foco(seg: list[str]) -> bool:
    prog, args = comando(seg)
    if prog == 'open':
        cortas = [t for t in args if t.startswith('-') and not t.startswith('--')]
        return not any('g' in t[1:] for t in cortas)
    if prog == 'osascript':
        texto = ' '.join(args)
        return bool(re.search(r'\bactivate\b|\bfrontmost\b[^\n]*\btrue\b', texto, re.I))
    return False


def applescript_en_bucle(seg: list[str]) -> bool:
    prog, args = comando(seg)
    if prog != 'osascript':
        return False
    texto = ' '.join(args)
    m = re.search(r'\brepeat\b(.*?)\bend\s+repeat\b', texto, re.I | re.S)
    return bool(m and re.search(r'\bactivate\b|frontmost', m.group(1), re.I))


def evaluar_cmd(cmd: str) -> str | None:
    if not isinstance(cmd, str) or not CLAVES.search(cmd):
        return None
    try:
        segs = C.segmentos(cmd)
    except ValueError:
        return None  # falla abierto
    profundidad, robos, robos_en_bucle, hay_sleep = 0, 0, 0, False
    for seg in segs:
        palabra = seg[0] if seg else ''
        if palabra in INICIO_BUCLE:
            profundidad += 1
        prog, args = comando(seg)
        if prog == 'watch' and roba_foco([a for a in args if not a.startswith('-') and not a.isdigit()]):
            return RAZON.format(como='con `watch`, una y otra vez')
        if applescript_en_bucle(seg):
            return RAZON.format(como='dentro de un `repeat` de AppleScript')
        if prog == 'sleep':
            hay_sleep = True
        if roba_foco(seg):
            robos += 1
            if profundidad > 0:
                robos_en_bucle += 1
        if 'done' in seg:
            profundidad = max(0, profundidad - seg.count('done'))
    if robos_en_bucle:
        return RAZON.format(como='dentro de un bucle')
    if robos >= 2 and hay_sleep:
        return RAZON.format(como='varias veces con `sleep` de por medio')
    if robos >= 3:
        return RAZON.format(como=f'{robos} veces seguidas')
    return None


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = C.leer_payload(raw)
        args = payload.get('tool_input') or {}
        r = evaluar_cmd(args.get('command', '') if isinstance(args, dict) else '')
    except Exception as e:  # FALLA ABIERTO
        C.registrar(CANDADO, 'error', error=repr(e)[:300])
        return 0
    if r:
        C.registrar(CANDADO, 'bloqueado', razon=r[:200])
        return C.denegar(r)
    return 0


if __name__ == '__main__':
    sys.exit(main())
