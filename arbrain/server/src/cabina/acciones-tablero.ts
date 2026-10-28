/**
 * Botones del tablero de agentes (27 oct 2026): Detener y Responder desde el Taller, por la MISMA vía que usa Levy
 * (`detener` y `retomar` de la Cabina). Solo subagentes del registro (los lanzó Levy con `delegar`) y abiertos; el
 * servidor re-verifica en el momento, la UI no decide nada.
 *
 *  · detener  = corta el paso en curso sin perder la sesión (sin-pantalla.ts › detenerSubagente). Reversible: un
 *               mensaje lo reanuda.
 *  · responder = un mensaje al agente (cuerpo.ts › retomar): si trabaja entra a su turno en curso o a su cola; si ya
 *               terminó, abre un turno nuevo sobre la misma sesión. Lleva una marca de que lo escribió el dueño.
 */
import { DUENO_M } from '../dueno.js'

export type PedidoTablero = { accion: 'detener'; agente: number } | { accion: 'responder'; agente: number; texto: string }

/** Valida lo que llega del navegador. Devuelve el pedido limpio o el error en palabras. */
export function pedidoTablero(p: Record<string, unknown>): PedidoTablero | { error: string } {
  const agente = Number(p.agente)
  if (!Number.isInteger(agente) || agente <= 0) return { error: 'Falta el agente.' }
  if (p.que === 'detener') return { accion: 'detener', agente }
  if (p.que === 'responder') {
    const texto = typeof p.texto === 'string' ? p.texto.trim() : ''
    if (!texto) return { error: 'Escribe el mensaje para el agente.' }
    if (texto.length > 4000) return { error: 'El mensaje es demasiado largo (máximo 4,000 caracteres).' }
    return { accion: 'responder', agente, texto }
  }
  return { error: 'Acción desconocida.' }
}

/** El mensaje que le llega al agente: dice de quién viene para que no lo confunda con Levy. */
export const mensajeDelDueno = (texto: string) => `[Mensaje de ${DUENO_M} desde el Taller] ${texto}`

export interface PuertoTablero {
  detener(id: number): Promise<{ estaba: boolean }>
  retomar(id: number, texto: string): Promise<{ encolado: boolean; confirmado: boolean; enVivo?: boolean }>
}

export async function accionTablero(p: PedidoTablero, puerto?: PuertoTablero): Promise<{ ok: true; texto: string } | { ok: false; status: number; error: string }> {
  const real = puerto ?? {
    detener: async (id: number) => (await import('./sin-pantalla.js')).detenerSubagente(id),
    retomar: async (id: number, texto: string) => (await import('./cuerpo.js')).retomar(id, texto),
  }
  try {
    if (p.accion === 'detener') {
      const r = await real.detener(p.agente)
      return { ok: true, texto: r.estaba ? 'Detenido. Su sesión sigue: un mensaje lo reanuda.' : 'No estaba trabajando: no había nada que detener.' }
    }
    const r = await real.retomar(p.agente, mensajeDelDueno(p.texto))
    const texto = r.enVivo ? 'Le llegó a su turno en curso: lo toma al terminar el paso que está haciendo.'
      : r.encolado ? 'Quedó en su cola: lo toma en cuanto termine el paso.'
      : r.confirmado ? 'Le llegó: empezó un turno nuevo con tu mensaje.' : 'Se envió, pero no pude confirmar que le llegara.'
    return { ok: true, texto }
  } catch (e) {
    return { ok: false, status: 409, error: e instanceof Error ? e.message : 'No se pudo.' }
  }
}
