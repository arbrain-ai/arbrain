/**
 * Política de autonomía (v2, firmada el 3 nov 2026: «lo reversible lo hago y aviso; lo irreversible te aviso antes»).
 *
 * UN solo archivo la guarda y lo leen todos: el freno de manos (nativo y web), Levy (instrucciones y bandeja) y la app
 * (Ajustes). Vive en `<DIR_ARBRAIN>/autonomia/politica.json`; si no existe, rige el preset de la edición (instalación
 * original: Piloto automático; alumno: Equilibrado). Se escribe con `fijarPolitica` (la app) y es legible a mano: trae
 * la explicación de cada clase y lo vigente ya calculado.
 *
 * Cada acción cae en una CLASE y cada clase tiene un MODO:
 *   hacer  Levy lo hace solo y lo anota en «Lo que hice solo» (con cómo deshacerlo cuando se pueda).
 *   tocar  Levy avisa ANTES con una tarjeta (Sí · No · Otro) y espera el toque. Sin respuesta, no sale.
 *   nunca  Levy no lo hace; lo hace la persona.
 *
 * El PISO no se edita: contactar personas, pagar, borrar lo que no es de prueba, publicar fuera de la cohorte y aceptar
 * términos legales nunca bajan de «tocar», diga lo que diga el archivo (un archivo alterado no relaja lo irreversible).
 * En la edición cliente, además, pagar es «nunca» (R1: Arbrain no paga en esta versión).
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { diaCivil } from '../zona.js'

export type Clase = 'configurar' | 'agenda' | 'cohorte' | 'borrar_prueba' | 'contactar' | 'pagar' | 'borrar' | 'publicar' | 'legal'
export type Modo = 'hacer' | 'tocar' | 'nunca'
export type Preset = 'cauteloso' | 'equilibrado' | 'piloto'

export const CLASES: readonly Clase[] = ['configurar', 'agenda', 'cohorte', 'borrar_prueba', 'contactar', 'pagar', 'borrar', 'publicar', 'legal']
export const PRESETS: readonly Preset[] = ['cauteloso', 'equilibrado', 'piloto']
const MODOS: readonly Modo[] = ['hacer', 'tocar', 'nunca']
export const esClase = (v: unknown): v is Clase => typeof v === 'string' && (CLASES as readonly string[]).includes(v)
export const esPreset = (v: unknown): v is Preset => typeof v === 'string' && (PRESETS as readonly string[]).includes(v)
export const esModo = (v: unknown): v is Modo => typeof v === 'string' && (MODOS as readonly string[]).includes(v)

/** Lo que ve la persona (Ajustes, tarjetas, el archivo) y lo que lee Levy. */
export const INFO_CLASE: Record<Clase, { nombre: string; que: string; irreversible: boolean }> = {
  configurar: { nombre: 'Configurar servicios', irreversible: false, que: 'Crear cuentas, llaves API y configuraciones en servicios que pediste (p. ej. «Create key» en una consola).' },
  agenda: { nombre: 'Tu agenda', irreversible: false, que: 'Mover tu agenda, choques incluidos. Si moverla implica escribirle a otra persona, cuenta como contactar.' },
  cohorte: { nombre: 'Classroom de la cohorte', irreversible: false, que: 'Publicar o esconder en el classroom de la cohorte lo que ya existe; subir clips.' },
  borrar_prueba: { nombre: 'Borrar lo de prueba', irreversible: false, que: 'Borrar recursos de prueba que creó Levy.' },
  contactar: { nombre: 'Contactar personas', irreversible: true, que: 'WhatsApp, DM, correo, comentarios con mención, invitaciones a terceros, formularios de contacto.' },
  pagar: { nombre: 'Pagar', irreversible: true, que: 'Comprar, pagar, suscribirse, transferir, escribir datos de pago.' },
  borrar: { nombre: 'Borrar', irreversible: true, que: 'Borrar lo que no es de prueba (archivos, mensajes, cuentas, registros).' },
  publicar: { nombre: 'Publicar fuera de la cohorte', irreversible: true, que: 'Posts, videos, tuits y cualquier publicación que ven personas fuera de la cohorte.' },
  legal: { nombre: 'Términos legales', irreversible: true, que: 'Aceptar o firmar contratos y términos legales.' },
}

/** Siempre de la persona, en cualquier preset: Levy lo redacta como ella lo diría y le pide el toque. */
export const SIEMPRE_SUYO = ['promesas a personas', 'precios', 'reembolsos', 'cobranza', 'mensajes delicados o personales'] as const

