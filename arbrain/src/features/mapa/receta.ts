/**
 * Mapa v16 · la RECETA de una isla (14 nov 2026). Daniel, 07:30: editar los lienzos sin reiniciar la app. Una isla ya no
 * es código: es un JSON que compone BLOQUES nativos compilados en la app (número vivo, tarjeta de órgano, anillo NOVA,
 * escalera, botón a destino, cita…). Levy edita la receta y la isla cambia en vivo.
 *
 *   { "esquema": "arbrain.isla/v1", "id": "norte", "titulo": "Mi norte", "tema": "Mi norte",
 *     "ancho": 1440, "alto": 1400, "acento": "oro",
 *     "filas": [ { "bloques": [ { "tipo": "encabezado", "ceja": "…", "titulo": "…" } ] },
 *                { "alto": 900, "bloques": [ { "tipo": "nova", "peso": 1, … } ] } ] }
 *
 * La isla se lee de arriba hacia abajo por FILAS; dentro de una fila los bloques se reparten el ancho por su `peso`
 * (1 si no lo dicen). Cada bloque es `{ tipo, …sus props }`; su forma la valida su propio componente (lo que no entiende
 * lo ignora y lo dice). Puro: se prueba sin navegador (tests/mapa/receta.test.ts).
 */

export const ESQUEMA_ISLA = 'arbrain.isla/v1'
export const TEMAS_MAPA = ['Mi norte', 'El sistema nervioso', 'La oferta', 'El programa'] as const
export type TemaMapa = (typeof TEMAS_MAPA)[number]

export interface Bloque { tipo: string; id?: string; peso?: number; [k: string]: unknown }
export interface Fila { bloques: Bloque[]; alto?: number; gap?: number; alinear?: 'inicio' | 'centro' | 'fin' | 'estirar'; aire?: number }
export interface Receta {
  esquema: typeof ESQUEMA_ISLA
  id: string
  titulo: string
  tema?: TemaMapa
  ancho: number
  alto: number
  /** La luz de la isla: de dónde viene el resplandor de fondo. */
  acento?: 'oro' | 'morado' | 'neutro'
  filas: Fila[]
}

export type LecturaReceta = { ok: true; receta: Receta; avisos: string[] } | { ok: false; errores: string[] }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const num = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max

/**
 * Lee una receta con tolerancia: lo que no cumple se descarta con aviso (un bloque sin `tipo`, una fila vacía); sin `id`,
 * sin tamaño o sin filas no hay isla. `tipos` = los bloques que la app sabe pintar (un tipo desconocido se avisa y se
 * conserva: el componente pinta su hueco, así la receta no pierde lo que Levy escribió para una versión más nueva).
 */
