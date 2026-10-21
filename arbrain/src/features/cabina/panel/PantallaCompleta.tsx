'use client'
/**
 * Pantalla completa con Levy a la mano (5 oct 2026). El patrón y su porqué viven en `pantalla-completa.ts`.
 *
 * Nada se desmonta: el chat (`[data-shell-main]`) se reacomoda por CSS (globals.css) como cajón flotante, así que la
 * conversación, el borrador, el dictado y el scroll son los mismos al abrirlo, al cerrarlo y al volver.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, X } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import type { MostrarInput } from '../model'
import { useConversacionActiva, useTituloConversacion } from '../conversaciones'
import { usePanelFijadas } from './fijadas'
import { mostrarPanel } from './ventanas'
import { accionDeTecla, CLAVE_RECUERDO, distanciaAlFondo, leerRecuerdo, scrollParaDistancia } from './pantalla-completa'
import s from './panel.module.css'

const escritorio = () => typeof window !== 'undefined' && !window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-height: 600px)').matches

/** Cambio de layout con transición suave (View Transitions donde existe; sin ella, al instante). */
function conTransicion(cambio: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cambio(); return }
  doc.startViewTransition(() => flushSync(cambio))
}

export function entrarPantallaCompleta(opciones: { levy?: boolean } = {}) {
  if (!escritorio()) return
  const st = useLayoutStore.getState()
  if (!st.panelDerechoOpen) mostrarPanel()
  conTransicion(() => {
    useLayoutStore.getState().setEnfoquePanel(true)
    if (opciones.levy !== undefined) useLayoutStore.getState().setLevyFlotante(opciones.levy)
  })
}
export function salirPantallaCompleta() { conTransicion(() => useLayoutStore.getState().setEnfoquePanel(false)) }
/** Volver: el layout de antes (chat + panel + pestaña) y, si Levy tuvo que traer el chat, la ruta de antes. */
function volver(push: (ruta: string) => void) {
  const previa = useLayoutStore.getState().rutaPrevia
  salirPantallaCompleta()
  if (previa) { useLayoutStore.getState().setRutaPrevia(null); push(previa) }
}
export function alternarPantallaCompleta() { if (useLayoutStore.getState().enfoquePanel) salirPantallaCompleta(); else entrarPantallaCompleta() }
export function alternarLevy() { useLayoutStore.getState().setLevyFlotante(!useLayoutStore.getState().levyFlotante) }

/** Ver algo a pantalla completa = su pestaña del panel a todo el ancho (la misma pestaña si ya estaba abierta). */
export function verEnPantallaCompleta(input: MostrarInput, opciones: { levy?: boolean } = {}) {
  const id = usePanelFijadas.getState().fijar(`mano-${input.vista}-${Date.now().toString(36)}`, input)
  mostrarPanel(id)
  entrarPantallaCompleta(opciones)
  return id
}
/** En escritorio, «ir a la sección» es su pantalla completa; en el teléfono sigue siendo la ruta. */
export const pantallaCompletaDisponible = escritorio

/** ⌘. entra y sale desde cualquier lugar del escritorio (montado siempre por el shell del panel). */
export function useAtajoPantallaCompleta(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    const tecla = (e: KeyboardEvent) => {
      if (accionDeTecla(e, { enfoque: false, focoEnLevy: false }) !== 'alternar' || e.repeat) return
      e.preventDefault(); alternarPantallaCompleta()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [activo])
}

/** Recuerda pantalla completa y Levy entre recargas (un despliegue recarga la app y vuelves igual). */
export function useRecuerdoPantallaCompleta() {
  useEffect(() => {
    // Sin guardia de «ya restaurado»: leer lo guardado es idempotente y el modo estricto monta el efecto dos veces.
    let r = leerRecuerdo(null)
    try { r = leerRecuerdo(localStorage.getItem(CLAVE_RECUERDO)) } catch { /* sin almacenamiento */ }
    useLayoutStore.setState({ levyFlotante: r.levy, rutaPrevia: r.rutaPrevia ?? null, ...(r.enfoque && escritorio() ? { enfoquePanel: true } : {}) })
    return useLayoutStore.subscribe(st => {
      try { localStorage.setItem(CLAVE_RECUERDO, JSON.stringify({ enfoque: st.enfoquePanel, levy: st.levyFlotante, rutaPrevia: st.rutaPrevia })) } catch { /* sin almacenamiento */ }
    })
  }, [])
}

