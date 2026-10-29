/**
 * Modo de permisos del agente (grupal del 23 oct 2026: «demasiadas confirmaciones»; 0.2.15, 29 oct 2026: «Autónomo con
 * consentimiento», docs/builds/autonomia-alumno-2026-10-29/SPEC.md). La persona lo elige en la bienvenida o en Ajustes ›
 * Permisos y seguridad, con su clic (la ruta exige el secreto de la app: un agente nunca cambia sus propios permisos).
 *
 *   preguntar  como hasta v0.2.9: todo lo que no es seguro por construcción pide su clic.
 *   carpeta    «Automático en mi carpeta»: dentro de su cerebro y de las carpetas que abrió, Levy trabaja sin preguntar
 *              (comandos de solo lectura aunque el sistema no tenga sandbox, crear carpetas y archivos, escribir en sus
 *              carpetas abiertas, editar sus instrucciones y skills en Markdown). Fuera de ahí, pregunta.
 *   autonomo   «Autónomo» (recomendado, 0.2.15): hace lo que la persona le pide sin pedirle un clic en cada paso. Solo
 *              queda la red mínima, que NIEGA sin preguntar (dinero, secretos, su propio gobierno, borrados masivos) o
 *              enseña una tarjeta (envíos masivos; salida a un destino que no salió del pedido tras leer afuera). Exige el
 *              consentimiento de la persona sobre el texto de `consentimiento-autonomia.ts`, con versión y huella.
 *
 * Lo que NINGÚN modo cambia: el dinero (negado), los secretos y la carpeta de datos de la app (negados), escribir fuera
 * del cerebro y de las carpetas abiertas (negado), los ajustes y ganchos del cerebro y `.git` (negados).
 *
 * Versiones anteriores (0.2.9 a 0.2.14) tenían «libre» («Sin preguntar») y, dentro, «Quitar también el freno» con una
 * frase. Los dos se retiran: `libre` y el freno quitado se leen como «carpeta» y quedan marcados en `migracion` para que
 * la app ofrezca el nivel Autónomo con su consentimiento. Nadie sube de nivel sin su clic sobre el texto nuevo.
 *
 * Vive en `<ARBRAIN_CONFIG_DIR>/permisos.json` (carpeta protegida de la app). Instalación de Daniel: no se usa.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'
import { aceptacionCoincide, VERSION_AUTONOMIA } from './consentimiento-autonomia.js'

export type ModoPermisos = 'preguntar' | 'carpeta' | 'autonomo'
export const MODOS: readonly ModoPermisos[] = ['preguntar', 'carpeta', 'autonomo']
export const MODO_POR_DEFECTO: ModoPermisos = 'carpeta'
/** El que la bienvenida propone marcado (decisión 2, 29 oct 2026): recomendado, pero sin casillas marcadas. */
export const MODO_RECOMENDADO: ModoPermisos = 'autonomo'
export const esModo = (v: unknown): v is ModoPermisos => typeof v === 'string' && (MODOS as readonly string[]).includes(v)

/** Nombre que ve la persona en Ajustes (y que el agente usa para guiarla). */
export const NOMBRE_MODO: Record<ModoPermisos, string> = {
  preguntar: 'Preguntar siempre',
  carpeta: 'Automático en mi carpeta',
  autonomo: 'Autónomo',
}

/** Dónde se cambia, en las palabras de la app. */
export const DONDE_PERMISOS = 'Ajustes › Permisos y seguridad'
export const DONDE_CARPETAS = 'Ajustes › Permisos y seguridad › Carpetas a las que tu cerebro puede entrar'

/** Por dónde llegó una aceptación o un cambio (queda en el registro). */
export type ViaConsentimiento = 'bienvenida' | 'ajustes' | 'pildora' | 'pausa' | 'migracion' | 'version' | 'api'
export const esVia = (v: unknown): v is ViaConsentimiento => typeof v === 'string' && ['bienvenida', 'ajustes', 'pildora', 'pausa', 'migracion', 'version', 'api'].includes(v)

/** Consentimiento vigente: lo que la persona aceptó, con la versión y la huella del texto que leyó. */
export interface Consentimiento { ts: number; version: string; sha256: string; app: string; so: string; via: ViaConsentimiento }

export type AccionHistorial = 'aceptado' | 'retirado' | 'cambio_de_modo' | 'migracion' | 'version_nueva'
export interface EntradaHistorialModo {
  ts: number; accion: AccionHistorial; modo: ModoPermisos
  texto?: { version: string; sha256: string }; app?: string; so?: string; via?: ViaConsentimiento; motivo?: string
}

