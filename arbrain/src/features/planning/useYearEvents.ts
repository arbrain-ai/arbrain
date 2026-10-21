'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { yearWindows } from './year'
import type { PlanEvent } from './types'

const cache = new Map<string, { at: number; events: PlanEvent[] }>()

/** Eventos de un año entero. El proveedor lee ≤ 65 días por llamada, así que van seis ventanas seguidas y el
 *  año se pinta conforme llegan. Solo lectura: las ediciones siguen yendo por `usePlanning`. */
export function useYearEvents(year: number, ownerId: string | undefined) {
  const id = ownerId ? `${ownerId}:${year}` : ''
  const [events, setEvents] = useState<PlanEvent[]>(() => cache.get(id)?.events ?? [])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = useRef(0)

  const load = useCallback(async (force: boolean) => {
    if (!id) return
    const hit = cache.get(id)
    if (hit) setEvents(hit.events)
    if (hit && !force && Date.now() - hit.at < 30_000) return
    const mine = ++run.current
    setLoading(true); setFailed(false)
    const all: PlanEvent[] = []
    let bad = false
    for (const w of yearWindows(year)) {
      try {
        const res = await fetch(`/api/planning?${new URLSearchParams(w)}`, { cache: 'no-store', signal: AbortSignal.timeout(100_000) })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error)
        all.push(...(body.events as PlanEvent[]))
      } catch { bad = true }
      if (mine !== run.current) return
      setEvents([...all])
    }
    if (mine !== run.current) return
    // Un año a medias no se guarda como bueno: la siguiente visita vuelve a leer.
    if (!bad) cache.set(id, { at: Date.now(), events: all })
    setFailed(bad); setLoading(false)
  }, [id, year])

  useEffect(() => { void load(false); return () => { run.current++ } }, [load])
  useEffect(() => {
    const changed = () => { cache.delete(id); void load(true) }
    window.addEventListener('arbrain:planning:changed', changed)
    return () => window.removeEventListener('arbrain:planning:changed', changed)
  }, [id, load])
  return { events, loading, failed, reload: () => load(true) }
}
