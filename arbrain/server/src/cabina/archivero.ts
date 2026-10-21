/**
 * Archivero del panel derecho (3 oct 2026, firmado por Daniel): las pestañas que él (o Levy por
 * pedido suyo) GUARDA salen de la barra y quedan aquí, para reabrirlas desde «+ › Guardadas».
 *
 * AI-first: la lista es un archivo legible que Levy lee y escribe (`~/.config/arbrain/archivero.json`,
 * o `ARBRAIN_ARCHIVERO` / `ARBRAIN_CONFIG_DIR` en servidores de prueba). Una sola implementación: la usan la herramienta `archivero`/`mostrar
 * {guardar:true}` (servidor MCP por stdio) y el daemon (`POST /cabina {que:'archivero'}`), que es lo
 * que consulta la app. Así lo que guarda Daniel lo ve Levy y al revés.
 *
 * Un documento que vive en /tmp se COPIA a `docs/guardados/` del repo al guardarse y la entrada
 * apunta a la copia: /tmp se borra solo y lo guardado no debe desaparecer.
 * Nada se borra por viejo: `abiertoEn` deja el dato para proponerlo en la revisión del domingo.
 */
import { DIR_ARBRAIN } from '../edicion.js'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { REPO, validarDocumento } from './documento.js'

export const ARCHIVO = () => process.env.ARBRAIN_ARCHIVERO || path.join(DIR_ARBRAIN(), 'archivero.json')

/** Lo que se guarda de una vista: su invocación (como en el hilo), nunca su contenido. */
export interface VistaGuardada { vista: string; alcance?: string; fecha?: string; paginaId?: string; titulo?: string; enfoque?: string; seccion?: string; agenteId?: number; zona?: string; ruta?: string; compararCon?: string }

export interface Entrada {
  id: string
  /** El nombre con el que se ve en «Guardadas» (el de la pestaña). */
  nombre: string
  input: VistaGuardada
  /** La conversación de la que salió (id; el título lo resuelve la app). */
  conversacion?: string
  guardadaEn: string
  /** Última vez que se reabrió (null = nunca). Lo usa la revisión del domingo; nada se borra solo. */
  abiertoEn: string | null
  /** Si el documento vivía en /tmp: dónde estaba antes de copiarse a docs/guardados/. */
  rutaOriginal?: string
  /** Levy pidió reabrirla («ábreme lo que guardé de…»): la app la abre como pestaña y lo marca. */
  pedido?: { accion: 'abrir'; en: string }
}

interface Libro { version: 1; entradas: Entrada[] }

const CAMPOS: (keyof VistaGuardada)[] = ['vista', 'alcance', 'fecha', 'paginaId', 'titulo', 'enfoque', 'seccion', 'agenteId', 'zona', 'ruta', 'compararCon']

/** Solo los campos de la vista: sin fijar/soltar/guardar ni lo que no es de la invocación. */
export function limpiarVista(raw: Record<string, unknown>): VistaGuardada {
  const v: Record<string, unknown> = {}
  for (const c of CAMPOS) if (raw[c] != null && raw[c] !== '') v[c] = raw[c]
  if (typeof v.vista !== 'string') throw new Error('La entrada necesita vista.')
  return v as unknown as VistaGuardada
}

/** La misma regla que la app (arbrain/src/features/cabina/panel/fijadas.ts → claveDe): una vista, una entrada. */
export const claveDe = (i: VistaGuardada) => i.vista === 'calendario' || (i.vista === 'lienzo' && !i.paginaId) ? i.vista
  : i.vista === 'documento' ? `documento|${i.ruta}`
  : i.vista === 'lienzo' ? `lienzo|${i.paginaId}`
  : [i.vista, i.alcance, i.fecha, i.seccion, i.paginaId, i.agenteId].join('|')

