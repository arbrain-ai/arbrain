/**
 * Rutas del Taller › Memoria (memorias, habilidades, documentos e instrucciones), iguales en Mac, Linux y Windows.
 *
 * 16 nov 2026, un fundador en Windows: «en habilidades, tampoco me aparece ninguna». La ruta /api/cabina/archivos armaba
 * cada ruta relativa con `path.join`, que en Windows usa `\`: el filtro de skills (`endsWith('/SKILL.md')`) no encontraba
 * ninguna, y abrir un documento normalizaba `/` a `\` y respondía «Ese archivo no es del cerebro» (403). Aquí las rutas
 * relativas del cerebro siempre van con `/`, y lo que llega con `\` se acepta. Puro: se prueba solo.
 */
import path from 'node:path'

/** Lo que nunca se lista ni se abre (credenciales), con `/` o `\`. */
export const VETADO = /(^|[\\/])(credenciales|secret|\.env)|credenciales-operativas/i

/** Ruta relativa del cerebro: siempre con `/` (`.claude/skills/x/SKILL.md`), en cualquier sistema. */
export const unirRel = (dir: string, nombre: string) => `${dir.replace(/\\/g, '/').replace(/\/+$/, '')}/${nombre}`

/** ¿Es la entrada de una skill (`.claude/skills/<nombre>/SKILL.md`) y no una referencia suya? */
export function esEntradaSkill(rel: string): boolean {
  const r = rel.replace(/\\/g, '/')
  return r.endsWith('/SKILL.md') && r.split('/').length === 4
}

/** Ruta pedida por el panel → relativa limpia con `/`, sin `..` al inicio. */
export function limpiarPedida(pedida: string): string {
  return path.posix.normalize(pedida.replace(/\\/g, '/')).replace(/^(\.\.(\/|$))+/, '').replace(/^\.\//, '')
}
