/**
 * La vista única de los lienzos (6 oct 2026): UN árbol para «¿Qué lienzo?» (panel) y para la sección Lienzo.
 *
 * Antes eran dos modelos: el panel agrupaba (carpeta fijada + fijados + «Todos» plano) y la sección pintaba el árbol de
 * `draw_folders`. Ahora los dos pintan esto, y solo cambia el ancho:
 *
 *   fijados     las carpetas de `GRUPOS_POR_CARPETA` (Lanzamiento HT) y los lienzos fijados a mano, arriba
 *   raiz        las demás carpetas (un nivel de subcarpetas) con sus lienzos, y «Sin carpeta» al final
 *   archivados  carpetas archivadas (con TODO lo que tengan dentro) y lienzos archivados sueltos. Nada se borra.
 *
 * Una carpeta archivada esconde lo suyo aunque el lienzo no lleve su propia marca; sus subcarpetas la siguen.
 * Pura: sin red ni React (tests/canvas/vista-lienzos.test.ts).
 */
import { arbolCarpetas, puedeAnidar, type CarpetaPlana, type NodoCarpeta } from './carpetas'
import { GRUPOS_POR_CARPETA, normalizar, type Fijado } from './organizacion'

export interface PaginaVista { id: string; nombre: string; folderId: string | null; actualizado: string; fijado: Fijado | null; archivado: string | null }

export interface VistaLienzos<P extends PaginaVista> {
  fijados: { carpetas: NodoCarpeta<P>[]; paginas: P[] }
  raiz: NodoCarpeta<P>[]
  sueltas: P[]
  archivados: { carpetas: NodoCarpeta<P>[]; paginas: P[]; cuenta: number }
}

const reciente = <P extends PaginaVista>(a: P, b: P) =>
  b.actualizado > a.actualizado ? 1 : b.actualizado < a.actualizado ? -1 : a.nombre.localeCompare(b.nombre, 'es')

const rangoFijada = (nombre: string) => GRUPOS_POR_CARPETA.findIndex(n => normalizar(n) === normalizar(nombre))
export const esCarpetaFijada = (c: { nombre: string }) => rangoFijada(c.nombre) >= 0

/** ¿Está archivada ella o su madre? */
export function carpetaArchivada(carpetas: CarpetaPlana[], id: string | null): boolean {
  const c = id ? carpetas.find(x => x.id === id) : undefined
  if (!c) return false
  if (c.archivada) return true
  const m = c.madre ? carpetas.find(x => x.id === c.madre) : undefined
  return !!m?.archivada
}

const cuentaNodo = <P extends PaginaVista>(n: NodoCarpeta<P>): number => n.paginas.length + n.hijas.reduce((a, h) => a + cuentaNodo(h), 0)
const mapNodo = <P extends PaginaVista>(n: NodoCarpeta<P>, f: (ps: P[]) => P[]): NodoCarpeta<P> =>
  ({ carpeta: n.carpeta, paginas: f(n.paginas), hijas: n.hijas.map(h => mapNodo(h, f)) })

