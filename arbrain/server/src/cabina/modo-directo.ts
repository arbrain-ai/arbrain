/**
 * Modo directo (7 nov 2026): el estado y lo que la Cabina niega mientras Daniel transmite. Las reglas puras viven en
 * ./directo-reglas.ts (espejo de la app). Aquí:
 *  - el interruptor: `~/.config/arbrain/modo-directo.json` (o `ARBRAIN_MODO_DIRECTO` en pruebas). Se lee de disco en cada
 *    llamada: el servidor MCP de la Cabina corre en otro proceso y tiene que ver el mismo estado al instante;
 *  - el diccionario de nombres que la app tapa: las fichas de clientes (hoy `.claude/memory/project/fundadores/`) más
 *    `modo-directo-nombres.txt` junto al interruptor, una persona por línea. Solo sale del daemon con el modo prendido;
 *  - `vetoDirecto`: el texto con que `mostrar`, `abrir` y `archivero` se niegan aunque un agente lo pida;
 *  - `avisoDirecto`: la línea que recibe Levy en cada turno con el modo prendido.
 * Lo escriben la app (Ajustes › Modo directo y ⌘⇧D, por `POST /cabina {que:'modo-directo'}`) y nadie más.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'
import { DUENO, DUENO_M, instalacionOriginal } from '../dueno.js'
import { REPO } from './documento.js'
import { invocacionVetadaDirecto, OCULTO_POR_DIRECTO, rutaSensibleDirecto, vistaVetadaDirecto, type Diccionario } from './directo-reglas.js'

export const ARCHIVO = () => process.env.ARBRAIN_MODO_DIRECTO || path.join(DIR_ARBRAIN(), 'modo-directo.json')
export const ARCHIVO_NOMBRES = () => path.join(path.dirname(ARCHIVO()), 'modo-directo-nombres.txt')
/** Carpetas de fichas de clientes (una ficha `.md` por persona) y documentos con tablas de personas (prospectos, ventas).
 *  `ARBRAIN_DIRECTO_FICHAS` / `ARBRAIN_DIRECTO_TABLAS` (separadas por `:`) o `modo_directo` de instalacion.json. */
const fuentes = (env: string | undefined, deInstalacion: string[] | undefined) =>
  (env != null ? env.split(':') : (deInstalacion ?? []).map(r => path.isAbsolute(r) ? r : path.join(REPO, r))).filter(Boolean)
export const CARPETAS_FICHAS = () => fuentes(process.env.ARBRAIN_DIRECTO_FICHAS, instalacionOriginal().modo_directo?.fichas)
export const TABLAS_PERSONAS = () => fuentes(process.env.ARBRAIN_DIRECTO_TABLAS, instalacionOriginal().modo_directo?.tablas)

export interface EstadoDirecto { version: 1; prendido: boolean; rev: number; desde: string | null; actualizado: string | null; por: string | null }
const APAGADO: EstadoDirecto = { version: 1, prendido: false, rev: 0, desde: null, actualizado: null, por: null }

export function leer(archivo = ARCHIVO()): EstadoDirecto {
  try {
    const o = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<EstadoDirecto>
    return { version: 1, prendido: o.prendido === true, rev: Number.isInteger(o.rev) ? o.rev! : 0, desde: typeof o.desde === 'string' ? o.desde : null, actualizado: typeof o.actualizado === 'string' ? o.actualizado : null, por: typeof o.por === 'string' ? o.por : null }
  } catch { return { ...APAGADO } }
}
export const prendido = (archivo = ARCHIVO()) => leer(archivo).prendido

export function poner(valor: boolean, por: string, archivo = ARCHIVO(), ahora = new Date()): EstadoDirecto {
  const antes = leer(archivo)
  const nuevo: EstadoDirecto = { version: 1, prendido: valor, rev: antes.rev + 1, desde: valor ? (antes.prendido ? antes.desde : ahora.toISOString()) : null, actualizado: ahora.toISOString(), por }
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(nuevo, null, 2) + '\n', 'utf8')
  renameSync(tmp, archivo)
  return nuevo
}

// ── Diccionario ──

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'van', 'von', 'da', 'do', 'dos'])
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const TELEFONO = /\+\d[\d\s().-]{7,}\d/g

