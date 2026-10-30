'use client'
import { useCallback, useSyncExternalStore } from 'react'
import { instalacion } from '@/config'
import type { CampoFondo } from '@/config/tipos'
import { aplicarCambioZonas, normalizarZonas, zonasEfectivas, zonasEncendidas, type CambioZonas, type DocZonas, type Zona } from './zonas'

/**
 * Las Zonas de mi vida en la app (28 oct 2026). UNA lectura compartida por todas las superficies (la Semana, el Día, el panel, el
 * engrane): un almacén de módulo con suscriptores. Mientras no llega lo de la persona se pintan las de fábrica, todas encendidas.
 * Cada cambio se ve al instante (con la MISMA validación que el servidor) y se confirma con lo que devuelve /api/planning/zonas; si
 * el servidor no confirma, vuelve a lo de antes y avisa.
 */
const FABRICA = instalacion().camposFondo
interface Estado { doc: DocZonas | null; zonas: Zona[]; encendidas: CampoFondo[]; error: string | null }
const desde = (doc: DocZonas | null, error: string | null = null): Estado => {
  const zonas = zonasEfectivas(FABRICA, doc)
  return { doc, zonas, encendidas: zonasEncendidas(zonas), error }
}
const INICIAL = desde(null)
let estado: Estado = INICIAL
let pedido: Promise<void> | null = null
const oyentes = new Set<() => void>()
const poner = (e: Estado) => { estado = e; for (const o of oyentes) o() }

async function leer() {
  try {
    const r = await fetch('/api/planning/zonas', { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    const b = await r.json()
    // Sin acceso (29 oct 2026: la segunda persona en su propio calendario): las zonas de fábrica son las del dueño, no las suyas.
    if (r.status === 403) return poner({ doc: null, zonas: [], encendidas: [], error: null })
    if (!r.ok) throw new Error(b.error ?? 'No se pudieron leer tus zonas.')
    poner(desde(normalizarZonas(b)))
  } catch (e) { poner({ ...estado, error: e instanceof Error ? e.message : 'No se pudieron leer tus zonas.' }) }
}

function suscribir(o: () => void) {
  oyentes.add(o)
  if (!FABRICA.length) return () => { oyentes.delete(o) }
  if (!pedido) {
    pedido = leer()
    window.addEventListener('focus', () => { void leer() })
  }
  return () => { oyentes.delete(o) }
}

export async function cambiarZonas(cambio: CambioZonas): Promise<void> {
  const antes = estado
  const local = aplicarCambioZonas(antes.doc ?? normalizarZonas(null), cambio, FABRICA)
  if (typeof local === 'string') throw new Error(local)
  poner(desde(local))
  try {
    const r = await fetch('/api/planning/zonas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambio), signal: AbortSignal.timeout(30_000) })
    const b = await r.json()
    if (!r.ok) throw new Error(b.error ?? 'No se guardó.')
    poner(desde(normalizarZonas(b)))
  } catch (e) {
    const m = e instanceof Error ? e.message : 'No se guardó.'
    poner({ ...antes, error: m }); throw new Error(m)
  }
}

export function useZonas() {
  const e = useSyncExternalStore(suscribir, () => estado, () => INICIAL)
  const cambiar = useCallback((c: CambioZonas) => cambiarZonas(c), [])
  return { ...e, cambiar }
}