export const NOMBRE_PRESET: Record<Preset, string> = { cauteloso: 'Cauteloso', equilibrado: 'Equilibrado', piloto: 'Piloto automático' }
export const INFO_PRESET: Record<Preset, string> = {
  cauteloso: 'Todo lo que tiene efecto afuera espera tu toque, también configurar servicios.',
  equilibrado: 'Configura servicios y mueve tu agenda solo; el classroom, lo de prueba y lo irreversible esperan tu toque.',
  piloto: 'Todo lo reversible lo hace solo y te avisa; solo lo irreversible espera tu toque.',
}

const IRREVERSIBLE_TOCA: Record<Clase, Modo> = { configurar: 'tocar', agenda: 'tocar', cohorte: 'tocar', borrar_prueba: 'tocar', contactar: 'tocar', pagar: 'tocar', borrar: 'tocar', publicar: 'tocar', legal: 'tocar' }
export const MODOS_PRESET: Record<Preset, Record<Clase, Modo>> = {
  cauteloso: { ...IRREVERSIBLE_TOCA },
  equilibrado: { ...IRREVERSIBLE_TOCA, configurar: 'hacer', agenda: 'hacer' },
  piloto: { ...IRREVERSIBLE_TOCA, configurar: 'hacer', agenda: 'hacer', cohorte: 'hacer', borrar_prueba: 'hacer' },
}

/** El piso: lo irreversible nunca baja de «tocar». */
export function conPiso(clase: Clase, modo: Modo, cliente = esEdicionCliente()): Modo {
  if (cliente && clase === 'pagar') return 'nunca'
  if (INFO_CLASE[clase].irreversible && modo === 'hacer') return 'tocar'
  return modo
}

export interface Politica {
  version: 1
  preset: Preset
  /** Lo que la persona cambió respecto del preset (lo único que se lee además del preset). */
  ajustes: Partial<Record<Clase, Modo>>
  /** Lo que rige, ya con el piso (se recalcula al leer; editar `preset` o `ajustes`). */
  vigente: Record<Clase, Modo>
  actualizado?: string
  por?: string
}

export const presetPorDefecto = (cliente = esEdicionCliente()): Preset => (cliente ? 'equilibrado' : 'piloto')

export function armarPolitica(preset: Preset, ajustes: Partial<Record<Clase, Modo>> = {}, cliente = esEdicionCliente()): Politica {
  const limpios: Partial<Record<Clase, Modo>> = {}
  for (const [c, m] of Object.entries(ajustes)) if (esClase(c) && esModo(m) && m !== MODOS_PRESET[preset][c]) limpios[c] = m
  const vigente = {} as Record<Clase, Modo>
  for (const c of CLASES) vigente[c] = conPiso(c, limpios[c] ?? MODOS_PRESET[preset][c], cliente)
  return { version: 1, preset, ajustes: limpios, vigente }
}

export const RUTA_POLITICA = () => process.env.ARBRAIN_POLITICA_AUTONOMIA || join(DIR_ARBRAIN(), 'autonomia', 'politica.json')

let cache: { ruta: string; mtime: number; politica: Politica } | null = null
/**
 * Edición cliente: el proceso de manos no lee archivos que un agente podría escribir (M1); la política le llega del
 * daemon (`/manos/estado`). Sin ella, el preset más estricto.
 */
let remota: Politica | null = null
let fuenteDaemon = false
export function registrarPoliticaRemota(p: unknown): void {
  const j = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
  remota = esPreset(j.preset) ? armarPolitica(j.preset, (j.ajustes ?? {}) as Partial<Record<Clase, Modo>>, true) : null
}
/** El daemon del alumno lee el archivo (su carpeta de datos, fuera del alcance de los agentes). */
export function marcarFuentePolitica(): void { fuenteDaemon = true }

function leerArchivo(): Politica | null {
  const ruta = RUTA_POLITICA()
  try {
    const mtime = statSync(ruta).mtimeMs
    if (cache && cache.ruta === ruta && cache.mtime === mtime) return cache.politica
    const j = JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>
    const politica = { ...armarPolitica(esPreset(j.preset) ? j.preset : presetPorDefecto(), (j.ajustes ?? {}) as Partial<Record<Clase, Modo>>), ...(typeof j.actualizado === 'string' ? { actualizado: j.actualizado } : {}), ...(typeof j.por === 'string' ? { por: j.por.slice(0, 60) } : {}) }
    cache = { ruta, mtime, politica }
    return politica
  } catch { return null }
}

