/**
 * Política de manos para la edición cliente (seguridad, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09).
 *
 * 1. Interruptor de computer use. En la Mac de un cliente las manos nacen APAGADAS: ninguna herramienta se lista ni
 *    se ejecuta hasta que la persona lo enciende en Arbrain (primer arranque o Ajustes › Mac y sistema). En la
 *    instalación de Daniel, sin archivo, siguen encendidas como hoy; el mismo archivo sirve de apagado general.
 *    Archivo: `~/.config/arbrain/manos/computer-use.json` = { encendido, decidido_en, por } (0600).
 *
 * 2. La voz del usuario. La «cita» que desbloquea el freno la escribe el modelo; nada impedía inventarla. En la
 *    edición cliente el daemon guarda lo que la persona escribió de verdad en el chat (`registrarVoz`) y una cita solo
 *    vale si sale de ahí (`citaReal`). Archivo: `~/.config/arbrain/manos/voz.json` (0600, local, últimos mensajes).
 *    En la instalación de Daniel no se guarda nada y `verificarCita` no cambia el criterio de siempre.
 *
 * 3. Quién es la fuente (red team M1, 11 oct 2026). Antes ambos eran archivos que cualquier proceso del usuario podía
 *    escribir, incluido el Bash del agente: escribiendo dos JSON encendía computer use y fabricaba «la cita». En la
 *    edición cliente la fuente es el DAEMON (`marcarFuenteLocal`, lo llama al arrancar):
 *      - la voz vive solo en su memoria (nunca en disco);
 *      - el interruptor vive en su memoria; el archivo es solo su persistencia entre aperturas. Encenderlo exige la
 *        ruta de la app (`POST /manos/interruptor` con el secreto de confirmar). Si alguien escribe el archivo para
 *        ENCENDER, se ignora y se reescribe; para APAGAR, se acepta (dirección segura).
 *    El proceso de manos (hijo del CLI, mismo usuario que el Bash del agente) no lee esos archivos: pregunta al daemon
 *    (`refrescarDesdeDaemon` → `GET /manos/estado` con el pase) antes de cada llamada. Sin daemon: apagado y sin voz.

 *
 * 4. Disponibilidad por sistema (0.1.2, 17 oct 2026; revierte DECISIONES #11 con su red team: docs/builds/
 *    alumno-0.1.2-computer-use-2026-10-17). En la edición cliente computer use EXISTE en macOS y Windows (adaptador
 *    `casa` y `windows`) y no en Linux. Sigue naciendo APAGADO en cada apertura de la app: el archivo del interruptor ya
 *    no enciende nada al arrancar (red team 3 M-7); solo la persona lo enciende desde la app. Las defensas de C-1, A-1,
 *    A-2 y A-3 viven en `freno-cliente.ts` y `juicio-url.ts`. Daniel: sin cambio.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { CITA_MIN_CLIENTE, nombraAccion } from './cubre.js'

// ---------- 1. Interruptor ----------

export interface Interruptor { encendido: boolean; decidido_en?: string; por?: string }

export const RUTA_INTERRUPTOR = () => join(DIR_ARBRAIN(), 'manos', 'computer-use.json')

function leerArchivoInterruptor(): Interruptor | null {
  try {
    const j = JSON.parse(readFileSync(RUTA_INTERRUPTOR(), 'utf8'))
    return j && typeof j.encendido === 'boolean' ? j : null
  } catch { return null }
}

// ---------- 3. Fuente de verdad en la edición cliente (M1) ----------

/** Este proceso es el daemon (fuente de la voz y del interruptor). */
let fuenteLocal = false
/** Decisión vigente del interruptor según el daemon (null = sin decidir: apagado en cliente). */
let interruptorMemoria: Interruptor | null = null
/** Lo que la persona escribió en el chat, solo en memoria del daemon. */
let vozMemoria: Voz[] = []
/** Lo último que el daemon le dijo a este proceso de manos. */
let remoto: { encendido: boolean; voz: Voz[]; modo: ModoManos; propios?: string[] } | null = null
/**
 * Modo de permisos que ven las manos (0.2.15): en Autónomo el freno solo aplica su red mínima y la cita sale del chat;
 * en los demás, lo de siempre (cita que nombre la acción + clic I8). Instalación de Daniel: `original` (sin cambio).
 */
export type ModoManos = 'original' | 'preguntar' | 'carpeta' | 'autonomo'
/** Quien sabe el modo en el daemon lo registra aquí (server.ts al arrancar); el proceso de manos lo recibe por `/manos/estado`. */
let modoLocal: () => ModoManos = () => 'preguntar'
export function registrarModoManos(f: () => ModoManos): void { modoLocal = f }
/** A13 (0.2.15): el teléfono y el correo que la persona guardó en Ajustes (daemon: `modo-permisos.ts › datosPropios`). */
let propiosLocal: () => string[] = () => []
export function registrarDatosPropios(f: () => string[]): void { propiosLocal = f }
/** Alteraciones del archivo del interruptor que se ignoraron (para la bitácora del daemon). */
let alteraciones = 0

