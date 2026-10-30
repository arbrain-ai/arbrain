/**
 * Organización de los lienzos (5 oct 2026): carpetas fijadas, fijar a mano y archivar. Pura (tests/canvas/organizacion.test.ts).
 * El árbol que se pinta (fijados · carpetas · archivados) se arma en `vista-lienzos.ts`.
 *
 * Vive en la base de lienzos, no en el navegador: vale igual en el Studio, la MacBook y el desktop.
 *
 *   carpeta fijada     una carpeta de `GRUPOS_POR_CARPETA` sale arriba, en «Fijados», con lo que tenga dentro.
 *                      La carpeta es la ÚNICA fuente de quién es del grupo (antes era una semilla por título en el código).
 *   settings.fijado    { grupo, orden }   fijado a mano en «Fijados» (lo que no está en una carpeta fijada)
 *   settings.archivado ISO                archivado en esa fecha (nada se borra)
 *
 * Ni el guardado de la mano ni el del compilador tocan `settings`.
 */

export interface Fijado { grupo: string; orden: number }
export interface Organizacion { fijado: Fijado | null; archivado: string | null }

/** Carpetas (por nombre) que «¿Qué lienzo?» fija arriba como grupo, en su orden. Viven dentro de Negocio. */
export const GRUPOS_POR_CARPETA = ['Lanzamiento HT']
/** El grupo donde cae un fijado a mano. */
export const GRUPO_GENERAL = 'Fijados'

export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Lo que dicen los `settings` crudos de una fila; tolera null, basura y tipos cambiados. */
export function leerOrganizacion(settings: unknown): Organizacion {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const f = s.fijado as Partial<Fijado> | null | undefined
  const archivado = typeof s.archivado === 'string' && s.archivado ? s.archivado : null
  if (f && typeof f.grupo === 'string' && f.grupo.trim()) {
    return { fijado: { grupo: f.grupo.trim(), orden: typeof f.orden === 'number' && Number.isFinite(f.orden) ? f.orden : 0 }, archivado }
  }
  return { fijado: null, archivado }
}

/** Los `settings` nuevos tras fijar o desfijar. `orden` va al final del grupo. Conserva todo lo demás (y limpia el `desfijado` de la semilla retirada). */
export function conFijado(settings: unknown, fijar: boolean, grupo = GRUPO_GENERAL, orden = 0): Record<string, unknown> {
  const base = { ...(settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}) }
  delete base.desfijado
  if (fijar) base.fijado = { grupo, orden }; else delete base.fijado
  return base
}

export function conArchivado(settings: unknown, archivar: boolean, ahora = new Date()): Record<string, unknown> {
  const base = { ...(settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}) }
  if (archivar) base.archivado = ahora.toISOString(); else delete base.archivado
  return base
}

export interface ConOrg { id: string; nombre: string; actualizado: string; folderId: string | null; fijado: Fijado | null; archivado: string | null }

/** ¿Esta página está en una carpeta fijada? Entonces el pin no aplica: se saca de la carpeta para soltarla. */
export const enCarpetaFijada = (folderId: string | null, carpetas: { id: string; nombre: string }[]) =>
  !!folderId && carpetas.some(c => c.id === folderId && GRUPOS_POR_CARPETA.some(n => normalizar(n) === normalizar(c.nombre)))

/** Dónde queda un lienzo recién fijado a mano: al final de «Fijados». */
export const ordenAlFinal = (paginas: ConOrg[], grupo = GRUPO_GENERAL) =>
  paginas.reduce((m, x) => x.fijado?.grupo === grupo ? Math.max(m, x.fijado.orden + 1) : m, 0)
