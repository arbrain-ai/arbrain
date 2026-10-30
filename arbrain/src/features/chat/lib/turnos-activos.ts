// Turnos EN CURSO de Levy, según el journal del daemon (1 oct 2026).
//
// Por qué existe: el semáforo del sidebar inferia «trabajando» de chat_sessions.last_role = 'user',
// pero la fila del usuario solo llega al terminar el turno (el guardado temprano del cliente no es
// fiable y el webhook /complete inserta user y assistant juntos al final). Un turno largo se veía
// gris y, al acabar, saltaba directo a «sin ver». El journal sí sabe qué turnos viven: una sola
// consulta (/api/chat/active) para toda la lista.
//
// Es un almacén de módulo (no zustand ni estado de React) a propósito: lo escribe el poll de
// useChatHistory y lo lee deriveSessionState desde cualquier fila, incluidas las que «Recientes»
// trae por su cuenta de otras cuentas, sin que cada una tenga que cargar una bandera.

import { agruparInternas } from '../../cabina/internas-por-conversacion'
import type { TareaInterna, Terminal } from '../../cabina/trabajos-modelo'

/** working = Levy escribe/trabaja · waiting = Levy espera tu respuesta (AskUserQuestion). */
export type TurnoActivo = 'working' | 'waiting'
export interface TurnoActivoDto { conversationId: string; status: string }

// Si el poll se detiene (pestaña oculta, red caída) los datos dejan de mandar a los 45 s y el
// semáforo vuelve a la heurística de la fila en vez de congelar un «trabajando» que ya no se mide.
export const TURNOS_CADUCAN_MS = 45_000

let mapa: ReadonlyMap<string, TurnoActivo> = new Map()
let actualizado = 0
let version = 0
const oyentes = new Set<() => void>()

const estadoDe = (status: string): TurnoActivo => (status === 'waiting' ? 'waiting' : 'working')

/**
 * Aplica la última respuesta del daemon. `null` = esta vez no hubo dato (daemon viejo o caído): no
 * borra lo anterior, solo deja que envejezca. Devuelve true si cambió quién trabaja (para repintar).
 */
export function fijarTurnosActivos(turnos: TurnoActivoDto[] | null, ahora = Date.now()): boolean {
  if (!turnos) return false
  const siguiente = new Map<string, TurnoActivo>()
  for (const t of turnos) {
    if (typeof t?.conversationId !== 'string' || typeof t.status !== 'string') continue
    // Si la misma conversación aparece dos veces, «waiting» gana (es la que pide acción tuya).
    if (siguiente.get(t.conversationId) !== 'waiting') siguiente.set(t.conversationId, estadoDe(t.status))
  }
  const venciado = ahora - actualizado >= TURNOS_CADUCAN_MS
  actualizado = ahora
  const igual = siguiente.size === mapa.size && [...siguiente].every(([id, estado]) => mapa.get(id) === estado)
  if (igual && !venciado) return false
  mapa = siguiente
  version++
  oyentes.forEach((cb) => cb())
  return true
}

/** El mapa vigente, o null si nunca hubo dato o ya caducó (entonces manda la heurística de la fila). */
export function turnosActivos(ahora = Date.now()): ReadonlyMap<string, TurnoActivo> | null {
  return actualizado > 0 && ahora - actualizado < TURNOS_CADUCAN_MS ? mapa : null
}

// useSyncExternalStore: suscripción + versión (cambia solo cuando cambia quién trabaja).
export function suscribirTurnosActivos(cb: () => void): () => void {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}
export const versionTurnosActivos = () => version

// ─── Hijos vivos del turno (subagentes, comandos en segundo plano, workflows) ───
// 3 oct 2026: el journal da por terminado el turno visible aunque a Levy le queden hijos
// trabajando, y el punto se ponía gris con «4 trabajando» en el Taller. La fuente es la MISMA
// que lee el Taller en «Lo que trabaja, por conversación»: `agruparInternas` sobre `internas`
// (tareas dentro del turno) Y los subagentes del motor ligados a la conversación (`terminales`
// con `subagente.origen`, de subagentes.json). Si el Taller dice «N en curso», el punto es amarillo.
export interface HijoDto { conversacion: string; estado: string }
/** Lo mínimo de un terminal del motor para saber si es un subagente vivo de una conversación. */
export type AgenteDto = Terminal

