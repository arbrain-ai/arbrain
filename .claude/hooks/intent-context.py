#!/usr/bin/env python3
"""Small shared intent router. Pointers only; no network, writes or model calls.

The existing UserPromptSubmit hook uses this module. Rules are navigation hints,
never user authorization. Canonical files and skills retain their own contents.
CLI: phrase -> hints; --find phrase -> bounded catalog search; --check -> pointers.
"""
import argparse
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAX_ROUTES = 2
MAX_CHARS = 1600


def norm(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower())
                   if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


# Exact canonical entrances, not copies of their instructions or inventories.
# Earlier rules win ties; phrase matches beat generic single words.
ROUTES = [
    ('Actualizar Arbrain', ['jala los ultimos cambios', 'jala los cambios', 'actualiza arbrain', 'actualizar arbrain', 'version nueva de arbrain', 'nueva version de arbrain'],
     ['.claude/skills/actualizar-arbrain/SKILL.md']),
    ('Edición por voz', ['edita el video', 'editar video', 'edicion de video', 'exportar video', 'editar la grabacion'],
     ['.claude/skills/edicion-por-voz/SKILL.md']),
    ('Diario', ['diario', 'ultima nota', 'nuevo cuaderno'],
     ['.claude/skills/habit-system/SKILL.md', '.claude/skills/habit-system/references/diario.md']),
    ('Bajar a tierra (mes, semana, día)', ['buenos dias', 'bajame a tierra', 'baja mi meta a tierra', 'bajar a tierra', 'llena mi plan', 'planeemos el mes', 'planea mi mes', 'planea mi semana', 'planea mi dia'],
     ['.claude/skills/bajar-a-tierra/SKILL.md']),
    ('Mi camino en el programa', ['que sigo', 'en que voy', 'que me falta', 'mi camino', 'mi siguiente paso', 'mis casillas', 'que casilla'],
     ['.claude/skills/bajar-a-tierra/references/mi-camino.md']),
    ('Agenda / tareas / objetivos', ['agenda', 'calendario', 'mis tareas', 'que tengo hoy', 'mis objetivos', 'siguiente movimiento', 'pendientes de hoy', 'habitos'],
     ['.claude/skills/habit-system/SKILL.md']),
    ('Decisiones / memoria', ['que decidimos', 'recuerdame', 'ponme en contexto', 'guarda esto', 'recuerda esto', 'que sabes de mi'],
     ['.claude/skills/memory-manager/SKILL.md']),
    ('Búsqueda histórica', ['conversacion pasada', 'que hablamos', 'busca en el cerebro', 'historial de conversaciones'],
     ['.claude/skills/knowledge-search/SKILL.md']),
    ('Diagramas y lienzo', ['diagrama', 'dibuja', 'haz un mapa', 'en el lienzo', 'en el canvas', 'blueprint'],
     ['.claude/skills/canvas/SKILL.md']),
    ('Imágenes', ['genera una imagen', 'hazme una imagen', 'ilustracion', 'miniatura'],
     ['.claude/skills/image-generation/SKILL.md']),
    ('Presentaciones', ['presentacion', 'un deck', 'diapositivas', 'slides', 'mi pitch', 'laminas para mi clase'],
     ['.claude/skills/presentaciones/SKILL.md']),
    ('Leer un libro o curso', ['lee este libro', 'lee este pdf', 'internaliza', 'este curso'],
     ['.claude/skills/libro-os/SKILL.md']),
    ('Meta ambiciosa a plan', ['compila esta meta', 'goal', 'spec verificable', 'convierte esto en un plan'],
     ['.claude/skills/goal-compiler/SKILL.md']),
    ('Crear una skill', ['crea una skill', 'hazme una skill', 'nueva skill', 'convierte esto en una skill', 'documenta este proceso', 'guarda como lo hicimos', 'ya lo hicimos dos veces', 'mi proceso mas odiado', 'skill creator'],
     ['.claude/skills/skill-creator/SKILL.md']),
    ('Mejorar una skill', ['mejora el skill', 'mejora la skill', 'autoresearch', 'corre evals'],
     ['.claude/skills/autoresearch/SKILL.md']),
    ('Sistema viable', ['sistema viable', 'stafford beer', 'vsm', 'mi negocio como sistema'],
     ['.claude/skills/sistema-viable/SKILL.md']),
    ('Operación del sistema', ['arbrain', 'artificial brain', 'cerebro artificial', 'como funciona mi sistema', 'no responde levy', 'mis llaves', 'progressive disclosure', 'arbol de archivos'],
     ['.claude/skills/artificial-brain/SKILL.md', '.claude/references/operacion-por-intencion.md']),
    ('Auditoría', ['audita el sistema', 'os audit', 'punteros rotos', 'limpia el sistema'],
     ['.claude/skills/os-audit/SKILL.md']),
]


