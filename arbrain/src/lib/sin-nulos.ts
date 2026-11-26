/**
 * Postgres no guarda el carácter NUL (U+0000) ni en `text` ni en `jsonb` («unsupported Unicode escape sequence»), ni una
 * mitad suelta de un par sustituto. Una salida de herramienta con NUL (16 nov 2026: un turno «Sin filtro» que leyó un
 * archivo binario de subtítulos, 1,429 NUL en su runtimeSnapshot) hacía fallar la entrega del turno con 500 para siempre,
 * y como las entregas de una conversación van en orden, todas las respuestas siguientes de esa conversación se quedaban
 * sin guardar: el historial mostraba solo las preguntas. Se limpian todas las cadenas, a cualquier profundidad.
 */
export function sinNulos<T>(valor: T): T {
  if (typeof valor === 'string') {
    const limpio = valor.includes('\u0000') ? valor.split('\u0000').join('') : valor
    return (typeof limpio.toWellFormed === 'function' ? limpio.toWellFormed() : limpio) as T
  }
  if (Array.isArray(valor)) return valor.map(sinNulos) as T
  if (valor && typeof valor === 'object') {
    const fuera: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) fuera[sinNulos(k)] = sinNulos(v)
    return fuera as T
  }
  return valor
}
