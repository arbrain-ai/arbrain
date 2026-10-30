/**
 * En la versión del alumno la campana no tiene decisiones de /decidir en arbrain.ai: esas salen del pipeline del autor
 * (su libro de tokens y su llave de la agenda). Mismas firmas que el original para que la campana compile; ninguna
 * función sale de su computadora: sin decisiones, sin toque y sin recaps que publicar.
 */
import 'server-only'
import type { EstadoDecision } from './bandeja'

export async function estadosDecisiones(_urls: (string | null)[], _forzar = false): Promise<Map<string, EstadoDecision>> {
  return new Map()
}

export type ResultadoToque = { ok: true } | { ok: false; motivo: 'sin-enlace' | 'ya-respondida' | 'sin-respuesta' | 'no-confirmada' }

export async function responderDesdeCampana(_url: string, _r: 'si' | 'no' | 'duda'): Promise<ResultadoToque> {
  return { ok: false, motivo: 'sin-enlace' }
}

export async function recapsPublicados(_postIds: string[]): Promise<Set<string>> {
  return new Set()
}

export async function publicarRecapDesdeCampana(_postId: string): Promise<{ ok: true; ya: boolean } | { ok: false; motivo: 'sin-respuesta' | 'no-confirmada' }> {
  return { ok: false, motivo: 'sin-respuesta' }
}
