/**
 * A dónde va lo que Daniel manda (1 oct 2026, bug visto 09:32: «solo el segundo
 * mensaje se envía»). El journal del 1 oct mostró la cadena real: un envío con fotos
 * falló, el reenvío arrancó un turno y 7 s después el cliente pidió detenerlo
 * (/chat/interrupt); en el hilo quedó «[Request interrupted by user]» y el mismo
 * texto otra vez. Ninguna entrada nueva debe detener un turno: solo el botón
 * detener, con la caja vacía, y «Enviar ya», que lo dice en su nombre.
 *
 * Reglas:
 *  - Con Levy trabajando (o un envío aún subiendo fotos) todo entra a la fila.
 *  - Si la fila espera su salida, lo nuevo se forma detrás: el orden se respeta.
 *  - Una fila EN PAUSA no retiene lo nuevo: lo nuevo sale directo y la pausa queda.
 *  - Esc ya no detiene: un Esc para cerrar otra cosa interrumpía a Levy y devolvía
 *    el texto al composer, y el reenvío lo duplicaba.
 */
export type DestinoEnvio = 'nada' | 'fila' | 'directo'

export interface EstadoEnvio {
  /** Levy trabaja en esta conversación, o el stream ya arrancó aunque React no lo pinte. */
  trabajando: boolean
  /** Hay texto, archivo de texto o imagen que mandar. */
  hayContenido: boolean
  /** Lo manda la fila al vaciarse: siempre directo. */
  desdeCola?: boolean
  /** Se está editando un mensaje pasado (rebobina: no puede ir a la fila). */
  editando?: boolean
  /** La fila tiene pendientes que van a salir solos (no en pausa). */
  filaEsperando?: boolean
}

export function destinoDelEnvio(e: EstadoEnvio): DestinoEnvio {
  if (!e.hayContenido) return 'nada'
  if (e.desdeCola) return 'directo'
  if (e.editando) return e.trabajando ? 'nada' : 'directo'
  if (e.trabajando || e.filaEsperando) return 'fila'
  return 'directo'
}

/** Tras enviar, el botón cambia de enviar a detener EN EL MISMO LUGAR. Un doble clic
 *  o doble toque caía en «detener» e interrumpía el turno recién mandado. Durante
 *  esta gracia el botón detener se ve pero no actúa. */
export const GRACIA_DETENER_MS = 900

export type BotonComposer = 'detener' | 'enviar' | 'voz'

export function botonDelComposer(e: { trabajando: boolean; hayContenido: boolean }): BotonComposer {
  // Con cualquier contenido (también solo fotos) el botón ENVÍA; detener exige la caja vacía.
  if (e.hayContenido) return 'enviar'
  return e.trabajando ? 'detener' : 'voz'
}

export function detenerArmado(ultimoEnvio: number, ahora: number): boolean {
  return ahora - ultimoEnvio >= GRACIA_DETENER_MS
}

/** Une los pendientes de la fila en UN mensaje, en orden; las fotos de todos viajan juntas. */
export function unirFila(items: Array<{ texto: string; imagenes?: string[] }>): { texto: string; imagenes: string[] } | null {
  if (!items.length) return null
  const texto = items.map(x => x.texto.trim()).filter(Boolean).join('\n\n')
  const imagenes = items.flatMap(x => x.imagenes ?? [])
  if (!texto && !imagenes.length) return null
  return { texto, imagenes }
}

/** Lo mínimo de un mensaje del hilo que necesita la regla de abajo. */
interface MensajeHilo {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
  error?: boolean
  terminalStatus?: string
  metadata?: { turnId?: string } | null
}

/**
 * ¿Este texto repite un mensaje de la conversación cuyo turno sigue sin resolverse? (2 oct 2026: DeepSeek
 * en el chat. El primer turno no se veía, Daniel mandó el mismo texto 12 s después y el servidor formó el
 * segundo detrás del primero: dos ejecuciones del mismo pedido y «Preparando respuesta» durante 3 min.)
 * Un turno se resuelve cuando su respuesta terminó con texto, falló o se detuvo; mientras no, repetirlo
 * solo duplica el trabajo. Pasados 10 min sin respuesta se permite: puede ser un reintento consciente.
 */
export function repiteTurnoEnCurso(mensajes: MensajeHilo[], texto: string, ahora = Date.now()): boolean {
  const buscado = texto.trim()
  if (!buscado) return false
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.role !== 'user' || m.content.trim() !== buscado) continue
    if (ahora - m.timestamp.getTime() > 10 * 60_000) return false
    const turno = m.metadata?.turnId
    const respuesta = turno ? mensajes.find(r => r.role === 'assistant' && r.metadata?.turnId === turno) : mensajes[i + 1]?.role === 'assistant' ? mensajes[i + 1] : undefined
    if (!respuesta) return true
    return !(respuesta.error || respuesta.terminalStatus || (!respuesta.streaming && respuesta.content.trim()))
  }
  return false
}
