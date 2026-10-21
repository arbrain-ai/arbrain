/**
 * Canvas v4 — traer lo del canvas anterior.
 *
 * Daniel pregunto si se podian pasar sus paginas viejas o si tocaba rehacer.
 * Se midio antes de contestar: **11 paginas con contenido, 2,326 elementos y
 * solo 14 tipos distintos**, todos con equivalente directo. Ni un mermaid, ni
 * una tabla, ni un comentario. La respuesta es que si, y sin drama.
 *
 * DOS REGLAS que gobiernan todo lo de aqui:
 *
 * 1. **NO SE DESTRUYE NADA.** La conversion es una LECTURA: produce elementos
 *    del v4 en memoria y no toca la fila. Solo un gesto explicito de Daniel la
 *    escribe. Reescribir 2,326 elementos suyos por el simple hecho de abrir una
 *    pagina seria imperdonable, y el autoguardado lo haria en 700ms.
 *
 * 2. **LO QUE NO SE PUEDE TRAER SE DECLARA.** Nada se descarta en silencio: el
 *    informe dice cuantos elementos entraron, cuantos no, y por que. Una
 *    migracion que dice "listo" habiendo perdido cosas es peor que una que
 *    falla.
 */

import type {
  CanvasElement, ShapeKind, Arrowhead, Routing, SectionTint, BoundText,
} from './element'
import type { FontFamily, TextStyle } from '../text/types'

/** Lo que devuelve una conversion: los elementos, y la verdad sobre ella. */
export interface InformeMigracion {
  entraron: number
  /** Por tipo del v3, cuantos se convirtieron. */
  porTipo: Record<string, number>
  /** Lo que NO se pudo traer, con el motivo. Uno por elemento. */
  perdidos: Array<{ tipo: string; id: string; motivo: string }>
  /** Aproximaciones que SI entraron pero no son identicas. */
  aproximados: string[]
}

interface ElementoV3 {
  id: string; type: string; x: number; y: number; width: number; height: number
  rotation?: number; opacity?: number; locked?: boolean; hidden?: boolean; zIndex?: number
  groupId?: string | null; childIds?: string[]
  [k: string]: unknown
}

/** v3 tenia 18 familias; el v4 tiene cuatro. Se agrupan por CARACTER. */
function familia(f: unknown): FontFamily {
  const n = String(f ?? '').toLowerCase()
  if (/caveat|hand|bangers|fredoka/.test(n)) return 'caveat'
  if (/mono|jetbrains|courier/.test(n)) return 'jetbrains-mono'
  if (/slab|serif|georgia|garamond|abril|gravitas|graduate/.test(n)) return 'roboto-slab'
  return 'montserrat'
}

const FIGURA: Record<string, ShapeKind> = {
  rectangle: 'rect', ellipse: 'ellipse', diamond: 'diamond', triangle: 'triangle',
  star: 'star', polygon: 'hexagon', chevron: 'arrow', sticky: 'rect',
}

const PUNTA: Record<string, Arrowhead> = {
  none: 'ninguna', arrow: 'flecha', triangle: 'triangulo',
  diamond: 'rombo', circle: 'circulo', bar: 'barra',
}

const RUTA: Record<string, Routing> = {
  straight: 'recta', orthogonal: 'ortogonal', curved: 'curva',
}

/** Los 10 colores de frame del v3 contra los 7 tintes del v4. */
const TINTE: Record<string, SectionTint> = {
  gray: 'neutro', slate: 'neutro', stone: 'neutro',
  purple: 'morado', violet: 'morado', indigo: 'azul', blue: 'azul',
  amber: 'ambar', yellow: 'ambar', orange: 'ambar',
  green: 'verde', emerald: 'verde', teal: 'verde',
  pink: 'rosa', rose: 'rosa', red: 'rojo',
}

