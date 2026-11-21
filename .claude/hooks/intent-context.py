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
    ('Diario', ['diario', 'ultima nota', 'nuevo cuaderno'],
     ['.claude/skills/habit-system/SKILL.md', '.claude/skills/habit-system/references/diario.md']),
    ('Bajar a tierra (mes, semana, día)', ['buenos dias', 'bajame a tierra', 'baja mi meta a tierra', 'bajar a tierra', 'llena mi plan', 'planeemos el mes', 'planea mi mes', 'planea mi semana', 'planea mi dia'],
     ['.claude/skills/bajar-a-tierra/SKILL.md']),
    ('Mi camino en el programa', ['que sigo', 'en que voy', 'que me falta', 'mi camino', 'mi siguiente paso', 'mis casillas', 'que casilla'],
     ['.claude/skills/bajar-a-tierra/references/mi-camino.md']),
    ('Mi oferta (las 11 piezas)', ['mi oferta', 'arma mi oferta', 'plantilla de oferta', 'plantilla oferta', 'one sheeter', 'onesheeter', 'las 11 piezas', 'las once piezas', 'gran domino', 'nueva oportunidad', 'mi promesa', 'puente de epifania', 'mis bonos', 'mi garantia', 'cuanto cobro', 'califica mi oferta'],
     ['.claude/skills/oferta/SKILL.md']),
    ('Marketing: avatar, mensaje y voz', ['mi avatar', 'cliente ideal', 'mi cliente ideal', 'a quien le hablo', 'como me diferencio', 'mi competencia', 'mi posicionamiento', 'mi mensaje', 'enemigo comun', 'hazme ganchos', 'un hook', 'mis hooks', 'escribelo como yo', 'escribe como yo', 'mi voz', 'pagina de ventas', 'video de ventas', 'vsl', 'escalera de valor', 'contenido para vender', 'que contenido hago', 'vender sin lanzamientos', 'referidos', 'mis objeciones', 'revisa este copy', 'mi copy'],
     ['.claude/skills/arquitectura-marketing/SKILL.md']),
    ('Mi marca (colores, logo, estilo)', ['mi marca', 'mis colores', 'pon mis colores', 'mi paleta', 'mi logo', 'guia de marca', 'mi guia de marca', 'identidad visual', 'que tipografia', 'mi tipografia', 'estilo de mis imagenes', 'paquete visual', 'como se ve mi marca', 'imagenes de mi clase', 'una lamina que explique'],
     ['.claude/skills/diseno-de-marca/SKILL.md']),
    ('Números del negocio', ['mis numeros', 'cuanto vendi', 'cuanto he vendido', 'como van mis ventas', 'como van las ventas', 'mis ventas', 'mi mrr', 'cual es mi mrr', 'cuantos cancelaron', 'mi churn', 'tasa de conversion', 'mi conversion', 'donde se me cae el embudo', 'de donde vienen mis ventas', 'compara con el mes pasado', 'contra la semana pasada', 'conecta stripe', 'conecta polar', 'conecta hotmart', 'mi hoja de ventas', 'reporte de la semana', 'reporte del mes', 'mis metricas'],
     ['.claude/skills/business-intelligence/SKILL.md', '.claude/skills/business-intelligence/references/precision.md']),
    ('Finanzas', ['mis finanzas', 'cuanto tengo', 'registra un gasto', 'registra un ingreso', 'estos son mis saldos', 'mis saldos', 'cierre del mes', 'hagamos el cierre', 'en que se me va', 'cuantos meses aguanto', 'mi runway', 'mi patrimonio', 'estado de cuenta', 'mis cobros fijos', 'flujo de caja', 'le preste a'],
     ['.claude/skills/finance-os/SKILL.md']),
    ('Mapa vivo de un negocio', ['mapa vivo', 'el mapa vivo', 'mapa de su negocio', 'mapa de mi negocio', 'mi mapa', 'muestrale su negocio', 'ahora muestraselo', 'anima el mapa', 'anima el lienzo', 'animar el lienzo', 'recorrido del mapa', 'capitulos del lienzo', 'pieza viva', 'piezas vivas'],
     ['.claude/skills/mapa-vivo/SKILL.md']),
    ('Radiografía de un negocio', ['radiografia', 'la radiografia', 'diagnostico de su negocio', 'diagnostico de mi cliente', 'diagnostico race', 'prepara el diagnostico', 'preparame el diagnostico', 'notas del diagnostico', 'mapa del sistema', 'cuello de botella', 'que le arreglo primero', 'cuanto le cuesta no arreglarlo'],
     ['.claude/skills/radiografia/SKILL.md']),
    ('Contacto en frío', ['contacto en frio', 'correo en frio', 'correos en frio', 'cold email', 'prospectar', 'prospeccion', 'lista de prospectos', 'mis prospectos', 'conseguir clientes', 'conseguir mas clientes', 'lead magnet inverso', 'reverse lead magnet', 'caen en spam', 'calentar mi dominio', 'calentar el dominio', 'secuencia de correos', 'nadie me contesta', 'escribirle a negocios', 'escribeles a negocios'],
     ['.claude/skills/contacto-en-frio/SKILL.md']),
    ('Embudos de referentes y el mío', ['embudo de', 'estudia el embudo', 'como vende', 'que regala', 'a donde manda', 'compara mi embudo', 'mi embudo ideal', 'que mejoro de mi embudo', 'que le copio a', 'en mi panel de estrategia'],
     ['.claude/skills/ideal-funnels/SKILL.md']),
    ('Inteligencia externa (referentes, mentores, citas)', ['que dice', 'que dijo', 'compara lo que dicen', 'pasame la cita', 'en que minuto', 'baja los videos', 'mi competencia', 'mis competidores', 'que le funciona a', 'benchmark', 'mis mentores', 'transcribe este video', 'traduce este video', 'bilibili', 'en china'],
     ['.claude/skills/intel/SKILL.md']),
    ('Correo y agenda de Google', ['mi correo', 'revisa mi correo', 'mi bandeja', 'bandeja de entrada', 'gmail', 'mis correos', 'un borrador', 'quien espera respuesta', 'buscame un hueco', 'busca un hueco', 'ordena mi correo', 'limpia mi bandeja', 'resumen de la manana'],
     ['.claude/skills/google-workspace/SKILL.md']),
    ('Recorrido de la app', ['el tour', 'el recorrido', 'retoma el recorrido', 'retoma el tour', 'que hay de nuevo', 'explicame la app', 'que es cada cosa'],
     ['.claude/skills/tour-bienvenida/SKILL.md']),
    ('Agenda / tareas / objetivos', ['agenda', 'calendario', 'mis tareas', 'que tengo hoy', 'mis objetivos', 'siguiente movimiento', 'pendientes de hoy', 'habitos'],
     ['.claude/skills/habit-system/SKILL.md']),
    ('Decisiones / memoria', ['que decidimos', 'recuerdame', 'ponme en contexto', 'guarda esto', 'recuerda esto', 'que sabes de mi'],
     ['.claude/skills/memory-manager/SKILL.md']),
    ('Búsqueda histórica', ['conversacion pasada', 'que hablamos', 'busca en el cerebro', 'historial de conversaciones'],
     ['.claude/skills/knowledge-search/SKILL.md']),
    ('Diagramas y lienzo', ['diagrama', 'dibuja', 'haz un mapa', 'en el lienzo', 'en el canvas', 'blueprint'],
     ['.claude/skills/canvas/SKILL.md']),
    ('Mi canal de YouTube', ['youtube', 'mi canal', 'ideas de video', 'idea de video', 'que video hago', 'mi proximo video', 'guarda esta idea', 'escribeme el guion', 'el guion de mi video', 'guion del video', 'que titulo le pongo', 'titulo del video', 'miniatura de mi video', 'miniatura del video', 'descripcion del video', 'los capitulos', 'preparame para grabar', 'como le fue a mi video'],
     ['.claude/skills/youtube-os/SKILL.md']),
    ('Imágenes', ['genera una imagen', 'hazme una imagen', 'ilustracion', 'miniatura'],
     ['.claude/skills/image-generation/SKILL.md']),
    ('Presentaciones', ['presentacion', 'un deck', 'diapositivas', 'slides', 'mi pitch', 'laminas para mi clase', 'la lamina', 'las laminas'],
     ['.claude/skills/presentaciones/SKILL.md']),
    ('Modelo sin filtro', ['sin filtro', 'abliterated', 'abliteration', 'deepseek sin censura', 'modelo sin censura'],
     ['arbrain/cerebro/manuales/sin-filtro.md']),
    ('Animación y video por código', ['animacion', 'haz una animacion', 'animame', 'hazme un video de', 'video explicativo', 'un intro', 'un comercial', 'reels', 'shorts', 'html vivo', 'que se pueda tocar', 'que se explique solo', 'pergamino', 'interfaz hermosa', 'sorprendeme', 'code animation', 'god animation'],
     ['.claude/skills/god-animation/SKILL.md']),
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
