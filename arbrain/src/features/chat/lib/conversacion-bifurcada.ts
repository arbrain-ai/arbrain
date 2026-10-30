/**
 * Piezas puras de «Bifurcar» (1 oct 2026): título de la copia y metadata de los mensajes copiados.
 * Viven aparte de la ruta para probarlas sin base de datos (tests/chat/bifurcar.test.ts).
 */

const ETIQUETA = 'bifurcada'
/** «Título (bifurcada)» o «Título (bifurcada 3)» al final: lo que hay que quitar para hallar el título de origen. */
const SUFIJO = /\s*\(bifurcada(?:\s+(\d+))?\)\s*$/i
/** Un título de copia no crece sin límite aunque se bifurque una bifurcación de una bifurcación. */
const BASE_MAX = 80

/** Título sin el sufijo de bifurcación, para que bifurcar una copia no apile «(bifurcada) (bifurcada)». */
export function tituloBase(titulo: string): string {
  const limpio = titulo.replace(/\s+/g, ' ').trim() || 'Conversación'
  return limpio.replace(SUFIJO, '').trim() || limpio
}

/**
 * «<título> (bifurcada)»; si ya existe una con ese título, «(bifurcada 2)», «(bifurcada 3)»…
 * `existentes` son los títulos que ya tiene el dueño (la ruta pasa solo los que empiezan igual).
 */
export function tituloBifurcada(titulo: string, existentes: readonly string[]): string {
  const base = tituloBase(titulo).slice(0, BASE_MAX).trim()
  const usados = new Set(existentes.map((t) => t.trim().toLowerCase()))
  const primero = `${base} (${ETIQUETA})`
  if (!usados.has(primero.toLowerCase())) return primero
  for (let n = 2; n < 1000; n += 1) {
    const candidato = `${base} (${ETIQUETA} ${n})`
    if (!usados.has(candidato.toLowerCase())) return candidato
  }
  return `${base} (${ETIQUETA} ${Date.now()})`
}

/** Patrón LIKE para traer los títulos que pueden chocar con el de la copia. Escapa % y _ del título. */
export function patronTitulosParecidos(titulo: string): string {
  const base = tituloBase(titulo).slice(0, BASE_MAX).trim().replace(/[\\%_]/g, (c) => `\\${c}`)
  return `${base} (${ETIQUETA}%`
}

/**
 * Metadata de un mensaje copiado a la bifurcación: igual que la original menos `turnId`. Ese id identifica
 * UN turno de UNA conversación (índice único con el rol): repetirlo en la copia chocaría con la original y,
 * peor, haría que el recobro de turnos confundiera una conversación con la otra.
 */
export function metadataParaCopia(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const { turnId: _turnId, ...resto } = metadata as Record<string, unknown>
  void _turnId
  return Object.keys(resto).length > 0 ? resto : null
}

export interface MensajeOrigen {
  role: 'user' | 'assistant'
  content: string
  created_at: string
  audio_url?: string | null
  image_url?: string | null
  metadata?: unknown
}

/** Fila lista para insertar en la copia (sin id: la base asigna uno nuevo). */
export function mensajeParaCopia(m: MensajeOrigen, sessionId: string) {
  return {
    session_id: sessionId,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    audio_url: m.audio_url ?? null,
    image_url: m.image_url ?? null,
    metadata: metadataParaCopia(m.metadata),
  }
}

/** Trozos de `n` elementos (PostgREST tiene tope de cuerpo y de filas por pedido). */
export function trozos<T>(lista: readonly T[], n: number): T[][] {
  const salida: T[][] = []
  for (let i = 0; i < lista.length; i += n) salida.push(lista.slice(i, i + n))
  return salida
}