/** «Fulano Mengano (Zutano SA)» → ['Fulano Mengano', 'Fulano', 'Mengano', 'Zutano SA']. */
export function terminosDe(nombre: string): string[] {
  const alias = [...nombre.matchAll(/\(([^)]+)\)/g)].map(m => m[1]!.trim())
  const base = nombre.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  const palabras = base.split(' ').filter(p => p.length >= 3 && !CONECTORES.has(p.toLowerCase()))
  return [...new Set([base, ...palabras, ...alias].filter(t => t.length >= 3))]
}

/** De una ficha `.md`: el nombre del título (`# Nombre · …`), y los correos y teléfonos de su línea de contacto. */
export function leerFicha(texto: string): { nombres: string[]; literales: string[] } {
  const titulo = texto.match(/^#\s+(.+)$/m)?.[1]?.split('·')[0]?.trim()
  const contacto = texto.split('\n').filter(l => /contacto|correo|e-?mail|tel[eé]fono|whatsapp/i.test(l)).join('\n')
  return { nombres: titulo ? terminosDe(titulo) : [], literales: [...(contacto.match(CORREO) ?? []), ...(contacto.match(TELEFONO) ?? []).map(t => t.trim())] }
}

/** Del índice: cada enlace `[Nombre (Alias)](slug.md)` es una persona. */
export function leerIndice(texto: string): string[] {
  return [...texto.matchAll(/\[([^\]]+)\]\([^)]+\.md\)/g)].flatMap(m => terminosDe(m[1]!))
}

const NOMBRE_PROPIO = /^\p{Lu}[\p{L}.'-]*(?: \p{Lu}[\p{L}.'-]*){0,3}$/u
const NO_PERSONA = /^(cohorte|total|totales|subtotal|suma|todos|nadie|otros|pendientes?|prospectos?|lista)$/i

/** De un markdown: la primera columna de cada tabla cuyo encabezado es de personas («Nombre», «Persona», «Quién», «Prospecto»…). */
export function leerTablas(texto: string): string[] {
  const nombres: string[] = []
  let enTabla = false
  for (const linea of texto.split('\n')) {
    if (!linea.trim().startsWith('|')) { enTabla = false; continue }
    const celdas = linea.split('|').slice(1, -1).map(c => c.trim())
    if (!enTabla) { enTabla = /^(nombre|persona|qui[eé]n|prospecto|cliente|fundador|alumno)/i.test(celdas[0] ?? ''); continue }
    if (/^:?-{2,}/.test(celdas[0] ?? '')) continue
    // Una celda puede traer varias personas y notas: «Fulano, Mengano y Zutano (pagó el 26)». Solo entra lo que parece nombre propio.
    const limpio = (celdas[0] ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/\([^)]*\)/g, ' ')
    for (const parte of limpio.split(/[,;]|\s+(?:y|e)\s+/)) {
      const p = parte.trim().replace(/\s+/g, ' ')
      if (NOMBRE_PROPIO.test(p) && !NO_PERSONA.test(p)) nombres.push(...terminosDe(p))
    }
  }
  return nombres
}

