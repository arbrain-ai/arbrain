'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { curvaCasa, destinoAlSoltar, destinoAlSoltarToque, ejeDeRueda, ejeDeToque, recentrar, velocidad } from './carril-logica'
import c from './carril.module.css'

/** Asentar la hoja al soltar: lo que tarda la curva de la casa en llegar (la entrada de escena usa 340 ms). */
const ASENTAR_MS = 380
/** Sin eventos de rueda durante este tiempo, el gesto (con su inercia del sistema) terminó y se suelta. */
const QUIETO_MS = 130
/** Tras asentarse, las hojas vecinas se retiran: una sola hoja viva mientras no se desliza. */
const RETIRO_MS = 900

const prefiereQuieto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** ¿El gesto empezó dentro de algo que se desplaza en horizontal por su cuenta? Entonces es suyo, no del carril. */
function desplazableEnX(objetivo: EventTarget | null, hasta: HTMLElement) {
  for (let el = objetivo as HTMLElement | null; el && el !== hasta; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}

/**
 * El carril de días (5 oct 2026): la hoja de hoy entre la de ayer y la de mañana, en una pista que sigue al dedo o al
 * trackpad. La inercia es la del sistema (macOS sigue mandando rueda tras levantar los dedos) o, en el teléfono, la
 * velocidad al soltar; al quedarse quieta, la pista se asienta en la hoja más cercana con la curva de la casa.
 * Cruzar una hoja entera recentra la pista sin cortar el gesto: se pueden pasar varios días seguidos.
 *
 * Las hojas se identifican por `clave`: la vecina que entra ES la misma hoja que queda al centro (React no la remonta),
 * así nada vuelve a animar su entrada. Las vecinas solo existen mientras se desliza.
 */
export function Carril({ fecha, clave, mover, onIr, render, etiqueta }: {
  fecha: Date
  clave: (f: Date) => string
  mover: (f: Date, pasos: number) => Date
  /** El centro cambió por el gesto (el calendario sigue con esa fecha: barra, URL, lectura). */
  onIr: (f: Date) => void
  render: (f: Date, central: boolean) => ReactNode
  etiqueta: string
}) {
  const marco = useRef<HTMLDivElement>(null), pista = useRef<HTMLDivElement>(null)
  const [centro, setCentro] = useState(fecha)
  const centroRef = useRef(centro)
  const [vecinas, setVecinas] = useState(false)
  const vecinasRef = useRef(false)
  const desplazamiento = useRef(0), cuadro = useRef(0)
  const retiro = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Hojas que nacieron como vecinas: llegan quietas (sin la subida de entrada) y así se quedan al pasar al centro.
  const quietas = useRef(new Set<string>())
  const deps = useRef({ clave, mover, onIr }); deps.current = { clave, mover, onIr }

  const ancho = () => marco.current?.clientWidth ?? 0
  const pintar = () => { const p = pista.current; if (p) p.style.transform = desplazamiento.current ? `translate3d(${desplazamiento.current}px,0,0)` : '' }
  const conVecinas = () => {
    clearTimeout(retiro.current)
    if (vecinasRef.current) return
    vecinasRef.current = true
    flushSync(() => setVecinas(true))
  }
  const retirarLuego = () => {
    clearTimeout(retiro.current)
    retiro.current = setTimeout(() => { vecinasRef.current = false; setVecinas(false) }, RETIRO_MS)
  }
  /** Mueve el centro `pasos` hojas sin que se vea un salto (el desplazamiento ya viene compensado). */
  const avanzar = (pasos: number, avisar = true) => {
    const nuevo = deps.current.mover(centroRef.current, pasos)
    centroRef.current = nuevo
    flushSync(() => setCentro(nuevo))
    if (avisar) deps.current.onIr(nuevo)
  }
  const detener = () => { cancelAnimationFrame(cuadro.current); cuadro.current = 0 }
  /** Asienta la pista en `hasta` con la curva de la casa; interrumpible por un gesto nuevo. */
  const asentar = (hasta: number, alFinal: () => void) => {
    detener()
    const desde = desplazamiento.current
    if (prefiereQuieto() || Math.abs(hasta - desde) < 0.5) { desplazamiento.current = hasta; pintar(); alFinal(); return }
    const t0 = performance.now()
    const paso = (t: number) => {
      const k = curvaCasa(Math.min(1, (t - t0) / ASENTAR_MS))
      desplazamiento.current = desde + (hasta - desde) * k; pintar()
      if (k < 1) cuadro.current = requestAnimationFrame(paso)
      else { cuadro.current = 0; alFinal() }
    }
    cuadro.current = requestAnimationFrame(paso)
  }
  const arrastrar = (d: number) => {
    detener(); conVecinas()
    const r = recentrar(desplazamiento.current + d, ancho())
    desplazamiento.current = r.desplazamiento
    if (r.pasos) avanzar(r.pasos)
    pintar()
  }
  /** `toque`: el dedo del teléfono cruza a los 60 px o con un deslizamiento rápido; la rueda y el trackpad, a media hoja. */
  const soltar = (v: number, toque = false) => {
    const w = ancho(), p = (toque ? destinoAlSoltarToque : destinoAlSoltar)(desplazamiento.current, w, v)
    asentar(-p * w, () => {
      if (p) { desplazamiento.current = 0; avanzar(p); pintar() }
      retirarLuego()
    })
  }
  const acciones = useRef({ arrastrar, soltar }); acciones.current = { arrastrar, soltar }

  // La fecha cambió desde fuera (Hoy, ‹ ›, flechas, Ir a fecha): la hoja nueva entra deslizándose desde su lado.
  useLayoutEffect(() => {
    if (deps.current.clave(fecha) === deps.current.clave(centroRef.current)) return
    const dir = fecha.getTime() > centroRef.current.getTime() ? 1 : -1
    const vecina = deps.current.clave(deps.current.mover(centroRef.current, dir)) === deps.current.clave(fecha)
    detener()
    centroRef.current = fecha
    if (prefiereQuieto()) { desplazamiento.current = 0; setCentro(fecha); pintar(); return }
    vecinasRef.current = true; clearTimeout(retiro.current)
    flushSync(() => { setVecinas(true); setCentro(fecha) })
    // La hoja nueva se pinta donde estaba (a un lado) y la pista la trae al centro. Lejos, entra desde un tercio.
    desplazamiento.current = dir * ancho() * (vecina ? 1 : .35); pintar()
    asentar(0, retirarLuego)
  }, [fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trackpad y rueda horizontal (o mayúsculas + rueda). El eje se decide al empezar el gesto y se respeta hasta que termina.
  useEffect(() => {
    const el = marco.current
    if (!el) return
    let eje: 'x' | 'y' | null = null, ultimo = 0, muestras: { t: number; d: number }[] = []
    let quieto: ReturnType<typeof setTimeout> | undefined
    const rueda = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || (e.target as HTMLElement | null)?.closest?.('input,textarea,select,[role="dialog"]')) return
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k, dy = (e.shiftKey ? 0 : e.deltaY) * k
      const t = performance.now()
      if (t - ultimo > 220) { eje = null; muestras = [] }
      ultimo = t
      if (!eje) { eje = ejeDeRueda(dx, dy); if (eje === 'x' && desplazableEnX(e.target, el)) eje = 'y' }
      if (eje !== 'x') return
      e.preventDefault()
      acciones.current.arrastrar(-dx)
      muestras.push({ t, d: -dx }); if (muestras.length > 12) muestras.shift()
      clearTimeout(quieto)
      quieto = setTimeout(() => { eje = null; acciones.current.soltar(velocidad(muestras, performance.now(), 160)); muestras = [] }, QUIETO_MS)
    }
    // El dedo en el teléfono: la hoja lo sigue 1:1; al soltar cruza pasados 60 px o con un deslizamiento rápido (carril-logica.ts).
    let x0 = 0, y0 = 0, xAnt = 0, ejeT: 'x' | 'y' | null = null, activo = false, toques: { t: number; d: number }[] = []
    const ignora = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[role="dialog"]') || desplazableEnX(t, el)
    const inicio = (e: TouchEvent) => {
      activo = e.touches.length === 1 && !ignora(e.target)
      if (!activo) return
      x0 = xAnt = e.touches[0].clientX; y0 = e.touches[0].clientY; ejeT = null; toques = []
    }
    const mueve = (e: TouchEvent) => {
      if (!activo) return
      const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0
      // Al decidir que es horizontal, la hoja se pone donde está el dedo (los px de la decisión cuentan: 60 px de dedo = 60 px de hoja).
      if (!ejeT) { ejeT = ejeDeToque(mx, my); if (ejeT === 'x') xAnt = x0 }
      if (ejeT !== 'x') return
      acciones.current.arrastrar(x - xAnt)
      toques.push({ t: performance.now(), d: x - xAnt }); if (toques.length > 12) toques.shift()
      xAnt = x
    }
    const fin = () => {
      if (!activo) return
      activo = false
      if (ejeT === 'x') acciones.current.soltar(velocidad(toques, performance.now()), true)
    }
    el.addEventListener('wheel', rueda, { passive: false })
    el.addEventListener('touchstart', inicio, { passive: true })
    el.addEventListener('touchmove', mueve, { passive: true })
    el.addEventListener('touchend', fin); el.addEventListener('touchcancel', fin)
    return () => {
      clearTimeout(quieto)
      el.removeEventListener('wheel', rueda); el.removeEventListener('touchstart', inicio); el.removeEventListener('touchmove', mueve)
      el.removeEventListener('touchend', fin); el.removeEventListener('touchcancel', fin)
    }
  }, [])
  useEffect(() => () => { cancelAnimationFrame(cuadro.current); clearTimeout(retiro.current) }, [])

  const hojas = vecinas ? [-1, 0, 1] : [0]
  return <div ref={marco} className={c.marco} data-carril role="region" aria-roledescription="carrusel" aria-label={etiqueta}>
    <div ref={pista} className={c.pista}>
      {hojas.map(n => {
        const f = n ? mover(centro, n) : centro, k = clave(f)
        if (n) quietas.current.add(k)
        return <div key={k} className={c.hoja} data-lado={n || undefined} data-quieta={quietas.current.has(k) || undefined}
          aria-hidden={n ? true : undefined} inert={n ? true : undefined}>{render(f, n === 0)}</div>
      })}
    </div>
  </div>
}
