'use client'
/**
 * Datos de la Cabina: UNA lectura por fuente, compartida por todas las vistas.
 *
 * Treinta vistas del mismo mes en un hilo hacen UNA petición, no treinta. Solo
 * las vistas montadas (a la vista) se suscriben; cuando Levy escribe por una
 * pluma, `refrescarCabina()` marca todo como viejo y solo lo suscrito se relee.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { alVolver, tocaLeerAhora } from '@/shared/lib/reposo'

interface Entrada { data?: unknown; error?: string; cargando: boolean; leidoEn?: number; viejo: boolean; promesa?: Promise<void>; version: number }
const entradas = new Map<string, Entrada>()
const oyentes = new Map<string, Set<() => void>>()
const VIDA_MS = 60_000

function avisar(url: string) { oyentes.get(url)?.forEach(fn => fn()) }
function entrada(url: string): Entrada {
  let e = entradas.get(url)
  if (!e) { e = { cargando: false, viejo: true, version: 0 }; entradas.set(url, e) }
  return e
}

async function leer(url: string) {
  const e = entrada(url)
  if (e.promesa) return e.promesa
  entradas.set(url, { ...e, cargando: true, version: e.version + 1 })
  avisar(url)
  const promesa = (async () => {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(100_000) })
      const body = await r.json().catch(() => ({}))
      if (!r.ok || body?.ok === false) throw new Error(body?.error ?? `La fuente respondió ${r.status}.`)
      entradas.set(url, { data: body, cargando: false, leidoEn: Date.now(), viejo: false, version: entrada(url).version + 1 })
    } catch (err) {
      const prev = entrada(url)
      entradas.set(url, { ...prev, promesa: undefined, cargando: false, viejo: false, error: err instanceof Error ? err.message : 'No se pudo leer la fuente.', version: prev.version + 1 })
    } finally {
      const cur = entrada(url); if (cur.promesa) entradas.set(url, { ...cur, promesa: undefined })
      avisar(url)
    }
  })()
  entradas.set(url, { ...entrada(url), promesa })
  return promesa
}

function necesitaLeer(e: Entrada) { return !e.cargando && (e.viejo || !e.leidoEn || Date.now() - e.leidoEn > VIDA_MS) }

export interface Lectura<T> { data?: T; error?: string; cargando: boolean; leidoEn?: number }

/** Suscribe una vista MONTADA a una fuente. `url = null` = no leer (vista dormida). */
/** `cadaMs`: relectura periódica MIENTRAS la vista está montada (p. ej. trabajos). */
export function useFuente<T>(url: string | null, cadaMs?: number): Lectura<T> {
  const snap = useSyncExternalStore(
    fn => { if (!url) return () => {}; let s = oyentes.get(url); if (!s) { s = new Set(); oyentes.set(url, s) } s.add(fn); return () => { s!.delete(fn); if (!s!.size) oyentes.delete(url) } },
    () => (url ? entradas.get(url) : undefined),
    () => undefined,
  )
  useEffect(() => { if (url && necesitaLeer(entrada(url))) void leer(url) }, [url, snap?.viejo])
  // Un reloj por vista, una lectura por intervalo: las vistas que comparten la fuente comparten `leidoEn`, así
  // que cuatro relojes de 4 s ya no son una lectura por segundo. Oculta no sondea y sin foco va más lento
  // (shared/lib/reposo); al volver se relee de inmediato si se hizo vieja.
  useEffect(() => {
    if (!url || !cadaMs) return
    const tal = () => { const e = entrada(url); if (!e.cargando && tocaLeerAhora(cadaMs, e.leidoEn)) void leer(url) }
    const t = setInterval(tal, cadaMs)
    const baja = alVolver(tal)
    return () => { clearInterval(t); baja() }
  }, [url, cadaMs])
  return { data: snap?.data as T | undefined, error: snap?.error, cargando: !!snap?.cargando || (!!url && !snap?.leidoEn && !snap?.error), leidoEn: snap?.leidoEn }
}

/** Relee UNA fuente ya (p. ej. el lienzo que otro aparato acaba de guardar), sin marcar viejo lo demás. */
export function releer(url: string) { return leer(url) }

/** La lectura de una fuente si tiene menos de `edadMs`; si no, la relee (compartiendo la que esté en curso).
 *  Para quien sondea por su cuenta la misma fuente que el panel: una sola lectura sirve a los dos. */
export async function fuenteFresca<T>(url: string, edadMs: number): Promise<T | undefined> {
  const e = entrada(url)
  if (e.data === undefined || !e.leidoEn || Date.now() - e.leidoEn >= edadMs) await leer(url)
  const f = entrada(url)
  return f.error ? undefined : f.data as T | undefined   // si la última falló, no hay lectura (no se da lo viejo por fresco)
}

/** Última lectura conocida sin suscribirse (para el resumen de una vista colapsada). */
export function lecturaEnCache<T>(url: string): T | undefined { return entradas.get(url)?.data as T | undefined }

let temporizador: ReturnType<typeof setTimeout> | undefined
/** Levy escribió algo: todo se marca viejo y las vistas montadas se releen (con rebote). */
export function refrescarCabina(retrasoMs = 700) {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('cabina:refrescar'))
    for (const [url, e] of entradas) {
      entradas.set(url, { ...e, viejo: true, version: e.version + 1 })
      if (oyentes.get(url)?.size) void leer(url)
    }
  }, retrasoMs)
}

/** Herramientas que NO cambian el mundo: no disparan relectura. */
// atender/delegar/retomar/cerrar SÍ cambian el mundo: refrescan las vistas.
const SOLO_LECTURA = /^(Read|Grep|Glob|LS|WebFetch|WebSearch|TodoWrite|Skill|ToolSearch|AskUserQuestion|ViewImage|mcp__cabina__(mostrar|abrir)|cabina_(mostrar|abrir)|mcp__live__.*|live_workspace)$/
export function herramientaEscribe(toolName: string | undefined) { return !!toolName && !SOLO_LECTURA.test(toolName) }

/** Solo para pruebas y la medición de rendimiento. */
export function estadoCabina() { return { fuentes: entradas.size, suscritas: [...oyentes.values()].reduce((n, s) => n + s.size, 0) } }
