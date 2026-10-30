'use client'
import { useEffect } from 'react'
import { alCambiarEstado, estadoVentana, lateParaSiempre, type EstadoVentana } from '@/shared/lib/reposo'

/** Un segundo de gracia: un diálogo nativo o un clic en otra ventana no congela nada por un parpadeo. */
const GRACIA_MS = 1_000
/** En reposo se vuelve a mirar cada tanto: lo que empieza a latir estando sin foco (un spinner nuevo) también se pausa. */
const REVISION_MS = 4_000

/**
 * Marca `<html data-reposo>` mientras la app no tiene foco o está oculta y PAUSA LAS ANIMACIONES INFINITAS (6 oct
 * 2026): los latidos de box-shadow (el punto del ahora, los agentes vivos) obligaban a repintar 60 veces por segundo
 * sin nadie mirando. Al volver siguen donde iban.
 *
 * 12 oct 2026: antes se pausaba TODA animación con CSS (`html[data-reposo] * { animation-play-state: paused }`). Eso
 * congelaba en su primer cuadro, en opacidad 0, todo lo que nacía con animación de entrada mientras Daniel estaba en
 * otra app: la barra del lector (`audioBarIn`), los mensajes nuevos de Levy (`msg-enter`), el saludo. Medido con el
 * arnés WKWebView: la barra del lector existía y no se veía. Las entradas duran milisegundos y terminan solas; ya no se
 * tocan.
 */
export function ReposoVentana() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    let revision: ReturnType<typeof setInterval> | undefined
    const pausadas = new Set<Animation>()
    const pausarInfinitas = () => {
      if (typeof document.getAnimations !== 'function') return
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running' || !lateParaSiempre(a.effect?.getTiming().iterations)) continue
        a.pause()
        pausadas.add(a)
      }
    }
    const reanudar = () => {
      clearInterval(revision)
      revision = undefined
      for (const a of pausadas) { try { a.play() } catch { /* ya no existe */ } }
      pausadas.clear()
    }
    const aplicar = (e: EstadoVentana) => {
      clearTimeout(t)
      if (e === 'activa') { delete document.documentElement.dataset.reposo; reanudar(); return }
      t = setTimeout(() => {
        if (estadoVentana() === 'activa') return
        document.documentElement.dataset.reposo = ''
        pausarInfinitas()
        if (!revision) revision = setInterval(pausarInfinitas, REVISION_MS)
      }, GRACIA_MS)
    }
    aplicar(estadoVentana())
    const baja = alCambiarEstado(aplicar)
    return () => { clearTimeout(t); baja(); reanudar(); delete document.documentElement.dataset.reposo }
  }, [])
  return null
}
