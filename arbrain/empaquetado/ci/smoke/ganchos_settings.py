#!/usr/bin/env python3
"""Corre cada gancho del .claude/settings.json de la copia como lo corre Claude Code (29 oct 2026).

Uso (desde la raíz de la copia del alumno; en Windows, desde Git Bash):
    python arbrain/empaquetado/ci/smoke/ganchos_settings.py [--raiz <copia>]

Para cada evento y cada comando del settings.json: lo lanza con `bash -c "<comando>"` (Claude Code en Windows usa
Git Bash; `$CLAUDE_PROJECT_DIR` lo expande el shell), con una entrada JSON mínima por stdin propia del evento y,
además, con `{}`. Falla si sale un traceback de Python, si el código no es 0 ni 2, o si se pasa del timeout del
settings. Lo corre la CI ganchos-windows sobre un runner Windows real; en macOS y Linux corre igual.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def entradas(evento, raiz, transcript, matcher):
    base = {'session_id': 'ci-ganchos', 'transcript_path': str(transcript), 'cwd': str(raiz),
            'hook_event_name': evento}
    if evento == 'SessionStart':
        yield {**base, 'source': 'startup'}
    elif evento == 'UserPromptSubmit':
        yield {**base, 'prompt': '¿Qué tengo hoy en mi agenda? Revisión de cotización, señal ñandú'}
    elif evento == 'PreToolUse':
        if 'mcp' in (matcher or ''):
            yield {**base, 'tool_name': 'mcp__manos__observar', 'tool_input': {}}
        else:
            yield {**base, 'tool_name': 'Bash', 'tool_input': {'command': 'echo hola && ls'}}
    else:  # PreCompact, SessionEnd, Stop y lo que venga: todos reciben el transcript
        yield base
    yield {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raiz', default=os.getcwd())
    args = ap.parse_args()
    raiz = Path(args.raiz).resolve()
    settings = json.loads((raiz / '.claude/settings.json').read_text(encoding='utf-8'))
    bash = shutil.which('bash')
    if not bash:
        print('no hay bash en el PATH (en Windows, correr desde Git Bash)', file=sys.stderr)
        return 2
    tmp = Path(tempfile.mkdtemp(prefix='ganchos-ci-'))
    transcript = tmp / 'sesion.jsonl'
    transcript.write_text(json.dumps({
        'type': 'user', 'uuid': 'u-ci', 'timestamp': '2026-10-27T23:30:00Z',
        'message': {'role': 'user', 'content': [{'type': 'text', 'text': '¿Qué hago hoy? año fiscal, acentos áéíóú'}]}},
        ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    # Sin las variables del daemon: así arranca Claude Code en la terminal del alumno.
    env = {k: v for k, v in os.environ.items()
           if k not in ('CLAUDECLAW_DAEMON', 'CLAUDECLAW_SOURCE', 'CLAUDE_INVOKED_BY', 'ARBRAIN_MODO_PERMISOS')}
    env['CLAUDE_PROJECT_DIR'] = str(raiz)
    fallas, corridas = [], 0
    for evento, grupos in (settings.get('hooks') or {}).items():
        for grupo in grupos:
            for gancho in grupo.get('hooks', []):
                if gancho.get('type') != 'command':
                    continue
                comando = gancho['command']
                for entrada in entradas(evento, raiz, transcript, grupo.get('matcher')):
                    corridas += 1
                    nombre = comando.split('.claude/hooks/')[-1].replace('"', '')
                    etiqueta = f"{evento} | {nombre} | {'{}' if not entrada else 'evento'}"
                    try:
                        r = subprocess.run([bash, '-c', comando], input=json.dumps(entrada, ensure_ascii=False),
                                           capture_output=True, text=True, encoding='utf-8', errors='replace',
                                           cwd=raiz, env=env, timeout=max(int(gancho.get('timeout', 60)), 5) + 20)
                    except subprocess.TimeoutExpired:
                        fallas.append(f'{etiqueta}: se pasó del timeout')
                        continue
                    salida = (r.stdout or '') + (r.stderr or '')
                    estado = 'ok'
                    if 'Traceback' in salida:
                        estado = 'TRACEBACK'
                    elif r.returncode not in (0, 2):
                        estado = f'código {r.returncode}'
                    # ASCII en la consola: la de Windows es cp1252.
                    print(f'[{estado}] {etiqueta} -> {r.returncode}'.encode('ascii', 'replace').decode())
                    if estado != 'ok':
                        fallas.append(f'{etiqueta}: {estado}\n{salida[-2000:]}')
    shutil.rmtree(tmp, ignore_errors=True)
    if not corridas:
        print('el settings.json no trae ganchos de comando: nada que probar', file=sys.stderr)
        return 1
    if fallas:
        print('\n\n'.join(fallas).encode('ascii', 'replace').decode(), file=sys.stderr)
        return 1
    print(f'GANCHOS DEL SETTINGS: OK ({corridas} corridas sin traceback)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
