import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Modo presentación (22 oct 2026, Daniel comparte pantalla con la cohorte): lo privado se oculta del todo. Arbrain no tenía un
 * estado de «compartiendo pantalla», así que es un interruptor de este equipo (localStorage): se prende en la máquina que se
 * comparte y no viaja al teléfono. Hoy lo respetan los hábitos privados (fila «Hábitos de hoy», Ctrl+H y Salud).
 */
const CLAVE = 'arbrain.presentacion'
const leer = () => { try { return window.localStorage.getItem(CLAVE) === '1' } catch { return false } }

export const usePresentacion = create<{ activo: boolean; hidratado: boolean; hidratar: () => void; alternar: () => void }>((set, get) => ({
  activo: false, hidratado: false,
  hidratar: () => { if (!get().hidratado) set({ activo: typeof window !== 'undefined' && leer(), hidratado: true }) },
  alternar: () => {
    const activo = !get().activo
    try { window.localStorage.setItem(CLAVE, activo ? '1' : '0') } catch { /* modo privado del navegador */ }
    set({ activo, hidratado: true })
  },
}))

/** El estado, ya leído de este equipo (la lectura va en un efecto: el servidor no sabe si estás presentando). */
export function useModoPresentacion() {
  const p = usePresentacion()
  useEffect(() => { usePresentacion.getState().hidratar() }, [])
  return p
}
