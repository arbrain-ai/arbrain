/**
 * Lo que recibe cada BLOQUE de una isla (mapa v16, 14 nov 2026). El bloque es nativo (compilado en la app); lo que dice y
 * de dónde lee vienen de su receta (`b`). El lienzo pone el contexto:
 *   · `modo`: 'lejos' = versión ligera, sin animación (lo que se ve al pasar con la cámara); 'cerca' = viva.
 *   · `tema`: el del lienzo, que puede no ser el de la app.
 *   · `ir(destino)`: abre `panel:` `doc:` `url:` `lienzo:` con la lista blanca de canvas/islas/destinos.ts.
 */
import type { ComponentType } from 'react'
import type { Bloque } from './receta'

export type ModoIsla = 'lejos' | 'cerca'
export type TemaIsla = 'claro' | 'oscuro'

export interface Contexto {
  modo: ModoIsla
  tema: TemaIsla
  ir: (destino: string) => void
}

export interface PropsBloque<B extends Bloque = Bloque> { b: B; ctx: Contexto }
export type ComponenteBloque = ComponentType<PropsBloque<any>>   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Leer un campo de la receta con tolerancia: el tipo que se espera o el respaldo. */
export const texto = (v: unknown, r = ''): string => (typeof v === 'string' ? v : r)
export const lista = <T,>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(ok) : [])
export const esTexto = (x: unknown): x is string => typeof x === 'string'
export const esObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
export const numero = (v: unknown, r: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : r)
