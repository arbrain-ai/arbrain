'use client'
/**
 * Estado de seguridad compartido por la franja de pausa (FrenoGeneral), Ajustes y el menú del modelo del chat (30 oct
 * 2026: la píldora «Autónomo» y el botón flotante «Pausar todo» se fueron al menú del modelo). Todo va por
 * `/api/seguridad/*`; quien cambia algo avisa con un evento para que las otras vistas lo lean al momento.
 */
import { useCallback, useEffect, useState } from 'react'
import type { EstadoPausa, EstadoPermisosLevy } from '../lib/seguridad'

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const j = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j
}

/** Avisa a las otras vistas (Ajustes, el menú del modelo, la franja) que el modo cambió. */
export const EVENTO_PERMISOS = 'arbrain:permisos'
/** Avisa que se pausó o reanudó (la franja aparece sin esperar a su consulta). */
export const EVENTO_PAUSA = 'arbrain:pausa'

/** Pausa de Levy. `cadaMs = 0`: se lee al montar y al oír el evento, sin consultar cada tanto. `activo = false`: nada. */
export function usePausa(cadaMs = 3_000, activo = true) {
  const [pausa, setPausa] = useState<EstadoPausa | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => { try { setPausa(await pedir<EstadoPausa>('/api/seguridad/pausa')) } catch { /* daemon reiniciando */ } }, [])
  useEffect(() => {
    if (!activo) return
    void leer()
    const t = cadaMs > 0 ? window.setInterval(() => { if (document.visibilityState === 'visible') void leer() }, cadaMs) : 0
    const alCambiar = () => void leer()
    window.addEventListener(EVENTO_PAUSA, alCambiar)
    return () => { if (t) window.clearInterval(t); window.removeEventListener(EVENTO_PAUSA, alCambiar) }
  }, [leer, cadaMs, activo])
  const fijar = useCallback(async (pausado: boolean) => {
    setOcupado(true); setError(null)
    try { setPausa(await pedir<EstadoPausa>('/api/seguridad/pausa', { method: 'POST', body: JSON.stringify({ pausado }) })); window.dispatchEvent(new Event(EVENTO_PAUSA)); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.'); return false }
    finally { setOcupado(false) }
  }, [])
  return { pausa, ocupado, error, fijar }
}

/** Modo de permisos para toda la app (se consulta cada 10 s, al volver a la ventana y cuando otra vista lo cambia). */
export function useModoGlobal(cadaMs = 10_000, activo = true) {
  const [estado, setEstado] = useState<EstadoPermisosLevy | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => { try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos')) } catch { /* daemon reiniciando */ } }, [])
  useEffect(() => {
    if (!activo) return
    void leer()
    const t = cadaMs > 0 ? window.setInterval(() => { if (document.visibilityState === 'visible') void leer() }, cadaMs) : 0
    const alCambiar = () => void leer()
    window.addEventListener(EVENTO_PERMISOS, alCambiar)
    return () => { if (t) window.clearInterval(t); window.removeEventListener(EVENTO_PERMISOS, alCambiar) }
  }, [leer, cadaMs, activo])
  const mandar = useCallback(async (cuerpo: Record<string, unknown>) => {
    setOcupado(true); setError(null)
    try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos', { method: 'POST', body: JSON.stringify(cuerpo) })); window.dispatchEvent(new Event(EVENTO_PERMISOS)); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.'); return false }
    finally { setOcupado(false) }
  }, [])
  return { estado, autonomo: estado?.modo === 'autonomo', desde: estado?.consentimiento?.ts ?? null, ocupado, error, mandar }
}
