/**
 * La configuración vigente de esta instalación. Edición cliente: siempre la plantilla genérica (aunque el build salga
 * del repo de Daniel). Instalación de Daniel: `instalacion.ts`.
 */
import { esEdicionCliente } from '@/lib/edicion'
import { INSTALACION } from './instalacion'
import { INSTALACION as GENERICA } from './instalacion.plantilla'
import type { Instalacion } from './tipos'

export type { Instalacion } from './tipos'

export function instalacion(): Instalacion {
  return esEdicionCliente() ? GENERICA : INSTALACION
}

/** Clave y nombre de la persona dueña y de la segunda persona (ver `tipos.ts › personas`). */
export const DUENO = () => instalacion().personas.dueno.clave
export const SEGUNDA = () => instalacion().personas.segunda.clave
export const NOMBRE_DUENO = () => instalacion().personas.dueno.nombre
export const NOMBRE_SEGUNDA = () => instalacion().personas.segunda.nombre
/** Mayúscula inicial para empezar una frase con el nombre («La persona dueña…», «Daniel…»). */
export const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