export interface EstadoPermisos {
  modo: ModoPermisos
  /** Consentimiento del modo Autónomo tal como se guardó (puede ser de una versión anterior del texto: ver `reaceptar`). */
  consentimiento: Consentimiento | null
  /** El consentimiento guardado es de otra versión del texto: Autónomo no aplica hasta que acepte la nueva. */
  reaceptar: boolean
  /** Archivo de una versión anterior con «Sin preguntar» o el freno quitado: la app ofrece Autónomo una vez. */
  migracion: 'libre' | 'sinFreno' | null
  /** No se poda: es la prueba de cada aceptación, retiro y cambio. */
  historialModo: EntradaHistorialModo[]
  /** A13 (0.2.15): el teléfono y el correo de la persona, para que mandarse algo a sí misma no cuente como «transmitir datos». */
  misDatos: MisDatos
}
/** Lo guarda la persona en Ajustes (solo la app: un agente no se pone destinos propios). Vacío = sin dato. */
export interface MisDatos { telefono: string; correo: string }
const SIN_DATOS = (): MisDatos => ({ telefono: '', correo: '' })
const MAX_HISTORIAL = 200

const archivo = () => join(DIR_ARBRAIN(), 'permisos.json')
let cache: { ruta: string; mtime: number; estado: EstadoPermisos } | null = null
const DEFECTO = (): EstadoPermisos => ({ modo: MODO_POR_DEFECTO, consentimiento: null, reaceptar: false, migracion: null, historialModo: [], misDatos: SIN_DATOS() })

const texto = (v: unknown, max = 60) => typeof v === 'string' ? v.slice(0, max) : ''

function leerConsentimiento(v: unknown): Consentimiento | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  if (typeof c.ts !== 'number' || typeof c.version !== 'string' || typeof c.sha256 !== 'string') return null
  return { ts: c.ts, version: c.version.slice(0, 80), sha256: c.sha256.slice(0, 64), app: texto(c.app), so: texto(c.so), via: esVia(c.via) ? c.via : 'api' }
}

function leerHistorial(v: unknown, viejo: unknown): EntradaHistorialModo[] {
  const out: EntradaHistorialModo[] = []
  // `historialFreno` de las versiones anteriores (activado/desactivado del freno quitado): se conserva como historia.
  if (Array.isArray(viejo)) for (const e of viejo) {
    if (!e || typeof e !== 'object' || typeof (e as { ts?: unknown }).ts !== 'number') continue
    const h = e as { ts: number; accion?: unknown; motivo?: unknown }
    out.push({ ts: h.ts, accion: 'cambio_de_modo', modo: 'carpeta', motivo: `freno quitado (versión anterior): ${texto(h.accion, 20)}${h.motivo ? `, ${texto(h.motivo, 200)}` : ''}` })
  }
  if (Array.isArray(v)) for (const e of v) {
    if (!e || typeof e !== 'object') continue
    const h = e as Record<string, unknown>
    if (typeof h.ts !== 'number' || !esModo(h.modo) || typeof h.accion !== 'string') continue
    const t = h.texto && typeof h.texto === 'object' ? h.texto as Record<string, unknown> : null
    out.push({
      ts: h.ts, accion: h.accion as AccionHistorial, modo: h.modo,
      ...(t && typeof t.version === 'string' && typeof t.sha256 === 'string' ? { texto: { version: t.version.slice(0, 80), sha256: t.sha256.slice(0, 64) } } : {}),
      ...(h.app ? { app: texto(h.app) } : {}), ...(h.so ? { so: texto(h.so) } : {}), ...(esVia(h.via) ? { via: h.via } : {}), ...(h.motivo ? { motivo: texto(h.motivo, 200) } : {}),
    })
  }
  return out.sort((a, b) => a.ts - b.ts).slice(-MAX_HISTORIAL)
}

const TELEFONO = /^\+?\d{8,15}$/
const CORREO = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/
/** Normaliza y valida; lo que no parece teléfono o correo se descarta (vacío). */
export function normalizarMisDatos(v: unknown): MisDatos | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Record<string, unknown>
  const tel = typeof d.telefono === 'string' ? d.telefono.trim().replace(/[\s().-]/g, '') : ''
  const correo = typeof d.correo === 'string' ? d.correo.trim().toLowerCase() : ''
  if (tel && !TELEFONO.test(tel)) return null
  if (correo && (!CORREO.test(correo) || correo.length > 120)) return null
  return { telefono: tel, correo }
}
function leerMisDatos(v: unknown): MisDatos { return normalizarMisDatos(v) ?? SIN_DATOS() }