const modoRemoto = () => esEdicionCliente() && !fuenteLocal

/** El daemon se declara fuente al arrancar (edición cliente): toma la decisión persistida y desde ahí manda su memoria. */
export function marcarFuenteLocal(): void {
  fuenteLocal = true
  // Red team 3 M-7: el archivo no enciende nada al arrancar. En cliente cada apertura nace apagada; la persona lo
  // enciende en la app (POST /manos/interruptor con el secreto de confirmar). Apagar por archivo sigue valiendo.
  interruptorMemoria = null
}

/** Sistemas donde la edición cliente trae manos (0.1.2): macOS (`casa`) y Windows (`windows`). */
export const PLATAFORMAS_COMPUTER_USE = new Set<string>(['darwin', 'win32'])

/** ¿Existe computer use en esta instalación? Daniel: siempre. Cliente: solo en macOS y Windows. Un solo lugar que lo dice. */
export const computerUseDisponible = (plataforma: string = process.env.ARBRAIN_PLATAFORMA_PRUEBA || process.platform): boolean =>
  !esEdicionCliente() || PLATAFORMAS_COMPUTER_USE.has(plataforma)

export const MENSAJE_NO_DISPONIBLE = 'Computer use no está disponible en este sistema (Arbrain lo trae en macOS y Windows): las manos no observan, no hacen clic, no escriben ni navegan, y no hay forma de encenderlas. No intentes otra vía (AppleScript, osascript, cliclick) para controlar apps o el navegador: dile a la persona qué haría falta y espera.'

export function leerInterruptor(): Interruptor | null {
  if (!esEdicionCliente()) return leerArchivoInterruptor()
  // Linux (cliente): ni memoria, ni archivo, ni daemon.
  if (!computerUseDisponible()) return null
  if (!fuenteLocal) return remoto ? { encendido: remoto.encendido, por: 'daemon' } : null
  const archivo = leerArchivoInterruptor()
  // A11 (0.2.15): en Autónomo, computer use queda como la persona lo dejó entre aperturas (el archivo lo escribió la ruta
  // de la app con su secreto). En los demás modos sigue naciendo apagado en cada apertura (red team 3 M-7).
  if (interruptorMemoria === null && archivo?.encendido && modoLocal() === 'autonomo') interruptorMemoria = { ...archivo, por: 'autonomo' }
  const vigente = interruptorMemoria?.encendido === true
  if (archivo && archivo.encendido !== vigente) {
    if (!archivo.encendido) interruptorMemoria = archivo          // apagar por archivo: dirección segura, se acepta
    else { alteraciones++; try { escribirPrivado(RUTA_INTERRUPTOR(), interruptorMemoria ?? { encendido: false, decidido_en: new Date().toISOString(), por: 'daemon' }) } catch { /* el daemon sigue con su memoria */ } }
  }
  return interruptorMemoria
}

/** Cuántas veces alguien escribió el archivo para encender sin pasar por la app (solo diagnóstico). */
export const alteracionesInterruptor = () => alteraciones

/** ¿Pueden actuar las manos? Lo decide el archivo; sin decisión: apagadas en la edición cliente, encendidas en la de Daniel. */
export function computerUseEncendido(): boolean {
  if (!computerUseDisponible()) return false
  const i = leerInterruptor()
  return i ? i.encendido : !esEdicionCliente()
}

