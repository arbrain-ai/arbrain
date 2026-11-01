/**
 * BITÁCORA DEL LECTOR (31 oct 2026). El diagnóstico del 31 oct tuvo que reconstruir un salto con tres logs del Studio
 * porque la sonda del lector solo vive con `?ttsdebug=1`. Desde hoy, SIEMPRE y en ligero, el cliente deja:
 *
 *   · `primer-audio`: cuánto pasó del toque (Escuchar, tap, reanudar, siguiente) a que el primer audio salió por la
 *     bocina, con su desglose (red, descarga, decodificar, Server-Timing de la ruta y del daemon, caché, formato).
 *   · `falla` y `reintento`: cada tramo que no llegó y por qué.
 *   · `motor`: cada cambio entre la voz del servidor y la del navegador.
 *
 * Destino: `/api/chat/lector-log` → `lector.jsonl` junto a los demás logs del cliente (rueda-log.ts › dirLogs; en el
 * Studio, ~/Library/Logs/Arbrain/lector.jsonl). Nunca la campana. En lotes (uno cada 3 s como mucho) y con tope de 40
 * eventos por minuto: un lector que falla en bucle no inunda nada.
 */

export type EventoLector =
  | { tipo: 'primer-audio'; ms: number; toque: string; motor: 'servidor' | 'navegador'; velocidad: number; [k: string]: unknown }
  | { tipo: 'falla'; motivo: string; servidor: boolean; [k: string]: unknown }
  | { tipo: 'reintento'; motivo: string; intento: number; [k: string]: unknown }
  | { tipo: 'motor'; de: 'servidor' | 'navegador'; a: 'servidor' | 'navegador'; motivo: string; [k: string]: unknown }

export const TIPOS_EVENTO = ['primer-audio', 'falla', 'reintento', 'motor'] as const
export const TOPE_POR_MINUTO = 40
const LOTE_MS = 3_000

const cola: Array<Record<string, unknown>> = []
const ultimos: Array<Record<string, unknown>> = []
let enviados: number[] = []
let reloj: ReturnType<typeof setTimeout> | null = null

/** Los últimos eventos (para el arnés y para depurar en la consola). */
export function eventosRecientes(): ReadonlyArray<Record<string, unknown>> {
  return ultimos
}

/** ¿Cabe otro evento en la ventana del último minuto? Pura, para el test. */
export function cabeEnElMinuto(marcas: number[], ahora: number, tope = TOPE_POR_MINUTO): boolean {
  return marcas.filter((t) => ahora - t < 60_000).length < tope
}

export function registrarLector(e: EventoLector): void {
  const ahora = Date.now()
  const fila = { ...e, en: new Date(ahora).toISOString() }
  ultimos.push(fila)
  if (ultimos.length > 50) ultimos.shift()
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return
  enviados = enviados.filter((t) => ahora - t < 60_000)
  if (!cabeEnElMinuto(enviados, ahora)) return
  enviados.push(ahora)
  cola.push(fila)
  if (!reloj) reloj = setTimeout(vaciar, LOTE_MS)
}

function red(): Record<string, unknown> | null {
  const c = (navigator as unknown as { connection?: { effectiveType?: string; rtt?: number; downlink?: number } }).connection
  return c ? { tipo: c.effectiveType ?? null, rtt: c.rtt ?? null, mbps: c.downlink ?? null } : null
}

function vaciar() {
  reloj = null
  if (!cola.length) return
  const eventos = cola.splice(0, 20)
  try {
    void fetch('/api/chat/lector-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventos, red: red(), pagina: location.host }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* telemetría: nunca rompe el lector */ }
  if (cola.length && !reloj) reloj = setTimeout(vaciar, LOTE_MS)
}

if (typeof window !== 'undefined') {
  // Al irse la página (el teléfono bloquea la pantalla), lo pendiente sale ya.
  window.addEventListener('pagehide', () => { if (reloj) { clearTimeout(reloj); reloj = null } vaciar() })
}

/**
 * Línea de `lector.jsonl` (servidor). Solo los campos conocidos y acotados: el cliente nunca manda el texto que se lee.
 * Pura, para el test.
 */
export function lineaRegistroLector(e: unknown, equipo: string, ahora: Date, red?: unknown): string | null {
  if (!e || typeof e !== 'object') return null
  const x = e as Record<string, unknown>
  if (!TIPOS_EVENTO.includes(x.tipo as (typeof TIPOS_EVENTO)[number])) return null
  const limpio: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(x)) {
    if (Object.keys(limpio).length >= 24) break
    if (!/^[a-z_-]{1,24}$/i.test(k) || /^(texto|text|contenido)$/i.test(k)) continue
    if (typeof v === 'number' && Number.isFinite(v)) limpio[k] = Math.round(v * 10) / 10
    else if (typeof v === 'boolean' || v === null) limpio[k] = v
    else if (typeof v === 'string') limpio[k] = v.slice(0, 200)
  }
  const fila = { recibido: ahora.toISOString(), equipo: equipo.slice(0, 160), ...limpio, ...(red && typeof red === 'object' ? { red } : {}) }
  const linea = JSON.stringify(fila)
  return linea.length > 2000 ? null : linea + '\n'
}
