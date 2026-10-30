/**
 * El hilo del chat nunca queda vacío EN SILENCIO (12 oct 2026, Daniel: «ya no me apareció el chat, soluciona y asegúrate
 * que no vuelva a pasar»). Dos defensas, ambas reportan a la bitácora (telemetría, nunca la campana):
 *
 * 1. `HiloSeguro` (error boundary): si pintar la conversación lanza, se ve «No pude mostrar esta conversación ·
 *    Reintentar» en vez de un área negra, y el error queda registrado.
 * 2. El vigía del hilo (ChatPanel): poco después de abrir o restaurar una conversación con mensajes, mide si algún
 *    mensaje ocupa la zona visible del hilo y si WebKit lo está pintando (content-visibility). Si no hay nada, se cura
 *    (mensajes sin aplazar y salto seguro al final) y se registra con el estado medido, para tener la causa la próxima
 *    vez sin depender de una captura.
 */

import { fijarScroll, limpiarMarcadores } from './desplazar'

export interface Franja { top: number; bottom: number }

/** ¿Ningún mensaje toca la zona visible? Puro, para el test. Con 0 mensajes no hay nada que reclamar. */
export function nadaVisible(vista: Franja, mensajes: Franja[]): boolean {
  if (mensajes.length === 0 || vista.bottom - vista.top < 1) return false
  return !mensajes.some((m) => m.bottom > vista.top + 1 && m.top < vista.bottom - 1)
}

/**
 * ¿El hilo está vacío a la vista? Hay mensajes en el DOM y ninguno visible: o porque ninguno toca la zona (el scroll
 * quedó en un hueco) o porque todos los que la tocan están saltados por content-visibility (WebKit no los repintó).
 * Puro, para el test.
 */
export function hiloVacioALaVista(vista: Franja, mensajes: (Franja & { saltado?: boolean })[]): boolean {
  if (mensajes.length === 0) return false
  if (nadaVisible(vista, mensajes)) return true
  const enVista = mensajes.filter((m) => m.bottom > vista.top + 1 && m.top < vista.bottom - 1)
  return enVista.length > 0 && enVista.every((m) => m.saltado === true)
}

export interface EstadoHilo {
  vacio: boolean
  detalle: Record<string, number | string>
}

/** Mide el hilo: ¿se ve algún mensaje?, más la forma del contenedor para la bitácora. Lee layout (no escribe). */
export function medirHilo(el: HTMLElement, contenido: HTMLElement): EstadoHilo {
  const r = el.getBoundingClientRect()
  const nodos = Array.from(contenido.querySelectorAll<HTMLElement>('[data-msg-id]'))
  const medidos = nodos.map((m) => {
    const q = m.getBoundingClientRect()
    return { top: q.top, bottom: q.bottom, saltado: m.checkVisibility?.({ contentVisibilityAuto: true }) === false }
  })
  const ultimo = medidos[medidos.length - 1]
  return {
    vacio: hiloVacioALaVista({ top: r.top, bottom: r.bottom }, medidos),
    detalle: {
      scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      zoom: document.documentElement.style.zoom || '1', mensajes: nodos.length,
      saltados: medidos.filter((m) => m.saltado).length, aplazados: contenido.querySelectorAll('[data-fuera-de-vista]').length,
      marcadores: el.querySelectorAll(':scope > [data-marca-scroll]').length,
      // Distancia entre el fin del último mensaje y el fondo del contenedor: un hueco real (> 0) o desborde falso (< 0).
      huecoAlFondo: ultimo ? Math.round(r.bottom - ultimo.bottom) : 0,
    },
  }
}

/**
 * Cura de verdad (13 oct 2026): el vigía anterior solo llamaba `fijarScroll(el, scrollHeight)`, que no hace nada si el
 * scroll ya está en el fondo, justo el caso real (scrollTop == scrollHeight - clientHeight con el contenido varios miles
 * de px arriba por un marcador de salto viejo). Aquí se quitan las causas conocidas del hueco (marcadores, alturas
 * reservadas por content-visibility), se fuerza un relayout y un repintado, y se lleva la vista al último mensaje.
 */
export function curarHilo(el: HTMLElement, contenido: HTMLElement) {
  limpiarMarcadores(el)
  for (const m of Array.from(contenido.querySelectorAll<HTMLElement>('[data-fuera-de-vista]'))) {
    m.removeAttribute('data-fuera-de-vista'); m.style.removeProperty('content-visibility'); m.style.removeProperty('contain-intrinsic-height')
  }
  // Relayout + repintado: sacar el contenedor del flujo un instante obliga a recalcular alturas y a pintar mosaicos nuevos.
  const prev = el.style.overflowY
  el.style.overflowY = 'hidden'
  void el.offsetHeight
  el.style.overflowY = prev
  void el.scrollHeight
  const ultimo = contenido.querySelector<HTMLElement>('[data-msg-id]:last-of-type') ?? Array.from(contenido.querySelectorAll<HTMLElement>('[data-msg-id]')).pop()
  fijarScroll(el, el.scrollHeight)
  // Si aun así ningún mensaje se ve, el desborde no es de más: llevar el último mensaje a la vista por el camino nativo.
  if (ultimo && medirHilo(el, contenido).vacio) ultimo.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior })
  el.dataset.hiloCurado = String(Date.now()) // rastro para el arnés y para depurar en vivo
}

/** Espera a que el navegador haya hecho layout y pintado (dos cuadros + un respiro) antes de volver a medir. */
export function despuesDePintar(): Promise<void> {
  return new Promise((ok) => {
    if (typeof requestAnimationFrame !== 'function') return setTimeout(ok, 120) as unknown as void
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 100)))
  })
}

export interface ReporteHilo {
  /** 'rueda' (19 oct 2026): la rueda no movió el hilo, ver lib/rueda-vigia.ts. */
  tipo: 'render' | 'vacio' | 'rueda'
  mensaje: string
  sesion?: string | null
  detalle?: Record<string, unknown>
}

/** Cuerpo acotado del reporte (nada de contenido de mensajes: solo forma y números). Puro, para el test. */
export function cuerpoReporte(r: ReporteHilo): { title: string; body: string } {
  const curado = r.detalle?.curado
  const title = (r.tipo === 'render' ? 'Chat: no se pudo pintar la conversación' : r.tipo === 'rueda' ? 'Chat: la rueda no movió el hilo'
    : curado === false ? 'Chat: hilo vacío a la vista (NO curado)' : 'Chat: hilo vacío a la vista (curado)').slice(0, 200)
  // La rueda trae más estado (cadena bajo el puntero, pin, turno): cabe en 3000.
  const body = JSON.stringify({ mensaje: r.mensaje.slice(0, 500), sesion: r.sesion ?? null, ...(r.detalle ?? {}) }).slice(0, r.tipo === 'rueda' ? 3000 : 1000)
  return { title, body }
}

const enviados = new Map<string, number>()

/** Manda el reporte a la bitácora. Uno por tipo+sesión+mensaje cada 5 min: un bucle de errores no inunda nada. */
export function reportarHilo(r: ReporteHilo) {
  if (typeof window === 'undefined') return
  const clave = `${r.tipo}|${r.sesion ?? ''}|${r.mensaje.slice(0, 120)}`
  const ahora = Date.now()
  if (ahora - (enviados.get(clave) ?? 0) < 5 * 60_000) return
  enviados.set(clave, ahora)
  try {
    void fetch('/api/chat/hilo-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
      keepalive: true,
    }).catch(() => {})
  } catch { /* sin red: el aviso visible ya está en pantalla */ }
}
