import type { ChatSession } from '../hooks/useChatHistory'

/**
 * Cambios a UNA conversación (menú «⋯», 1 oct 2026). Una acción desde «Recientes» o «Ver todas» cambia a la
 * vez cuatro listas que viven en lugares distintos (publicadas por ChatPanel, traídas por la barra, fijadas y
 * la del historial); en vez de que cada sitio recargue, la acción difunde el cambio y cada lista lo aplica.
 */
export const EVENTO_CAMBIO_SESION = 'openclaw:session-changed'

export type CambioSesion =
  | { tipo: 'parche'; id: string; parche: Partial<ChatSession> }
  | { tipo: 'quitada'; id: string; motivo: 'eliminada' | 'archivada' }
  | { tipo: 'agregada'; sesion: ChatSession }

export interface ListasRecientes {
  sesiones: ChatSession[]
  traidas: ChatSession[]
  fijadas: ChatSession[]
}

/** Aplica el cambio a una lista. Devuelve la MISMA lista (misma referencia) si no cambió nada: evita repintar. */
export function aplicarCambioALista(lista: ChatSession[], c: CambioSesion): ChatSession[] {
  if (c.tipo === 'parche') {
    if (!lista.some((s) => s.id === c.id)) return lista
    return lista.map((s) => (s.id === c.id ? { ...s, ...c.parche } : s))
  }
  if (c.tipo === 'quitada') {
    return lista.some((s) => s.id === c.id) ? lista.filter((s) => s.id !== c.id) : lista
  }
  return lista.some((s) => s.id === c.sesion.id) ? lista : [c.sesion, ...lista]
}

/**
 * Lo mismo para las tres listas de «Recientes». Fijar mueve la conversación entre `traidas` y `fijadas`
 * (las fijadas se piden aparte y sin importar su antigüedad); una conversación nueva (bifurcada o
 * desarchivada) entra en `traidas`, y en `fijadas` si venía fijada. `sesiones` la repuebla ChatPanel.
 */
export function aplicarCambioARecientes(st: ListasRecientes, c: CambioSesion): ListasRecientes {
  const sesiones = c.tipo === 'agregada' ? st.sesiones : aplicarCambioALista(st.sesiones, c)
  const traidas = aplicarCambioALista(st.traidas, c)
  let fijadas = st.fijadas
  if (c.tipo === 'parche' && typeof c.parche.is_favorite === 'boolean') {
    if (!c.parche.is_favorite) fijadas = st.fijadas.filter((s) => s.id !== c.id)
    else if (st.fijadas.some((s) => s.id === c.id)) fijadas = aplicarCambioALista(st.fijadas, c)
    else {
      const base = [...st.traidas, ...st.sesiones].find((s) => s.id === c.id)
      fijadas = base ? [{ ...base, ...c.parche }, ...st.fijadas] : st.fijadas
    }
  } else if (c.tipo === 'agregada') {
    fijadas = c.sesion.is_favorite ? aplicarCambioALista(st.fijadas, c) : st.fijadas
  } else {
    fijadas = aplicarCambioALista(st.fijadas, c)
  }
  if (sesiones === st.sesiones && traidas === st.traidas && fijadas === st.fijadas) return st
  return { sesiones, traidas, fijadas }
}
