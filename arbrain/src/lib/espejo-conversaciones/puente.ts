/**
 * El puente (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05/DISENO.md §5): seguir en esta máquina una
 * conversación que avanzó en la otra.
 *
 * El motor de cada máquina recuerda su propia sesión del modelo; lo que pasó en la otra no lo vio. Antes de mandar un
 * mensaje, si después de la última respuesta que dio ESTA máquina hubo mensajes que llegaron de la otra, se le pasan
 * a Levy como contexto. Sin respuestas de esta máquina (la conversación nació allá), todo lo que llegó. Recortado a lo
 * más reciente. No se mueve la sesión nativa del modelo entre máquinas: su transcript trae salidas de herramientas y
 * podría traer llaves (GitHub nunca las ve).
 */
import type { Fila } from './diario'

export const PUENTE_MAX_CARACTERES = 16_000
const POR_MENSAJE = 4_000

export interface MensajeChat { id: string; role: string; content: string; created_at?: string | null }

/** Los mensajes de la conversación en orden, y de qué host vino cada uno que llegó de otra máquina. */
export function armarPuente(mensajes: MensajeChat[], ajenos: Record<string, string>): string | null {
  let ultimaPropia = -1
  mensajes.forEach((m, i) => { if (m.role === 'assistant' && !ajenos[m.id]) ultimaPropia = i })
  const llegaron = mensajes.slice(ultimaPropia + 1).filter((m) => ajenos[m.id] && (m.role === 'user' || m.role === 'assistant') && m.content.trim())
  if (!llegaron.length) return null
  const hosts = [...new Set(llegaron.map((m) => ajenos[m.id]))]
  const partes: string[] = []
  let total = 0
  for (let i = llegaron.length - 1; i >= 0; i--) {
    const m = llegaron[i]
    const texto = m.content.length > POR_MENSAJE ? `${m.content.slice(0, POR_MENSAJE)}…` : m.content
    const parte = `${m.role === 'user' ? 'Persona' : 'Levy'}: ${texto}`
    if (total + parte.length > PUENTE_MAX_CARACTERES && partes.length) break
    partes.unshift(parte)
    total += parte.length
  }
  const recortado = partes.length < llegaron.length ? ` (las ${partes.length} más recientes de ${llegaron.length})` : ''
  return [
    `Esta conversación siguió en tu otra máquina (${hosts.join(', ')})${ultimaPropia >= 0 ? ' después de tu última respuesta aquí' : ''}. Es la misma persona y la misma conversación.`,
    `Lo que se dijo allá, en orden${recortado}:`,
    '',
    partes.join('\n\n'),
    '',
    'Responde con continuidad, como si lo hubieras visto. No lo repitas ni lo menciones salvo que te lo pidan.',
  ].join('\n')
}

export function comoMensajes(filas: Fila[]): MensajeChat[] {
  return filas
    .filter((f) => typeof f.id === 'string')
    .map((f) => ({ id: f.id as string, role: String(f.role ?? ''), content: typeof f.content === 'string' ? f.content : '', created_at: typeof f.created_at === 'string' ? f.created_at : null }))
}