export function estadoPermisos(): EstadoPermisos {
  try {
    const p = archivo()
    if (!existsSync(p)) return DEFECTO()
    const mtime = statSync(p).mtimeMs
    if (cache && cache.ruta === p && cache.mtime === mtime) return cache.estado
    const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
    const consentimiento = leerConsentimiento(j.consentimiento)
    // Versiones anteriores: «libre» (con o sin el freno quitado) baja a «carpeta» y queda marcado para la migración.
    const sinFrenoViejo = !!j.sinFreno && typeof j.sinFreno === 'object' && typeof (j.sinFreno as { desde?: unknown }).desde === 'number'
    const migracion: EstadoPermisos['migracion'] = j.migracion === 'libre' || j.migracion === 'sinFreno' ? j.migracion : j.modo === 'libre' ? (sinFrenoViejo ? 'sinFreno' : 'libre') : null
    let modo: ModoPermisos = esModo(j.modo) ? j.modo : MODO_POR_DEFECTO
    let reaceptar = false
    if (modo === 'autonomo') {
      // Autónomo solo vale con el consentimiento del texto empaquetado; otra versión (o ninguno) lo baja a «carpeta».
      if (!consentimiento) modo = 'carpeta'
      else if (!aceptacionCoincide(consentimiento.version, consentimiento.sha256)) { modo = 'carpeta'; reaceptar = true }
    }
    const estado: EstadoPermisos = { modo, consentimiento, reaceptar, migracion, historialModo: leerHistorial(j.historialModo, j.historialFreno), misDatos: leerMisDatos(j.misDatos) }
    cache = { ruta: p, mtime, estado }
    return estado
  } catch { return DEFECTO() }
}

export const modoPermisos = (): ModoPermisos => estadoPermisos().modo
export const esAutonomo = (): boolean => modoPermisos() === 'autonomo'

interface Guardado { modo: ModoPermisos; consentimiento: Consentimiento | null; migracion: EstadoPermisos['migracion']; historialModo: EntradaHistorialModo[]; misDatos?: MisDatos }

function escribir(e: Guardado, ahora: number): void {
  const p = archivo()
  // Cambiar de modo o retirar el consentimiento no borra «mis datos»: se conservan salvo que se escriban a propósito.
  const mis = e.misDatos ?? estadoPermisos().misDatos
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  const cuerpo = {
    modo: e.modo, cambiado: ahora,
    ...(e.consentimiento ? { consentimiento: e.consentimiento } : {}),
    ...(e.migracion ? { migracion: e.migracion } : {}),
    historialModo: e.historialModo.slice(-MAX_HISTORIAL),
    ...(mis.telefono || mis.correo ? { misDatos: mis } : {}),
  }
  writeFileSync(p, JSON.stringify(cuerpo, null, 1) + '\n', { mode: 0o600 })
  cache = null
}

const actual = (): Guardado => { const e = estadoPermisos(); return { modo: e.modo, consentimiento: e.consentimiento, migracion: e.migracion, historialModo: e.historialModo, misDatos: e.misDatos } }

/** A13: guarda el teléfono y el correo de la persona (Ajustes). Lo llama la ruta del daemon con el secreto de la app. */
export function guardarMisDatos(v: unknown, ahora = Date.now()): { ok: true; estado: EstadoPermisos } | { ok: false; error: string } {
  const d = normalizarMisDatos(v)
  if (!d) return { ok: false, error: 'Escribe tu teléfono con lada (8 a 15 dígitos) y un correo válido, o déjalos vacíos.' }
  escribir({ ...actual(), misDatos: d }, ahora)
  return { ok: true, estado: estadoPermisos() }
}

/** Los datos propios para las manos: teléfono y correo no vacíos. */
export const datosPropios = (): string[] => { const m = estadoPermisos().misDatos; return [m.telefono, m.correo].filter(Boolean) }

export type ResultadoModo = { ok: true; estado: EstadoPermisos; cambio: boolean } | { ok: false; status: number; error: string; code?: 'consentimiento' | 'version' }

export interface Aceptacion { version: unknown; sha256: unknown; app?: unknown; so?: unknown; via?: unknown }

/**
 * Cambia el modo. A «autonomo» solo con un consentimiento vigente (el guardado, si es del texto empaquetado) o con una
 * aceptación nueva que coincida con ese texto (`acepto`); si no, 409 con `code` para que la app muestre el texto. Pasar a
 * «carpeta» o «preguntar» conserva el consentimiento guardado (volver a Autónomo después es un clic) salvo que se retire.
 */