/**
 * Aplana el `doc` de un texto del v3 a texto plano.
 *
 * Podia ser un string o un documento de TipTap con marcas por span. NO se
 * pierde nada al aplanarlo, y ese es un hecho medido del v3, no una excusa: su
 * propio renderer descartaba las marcas (`extractInlineText` solo leia `.text`)
 * y pintaba todo el bloque con el estilo del elemento. Lo que se ve en su
 * pantalla YA es texto plano.
 */
function aplanar(doc: unknown): string {
  if (typeof doc === 'string') return doc
  if (!doc || typeof doc !== 'object') return ''
  const n = doc as { type?: string; text?: string; content?: unknown[] }
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (n.type === 'hardBreak') return '\n'
  if (!Array.isArray(n.content)) return ''
  const partes = n.content.map(aplanar)
  // Los bloques se separan con salto; los inline se pegan.
  const bloque = n.type === 'doc' || n.type === 'bulletList' || n.type === 'orderedList'
              || n.type === 'taskList' || n.type === 'paragraph' || n.type === 'listItem'
  return partes.join(bloque && n.type !== 'paragraph' ? '\n' : '')
}

const base = (e: ElementoV3, ahora: number) => ({
  id: e.id,
  x: e.x ?? 0, y: e.y ?? 0,
  width: Math.max(1, e.width ?? 1), height: Math.max(1, e.height ?? 1),
  rotation: typeof e.rotation === 'number' ? e.rotation : 0,
  zIndex: typeof e.zIndex === 'number' ? e.zIndex : 0,
  opacity: typeof e.opacity === 'number' ? e.opacity : 1,
  locked: e.locked === true,
  ...(e.groupId ? { groupId: String(e.groupId) } : {}),
  version: 1, createdAt: ahora, updatedAt: ahora,
})

/**
 * Convierte un documento del v3 a elementos del v4.
 *
 * `elements` es el array crudo de `page_elements.elements`.
 */
