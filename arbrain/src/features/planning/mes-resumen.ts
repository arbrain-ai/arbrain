/**
 * El resumen de una semana en el Mes (28 oct 2026, Daniel: «la vista Mes no debe listar cada diagnóstico con nombre de persona; eso es
 * de la semana. En el mes cada semana muestra su objetivo y, a lo sumo, un resumen («6 uno a uno · demo day»)»). Lógica pura
 * (tests/planning/mes-resumen.test.ts).
 *
 * Cada evento se reduce a su TIPO: lo de antes del primer « · » o «:» del título, sin emoji y en minúsculas («Diagnóstico · Fulana…»
 * → «diagnóstico»). Los diagnósticos con fundadores son los uno a uno del programa, así que se cuentan como «uno a uno». Lo de un día
 * se cuenta («7 uno a uno»); lo de varios días (el periodo «Uno a uno · al cerrar la etapa») solo nombra su tipo, una vez.
 */
const ALIAS: readonly [RegExp, string][] = [[/^diagn[oó]stico/, 'uno a uno'], [/^uno a uno/, 'uno a uno'], [/^1\s*a\s*1/, 'uno a uno']]
const MAX = 4

export function tipoDe(titulo: string): string {
  const limpio = (titulo ?? '').replace(/^\s*(?:✓\s*)?(?:[\p{Extended_Pictographic}‍️]+\s*)+/u, '').trim()
  const base = (/^(.+?)\s*(?:·|:|—| - )/.exec(limpio)?.[1] ?? limpio).trim().toLowerCase()
  return ALIAS.find(([re]) => re.test(base))?.[1] ?? base
}

/** «7 uno a uno · demo day»; null sin nada. En el orden en que aparecen; más de cuatro tipos, «+N». */
export function resumenSemana(items: readonly { titulo: string; variosDias: boolean }[]): string | null {
  const orden: string[] = [], cuenta = new Map<string, number>()
  for (const x of items) {
    const t = tipoDe(x.titulo)
    if (!t) continue
    if (!cuenta.has(t)) { orden.push(t); cuenta.set(t, 0) }
    if (!x.variosDias) cuenta.set(t, cuenta.get(t)! + 1)
  }
  if (!orden.length) return null
  const partes = orden.map(t => cuenta.get(t)! > 1 ? `${cuenta.get(t)} ${t}` : t)
  return (partes.length > MAX ? [...partes.slice(0, MAX), `+${partes.length - MAX}`] : partes).join(' · ')
}
