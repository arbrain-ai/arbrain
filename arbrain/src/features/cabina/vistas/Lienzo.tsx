'use client'
/**
 * El lienzo dentro de Arbrain: una página de canvas v4 (tabla `draw`, la misma que abre sfmap)
 * pintada con el MISMO motor que la pizarra.
 *
 *  · VistaLienzo  — en el chat: solo lectura, ajustada al ancho. Con `zona` encuadra esa parte.
 *  · En la pestaña del panel ya no va una versión de solo mirar: desde el 4 oct 2026 es la pizarra
 *    completa de la sección (`PizarraEmbebida`), y aquí se retiró `LienzoVivo`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasElement } from '@/features/canvas/model/element'
import { render } from '@/features/canvas/render/engine'
import { computeDpr } from '@/features/canvas/render/viewport'
import { THEMES } from '@/features/canvas/theme/tokens'
import { waitForFonts } from '@/features/canvas/text/metrics-browser'
import { onImageLoaded } from '@/features/canvas/render/images'
import { releer, useFuente } from '../datos'
import { escuchar as escucharPagina } from '@/features/canvas/state/nube'
import { camaraPara, limites, resolverZona, type Camara } from './zona'
import s from '../cabina.module.css'

interface Pagina { ok: boolean; pagina: { id: string; nombre: string; elements: CanvasElement[]; actualizado?: string; version?: number } }
export const urlLienzo = (id: string) => `/api/canvas/pages/${encodeURIComponent(id)}`
const MARGEN = 32
let fuentes: Promise<void> | null = null

/** La página, sus fuentes cargadas y un latido cuando llega una imagen. */
function usePaginaLienzo(paginaId: string, vivo = false) {
  // En el panel el lienzo es un espejo: lo que se guarde en la pizarra (aviso por el canal de la
  // página) o en sfmap (sin aviso: se relee cada 45 s mientras se ve) aparece solo.
  const { data, error } = useFuente<Pagina>(urlLienzo(paginaId), vivo ? 45_000 : undefined)
  useEffect(() => vivo ? escucharPagina(paginaId, () => { void releer(urlLienzo(paginaId)) }) : undefined, [paginaId, vivo])
  const [listo, setListo] = useState(false), [tick, setTick] = useState(0)
  useEffect(() => {
    // Las @font-face del v4 (los mismos .ttf que mide el compilador) viven en
    // una hoja propia que solo carga /canvas-lab: sin ella el texto cae a serif.
    if (!document.querySelector('link[data-cabina-fuentes]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/fonts/v4/fonts.css'; l.dataset.cabinaFuentes = '1'; document.head.appendChild(l)
    }
    fuentes ??= waitForFonts([{ family: 'montserrat', weight: 400, size: 20 }, { family: 'montserrat', weight: 700, size: 24 }, { family: 'roboto-slab', weight: 900, size: 24 }])
    let vivo = true; void fuentes.then(() => vivo && setListo(true)); return () => { vivo = false }
  }, [])
  useEffect(() => onImageLoaded(() => setTick(t => t + 1)), [])
  // Si las fuentes llegan después del primer pintado (servidor frío, red lenta), se repinta: sin esto el
  // lienzo se quedaba en la serif de respaldo hasta el siguiente movimiento.
  useEffect(() => {
    const f = document.fonts; if (!f) return
    const otra = () => setTick(t => t + 1)
    f.addEventListener('loadingdone', otra); return () => f.removeEventListener('loadingdone', otra)
  }, [])
  // Los roles que el tema no conoce (los de sfmap, como `circulo`) los resuelve el motor con su
  // respaldo neutro (estiloDeRol): aquí ya no hace falta reescribirlos.
  const elementos = useMemo(() => data?.pagina.elements ?? [], [data])
  return { data, error, elementos, listo, tick }
}

function pintar(c: HTMLCanvasElement, elementos: CanvasElement[], camara: Camara, ancho: number, alto: number) {
  render(c, { elements: elementos, camera: camara, theme: THEMES.claro, viewport: { width: ancho, height: alto, dpr: computeDpr(ancho, alto, Math.min(window.devicePixelRatio || 1, 2)) }, background: 'liso', guias: [], marquee: null, conectando: null, draft: null })
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [caja, setCaja] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setCaja({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) })); ro.observe(el); return () => ro.disconnect()
  }, [])
  return [ref, caja] as const
}

/** En el chat: solo lectura, legible antes que completo. */
export function VistaLienzo({ paginaId, zona, grande }: { paginaId: string; zona?: string; grande?: boolean }) {
  const { data, error, elementos, listo, tick } = usePaginaLienzo(paginaId)
  const [caja, { w: ancho }] = useAncho<HTMLDivElement>()
  const lienzo = useRef<HTMLCanvasElement>(null)
  const encuadre = useMemo(() => {
    if (!elementos.length || !ancho) return null
    const tope = grande ? 16000 : 560
    const z = resolverZona(elementos, zona)
    if (z) {
      // Una zona: se ajusta al ancho y se ve entera hasta el tope (después, desvanecido).
      const zoom = Math.min(ancho / (z.rect.width + MARGEN * 2), 1.6)
      const completo = Math.round((z.rect.height + MARGEN * 2) * zoom), alto = Math.min(completo, tope)
      return { alto, recortado: completo > tope, camara: camaraPara(z.rect, ancho, alto, { margen: MARGEN, maxZoom: 1.6 }), perdida: false }
    }
    const b = limites(elementos)!
    const w = b.width + MARGEN * 2, h = b.height + MARGEN * 2
    // Legible antes que completo: se ajusta al ANCHO (un plan alto encogido
    // entero deja texto de 3 px). Inline se recorta con desvanecido; el panel
    // ampliado lo muestra entero y hace scroll.
    const zoom = Math.min(ancho / w, 1.2)
    const completo = Math.round(h * zoom)
    const alto = Math.min(completo, tope)
    // La cámara apunta al centro de lo VISIBLE: arriba del contenido si se recorta.
    return { alto, recortado: completo > tope, camara: { x: b.x - MARGEN + w / 2, y: b.y - MARGEN + (alto / zoom) / 2, zoom }, perdida: !!zona }
  }, [elementos, ancho, grande, zona])
  const alto = encuadre?.alto ?? 0

  useEffect(() => {
    const c = lienzo.current
    if (!c || !listo || !encuadre) return
    pintar(c, elementos, encuadre.camara, ancho, alto)
  }, [elementos, encuadre, ancho, alto, listo, tick])

  return <div ref={caja} className={s.lienzo} data-tick={tick}>
    {!data && <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Abriendo el lienzo…'}</div>}
    {data && !elementos.length && <p className={s.vacio}>La página «{data.pagina.nombre}» está vacía.</p>}
    {encuadre?.perdida && <p className={s.aviso}>No encontré «{zona}» en este lienzo: lo muestro completo.</p>}
    {data && elementos.length > 0 && <canvas ref={lienzo} style={{ width: ancho, height: alto }} role="img" aria-label={`Lienzo: ${data.pagina.nombre}`} />}
    {encuadre?.recortado && <span className={s.desvanecido} aria-hidden />}
  </div>
}
