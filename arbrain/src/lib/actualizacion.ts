/**
 * Actualizar sin cortar (4 oct 2026, «quítame a mí del medio»).
 *
 * Lógica pura (sin DOM ni React) de dos decisiones:
 *  1. ¿Es un momento seguro para aplicar una versión nueva sin que Daniel lo note?
 *  2. ¿Qué estado de la pantalla se guarda antes y se restaura después para volver «exactamente a como estaba»?
 *
 * Lo que ya sobrevive solo (no se duplica aquí): la conversación abierta (`mc_lastChatSessionId`), los
 * paneles y la barra izquierda (`barras-store`, `ventanas`, `PanelDerecho`), la cuenta (`account-store`),
 * el modelo (`selection-cache`) y el borrador de cada composer (IndexedDB, una escritura por tecla). Lo que
 * este módulo añade es lo que se perdía: la ruta, la posición del scroll del chat y la garantía de que
 * las escrituras del borrador terminaron ANTES de recargar.
 */

/** Tiempo sin teclado, ratón ni toque para considerar que Daniel no está usando la ventana. */
export const OCIO_PARA_APLICAR_MS = 120_000
/** El estado guardado solo vale para el arranque inmediato posterior; pasado esto se ignora. */
export const VIGENCIA_ESTADO_MS = 5 * 60_000
export const CLAVE_ESTADO = 'arbrain:restaurar:v1'

export interface SenalesSeguridad {
  /** Esta ventana tiene un stream de chat vivo (o un envío despachándose). */
  streamLocal: boolean
  /** Turnos vivos de Daniel según el journal del daemon; null = no se pudo saber. */
  turnosServidor: number | null
  /** Subagentes / comandos en segundo plano vivos ligados a una conversación; null = sin lectura. */
  hijosVivos: number | null
  /** ms desde el último teclado/ratón/toque en la ventana. */
  ocioMs: number
  /** Daniel pulsó «Reiniciar»: él decide, solo importa que no se pierda nada guardable. */
  manual?: boolean
}

export type Veredicto = { seguro: true } | { seguro: false; razon: 'stream' | 'turno' | 'hijos' | 'uso' }

export function momentoSeguro(s: SenalesSeguridad): Veredicto {
  // Pulsar «Reiniciar» a mano es una orden: el turno vive en el agent-server y la pantalla lo reengancha.
  if (s.manual) return { seguro: true }
  if (s.streamLocal) return { seguro: false, razon: 'stream' }
  if ((s.turnosServidor ?? 0) > 0) return { seguro: false, razon: 'turno' }
  if ((s.hijosVivos ?? 0) > 0) return { seguro: false, razon: 'hijos' }
  if (s.ocioMs < OCIO_PARA_APLICAR_MS) return { seguro: false, razon: 'uso' }
  return { seguro: true }
}

/**
 * ¿Esta ruta es de una ventana sacada del panel (`/panel?ventana=N`)? Esas ventanas las abre y reabre la
 * principal con su propia ruta; su ruta jamás es «el estado de la principal». 7 oct 2026: tras actualizar,
 * la Ventana 1 guardó su ruta en el localStorage compartido, la principal la restauró y se volvió otro panel
 * (dos ventanas iguales, sin chat).
 */
export function esRutaDeVentana(ruta: string): boolean {
  return ruta === '/panel' || ruta.startsWith('/panel?') || ruta.startsWith('/panel#') || ruta.startsWith('/panel/')
}

export interface EstadoUI {
  /** pathname + search + hash donde estaba Daniel. */
  ruta: string
  /** Cuándo se guardó (ms). */
  ts: number
  /** Scroll del hilo del chat: pegado al final, o a cuántos px del final. */
  chat?: { alFinal: boolean; desdeAbajo: number }
}

export function serializarEstado(e: EstadoUI): string {
  return JSON.stringify(e)
}

/** Devuelve el estado si es válido y reciente; cualquier otra cosa es null (jamás lanza). */
export function leerEstado(raw: string | null, ahora = Date.now()): EstadoUI | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<EstadoUI>
    if (!v || typeof v.ruta !== 'string' || !v.ruta.startsWith('/') || v.ruta.startsWith('//') || esRutaDeVentana(v.ruta)) return null
    if (typeof v.ts !== 'number' || ahora - v.ts > VIGENCIA_ESTADO_MS || ahora < v.ts - 60_000) return null
    const chat = v.chat && typeof v.chat.desdeAbajo === 'number' && Number.isFinite(v.chat.desdeAbajo)
      ? { alFinal: !!v.chat.alFinal, desdeAbajo: Math.max(0, v.chat.desdeAbajo) } : undefined
    return { ruta: v.ruta, ts: v.ts, ...(chat ? { chat } : {}) }
  } catch { return null }
}

