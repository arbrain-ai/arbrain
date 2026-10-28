/**
 * Dieta de contexto de la Cabina (27 oct 2026): lo que el modelo recibe en cada turno por las herramientas.
 * Medida = descripción + inputSchema serializado (JSON.stringify), como viaja en tools/list. Puro: lo usan el
 * sensor (dieta.test.ts) y el script `npm run herramientas:tamano`.
 */

/** Tope de la cabina por turno, en caracteres (descripciones + schemas). Antes de la dieta: ~25,400. */
export const TOPE_CABINA = 8000

/** Fecha fija escrita a mano («sáb 17 oct», «mar 20 de octubre»): en una descripción se vence sola. */
export const FECHA_FIJA = /\b(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-z]*\.?\s+\d{1,2}(\s+de)?\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i

export interface FilaTamano { nombre: string; descripcion: number; schema: number; total: number }

export function medirHerramientas(tools: ReadonlyArray<{ name: string; description: string; inputSchema: unknown }>): { filas: FilaTamano[]; total: number } {
  const filas = tools.map(t => {
    const descripcion = t.description.length
    const schema = JSON.stringify(t.inputSchema).length
    return { nombre: t.name, descripcion, schema, total: descripcion + schema }
  })
  return { filas, total: filas.reduce((s, f) => s + f.total, 0) }
}

/** Todos los textos de una herramienta que ve el modelo: su descripción y las descripciones de sus campos. */
export function textosDe(t: { description: string; inputSchema: unknown }): string[] {
  const out = [t.description]
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'description' && typeof x === 'string') out.push(x)
      else walk(x)
    }
  }
  walk(t.inputSchema)
  return out
}
