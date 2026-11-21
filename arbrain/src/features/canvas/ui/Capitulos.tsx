'use client'

/**
 * Canvas v4 — el lienzo leído por capítulos (6 oct 2026). Lo puro vive en `layout/capitulos.ts`.
 *
 * Dos piezas:
 *   · EL VELO. Con un capítulo abierto, lo demás se aquieta bajo el color del lienzo y el capítulo queda en una
 *     ventana con un filo de luz que aparece una vez. Es del MUNDO, no de la pantalla: sigue a la cámara cuadro a
 *     cuadro, y al cambiar de capítulo la ventana viaja con el vuelo, así que la luz llega junto con la mirada.
 *     No recibe el puntero: debajo, el lienzo sigue siendo el lienzo.
 *   · EL ÍNDICE, en dos piezas desde el 13 nov 2026 (ver `Indice`): la BARRA de abajo con solo los temas con
 *     nombre (`layout/capitulos.ts › temasDe`; tocar uno vuela al tema entero y el velo lo enmarca; tocar el abierto
 *     vuelve a la vista completa) y el MINIPANEL abajo a la derecha con los capítulos por su nombre, agrupados por
 *     tema, el tema donde estás abierto y los demás plegados. Tocar un capítulo hace el mismo vuelo de siempre; un
 *     punto de oro marca dónde estás (oro para el ahora). Antes (6 oct a 13 nov) fueron números en fila: Daniel,
 *     «es difícil con tantos botones, además no sé ni qué dicen!». Sin temas, solo el panel.
 *
 * Teclado (en la Pizarra): ← → el capítulo vecino, 1–9 uno directo (con temas: el tema, o el capítulo del tema
 * donde estás, con el número que el panel le pone a la derecha), ↓ ↑ bajar y subir dentro del capítulo, Esc sube un nivel (capítulo → tema → vista completa).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Camera } from '../model/element'
import type { Theme } from '../theme/tokens'
import type { Viewport } from '../render/viewport'
import { worldToScreen } from '../render/viewport'
import type { CamaraViva } from './CamaraViva'
import type { Caja, Capitulo, Tema } from '../layout/capitulos'
import { suaveDoble } from '../input/navegacion'
import { mov, prefiereQuieto } from '@/shared/movimiento'
import { abiertosAlCambiar, alternar } from '../state/panel-capitulos'
import { tr, trn } from '@/shared/i18n'

/** Cuánto aire de mundo rodea al capítulo dentro de la ventana del velo. */
const AIRE = 28
const ORO = '#ff9101'

interface Props {
  capitulos: Capitulo[]
  /** El capítulo abierto; null = vista completa o un tema entero. */
  activo: number | null
  /** Los temas (`temasDe`); vacío = la tira de números. */
  temas: Tema[]
  /** El tema desplegado (índice en `temas`); con `activo` null, el velo enmarca el tema entero. */
  tema: number | null
  /** Lo que dura el vuelo en curso: la ventana del velo viaja en el mismo tiempo. */
  vueloMs: number
  theme: Theme
  camara: CamaraViva
  viewport: Viewport
  /** Angosto (la pestaña del panel): el índice solo con números. */
  angosto: boolean
  /** Pintar la barra de temas y el minipanel. Sin ellos queda el velo del capítulo abierto (las teclas siguen moviéndolo). */
  indice?: boolean
  /** La barra inferior está visible: el índice se sube sobre ella. */
  sobreBarra?: boolean
  /** El minipanel de capítulos está plegado a su botón (se recuerda por dispositivo: `state/panel-capitulos.ts`). */
  plegado: boolean
  onPlegar: (plegado: boolean) => void
  onIr: (i: number) => void
  /** Lienzo v17: el modo recorrido (el lienzo como clase) y su botón ▶ en el minipanel. */
  recorrido?: boolean
  onRecorrido?: () => void
  onTema: (k: number) => void
  onTodo: () => void
}