let hijos: ReadonlyMap<string, number> = new Map()
/** Cuándo se apagó el último hijo de cada conversación (para pasar a «sin ver»). */
const hijosTerminaron = new Map<string, number>()
let hijosActualizado = 0

/** Hijos en curso por conversación (id sin `sdk:`): exactamente la cuenta «N en curso» del Taller. */
export function hijosEnCursoPorConversacion(internas: readonly HijoDto[], terminales: readonly Terminal[] = []): Map<string, number> {
  const validas = internas.filter((t) => typeof t?.conversacion === 'string' && typeof t?.estado === 'string') as unknown as TareaInterna[]
  // esHoy: () => false — solo importa lo vivo; las terminadas no cuentan para el punto.
  const { grupos } = agruparInternas(validas, { agentes: terminales.filter((t) => t?.subagente), esHoy: () => false })
  const mapa = new Map<string, number>()
  for (const g of grupos) {
    const n = g.corriendo.length + g.agentes.length
    if (g.conversacion && n > 0) mapa.set(g.conversacion, n)
  }
  return mapa
}

export function fijarHijosVivos(internas: HijoDto[] | null, ahora = Date.now(), terminales: readonly Terminal[] = []): boolean {
  if (!internas) return false
  const siguiente = hijosEnCursoPorConversacion(internas, terminales)
  let cambio = siguiente.size !== hijos.size
  for (const [id] of hijos) if (!siguiente.has(id)) { hijosTerminaron.set(id, ahora); cambio = true }
  for (const [id, n] of siguiente) if (hijos.get(id) !== n) cambio = true
  hijosActualizado = ahora
  if (!cambio) return false
  hijos = siguiente
  version++
  oyentes.forEach((cb) => cb())
  return true
}

/** Conversaciones con al menos un hijo vivo, o null si la lectura no existe o caducó. */
export function hijosVivos(ahora = Date.now()): ReadonlyMap<string, number> | null {
  return hijosActualizado > 0 && ahora - hijosActualizado < TURNOS_CADUCAN_MS ? hijos : null
}
export function hijosTerminaronEn(id: string): number { return hijosTerminaron.get(id) ?? 0 }
/** Hijos en curso de una conversación (acepta `sdk:<id>` y `<id>`). */
export function hijosDe(mapa: ReadonlyMap<string, number> | null | undefined, id: string): number {
  return mapa?.get(id.replace(/^sdk:/, '')) ?? 0
}

// ─── Envío local (3 oct 2026, Daniel: «apenas envío el mensaje cambia a amarillo, no hasta que
// llega el token») ───
// El journal y la fila de chat_sessions tardan segundos en enterarse del turno. Este cliente sí
// sabe al instante que acaba de enviar: lo marca y el punto pasa a amarillo en el mismo clic.
// La marca vale ENVIO_LOCAL_MS o hasta que llegue la respuesta de Levy (lo decide session-status).
export const ENVIO_LOCAL_MS = 30_000
const envios = new Map<string, number>()
const temporizadores = new Map<string, ReturnType<typeof setTimeout>>()

export function marcarEnvioLocal(id: string, ahora = Date.now()): void {
  if (!id) return
  envios.set(id, ahora)
  version++
  oyentes.forEach((cb) => cb())
  // Al vencer, repinta para que el punto no se quede amarillo sin fuente que lo sostenga.
  const previo = temporizadores.get(id)
  if (previo) clearTimeout(previo)
  temporizadores.set(id, setTimeout(() => { temporizadores.delete(id); version++; oyentes.forEach((cb) => cb()) }, ENVIO_LOCAL_MS + 50))
}
/** Cuándo envió este cliente a esa conversación (0 = nunca o ya venció). */
export function envioLocalEn(id: string, ahora = Date.now()): number {
  const t = envios.get(id) ?? 0
  return t && ahora - t < ENVIO_LOCAL_MS ? t : 0
}

/** Solo para pruebas. */
export function reiniciarTurnosActivos(): void {
  envios.clear(); temporizadores.forEach(clearTimeout); temporizadores.clear()
  mapa = new Map(); actualizado = 0; version = 0
  hijos = new Map(); hijosTerminaron.clear(); hijosActualizado = 0
}