def resolve(prompt, root=ROOT):
    prompt = ' ' + norm(prompt) + ' '
    hits = []
    for order, (name, phrases, paths) in enumerate(ROUTES):
        matched = [p for p in phrases if ' ' + norm(p) + ' ' in prompt]
        if matched:
            score = max(len(norm(p).split()) for p in matched)
            hits.append((-score, order, name, paths))
    hits.sort()
    return [{'name': name, 'paths': paths,
             'missing': [p for p in paths if not (root / p).is_file()]}
            for _, _, name, paths in hits[:MAX_ROUTES]]


def intent_context(prompt, root=ROOT):
    hits = resolve(prompt, root)
    if not hits:
        return ''
    lines = ['RUTAS POR INTENCIÓN (orientación, no autorización ni decisión): '
             'abrir la entrada vigente y luego solo sus referencias pertinentes. '
             'Las correcciones actuales del dueño prevalecen.']
    for hit in hits:
        lines.append('- ' + hit['name'] + ': ' + ' → '.join(hit['paths']))
        if hit['missing']:
            lines.append('  RUTA AUSENTE: ' + ', '.join(hit['missing']) +
                         '. Buscar el canónico; no asumir contenido ni pedir al dueño que navegue.')
    text = '\n'.join(lines)
    if len(text) > MAX_CHARS:
        return ('RUTAS POR INTENCIÓN: salida excedida; consultar '
                '.claude/references/operacion-por-intencion.md y buscar con --find.')
    return text


def find(query, root=ROOT):
    """Fallback searches actual skill headers/index lines, not a second registry."""
    tokens = {t for t in norm(query).split() if len(t) > 2}
    found = []
    # Known direct entrances take precedence over incidental mentions in memories.
    for hit in resolve(query, root):
        found.extend((100, path) for path in hit['paths'])
    for p in (root / '.claude/skills').glob('*/SKILL.md'):
        try:
            header = p.read_text(encoding='utf-8').split('---', 2)[1]
        except (OSError, IndexError, UnicodeError):
            continue
        score = len(tokens & set(norm(p.parent.name + ' ' + header).split()))
        if score:
            found.append((score, p.relative_to(root).as_posix()))  # Windows: rutas con «/» como en el resto
    for filename in ['MEMORY.md', 'MEMORY-indice.md', 'MEMORY-archivo.md']:
        p = root / '.claude/memory' / filename
        try:
            lines = p.read_text(encoding='utf-8').splitlines()
        except (OSError, UnicodeError):
            continue
        for line in lines:
            path = re.search(r'^- `((?:user|project|feedback|reference)/[^`]+\.md)`', line)
            if not path:
                continue
            score = len(tokens & set(norm(line).split()))
            if score:
                found.append((score, '.claude/memory/' + path.group(1)))
    unique = {}
    for score, path in found:
        unique[path] = max(score, unique.get(path, 0))
    return [p for p, _ in sorted(unique.items(), key=lambda x: (-x[1], x[0]))[:6]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--find', dest='search')
    parser.add_argument('prompt', nargs='*')
    args = parser.parse_args()
    if args.check:
        missing = sorted({p for _, _, paths in ROUTES for p in paths if not (ROOT / p).is_file()})
        print('\n'.join('FALTA: ' + p for p in missing) if missing else 'Rutas canónicas verificadas.')
        return bool(missing)
    if args.search:
        paths = find(args.search)
        print('\n'.join(paths) if paths else 'Sin coincidencia: buscar con rg en skills y memoria; no equivale a inexistencia.')
    else:
        print(intent_context(' '.join(args.prompt)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