const lerp = (a: Caja, b: Caja, t: number): Caja => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
  width: a.width + (b.width - a.width) * t, height: a.height + (b.height - a.height) * t,
})

export function Capitulos(p: Props) {
  return (
    <>
      <Velo {...p} />
      {p.indice !== false && <Indice {...p} />}
    </>
  )
}

/**
 * La ventana se pinta con una sombra enorme alrededor de un div del tamaño del capítulo: un solo elemento, sin
 * máscaras, y el navegador lo compone en GPU. Se mueve tocando su estilo directo en cada cuadro de la cámara
 * (useCamara volvería a renderizar React 60 veces por segundo durante el vuelo).
 */
function Velo({ capitulos, activo, temas, tema, vueloMs, theme: t, camara, viewport }: Props) {
  const ventanaRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<Caja | null>(null)
  const animRef = useRef<{ de: Caja; a: Caja; t0: number; ms: number } | null>(null)
  const vpRef = useRef(viewport); vpRef.current = viewport
  // La ventana enmarca el capítulo abierto; sin capítulo, el tema desplegado entero.
  const destino = activo != null ? capitulos[activo]?.caja : tema != null ? temas[tema]?.caja : undefined
  const visible = !!destino
  const claveDestino = destino ? `${destino.x},${destino.y},${destino.width},${destino.height}` : ''

  const pintar = () => {
    const el = ventanaRef.current
    const anim = animRef.current
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.t0) / anim.ms)
      cajaRef.current = lerp(anim.de, anim.a, suaveDoble(k))
      if (k >= 1) animRef.current = null
    }
    const c = cajaRef.current
    if (!el || !c) return
    const cam: Camera = camara.ref.current
    const tl = worldToScreen({ x: c.x - AIRE, y: c.y - AIRE }, cam, vpRef.current)
    const w = (c.width + AIRE * 2) * cam.zoom, h = (c.height + AIRE * 2) * cam.zoom
    el.style.transform = `translate(${tl.x}px, ${tl.y}px)`
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    el.style.borderRadius = `${Math.max(6, Math.min(28, 36 * cam.zoom))}px`
  }

  // A dónde va la ventana. La primera vez aparece en su lugar; después viaja.
  useLayoutEffect(() => {
    if (!destino) return
    const ahora = cajaRef.current
    if (!ahora || prefiereQuieto() || vueloMs <= 0) { cajaRef.current = destino; animRef.current = null }
    else animRef.current = { de: ahora, a: destino, t0: performance.now(), ms: vueloMs }
    pintar()
    let raf = 0
    const paso = () => { pintar(); if (animRef.current) raf = requestAnimationFrame(paso) }
    if (animRef.current) raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDestino])

  useEffect(() => camara.suscribir(pintar))   // cada cuadro de cámara
  useLayoutEffect(pintar, [viewport])
  // Al cerrar, la ventana se queda donde estaba mientras el velo se desvanece; la próxima vez nace en su lugar.
  useEffect(() => { if (!visible) { const r = setTimeout(() => { cajaRef.current = null }, 600); return () => clearTimeout(r) } }, [visible])

  const oscuro = t.name === 'oscuro'
  const velo = `color-mix(in srgb, ${t.canvas} ${oscuro ? 74 : 80}%, transparent)`
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5,
      opacity: visible ? 1 : 0,
      transition: prefiereQuieto() ? 'none' : `opacity ${visible ? 520 : 360}ms var(--mov-curva, cubic-bezier(.16,1,.3,1))`,
    }}>
      <div ref={ventanaRef} data-capitulo-ventana style={{
        position: 'absolute', left: 0, top: 0, width: 0, height: 0, willChange: 'transform',
        // De arriba abajo: el filo de luz, su halo y el velo que cubre todo lo demás.
        boxShadow: [
          `0 0 0 1.5px color-mix(in srgb, ${t.accent} ${oscuro ? 45 : 30}%, transparent)`,
          `0 18px 70px 6px color-mix(in srgb, ${t.accent} ${oscuro ? 22 : 12}%, transparent)`,
          `0 0 0 400vmax ${velo}`,
        ].join(', '),
      }} />
    </div>
  )
}