export function cambiarModoPermisos(modo: ModoPermisos, op: { acepto?: Aceptacion; via?: unknown; ahora?: number } = {}): ResultadoModo {
  const ahora = op.ahora ?? Date.now()
  const antes = actual()
  const via: ViaConsentimiento = esVia(op.via) ? op.via : 'api'
  let consentimiento = antes.consentimiento
  const historial = [...antes.historialModo]
  if (modo === 'autonomo') {
    const vigente = consentimiento && aceptacionCoincide(consentimiento.version, consentimiento.sha256)
    if (op.acepto) {
      if (!aceptacionCoincide(op.acepto.version, op.acepto.sha256)) return { ok: false, status: 409, code: 'version', error: `El texto que aceptaste no es el de esta versión de Arbrain (${VERSION_AUTONOMIA}). Recarga y vuelve a leerlo.` }
      consentimiento = { ts: ahora, version: String(op.acepto.version), sha256: String(op.acepto.sha256), app: texto(op.acepto.app), so: texto(op.acepto.so), via }
      historial.push({ ts: ahora, accion: 'aceptado', modo, texto: { version: consentimiento.version, sha256: consentimiento.sha256 }, app: consentimiento.app, so: consentimiento.so, via })
    } else if (!vigente) {
      return { ok: false, status: 409, code: 'consentimiento', error: 'El modo Autónomo necesita que leas y aceptes su texto (dos casillas). Ábrelo en Ajustes › Permisos y seguridad.' }
    }
  }
  if (antes.modo === modo && !op.acepto) return { ok: true, estado: estadoPermisos(), cambio: false }
  if (antes.modo !== modo && !(modo === 'autonomo' && op.acepto)) historial.push({ ts: ahora, accion: 'cambio_de_modo', modo, via, motivo: `de «${NOMBRE_MODO[antes.modo]}» a «${NOMBRE_MODO[modo]}»` })
  // Elegir un nivel ya es decidir sobre la migración de la versión anterior.
  escribir({ modo, consentimiento, migracion: null, historialModo: historial }, ahora)
  return { ok: true, estado: estadoPermisos(), cambio: true }
}

/** Atajo para pruebas y para quien no necesita el resultado completo. Lanza si Autónomo no tiene consentimiento. */
export function fijarModoPermisos(modo: ModoPermisos, ahora = Date.now()): ModoPermisos {
  const r = cambiarModoPermisos(modo, { ahora })
  if (!r.ok) throw new Error(r.error)
  return r.estado.modo
}

/** Retirar el consentimiento: baja a «carpeta», borra la aceptación y lo anota. Más estricto: no exige el secreto. */
export function retirarConsentimiento(op: { via?: unknown; ahora?: number } = {}): ResultadoModo {
  const ahora = op.ahora ?? Date.now()
  const antes = actual()
  if (!antes.consentimiento && antes.modo !== 'autonomo') return { ok: true, estado: estadoPermisos(), cambio: false }
  const via: ViaConsentimiento = esVia(op.via) ? op.via : 'api'
  escribir({ modo: 'carpeta', consentimiento: null, migracion: null, historialModo: [...antes.historialModo, { ts: ahora, accion: 'retirado', modo: 'carpeta', via, ...(antes.consentimiento ? { texto: { version: antes.consentimiento.version, sha256: antes.consentimiento.sha256 } } : {}) }] }, ahora)
  return { ok: true, estado: estadoPermisos(), cambio: true }
}

/**
 * La persona vio la oferta de migración (o el aviso de que el texto cambió) y decidió después: queda en «carpeta» y no
 * se le vuelve a preguntar. Si el consentimiento era de otra versión, se retira (sigue en el historial).
 */
export function cerrarMigracion(ahora = Date.now()): EstadoPermisos {
  const e = estadoPermisos()
  if (!e.migracion && !e.reaceptar) return e
  const entrada: EntradaHistorialModo = e.reaceptar
    ? { ts: ahora, accion: 'version_nueva', modo: 'carpeta', motivo: `el texto cambió a ${VERSION_AUTONOMIA} y la persona decidió después: queda en «Automático en mi carpeta»`, ...(e.consentimiento ? { texto: { version: e.consentimiento.version, sha256: e.consentimiento.sha256 } } : {}) }
    : { ts: ahora, accion: 'migracion', modo: 'carpeta', motivo: 'la persona decidió después: queda en «Automático en mi carpeta»' }
  escribir({ modo: 'carpeta', consentimiento: e.reaceptar ? null : e.consentimiento, migracion: null, historialModo: [...e.historialModo, entrada] }, ahora)
  return estadoPermisos()
}
