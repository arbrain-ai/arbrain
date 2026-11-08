'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clase, Modo, Preset, Respuesta, VistaBandeja } from './lib/bandeja'

/** La bandeja viva: se lee cada 5 s mientras la pestaña está a la vista y al volver a ella. `activa` = false: no lee nada
 *  (el Día de otra fecha o el calendario de otra persona montan la misma hoja). */
export function useBandeja(cadaMs = 5_000, activa = true) {
  const [vista, setVista] = useState<VistaBandeja | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const vivo = useRef(true)

  const leer = useCallback(async () => {
    try {
      const r = await fetch('/api/decisiones', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!vivo.current) return
      if (!r.ok) { setError(String(j.error ?? `HTTP ${r.status}`)); return }
      setVista(j as VistaBandeja); setError(null)
    } catch (e) { if (vivo.current) setError(e instanceof Error ? e.message : 'sin conexión') }
  }, [])

  useEffect(() => {
    if (!activa) return
    vivo.current = true
    void leer()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void leer() }, cadaMs)
    const alVolver = () => { if (document.visibilityState === 'visible') void leer() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo.current = false; clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [leer, cadaMs, activa])

  const mandar = useCallback(async (clave: string, cuerpo: Record<string, unknown>) => {
    setOcupado(clave)
    try {
      const r = await fetch('/api/decisiones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(String(j.error ?? (Array.isArray(j.errores) && j.errores[0]?.error) ?? `HTTP ${r.status}`))
      else setError(null)
      await leer()
      return r.ok
    } finally { setOcupado(null) }
  }, [leer])

  return {
    vista, error, ocupado, recargar: leer,
    resolver: (id: string, respuesta: Respuesta, comentario?: string) => mandar(id, { accion: 'resolver', id, respuesta, ...(comentario ? { comentario } : {}) }),
    lote: (ids: string[], respuesta: 'si' | 'no') => mandar('lote', { accion: 'lote', ids, respuesta }),
    politica: (preset: Preset, ajustes: Partial<Record<Clase, Modo>> = {}) => mandar('politica', { accion: 'politica', preset, ajustes }),
    deshacer: (ts: string, dia: string) => mandar(`deshacer:${ts}`, { accion: 'deshacer', ts, dia }),
  }
}
