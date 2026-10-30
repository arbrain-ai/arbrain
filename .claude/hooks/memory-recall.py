#!/usr/bin/env python3
"""Recall pasivo de memoria — nace el 31 ago 2026 con la cirugía v2 de progressive disclosure.

MEMORY-indice.md ya no se importa al contexto; este hook (UserPromptSubmit) restituye el
recall pasivo: matchea cada prompt del dueño contra los triggers (**T:**) del índice y de la
capa rotada (MEMORY-archivo.md) e inyecta las entradas tocadas como contexto del turno.
Sin match, inyecta nada y cuesta cero.

Selftest (sensor, lo llama os-audit): python3 memory-recall.py --selftest
"""
import json
import re
import sys
import unicodedata
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'memory'
FILES = [('indice', ROOT / 'MEMORY-indice.md'), ('archivo', ROOT / 'MEMORY-archivo.md'),
         ('user', ROOT / 'MEMORY-user.md')]
MAX_ENTRIES = 6          # tope de entradas inyectadas por prompt
MIN_TOKEN = 3            # triggers de una palabra más cortos que esto se ignoran


def intent_module():
    path = Path(__file__).with_name('intent-context.py')
    spec = importlib.util.spec_from_file_location('shared_intents', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

ENTRY_RE = re.compile(r'^- (`[^`]+`.*?)\*\*T:\*\*(.*)$')


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9ñ]+', ' ', s.lower()).strip()


def load_entries():
    entries = []
    for tag, path in FILES:
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            m = ENTRY_RE.match(line)
            if not m:
                continue
            triggers = [t.strip(' .') for t in m.group(2).split(',') if t.strip(' .')]
            entries.append((tag, line, [norm(t) for t in triggers if t]))
    return entries


def match(prompt: str, entries):
    p = norm(prompt)
    tokens = set(p.split())
    hits = []
    for tag, line, triggers in entries:
        matched = []
        for t in triggers:
            if not t:
                continue
            if ' ' in t:
                if t in p:
                    matched.append(t)
            elif len(t) >= MIN_TOKEN and t in tokens:
                matched.append(t)
        if matched:
            hits.append((len(matched), tag, line, matched))
    hits.sort(key=lambda h: -h[0])
    return hits[:MAX_ENTRIES]


def selftest():
    try:
        module = intent_module()
        missing = [p for _, _, paths in module.ROUTES for p in paths
                   if not (module.ROOT / p).is_file()]
        if missing:
            print('✗ rutas por intención ausentes: ' + ', '.join(missing))
            return 1
    except Exception as exc:
        print('✗ orientación por intención no disponible: ' + type(exc).__name__)
        return 1
    entries = load_entries()
    if not entries:
        print('✓ recall listo: la memoria está vacía todavía (se llena conversando)')
        return 0
    fails = 0
    for tag, line, triggers in entries[:3] + entries[-3:]:
        probe = next((t for t in triggers if t), None)
        if not probe:
            continue
        got = match(f'oye levy, hablemos de {probe} por favor', entries)
        if not any(l == line for _, _, l, _ in got):
            print(f'✗ trigger "{probe}" no recupera su entrada: {line[:60]}')
            fails += 1
    if fails:
        return 1
    print(f'✓ recall vivo: {len(entries)} entradas indexadas')
    return 0


def main():
    # Windows: la consola puede ser cp1252: el prompt llega con acentos y el selftest imprime ✓/✗ (sin py.sh, UnicodeError).
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
    if '--selftest' in sys.argv:
        sys.exit(selftest())
    try:
        prompt = json.load(sys.stdin).get('prompt', '')
    except Exception:
        sys.exit(0)
    if not prompt.strip():
        sys.exit(0)
    hits = match(prompt, load_entries())
    lines = []
    for _, tag, line, matched in hits:
        suffix = ' _(rotada: vive en MEMORY-archivo.md)_' if tag == 'archivo' else ''
        lines.append(f'{line}{suffix}')
    ctx = ('🧠 recall — tu mensaje tocó estas entradas del índice de memoria. '
           'Protocolo: el índice apunta, el archivo manda — ABRIR el archivo antes de '
           'opinar o escribir en piedra sobre su tema:\n' + '\n'.join(lines))
    # Both runtimes already call this trusted shared hook every user turn.
    import importlib.util
    spec = importlib.util.spec_from_file_location('shared_agenda', Path(__file__).with_name('agenda-context.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    agenda = module.agenda_context()
    try:
        ritual = module.ritual_context()
    except Exception:
        ritual = ''
    try:
        orientation = intent_module().intent_context(prompt)
    except Exception:
        orientation = ('RUTAS POR INTENCIÓN NO DISPONIBLES: seguir '
                       '.claude/references/operacion-por-intencion.md. '
                       'La agenda y el recall se conservan.')
    ctx = '\n\n'.join(part for part in [orientation, ctx if hits else '', agenda, ritual] if part)
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'UserPromptSubmit',
                                             'additionalContext': ctx}}))
    sys.exit(0)


if __name__ == '__main__':
    main()
