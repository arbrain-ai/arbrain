'use client'

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { CLAVE_MOSTRAR, EVENTO_MOSTRAR, MOSTRAR_POR_DEFECTO, guardar, igual, leer, type MostrarEnLienzo } from '../state/mostrar-en-lienzo'

const suscribir = (fn: () => void) => {
  const otraPestana = (e: StorageEvent) => { if (e.key === CLAVE_MOSTRAR || e.key === null) fn() }
  window.addEventListener(EVENTO_MOSTRAR, fn)
  window.addEventListener('storage', otraPestana)
  return () => { window.removeEventListener(EVENTO_MOSTRAR, fn); window.removeEventListener('storage', otraPestana) }
}

/** La preferencia viva: cambia al instante en toda pizarra montada (panel y sección) y en otras pestañas. */
export function useMostrarEnLienzo(): [MostrarEnLienzo, (cambio: Partial<MostrarEnLienzo>) => void] {
  const cache = useRef<MostrarEnLienzo>(MOSTRAR_POR_DEFECTO)
  // El snapshot debe ser estable mientras nada cambie: se reutiliza el objeto si el contenido es igual.
  const foto = useCallback(() => {
    const ahora = leer()
    if (!igual(ahora, cache.current)) cache.current = ahora
    return cache.current
  }, [])
  const m = useSyncExternalStore(suscribir, foto, () => MOSTRAR_POR_DEFECTO)
  const poner = useCallback((cambio: Partial<MostrarEnLienzo>) => guardar({ ...leer(), ...cambio }), [])
  return [m, poner]
}