export function armarVista<P extends PaginaVista>(carpetas: CarpetaPlana[], paginas: P[], busqueda = ''): VistaLienzos<P> {
  const q = normalizar(busqueda)
  const buscando = q.length > 0
  const ordenadas = [...paginas].filter(x => !buscando || normalizar(x.nombre).includes(q)).sort(reciente)
  const archivadaId = new Set(carpetas.filter(c => carpetaArchivada(carpetas, c.id)).map(c => c.id))
  const vivasC = carpetas.filter(c => !archivadaId.has(c.id))
  const archC = carpetas.filter(c => archivadaId.has(c.id))

  // ── vivas: lo que no está archivado ni en carpeta archivada
  const vivas = ordenadas.filter(x => !x.archivado && !(x.folderId && archivadaId.has(x.folderId)))
  const fijadaFolder = (x: P) => !!x.folderId && vivasC.some(c => c.id === x.folderId && esCarpetaFijada(c))
  const aMano = vivas.filter(x => x.fijado && !fijadaFolder(x)).sort((a, b) => (a.fijado!.orden - b.fijado!.orden) || a.nombre.localeCompare(b.nombre, 'es'))
  const enMano = new Set(aMano.map(x => x.id))
  const { raiz: todas, sueltas } = arbolCarpetas(vivasC, vivas)

  // Las carpetas fijadas salen del árbol (sea raíz o subcarpeta) y suben a «Fijados» en su orden.
  const fijadas: NodoCarpeta<P>[] = []
  const sinFijadas = (ns: NodoCarpeta<P>[]): NodoCarpeta<P>[] => ns.flatMap(n => {
    if (esCarpetaFijada(n.carpeta)) { fijadas.push(n); return [] }
    return [{ ...n, hijas: sinFijadas(n.hijas) }]
  })
  const raizSinFijadas = sinFijadas(todas)
  fijadas.sort((a, b) => rangoFijada(a.carpeta.nombre) - rangoFijada(b.carpeta.nombre))
  const quitarMano = (ps: P[]) => ps.filter(x => !enMano.has(x.id))
  // Buscando, una carpeta sin coincidencias no ocupa sitio.
  const podar = (ns: NodoCarpeta<P>[]) => buscando ? ns.map(n => ({ ...n, hijas: n.hijas.filter(h => cuentaNodo(h) > 0) })).filter(n => cuentaNodo(n) > 0) : ns
  const raiz = podar(raizSinFijadas.map(n => mapNodo(n, quitarMano)))
  const carpetasFijadas = podar(fijadas)

  // ── archivados: carpetas archivadas con todo su contenido + lienzos archivados sueltos
  const enArchivadas = ordenadas.filter(x => x.folderId && archivadaId.has(x.folderId))
  const arbolArch = arbolCarpetas(archC, enArchivadas).raiz
  const sueltosArch = ordenadas.filter(x => x.archivado && !(x.folderId && archivadaId.has(x.folderId)))
  const nodosArch = buscando ? arbolArch.map(n => ({ ...n, hijas: n.hijas.filter(h => cuentaNodo(h) > 0) })).filter(n => cuentaNodo(n) > 0) : arbolArch
  const cuenta = nodosArch.reduce((a, n) => a + 1 + n.hijas.length + cuentaNodo(n), 0) + sueltosArch.length

  return {
    fijados: { carpetas: carpetasFijadas, paginas: aMano },
    raiz, sueltas: quitarMano(sueltas),
    archivados: { carpetas: nodosArch, paginas: sueltosArch, cuenta },
  }
}

export interface Destino { id: string | null; etiqueta: string; nivel: number }

/** Carpetas vivas donde puede caer un lienzo, en orden de árbol: «Negocio › Lanzamiento HT». `null` = «Sin carpeta». */
export function destinosDePagina(carpetas: CarpetaPlana[]): Destino[] {
  const vivas = carpetas.filter(c => !carpetaArchivada(carpetas, c.id))
  const { raiz } = arbolCarpetas(vivas, [])
  return [{ id: null, etiqueta: 'Sin carpeta', nivel: 0 },
    ...raiz.flatMap(n => [{ id: n.carpeta.id, etiqueta: n.carpeta.nombre, nivel: 0 },
      ...n.hijas.map(h => ({ id: h.carpeta.id, etiqueta: `${n.carpeta.nombre} › ${h.carpeta.nombre}`, nivel: 1 }))])]
}

/** A dónde puede ir una carpeta con la regla de un nivel (y sin salir a donde ya está). `null` = la raíz. */
export function destinosDeCarpeta(carpetas: CarpetaPlana[], id: string): Destino[] {
  const c = carpetas.find(x => x.id === id)
  const dentro = carpetas.filter(x => x.id !== c?.madre && !carpetaArchivada(carpetas, x.id) && puedeAnidar(carpetas, id, x.id) === null)
  return [...(c?.madre ? [{ id: null, etiqueta: 'A la raíz', nivel: 0 }] : []), ...dentro.map(x => ({ id: x.id, etiqueta: x.nombre, nivel: 0 }))]
}

/** La carpeta y sus subcarpetas: lo que archivar o restaurar una carpeta toca. */
export const conSubcarpetas = (carpetas: CarpetaPlana[], id: string) => carpetas.filter(c => c.id === id || c.madre === id).map(c => c.id)