/** La política que rige en este proceso. */
export function politicaVigente(): Politica {
  if (esEdicionCliente() && !fuenteDaemon) return remota ?? armarPolitica('cauteloso', {}, true)
  return leerArchivo() ?? armarPolitica(presetPorDefecto())
}

export const modoDe = (clase: Clase): Modo => politicaVigente().vigente[clase]

/** El archivo como lo lee una persona o Levy: preset, ajustes, lo vigente y qué significa cada clase. */
export function archivoLegible(p: Politica): Record<string, unknown> {
  return {
    version: 1,
    leeme: 'Política de autonomía de Levy. Edita «preset» (cauteloso, equilibrado, piloto) o «ajustes» ({ clase: hacer|tocar|nunca }). «vigente» se recalcula. Lo irreversible nunca baja de «tocar».',
    preset: p.preset, ajustes: p.ajustes, vigente: p.vigente,
    clases: Object.fromEntries(CLASES.map(c => [c, `${INFO_CLASE[c].nombre}${INFO_CLASE[c].irreversible ? ' (irreversible)' : ''}: ${INFO_CLASE[c].que}`])),
    modos: { hacer: 'Levy lo hace solo y lo anota en «Lo que hice solo».', tocar: 'Levy te avisa antes con una tarjeta (Sí · No · Otro); sin tu toque no sale.', nunca: 'Levy no lo hace; lo haces tú.' },
    siempre_tuyo: SIEMPRE_SUYO,
    ...(p.actualizado ? { actualizado: p.actualizado } : {}), ...(p.por ? { por: p.por } : {}),
  }
}

/** La app cambia la política (preset y ajustes). Escritura atómica, 0600. */
export function fijarPolitica(preset: Preset, ajustes: Partial<Record<Clase, Modo>> = {}, por = 'app'): Politica {
  const p: Politica = { ...armarPolitica(preset, ajustes), actualizado: new Date().toISOString(), por: por.slice(0, 60) }
  const ruta = RUTA_POLITICA()
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(archivoLegible(p), null, 2) + '\n', { mode: 0o600 })
  renameSync(`${ruta}.tmp`, ruta)
  cache = null
  return p
}

// ---------- «Lo que hice solo» ----------

export interface HechoSolo {
  ts: string
  clase: Clase
  /** Una línea: qué hizo Levy, en palabras de la persona. */
  que: string
  /** Dónde (dominio o app). */
  donde?: string
  /** Cómo se deshace, si se puede. */
  deshacer?: string
  /** Quién lo hizo (manos, web, levy, cron). */
  origen?: string
  /** Pedido o bitácora de origen. */
  ref?: string
  /** Sesión de Claude o conversación donde se hizo: ahí vuelve un «Deshacer». */
  sesion?: string
  conversacion?: { owner: string; account: string; conversationId: string }
}

export const DIR_HECHO_SOLO = () => process.env.ARBRAIN_HECHO_SOLO_DIR || join(DIR_ARBRAIN(), 'autonomia', 'hecho-solo')

/** Anota una línea en «Lo que hice solo» (un archivo por día civil). Nunca tumba la acción. */
export function anotarHechoSolo(h: Omit<HechoSolo, 'ts'> & { ts?: string }): void {
  // Edición cliente: la bitácora del daemon («Lo que hizo Levy») ya lo registra; el proceso de manos no escribe aquí.
  if (esEdicionCliente() && !fuenteDaemon) return
  try {
    const dir = DIR_HECHO_SOLO()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const fila: HechoSolo = { ts: h.ts ?? new Date().toISOString(), clase: h.clase, que: h.que.replace(/\s+/g, ' ').slice(0, 240), ...(h.donde ? { donde: h.donde.slice(0, 120) } : {}), ...(h.deshacer ? { deshacer: h.deshacer.slice(0, 200) } : {}), ...(h.origen ? { origen: h.origen.slice(0, 30) } : {}), ...(h.ref ? { ref: h.ref.slice(0, 60) } : {}), ...(h.sesion ? { sesion: h.sesion.slice(0, 60) } : {}), ...(h.conversacion ? { conversacion: h.conversacion } : {}) }
    appendFileSync(join(dir, `${diaCivil(new Date(fila.ts))}.jsonl`), JSON.stringify(fila) + '\n', { mode: 0o600 })
  } catch { /* la anotación nunca tumba la acción */ }
}

/** Solo pruebas. */
export function _politicaAutonomiaParaPruebas(p: { remota?: unknown; fuenteDaemon?: boolean } = {}): void {
  cache = null
  fuenteDaemon = !!p.fuenteDaemon
  remota = null
  if (p.remota !== undefined) registrarPoliticaRemota(p.remota)
}
