'use client'
/**
 * La segunda fila del teléfono (6 oct 2026, firmado por Daniel): bajo la cabecera, las pestañas abiertas
 * del panel (las mismas del escritorio, de `usePanelFijadas`, con su orden y su estado) y el «+» al final, que abre el
 * menú de secciones. Tocar una pestaña abre su vista a pantalla completa (PanelDerecho.tsx, `PestanaTelefono`); mantenerla
 * presionada la levanta: soltarla quieta ofrece «Cerrar», arrastrarla a los lados la acomoda; la que se ve lleva una × sutil.
 * 10 oct 2026 (Daniel: «una sola lógica en todo el teléfono»): se ve SIEMPRE fuera del chat, en cualquier pestaña o sección,
 * con todas las pestañas abiertas, el Taller incluido. En el chat no (corrección de la misma noche).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Bookmark, BookmarkCheck, Hammer, ListChecks, X } from 'lucide-react'
import { aFijo, zoomUI } from '@/shared/lib/zoom-ui'
import { clavesDe, guardable, usePanelFijadas, type Fijada } from './fijadas'
import { desplazamientos } from './arrastre-geom'
import { destinoEnFila, indiceParaReordenar, velocidadAutoScroll } from './fila-arrastre'
import { useGuardado } from './archivero'
import { IconoVista, MenuSecciones } from './Secciones'
import { nombrePestana } from './nombre-pestana'
import { TALLER, TAREAS } from './pestanas-fuera'
import { LARGA_MOVIMIENTO, LARGA_MS, useVistaTelefono, verPestanaEnTelefono, volverALevy } from './telefono-pestanas'
import s from './panel.module.css'
import f from './fila-pestanas.module.css'

/** Cierra una pestaña desde el teléfono. Si era la que se veía, se vuelve a Levy (el chat, donde estaba). */
export function cerrarPestanaEnTelefono(clave: string, estabaViendola: boolean) {
  usePanelFijadas.getState().cerrar(clave)
  if (estabaViendola) volverALevy()
}

