'use client'
/**
 * Reloj compartido para lo que cuenta en vivo («lleva 12 min»), 2 oct 2026. Un solo intervalo
 * para todas las filas montadas; solo corre mientras alguien lo necesita (`activo`), y se
 * apaga solo cuando ya no hay quien lo escuche.
 */
import { useSyncExternalStore } from 'react'

const TICK_MS = 5000
let reloj = Date.now()
const oyentes = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function suscribir(avisar: () => void) {
  reloj = Date.now()
  oyentes.add(avisar)
  if (!timer) timer = setInterval(() => { reloj = Date.now(); oyentes.forEach(f => f()) }, TICK_MS)
  return () => {
    oyentes.delete(avisar)
    if (!oyentes.size && timer) { clearInterval(timer); timer = null }
  }
}
const sinSuscribir = () => () => {}

/** La hora de ahora, refrescada cada 5 s mientras `activo`; inactivo devuelve la hora de la última lectura. */
export function useAhora(activo = true): number {
  const ahora = useSyncExternalStore(activo ? suscribir : sinSuscribir, () => reloj, () => reloj)
  return activo ? ahora : Date.now()
}
