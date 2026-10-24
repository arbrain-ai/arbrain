'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { aplicarCambioDrip, normalizarDoc, type CambioDrip, type DocDrip, type Tarifa } from './drip'

/** El documento DRIP tal como lo da /api/planning/drip: la tarifa efectiva (propia o de la instalación) y dónde vive. */
export interface DocDripVista extends DocDrip { tarifaPropia: boolean; almacen: 'archivo' | 'servidor' }

const EVENTO = 'arbrain:drip:cambio'

/**
 * El almacén DRIP en la app (24 oct 2026): se lee una vez, cada cambio se ve al instante (aplicado localmente con la MISMA
 * validación que el servidor) y se confirma con el documento que devuelve la ruta. Si el servidor no confirma, vuelve a lo de
 * antes y avisa. Otras superficies (sección, panel) se enteran por un evento de ventana y al volver al foco.
 */
export function useDrip() {
  const [doc, setDoc] = useState<DocDripVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef(doc); docRef.current = doc
  const leer = useCallback(async () => {
    try {
      const r = await fetch('/api/planning/drip', { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error ?? 'No se pudo leer DRIP.')
      setDoc({ ...normalizarDoc(b), tarifa: b.tarifa ?? null, tarifaPropia: Boolean(b.tarifaPropia), almacen: b.almacen === 'archivo' ? 'archivo' : 'servidor' })
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer DRIP.') }
  }, [])
  useEffect(() => {
    void leer()
    const otra = () => void leer()
    window.addEventListener(EVENTO, otra); window.addEventListener('focus', otra)
    return () => { window.removeEventListener(EVENTO, otra); window.removeEventListener('focus', otra) }
  }, [leer])

  const cambiar = useCallback(async (cambio: CambioDrip): Promise<DocDripVista> => {
    const antes = docRef.current
    if (antes) {
      const local = aplicarCambioDrip(antes, cambio)
      if (typeof local === 'string') throw new Error(local)
      const tarifa: Tarifa | null = cambio.accion === 'tarifa' ? local.tarifa : antes.tarifa
      setDoc({ ...local, tarifa, tarifaPropia: cambio.accion === 'tarifa' ? local.tarifa !== null : antes.tarifaPropia, almacen: antes.almacen })
    }
    try {
      const r = await fetch('/api/planning/drip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambio), signal: AbortSignal.timeout(30_000) })
      const b = await r.json()
      if (!r.ok) throw new Error(b.error ?? 'No se pudo guardar.')
      const nuevo: DocDripVista = { ...normalizarDoc(b), tarifa: b.tarifa ?? null, tarifaPropia: Boolean(b.tarifaPropia), almacen: b.almacen === 'archivo' ? 'archivo' : 'servidor' }
      setDoc(nuevo); setError(null)
      window.dispatchEvent(new Event(EVENTO))
      return nuevo
    } catch (e) {
      setDoc(antes)
      const m = e instanceof Error ? e.message : 'No se pudo guardar.'
      setError(m); throw new Error(m)
    }
  }, [])
  return { doc, error, cambiar, leer }
}
