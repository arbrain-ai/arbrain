/**
 * El modo del Orbe: «fluido» (tras cada respuesta vuelve a escuchar solo, ideal manejando) o «por turnos» (tocas para
 * hablar, tocas para enviar y, tras la respuesta, queda en pausa sin micrófono hasta el próximo toque: para trabajar
 * tranquilo sin una conversación abierta). Se recuerda en este navegador.
 */
import type { ModoTurno } from './respuesta'

export type { ModoTurno }
const CLAVE_MODO = 'arbrain-modo-coche-modo'

export function leerModo(): ModoTurno {
  try { return localStorage.getItem(CLAVE_MODO) === 'turnos' ? 'turnos' : 'fluido' } catch { return 'fluido' }
}
export function guardarModo(m: ModoTurno): void {
  try { localStorage.setItem(CLAVE_MODO, m) } catch { /* modo privado */ }
}