export function FilaPestanas() {
  const pathname = usePathname()
  const { vista, claves, fijadas } = useVistaTelefono()
  const ancladas = usePanelFijadas(st => st.ancladas)
  const tiraRef = useRef<HTMLElement>(null)
  const [menu, setMenu] = useState<{ clave: string; x: number; y: number } | null>(null)
  const activa = vista.tipo === 'pestana' ? vista.clave : null
  // Mantener presionado (10 oct 2026, estilo iOS): el temporizador nace al tocar y muere si el dedo se mueve antes (era un
  // desplazamiento de la tira) o se suelta. Al cumplirse LEVANTA la pestaña: soltarla sin moverla abre el menú de siempre;
  // arrastrarla a los lados la acomoda en vivo y al soltar guarda el orden (el mismo acomodo global del escritorio).
  const largo = useRef<Largo | null>(null)
  const cancelar = () => { const l = largo.current; if (!l) return; clearTimeout(l.timer); if (l.raf) cancelAnimationFrame(l.raf); if (l.arrastre) l.arrastre.limpiar() }
  useEffect(() => cancelar, [])
  const oculta = vista.tipo === 'chat' && pathname === '/chat'
  // Con una pestaña levantada la tira no se desplaza con el dedo (solo el auto-desplazamiento de los bordes). iOS solo lo
  // respeta con un `touchmove` no pasivo; el resto del tiempo la tira se desliza como siempre.
  useEffect(() => {
    const tira = tiraRef.current
    if (oculta || !tira) return
    const alTocarMover = (e: TouchEvent) => { if (largo.current?.disparado && e.cancelable) e.preventDefault() }
    tira.addEventListener('touchmove', alTocarMover, { passive: false })
    return () => tira.removeEventListener('touchmove', alTocarMover)
  }, [oculta])
  // La pestaña a la vista siempre se ve en la fila (se abrió desde el «+» o por Levy y quedó fuera del ancho).
  useLayoutEffect(() => { if (activa) tiraRef.current?.querySelector(`[data-clave="${CSS.escape(activa)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [activa, claves.length])
  // 10 oct 2026, noche (Daniel: «en la vista de chat tengo el header que dice acompañamiento y taller… no debería ir aquí»):
  // la fila es la segunda cabecera DEL PANEL. En el chat no se ve; en cualquier pestaña o sección se ve SIEMPRE, también
  // con una sola pestaña (el lienzo la escondía con la regla de «una sola»).
  if (oculta) return null

  const alBajar = (clave: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    cancelar()
    const boton = e.currentTarget, id = e.pointerId
    const estado: Largo = { x0: e.clientX, y0: e.clientY, x: e.clientX, disparado: false, raf: 0, arrastre: null, timer: setTimeout(() => {
      estado.disparado = true
      const tira = tiraRef.current, propia = boton.parentElement
      if (!tira || !propia) return
      try { boton.setPointerCapture(id) } catch { /* el dedo ya se fue */ }
      navigator.vibrate?.(12)
      estado.arrastre = levantar(tira, propia, clave === TALLER, estado.x0)
    }, LARGA_MS) }
    largo.current = estado
  }
  const alMover = (e: React.PointerEvent) => {
    const l = largo.current
    if (!l) return
    l.x = e.clientX
    if (!l.disparado) { if (Math.hypot(e.clientX - l.x0, e.clientY - l.y0) > LARGA_MOVIMIENTO) cancelar(); return }
    const a = l.arrastre
    if (!a || a.fija) return
    if (!a.movio && Math.abs(e.clientX - l.x0) <= LARGA_MOVIMIENTO) return
    a.movio = true
    a.seguir(l.x)
    // Junto a un borde la tira se desplaza sola mientras el dedo siga ahí.
    if (!l.raf) {
      const paso = () => {
        const actual = largo.current
        if (actual !== l || !l.arrastre) return
        const r = tiraRef.current?.getBoundingClientRect(), v = r ? velocidadAutoScroll(l.x, r.left, r.right) : 0
        if (!v || !tiraRef.current) { l.raf = 0; return }
        const antes = tiraRef.current.scrollLeft
        tiraRef.current.scrollLeft = Math.max(0, Math.min(l.arrastre.maxScroll, antes + v))
        if (tiraRef.current.scrollLeft === antes) { l.raf = 0; return }
        l.arrastre.seguir(l.x)
        l.raf = requestAnimationFrame(paso)
      }
      l.raf = requestAnimationFrame(paso)
    }
  }
  const alSoltar = (clave: string) => (e: React.PointerEvent) => {
    const l = largo.current
    if (!l) return
    clearTimeout(l.timer)
    if (l.raf) { cancelAnimationFrame(l.raf); l.raf = 0 }
    if (!l.disparado) return
    const a = l.arrastre
    l.arrastre = null
    if (!a) return
    if (!a.movio) {
      // Mantuvo y soltó sin moverse: el menú de siempre.
      a.limpiar()
      const caja = e.currentTarget.getBoundingClientRect()
      setMenu({ clave, x: caja.left, y: caja.bottom })
      return
    }
    const destino = a.destino, desde = a.desde
    a.limpiar()
    if (destino !== desde) {
      const st = usePanelFijadas.getState()
      st.reordenar(clave, indiceParaReordenar(st.orden, clavesDe(st), clave, destino))
    }
  }
  const alSalir = () => { if (!largo.current?.disparado) cancelar() }
  const alAnular = () => { cancelar(); largo.current = null }
  const alTocar = (clave: string) => (e: React.MouseEvent) => {
    // El toque que cierra una pulsación larga (menú o arrastre) no abre la pestaña.
    if (largo.current?.disparado) { largo.current = null; e.preventDefault(); return }
    verPestanaEnTelefono(clave)
  }

  return <div className="relative z-10 flex h-10 shrink-0 items-center gap-1 border-b border-border-subtle bg-surface pl-2.5 pr-2" data-fila-pestanas>
    <nav ref={tiraRef} className={f.tira} role="tablist" aria-label="Pestañas abiertas">
      {claves.map(clave => {
        const fijada = fijadas.find(x => x.id === clave)
        if (clave !== TAREAS && clave !== TALLER && !fijada) return null
        const nombre = clave === TAREAS ? 'Tareas' : clave === TALLER ? 'Taller' : nombrePestana(fijada!)
        const anclada = ancladas.includes(clave)
        // 6 oct 2026 (Daniel: «no hay forma de cerrar los paneles desde el móvil, se acumulan»): la pestaña a la vista lleva
        // una × sutil; al cerrarla se ve la vecina (sin pestañas, de vuelta al chat). Las demás: tocarlas primero o mantener.
        const conX = activa === clave && !anclada
        return <span key={clave} className={f.envoltura} data-con-x={conX || undefined} data-anclada={anclada || undefined} data-fija={clave === TALLER || undefined}><button role="tab" className={f.pestana} data-clave={clave} data-anclada={anclada || undefined}
          aria-selected={activa === clave} aria-label={anclada ? `${nombre} (fijada)` : undefined}
          onPointerDown={alBajar(clave)} onPointerMove={alMover} onPointerUp={alSoltar(clave)} onPointerCancel={alAnular} onPointerLeave={alSalir}
          onClick={alTocar(clave)} onContextMenu={e => e.preventDefault()}>
          {clave === TAREAS ? <ListChecks size={14} aria-hidden /> : clave === TALLER ? <Hammer size={13} aria-hidden /> : <IconoVista vista={fijada!.input.vista} size={13} />}
          <span>{nombre}</span>
        </button>
        {conX && <button className={f.cerrar} aria-label={`Cerrar ${nombre}`} title="Cerrar"
          onClick={() => usePanelFijadas.getState().cerrar(clave)}><X size={12} strokeWidth={2.2} aria-hidden /></button>}
        </span>
      })}
    </nav>
    <div className={f.mas}><MenuSecciones /></div>
    {menu && <MenuMantener {...menu} fijada={fijadas.find(x => x.id === menu.clave)} onCerrar={() => { cerrarPestanaEnTelefono(menu.clave, activa === menu.clave); setMenu(null) }} onListo={() => setMenu(null)} />}
  </div>
}

type Arrastre = { desde: number; destino: number; movio: boolean; fija: boolean; maxScroll: number; seguir: (x: number) => void; limpiar: () => void }
type Largo = { x0: number; y0: number; x: number; disparado: boolean; timer: ReturnType<typeof setTimeout>; raf: number; arrastre: Arrastre | null }

/**
 * Levanta una pestaña de la fila (sus envolturas son hijas directas de la tira). `seguir(x)` la lleva bajo el dedo y aparta a
 * las vecinas hacia el lugar donde caería; todo se mide en coordenadas del CONTENIDO de la tira, así el auto-desplazamiento
 * no descuadra nada. El Taller (`fija`) se levanta para su menú, pero no se mueve: vive fijo a la derecha, como en el escritorio.
 */
function levantar(tira: HTMLElement, propia: HTMLElement, fija: boolean, xDedo: number): Arrastre {
  const enContenido = (x: number) => x - tira.getBoundingClientRect().left + tira.scrollLeft
  const movibles = Array.from(tira.children).filter((h): h is HTMLElement => h instanceof HTMLElement && h.dataset.fija == null)
  const desde = movibles.indexOf(propia)
  const base = tira.getBoundingClientRect().left - tira.scrollLeft
  const cajas = movibles.map(h => { const r = h.getBoundingClientRect(); return { left: r.left - base, width: r.width } })
  const centros = cajas.map(c => c.left + c.width / 2)
  const anclada = propia.hasAttribute('data-anclada')
  const ancladasSinElla = movibles.filter(h => h !== propia && h.hasAttribute('data-anclada')).length
  const x0 = enContenido(xDedo)
  // La levantada no sale del tramo de las pestañas (si no, agrandaría la tira y el auto-desplazamiento no tendría fin).
  const ultima = cajas.at(-1), suya = cajas[desde]
  const minDx = cajas.length && suya ? cajas[0].left - suya.left : 0
  const maxDx = ultima && suya ? ultima.left + ultima.width - (suya.left + suya.width) : 0
  const a: Arrastre = {
    desde, destino: desde, movio: false, fija: fija || desde < 0, maxScroll: Math.max(0, tira.scrollWidth - tira.clientWidth),
    seguir: x => {
      const d = Math.max(minDx, Math.min(maxDx, enContenido(x) - x0))
      a.destino = destinoEnFila(centros, suya.left + suya.width / 2 + d, desde, anclada, ancladasSinElla)
      const dx = desplazamientos(cajas, desde, a.destino)
      movibles.forEach((h, i) => { if (h !== propia) h.style.transform = dx[i] ? `translateX(${dx[i]}px)` : '' })
      propia.style.transform = `translateX(${Math.round(d)}px) scale(1.08)`
    },
    limpiar: () => {
      // Sin transición: el orden nuevo y las posiciones sin desplazar se pintan en el mismo cuadro.
      tira.removeAttribute('data-arrastrando'); propia.removeAttribute('data-levantada')
      movibles.forEach(h => { h.style.transform = '' }); propia.style.transform = ''
    },
  }
  tira.setAttribute('data-arrastrando', ''); propia.setAttribute('data-levantada', '')
  return a
}

/** «Cerrar» (y, en lo que generó Levy, Guardar) al mantener presionada una pestaña o, con una sola, al tocar el título. */
export function MenuMantener({ x, y, fijada, onCerrar, onListo }: { x: number; y: number; fijada?: Fijada; onCerrar: () => void; onListo: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onListo() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onListo() } }
    window.addEventListener('pointerdown', fuera, true); window.addEventListener('keydown', esc, true); window.addEventListener('blur', onListo)
    return () => { window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', esc, true); window.removeEventListener('blur', onListo) }
  }, [onListo])
  const z = zoomUI(), ancho = 190
  const left = aFijo(Math.max(8, Math.min(x, window.innerWidth - ancho * z - 8)), z), top = aFijo(y + 6, z)
  return createPortal(<div ref={ref} className={`${s.menuPestana} ${f.menu}`} style={{ left, top, width: ancho }} role="menu" aria-label="Pestaña">
    {fijada && guardable(fijada) && <ItemGuardar f={fijada} onListo={onListo} />}
    <button role="menuitem" onClick={onCerrar}><X size={14} aria-hidden />Cerrar</button>
  </div>, document.body)
}

function ItemGuardar({ f: fijada, onListo }: { f: Fijada; onListo: () => void }) {
  const { guardada, alternar, ocupado } = useGuardado(fijada)
  return <button role="menuitem" disabled={ocupado} onClick={() => { void alternar(); onListo() }}>
    {guardada ? <BookmarkCheck size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}{guardada ? 'Quitar de Guardadas' : 'Guardar'}
  </button>
}
