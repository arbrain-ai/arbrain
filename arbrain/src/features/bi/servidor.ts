import 'server-only'
/**
 * Business Intelligence · qué catálogo rige en esta instalación y cómo se corre una consulta (8 nov 2026).
 *
 * - En la instalación del autor (su catálogo trae consultas y no es la edición cliente): las 14 consultas fijas de su negocio
 *   (autor/catalogo.ts, autor/servidor.ts). Nada de eso viaja: en la copia del alumno la capa G deja esos dos archivos vacíos.
 * - En cualquier otra (la del alumno, o la del autor abierta como cliente): el catálogo genérico, conectado a las fuentes que el
 *   dueño declaró en `bi-fuentes.json` (generico.ts, motor.ts). Sin fuentes, el motor está vacío: cada consulta dice qué falta.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import type { Consulta, Ventana } from './catalogo'
import { catalogoGenerico } from './generico'
import { ejecutarGenerico, leerArchivoFuentes, type EstadoFuentes } from './motor'
import type { RespuestaConsulta } from './modelo'
import { CATALOGO_AUTOR } from './autor/catalogo'
import { ejecutarAutor } from './autor/servidor'

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
/** La raíz del cerebro: la primera que tiene `.claude/memory/MEMORY.md` (igual que /api/negocio). */
export const raizCerebro = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

/** ¿Rige el catálogo del autor? Solo si su catálogo viajó con consultas y la instalación no es la del alumno. */
export const catalogoDelAutor = () => CATALOGO_AUTOR.length > 0 && !esEdicionCliente()

export interface Vigente { catalogo: Consulta[]; generico: boolean; fuentes: EstadoFuentes | null }

/** El catálogo con el que Levy contesta y el panel valida, y (si es el genérico) cómo está el archivo de fuentes. */
export async function catalogoVigente(raiz: string | null): Promise<Vigente> {
  if (catalogoDelAutor()) return { catalogo: [...CATALOGO_AUTOR], generico: false, fuentes: null }
  const fuentes = raiz ? await leerArchivoFuentes(raiz) : { existe: false, archivo: null, errores: [] }
  return { catalogo: catalogoGenerico(fuentes.archivo), generico: true, fuentes }
}

/** Corre UNA consulta del catálogo vigente. Lo que no está en el catálogo no se corre. */
export async function ejecutar(id: string, ventana: Ventana, raiz: string | null): Promise<RespuestaConsulta> {
  if (catalogoDelAutor()) return ejecutarAutor(id, ventana, raiz)
  if (!raiz) throw new Error('No se encontró la raíz del cerebro.')
  return ejecutarGenerico(raiz, id, ventana)
}
