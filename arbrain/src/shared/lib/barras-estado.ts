/**
 * Estado de la barra lateral de escritorio (1 oct 2026 la barra de iconos + la columna de conversaciones; 4 oct 2026,
 * pedido de Daniel desde el iPhone: «la barra de secciones ya no hace falta, las vistas viven en el panel»). Queda
 * UNA sola barra, la de conversaciones, con su visibilidad guardada en este equipo. Lógica pura y sin dependencias
 * para probarla sola; el almacén (barras-store.ts) la aplica y la guarda en localStorage.
 * Lo guardado por la versión de dos barras (`{iconos, conversaciones, previo}`) se sigue leyendo: solo importa `conversaciones`.
 */
export interface EstadoBarras { conversaciones: boolean }

export const CLAVE_BARRAS = 'barras-laterales:estado'
export const ESTADO_INICIAL: EstadoBarras = { conversaciones: true }

/** ⌘⇧B, `[` y el asa del borde. */
export function alternarConversaciones(e: EstadoBarras): EstadoBarras {
  return { conversaciones: !e.conversaciones }
}

/** Lee lo guardado; cualquier cosa rara (vacío, JSON roto, tipos distintos) vuelve al inicial. */
export function leerEstado(raw: string | null | undefined): EstadoBarras {
  if (!raw) return { ...ESTADO_INICIAL }
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || typeof (v as EstadoBarras).conversaciones !== 'boolean') return { ...ESTADO_INICIAL }
    return { conversaciones: (v as EstadoBarras).conversaciones }
  } catch {
    return { ...ESTADO_INICIAL }
  }
}

export const serializarEstado = (e: EstadoBarras): string => JSON.stringify(e)
