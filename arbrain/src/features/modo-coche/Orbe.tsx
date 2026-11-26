'use client'
/**
 * El Orbe del modo coche: el lienzo que pinta `OrbeMotor` (orbe/motor.ts) con la paleta que escogió cada quien.
 * El nivel (tu voz al escuchar, la de Arbrain al hablar) entra por una función; el tamaño sigue a la pantalla; y no se
 * congela aunque no haya cargador (en el coche se quedaría quieto). Con «reducir movimiento» se pinta un cuadro fijo.
 */
import { useEffect, useRef } from 'react'
import { OrbeMotor, type EstadoOrbe } from './orbe/motor'
import { EVENTO_PALETA, paletaGuardada } from './orbe/paletas'

const CUADRO_MS = 1000 / 30

export function Orbe({ estado, tamano, nivel }: { estado: EstadoOrbe; tamano: number; nivel: () => number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const motorRef = useRef<OrbeMotor | null>(null)
  const estadoActual = useRef(estado)
  const nivelActual = useRef(nivel)
  estadoActual.current = estado
  nivelActual.current = nivel

  useEffect(() => {
    const c = lienzo.current
    if (!c || tamano <= 0) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = c.height = Math.round(tamano * dpr)
    let motor = motorRef.current
    if (!motor) {
      motor = new OrbeMotor(paletaGuardada())
      motor.fijar(estadoActual.current)
      motorRef.current = motor
    }
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cuadro = 0
    let anterior = performance.now() - CUADRO_MS
    const pintar = (n: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, tamano, tamano)
      motor!.pintar(ctx, tamano, tamano, n)
    }
    const alCambiarPaleta = () => { motor!.ponerPaleta(paletaGuardada()); if (quieto) pintar(0) }
    window.addEventListener(EVENTO_PALETA, alCambiarPaleta)
    const paso = (ahora: number) => {
      cuadro = requestAnimationFrame(paso)
      if (document.hidden || ahora - anterior < CUADRO_MS - 2) return
      const dt = Math.min(0.05, (ahora - anterior) / 1000)
      anterior = ahora
      let n = 0
      try { n = Math.max(0, Math.min(1, nivelActual.current() || 0)) } catch { n = 0 }
      motor!.cambiar(estadoActual.current)
      motor!.avanzar(dt, n)
      pintar(n)
    }
    if (quieto) { motor.fijar(estadoActual.current); pintar(0) } else cuadro = requestAnimationFrame(paso)
    return () => { cancelAnimationFrame(cuadro); window.removeEventListener(EVENTO_PALETA, alCambiarPaleta) }
  }, [tamano])

  return <canvas ref={lienzo} aria-hidden style={{ width: tamano, height: tamano, display: 'block' }} />
}
