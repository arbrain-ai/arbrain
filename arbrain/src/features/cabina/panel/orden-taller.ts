'use client'
/**
 * El orden del Taller, a gusto del dueño (15 oct 2026, Daniel: «dado que es el taller, permíteme unos botones para reordenar
 * todo esto, tipo agarrar y reordenar con animación y todo»). Dos listas: las secciones de Máquina y las pestañas del Taller.
 *
 * Se guarda solo la lista de ids (`arbrain.taller.orden` en localStorage: sobrevive reinicios de la app y del Mac); una
 * sección nueva entra en su lugar por defecto y lo que ya no existe se descarta (la misma regla del menú «+»:
 * `ordenarMenu`). Otra ventana con el Taller abierto se entera por el evento `storage` y se reacomoda sola.
 * Pura la parte de reglas (menu-orden.ts, con sus pruebas); aquí solo el recuerdo.
 */
import { useCallback, useEffect, useState } from 'react'
import { moverEnMenu, ordenarMenu } from './menu-orden'

const CLAVE = 'arbrain.taller.orden'
export type ListaTaller = 'maquina' | 'pestanas'

function leerTodo(): Record<string, unknown> {
  try { const x = JSON.parse(localStorage.getItem(CLAVE) ?? '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} }
}

/** El orden guardado de `lista` aplicado a las opciones de hoy (`porDefecto`). */
export function ordenGuardado(lista: ListaTaller, porDefecto: string[]) {
  return ordenarMenu(porDefecto, typeof window === 'undefined' ? null : leerTodo()[lista])
}

export function useOrdenTaller(lista: ListaTaller, porDefecto: string[]) {
  const clave = porDefecto.join('|')
  const [orden, setOrden] = useState<string[]>(porDefecto)
  // Se lee al montar (en el servidor no hay localStorage) y cuando otra ventana lo cambia.
  useEffect(() => {
    const base = clave.split('|')
    setOrden(ordenGuardado(lista, base))
    const oir = (e: StorageEvent) => { if (e.key === CLAVE) setOrden(ordenGuardado(lista, base)) }
    window.addEventListener('storage', oir)
    return () => window.removeEventListener('storage', oir)
  }, [lista, clave])
  const mover = useCallback((id: string, indice: number) => {
    setOrden(prev => {
      const nuevo = moverEnMenu(prev, id, indice)
      try { localStorage.setItem(CLAVE, JSON.stringify({ ...leerTodo(), [lista]: nuevo })) } catch { /* sin almacenamiento */ }
      return nuevo
    })
  }, [lista])
  const restablecer = useCallback(() => {
    try { const t = leerTodo(); delete t[lista]; localStorage.setItem(CLAVE, JSON.stringify(t)) } catch { /* sin almacenamiento */ }
    setOrden(clave.split('|'))
  }, [lista, clave])
  return { orden, mover, restablecer }
}

/** Índice en el orden COMPLETO para que `id` quede en la posición `destino` entre las secciones visibles (sin él). */
export function indiceCompleto(orden: string[], visibles: string[], id: string, destino: number) {
  const otras = visibles.filter(x => x !== id)
  const sin = orden.filter(x => x !== id)
  if (destino >= otras.length) return otras.length ? sin.indexOf(otras[otras.length - 1]) + 1 : sin.length
  return sin.indexOf(otras[Math.max(0, destino)])
}
