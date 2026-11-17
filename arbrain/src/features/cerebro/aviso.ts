/**
 * «Ver tu cerebro»: qué decir cuando no hay cerebro que pintar (16 nov 2026, fundador en Windows: la sección salía vacía
 * con «El servidor respondió 404»). Regla del alumno: nunca en blanco, nunca un código solo; una frase y qué hacer.
 * En la instalación del autor, sus textos de siempre (el cerebro vive en el disco del Studio). Puro: lo prueba
 * tests/edicion/ver-tu-cerebro-cliente.test.ts.
 */
import { tr } from '@/shared/i18n'
import type { CerebroGraph } from './types'

export interface EstadoCerebro {
  grafo: Pick<CerebroGraph, 'ok' | 'nodes'> & Partial<CerebroGraph> | null
  /** Respuesta no-ok de la ruta (`status` HTTP) o falla de red (`status: 0`). */
  error: { status: number } | null
  cliente: boolean
}

/** La síntesis llama al CLI de Claude del equipo y a la ruta `/synthesize`: en la edición del alumno no viaja (todavía). */
export function sintesisDisponible(cliente: boolean): boolean {
  return !cliente
}

/** La frase que va en el lienzo cuando no se puede pintar el cerebro; `null` si hay algo que pintar. */
export function avisoCerebro({ grafo, error, cliente }: EstadoCerebro): string | null {
  if (error) {
    if (error.status === 403) return tr('Solo el dueño puede ver el cerebro.')
    if (!cliente) return error.status ? tr('El servidor respondió {estado}.', { estado: error.status }) : tr('No se pudo leer el cerebro.')
    return tr('No pude leer tu cerebro. Cierra y vuelve a abrir Arbrain; si sigue igual, escríbele a Levy «actualiza mi Arbrain».')
  }
  if (!grafo) return null
  if (!grafo.ok) {
    return cliente
      ? tr('No encuentro la carpeta de tu cerebro. Cierra y vuelve a abrir Arbrain para que la prepare; si sigue igual, escríbele a Levy «actualiza mi Arbrain».')
      : tr('El cerebro vive en el disco del Studio y esta máquina no lo tiene montado. Ábrelo en el Studio o en la app de escritorio.')
  }
  if (grafo.nodes.length === 0 && cliente) {
    return tr('Tu cerebro todavía está vacío. Cuéntale a Levy en el chat quién eres y a qué te dedicas: lo que recuerde y las habilidades que le des aparecerán aquí.')
  }
  return null
}
