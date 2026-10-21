import type { ChatSession } from '../hooks/useChatHistory'
import { hayNoVisto } from './session-status'
import { esHiloRutina } from '@/shared/constants/rutinas-hilos'

/**
 * Opciones del menú «⋯» de una conversación y su letra de atajo (1 oct 2026, como Claude Desktop). UNA sola
 * lista alimenta a «Recientes» y a «Ver todas»: lo que cambia entre filas es el estado (fijada, sin ver,
 * archivada), no el menú.
 */
export type AccionId = 'fijar' | 'favorita' | 'no-leida' | 'renombrar' | 'bifurcar' | 'archivar' | 'eliminar'

export interface OpcionMenu {
  id: AccionId
  /** Letra del atajo, en mayúscula. */
  letra: string
  etiqueta: string
  peligro?: boolean
  deshabilitada?: boolean
  /** Por qué está apagada (se muestra como título de la opción). */
  motivo?: string
  /** Línea separadora encima (la acción destructiva va aparte). */
  separador?: boolean
}

/**
 * El hilo de reportes («Automatizaciones», se ve como «Reportes») es fijo: no se desfija, renombra ni borra.
 * El webhook de los crons lo busca por título + fijado; desfijarlo haría que creara otro y partiera los reportes.
 */
export const esProtegida = (s: Pick<ChatSession, 'title'>) => s.title === 'Automatizaciones'

/** Sin menú: las sesiones solo-SDK no tienen fila en la base donde guardar nada. */
export const tieneMenu = (s: Pick<ChatSession, 'isSDKOnly' | 'pendingCreation'>) => !s.isSDKOnly && !s.pendingCreation

/** Favorita ≠ fijada (Daniel, 4 oct 2026): la estrella es aparte; marcarla también fija. */
const opcionFavorita = (s: ChatSession): OpcionMenu =>
  ({ id: 'favorita', letra: 'S', etiqueta: s.is_starred ? 'Quitar de favoritas' : 'Marcar como favorita' })

export function opcionesMenu(s: ChatSession): OpcionMenu[] {
  // Los hilos de la carpeta «Rutinas» son fijos (su id lo usa el webhook de los crons): solo leído/no leído.
  if (esHiloRutina(s)) {
    return [hayNoVisto(s)
      ? { id: 'no-leida', letra: 'U', etiqueta: 'Marcar como leído' }
      : { id: 'no-leida', letra: 'U', etiqueta: 'Marcar como no leído', deshabilitada: s.last_role !== 'assistant', motivo: s.last_role === 'assistant' ? undefined : 'Solo cuando Levy respondió al final' }]
  }
  if (esProtegida(s)) {
    // Fijado: solo leído/no leído. Un duplicado viejo sin fijar puede fijarse, nunca desfijarse el vigente.
    if (!s.is_favorite) return [{ id: 'fijar', letra: 'P', etiqueta: 'Fijar' }]
    return [opcionFavorita(s), hayNoVisto(s)
      ? { id: 'no-leida', letra: 'U', etiqueta: 'Marcar como leído' }
      : { id: 'no-leida', letra: 'U', etiqueta: 'Marcar como no leído', deshabilitada: s.last_role !== 'assistant', motivo: s.last_role === 'assistant' ? undefined : 'Solo cuando Levy respondió al final' }]
  }

  if (s.archived_at) {
    return [
      { id: 'archivar', letra: 'A', etiqueta: 'Desarchivar' },
      { id: 'eliminar', letra: 'D', etiqueta: 'Eliminar', peligro: true, separador: true },
    ]
  }

  const sinVer = hayNoVisto(s)
  // «No leído» solo se nota si Levy habló al final: el semáforo morado es «terminó y no la has visto».
  const puedeMarcarNoLeida = s.last_role === 'assistant'
  return [
    { id: 'fijar', letra: 'P', etiqueta: s.is_favorite ? 'Desfijar' : 'Fijar' },
    opcionFavorita(s),
    sinVer
      ? { id: 'no-leida', letra: 'U', etiqueta: 'Marcar como leído' }
      : {
          id: 'no-leida', letra: 'U', etiqueta: 'Marcar como no leído',
          deshabilitada: !puedeMarcarNoLeida,
          motivo: puedeMarcarNoLeida ? undefined : 'Solo cuando Levy respondió al final',
        },
    { id: 'renombrar', letra: 'R', etiqueta: 'Cambiar nombre' },
    { id: 'bifurcar', letra: 'F', etiqueta: 'Bifurcar' },
    { id: 'archivar', letra: 'A', etiqueta: 'Archivar' },
    { id: 'eliminar', letra: 'D', etiqueta: 'Eliminar', peligro: true, separador: true },
  ]
}

/** La opción que corresponde a una tecla (sin distinguir mayúsculas), o null. Las apagadas no responden. */
export function opcionPorTecla(opciones: readonly OpcionMenu[], tecla: string): OpcionMenu | null {
  if (tecla.length !== 1) return null
  const letra = tecla.toUpperCase()
  return opciones.find((o) => o.letra === letra && !o.deshabilitada) ?? null
}

/**
 * ¿Esta pulsación puede ser un atajo? Solo la letra sola: con Cmd/Ctrl/Alt es de otro atajo (copiar, global),
 * y dentro de un campo de texto es escribir.
 */
export function esTeclaDeAtajo(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing'>): boolean {
  // El espacio activa el botón enfocado: no es un atajo.
  return e.key.length === 1 && e.key.trim() !== '' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing
}