const NOMBRE: Record<string, string> = { calendario: 'Calendario', objetivos: 'Objetivos', centro: 'Command center', lienzo: 'Lienzo', reporte: 'Lo que llegó', negocio: 'Negocio', cohorte: 'Cohorte', trabajos: 'Trabajos', finanzas: 'Finanzas', contenido: 'Contenido', rutinas: 'Rutinas', servidores: 'Servidores', memoria: 'Memoria y contexto', salud: 'Salud', masterclass: 'Masterclass', explorador: 'Archivos', documento: 'Documento' }
export const nombreDe = (i: VistaGuardada) => i.titulo || (i.vista === 'documento' ? path.basename(i.ruta ?? '') : i.vista === 'negocio' && i.seccion ? i.seccion : NOMBRE[i.vista] ?? i.vista)

export function leer(archivo = ARCHIVO()): Libro {
  try {
    const v = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<Libro>
    return { version: 1, entradas: Array.isArray(v.entradas) ? v.entradas.filter(e => e && typeof e.id === 'string' && e.input && typeof e.input.vista === 'string') : [] }
  } catch { return { version: 1, entradas: [] } }
}

function escribir(libro: Libro, archivo = ARCHIVO()) {
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(libro, null, 2) + '\n', 'utf8')
  renameSync(tmp, archivo)
}

const enTmp = (abs: string) => abs === '/tmp' || abs.startsWith('/tmp/') || abs.startsWith('/private/tmp/')

/** Copia un documento de /tmp a docs/guardados/ del repo. Devuelve la ruta relativa al repo de la copia.
 *  Mismo nombre y mismo contenido = la misma copia; mismo nombre con otro contenido = sufijo -2, -3… */
export function copiarDeTmp(abs: string, repo = REPO): string {
  const dir = path.join(repo, 'docs', 'guardados')
  mkdirSync(dir, { recursive: true })
  const ext = path.extname(abs), base = path.basename(abs, ext)
  const original = readFileSync(abs)
  for (let n = 1; n < 100; n++) {
    const nombre = n === 1 ? `${base}${ext}` : `${base}-${n}${ext}`
    const destino = path.join(dir, nombre)
    if (existsSync(destino) && !readFileSync(destino).equals(original)) continue
    if (!existsSync(destino)) copyFileSync(abs, destino)
    return path.relative(repo, destino)
  }
  throw new Error('Demasiadas copias con ese nombre en docs/guardados/.')
}

export interface GuardarOpciones { nombre?: string; conversacion?: string; archivo?: string; repo?: string; ahora?: Date }

/** Guarda (o actualiza) una vista en el archivero. Un documento de /tmp se copia antes. */
export function guardar(raw: Record<string, unknown>, o: GuardarOpciones = {}): Entrada {
  const input = limpiarVista(raw)
  let rutaOriginal: string | undefined
  if (input.vista === 'documento') {
    if (!input.ruta) throw new Error('Para guardar un documento hace falta su ruta.')
    const doc = validarDocumento(input.ruta)
    if ('error' in doc) throw new Error(doc.error)
    const real = (() => { try { return realpathSync(doc.abs) } catch { return doc.abs } })()
    if (enTmp(doc.abs) || enTmp(real)) { rutaOriginal = input.ruta; input.ruta = copiarDeTmp(real, o.repo) }
  }
  const libro = leer(o.archivo)
  const clave = claveDe(input)
  // Lo que se guardó desde /tmp se reconoce también por su ruta de antes (guardarlo dos veces no duplica).
  const previa = libro.entradas.find(e => claveDe(e.input) === clave || (rutaOriginal && e.rutaOriginal === rutaOriginal))
  const ahora = (o.ahora ?? new Date()).toISOString()
  const entrada: Entrada = {
    id: previa?.id ?? `g-${randomBytes(4).toString('hex')}`,
    nombre: (o.nombre?.trim() || nombreDe(input)).slice(0, 120),
    input,
    ...(o.conversacion ?? previa?.conversacion ? { conversacion: o.conversacion ?? previa?.conversacion } : {}),
    guardadaEn: ahora,
    abiertoEn: previa?.abiertoEn ?? null,
    ...(rutaOriginal ?? previa?.rutaOriginal ? { rutaOriginal: rutaOriginal ?? previa?.rutaOriginal } : {}),
  }
  libro.entradas = [entrada, ...libro.entradas.filter(e => e !== previa)]
  escribir(libro, o.archivo)
  return entrada
}

