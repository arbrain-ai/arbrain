'use client'
/**
 * Una ventana del panel (segunda pantalla). 1 oct 2026: cada pestaña salía sola a una ventanita.
 * 5 oct 2026 (Daniel: «se ve como una mini aplicación abierta esa pestaña afuera»): la ventana es otra
 * tira de pestañas igual a la del panel principal, a tamaño completo. `/panel?ventana=N` pinta las pestañas
 * que viven en la ventana N con la MISMA `Contenido` del panel (tira, «+», anclar, arrastrar, cuerpo de cada
 * vista): se arrastran entre ventanas, de vuelta al panel o fuera para abrir otra ventana. Sin pestañas, se
 * cierra sola. Canal, vida y lugar recordado: ventanas.ts.
 *
 * Las rutas de antes (`/panel?pestana=…`, `/panel?vista=…`, una ventana por pestaña) ya no abren nada: su
 * pestaña vuelve al panel principal y la ventana se cierra.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { alternarPantallaCompleta } from './PantallaCompleta'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { titulo } from '../Cabina'
import { soyVentana, usePanelFijadas } from './fijadas'
import { nombreVentana, tiraDe, todasLasClaves, ventanaDeParametro } from './pestanas-fuera'
import { atenderVentana, cerrarEstaVentana, devolverAlPanel, seguirLlegadas, useVentanas, vidaDeVentana } from './ventanas'
import { Contenido } from './PanelDerecho'
import { useAtajosCtrl } from '@/shared/hooks/useAtajosCtrl'
import { claveZoomVentana, ZoomController } from '@/shared/components/ZoomController'
import s from './panel.module.css'

/**
 * Botones de la cabecera: en la columna, pantalla completa; en una ventana aparte dividida, esconder y mostrar su
 * columna derecha (⌘B). 9 oct 2026 (Daniel: «no me gustó esa experiencia… jamás la voy a usar»): antes este botón
 * devolvía todas las pestañas al panel principal; eso queda en el clic derecho de una pestaña y en ⌘⌥B.
 */
export function ControlesPanel({ modo, columna }: { modo: 'lateral' | 'ventana'; onCerrar?: () => void; ventana?: string; columna?: { oculta: boolean; alternar: () => void } }) {
  const error = useVentanas(st => st.error)
  const enfoque = useLayoutStore(st => st.enfoquePanel)
  if (modo === 'ventana') return <>
    {columna && <button className={s.icono} onClick={columna.alternar} data-testid="alternar-columna" aria-pressed={!columna.oculta}
      title={`${columna.oculta ? 'Mostrar' : 'Esconder'} la columna lateral (⌘B) · devolver las pestañas al panel principal: clic derecho en una pestaña (⌘⌥B)`}
      aria-label={columna.oculta ? 'Mostrar la columna lateral' : 'Esconder la columna lateral'}>
      {columna.oculta ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}</button>}
    {error && <p className={s.errorVentana} role="alert">{error}</p>}
  </>
  return <>
    {modo === 'lateral' && <button className={s.icono} onClick={alternarPantallaCompleta} data-testid="enfoque-panel" aria-pressed={enfoque}
      title={enfoque ? 'Volver (Esc · ⌘.)' : 'Pantalla completa (⌘.) · Levy sigue a la mano con ⌘J'} aria-label={enfoque ? 'Volver' : 'Pantalla completa'}>
      {enfoque ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
    {error && modo === 'lateral' && <p className={s.errorVentana} role="alert">{error}</p>}
  </>
}

export function VentanaPanel() {
  const params = useSearchParams()
  const id = ventanaDeParametro(params.get('ventana'))
  if (!id) return <VentanaVieja />
  return <VentanaConTira id={id} />
}

function VentanaConTira({ id }: { id: string }) {
  soyVentana(id)
  const cargar = usePanelFijadas(st => st.cargar)
  useEffect(() => {
    cargar()
    const fin = [vidaDeVentana(id), atenderVentana(), seguirLlegadas()]
    // ⌘⌥B: todas sus pestañas de vuelta al panel principal (la ventana se cierra sola).
    const k = (e: KeyboardEvent) => { if (e.code === 'KeyB' && e.metaKey && e.altKey && !e.ctrlKey) { e.preventDefault(); if (!e.repeat) devolverAlPanel(id) } }
    window.addEventListener('keydown', k)
    return () => { fin.forEach(f => f()); window.removeEventListener('keydown', k) }
  }, [cargar, id])
  useTituloDeVentana(id)
  // Ctrl+Q cierra la pestaña a la vista en esta ventana; Ctrl+D/X/W/M son del panel principal.
  useAtajosCtrl({ soloCerrar: true })
  // ⌘+ ⌘− ⌘0, ⌘+rueda y pellizco: zoom propio de esta ventana, recordado (5 oct 2026). Dentro de un lienzo o de un
  // documento con zoom de pestaña, gana el de adentro.
  return <div className={s.ventana} data-panel-derecho>
    <ZoomController clave={claveZoomVentana(id)} rueda />
    <Contenido modo="ventana" ventana={id} onCerrar={() => devolverAlPanel(id)} />
  </div>
}

/** El título de la ventana sigue a la pestaña a la vista, como Chrome. */
function useTituloDeVentana(id: string) {
  const nombre = usePanelFijadas(st => {
    const tira = tiraDe(todasLasClaves(st.orden, st.taller), st.enVentana, id)
    const a = tira.includes(st.activa) ? st.activa : tira[0]
    if (!a) return null
    if (a === 'tareas') return 'Tareas'
    if (a === 'taller') return 'Taller'
    const f = st.fijadas.find(x => x.id === a)
    return f ? titulo(f.input) : null
  })
  useEffect(() => {
    const t = `${nombre ?? nombreVentana(id)} · Arbrain`
    const poner = () => { if (document.title !== t) document.title = t }
    poner()
    // El título de la ruta llega con la hidratación: se reafirma.
    const r = setInterval(poner, 2000)
    return () => clearInterval(r)
  }, [nombre, id])
}

/** Ventana de antes del 5 oct (una por pestaña): su pestaña ya volvió al panel principal; se cierra. */
function VentanaVieja() {
  const params = useSearchParams()
  useEffect(() => {
    // En el escritorio la ventana principal la cierra al arrancar; en el navegador se cierra (o vuelve al chat) aquí.
    if (isDesktopRuntime()) return
    const t = setTimeout(() => { void cerrarEstaVentana('') }, 1500)
    return () => clearTimeout(t)
  }, [params])
  return <p className={s.calma}>Esta ventana es de la versión anterior. Sus pestañas ya están en el panel principal; arrástralas fuera para abrir una ventana nueva.</p>
}