export function migrarDesdeV3(
  elements: unknown[], ahora = Date.now(),
): { elements: CanvasElement[]; informe: InformeMigracion } {
  const v3 = (elements ?? []).filter(e => e && typeof e === 'object') as ElementoV3[]

  /**
   * A QUE SE RE-ENGANCHA un conector que apuntaba a un GRUPO.
   *
   * Medido en las paginas reales: 98 de 214 extremos apuntaban a un elemento
   * `group`, y el v4 no tiene grupos como elementos (la pertenencia vive en el
   * miembro). Si no se hace nada, esos 49 conectores se caen — y eran flechas
   * que Daniel dibujo a proposito.
   *
   * Se re-engancha al hijo MAS GRANDE del grupo: es el que el ojo lee como
   * "ese bloque", y una flecha que aterriza ahi dice lo mismo que decia antes.
   * Es una aproximacion y se declara como tal.
   */
  const representante = new Map<string, string>()
  {
    const grupos = v3.filter(e => e.type === 'group')
    for (const g of grupos) {
      let mejor: ElementoV3 | null = null
      for (const h of v3) {
        if (h.groupId !== g.id || h.type === 'group') continue
        const area = (h.width ?? 0) * (h.height ?? 0)
        if (!mejor || area > (mejor.width ?? 0) * (mejor.height ?? 0)) mejor = h
      }
      if (mejor) representante.set(g.id, mejor.id)
    }
  }

  const out: CanvasElement[] = []
  const informe: InformeMigracion = { entraron: 0, porTipo: {}, perdidos: [], aproximados: [] }
  const marca = (t: string) => { informe.porTipo[t] = (informe.porTipo[t] ?? 0) + 1; informe.entraron++ }
  const aprox = new Set<string>()

  // Los elementos GRUPO del v3 no viajan: su unica informacion util es la
  // pertenencia, y esa ya vive en el `groupId` de cada miembro. Traerlos como
  // elementos crearia cajas invisibles del tamaño del grupo.
  for (const e of v3) {
    if (e.hidden === true) { informe.perdidos.push({ tipo: e.type, id: e.id, motivo: 'estaba oculto' }); continue }

    switch (e.type) {
      case 'group': break   // su pertenencia ya viaja en los miembros

      case 'text': {
        const style: TextStyle = {
          family: familia(e.fontFamily),
          weight: typeof e.fontWeight === 'number' ? e.fontWeight : 400,
          size: typeof e.fontSize === 'number' ? e.fontSize : 18,
          lineHeight: typeof e.lineHeight === 'number' ? e.lineHeight : undefined,
          italic: e.fontStyle === 'italic' || undefined,
          underline: String(e.textDecoration ?? '').includes('underline') || undefined,
          strike: String(e.textDecoration ?? '').includes('line-through') || undefined,
        }
        const texto = aplanar(e.doc)
        out.push({
          ...base(e, ahora), type: 'text', text: texto,
          // Sin `lines`: el motor las corta con el ancho real. Traer las del v3
          // seria traer cortes calculados con OTRA medicion de texto.
          style,
          align: e.textAlign === 'center' ? 'center' : e.textAlign === 'right' ? 'right' : 'left',
          ...(typeof e.textColor === 'string' ? { color: { text: e.textColor, explicit: true as const } } : {}),
        })
        marca('text')
        break
      }

      case 'sticky':
      case 'rectangle': case 'ellipse': case 'diamond': case 'triangle':
      case 'star': case 'polygon': case 'chevron': {
        if (e.type === 'polygon' || e.type === 'chevron') aprox.add(
          e.type === 'polygon' ? 'los poligonos entraron como hexagonos' : 'los chevrones entraron como flechas')
        const color = (typeof e.fillColor === 'string' || typeof e.strokeColor === 'string')
          ? { fill: typeof e.fillColor === 'string' ? e.fillColor : undefined,
              stroke: typeof e.strokeColor === 'string' ? e.strokeColor : undefined,
              explicit: true as const }
          : undefined
        out.push({
          ...base(e, ahora), type: 'shape', shape: FIGURA[e.type] ?? 'rect',
          role: e.type === 'sticky' ? 'sticky' : 'card',
          ...(color ? { color } : {}),
          text: [] as BoundText[],
        })
        marca(e.type)
        break
      }

      case 'freedraw': case 'highlighter': {
        const pts = Array.isArray(e.points) ? e.points as Array<{ x: number; y: number; pressure?: number }> : []
        if (pts.length < 2) { informe.perdidos.push({ tipo: e.type, id: e.id, motivo: 'trazo sin puntos' }); break }
        out.push({
          ...base(e, ahora), type: 'ink',
          // El v3 guardaba puntos RELATIVOS al elemento, igual que el v4.
          points: pts.map(p => ({ x: p.x, y: p.y, pressure: typeof p.pressure === 'number' ? p.pressure : 0.5 })),
          ...(typeof e.strokeColor === 'string' ? { color: e.strokeColor } : {}),
          size: typeof e.strokeWidth === 'number' ? e.strokeWidth : 4,
          highlighter: e.type === 'highlighter',
        })
        marca(e.type)
        break
      }

      case 'line': case 'arrow': case 'connector': {
        const binding = (v: unknown): string =>
          v && typeof v === 'object' ? String((v as { elementId?: string }).elementId ?? '') : ''
        // Un extremo que apuntaba a un grupo se traslada a su representante.
        const resolver = (id: string) => representante.get(id) ?? id
        const d0 = binding(e.startBinding), h0 = binding(e.endBinding)
        const desde = d0 ? resolver(d0) : '', hasta = h0 ? resolver(h0) : ''
        if ((d0 && desde !== d0) || (h0 && hasta !== h0)) {
          aprox.add('algunas flechas apuntaban a un GRUPO y se reengancharon a su pieza mas grande')
        }
        const pts = Array.isArray(e.points) ? e.points as Array<{ x: number; y: number }> : []
        // Un conector ENLAZADO viaja como relacion y el router lo recalcula.
        // Uno suelto (line/arrow dibujada a mano) viaja por sus PUNTOS, que se
        // pasan a mundo: en el v3 eran relativos al elemento.
        out.push({
          ...base(e, ahora), type: 'connector',
          fromId: desde, toId: hasta,
          points: desde && hasta ? [] : pts.map(p => ({ x: (e.x ?? 0) + p.x, y: (e.y ?? 0) + p.y })),
          arrowEnd: String(e.endArrowhead ?? 'arrow') !== 'none',
          headEnd: PUNTA[String(e.endArrowhead ?? 'arrow')] ?? 'flecha',
          headStart: PUNTA[String(e.startArrowhead ?? 'none')] ?? 'ninguna',
          routing: RUTA[String(e.routing ?? 'orthogonal')] ?? 'ortogonal',
          ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
        })
        marca(e.type)
        break
      }

      case 'image': {
        const src = typeof e.url === 'string' ? e.url : ''
        if (!src) { informe.perdidos.push({ tipo: 'image', id: e.id, motivo: 'sin url' }); break }
        out.push({
          ...base(e, ahora), type: 'image', src,
          naturalWidth: typeof e.naturalWidth === 'number' ? e.naturalWidth : (e.width ?? 1),
          naturalHeight: typeof e.naturalHeight === 'number' ? e.naturalHeight : (e.height ?? 1),
          ...(typeof e.alt === 'string' ? { alt: e.alt } : {}),
        })
        marca('image')
        break
      }

      case 'frame': {
        out.push({
          ...base(e, ahora), type: 'frame', role: 'tray',
          title: typeof e.title === 'string' ? e.title : 'Sección',
          tint: TINTE[String(e.color ?? '')] ?? 'neutro',
          clip: e.clipChildren === true,
          // Al fondo: en el v4 una seccion es territorio, y el v3 las guardaba
          // con el zIndex de creacion, que las dejaba encima del contenido.
          zIndex: -100,
        })
        marca('frame')
        break
      }

      case 'embed': {
        const url = typeof e.url === 'string' ? e.url : ''
        if (!url) { informe.perdidos.push({ tipo: 'embed', id: e.id, motivo: 'sin url' }); break }
        out.push({ ...base(e, ahora), type: 'embed', url, interactive: false })
        marca('embed')
        break
      }

      case 'code': {
        out.push({
          ...base(e, ahora), type: 'code',
          code: typeof e.code === 'string' ? e.code : '',
          language: typeof e.language === 'string' ? e.language : 'ts',
          style: { family: 'jetbrains-mono', weight: 400, size: 14 },
        })
        marca('code')
        break
      }

      case 'table': {
        const cells = Array.isArray(e.cells) ? e.cells as string[][] : []
        if (cells.length === 0) { informe.perdidos.push({ tipo: 'table', id: e.id, motivo: 'sin celdas' }); break }
        const cols = Math.max(...cells.map(f => f.length))
        out.push({
          ...base(e, ahora), type: 'table', cells,
          headerRow: e.headerRow === true,
          colWidths: Array.from({ length: cols }, () => (e.width ?? 400) / cols),
          rowHeight: (e.height ?? 200) / Math.max(1, cells.length),
          style: { family: 'montserrat', weight: 400, size: 14 },
        })
        marca('table')
        break
      }

      default:
        // mermaid y comment no tienen equivalente y NO se inventan. Se declara
        // uno por uno para que nadie descubra el hueco por su cuenta.
        informe.perdidos.push({ tipo: e.type, id: e.id, motivo: 'el v4 no tiene este tipo' })
    }
  }

  // Un conector cuyos extremos no sobrevivieron no representa nada.
  const ids = new Set(out.map(e => e.id))
  const limpio = out.filter(e => {
    if (e.type !== 'connector' || (!e.fromId && !e.toId)) return true
    const ok = ids.has(e.fromId) && ids.has(e.toId)
    if (!ok) informe.perdidos.push({ tipo: 'connector', id: e.id, motivo: 'sus extremos no sobrevivieron' })
    return ok
  })
  informe.entraron = limpio.length
  informe.aproximados = [...aprox]
  return { elements: limpio, informe }
}