/** Busca por id o, si no, por nombre (sin mayúsculas ni acentos): así Levy puede decir «Formatos». */
export function buscar(quien: string, archivo?: string): Entrada | undefined {
  const n = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const { entradas } = leer(archivo)
  return entradas.find(e => e.id === quien) ?? entradas.find(e => n(e.nombre) === n(quien)) ?? entradas.find(e => n(e.nombre).includes(n(quien)))
}

export function sacar(quien: string, archivo?: string): Entrada | undefined {
  const libro = leer(archivo), e = buscar(quien, archivo)
  if (!e) return undefined
  libro.entradas = libro.entradas.filter(x => x.id !== e.id)
  escribir(libro, archivo)
  return e
}

/** Levy pide reabrirla: queda un pedido que la app atiende (la abre como pestaña) y marca con `abierta`. */
export function pedirAbrir(quien: string, archivo?: string, ahora = new Date()): Entrada | undefined {
  const libro = leer(archivo), e = buscar(quien, archivo)
  if (!e) return undefined
  const nueva = { ...e, pedido: { accion: 'abrir' as const, en: ahora.toISOString() } }
  libro.entradas = libro.entradas.map(x => x.id === e.id ? nueva : x)
  escribir(libro, archivo)
  return nueva
}

/** La app la abrió (a mano o por pedido de Levy): se apunta `abiertoEn` y se cumple el pedido. */
export function marcarAbierta(id: string, archivo?: string, ahora = new Date()): Entrada | undefined {
  const libro = leer(archivo)
  const e = libro.entradas.find(x => x.id === id)
  if (!e) return undefined
  const { pedido: _cumplido, ...resto } = e
  const nueva: Entrada = { ...resto, abiertoEn: ahora.toISOString() }
  libro.entradas = libro.entradas.map(x => x.id === id ? nueva : x)
  escribir(libro, archivo)
  return nueva
}

/** Para la revisión del domingo: lo guardado que nadie abrió en `dias` días (no se borra; se propone). */
export function sinAbrir(dias = 30, archivo?: string, ahora = new Date()): Entrada[] {
  const limite = ahora.getTime() - dias * 86_400_000
  return leer(archivo).entradas.filter(e => Date.parse(e.abiertoEn ?? e.guardadaEn) < limite)
}

/** Una línea por entrada, para que Levy la lea en la respuesta de la herramienta. */
export function describir(e: Entrada): string {
  const donde = e.input.vista === 'documento' ? ` · ${e.input.ruta}${e.rutaOriginal ? ` (copia de ${e.rutaOriginal})` : ''}` : ''
  return `${e.id} · «${e.nombre}» (${e.input.vista})${donde} · guardada ${e.guardadaEn.slice(0, 10)}${e.conversacion ? ` · conversación ${e.conversacion}` : ''} · ${e.abiertoEn ? `abierta ${e.abiertoEn.slice(0, 10)}` : 'sin abrir'}${e.pedido ? ' · por abrir' : ''}`
}

/** Lo que pide la app al daemon (`POST /cabina {que:'archivero', accion, …}`). */
export function accionArchivero(o: Record<string, unknown>): { entradas: Entrada[] } | { entrada: Entrada } | { error: string; status: number } {
  const accion = o.accion ?? 'listar'
  try {
    if (accion === 'listar') return { entradas: leer().entradas }
    if (accion === 'guardar') {
      if (!o.input || typeof o.input !== 'object') return { error: 'guardar necesita input.', status: 400 }
      return { entrada: guardar(o.input as Record<string, unknown>, { nombre: typeof o.nombre === 'string' ? o.nombre : undefined, conversacion: typeof o.conversacion === 'string' ? o.conversacion : undefined }) }
    }
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) return { error: 'Falta id.', status: 400 }
    const e = accion === 'sacar' ? sacar(id) : accion === 'abierta' ? marcarAbierta(id) : undefined
    if (accion !== 'sacar' && accion !== 'abierta') return { error: 'accion debe ser listar, guardar, sacar o abierta.', status: 400 }
    return e ? { entrada: e } : { error: 'No está en el archivero.', status: 404 }
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo usar el archivero.', status: 400 } }
}
