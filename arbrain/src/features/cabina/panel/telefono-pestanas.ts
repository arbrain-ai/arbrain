'use client'
/**
 * Pestañas en el teléfono (6 oct 2026, firmado por Daniel). Sin Hoja inferior: una fila de pestañas bajo la cabecera y,
 * al tocar una, esa vista a pantalla completa debajo de las dos filas. El chat NO se desmonta (queda debajo, tapado):
 * al volver, su scroll y su borrador son los mismos.
 *
 * No hay estado nuevo: «¿qué se ve?» es lo que ya decían `panelDerechoOpen` (hay una pestaña a pantalla completa) y
 * `activa` (cuál). Así todo lo que ya abre el panel (el «+», Levy, un aviso) lleva a la vista también en el teléfono.
 * Aquí el hook que une la lógica pura (telefono-logica.ts, con sus tests) con los stores.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { esTelefonoAhora, useIsMobile } from '@/shared/hooks/useMediaQuery'
import { usePanelFijadas, clavesDe } from './fijadas'
import { TAREAS } from './pestanas-fuera'
import { nombreDeClave } from './nombre-pestana'
import { esReapertura, vistaTelefono, type VistaTelefono } from './telefono-logica'
import { esMensajeDeToque, rutaDeToque, toqueReciente, type MensajeSW } from '@/features/notifications/lib/toque-aviso'

export { LARGA_MS, LARGA_MOVIMIENTO, esMantenido, vistaTelefono, type VistaTelefono } from './telefono-logica'

/** Un teléfono de verdad: angosto y táctil. Una ventana angosta del escritorio no reabre en el chat. */
const esTelefono = esTelefonoAhora

/** La vista del teléfono y su nombre para la cabecera. En escritorio siempre es el chat (sin nombre). */
export function useVistaTelefono() {
  const movil = useIsMobile()
  const abierto = useLayoutStore(s => s.panelDerechoOpen)
  const orden = usePanelFijadas(s => s.orden), taller = usePanelFijadas(s => s.taller), activa = usePanelFijadas(s => s.activa)
  const fijadas = usePanelFijadas(s => s.fijadas)
  if (!movil) return { vista: { tipo: 'chat' } as VistaTelefono, nombre: null as string | null, claves: [] as string[], fijadas }
  const claves = clavesTelefono(orden, taller)
  const vista = vistaTelefono(abierto, claves, activa)
  return { vista, nombre: vista.tipo === 'pestana' ? nombreDeClave(vista.clave, fijadas) : null, claves, fijadas }
}

/** Volver a Levy: el chat tal como estaba. */
export const volverALevy = () => useLayoutStore.getState().setPanelDerecho(false)
/** Tocar una pestaña de la fila: su vista a pantalla completa. */
export function verPestanaEnTelefono(clave: string) {
  usePanelFijadas.getState().activar(clave)
  useLayoutStore.getState().setPanelDerecho(true)
}

/**
 * El botón derecho de la cabecera del teléfono (10 oct 2026, corregido esa noche; Daniel: «le doy clic a la gente y como
 * estoy en el chat pues no pasa nada»). Es un interruptor chat ⇄ panel y su ícono dice a dónde lleva:
 * - en el chat, el ícono de panel: abre el panel a pantalla completa (la pestaña activa; sin pestañas, el Calendario);
 * - en una pestaña o en una sección, el robot: regresa al chat tal como estaba (conversación, scroll y borrador).
 */
export function abrirPanelEnTelefono() {
  // 10 oct 2026, noche (Daniel: «al presionar el panel derecho se abre la vista del calendario del día»): el panel abre
  // siempre en el Calendario. Si ya hay una pestaña de calendario se activa; si no, nace una en Día.
  const f = usePanelFijadas.getState()
  const cal = f.fijadas.find(x => x.input.vista === 'calendario')
  if (cal) f.activar(cal.id)
  else f.fijar(`mano-calendario-${Date.now().toString(36)}`, { vista: 'calendario', alcance: 'dia' } as never)
  useLayoutStore.getState().setPanelDerecho(true)
}

