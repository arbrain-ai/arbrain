'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { validarPeriodo, type TemporadaVigente } from './temporada'

/**
 * La temporada vigente en la app (24 oct 2026): la franja, «Hábitos de hoy» y el teléfono la leen de aquí, no de `instalacion()`.
 * Un solo estado para toda la ventana (la franja aparece en Día, Semana y Mes a la vez): se lee una vez de /api/planning/temporada
 * y se relee al volver a la ventana (Levy pudo armarla por su CLI mientras tanto).
 *
 * Instalación de Daniel: arranca con `instalacion()` (sin parpadeo; es lo que contesta la ruta). Edición del alumno: arranca en
 * `undefined` (leyendo) y las vistas no pintan nada hasta saber si hay temporada o toca la invitación.
 */
type Estado = TemporadaVigente | undefined

const deInstalacion = (): TemporadaVigente => ({ periodo: instalacion().periodo, temporadaHabitos: instalacion().temporadaHabitos })
let estado: Estado = esEdicionCliente() ? undefined : deInstalacion()
let enVuelo: Promise<void> | null = null
const oyentes = new Set<() => void>()
const avisar = () => { for (const o of oyentes) o() }

async function leer() {
  if (enVuelo) return enVuelo
  enVuelo = (async () => {
    try {
      const r = await fetch('/api/planning/temporada', { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(String(r.status))
      const b = await r.json() as Record<string, unknown>
      const p = b.periodo ? validarPeriodo(b.periodo) : undefined
      const t = b.temporadaHabitos as TemporadaVigente['temporadaHabitos'] | undefined
      estado = { periodo: typeof p === 'string' ? undefined : p,
        temporadaHabitos: t && typeof t.nombre === 'string' && typeof t.arranque === 'string' ? { nombre: t.nombre, arranque: t.arranque } : undefined }
    } catch {
      // Sin respuesta: lo que ya había (Daniel: su instalación; alumno: «sin temporada», la invitación discreta).
      if (estado === undefined) estado = {}
    } finally { enVuelo = null; avisar() }
  })()
  return enVuelo
}

const suscribir = (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o) } }
const foto = () => estado
const SERVIDOR: Estado = esEdicionCliente() ? undefined : deInstalacion()
const fotoServidor = () => SERVIDOR

/** La temporada vigente; `undefined` mientras la edición del alumno la lee por primera vez. */
export function useTemporada(): Estado {
  const v = useSyncExternalStore(suscribir, foto, fotoServidor)
  useEffect(() => {
    void leer()
    const otra = () => void leer()
    window.addEventListener('focus', otra)
    return () => window.removeEventListener('focus', otra)
  }, [])
  return v
}