/** ¿Hay que navegar a la ruta guardada? Solo si el arranque cayó en otra distinta (relanzar abre en /chat). */
export function rutaPorRestaurar(estado: EstadoUI, actual: string): string | null {
  if (esRutaDeVentana(actual) || esRutaDeVentana(estado.ruta)) return null // una ventana sacada nunca cambia de ruta
  return estado.ruta === actual ? null : estado.ruta
}

/** scrollTop que reproduce la posición guardada en un contenedor con estas medidas. */
export function scrollTopRestaurado(chat: NonNullable<EstadoUI['chat']>, scrollHeight: number, clientHeight: number): number {
  const fondo = Math.max(0, scrollHeight - clientHeight)
  return chat.alFinal ? fondo : Math.max(0, fondo - chat.desdeAbajo)
}

/** Tope de espera de un deploy pedido con «Reiniciar» (compilar tarda ~2-4 min; pasado esto se rinde y lo dice). */
export const TOPE_DESPLIEGUE_MS = 12 * 60_000
/** Si tras pedir el deploy nadie lo toma (sin candado y aún pendiente) en este tiempo, la orden no arrancó. */
export const ARRANQUE_DESPLIEGUE_MS = 45_000

/**
 * ¿Hay algo que «Reiniciar» pueda aplicar? Es la condición para mostrar la píldora (5 oct 2026: la píldora seguía
 * ahí tras pulsar porque el árbol pendiente de origin no compilaba; un árbol roto no es algo que aplicar).
 */
export function hayQueAplicar(p: {
  webNueva: boolean
  estado: { disponible: boolean; pendiente: boolean; fallo: boolean } | null
  shell: { pendiente: boolean; cambiaBinario: boolean } | null
}): { web: boolean; sinDesplegar: boolean; shell: boolean; alguna: boolean } {
  const sinDesplegar = !!p.estado?.disponible && p.estado.pendiente && !p.estado.fallo
  const shell = !!(p.shell?.pendiente && p.shell.cambiaBinario)
  return { web: p.webNueva, sinDesplegar, shell, alguna: p.webNueva || sinDesplegar || shell }
}

export type ProgresoDespliegue = 'esperar' | 'listo' | 'fallo' | 'sinArranque' | 'tiempo'

/**
 * Un paso de la espera tras pedir el deploy. `listo` = el servidor ya sirve otro build que el de esta pantalla
 * (el cambio de slot ocurrió) o ya no queda nada pendiente: en ambos casos se recarga. `fallo` = deploy.sh terminó
 * mal DESPUÉS de este «Reiniciar» (una marca de fallo anterior no cuenta); `sinArranque` = nadie tomó la orden;
 * `tiempo` = se agotó el tope. `estado` null = el servidor no contestó (reiniciando en el cambio de slot): esperar.
 */
export function evaluarDespliegue(p: {
  buildMio: string | undefined
  buildServidor: string | null
  estado: { desplegando: boolean; fallo: boolean; pendiente: boolean; faseTs?: number | null } | null
  desde: number
  ahora: number
}): ProgresoDespliegue {
  if (p.buildMio && p.buildServidor && p.buildServidor !== p.buildMio) return 'listo'
  const e = p.estado
  if (e?.fallo && !e.desplegando && (e.faseTs ?? 0) >= p.desde - 1_000) return 'fallo' // deploy.sh marca en segundos
  // Nada pendiente y nadie desplegando: o ya se desplegó o el commit no cambiaba nada. Se recarga igual.
  if (e && !e.pendiente && !e.desplegando && p.ahora - p.desde > 10_000) return 'listo'
  if (e && e.pendiente && !e.desplegando && p.ahora - p.desde > ARRANQUE_DESPLIEGUE_MS) return 'sinArranque'
  if (p.ahora - p.desde > TOPE_DESPLIEGUE_MS) return 'tiempo'
  return 'esperar'
}

/** Progreso real: la fase de deploy.sh y los segundos que lleva, para que «Reiniciar» nunca parezca congelado. */
export function textoDespliegue(fase: string | null | undefined, ms = 0): string {
  const s = Math.round(ms / 1000)
  const t = s >= 5 ? ` · ${s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`}` : ''
  if (fase === 'cambiando' || fase === 'esperando') return `Casi listo…${t}`
  return `Compilando versión nueva…${t}`
}

export function textoFinDespliegue(v: Exclude<ProgresoDespliegue, 'esperar' | 'listo'>): string {
  if (v === 'fallo') return 'La versión nueva no compiló · sigues en la actual'
  if (v === 'sinArranque') return 'No arrancó la actualización · reintenta'
  return 'Tardó demasiado · reintenta'
}