/** Lo que vive mientras hay pantalla completa: marcas del documento, teclas, scroll del chat, Levy flotante y su ruta. */
export function PantallaCompleta() {
  const levy = useLayoutStore(st => st.levyFlotante)
  const router = useRouter(), pathname = usePathname()
  const [main, setMain] = useState<HTMLElement | null>(null)

  // Marcas que leen globals.css y panel.module.css. Layout effect: entran en el mismo cuadro que la transición.
  useLayoutEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.enfoque = '1'
    setMain(document.querySelector<HTMLElement>('[data-shell-main]'))
    // El scroll del chat se mide al entrar y se devuelve al salir (cambia de ancho: el fondo es la referencia).
    const lista = () => document.querySelector<HTMLElement>('[data-shell-main] [data-scroll-region]')
    const previa = lista(), distancia = previa ? distanciaAlFondo(previa) : 0
    return () => {
      delete raiz.dataset.enfoque; delete raiz.dataset.levyFlotante
      requestAnimationFrame(() => requestAnimationFrame(() => { const el = lista(); if (el) el.scrollTop = scrollParaDistancia(el, distancia) }))
    }
  }, [])
  useLayoutEffect(() => {
    if (levy) document.documentElement.dataset.levyFlotante = '1'
    else delete document.documentElement.dataset.levyFlotante
  }, [levy])

  // Levy flotante es el chat: si Daniel estaba en otra ruta (una sección abierta por enlace), se vuelve al chat y
  // Volver regresa a esa ruta. Al abrirlo, el foco va al campo de escribir; al cerrarlo, sale del chat.
  useEffect(() => {
    if (!levy) {
      if (document.activeElement && main?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      return
    }
    if (!pathname.startsWith('/chat')) {
      useLayoutStore.getState().setRutaPrevia(pathname + window.location.search)
      router.push('/chat')
      return
    }
    const t = window.setTimeout(() => main?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }), 240)
    return () => window.clearTimeout(t)
  }, [levy, main, pathname, router])

  // Teclas: ⌘J y ⌘. en captura (⌘J gana a la terminal, que aquí no se ve). Esc en burbuja sobre `document`: después de
  // quien ya lo atendió (React, menús) y ANTES de los de `window`, entre ellos el doble Esc del chat que rebobina el
  // último turno; por eso, si Esc es nuestro, no sigue (esconder a Levy + volver no puede rebobinar nada).
  useEffect(() => {
    const focoEnLevy = () => !!document.activeElement && !!main?.contains(document.activeElement)
    const captura = (e: KeyboardEvent) => {
      const a = accionDeTecla(e, { enfoque: true, focoEnLevy: focoEnLevy() })
      if (a !== 'levy' && a !== 'alternar') return
      e.preventDefault(); e.stopImmediatePropagation()
      if (e.repeat) return
      if (a === 'levy') alternarLevy(); else salir()
    }
    const burbuja = (e: KeyboardEvent) => {
      // Esc cierra lo más interno (Linear, Figma): con el foco dentro de la pestaña (lienzo, calendario, una lista) ese
      // Esc es suyo (deseleccionar, cerrar un popover) y además suelta el foco, lo haya atendido otro o no; así el
      // siguiente Esc siempre vuelve.
      if (e.key === 'Escape' && !focoEnLevy() && document.activeElement?.closest('[data-panel-derecho] [role=tabpanel]')) {
        setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 0); return
      }
      const a = accionDeTecla(e, { enfoque: true, focoEnLevy: focoEnLevy() })
      if (a !== 'cerrar-levy' && a !== 'salir') return
      e.preventDefault(); e.stopImmediatePropagation()
      if (a === 'cerrar-levy') useLayoutStore.getState().setLevyFlotante(false); else salir()
    }
    window.addEventListener('keydown', captura, true); document.addEventListener('keydown', burbuja)
    return () => { window.removeEventListener('keydown', captura, true); document.removeEventListener('keydown', burbuja) }
  }, [main])

  const salir = () => volver(router.push)

  return <>
    {!levy && <button className={s.levyBoton} onClick={() => useLayoutStore.getState().setLevyFlotante(true)} data-testid="levy-flotante-abrir"
      title="Hablar con Levy sin salir (⌘J)" aria-label="Hablar con Levy">
      <MessageCircle size={16} aria-hidden /><span>Levy</span><kbd>⌘J</kbd>
    </button>}
    {main && createPortal(<CabeceraLevy onVolver={salir} />, main)}
  </>
}

/** Cabecera del cajón: de qué conversación es, volver al chat completo y esconderlo. Vive dentro de `[data-shell-main]`. */
function CabeceraLevy({ onVolver }: { onVolver: () => void }) {
  const conversacion = useConversacionActiva()
  return <div className={s.levyCabecera} data-cabecera-levy>
    <MessageCircle size={14} aria-hidden />
    <b>Levy</b>{conversacion && <TituloHilo id={conversacion} />}
    <button className={s.levyAccion} onClick={onVolver} title="Volver al chat completo (Esc · ⌘.)" data-testid="levy-flotante-volver">Chat completo</button>
    <button className={s.icono} onClick={() => useLayoutStore.getState().setLevyFlotante(false)} title="Esconder a Levy (⌘J · Esc)" aria-label="Esconder a Levy" data-testid="levy-flotante-cerrar"><X size={14} /></button>
  </div>
}

function TituloHilo({ id }: { id: string }) {
  const titulo = useTituloConversacion(id)
  return <span title={titulo}>{titulo}</span>
}

/** «Volver», arriba a la izquierda del panel en pantalla completa: siempre a la vista, al mismo lugar de antes. */
export function BotonVolver() {
  const router = useRouter()
  return <button className={s.volver} onClick={() => volver(router.push)} data-testid="pantalla-completa-volver" title="Volver al chat (Esc · ⌘.)">
    <ArrowLeft size={14} aria-hidden /><span>Volver</span><kbd>Esc</kbd>
  </button>
}
