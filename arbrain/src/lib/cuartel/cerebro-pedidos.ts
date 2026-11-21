/**
 * Cuartel de YouTube · CEREBRO: lo que la pantalla puede pedirle al algoritmo, validado antes de tocar el proceso.
 * Puro (sin Next ni disco) para poder probarlo. Contrato: docs/builds/contenido-cuartel/CEREBRO.md §3.
 */

export const VOTOS = ['sirvio', 'no_sirvio', 'saltado'] as const
export const DESDE = ['dosis', 'biblioteca', 'radar', 'inicio'] as const  // inicio: el feed «Lo nuevo de tu universo» (PULSO)
export const ESTADOS_IDEA = ['nueva', 'guardada', 'a_guion', 'aplicada', 'descartada'] as const

export type Pedido = { args: string[]; ms: number } | { error: string }

const ID_VIDEO = /^[A-Za-z0-9_-]{6,20}$/
const ID_IDEA = /^idea-[A-Za-z0-9_-]{3,80}$/
const texto = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
// Cada valor viaja pegado a su bandera (`--video=<id>`): un id de YouTube puede empezar con guion y no debe leerse como opción.

export const idVideo = (x: unknown): x is string => typeof x === 'string' && ID_VIDEO.test(x)

/** «Me sirvió / no me sirvió / saltar». Solo viajan el video, el voto, la nota y desde dónde votó: nunca tiempo visto. */
export function pedidoVoto(cuerpo: unknown): Pedido {
  const b = (cuerpo ?? {}) as Record<string, unknown>
  if (!idVideo(b.video_id)) return { error: 'Video inválido.' }
  if (!VOTOS.includes(b.voto as (typeof VOTOS)[number])) return { error: 'El voto es «sirvio», «no_sirvio» o «saltado».' }
  const desde = DESDE.includes(b.desde as (typeof DESDE)[number]) ? (b.desde as string) : 'dosis'
  const nota = texto(b.nota).slice(0, 500)
  return { args: ['voto', `--video=${b.video_id}`, `--voto=${b.voto as string}`, `--desde=${desde}`, ...(nota ? [`--nota=${nota}`] : [])], ms: 30_000 }
}

/** «Pregúntale al video»: la pregunta y, como mucho, los últimos cuatro turnos de esa conversación. */
export function pedidoPreguntar(cuerpo: unknown): Pedido {
  const b = (cuerpo ?? {}) as Record<string, unknown>
  if (!idVideo(b.video_id)) return { error: 'Video inválido.' }
  const pregunta = texto(b.pregunta).slice(0, 1500)
  if (!pregunta) return { error: 'Falta la pregunta.' }
  const historial = (Array.isArray(b.historial) ? b.historial : [])
    .filter((h): h is { pregunta: string; respuesta: string } => !!h && typeof h.pregunta === 'string' && typeof h.respuesta === 'string')
    .slice(-4)
    .map(h => ({ pregunta: h.pregunta.slice(0, 1500), respuesta: h.respuesta.slice(0, 3000) }))
  return { args: ['preguntar', `--video=${b.video_id}`, `--pregunta=${pregunta}`, ...(historial.length ? [`--historial=${JSON.stringify(historial)}`] : [])], ms: 150_000 }
}

/** Banco de ideas: generar una desde un video, o moverla de estado («aplicada» es la que suma al marcador). */
export function pedidoIdeas(cuerpo: unknown): Pedido {
  const b = (cuerpo ?? {}) as Record<string, unknown>
  if (b.accion === 'generar') {
    if (!idVideo(b.video_id)) return { error: 'Video inválido.' }
    return { args: ['ideas', `--video=${b.video_id}`], ms: 240_000 }
  }
  if (b.accion === 'estado') {
    if (typeof b.id !== 'string' || !ID_IDEA.test(b.id)) return { error: 'Idea inválida.' }
    if (!ESTADOS_IDEA.includes(b.estado as (typeof ESTADOS_IDEA)[number])) return { error: `El estado es uno de: ${ESTADOS_IDEA.join(', ')}.` }
    return { args: ['ideas', '--estado', b.id, b.estado as string], ms: 30_000 }
  }
  return { error: 'La acción es «generar» o «estado».' }
}

/** El comando imprime su JSON al final de stdout (antes puede haber renglones de avance). */
export function jsonDeSalida(salida: string): unknown {
  const s = salida.trim()
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    if (i > 0 && s[i - 1] !== '\n') continue
    try { return JSON.parse(s.slice(i)) } catch { /* no empezaba ahí */ }
  }
  throw new Error('El cerebro del cuartel no devolvió una respuesta legible.')
}