/** Distancia de las barras flotantes al borde inferior: la zona segura del iPhone y, encima, un respiro mínimo. */
export const bordeInferior = (angosto: boolean) => angosto
  ? 'max(8px, calc(env(safe-area-inset-bottom, 0px) + 2px))'
  : 'calc(14px + env(safe-area-inset-bottom, 0px))'


/** Ancho del minipanel abierto (pantalla ancha). La Pizarra lo reserva al encuadrar un capítulo. */
export const ANCHO_PANEL = 268
/** Lo que ocupa el minipanel plegado: el botón chico. */
const ANCHO_PLEGADO = 124

function estilos(t: Theme) {
  const oscuro = t.name === 'oscuro'
  return {
    oscuro,
    curva: 'var(--mov-curva, cubic-bezier(.16,1,.3,1))',
    tenue: oscuro ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.05)',
    marcado: oscuro ? 'rgba(255,255,255,.11)' : 'rgba(15,15,25,.08)',
    tarjeta: {
      background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
      boxShadow: oscuro ? '0 6px 20px rgba(0,0,0,.45)' : '0 6px 20px rgba(15,15,25,.08)',
    },
  }
}

/** El punto de oro: dónde estás. Nace con escala. */
const Punto = ({ sel, curva, empuja = true }: { sel: boolean; curva: string; empuja?: boolean }) => (
  <span aria-hidden style={{
    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
    background: sel ? ORO : 'transparent', marginRight: empuja && !sel ? -13 : 0,
    transform: sel ? 'scale(1)' : 'scale(0)', transition: `transform 380ms ${curva}, margin 380ms ${curva}`,
  }} />
)

const IconoTodo = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    {[[1, 1], [8, 1], [1, 8], [8, 8]].map(([x, y]) =>
      <rect key={`${x}${y}`} x={x} y={y} width="5" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />)}
  </svg>
)

const IconoLista = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    {[2.5, 7, 11.5].map(y => <g key={y}>
      <circle cx="2" cy={y} r="1.1" fill="currentColor" />
      <path d={`M5 ${y}h7.5`} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </g>)}
  </svg>
)

const Chevron = ({ abierto, curva }: { abierto: boolean; curva: string }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden style={{
    flexShrink: 0, opacity: .7, transform: abierto ? 'rotate(90deg)' : 'none', transition: `transform 320ms ${curva}`,
  }}>
    <path d="M3.5 2 7 5 3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Las dos piezas de abajo (13 nov 2026, Daniel: «mi norte, sistema nervioso, oferta y el programa wow… pero esta sigue
 * sin gustarme, es difícil con tantos botones, además no sé ni qué dicen! … un minipanel a la derecha inferior»):
 *   · LA BARRA de abajo, centrada: solo los temas con nombre. Nada más: los números en fila y el botón extra de
 *     vista completa se fueron; tocar el tema abierto vuelve a la vista completa.
 *   · EL MINIPANEL, abajo a la derecha: la lista vertical de capítulos con su nombre, agrupada por tema. El tema donde
 *     estás va abierto y los demás plegados (se abren con su nombre); el capítulo actual lleva el punto de oro; el
 *     número va discreto a la derecha. Se pliega a un botón chico y lo recuerda.
 * Sin temas, no hay barra: el panel lista los capítulos y lleva el botón de la vista completa.
 */
function Indice(p: Props) {
  const { temas, angosto, sobreBarra, plegado } = p
  const enTemas = temas.length > 0
  const abajo = sobreBarra ? `calc(${angosto ? 50 : 46}px + ${bordeInferior(angosto)})` : bordeInferior(angosto)
  const margen = angosto ? 8 : 14
  // En pantalla ancha la barra se centra en lo que deja el panel; en el teléfono el panel sube sobre la barra.
  const reserva = angosto ? margen : margen + (plegado ? ANCHO_PLEGADO : ANCHO_PANEL) + 12
  return (
    <>
      {enTemas && <Barra {...p} abajo={abajo} izquierda={margen} derecha={reserva} />}
      <Panel {...p} abajo={angosto && enTemas ? `calc(46px + ${abajo})` : abajo} margen={margen} />
      <Anuncio {...p} />
    </>
  )
}