let cacheDic: { clave: string; dic: Diccionario } | null = null
/** Nombres y literales de clientes, sin el nombre del dueño. Cacheado por las fechas de las carpetas. */
export function diccionario(carpetas = CARPETAS_FICHAS(), extra = ARCHIVO_NOMBRES(), tablas = TABLAS_PERSONAS()): Diccionario {
  const clave = [...carpetas, extra, ...tablas].map(c => { try { return `${c}@${statSync(c).mtimeMs}` } catch { return `${c}@-` } }).join('|')
  if (cacheDic?.clave === clave) return cacheDic.dic
  const nombres: string[] = [], literales: string[] = []
  for (const dir of carpetas) {
    if (!existsSync(dir)) continue
    let archivos: string[] = []
    try { archivos = readdirSync(dir).filter(f => f.endsWith('.md')) } catch { continue }
    for (const f of archivos) {
      let texto = ''
      try { texto = readFileSync(path.join(dir, f), 'utf8') } catch { continue }
      if (/^(INDICE|README)\.md$/i.test(f)) { nombres.push(...leerIndice(texto)); continue }
      const r = leerFicha(texto)
      nombres.push(...r.nombres); literales.push(...r.literales)
    }
  }
  for (const t of tablas) { try { nombres.push(...leerTablas(readFileSync(t, 'utf8'))) } catch { /* sin ese documento */ } }
  try { for (const l of readFileSync(extra, 'utf8').split('\n')) { const n = l.replace(/#.*/, '').trim(); if (n) nombres.push(...terminosDe(n)) } } catch { /* sin lista extra */ }
  const dueno = DUENO.toLowerCase()
  const fuera = new Set([dueno, ...dueno.split(/\s+/)])
  const dic = { nombres: [...new Set(nombres)].filter(n => !fuera.has(n.toLowerCase())), literales: [...new Set(literales)] }
  cacheDic = { clave, dic }
  return dic
}

// ── Lo que la Cabina niega ──

const NOMBRE_VISTA: Record<string, string> = { finanzas: 'Finanzas', centro: 'Finanzas · Lo que entra', cohorte: 'Cohorte', casa: 'Casa', perro: 'Perro' }
export const textoOculto = (que: string) => `${OCULTO_POR_DIRECTO}: ${DUENO_M} está transmitiendo en vivo y ${que} no se abre. NO se mostró nada. No la describas ni cites sus datos de memoria; si hace falta, dile que la verá al apagar el modo directo.`

/** null = adelante. Si el modo está prendido y la invocación toca algo vetado, el texto con que la herramienta responde. */
export function vetoDirecto(tool: string, raw: unknown, estaPrendido = prendido()): string | null {
  if (!estaPrendido) return null
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (tool === 'mostrar') {
    if (o.soltar === true) return null
    const texto = (x: unknown) => (typeof x === 'string' ? x : null)
    const versiones = Array.isArray(o.versiones) ? o.versiones.filter((x): x is string => typeof x === 'string') : null
    const veto = invocacionVetadaDirecto({ vista: texto(o.vista), ruta: texto(o.ruta), compararCon: texto(o.compararCon), versiones })
    if (veto === 'vista') return textoOculto(`la vista «${NOMBRE_VISTA[o.vista as string] ?? o.vista}»`)
    if (veto === 'ruta') return textoOculto(`«${path.basename([o.ruta, o.compararCon, ...(versiones ?? [])].find(r => typeof r === 'string' && rutaSensibleDirecto(r)) as string)}» (ruta sensible: llaves, credenciales o datos de clientes)`)
  }
  if (tool === 'abrir' && typeof o.destino === 'string' && vistaVetadaDirecto(o.destino)) return textoOculto(`la sección «${NOMBRE_VISTA[o.destino] ?? o.destino}»`)
  return null
}

/** La entrada del archivero que se pidió abrir, ¿es algo vetado? */
export function vetoEntrada(input: Record<string, unknown> | undefined, estaPrendido = prendido()): string | null {
  return input ? vetoDirecto('mostrar', input, estaPrendido) : null
}

/** La línea que Levy recibe en cada turno mientras el modo está prendido (vacía si no). */
export function avisoDirecto(estaPrendido = prendido()): string {
  if (!estaPrendido) return ''
  return `[MODO DIRECTO PRENDIDO: ${DUENO} está transmitiendo su pantalla en vivo. En el chat y en lo que imprimas con herramientas: nada de llaves, tokens, contraseñas ni contenido de .env (no hagas cat/printenv de credenciales); nombres de fundadores y clientes solo con iniciales, sin correos ni teléfonos; sin cifras de dinero (ventas, cobros, precios por persona). Finanzas, Cohorte, Casa y Perro no se abren. Si algo lo necesita, dile que lo verá al apagar el modo directo.]`
}

/** `POST /cabina {que:'modo-directo', accion: leer | poner, prendido}`. Con el modo prendido, `leer` trae el diccionario. */
export function accionModoDirecto(o: Record<string, unknown>): { estado: EstadoDirecto; diccionario?: Diccionario } | { error: string; status: number } {
  const accion = o.accion ?? 'leer'
  try {
    if (accion === 'leer') { const estado = leer(); return estado.prendido ? { estado, diccionario: diccionario() } : { estado } }
    if (accion === 'poner') {
      if (typeof o.prendido !== 'boolean') return { error: 'poner necesita prendido: true o false.', status: 400 }
      const estado = poner(o.prendido, typeof o.por === 'string' && o.por.trim() ? o.por.trim().slice(0, 60) : `${DUENO_M} · Arbrain`)
      return estado.prendido ? { estado, diccionario: diccionario() } : { estado }
    }
    return { error: 'accion debe ser leer o poner.', status: 400 }
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo guardar el modo directo.', status: 500 } }
}
