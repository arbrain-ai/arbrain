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

/** Un evento de las islas del mapa v16 (despertar, foto, decisión, rechazo): con su hora, para medir latencias. */
export interface EventoIsla { evento: string; t: number; [k: string]: unknown }

interface Sonda { cuadros: MuestraCuadro[]; reacts: number; islas: EventoIsla[]; reiniciar: () => void }

const TOPE = 600

function sonda(): Sonda | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __lienzoPerf?: Sonda }
  if (!w.__lienzoPerf) {
    const s: Sonda = { cuadros: [], reacts: 0, islas: [], reiniciar: () => { s.cuadros = []; s.reacts = 0; s.islas = [] } }
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

/** Islas (mapa v16): cada evento con su hora. Telemetría local de la sonda, nunca a la campana. */
export function anotarIsla(evento: string, datos: Record<string, unknown> = {}): void {
  const s = sonda()
  if (!s) return
  if (!s.islas) s.islas = []
  s.islas.push({ ...datos, evento, t: typeof performance !== 'undefined' ? performance.now() : Date.now() })
  if (s.islas.length > TOPE) s.islas.splice(0, s.islas.length - TOPE)
}

/**
 * La cámara viva, al alcance de la medición (mapa v16): `scripts/qa/medir-islas.mjs` la mueve como lo haría la mano para
 * medir cuadros y despertares sin adivinar coordenadas. Es la misma sonda: leer o mover la cámara no escribe nada.
 */
export function exponerCamara(c: { ref: { current: { x: number; y: number; zoom: number } }; fijar: (c: { x: number; y: number; zoom: number }) => void }): void {
  const s = sonda() as (Sonda & { camara?: unknown }) | null
  if (s) s.camara = c
}

/**
 * El bus de eventos de las islas, al alcance de la medición: `window.__lienzoPerf.emitir({ tipo, organo, texto, fuente })`
 * dispara un impulso como si el evento hubiera llegado (para medir cuadros con impulsos en vuelo). La app NUNCA lo usa:
 * sus impulsos nacen de eventos reales (islas/eventos.ts).
 */
export function exponerEventos(emitir: (e: { tipo: 'rutina' | 'agente' | 'cobro' | 'cerebro' | 'video' | 'dinero'; organo: string; texto: string; fuente: string; en: number; dolor?: boolean }) => void): void {
  const s = sonda() as (Sonda & { emitir?: unknown }) | null
  if (s) s.emitir = emitir
}