/**
 * En el teléfono no hay pestaña Tareas (10 oct 2026, Daniel: «sigo viendo la vista de tareas cuando ya la había ocultado,
 * todo lo hemos unificado en la vista del calendario»): las tareas viven en el Día del calendario.
 * 14 oct 2026: el panel es UNO para todos los aparatos (compartido.ts), así que el teléfono ya no CIERRA Tareas (la cerraría
 * también en el escritorio): solo no la enseña.
 */
export const clavesTelefono = (orden: string[], taller: boolean) => clavesDe({ orden, taller }).filter(c => c !== TAREAS)
export function tocarAgente(ruta: string, push: (url: string) => void) {
  volverALevy()
  if (ruta !== '/chat') push('/chat')
}

/** Lo primero al abrir o reabrir: el chat con una conversación nueva, sin panel ni cajón encima. */
function abrirChatNuevo(push: (url: string) => void) {
  const l = useLayoutStore.getState()
  l.setPanelDerecho(false)
  l.closeConversationsDrawer()
  if (window.location.pathname === '/chat') { window.dispatchEvent(new CustomEvent('openclaw:new-chat')); return }
  // Fuera del chat ChatPanel no está montado: se olvida la conversación de la navegación y /chat arranca en una nueva.
  try { sessionStorage.removeItem('mc_activeChatSessionId') } catch { /* modo privado */ }
  push('/chat')
}

/**
 * Apertura en frío (10 oct 2026): el primer chat que se monta en un teléfono desde que cargó la app nace en una
 * conversación nueva en vez de la última abierta (6 oct), haya arrancado en el chat o en una sección (iOS restaura la
 * última URL). Las vueltas siguientes al chat conservan la suya. Un deep link (?session= de un push) manda siempre: lo
 * resuelve ChatPanel antes.
 */
let primerChat = true
export function chatArrancaNuevo() {
  const nuevo = primerChat && esTelefono()
  primerChat = false
  return nuevo
}

/**
 * Reabrir la app en el teléfono tras un rato en segundo plano (`REAPERTURA_MS`) es abrirla: el chat, conversación nueva.
 * Salvo que la haya abierto el toque de una notificación (18 oct 2026, Daniel: «me llegó la noti pero no a la
 * conversación»): entonces manda la notificación (features/notifications/lib/toque-aviso.ts).
 */
export function useReabrirEnChat() {
  const router = useRouter()
  useEffect(() => {
    if (!esTelefono()) return
    let ocultaDesde: number | null = document.hidden ? Date.now() : null
    let ultimoToque = 0
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    const alMensaje = (e: MessageEvent) => {
      const m = e.data as MensajeSW
      if (!esMensajeDeToque(m)) return
      ultimoToque = Date.now()
      // La notificación lleva a una conversación: el chat al frente, sin una pestaña del panel ni el cajón tapándolo
      // (el chat sigue montado debajo; ChatPanel abre la conversación con el mismo mensaje).
      if (m?.type === 'open-chat-session') { useLayoutStore.getState().setPanelDerecho(false); useLayoutStore.getState().closeConversationsDrawer() }
      // El service worker no pudo navegar esta ventana: vamos nosotros (navegación completa, lee ?session= al cargar).
      const ruta = rutaDeToque(m, window.location.origin, window.location.pathname + window.location.search + window.location.hash)
      if (ruta) window.location.assign(ruta)
    }
    sw?.addEventListener('message', alMensaje)
    const alCambiar = () => {
      if (document.hidden) { ocultaDesde ??= Date.now(); return }
      const reabre = esReapertura(ocultaDesde, Date.now())
      ocultaDesde = null
      if (!reabre) return
      if (toqueReciente(ultimoToque, Date.now())) return
      // Una llamada en Live sigue: reabrir no la corta.
      if (window.location.pathname === '/chat' && new URLSearchParams(window.location.search).get('tab') === 'live') return
      // El ícono «Hábitos» de la pantalla de inicio (22 oct 2026) abre directo a sus casillas: reabrirlo no lo manda al chat.
      if (window.location.pathname.startsWith('/telefono/habitos')) return
      abrirChatNuevo(url => router.push(url))
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => { document.removeEventListener('visibilitychange', alCambiar); sw?.removeEventListener('message', alMensaje) }
  }, [router])
}
