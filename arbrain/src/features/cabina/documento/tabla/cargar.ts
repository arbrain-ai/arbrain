/**
 * Lo que el visor descarga solo al abrir una tabla (import dinámico): los lectores de CSV y .xlsx (con fflate).
 * El modelo (ordenar, filtrar, resumir) es liviano y viaja con la vista.
 */
import { leerCsv } from './csv'
import { leerXlsx } from './xlsx'
import { tablaDeFilas, tablaDeHoja, type Tabla } from './modelo'
import type { Idioma } from './formato'

export interface HojaVista { nombre: string; oculta: boolean; tabla: Tabla }
export interface LibroVista { hojas: HojaVista[]; separador?: string; ms: number }

const SEPARADORES: Record<string, string> = { ',': 'coma', ';': 'punto y coma', '\t': 'tabulador', '|': 'barra' }
export const nombreSeparador = (s?: string) => (s ? SEPARADORES[s] : undefined)

export function abrirLibro(bytes: Uint8Array, tipo: 'csv' | 'xlsx', nombre: string, opciones: { idioma: Idioma; locale: string }): LibroVista {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (tipo === 'csv') {
    const { filas, separador } = leerCsv(bytes, nombre)
    const tabla = tablaDeFilas(filas, { locale: opciones.locale })
    return { hojas: [{ nombre: nombre.replace(/\.[^.]+$/, ''), oculta: false, tabla }], separador, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 }
  }
  const libro = leerXlsx(bytes, { idioma: opciones.idioma })
  const hojas = libro.hojas.map(h => ({ nombre: h.nombre, oculta: h.oculta, tabla: tablaDeHoja(h) }))
  return { hojas, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 }
}
