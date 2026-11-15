'use client'
/**
 * Mapa v16 · el ALMACÉN de datos vivos de las islas (14 nov 2026): una lectura por fuente para todo el mapa. Lo leen igual
 * los bloques vivos (React, `useDato`), el dibujo ligero del canvas (los números se ven vivos también de lejos) y el puente
 * de las islas HTML. Debajo está la caché de la app (`cabina/datos.ts › fuenteFresca`): un panel abierto y el mapa
 * comparten la misma lectura.
 *
 * Una lectura que falla NO borra el último dato bueno (la isla no parpadea a error). Sin React salvo `useDato`.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { mismaLectura, type LecturaFuente } from './fuentes'

export class AlmacenFuentes {
  private cache = new Map<string, LecturaFuente>()
  private vuelo = new Map<string, Promise<LecturaFuente>>()
  private subs = new Map<string, Set<() => void>>()
  private todos = new Set<() => void>()
  private version = 0

  constructor(private leerUna: (f: string) => Promise<LecturaFuente>) {}

  get(f: string): LecturaFuente | undefined { return this.cache.get(f) }
  /** Sube con cada cambio de cualquier fuente: el canvas lo usa para saber si volver a pintar. */
  get versionActual() { return this.version }

  leer(f: string): Promise<LecturaFuente> {
    const ya = this.vuelo.get(f)
    if (ya) return ya
    const p = this.leerUna(f)
      .catch((e: unknown): LecturaFuente => ({ estado: 'error', valor: null, fecha: null, error: e instanceof Error ? e.message : String(e) }))
      .then(l => {
        this.vuelo.delete(f)
        const antes = this.cache.get(f)
        if (l.estado === 'error' && antes && antes.estado === 'ok') return antes
        this.cache.set(f, l)
        if (!mismaLectura(antes, l)) {
          this.version++
          this.subs.get(f)?.forEach(fn => fn())
          this.todos.forEach(fn => fn())
        }
        return l
      })
    this.vuelo.set(f, p)
    return p
  }

  /** Pide las que aún no hay (sin repetir las que van en camino). */
  asegurar(fuentes: Iterable<string>) { for (const f of fuentes) if (!this.cache.has(f) && !this.vuelo.has(f)) void this.leer(f) }
  refrescar(fuentes: Iterable<string>) { return Promise.all([...fuentes].map(f => this.leer(f))) }

  suscribir(f: string, fn: () => void) {
    let s = this.subs.get(f)
    if (!s) { s = new Set(); this.subs.set(f, s) }
    s.add(fn)
    return () => { s!.delete(fn) }
  }
  alCambiar(fn: () => void) { this.todos.add(fn); return () => { this.todos.delete(fn) } }
}

const LEYENDO: LecturaFuente = { estado: 'leyendo', valor: null, fecha: null }
const nada = () => () => {}

/** La lectura viva de una fuente para un bloque. Sin fuente (o sin almacén): undefined. */
export function useDato(almacen: AlmacenFuentes | null, fuente: string | null | undefined): LecturaFuente | undefined {
  const l = useSyncExternalStore(
    almacen && fuente ? fn => almacen.suscribir(fuente, fn) : nada,
    () => (almacen && fuente ? almacen.get(fuente) ?? LEYENDO : undefined),
    () => undefined,
  )
  useEffect(() => { if (almacen && fuente) almacen.asegurar([fuente]) }, [almacen, fuente])
  return l
}
