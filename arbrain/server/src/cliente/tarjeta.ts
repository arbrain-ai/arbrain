/**
 * Lo que hace el daemon con el clic de la tarjeta del hilo (botón Play, 27 oct 2026). Quien llama ya verificó el
 * secreto de la app: un agente nunca llega aquí (ni con el pase).
 *
 *   permitir + alcance «una»      la acción corre una vez (como siempre).
 *   permitir + alcance «siempre»  además guarda «Siempre este patrón» con el patrón que calculó el daemon (nunca uno que
 *                                 mande el navegador) en la política del alumno (`reglas-siempre.ts`).
 *   rechazar                      no corre; el comentario viaja al agente.
 *   correr                        «Córrelo tú»: abre la terminal visible y corre el literal (`correlo.ts`).
 */
import type { Confirmacion, Confirmaciones } from './confirmaciones.js'
import { agregarRegla, quitarRegla, reglasSiempre, type ReglaSiempre } from './reglas-siempre.js'
import { empezarCorrelo, type OpcionesCorrelo } from './correlo.js'

type Respuesta = { ok: true; confirmacion: Confirmacion; regla?: ReglaSiempre } | { ok: false; status: number; error: string }

export async function resolverTarjeta(store: Confirmaciones, cuerpo: Record<string, unknown>, correlo: () => OpcionesCorrelo): Promise<Respuesta> {
  const id = String(cuerpo.id ?? '')
  const extras = { comentario: cuerpo.comentario, alcance: cuerpo.alcance }
  if (cuerpo.decision === 'correr') return empezarCorrelo(store, id, extras, correlo())
  const r = store.resolver(id, cuerpo.decision, extras)
  if (!r.ok) return r
  const c = r.confirmacion
  if (c.estado === 'permitida' && c.alcance === 'siempre' && c.patron && c.herramienta === 'Bash' && c.categoria === 'otra' && c.tipo === 'permiso') {
    try { return { ok: true, confirmacion: c, regla: agregarRegla(c.patron, c.literal ?? '') } }
    catch { /* la acción ya quedó aprobada una vez; la regla no se pudo guardar (lleno o inválido) */ }
  }
  return r
}

export const listarReglas = () => ({ reglas: reglasSiempre() })

export function revocarRegla(id: unknown): { ok: boolean; status: number; error?: string } {
  if (typeof id !== 'string' || !/^rg_[0-9a-f]{6,20}$/.test(id)) return { ok: false, status: 400, error: 'Regla inválida.' }
  return quitarRegla(id) ? { ok: true, status: 200 } : { ok: false, status: 404, error: 'Esa regla ya no existe.' }
}
