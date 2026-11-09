/**
 * Business Intelligence · el motor del catálogo genérico (8 nov 2026): lee `bi-fuentes.json` del cerebro del dueño, trae de
 * cada fuente solo lo que la consulta pide y hace la cuenta (calculo.ts). Es lo que corre en la copia del alumno y en
 * cualquier instalación sin el catálogo del autor. Sin `server-only` ni alias: lo usan la API (servidor.ts) y la CLI de Levy.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { consultaEn, type Ventana } from './catalogo'
import {
  catalogoGenerico, formaDe, fuentesDe, RUTA_FUENTES, validarFuentes, ZONA_POR_DEFECTO, type ArchivoFuentes, type Fuente,
} from './generico'
import { calcular, columnasPedidas, ErrorFuente, rangoPedido, type Lote } from './calculo'
import { leerFuente, leerLlaves } from './fuentes/leer'
import { sumarDias, type RespuestaConsulta } from './modelo'

export interface EstadoFuentes { existe: boolean; archivo: ArchivoFuentes | null; errores: string[] }

/** El archivo de fuentes del dueño, validado. Sin archivo: existe false, sin errores (el motor está vacío, no roto). */
export async function leerArchivoFuentes(raiz: string): Promise<EstadoFuentes> {
  let crudo: unknown
  try { crudo = JSON.parse(await readFile(path.join(raiz, RUTA_FUENTES), 'utf8')) } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { existe: false, archivo: null, errores: [] }
    return { existe: true, archivo: null, errores: ['El archivo de fuentes no es JSON válido.'] }
  }
  const v = validarFuentes(crudo)
  return { existe: true, archivo: v.archivo, errores: v.errores }
}

const diaCivil = (d: Date, zona: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const cache = new Map<string, { en: number; lote: Promise<Lote> }>()
/** Una base se vuelve a leer a los 5 minutos; un archivo, cuando cambia (lo cuida su adaptador). */
function leerConMemoria(f: Fuente, pedido: Parameters<typeof leerFuente>[1]): Promise<Lote> {
  if (f.tipo === 'csv' || f.tipo === 'excel') return leerFuente(f, pedido)
  const clave = JSON.stringify([f, pedido.columnas, pedido.desde, pedido.hastaExclusivo])
  const ya = cache.get(clave)
  if (ya && Date.now() - ya.en < 5 * 60_000) return ya.lote
  const lote = leerFuente(f, pedido).catch(e => { cache.delete(clave); throw e })
  cache.set(clave, { en: Date.now(), lote })
  return lote
}

/** Corre UNA consulta del catálogo genérico con su ventana, contra las fuentes del dueño. */
export async function ejecutarGenerico(raiz: string, id: string, ventana: Ventana, op: { ahora?: Date; estado?: EstadoFuentes } = {}): Promise<RespuestaConsulta> {
  const estado = op.estado ?? await leerArchivoFuentes(raiz)
  const archivo = estado.archivo
  const c = consultaEn(catalogoGenerico(archivo), id)
  const forma = formaDe(id)
  if (!c || !forma) throw new ErrorFuente(`«${id}» no está en el catálogo.`)
  if (!c.ventanas.includes(ventana)) throw new ErrorFuente(`«${id}» se consulta en ${c.ventanas.join(', ')} días.`)
  if (!archivo || !c.conectada) throw new ErrorFuente(`«${c.nombre}» todavía no tiene fuente. ${c.falta ?? ''}`.trim())
  const zona = archivo.zona ?? ZONA_POR_DEFECTO
  const ayer = sumarDias(diaCivil(op.ahora ?? new Date(), zona), -1)
  const mapeo = archivo.consultas[id]
  const fuentes = fuentesDe(archivo, id)
  const pide = columnasPedidas(mapeo, fuentes)
  const rango = rangoPedido(forma, ventana, ayer)
  const llaves = fuentes.some(f => f.tipo === 'postgres' || f.tipo === 'supabase') ? await leerLlaves(raiz) : {}
  const lotes: Record<string, Lote> = {}
  await Promise.all(fuentes.map(async f => { lotes[f.id] = await leerConMemoria(f, { raiz, llaves, columnas: pide[f.id] ?? [f.fecha], ...rango }) }))
  const r = calcular({ forma, mapeo, fuentes, lotes, ventana, ayer, zona })
  return { ok: true, consulta: id, ventana, datos: r.datos, hasta: r.hasta, leidoEn: new Date().toISOString(), ...(r.aviso ? { aviso: r.aviso } : {}) }
}

export { ErrorFuente }