/** Para un lector de pantalla, lo abierto se anuncia al cambiar. */
function Anuncio({ capitulos, activo, temas, tema }: Props) {
  const nombre = activo != null && capitulos[activo]?.titulo ? tr(capitulos[activo].titulo) : null
  const tm = tema != null ? temas[tema] : null
  const texto = activo != null && nombre
    ? (tm ? tr('{tema}, capítulo {n} de {total}: {nombre}', { tema: tr(tm.nombre), n: tm.caps.indexOf(activo) + 1, total: tm.caps.length, nombre })
      : tr('Capítulo {n} de {total}: {nombre}', { n: activo + 1, total: capitulos.length, nombre }))
    : tm ? trn(tm.caps.length, '{tema}: {n} capítulo', '{tema}: {n} capítulos', { tema: tr(tm.nombre) }) : tr('Vista completa')
  return <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{texto}</span>
}

function Barra({ activo, temas, tema, theme: t, angosto, onTema, abajo, izquierda, derecha }:
  Props & { abajo: string; izquierda: number; derecha: number }) {
  const e = estilos(t)
  const boton = (sel: boolean, fondo = e.tenue) => ({
    display: 'flex', alignItems: 'center', gap: 7, height: angosto ? 28 : 30, padding: '0 11px', borderRadius: 9,
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
    background: sel ? fondo : 'transparent',
    color: sel ? t.text.title : t.text.caption,
    font: `${sel ? 700 : 600} 12.5px CanvasSans, system-ui`,
    transition: `background 240ms ${e.curva}, color 240ms ${e.curva}`,
  })
  return (
    <div style={{
      position: 'absolute', left: izquierda, right: derecha, bottom: abajo, zIndex: 30,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <nav aria-label={tr('Temas')} data-capitulos data-temas={temas.length} className={mov.entra} style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 2, padding: angosto ? 3 : 4, maxWidth: '100%',
        overflowX: 'auto', borderRadius: 12, ...e.tarjeta,
      }}>
        {temas.map((tm, k) => {
          const aqui = k === tema
          return (
            <button key={tm.nombre} data-tema={tm.nombre} data-abierto={aqui || undefined} onClick={() => onTema(k)}
              aria-current={aqui ? 'location' : undefined}
              title={aqui && activo == null ? tr('{tema} · tócalo para volver a la vista completa', { tema: tr(tm.nombre) }) : trn(tm.caps.length, '{tema} · {n} capítulo ({k})', '{tema} · {n} capítulos ({k})', { tema: tr(tm.nombre), k: k + 1 })}
              style={{ ...boton(aqui, activo == null ? e.marcado : e.tenue), padding: aqui ? '0 12px 0 10px' : '0 11px' }}>
              <Punto sel={aqui} curva={e.curva} />
              <span>{tr(tm.nombre)}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Panel({ capitulos, activo, temas, tema, theme: t, angosto, plegado, onPlegar, onIr, onTodo, onRecorrido, abajo, margen }:
  Props & { abajo: string; margen: number }) {
  const e = estilos(t)
  const enTemas = temas.length > 0
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(tema != null ? [tema] : []))
  // El tema donde estás se abre y los demás se pliegan; en la vista completa se queda lo que había.
  useEffect(() => { setAbiertos(a => abiertosAlCambiar(a, tema)) }, [tema])
  const listaRef = useRef<HTMLDivElement>(null)
  const filas = useRef(new Map<number, HTMLButtonElement>())

  // El capítulo actual siempre a la vista dentro de la lista (después de que su tema termine de abrirse).
  useEffect(() => {
    if (activo == null || plegado) return
    const r = setTimeout(() => {
      const el = filas.current.get(activo), lista = listaRef.current
      if (!el || !lista) return
      const a = el.getBoundingClientRect(), l = lista.getBoundingClientRect()
      // Arriba lo tapa el nombre fijo del tema (32 px).
      const arriba = l.top + (temas.length ? 38 : 6)
      const d = a.top < arriba ? a.top - arriba : a.bottom > l.bottom - 6 ? a.bottom - l.bottom + 6 : 0
      if (d) lista.scrollBy({ top: d, behavior: prefiereQuieto() ? 'auto' : 'smooth' })
    }, 480)
    return () => clearTimeout(r)
  }, [activo, plegado, abiertos])

  const ancho = angosto ? `min(${ANCHO_PANEL + 24}px, calc(100vw - ${margen * 2}px))` : ANCHO_PANEL
  const fuente = (peso: number, tam = 12.5) => `${peso} ${tam}px CanvasSans, system-ui`
  const iconoBoton = {
    display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
    background: 'transparent', color: t.text.caption, flexShrink: 0,
  } as const

  if (plegado) {
    const actual = activo != null && capitulos[activo]?.titulo ? tr(capitulos[activo].titulo) : null
    return (
      <button data-capitulos-panel="plegado" onClick={() => onPlegar(false)} className={mov.entra}
        title={actual ? tr('Capítulos · estás en «{actual}»', { actual }) : tr('Mostrar los capítulos')} aria-expanded={false}
        style={{
          position: 'absolute', right: margen, bottom: abajo, zIndex: 30, display: 'flex', alignItems: 'center', gap: 8,
          height: angosto ? 34 : 38, padding: '0 13px 0 12px', borderRadius: 12, cursor: 'pointer',
          color: t.text.title, font: fuente(650), ...e.tarjeta,
        }}>
        <IconoLista />
        {!angosto && <span>{tr('Capítulos')}</span>}
        {activo != null && <Punto sel curva={e.curva} empuja={false} />}
      </button>
    )
  }

  const fila = (i: number, n: number, oculto: boolean) => {
    const c = capitulos[i]
    const sel = i === activo
    return (
      <button key={c.id} ref={el => { if (el) filas.current.set(i, el); else filas.current.delete(i) }}
        data-capitulo={c.titulo} onClick={() => onIr(i)} aria-current={sel ? 'step' : undefined} tabIndex={oculto ? -1 : undefined}
        title={tr(c.titulo)}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 30,
          padding: enTemas ? '5px 10px 5px 30px' : '5px 10px 5px 24px', border: 'none', borderRadius: 8, cursor: 'pointer',
          textAlign: 'left', background: sel ? e.marcado : 'transparent',
          color: sel ? t.text.title : t.text.body, font: fuente(sel ? 700 : 550),
          transition: `background 220ms ${e.curva}, color 220ms ${e.curva}`,
        }}
        onPointerEnter={ev => { if (!sel) ev.currentTarget.style.background = e.tenue }}
        onPointerLeave={ev => { if (!sel) ev.currentTarget.style.background = 'transparent' }}>
        <span style={{ position: 'absolute', left: enTemas ? 16 : 10, top: '50%', marginTop: -3, display: 'flex' }}>
          <Punto sel={sel} curva={e.curva} empuja={false} />
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(c.titulo)}</span>
        <span aria-hidden style={{ font: fuente(600, 11), color: t.text.caption, opacity: sel ? .9 : .55, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      </button>
    )
  }

  return (
    <aside data-capitulos-panel="abierto" aria-label={tr('Capítulos')} className={mov.entra} style={{
      position: 'absolute', right: margen, bottom: abajo, zIndex: 30, width: ancho,
      display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', ...e.tarjeta,
      maxHeight: angosto ? '46vh' : 'min(56vh, 480px)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px 7px 12px', color: t.text.caption }}>
        <IconoLista />
        <span style={{ flex: 1, font: fuente(700, 11), letterSpacing: '.07em', textTransform: 'uppercase' }}>{tr('Capítulos')}</span>
        {!enTemas && (
          <button onClick={onTodo} title={tr('Vista completa (Esc)')} aria-label={tr('Vista completa')}
            style={{ ...iconoBoton, background: activo == null ? e.tenue : 'transparent', color: activo == null ? t.text.title : t.text.caption }}>
            <IconoTodo />
          </button>
        )}
        {onRecorrido && (
          <button data-recorrido-boton onClick={onRecorrido} title={tr('Recorrido: el lienzo como clase (⇧P · ← → · Esc)')} aria-label={tr('Empezar el recorrido')}
            style={{ ...iconoBoton, color: ORO }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3.5 2.2v7.6L9.6 6z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <button onClick={() => onPlegar(true)} title={tr('Plegar')} aria-label={tr('Plegar los capítulos')} aria-expanded style={iconoBoton}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      <div aria-hidden style={{ height: 1, background: t.roles.card.stroke.color, flexShrink: 0 }} />
      <div ref={listaRef} style={{ overflowY: 'auto', overflowX: 'hidden', padding: '0 4px 4px', overscrollBehavior: 'contain' }}>
        {enTemas
          ? temas.map((tm, k) => {
            const abierto = abiertos.has(k)
            const aqui = k === tema
            return (
              <div key={tm.nombre} role="group" style={{ paddingTop: k === 0 ? 4 : 0 }} aria-label={tr(tm.nombre)} data-tema-panel={tm.nombre} data-abierto={abierto || undefined}>
                <button onClick={() => setAbiertos(a => alternar(a, k, tema))} aria-expanded={abierto}
                  title={aqui ? tr('{tema} · aquí estás', { tema: tr(tm.nombre) }) : abierto ? tr('Plegar {tema}', { tema: tr(tm.nombre) }) : trn(tm.caps.length, 'Ver el capítulo de {tema}', 'Ver los {n} capítulos de {tema}', { tema: tr(tm.nombre) })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 10px 0 8px',
                    border: 'none', borderRadius: 8, cursor: aqui ? 'default' : 'pointer', textAlign: 'left',
                    // Fijo arriba mientras se recorren sus capítulos: siempre se sabe de qué tema son.
                    position: 'sticky', top: 0, zIndex: 1, background: t.roles.card.fill,
                    color: aqui || abierto ? t.text.title : t.text.caption, font: fuente(700),
                    transition: `color 220ms ${e.curva}, box-shadow 220ms ${e.curva}`,
                  }}
                  onPointerEnter={ev => { ev.currentTarget.style.boxShadow = `inset 0 0 0 99px ${e.tenue}` }}
                  onPointerLeave={ev => { ev.currentTarget.style.boxShadow = 'none' }}>
                  <Chevron abierto={abierto} curva={e.curva} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(tm.nombre)}</span>
                  <span aria-hidden style={{ font: fuente(600, 11), color: t.text.caption, opacity: .55, fontVariantNumeric: 'tabular-nums' }}>{tm.caps.length}</span>
                </button>
                {/* Los capítulos del tema: la fila crece de 0 a su alto. */}
                <div aria-hidden={!abierto} style={{
                  display: 'grid', gridTemplateRows: abierto ? '1fr' : '0fr', gridTemplateColumns: 'minmax(0, 1fr)',
                  transition: prefiereQuieto() ? 'none' : `grid-template-rows 380ms ${e.curva}`,
                }}>
                  <div style={{
                    minHeight: 0, overflow: 'hidden', opacity: abierto ? 1 : 0,
                    transition: `opacity ${abierto ? 320 : 160}ms ${e.curva}`,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, padding: '1px 0 4px' }}>
                      {tm.caps.map((i, j) => fila(i, j + 1, !abierto))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
          : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>{capitulos.map((_, i) => fila(i, i + 1, false))}</div>}
      </div>
    </aside>
  )
}