function escribirPrivado(ruta: string, datos: unknown): void {
  mkdirSync(join(ruta, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(datos, null, 1), { mode: 0o600 })
  renameSync(`${ruta}.tmp`, ruta)
}

/** Fija el interruptor. En la edición cliente solo el daemon (fuente) lo cambia de verdad: ruta de la app. */
export function fijarInterruptor(encendido: boolean, por: string): Interruptor {
  if (!computerUseDisponible()) {
    // Sin computer use en este sistema: no se enciende ni se escribe nada. Apagar es un no-op (ya está apagado).
    if (encendido) throw new Error(MENSAJE_NO_DISPONIBLE)
    return { encendido: false, por: 'edicion' }
  }
  const i: Interruptor = { encendido, decidido_en: new Date().toISOString(), por }
  escribirPrivado(RUTA_INTERRUPTOR(), i)
  if (fuenteLocal) interruptorMemoria = i
  return i
}

export const MENSAJE_APAGADO = 'Computer use está APAGADO en esta instalación: las manos no observan, no hacen clic, no escriben ni navegan. Solo la persona puede encenderlo en Arbrain › Ajustes › Mac y sistema › Computer use. No intentes otra vía (AppleScript, osascript, cliclick) para controlar apps o el navegador: díselo y espera.'

// ---------- 2. La voz del usuario ----------

export const RUTA_VOZ = () => join(DIR_ARBRAIN(), 'manos', 'voz.json')
const MAX_MENSAJES = 40
const MAX_CHARS = 4000
/** Minutos que una frase del usuario sirve como cita (por defecto 2 h). */
// Red team 3 A-3: en cliente la ventana es de 30 min (antes 2 h): una frase vieja no autoriza lo de ahora.
const VENTANA_MS = () => (Number(process.env.MANOS_VOZ_VENTANA_MIN) || (esEdicionCliente() ? 30 : 120)) * 60_000

interface Voz { t: number; texto: string }

export const normalizarCita = (s: string) => s.normalize('NFC').toLowerCase().replace(/[«»“”"]/g, '').replace(/\s+/g, ' ').trim().replace(/^['‘’]+|['‘’]+$/g, '').trim()

function leerVoz(): Voz[] {
  if (esEdicionCliente()) return fuenteLocal ? vozMemoria : (remoto?.voz ?? [])
  try {
    const j = JSON.parse(readFileSync(RUTA_VOZ(), 'utf8'))
    return Array.isArray(j) ? j.filter(v => v && typeof v.t === 'number' && typeof v.texto === 'string') : []
  } catch { return [] }
}

/**
 * Guarda lo que la persona escribió (el daemon lo llama al recibir un mensaje del chat). Solo en la edición cliente;
 * `forzar` para pruebas. Nunca tumba el turno.
 */
export function registrarVoz(texto: string, op: { forzar?: boolean; ahora?: number } = {}): void {
  if (!op.forzar && !esEdicionCliente()) return
  const limpio = normalizarCita(String(texto ?? '')).slice(0, MAX_CHARS)
  if (!limpio) return
  try {
    const ahora = op.ahora ?? Date.now()
    const vivas = leerVoz().filter(v => ahora - v.t < VENTANA_MS())
    vivas.push({ t: ahora, texto: limpio })
    // Edición cliente (M1): solo el daemon guarda la voz, y solo en memoria. Nadie la puede escribir desde fuera.
    if (esEdicionCliente()) { if (fuenteLocal) vozMemoria = vivas.slice(-MAX_MENSAJES); return }
    escribirPrivado(RUTA_VOZ(), vivas.slice(-MAX_MENSAJES))
  } catch { /* la voz en disco nunca tumba el chat */ }
}

/**
 * ¿La cita sale de algo que la persona escribió de verdad en las últimas horas? Acepta recortes con «…»: cada trozo
 * (de 4+ caracteres) tiene que estar en el MISMO mensaje, y entre todos sumar 8+ caracteres.
 */
export function citaReal(cita: unknown, ahora = Date.now()): boolean {
  if (typeof cita !== 'string') return false
  const trozos = normalizarCita(cita).split(/\s*(?:…|\.\.\.)\s*/).map(t => t.trim()).filter(t => t.length >= 4)
  if (trozos.reduce((n, t) => n + t.length, 0) < 8) return false
  return leerVoz().some(v => ahora - v.t < VENTANA_MS() && trozos.every(t => v.texto.includes(t)))
}

/** Criterio único del freno: en la instalación de Daniel no cambia nada; en la edición cliente la cita tiene que ser real. */
export function verificarCita(cita: unknown): boolean {
  return !esEdicionCliente() || citaReal(cita)
}

export const MENSAJE_CITA_FALSA = 'La cita no coincide con nada que la persona haya escrito en el chat en las últimas horas. Una confirmación solo vale si son sus palabras textuales (cópialas tal cual de su mensaje); si no te lo pidió, pregúntale.'

/** Lo que la persona escribió hace poco (normalizado, lo más reciente al final). Daemon: su memoria; manos: lo que le dio el daemon. */
export function vozReciente(ahora = Date.now()): string[] {
  if (!esEdicionCliente()) return []
  return leerVoz().filter(v => ahora - v.t < VENTANA_MS()).map(v => v.texto)
}

/**
 * A5 (0.2.15): la cita sale del chat, no se le pide a la persona. La frase suya más reciente (de cualquier largo desde 0.2.16) que nombra
 * la acción de esta categoría (`cubre.ts`), o null. El modelo no la copia ni la inventa: la toma el freno.
 */
export function citaDelChat(categoria: string | undefined, ahora = Date.now()): string | null {
  if (!esEdicionCliente()) return null
  const voces = vozReciente(ahora)
  for (let i = voces.length - 1; i >= 0; i--) {
    const v = voces[i]
    if (v.trim().length >= CITA_MIN_CLIENTE && (!categoria || nombraAccion(categoria, v))) return v
  }
  return null
}

/** El modo de permisos que rige a las manos en este proceso. */
export function modoManos(): ModoManos {
  if (!esEdicionCliente()) return 'original'
  if (fuenteLocal) return modoLocal()
  return remoto?.modo ?? 'preguntar'
}
export const manosAutonomas = (): boolean => modoManos() === 'autonomo'

// ---------- 4. Manos pregunta al daemon (M1) ----------

/** Lo que el daemon le da al proceso de manos (`GET /manos/estado`, pase de agente). */
export function estadoParaManos(ahora = Date.now()): { encendido: boolean; voz: Voz[]; modo: ModoManos; propios: string[] } {
  return { encendido: computerUseEncendido(), voz: leerVoz().filter(v => ahora - v.t < VENTANA_MS()), modo: modoManos(), propios: datosPropios() }
}

/** A13: teléfono y correo propios de la persona. Fuera de la edición cliente, ninguno (la instalación de Daniel no cambia). */
export function datosPropios(): string[] {
  if (!esEdicionCliente()) return []
  if (fuenteLocal) { try { return propiosLocal() } catch { return [] } }
  return remoto?.propios ?? []
}

/**
 * A13: ¿todos los teléfonos y correos de este texto son de la persona (Ajustes › «Tus datos»)? Teléfonos por sus últimos
 * 10 dígitos (8 si alguno es más corto), correos tal cual. Sin teléfonos ni correos, o sin datos propios: false.
 */
export function esDatoPropio(texto: string, propios: readonly string[] = datosPropios()): boolean {
  if (!propios.length) return false
  const t = texto.toLowerCase()
  const correos = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []
  const telefonos = (t.match(/\+?\d[\d ()-]{7,}\d/g) ?? []).map(x => x.replace(/\D/g, '')).filter(x => x.length >= 8)
  if (!correos.length && !telefonos.length) return false
  const misTel = propios.map(p => p.replace(/\D/g, '')).filter(p => !p.includes('@') && p.length >= 8)
  const misCorreos = propios.filter(p => p.includes('@')).map(p => p.toLowerCase())
  const mismoTel = (a: string, b: string) => { const n = Math.min(10, a.length, b.length); return n >= 8 && a.slice(-n) === b.slice(-n) }
  return correos.every(c => misCorreos.includes(c)) && telefonos.every(d => misTel.some(m => mismoTel(d, m)))
}

/**
 * Proceso de manos en la edición cliente: trae del daemon el interruptor y la voz. Sin daemon, sin respuesta o con
 * error: apagado y sin voz (falla del lado seguro). Instalación de Daniel o el propio daemon: no hace nada.
 */
export async function refrescarDesdeDaemon(op: { fetcher?: typeof fetch; plazoMs?: number } = {}): Promise<void> {
  if (!modoRemoto()) return
  const puerto = process.env.MC_SERVER_PORT, token = process.env.ARBRAIN_PASE_AGENTE || process.env.OPENCLAW_GATEWAY_TOKEN
  try {
    if (!puerto || !token) throw new Error('sin daemon')
    const r = await (op.fetcher ?? fetch)(`http://127.0.0.1:${puerto}/manos/estado`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(op.plazoMs ?? 3000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = await r.json() as { encendido?: unknown; voz?: unknown; modo?: unknown; propios?: unknown }
    const voz = Array.isArray(j.voz) ? (j.voz as Voz[]).filter(v => v && typeof v.t === 'number' && typeof v.texto === 'string').slice(-MAX_MENSAJES) : []
    // Un modo que no se reconoce cae al más estricto: la red de las manos nunca se abre por un dato raro.
    const modo: ModoManos = j.modo === 'autonomo' || j.modo === 'carpeta' || j.modo === 'preguntar' ? j.modo : 'preguntar'
    const propios = Array.isArray(j.propios) ? j.propios.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, 2) : []
    remoto = { encendido: j.encendido === true, voz, modo, propios }
  } catch { remoto = { encendido: false, voz: [], modo: 'preguntar' } }
}

/** Solo pruebas. */
export function _politicaParaPruebas(p: { fuenteLocal?: boolean; modo?: ModoManos; propios?: string[] } = {}): void {
  fuenteLocal = !!p.fuenteLocal
  interruptorMemoria = null   // como marcarFuenteLocal(): el archivo no enciende al arrancar (M-7)
  vozMemoria = []
  remoto = null
  alteraciones = 0
  modoLocal = () => p.modo ?? 'preguntar'
  propiosLocal = () => p.propios ?? []
}
