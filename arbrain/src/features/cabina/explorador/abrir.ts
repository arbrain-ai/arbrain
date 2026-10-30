/**
 * Qué pestaña abre un clic en el explorador (8 oct 2026). Como VS Code: un clic abre el archivo en la pestaña de VISTA PREVIA
 * (la que el siguiente clic reemplaza, para no llenar el panel de pestañas al recorrer el árbol); doble clic la deja fija.
 * Si el archivo ya está abierto en alguna pestaña, se trae esa. Pura: tests/cabina/explorador.test.ts.
 */
import type { MostrarInput } from '../model'

interface PestanaDoc { id: string; input: MostrarInput; guardada?: boolean }

export type Plan =
  | { tipo: 'traer'; id: string; fijar: boolean }
  | { tipo: 'reemplazar'; id: string }
  | { tipo: 'nueva' }

const mismaRuta = (a?: string, b?: string) => !!a && !!b && a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** `enDestino`: la vista previa que se reemplaza es la de la ventana donde abre el explorador (11 oct: «Dónde abre Levy»), no la de otra. */
export function planApertura(pestanas: readonly PestanaDoc[], ruta: string, modo: 'previa' | 'fija', enDestino: (id: string) => boolean = () => true): Plan {
  const ya = pestanas.find(f => f.input.vista === 'documento' && mismaRuta(f.input.ruta, ruta))
  // `fijar`: el doble clic fija la previa, y una pestaña que abrió Levy pasa a enseñar el código (queda fija: no era previa).
  if (ya) return { tipo: 'traer', id: ya.id, fijar: ya.input.explorador !== 'fija' && (modo === 'fija' || !ya.input.explorador) }
  if (modo === 'previa') {
    // Solo se reemplaza la previa que nadie guardó: lo guardado es de Daniel.
    const previa = pestanas.find(f => f.input.vista === 'documento' && f.input.explorador === 'previa' && !f.guardada && enDestino(f.id))
    if (previa) return { tipo: 'reemplazar', id: previa.id }
  }
  return { tipo: 'nueva' }
}

/** La invocación de un archivo abierto desde el explorador. */
export const inputArchivo = (ruta: string, nombre: string, modo: 'previa' | 'fija'): MostrarInput => ({ vista: 'documento', ruta, titulo: nombre, explorador: modo })
