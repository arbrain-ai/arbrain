'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Habito, type Reflexion, localDate } from '../types'

const HEATMAP_DAYS = 140

interface DayStat {
  fecha: string
  done: number
  total: number
}

// Todos los reads/writes van por /api/sistema (server-side): el cliente browser
// de Supabase no tiene sesión en la desktop (Tauri) y RLS devuelve vacío.
// El canal realtime se mantiene como mejora progresiva (solo web); en desktop
// el refetch-on-focus cubre la frescura.
export function useSistema() {
  const supabase = createClient()
  const today = localDate()

  const [habitos, setHabitos] = useState<Habito[]>([])
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set())
  const [reflexion, setReflexion] = useState<Reflexion>({ prioridad_am: '', respuesta_am: '', respuesta_pm: '' })
  const [history, setHistory] = useState<DayStat[]>([])
  const [loading, setLoading] = useState(true)

  const total = habitos.length

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sistema?date=${today}&days=${HEATMAP_DAYS}`, { cache: 'no-store' })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json() as {
        habitos: Habito[]
        done: string[]
        reflexion: Reflexion | null
        history: { fecha: string; done: number }[]
      }
      setHabitos(data.habitos)
      setDoneToday(new Set(data.done))
      if (data.reflexion) setReflexion({
        prioridad_am: data.reflexion.prioridad_am ?? '',
        respuesta_am: data.reflexion.respuesta_am ?? '',
        respuesta_pm: data.reflexion.respuesta_pm ?? '',
      })
      const totalHab = data.habitos.length || 10
      const byDate = new Map(data.history.map((h) => [h.fecha, h.done]))
      const stats: DayStat[] = []
      for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
        const f = localDate(new Date(Date.now() - i * 86400000))
        stats.push({ fecha: f, done: byDate.get(f) ?? 0, total: totalHab })
      }
      setHistory(stats)
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { void load() }, [load])

  // refetch on focus: cubre desktop (sin realtime) y web tras estar en background
  useEffect(() => {
    const onFocus = () => { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // realtime (solo funciona en web con sesión): refrescar cuando cambian los checks
  useEffect(() => {
    const ch = supabase
      .channel('sistema-checks-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sistema_checks' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [supabase, load])

  const toggle = useCallback(async (clave: string) => {
    const next = !doneToday.has(clave)
    // optimistic
    setDoneToday((prev) => {
      const s = new Set(prev)
      if (next) s.add(clave); else s.delete(clave)
      return s
    })
    await fetch('/api/sistema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave, hecho: next ? true : null, date: today }),
    })
  }, [today, doneToday])

  const saveReflexion = useCallback(async (patch: Partial<Reflexion>) => {
    const merged = { ...reflexion, ...patch }
    setReflexion(merged)
    for (const [campo, valor] of Object.entries(patch)) {
      if (typeof valor !== 'string') continue
      await fetch('/api/sistema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'reflexion', campo, valor, date: today }),
      })
    }
  }, [today, reflexion])

  // racha: dias consecutivos (hasta hoy/ayer) con >= 60% hecho
  const streak = (() => {
    let s = 0
    const thr = Math.max(1, Math.ceil(total * 0.6))
    for (let i = history.length - 1; i >= 0; i--) {
      const d = history[i]
      if (d.fecha === today && d.done < thr) continue // hoy aun en progreso, no rompe
      if (d.done >= thr) s++
      else break
    }
    return s
  })()

  const doneCount = doneToday.size

  return { loading, habitos, doneToday, toggle, reflexion, saveReflexion, history, streak, total, doneCount, today }
}