export function leerReceta(crudo: unknown, tipos?: ReadonlySet<string>): LecturaReceta {
  const errores: string[] = [], avisos: string[] = []
  if (!obj(crudo)) return { ok: false, errores: ['La receta no es un objeto JSON.'] }
  const x = deRejilla(crudo)
  if (x.esquema !== ESQUEMA_ISLA) avisos.push(`Esquema «${String(x.esquema)}»: se esperaba ${ESQUEMA_ISLA}.`)
  const id = typeof x.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x.id) ? x.id : null
  if (!id) errores.push('Falta «id» (minúsculas, números y guiones).')
  if (!num(x.ancho, 320, 8000)) errores.push('«ancho» debe ser un número entre 320 y 8000.')
  if (!num(x.alto, 120, 8000)) errores.push('«alto» debe ser un número entre 120 y 8000.')
  if (!Array.isArray(x.filas) || !x.filas.length) errores.push('Faltan «filas».')
  if (errores.length) return { ok: false, errores }
  const filas: Fila[] = []
  ;(x.filas as unknown[]).forEach((f, i) => {
    if (!obj(f) || !Array.isArray(f.bloques)) { avisos.push(`Fila ${i + 1}: sin «bloques», se omite.`); return }
    const bloques: Bloque[] = []
    f.bloques.forEach((b, j) => {
      if (!obj(b) || typeof b.tipo !== 'string' || !b.tipo) { avisos.push(`Fila ${i + 1}, bloque ${j + 1}: sin «tipo», se omite.`); return }
      if (tipos && !tipos.has(b.tipo)) avisos.push(`Fila ${i + 1}: el bloque «${b.tipo}» no existe en esta versión de la app.`)
      bloques.push({ ...b, tipo: b.tipo, peso: num(b.peso, 0.05, 100) ? (b.peso as number) : 1 })
    })
    if (!bloques.length) { avisos.push(`Fila ${i + 1}: vacía, se omite.`); return }
    filas.push({
      bloques,
      ...(num(f.alto, 10, 8000) ? { alto: f.alto as number } : {}),
      ...(num(f.gap, 0, 400) ? { gap: f.gap as number } : {}),
      ...(num(f.aire, 0, 800) ? { aire: f.aire as number } : {}),
      ...(f.alinear === 'inicio' || f.alinear === 'centro' || f.alinear === 'fin' || f.alinear === 'estirar' ? { alinear: f.alinear } : {}),
    })
  })
  if (!filas.length) return { ok: false, errores: ['Ninguna fila tiene bloques que se puedan pintar.'] }
  const tema = (TEMAS_MAPA as readonly string[]).includes(x.tema as string) ? (x.tema as TemaMapa) : undefined
  const acento = x.acento === 'oro' || x.acento === 'morado' || x.acento === 'neutro' ? x.acento : undefined
  return {
    ok: true, avisos,
    receta: {
      esquema: ESQUEMA_ISLA, id: id!, titulo: typeof x.titulo === 'string' && x.titulo.trim() ? x.titulo.trim() : id!,
      ...(tema ? { tema } : {}), ancho: x.ancho as number, alto: x.alto as number, ...(acento ? { acento } : {}), filas,
    },
  }
}

/**
 * Una receta en la REJILLA del MOTOR (`bloques` con `en: [columna, fila, ancho, alto]`, CONTRATO-MOTOR.md) se lee aquí en
 * filas: los bloques se agrupan por la fila donde empiezan y su ancho en columnas es su peso. Así el laboratorio y la
 * galería pintan la misma receta que el lienzo.
 */
export function deRejilla(x: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(x.bloques) || Array.isArray(x.filas)) return x
  const rej = obj(x.rejilla) ? x.rejilla : {}
  const FILA = typeof rej.fila === 'number' ? rej.fila : 56, HUECO = typeof rej.hueco === 'number' ? rej.hueco : 16
  const en = (b: Record<string, unknown>) => (Array.isArray(b.en) && b.en.length === 4 ? b.en as number[] : [0, 0, 12, 4])
  const grupos = new Map<number, Record<string, unknown>[]>()
  for (const b of x.bloques) { if (!obj(b)) continue; const k = en(b)[1]; grupos.set(k, [...(grupos.get(k) ?? []), b]) }
  const filas = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([, bs]) => ({
    alto: Math.max(...bs.map(b => en(b)[3])) * (FILA + HUECO) - HUECO,
    bloques: [...bs].sort((a, b) => en(a)[0] - en(b)[0]).map(b => ({ ...b, peso: en(b)[2] })),
  }))
  return { ...x, filas, acento: x.variante === 'oro' ? 'oro' : x.variante === 'morado' ? 'morado' : 'neutro' }
}

/** Las fuentes vivas que usa una receta (para pedirlas antes y rehacer su foto): las que sus bloques declaran. */
export function fuentesDe(r: Receta): string[] {
  const out = new Set<string>()
  const ver = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(ver)
    else if (obj(v)) for (const [k, w] of Object.entries(v)) { if (k === 'fuente' && typeof w === 'string') out.add(w); else ver(w) }
  }
  r.filas.forEach(f => f.bloques.forEach(ver))
  return [...out].sort()
}

/** Los destinos de sus botones (todo `destino` que aparezca en la receta). */
export function destinosDe(r: Receta): string[] {
  const out = new Set<string>()
  const ver = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(ver)
    else if (obj(v)) for (const [k, w] of Object.entries(v)) { if (k === 'destino' && typeof w === 'string') out.add(w); else ver(w) }
  }
  r.filas.forEach(f => f.bloques.forEach(ver))
  return [...out].sort()
}
