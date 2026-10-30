/**
 * Canvas v4 — sonda de rendimiento (5 oct 2026).
 *
 * «Se traba» no se arregla a ojo: se mide. La sonda guarda cuanto tarda cada
 * cuadro del motor y cuantas veces React volvio a pintar la pizarra, y lo deja
 * en `window.__lienzoPerf` para leerlo desde la consola o una prueba en el
 * navegador. Cuesta un `performance.now()` por cuadro; no hay modo "debug" que
 * olvidar encendido.
 */

export interface MuestraCuadro { t: number; ms: number; drawn: number; dpr: number }

interface Sonda { cuadros: MuestraCuadro[]; reacts: number; reiniciar: () => void }

const TOPE = 600

function sonda(): Sonda | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __lienzoPerf?: Sonda }
  if (!w.__lienzoPerf) {
    const s: Sonda = { cuadros: [], reacts: 0, reiniciar: () => { s.cuadros = []; s.reacts = 0 } }
    w.__lienzoPerf = s
  }
  return w.__lienzoPerf
}

export function anotarCuadro(m: MuestraCuadro): void {
  const s = sonda()
  if (!s) return
  s.cuadros.push(m)
  if (s.cuadros.length > TOPE) s.cuadros.splice(0, s.cuadros.length - TOPE)
}

export function anotarReact(): void {
  const s = sonda()
  if (s) s.reacts++
}
