/**
 * Sobre de entrega a /api/chat/complete con tamaño acotado (1 oct 2026).
 *
 * Un turno con 82 llamadas a `cua_repl` llevaba capturas en base64 en cada resultado
 * (hasta 765 KB c/u, duplicadas en `tools` e `items`): 10,8 MB de sobre para 3 KB de
 * respuesta. Next corta el cuerpo en 10 MB, el JSON llega truncado, la ruta responde 500
 * y el outbox reintenta para siempre, bloqueando las entregas siguientes de esa
 * conversación. Aquí se recorta SOLO la copia que viaja: el journal conserva el resultado
 * completo (lo sirve `/chat/turn`). El texto de la respuesta nunca se recorta antes que el detalle.
 */
export const DELIVERY_BUDGET_BYTES = 4 * 1024 * 1024
const FIELD_CAP = 16 * 1024
const THINKING_CAP = 64 * 1024

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')

function clip(value: string, cap: number): string {
  if (Buffer.byteLength(value, 'utf8') <= cap) return value
  const kb = Math.round(Buffer.byteLength(value, 'utf8') / 1024)
  return `${value.slice(0, cap)}\n… [recortado para la entrega: ${kb} KB; el resultado completo queda en el journal del servidor]`
}

/** Recorta cadenas largas en cualquier profundidad (resultados de herramientas, salidas, datos). */
function clipDeep(value: unknown, cap: number): unknown {
  if (typeof value === 'string') return clip(value, cap)
  if (Array.isArray(value)) return value.map(item => clipDeep(item, cap))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clipDeep(v, cap)]))
  return value
}

/** Solo lo que identifica cada herramienta/ítem: nombre, tipo, estado, error, duración. */
function skeleton(record: unknown): unknown {
  if (!record || typeof record !== 'object') return record
  return Object.fromEntries(Object.entries(record as Record<string, unknown>).map(([key, entry]) => {
    if (!entry || typeof entry !== 'object') return [key, entry]
    const kept: Record<string, unknown> = {}
    for (const field of ['id', 'name', 'type', 'status', 'error', 'durationMs']) {
      const v = (entry as Record<string, unknown>)[field]
      if (v !== undefined && (typeof v !== 'string' || v.length <= 512)) kept[field] = v
    }
    return [key, kept]
  }))
}

export interface CompactedDelivery<T> { payload: T; trimmed: boolean; originalBytes: number; bytes: number; stage: 'intacto' | 'campos' | 'esqueleto' | 'texto' }

export function compactDelivery<T extends Record<string, unknown>>(payload: T, budget = DELIVERY_BUDGET_BYTES): CompactedDelivery<T> {
  const originalBytes = bytes(payload)
  if (originalBytes <= budget) return { payload, trimmed: false, originalBytes, bytes: originalBytes, stage: 'intacto' }
  const snapshot = (payload.runtimeSnapshot && typeof payload.runtimeSnapshot === 'object' ? payload.runtimeSnapshot : {}) as Record<string, unknown>
  const mark = (stage: CompactedDelivery<T>['stage']) => ({ originalBytes, stage, note: 'El detalle de herramientas viajó recortado; el resultado completo queda en el journal del servidor.' })

  // 1) Cada campo largo a 16 KB (capturas en base64, salidas de comandos, lecturas de archivos).
  let next = { ...payload, runtimeSnapshot: { ...snapshot,
    ...(['tools', 'items', 'tasks', 'questions'] as const).reduce((acc, key) => (snapshot[key] === undefined ? acc : { ...acc, [key]: clipDeep(snapshot[key], FIELD_CAP) }), {}),
    ...(typeof snapshot.thinking === 'string' ? { thinking: clip(snapshot.thinking, THINKING_CAP) } : {}),
    deliveryTrimmed: mark('campos') } } as T
  if (bytes(next) <= budget) return { payload: next, trimmed: true, originalBytes, bytes: bytes(next), stage: 'campos' }

  // 2) Solo el esqueleto de herramientas e ítems.
  next = { ...next, runtimeSnapshot: { ...(next.runtimeSnapshot as Record<string, unknown>),
    tools: skeleton(snapshot.tools), items: skeleton(snapshot.items), tasks: skeleton(snapshot.tasks), deliveryTrimmed: mark('esqueleto') } } as T
  if (bytes(next) <= budget) return { payload: next, trimmed: true, originalBytes, bytes: bytes(next), stage: 'esqueleto' }

  // 3) Último recurso: el texto mismo excede el presupuesto. Se entrega su inicio y se dice.
  const textCap = Math.floor(budget / 3)
  const assistantMessage = typeof next.assistantMessage === 'string' ? clip(next.assistantMessage, textCap) : next.assistantMessage
  next = { ...next, assistantMessage, runtimeSnapshot: { ...(next.runtimeSnapshot as Record<string, unknown>),
    text: assistantMessage, thinking: '', deliveryTrimmed: mark('texto') } } as T
  return { payload: next, trimmed: true, originalBytes, bytes: bytes(next), stage: 'texto' }
}
