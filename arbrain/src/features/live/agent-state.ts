// Agente activo de Live (Levy / Trinity / Sensei), persistido entre recargas.
// Lectura síncrona para quien no es React (p. ej. la voz por agente: `agenteActivo()` al pedir el
// habla) y evento `arbrain:live-agente` para reaccionar al cambio.
import { esAgenteId, type AgenteId } from './agents'
import { esEdicionCliente } from '@/lib/edicion'

const LLAVE = 'arbrain:live:agente'
export const EVENTO_AGENTE = 'arbrain:live-agente'

export function agenteActivo(): AgenteId {
  // Edición cliente: solo Levy (los avatares y voces de Trinity y Sensei no viajan en el paquete del alumno).
  if (esEdicionCliente()) return 'levy'
  try { const v = localStorage.getItem(LLAVE); return esAgenteId(v) ? v : 'levy' } catch { return 'levy' }
}

export function fijarAgenteActivo(id: AgenteId): void {
  try { localStorage.setItem(LLAVE, id) } catch { /* sin almacenamiento: vale solo esta sesión */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_AGENTE, { detail: id }))
}
