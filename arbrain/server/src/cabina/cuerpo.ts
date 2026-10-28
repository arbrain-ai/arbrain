/**
 * El cuerpo de la Cabina: lo que corre en el Studio, visto y operado desde el chat.
 *
 * Goal 3 (30 sep 2026): un solo motor. Las terminales viven en el MOTOR DE ARBRAIN
 * (`arbrain/motor`, socket `~/.config/arbrain/motor.sock`): dueño de las PTYs
 * inmortales, adopta las del ptyd de SFTerm sin matarlas y se releva a sí mismo sin
 * matar procesos. Este módulo le habla directo por su socket (`../motor/cliente.ts`):
 * la pantalla sale de su emulador VT sin cabeza y la conversación del lector
 * multi-harness (`../motor/lector.ts`, parsers compartidos con SFTerm). Sin gate de
 * archivos y sin que SFTerm tenga que estar abierto.
 *
 * Si el motor no responde, cae al gate de SFTerm (el camino del goal 2) y la vista
 * lo dice: así este código puede llegar a producción antes de que el motor se instale.
 *
 * Candados:
 *  - Levy solo cierra/retoma terminales que ÉL lanzó (registro de subagentes).
 *  - Lista blanca de harness (claude, codex) y de carpetas (/tmp, ~/Developer): valen
 *    igual si el pedido viene del escritorio o del teléfono.
 *  - Tope visible de subagentes en paralelo y de tokens por día.
 *  - Permisos: los subagentes nacen en bypassPermissions (orden de Daniel, 1 oct 08:20:
 *    él asume el riesgo). `CABINA_PERMISOS=auto|acceptEdits` lo baja sin tocar código.
 *  - Entrega sin tropiezos (LISTA #10 y #11): el subagente queda en el registro de Levy
 *    en cuanto existe su PTY, ANTES de entregar el encargo; la entrega espera a que el
 *    CLI esté en su caja (pasa los diálogos de arranque), confirma que llegó y reintenta.
 *  - La salida que sale al chat pasa por `tachar()`: nada que parezca secreto.
 */
import type { Juicio } from './juez.js'
import type { EstadoTablero } from './tablero.js'
import { DUENO, DUENO_M } from '../dueno.js'
import { readEnvFile } from '../env.js'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { motor, motorSock, type TermDetail } from '../motor/cliente.js'
import { harnessDe, leer, type Harness } from '../motor/lector.js'
import { ctxWindowFor } from '../motor/sfterm/msgs.js'
import { internas as leerInternas, type TareaInterna } from './internos.js'
import { apagar, procesos as leerProcesos, type Proceso } from './procesos.js'
import { ES_DEL_NEGOCIO, explicar, ficha, type AreaServicio } from './servicios-legibles.js'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { notaAutoria } from './autoria.js'

const run = promisify(execFile)
const GATE = join(homedir(), 'Developer/software/sfterm/scripts/gate.py')
// Edición cliente: python3 del PATH (las vistas que lo usan están apagadas ahí; contrato §8).
const PY = esEdicionCliente() ? 'python3' : '/opt/homebrew/bin/python3'
const configDir = () => DIR_ARBRAIN()
const registroPath = () => join(configDir(), 'subagentes.json')

// ── Topes (visibles en la vista «trabajos») ──
export const TOPES = {
  // El proceso MCP de la cabina no hereda arbrain/server/.env: se lee también del archivo (2 oct 2026).
  paralelo: () => Number(process.env.CABINA_MAX_SUBAGENTES ?? readEnvFile()['CABINA_MAX_SUBAGENTES']) || 3,
  tokensDia: () => Number(process.env.CABINA_TOPE_TOKENS_DIA ?? readEnvFile()['CABINA_TOPE_TOKENS_DIA']) || 3_000_000,
}
/** Lista blanca del camino viejo (pantalla): solo los CLIs cuya pantalla se sabe leer. */
export const HARNESS_PERMITIDOS = ['claude', 'codex'] as const
/** Lo que `delegar` acepta hoy: todos los adaptadores registrados, salvo con CABINA_DELEGAR_MODO=pantalla. */
export async function harnessPermitidos(): Promise<readonly string[]> {
  const { modoDelegar } = await import('./sin-pantalla.js')
  return modoDelegar() === 'pantalla' ? HARNESS_PERMITIDOS : (await import('./harness/index.js')).NOMBRES
}

export async function gate<T = unknown>(op: string, args: Record<string, unknown> = {}, timeout = 30_000): Promise<T> {
  const { stdout } = await run(PY, [GATE, op, JSON.stringify(args)], { timeout, maxBuffer: 4_000_000 })
  const r = JSON.parse(stdout) as { ok: boolean; data?: T; error?: string }
  if (!r.ok) throw new Error(r.error ?? `gate ${op} falló`)
  return r.data as T
}

/** Quita de la salida lo que parezca secreto antes de mostrarlo en el chat. */
export function tachar(texto: string): string {
  return texto
    .replace(/\b([A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASS|PAT)[A-Z0-9_]*)\s*=\s*\S+/g, '$1=••••')
    .replace(/\b(sk|pk|rk|ghp|gho|xox[bap]|eyJ)[-_A-Za-z0-9.]{16,}/g, '••••')
    .replace(/(Bearer\s+)[-_A-Za-z0-9.]{12,}/g, '$1••••')
}

// ── Registro de subagentes (lo que Levy lanzó) ──
/** `avisarA`: la conversación de Levy que lo lanzó (chat vivo): al terminar, el agent-server la despierta.
 *  `avisadoHasta` (ms) = última actividad ya avisada; `avisadoFin` = ya se avisó que su proceso murió. */
export interface SubagenteOrigen { owner: string; account: string; conversationId: string }
/** Pregunta abierta del subagente (5 oct 2026): la ve primero Levy; a Daniel solo sube si Levy no la atiende. */
export interface PreguntaAbierta { texto: string; tipo: 'dialogo' | 'pregunta'; firma: string; desde: number }
export interface Subagente { avisarA?: SubagenteOrigen; avisadoHasta?: number; avisadoFin?: string; fin?: string; id: number; nombre: string; harness: string; encargo: string; cwd: string; creado: string; modelo?: string; cerrado?: string; motor?: boolean; pid?: number; sesion?: string; tokens?: number | null; permisos?: Permisos; entrega?: 'entregado' | 'pendiente' | 'falló'; entregaNota?: string; espera?: string; aviso?: string
  /** Conversación del chat desde la que Levy lo lanzó (3 oct 2026); null = no se pudo saber. */
  origen?: string | null
  pregunta?: PreguntaAbierta
  /** ISO: la pregunta subió a Daniel (Levy no la atendió a tiempo o su conversación ya no existe). */
  escalado?: string
  escaladoPor?: string
  /** Se perdió del registro y se reconstruyó del diario de turnos (5 oct 2026). */
  rescatado?: string
  /** Cómo corre (6 oct 2026): 'pantalla' = CLI interactivo en una PTY del motor (camino viejo, sin el campo);
   *  'sin-pantalla' = proceso desacoplado con el CLI en modo sin pantalla (`./sin-pantalla.ts`). */
  modo?: 'pantalla' | 'sin-pantalla'
  /** Sin pantalla: número del turno en curso o el último, mensajes que esperan a que salga, ruta de su bitácora y
   *  la terminal del motor donde Daniel la abrió a mano (mientras viva, Levy no le escribe encima). */
  turno?: number
  cola?: string[]
  bitacora?: string
  interactivo?: number
  /** ISO: Levy detuvo el paso en curso (`detener`); el turno que cierre después no es una falla ni se avisa. */
  detenidoEn?: string
  /** Definición de Terminado extraída del encargo completo al delegar (27 oct 2026), para el juez separado. */
  dod?: string
  /** Veredicto del juez separado sobre su último turno terminado (juez.ts). */
  juicio?: Juicio }

/*
 * El registro es un JSON que escriben DOS procesos: el MCP de la Cabina (delegar, retomar, cerrar) y el
 * agent-server (vigía de avisos, vista «trabajos»). Hasta el 5 oct se escribía con writeFile (trunca y
 * luego escribe) y una lectura a medias devolvía `[]`: el siguiente `delegar` guardaba un registro de UNA
 * entrada y los subagentes vivos perdían a su dueño (100091…100100: «Esa terminal no la lanzó Levy»).
 * Ahora: escritura atómica (tmp + rename), copia de respaldo, candado entre procesos para leer-modificar-
 * escribir, una lectura ilegible NUNCA cuenta como vacía, y la poda jamás quita a un subagente abierto.
 */
export class RegistroIlegible extends Error {}
const PODA_CERRADOS = 50
export function podarRegistro(l: Subagente[]): Subagente[] {
  const cerrados = l.filter(s => s.cerrado)
  const quitar = new Set(cerrados.slice(0, Math.max(0, cerrados.length - PODA_CERRADOS)))
  return l.filter(s => !quitar.has(s))
}
async function leerArchivo(ruta: string): Promise<Subagente[] | null> {
  let texto: string
  try { texto = await readFile(ruta, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
  try { const l = JSON.parse(texto); return Array.isArray(l) ? l : null } catch { return null }
}
export async function leerRegistro(): Promise<Subagente[]> {
  for (let i = 0; i < 4; i++) {
    const l = await leerArchivo(registroPath()).catch(() => null)
    if (l) return l
    await dormir(40)
  }
  const respaldo = await leerArchivo(registroPath() + '.bak').catch(() => null)
  if (respaldo) return respaldo
  throw new RegistroIlegible(`El registro de subagentes no se puede leer (${registroPath().replace(homedir(), '~')}); no se toca hasta repararlo.`)
}
async function escribirAtomico(ruta: string, texto: string) {
  const tmp = `${ruta}.${process.pid}.${randomUUID().slice(0, 6)}.tmp`
  await writeFile(tmp, texto)
  await rename(tmp, ruta)
}
async function guardarRegistro(l: Subagente[]) {
  await mkdir(dirname(registroPath()), { recursive: true })
  const texto = JSON.stringify(podarRegistro(l), null, 2)
  await escribirAtomico(registroPath(), texto)
  await escribirAtomico(registroPath() + '.bak', texto).catch(() => {})
}
/** Candado entre procesos (mkdir es atómico). Uno abandonado por un proceso muerto caduca a los 10 s. */
async function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const lock = registroPath() + '.lock'
  await mkdir(dirname(lock), { recursive: true })
  const limite = Date.now() + 15_000
  for (;;) {
    try { await mkdir(lock); break } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const edad = await stat(lock).then(x => Date.now() - x.mtimeMs, () => 0)
      if (edad > 10_000) { await rmdir(lock).catch(() => {}); continue }
      if (Date.now() > limite) throw new Error('El registro de subagentes está ocupado por otro proceso; reintenta.')
      await dormir(25 + Math.random() * 50)
    }
  }
  try { return await fn() } finally { await rmdir(lock).catch(() => {}) }
}
/** Igual que `mutarRegistro`, con una `fn` asíncrona (lanzar un proceso sin soltar el candado). */
export async function mutarRegistroAsync(fn: (l: Subagente[]) => Promise<Subagente[] | null>): Promise<Subagente[]> {
  return conCandado(async () => {
    const l = await leerRegistro()
    const nuevo = await fn(l)
    if (nuevo) await guardarRegistro(nuevo)
    return nuevo ?? l
  })
}
/** Leer-modificar-escribir bajo candado. `fn` recibe el registro fresco; devolver null = no escribir. */
export async function mutarRegistro(fn: (l: Subagente[]) => Subagente[] | null): Promise<Subagente[]> {
  return conCandado(async () => {
    const l = await leerRegistro()
    const nuevo = fn(l)
    if (nuevo) await guardarRegistro(nuevo)
    return nuevo ?? l
  })
}
/** Cambia UNA entrada sin pisar lo que otro proceso (MCP stdio y agent-server) escribió entre medias. */
export async function anotar(id: number, pid: number | undefined, cambio: Partial<Subagente>) {
  await mutarRegistro(l => l.map(s => s.id === id && !s.cerrado && (pid == null || s.pid == null || s.pid === pid) ? { ...s, ...cambio } : s))
}

const PERMITIDOS = ['/tmp/', '/private/tmp/', join(homedir(), 'Developer') + '/']
export function cwdPermitido(cwd: string): boolean {
  const r = resolve(cwd) + '/'
  return PERMITIDOS.some(p => r.startsWith(p)) && !r.includes('/.ssh/') && !r.includes('/.gnupg/')
}
// Subagentes sueltos corren en Sonnet 5.5 (regla de la casa, fijada en settings).
const MODELO_DEFAULT: Record<string, string | null> = { claude: 'claude-sonnet-5-5', codex: null }
const MODELO_OK = /^[a-z0-9][a-z0-9.\-]{2,60}$/
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export type Permisos = 'bypass' | 'auto' | 'acceptEdits'
/** Por defecto bypassPermissions (Daniel, 1 oct 08:20). Override por entorno, nunca por el modelo. */
export function permisosDefault(): Permisos {
  const v = process.env.CABINA_PERMISOS
  if (v === 'auto' || v === 'acceptEdits') return v
  // Edición cliente (AUDITORIA I4): los subagentes nunca nacen en bypass, salvo que la persona lo configure.
  if (esEdicionCliente() && v !== 'bypass') return 'auto'
  return 'bypass'
}

/** Comando del subagente. En el motor el encargo viaja como prompt inicial (sin teclear
 *  a ciegas) y Claude nace con `--session-id`: el lector sabe su archivo desde el segundo 0. */
export function comando(h: Subagente['harness'], modelo: string | null, encargo?: string, sesion?: string, permisos: Permisos = permisosDefault()): string {
  const m = modelo ? ` --model ${modelo}` : ''
  const p = encargo ? ` ${sq(encargo)}` : ''
  if (h === 'claude') {
    // El diálogo «Bypass Permissions mode» se salta por settings; si aun así aparece, `entregar` lo acepta.
    const modo = permisos === 'bypass' ? ` --permission-mode bypassPermissions --settings ${sq('{"skipDangerousModePermissionPrompt":true}')}` : ` --permission-mode ${permisos}`
    return `claude${m}${modo}${sesion ? ` --session-id ${sesion}` : ''}${p}`
  }
  const modo = permisos === 'bypass' ? ' --dangerously-bypass-approvals-and-sandbox' : ' --sandbox workspace-write --ask-for-approval never'
  return `codex${m}${modo}${p}`
}

/** Diálogos de arranque que dejan al CLI sin caja de entrada (la causa de LISTA #10):
 *  confiar en la carpeta y aceptar el modo bypass. Devuelve las teclas que lo pasan. */
export function dialogoDeArranque(pantalla: string): { que: string; teclas: string } | null {
  if (/Bypass Permissions mode/i.test(pantalla) && /Yes,? I accept/i.test(pantalla)) return { que: 'aceptar el modo bypass', teclas: '\x1b[B\r' }
  if (/trust (the files in )?this folder|Do you trust|Yes, proceed|Yes, I trust/i.test(pantalla) && /(❯|›|>)\s*1\.?\s*Yes/i.test(pantalla)) return { que: 'confiar en la carpeta', teclas: '\r' }
  if (/Do you trust the contents of this directory|allow Codex to work in this folder/i.test(pantalla)) return { que: 'confiar en la carpeta', teclas: '\r' }
  return null
}

async function hayMotor(): Promise<boolean> {
  try { await motor.info(); return true } catch { return false }
}

/** Directorio de skills del proyecto. Con `cwd` fuera del repo el CLI no las descubre solo (LISTA #37). */
const repoRaiz = () => process.env.ARBRAIN_REPO || join(homedir(), 'Developer/artificial-brain')
export function preludioSkills(cwd: string): { texto: string; aviso: string } | null {
  const raiz = repoRaiz(), dir = join(raiz, '.claude/skills')
  const r = resolve(cwd) + '/'
  if (r.startsWith(raiz + '/') || !existsSync(dir)) return null
  return {
    texto: `\n\n[Contexto de Levy] Trabajas fuera del repo del proyecto, así que no ves sus skills. Viven en ${dir}/<nombre>/SKILL.md: si el encargo toca un dominio suyo, lee ahí la que corresponda antes de actuar.`,
    aviso: `cwd fuera del repo: el encargo lleva el directorio de skills (${dir.replace(homedir(), '~')})`,
  }
}

const fechaMx = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const deHoy = (s: Subagente) => fechaMx(new Date(s.creado)) === fechaMx(new Date())

export interface Topes { paralelo: { vivos: number; max: number }; tokens: { hoy: number; max: number; sinMedir: number } }
export function calcularTopes(registro: Subagente[], vivos: Set<number>): Topes {
  const hoyL = registro.filter(deHoy)
  return {
    paralelo: { vivos: registro.filter(s => !s.cerrado && vivos.has(s.id)).length, max: TOPES.paralelo() },
    tokens: { hoy: hoyL.reduce((a, s) => a + (s.tokens ?? 0), 0), max: TOPES.tokensDia(), sinMedir: hoyL.filter(s => s.tokens == null).length },
  }
}

export async function delegar(p: { nombre: string; harness: Subagente['harness']; encargo: string; cwd: string; modelo?: string; avisarA?: SubagenteOrigen }): Promise<Subagente> {
  // Desde el 6 oct el camino es sin pantalla; CABINA_DELEGAR_MODO=pantalla vuelve a este (RESPALDO: se retira en
  // otro commit cuando el nuevo lleve días sin tropiezos).
  // Red team A1: en la edición cliente no se lanzan subagentes (ni por la Cabina ni por otra vía).
  if (esEdicionCliente()) throw new Error('Los subagentes no están disponibles en esta edición de Arbrain.')
  const sp = await import('./sin-pantalla.js')
  if (sp.modoDelegar() === 'sin-pantalla') return sp.delegarSinPantalla(p)
  if (!(HARNESS_PERMITIDOS as readonly string[]).includes(p.harness)) throw new Error(`Harness no permitido para lanzar desde el chat (solo ${HARNESS_PERMITIDOS.join(', ')}).`)
  if (!cwdPermitido(p.cwd)) throw new Error('Directorio no permitido para un subagente (solo /tmp o ~/Developer).')
  const modelo = p.modelo ?? MODELO_DEFAULT[p.harness]
  if (modelo && !MODELO_OK.test(modelo)) throw new Error('Modelo inválido.')
  const registro = await leerRegistro()
  if (!(await hayMotor())) {
    // Bancos de prueba: jamás caer al SFTerm real de Daniel si el motor aislado no está.
    if (process.env.CABINA_SIN_RESPALDO_GATE === '1') throw new Error('El motor de Arbrain no responde y este entorno no permite el respaldo por SFTerm.')
    await mkdir(p.cwd, { recursive: true }); return delegarPorGate(p, modelo, registro)
  }
  const { terms } = await motor.info()
  const topes = calcularTopes(registro, new Set(terms.map(t => t.id)))
  if (topes.paralelo.vivos >= topes.paralelo.max) throw new Error(`Tope de subagentes en paralelo alcanzado (${topes.paralelo.vivos}/${topes.paralelo.max}). Cierra uno antes de lanzar otro.`)
  if (topes.tokens.hoy >= topes.tokens.max) throw new Error(`Tope de tokens del día alcanzado (${topes.tokens.hoy.toLocaleString('es-MX')}/${topes.tokens.max.toLocaleString('es-MX')}).`)
  // la carpeta nace solo si el lanzamiento pasa los topes: un rechazo no deja nada
  await mkdir(p.cwd, { recursive: true })
  const sesion = p.harness === 'claude' ? randomUUID() : undefined
  const permisos = permisosDefault()
  const skills = preludioSkills(p.cwd)
  const { id, pid } = await motor.spawn({ cwd: p.cwd, command: comando(p.harness, modelo, p.encargo + (skills?.texto ?? '') + notaAutoria(p.nombre), sesion, permisos) })
  // Registro ANTES de entregar: si la entrega tropieza, retomar y cerrar siguen siendo de Levy (#11).
  const sub: Subagente = { id, nombre: p.nombre.slice(0, 80), harness: p.harness, encargo: p.encargo.slice(0, 2000), cwd: p.cwd, creado: new Date().toISOString(), motor: true, pid, permisos, entrega: 'pendiente', ...(skills ? { aviso: skills.aviso } : {}), ...(sesion ? { sesion } : {}), ...(modelo ? { modelo } : {}), ...(p.avisarA ? { avisarA: p.avisarA } : {}) }
  await mutarRegistro(l => [...l, sub])
  olvidarFoto()
  return terminarEntrega(sub, entregarPorMotor({ ...sub, encargo: p.encargo + (skills?.texto ?? '') + notaAutoria(p.nombre) }))
}

async function delegarPorGate(p: { nombre: string; harness: Subagente['harness']; encargo: string; cwd: string }, modelo: string | null, registro: Subagente[]): Promise<Subagente> {
  const permisos = permisosDefault()
  const { id } = await gate<{ id: number }>('spawn', { cwd: p.cwd, command: comando(p.harness, modelo, undefined, undefined, permisos), show: false })
  const skills = preludioSkills(p.cwd)
  const sub: Subagente = { id, nombre: p.nombre.slice(0, 80), harness: p.harness, encargo: p.encargo.slice(0, 2000), cwd: p.cwd, creado: new Date().toISOString(), permisos, entrega: 'pendiente', ...(skills ? { aviso: skills.aviso } : {}), ...(modelo ? { modelo } : {}) }
  await mutarRegistro(l => [...l, sub])
  olvidarFoto()
  return terminarEntrega(sub, entregarPorGate({ ...sub, encargo: p.encargo + (skills?.texto ?? '') + notaAutoria(p.nombre) }))
}

/** Espera la entrega hasta `ESPERA_ENTREGA_MS`; si tarda más, sigue sola en segundo plano
 *  y la herramienta lo dice (el registro ya es de Levy, así que retomar funciona igual). */
const ESPERA_ENTREGA_MS = () => Number(process.env.CABINA_ESPERA_ENTREGA_MS) || 45_000
async function terminarEntrega(sub: Subagente, entrega: Promise<Entrega>): Promise<Subagente> {
  const cambio = (r: Entrega): Partial<Subagente> => ({ entrega: r.ok ? 'entregado' : 'falló', entregaNota: r.nota, ...(r.espera ? { espera: r.espera } : {}) })
  const fin = entrega.then(async r => { await anotar(sub.id, sub.pid, cambio(r)).catch(() => {}); return r })
  const r = await Promise.race([fin, dormir(ESPERA_ENTREGA_MS()).then(() => null)])
  return r ? { ...sub, ...cambio(r) } : { ...sub, entrega: 'pendiente', entregaNota: 'el CLI sigue arrancando; la entrega se reintenta sola' }
}

export interface Entrega { ok: boolean; nota: string; espera?: string; confirmo?: boolean }

/** La última pregunta con la que el agente cerró su turno, si está quieto en su caja de entrada.
 *  Claude marca sus respuestas con «⏺», Codex con «•»: se toma el último bloque y su última pregunta. */
export function preguntaPendiente(harness: string, pantalla: string): string | null {
  if (!enSuPrompt(harness, pantalla)) return null
  const l = pantalla.split('\n').map(x => x.replace(/\s+$/, ''))
  const i = l.map(x => /^\s*(⏺|●|•)\s+\S/.test(x)).lastIndexOf(true)
  if (i < 0) return null
  const bloque: string[] = []
  for (const x of l.slice(i)) { if (/^[─━═\s]*$/.test(x) && bloque.length) break; if (/^\s*(❯|›|>)\s*$/.test(x) || /\? for shortcuts|bypass permissions|accept edits/i.test(x)) break; bloque.push(x.replace(/^\s*(⏺|●|•)\s+/, '').trim()) }
  const texto = bloque.join(' ').replace(/\s+/g, ' ').trim()
  if (!/[?？]\s*$/.test(texto)) return null
  return texto
}

/**
 * Diálogo que deja al agente detenido esperando una elección (5 oct 2026): AskUserQuestion, el permiso de una
 * herramienta («Do you want to proceed?») o la aprobación de Codex. No es su caja de entrada: ahí el agente
 * no avanza hasta que alguien elige. Devuelve la pregunta y sus opciones numeradas.
 */
export function dialogoAbierto(pantalla: string): { pregunta: string; opciones: string[] } | null {
  const l = pantalla.split('\n').map(x => x.replace(/^[\s│┃|]+/, '').replace(/[\s│┃|]+$/, ''))
  const opcion = /^(?:[❯›>▶]\s*)?(\d)[.)]\s+(.+)$/
  const i = l.findIndex(x => /^[❯›>▶]\s*\d[.)]\s+\S/.test(x))
  if (i < 0) return null
  // la lista empieza en la opción 1, aunque el cursor esté en otra
  let ini = i
  while (ini > 0 && opcion.test(l[ini - 1]) || ini > 0 && !l[ini - 1].trim() && ini - 2 >= 0 && opcion.test(l[ini - 2])) ini--
  const opciones: string[] = []
  for (const x of l.slice(ini)) {
    const m = opcion.exec(x)
    if (m) { opciones.push(m[2].replace(/\s+\([a-z]\)$/i, '').trim()); continue }
    if (/esc to cancel|to navigate|enter to (select|confirm)|esc\)/i.test(x)) break
    if (/^[╰─━═]{3,}/.test(x) || opciones.length >= 8) break
  }
  if (opciones.length < 2) return null
  const antes = l.slice(Math.max(0, ini - 12), ini).map(x => x.trim()).filter(x => x && !/^[─━═╭╮╰╯\s]+$/.test(x))
  const pregunta = [...antes].reverse().find(x => /[?？]$/.test(x))
  const pie = l.slice(ini).some(x => /esc to cancel|to navigate|enter to (select|confirm)/i.test(x))
  if (!pregunta && !pie) return null
  return { pregunta: (pregunta ?? antes[antes.length - 1] ?? 'Elige una opción').slice(0, 400), opciones: opciones.slice(0, 8).map(o => o.slice(0, 160)) }
}

/** ¿Es solo pedir luz verde para empezar el encargo (y no una duda de fondo)? */
export function esConfirmacion(pregunta: string): boolean {
  const ultima = (pregunta.match(/[^.!?¿？]*[¿]?[^.!?？]*[?？]\s*$/)?.[0] ?? pregunta).trim()
  const pide = /\b(arranco|arrancar|arranque|empiezo|empezar|empiece|comienzo|comenzar|comience|procedo|proceder|proceda|inicio|iniciar|inicie|sigo|continúo|continuar|lo hago|lo ejecuto|adelante|le doy|doy luz verde|me pongo)\b|go ahead|\b(proceed|start|begin|kick off)\b|\bready (to|for)\b/i
  const eligeEntre = /\b(o bien|cuál|cuáles|which|either|opción|option|A\)|B\))/i
  return pide.test(ultima) && !eligeEntre.test(ultima) && ultima.length < 220
}

export const CONFIRMACION_DE_LEVY = `Sí, arranca. El encargo es de Levy y ya está autorizado: no necesitas confirmación de ${DUENO}. Si algo concreto te bloquea, dilo en una línea.`

/** Operaciones mínimas para entregar el encargo, iguales para el motor y el gate. */
export interface Puerto { pantalla(): Promise<string>; escribir(datos: string): Promise<void>; llego(): Promise<boolean> }

/**
 * Entrega con espera y reintento. El encargo puede ya ir en argv (motor): entonces solo se
 * pasan los diálogos de arranque y se confirma que llegó; si el CLI quedó en su caja sin
 * el encargo, se pega entre corchetes + Enter, hasta 3 veces.
 */
export async function entregar(sub: Pick<Subagente, 'harness' | 'encargo'>, puerto: Puerto, o: { enArgv: boolean; plazoMs?: number; pausaMs?: number; vigilaMs?: number }): Promise<Entrega> {
  const plazo = Date.now() + (o.plazoMs ?? 180_000), pausa = o.pausaMs ?? 1000
  let dialogos = 0, intentos = 0, enCaja = 0
  while (Date.now() < plazo) {
    if (await puerto.llego().catch(() => false)) {
      const nota = intentos ? `entregado al intento ${intentos}` : 'entregado'
      return { ok: true, nota, ...(await vigilarPregunta(sub, puerto, { pausa, vigilaMs: o.vigilaMs ?? VIGILA_MS() })) }
    }
    const pantalla = await puerto.pantalla().catch(() => '')
    const d = dialogoDeArranque(pantalla)
    if (d && dialogos < 4) { dialogos++; await puerto.escribir(d.teclas); await dormir(pausa * 1.5); continue }
    if (enSuPrompt(sub.harness, pantalla)) {
      // con el encargo en argv, el CLI puede tardar en procesarlo: se le dan unos latidos
      enCaja++
      if ((!o.enArgv || enCaja >= 6) && intentos < 3) {
        intentos++
        await puerto.escribir(`\x1b[200~${sub.encargo.slice(0, 4000)}\x1b[201~`)
        await dormir(300)
        await puerto.escribir('\r')
        await dormir(pausa * 3)
        continue
      }
    } else enCaja = 0
    await dormir(pausa)
  }
  return { ok: false, nota: intentos ? `el CLI no confirmó el encargo tras ${intentos} intentos; usa retomar` : 'el CLI no llegó a su caja de entrada; usa retomar cuando esté listo' }
}

const VIGILA_MS = () => Number(process.env.CABINA_VIGILA_MS) || 90_000

/**
 * Tras entregar, el subagente a veces desconfía del encargo pegado y se queda en «¿Arranco?».
 * El encargo ya es de Levy: se confirma UNA vez en su nombre. Cualquier otra pregunta queda
 * como `espera` en el registro: la atiende Levy con retomar, no Daniel.
 */
async function vigilarPregunta(sub: Pick<Subagente, 'harness'>, puerto: Puerto, o: { pausa: number; vigilaMs: number }): Promise<{ espera?: string; confirmo?: boolean }> {
  const plazo = Date.now() + o.vigilaMs
  let confirmo = false, quietas = 0, ultima = ''
  while (Date.now() < plazo) {
    await dormir(o.pausa)
    const pantalla = await puerto.pantalla().catch(() => '')
    const q = preguntaPendiente(sub.harness, pantalla)
    // quieto en su caja y sin pregunta: terminó (o aún no empieza) y no hay nada que confirmar
    if (!q) { quietas = enSuPrompt(sub.harness, pantalla) ? quietas + 1 : 0; if (quietas >= 4) break; continue }
    quietas = 0
    if (q === ultima) continue
    if (!confirmo && esConfirmacion(q)) {
      confirmo = true; ultima = q
      await puerto.escribir(`\x1b[200~${CONFIRMACION_DE_LEVY}\x1b[201~`); await dormir(300); await puerto.escribir('\r')
      await dormir(o.pausa * 3)
      continue
    }
    return { espera: q.slice(0, 600), ...(confirmo ? { confirmo } : {}) }
  }
  return confirmo ? { confirmo } : {}
}

function entregarPorMotor(sub: Subagente): Promise<Entrega> {
  return entregar(sub, {
    pantalla: () => motor.screen(sub.id, 40),
    escribir: d => motor.write(sub.id, d),
    llego: async () => {
      const t = (await motor.info()).terms.find(x => x.id === sub.id)
      if (!t) throw new Error('la terminal ya no existe')
      if (!t.fg) return false
      const c = await leer(t.fg).catch(() => null)
      if (c?.parsed.msgs.some(m => m.role === 'user' && !m.sys)) return true
      // sin lector (aún no hay archivo): el TUI trabajando también confirma
      return estadoDe(t.fg.name, await motor.screen(sub.id, 20).catch(() => '')) === 'trabajando'
    },
  }, { enArgv: true })
}

function entregarPorGate(sub: Subagente): Promise<Entrega> {
  let enviado = false
  const leerGate = async () => { const r = await gate<string | { text?: string }>('read', { id: sub.id, lines: 40 }); return typeof r === 'string' ? r : r?.text ?? '' }
  return entregar(sub, {
    pantalla: leerGate,
    // el gate entrega con su propio `ready`: espera la caja y manda Enter
    escribir: async d => {
      if (d.startsWith('\x1b[200~')) { await gate('send', { id: sub.id, text: sub.encargo, ready: true }, 90_000); enviado = true }
      else if (d !== '\r') await gate('send', { id: sub.id, text: d, submit: false }, 15_000).catch(() => {})
    },
    // el gate no expone el archivo de la conversación: un `send {ready}` aceptado cuenta como entrega
    llego: async () => enviado,
  }, { enArgv: false })
}

async function propio(id: number): Promise<Subagente> {
  const vivos = await motor.info().then(r => r.terms, () => null)
  const pidDe = (i: number) => vivos?.find(t => t.id === i)?.pid
  // id + pid: un motor nuevo (no relevado) reusa ids desde 100000
  const sub = [...(await leerRegistro())].reverse().find(s => s.id === id && !s.cerrado && (!s.motor || !vivos || s.pid === pidDe(id)))
  if (!sub) throw new Error('Esa terminal no la lanzó Levy: se puede leer, no operar desde el chat.')
  return sub
}

/** ¿El TUI está en su caja de entrada, listo para recibir texto? (reglas de SFTerm `harness.ts`) */
export function enSuPrompt(harness: string, pantalla: string): boolean {
  const l = pantalla.split('\n').map(x => x.trim())
  if (/esc to interrupt|esc para interrumpir|Working \(/i.test(pantalla)) return false
  // El pie cambia con el modo: «? for shortcuts», «accept edits on» o, en bypass (default de delegar desde el
  // 1 oct), «⏵⏵ bypass permissions on». Sin el último, retomar nunca veía la caja de un subagente en bypass.
  if (harness === 'claude') return l.some(x => x === '❯' || x === '>' || /^❯\s/.test(x) && l.some(y => /\? for shortcuts|accept edits|bypass permissions|shift\+tab to cycle/i.test(y)))
  if (harness === 'codex') return l.some(x => x.startsWith('›'))
  return false
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Lo que retomar necesita del subagente, igual para el motor y para las pruebas. */
export interface PuertoSeguimiento {
  estado(): Promise<{ enCaja: boolean; trabajando: boolean }>
  pantalla(): Promise<string>
  escribir(datos: string): Promise<void>
  /** ¿El mensaje ya consta en la conversación del agente? */
  consta(texto: string): Promise<boolean>
  /** Diálogo abierto (AskUserQuestion, permiso), si lo hay. */
  dialogo?(): Promise<{ pregunta: string; opciones: string[] } | null>
}
/** `eligio`: la opción que se marcó en un diálogo abierto. */
export interface Seguimiento { encolado: boolean; confirmado: boolean; eligio?: number; /** Sin pantalla: entró al turno en curso por la entrada en vivo. */ enVivo?: boolean }

const huella = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 40)

/**
 * Mensaje de seguimiento. En su caja de entrada: se entrega. Trabajando: se ENCOLA, como hace
 * el CLI cuando escribes mientras piensa (el Enter lo toma al terminar el paso), y se confirma
 * que quedó en la cola. Otro estado (un diálogo, por ejemplo): se espera, nunca Enter a ciegas.
 */
export async function enviarSeguimiento(texto: string, p: PuertoSeguimiento, o: { esperaMs?: number; confirmaMs?: number; pausaMs?: number } = {}): Promise<Seguimiento> {
  const pausa = o.pausaMs ?? 1000, t0 = Date.now()
  let encolado = false
  // Detenido en un diálogo (5 oct 2026): «2» elige la opción 2 (el cursor nace en la 1); cualquier otro texto
  // cierra el diálogo con Esc (el agente lo toma como «no elegí») y va como mensaje normal.
  const d = await p.dialogo?.().catch(() => null)
  if (d) {
    const n = Number(/^\s*(\d)\s*$/.exec(texto)?.[1] ?? 0)
    if (n >= 1 && n <= d.opciones.length) {
      if (n > 1) { await p.escribir('\x1b[B'.repeat(n - 1)); await dormir(150) }
      await p.escribir('\r')
      const fin = Date.now() + (o.confirmaMs ?? 8000)
      while (Date.now() < fin) {
        await dormir(Math.min(pausa, 500))
        const ahora = await p.dialogo!().catch(() => d)
        if (!ahora || ahora.pregunta !== d.pregunta) return { encolado: false, confirmado: true, eligio: n }
      }
      return { encolado: false, confirmado: false, eligio: n }
    }
    await p.escribir('\x1b')
    await dormir(pausa)
  }
  for (;;) {
    const e = await p.estado()
    if (e.enCaja && !e.trabajando) break
    if (e.trabajando) { encolado = true; break }
    if (Date.now() - t0 > (o.esperaMs ?? 60_000)) throw new Error('El subagente no está en su caja de entrada ni trabajando (¿un diálogo abierto?); míralo con mostrar trabajos.')
    await dormir(pausa)
  }
  // pegado entre corchetes: el texto multilínea llega como UN mensaje, luego Enter
  await p.escribir(`\x1b[200~${texto.slice(0, 4000)}\x1b[201~`)
  await dormir(300)
  await p.escribir('\r')
  // confirmar: consta en la conversación o se ve en pantalla (la cola del TUI)
  const h = huella(texto), fin = Date.now() + (o.confirmaMs ?? 8000)
  while (Date.now() < fin) {
    await dormir(Math.min(pausa, 500))
    if (await p.consta(texto).catch(() => false)) return { encolado, confirmado: true }
    if (h && (await p.pantalla().catch(() => '')).replace(/\s+/g, ' ').includes(h)) return { encolado, confirmado: true }
  }
  return { encolado, confirmado: false }
}

export async function retomar(id: number, texto: string): Promise<Seguimiento> {
  const sub = await propio(id)
  if (sub.modo === 'sin-pantalla') return (await import('./sin-pantalla.js')).retomarSinPantalla(id, texto)
  if (!sub.motor) { await gate('send', { id, text: texto.slice(0, 4000), ready: true }, 60_000); return { encolado: false, confirmado: true } }
  const termino = async () => {
    const t = (await motor.info()).terms.find(x => x.id === id)
    if (!t) throw new Error('El subagente ya no existe en el motor.')
    return t
  }
  return enviarSeguimiento(texto, {
    estado: async () => {
      const t = await termino()
      const pantalla = await motor.screen(id, 40)
      const conv = t.fg ? await leer(t.fg).catch(() => null) : null
      const trabajando = conv?.parsed.turn?.state === 'working' || estadoDe(t.fg?.name ?? '', pantalla) === 'trabajando'
      return { enCaja: enSuPrompt(sub.harness, pantalla), trabajando }
    },
    pantalla: () => motor.screen(id, 40),
    escribir: d => motor.write(id, d),
    dialogo: async () => dialogoAbierto(await motor.screen(id, 40)),
    consta: async t => {
      const fg = (await termino()).fg
      const conv = fg ? await leer(fg).catch(() => null) : null
      return !!conv?.parsed.msgs.some(m => m.role === 'user' && !m.sys && m.text.replace(/\s+/g, ' ').includes(huella(t)))
    },
  })
}

export async function cerrar(id: number): Promise<void> {
  const sub = await propio(id)
  let tokens: number | null | undefined = sub.tokens
  if (sub.modo === 'sin-pantalla') tokens = await (await import('./sin-pantalla.js')).detenerSinPantalla(sub)
  else if (sub.motor) {
    try { const t = (await motor.info()).terms.find(x => x.id === id); if (t?.fg) tokens = (await leer(t.fg))?.tokens ?? tokens } catch { /* se cierra igual */ }
    await motor.kill(id)
  } else await gate('close', { id })
  await mutarRegistro(l => l.map(s => s.id === id && !s.cerrado ? { ...s, cerrado: new Date().toISOString(), tokens: tokens ?? null } : s))
  olvidarFoto()
  // Su worktree no sobrevive al subagente (disco lleno 3 oct 2026: ~60 copias que nadie quitaba).
  // wt.sh solo lo quita si está limpio y ya en main; si no, el janitor lo rescata a las 72 h.
  const wt = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/worktrees/wt.sh')
  execFile('/bin/bash', [wt, 'cerrar', sub.cwd, '--si-limpio'], { timeout: 120_000 }, () => { /* mejor esfuerzo */ })
}

// ── Lectura para la vista «trabajos» ──
const RUIDO = /^\s*(⎿\s*)?Tip:|accept edits|bypass permissions|shift\+tab|│|^\s*[>❯›]\s*$|\d+% de \d|esc to interrupt/i
/** Lo que el dueño necesita en vez de la pantalla cruda: qué hace ahora (el
 *  spinner) y la última acción que reportó el agente (Claude «⏺ …», Codex «• …»). */
export function leerPantalla(pantalla: string): { actividad: string | null; ultimaAccion: string | null } {
  const l = pantalla.split('\n').map(x => x.trim()).filter(Boolean)
  const spinner = [...l].reverse().find(x => /\S…\s*\(\d+s\b|Working \(/i.test(x))
  const accion = [...l].reverse().find(x => /^(⏺|●|•)\s+\S/.test(x) && !/Working \(/.test(x))
  const limpia = (x: string) => tachar(x.replace(/^(⏺|●|•|[✱✻✢✳*·])\s+/, '').replace(/\s*\(.*?(esc|tokens).*\)\s*$/i, '')).slice(0, 200)
  return { actividad: spinner ? limpia(spinner) : null, ultimaAccion: accion ? limpia(accion) : null }
}

type Estado = 'trabajando' | 'esperando' | 'terminal'
/** Lo que el TUI deja ver: Claude y Codex muestran «esc to interrupt» mientras piensan. */
export function estadoDe(proc: string, pantalla: string): Estado {
  if (!/claude|codex|node|pi|opencode|qwen|gemini|crush/i.test(proc)) return 'terminal'
  // Ojo: Claude inactivo deja «✻ Brewed for 6s · done»; ese glifo no es actividad.
  return /esc to interrupt|esc para interrumpir|Working \(|• Working|\S…\s*\(\d+s\b/i.test(pantalla.split('\n').slice(-14).join('\n')) ? 'trabajando' : 'esperando'
}

export interface Mensaje { rol: 'user' | 'assistant'; texto: string; herramientas: string[] }
/** `ctxVentana` (2 oct 2026): la ventana con la que se calculó `ctxPct`, la misma regla que la barra de estado de SFTerm («15 % de 1M»). */
export interface Conversacion { harness: Harness; modelo: string | null; /** Esfuerzo que registra el transcript del CLI (2 oct 2026); null si no lo dice. */ esfuerzo: string | null; ctxPct: number | null; ctxVentana: number | null; turno: 'trabajando' | 'terminado' | null; pregunta: boolean; tokens: number | null; mensajes: Mensaje[]; titulo: string | null; error?: string }
interface TermGate { id: number; title: string; cwd: string; proc: string; visible: boolean; focused: boolean }
export interface Terminal { id: number; titulo: string; cwd: string; proc: string; estado: Estado; actividad: string | null; ultimaAccion: string | null; ultimas: string[]; pid?: number; origen?: 'motor' | 'sfterm-ptyd' | 'sin-pantalla'; soloLectura?: boolean; conversacion?: Conversacion; subagente?: Omit<Subagente, 'encargo'> & { encargo: string }
  /** Columna del tablero con su latido medido (tablero.ts); hoy solo los subagentes sin pantalla. */
  tablero?: EstadoTablero }
export interface Servidor { puerto: number; proceso: string; nombre: string }
/** `nombre`/`area` en palabras de dueño; con falla, `explicacion` en español llano, `menor` si su app sí corre y `detalle` = la última línea de su log. */
export interface Servicio { label: string; pid: number | null; estado: 'corriendo' | 'programado' | 'falló'; codigo: number | null; nombre?: string; area?: AreaServicio; explicacion?: string; menor?: boolean; detalle?: string }
export interface MotorResumen { pid: number; relevos: number; propias: number; adoptadas: number; sfterm: 'enlazado' | 'desconectado' | 'sin adopción'; soloLectura: boolean; desde: string }

const PUERTOS: Record<number, string> = {
  3099: 'agent-server (chat de Levy y crons)', 3300: 'Arbrain web', 3218: 'Arbrain escritorio', 3301: 'Arbrain (prueba)', 3199: 'agent-server (prueba)',
  8000: 'Mission Control · API (Supabase)', 54390: 'Mission Control · SQL', 54322: 'Postgres', 5432: 'Postgres',
}

export async function servidores(): Promise<Servidor[]> {
  let out = ''
  try { out = (await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 8000, maxBuffer: 2_000_000 })).stdout } catch (e) { out = (e as { stdout?: string }).stdout ?? '' }
  const vistos = new Map<number, Servidor>()
  for (const l of out.split('\n').slice(1)) {
    const c = l.trim().split(/\s+/); if (c.length < 9) continue
    const m = /:(\d+)$/.exec(c[8]); if (!m) continue
    const puerto = Number(m[1]); if (vistos.has(puerto) || puerto >= 49152 && !PUERTOS[puerto]) continue
    vistos.set(puerto, { puerto, proceso: c[0].replace(/\\x20/g, ' '), nombre: PUERTOS[puerto] ?? '' })
  }
  return [...vistos.values()].sort((a, b) => Number(!!b.nombre) - Number(!!a.nombre) || a.puerto - b.puerto).slice(0, 24)
}

export async function servicios(): Promise<Servicio[]> {
  let out = ''
  try { out = (await run('launchctl', ['list'], { timeout: 8000 })).stdout } catch { return [] }
  const filas = out.split('\n').slice(1).map(l => l.split('\t')).filter(c => c.length === 3)
  const apps = filas.filter(c => c[0] !== '-' && /^application\./.test(c[2]))
  const lista = filas.filter(c => ES_DEL_NEGOCIO.test(c[2])).map(([pid, st, label]): Servicio => {
    const p = pid === '-' ? null : Number(pid), codigo = st === '-' ? null : Number(st)
    // Sin PID y salida 0 = LaunchAgent por intervalo esperando su hora, no «detenido».
    return { label, pid: p, codigo, estado: p ? 'corriendo' : codigo && codigo !== 0 ? 'falló' : 'programado', ...ficha(label) }
  })
  await Promise.all(lista.filter(x => x.estado === 'falló').map(async x => {
    const plist = await leerPlist(join(homedir(), 'Library/LaunchAgents', `${x.label}.plist`))
    const args = plist?.ProgramArguments ?? [], abreApp = args[0] === '/usr/bin/open'
    const app = abreApp ? args.find(a => /\.app\/?$/.test(a)) : undefined
    const bundle = app ? (await leerPlist(join(app, 'Contents/Info.plist')))?.CFBundleIdentifier : undefined
    const hermana = apps.find(c => c[2].startsWith(`application.${x.label}.`) || (bundle && c[2].startsWith(`application.${bundle}.`)))
    const ultimaLinea = plist?.StandardErrorPath ? await ultimaLineaDe(plist.StandardErrorPath) : null
    Object.assign(x, explicar(x.label, x.codigo, { hermana: hermana ? Number(hermana[0]) : null, ultimaLinea, abreApp }), ultimaLinea ? { detalle: ultimaLinea } : {})
  }))
  return lista.sort((a, b) => a.label.localeCompare(b.label))
}

async function leerPlist(ruta: string): Promise<{ ProgramArguments?: string[]; StandardErrorPath?: string; CFBundleIdentifier?: string } | null> {
  try { return JSON.parse((await run('plutil', ['-convert', 'json', '-o', '-', ruta], { timeout: 4000 })).stdout) } catch { return null }
}
/** La última línea con texto de un log (lee solo la cola), sin secretos y a lo más 220 caracteres. */
async function ultimaLineaDe(ruta: string): Promise<string | null> {
  try {
    const { stdout } = await run('tail', ['-n', '20', ruta], { timeout: 3000 })
    const l = stdout.split('\n').map(x => x.trim()).filter(Boolean).at(-1)
    return l ? tachar(l).replace(homedir(), '~').slice(0, 220) : null
  } catch { return null }
}

const limpiarLineas = (texto: string, n: number) => tachar(texto).split('\n').map(x => x.replace(/\s+$/, '')).filter(x => x.trim() && !/^[─━═\-\s│╭╮╰╯]+$/.test(x) && !RUIDO.test(x)).slice(-n)

/** «Usó:» en palabras del dueño: el nombre de la herramienta, y solo el archivo cuando
 *  es de archivos. Los comandos crudos (Bash, MCP) quedan en «Detalles técnicos». */
export function herramientaLegible(nombre: string, resumen?: string): string {
  const n = nombre.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ')
  const archivo = /^(Write|Edit|MultiEdit|Read|NotebookEdit)$/.test(nombre) && resumen ? ` ${resumen.split('/').slice(-2).join('/')}` : ''
  const ES: Record<string, string> = { Write: 'escribió', Edit: 'editó', MultiEdit: 'editó', Read: 'leyó', Bash: 'corrió un comando', Grep: 'buscó', Glob: 'buscó archivos', WebFetch: 'leyó una página', WebSearch: 'buscó en la web', Task: 'lanzó un agente', Agent: 'lanzó un agente', TodoWrite: 'anotó pendientes' }
  return tachar(`${ES[nombre] ?? n}${archivo}`).slice(0, 80)
}

/** Solo Claude: su ventana sale de la misma tabla con la que se calculó el %. Otro harness calcula el % a su
 *  manera (Codex trae su propia ventana), así que ahí se dice el % sin inventar el denominador. */
export const ventanaDe = (modelo: string | undefined, ctxPct: number | undefined) =>
  ctxPct != null && modelo && /^claude-/i.test(modelo) ? ctxWindowFor(modelo) : null

export function resumirConversacion(harness: Harness, c: Awaited<ReturnType<typeof leer>>): Conversacion | undefined {
  if (!c) return undefined
  const p = c.parsed
  const mensajes: Mensaje[] = p.msgs.filter(m => !m.sys).slice(-4).map(m => {
    const partes = m.parts ?? [{ type: 'text' as const, text: m.text }]
    const texto = partes.flatMap(x => x.type === 'text' ? [x.text] : []).join('\n').trim() || m.text
    const herramientas = [...new Set(partes.flatMap(x => x.type === 'tool' ? [herramientaLegible(x.name, x.summary)] : []))].slice(-3)
    return { rol: m.role, texto: tachar(texto).slice(0, 700), herramientas }
  })
  return {
    harness, modelo: p.model ?? null, esfuerzo: p.effort ?? null, ctxPct: p.ctxPct ?? null, ctxVentana: ventanaDe(p.model, p.ctxPct),
    turno: p.turn ? (p.turn.state === 'working' ? 'trabajando' : 'terminado') : null,
    pregunta: !!p.turn?.endsAsk, tokens: c.tokens, mensajes, titulo: p.title ?? null, ...(p.error ? { error: p.error } : {}),
  }
}

async function terminalDelMotor(t: TermDetail, lineas: number, registro: Subagente[]): Promise<Terminal> {
  let pantalla = ''
  try { pantalla = await motor.screen(t.id, 40) } catch { /* recién nacida */ }
  const proc = t.fg?.name ?? 'zsh'
  const harness = harnessDe(proc)
  const leido = harness && t.fg ? await leer(t.fg).catch(() => null) : null
  const conversacion = harness ? resumirConversacion(harness, leido) : undefined
  const sub = registro.find(s => s.id === t.id && !s.cerrado && (s.pid == null || s.pid === t.pid))
  let estado = estadoDe(proc, pantalla)
  if (conversacion?.turno) estado = conversacion.turno === 'trabajando' ? 'trabajando' : 'esperando'
  const carpeta = t.cwd.split('/').pop() || 'terminal'
  const titulo = sub?.nombre ?? conversacion?.titulo ?? (harness ? `${harness} · ${carpeta}` : carpeta)
  return {
    id: t.id, pid: t.pid, titulo: tachar(titulo), cwd: t.cwd.replace(homedir(), '~'), proc, estado, origen: t.origin, soloLectura: t.readonly,
    ...leerPantalla(pantalla), ultimas: limpiarLineas(pantalla, lineas), ...(conversacion ? { conversacion } : {}), ...(sub ? { subagente: sub } : {}),
  }
}

const subRefs = (l: Subagente[]) => l.map(x => ({ id: x.id, nombre: x.nombre, cwd: x.cwd, sesion: x.sesion, cerrado: x.cerrado, pid: x.pid, origen: x.origen }))
const termRefs = (l: Terminal[]) => l.map(t => ({ id: t.id, pid: t.pid, titulo: t.titulo, cwd: t.cwd, ...(t.subagente ? { subagente: { nombre: t.subagente.nombre, origen: t.subagente.origen } } : {}) }))

/** «Apagar» del Taller (5 oct 2026): solo un huérfano verificable, re-verificado en el momento con la foto fresca. */
export async function apagarHuerfano(firma: string) {
  const [registro, t] = await Promise.all([leerRegistro().catch(() => [] as Subagente[]), motor.info().then(r => r.terms.map(x => ({ id: x.id, pid: x.pid, titulo: x.cwd.split('/').pop() || 'terminal', cwd: x.cwd.replace(homedir(), '~') }))).catch(() => [])])
  const conAgente = t.map(x => { const s = registro.find(r => r.id === x.id && !r.cerrado); return s ? { ...x, subagente: { nombre: s.nombre, origen: s.origen } } : x })
  const r = await apagar(firma, { subagentes: subRefs(registro), terminales: conAgente })
  olvidarFoto()
  return r
}

/** Una sola lista de lo que trabaja para Daniel: terminales (motor o, de respaldo, el gate de
 *  SFTerm) + `internas` (subagentes y comandos en segundo plano de los turnos de Levy). */
export interface Trabajos { fuente: 'motor' | 'sfterm-gate' | 'ninguna'; sfterm: boolean; internas: TareaInterna[]; motor?: MotorResumen; topes?: Topes; permitidos: { harness: readonly string[]; carpetas: string[] }; terminales: Terminal[]; servidores: Servidor[]; servicios: Servicio[]; procesos?: Proceso[]; leidoEn: string; error?: string }

// ── De qué conversación salió cada subagente (3 oct 2026, Daniel: «no sé de qué conversación viene») ──
// El MCP de la cabina corre sin saber en qué conversación está (su config es JSON fijo para no romper el pool).
// La conversación la conoce el corredor: al ver el resultado de `delegar` en el turno lo anota aquí. Para los
// lanzados antes (o si esa anotación se perdió), se deduce del diario de turnos del chat.
const LANZADO = /Subagente «[^»]*» lanzado[\s\S]*?agenteId (\d+)/

/** El agenteId que anuncia un resultado de `delegar`, o null. */
export function agenteDeResultado(texto: unknown): number | null {
  const m = typeof texto === 'string' ? LANZADO.exec(texto) : null
  return m ? Number(m[1]) : null
}

/** El corredor vio a Levy lanzar `id` desde `conversacion`: queda en el registro. */
export async function anotarOrigen(id: number, conversacion: string) {
  await mutarRegistro(registro => {
    const i = registro.map(s => s.id).lastIndexOf(id)
    if (i < 0 || registro[i].origen) return null
    return registro.map((s, j) => j === i ? { ...s, origen: conversacion.replace(/^sdk:/, '') } : s)
  })
}

/** Busca en el diario de turnos (`chat_runtime_turns`) el turno cuyo resultado anunció ese agenteId. */
export function origenEnDiario(id: number): string | null {
  try {
    const db = new Database(process.env.CLAUDECLAW_DB ?? join(dirname(fileURLToPath(import.meta.url)), '../../store/claudeclaw.db'), { readonly: true, fileMustExist: true })
    try {
      const fila = db.prepare(`SELECT conversation_id FROM chat_runtime_turns WHERE snapshot_json LIKE ? ORDER BY created_at LIMIT 1`).get(`%agenteId ${id} (%`) as { conversation_id?: string } | undefined
      return fila?.conversation_id?.replace(/^sdk:/, '') ?? null
    } finally { db.close() }
  } catch { return null }
}

// ── Rescate de huérfanos (5 oct 2026) ──
// Un subagente vivo en el motor que falta del registro (se perdió antes del arreglo de escritura atómica) se
// reconstruye del diario de turnos: el resultado de `delegar` dice su nombre, harness, modelo y carpeta, y la
// fila del turno dice la conversación y el dueño. Solo terminales PROPIAS del motor y solo si el turno que lo
// anunció es anterior a su nacimiento: así no se adopta una terminal que Levy no lanzó.
export interface Lanzamiento { origen: SubagenteOrigen; nombre: string; harness: Subagente['harness']; modelo?: string; cwd: string; encargo?: string; anunciadoMs: number }

const ANUNCIO = (id: number) => new RegExp(`Subagente «([^»]{1,120})» lanzado[^\n]{0,80}?agenteId ${id} \\((claude|codex)(?: · ([a-z0-9.\\-]+))?(?:, [^,)/]+)*, (/[^)]+)\\)`)

/** Lee el anuncio de `delegar` (y, si está, el encargo de su llamada) de un snapshot de turno. */
export function leerAnuncio(id: number, snapshot: string): Omit<Lanzamiento, 'origen' | 'anunciadoMs'> | null {
  const textos: string[] = []
  const recorrer = (v: unknown, prof = 0): void => {
    if (prof > 12) return
    if (typeof v === 'string') {
      textos.push(v)
      if (v.startsWith('{') && v.includes('"encargo"')) { try { recorrer(JSON.parse(v), prof + 1) } catch { /* no es JSON */ } }
    } else if (Array.isArray(v)) v.forEach(x => recorrer(x, prof + 1))
    else if (v && typeof v === 'object') Object.values(v).forEach(x => recorrer(x, prof + 1))
  }
  const objetos: Array<Record<string, unknown>> = []
  const juntar = (v: unknown, prof = 0): void => {
    if (prof > 12) return
    if (typeof v === 'string' && v.startsWith('{') && v.includes('"encargo"')) { try { juntar(JSON.parse(v), prof + 1) } catch { /* nada */ } }
    else if (Array.isArray(v)) v.forEach(x => juntar(x, prof + 1))
    else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.encargo === 'string' && typeof o.nombre === 'string') objetos.push(o); Object.values(o).forEach(x => juntar(x, prof + 1)) }
  }
  let raiz: unknown
  try { raiz = JSON.parse(snapshot) } catch { raiz = snapshot }
  recorrer(raiz); juntar(raiz)
  for (const t of textos) {
    const m = ANUNCIO(id).exec(t)
    if (!m) continue
    const pedido = objetos.find(o => o.nombre === m[1] || String(o.nombre).slice(0, 80) === m[1])
    return { nombre: m[1], harness: m[2] as Subagente['harness'], ...(m[3] ? { modelo: m[3] } : {}), cwd: m[4].trim(), ...(typeof pedido?.encargo === 'string' ? { encargo: pedido.encargo } : {}) }
  }
  return null
}

/** Busca en el diario el turno que anunció `id` antes de `nacidoMs` (margen: 1 min después, 12 h antes). */
export function lanzamientoEnDiario(id: number, nacidoMs: number): Lanzamiento | null {
  try {
    const db = new Database(process.env.CLAUDECLAW_DB ?? join(dirname(fileURLToPath(import.meta.url)), '../../store/claudeclaw.db'), { readonly: true, fileMustExist: true })
    try {
      const filas = db.prepare(`SELECT owner, account, conversation_id, created_at, snapshot_json FROM chat_runtime_turns WHERE snapshot_json LIKE ? AND created_at <= ? AND created_at >= ? ORDER BY created_at DESC LIMIT 3`)
        .all(`%agenteId ${id} (%`, nacidoMs + 60_000, nacidoMs - 12 * 3600_000) as Array<{ owner: string; account: string; conversation_id: string; created_at: number; snapshot_json: string }>
      for (const f of filas) {
        const a = leerAnuncio(id, f.snapshot_json)
        if (a) return { ...a, origen: { owner: f.owner, account: f.account, conversationId: f.conversation_id.replace(/^sdk:/, '') }, anunciadoMs: f.created_at }
      }
      return null
    } finally { db.close() }
  } catch { return null }
}

export interface TermHuerfana { id: number; pid: number; origin?: string; born_ms?: number; cwd?: string }
/** Entradas nuevas para las terminales propias del motor que el registro no conoce y el diario sí. */
export function rescatar(registro: Subagente[], terms: TermHuerfana[], buscar: (id: number, nacidoMs: number) => Lanzamiento | null = lanzamientoEnDiario, ahora = Date.now()): Subagente[] {
  const conocido = (t: TermHuerfana) => registro.some(s => s.id === t.id && !s.cerrado && (s.pid == null || s.pid === t.pid))
  const nuevos: Subagente[] = []
  for (const t of terms) {
    if (t.origin && t.origin !== 'motor') continue
    if (conocido(t)) continue
    const nacido = t.born_ms ?? ahora
    const l = buscar(t.id, nacido)
    if (!l || (t.cwd && resolve(t.cwd) !== resolve(l.cwd))) continue
    nuevos.push({
      id: t.id, pid: t.pid, nombre: l.nombre.slice(0, 80), harness: l.harness, encargo: (l.encargo ?? '(encargo no recuperado: ver la conversación de origen)').slice(0, 2000), cwd: l.cwd,
      creado: new Date(nacido).toISOString(), motor: true, entrega: 'entregado', entregaNota: 'rescatado del diario de turnos', avisarA: l.origen, origen: l.origen.conversationId,
      // lo anterior al rescate ya no se avisa (el 5 oct un rescate sin esto repitió 15 «terminó» viejos de golpe);
      // una pregunta que ya estaba abierta sí llega a Levy por la ruta de preguntas (decidirPregunta)
      avisadoHasta: ahora, rescatado: new Date(ahora).toISOString(), ...(l.modelo ? { modelo: l.modelo } : {}),
    })
  }
  return nuevos
}

/** Rescata en disco a los huérfanos vivos. Devuelve los rescatados. `vistos` evita repetir la búsqueda. */
export async function rescatarHuerfanos(terms: TermHuerfana[], vistos?: Set<string>, buscar?: (id: number, nacidoMs: number) => Lanzamiento | null): Promise<Subagente[]> {
  const pendientes = vistos ? terms.filter(t => !vistos.has(`${t.id}:${t.pid}`)) : terms
  if (!pendientes.length) return []
  const candidatos = rescatar(await leerRegistro(), pendientes, buscar)
  for (const t of pendientes) vistos?.add(`${t.id}:${t.pid}`)
  if (!candidatos.length) return []
  let hechos: Subagente[] = []
  await mutarRegistro(l => {
    hechos = candidatos.filter(c => !l.some(s => s.id === c.id && !s.cerrado && (s.pid == null || s.pid === c.pid)))
    return hechos.length ? [...l, ...hechos] : null
  })
  return hechos
}

/** Completa `origen` donde falte. Uno recién lanzado se reintenta: su turno puede no haber guardado aún. */
export function completarOrigenes(registro: Subagente[], buscar: (id: number) => string | null = origenEnDiario, ahora = Date.now()): { registro: Subagente[]; cambio: boolean } {
  let cambio = false
  const nuevo = registro.map(s => {
    if (s.origen !== undefined) return s
    const o = buscar(s.id)
    if (o) { cambio = true; return { ...s, origen: o } }
    if (ahora - Date.parse(s.creado) > 15 * 60_000) { cambio = true; return { ...s, origen: null } }
    return s
  })
  return { registro: nuevo, cambio }
}

/**
 * Una foto compartida por ventana corta (6 oct 2026, eficiencia). El chat, el Taller, el botón del panel y la
 * lista de conversaciones la piden cada 2–6 s, a veces varias pestañas a la vez, y cada lectura lanzaba `lsof`,
 * `launchctl list` y `ps`: con la app abierta y quieta eran ~1 lectura por segundo. Dentro de `FOTO_MS` todos
 * reciben la misma (también la que está en curso); `olvidarFoto()` la tira cuando algo cambia a propósito.
 */
const FOTO_MS = 2_000
const fotos = new Map<number, { en: number; foto: Promise<Trabajos> }>()
export function olvidarFoto() { fotos.clear() }
export function trabajos(lineas = 6): Promise<Trabajos> {
  const previa = fotos.get(lineas)
  if (previa && Date.now() - previa.en < FOTO_MS) return previa.foto
  const foto = leerTrabajos(lineas)
  fotos.set(lineas, { en: Date.now(), foto })
  foto.catch(() => { if (fotos.get(lineas)?.foto === foto) fotos.delete(lineas) })
  return foto
}

/** Puertos y servicios cambian poco y cuestan un `lsof` y un `launchctl` cada vez: se releen cada 10 s. */
const VIDA_MAQUINA_MS = 10_000
function conVida<T>(ms: number, leer: () => Promise<T>): () => Promise<T> {
  let en = 0, valor: Promise<T> | null = null
  return () => {
    if (valor && Date.now() - en < ms) return valor
    en = Date.now()
    const v = leer()
    valor = v
    v.catch(() => { if (valor === v) valor = null })
    return v
  }
}
const servidoresVivos = conVida(VIDA_MAQUINA_MS, servidores)
const serviciosVivos = conVida(VIDA_MAQUINA_MS, servicios)

async function leerTrabajos(lineas: number): Promise<Trabajos> {
  let registro = await leerRegistro()
  if (completarOrigenes(registro).cambio) registro = await mutarRegistro(l => { const c = completarOrigenes(l); return c.cambio ? c.registro : null }).catch(() => registro)
  let terminales: Terminal[] = [], fuente: Trabajos['fuente'] = 'motor', error: string | undefined, resumen: MotorResumen | undefined, topes: Topes | undefined
  try {
    const { motor: m, terms } = await motor.info()
    terminales = await Promise.all(terms.map(t => terminalDelMotor(t, lineas, registro)))
    // tokens de los subagentes vivos al registro: el tope de costo se mide, no se supone;
    // y un subagente cuya PTY ya no está (o cuyo id ahora es de otro proceso) terminó
    const vivo = (s: Subagente) => terms.some(t => t.id === s.id && (s.pid == null || t.pid === s.pid))
    const actualizar = (l: Subagente[]) => {
      let cambio = false
      const nuevo = l.map(s => {
        if (s.motor && !s.cerrado && !vivo(s)) { cambio = true; return { ...s, cerrado: new Date().toISOString(), fin: 'desapareció del motor' } }
        const tok = s.cerrado ? undefined : terminales.find(x => x.id === s.id && x.pid === (s.pid ?? x.pid))?.conversacion?.tokens
        if (tok != null && tok !== s.tokens) { cambio = true; return { ...s, tokens: tok } }
        return s
      })
      return cambio ? nuevo : null
    }
    // se decide sobre la foto y se escribe sobre el registro fresco, bajo candado (nada que otro proceso anotó se pisa)
    const nuevo = actualizar(registro) ? await mutarRegistro(actualizar) : registro
    topes = calcularTopes(nuevo, new Set(terms.map(t => t.id)))
    resumen = {
      pid: m.pid, relevos: m.relevos, propias: terms.filter(t => t.origin === 'motor').length, adoptadas: terms.filter(t => t.origin === 'sfterm-ptyd').length,
      sfterm: !m.legacy ? 'sin adopción' : m.legacy_connected ? 'enlazado' : 'desconectado', soloLectura: m.legacy_readonly, desde: new Date(m.started_ms).toISOString(),
    }
  } catch (e) {
    // respaldo: el gate de SFTerm (goal 2) — salvo en bancos de prueba aislados
    error = `motor de Arbrain no disponible (${motorSock().replace(homedir(), '~')}): ${e instanceof Error ? e.message : e}`
    try {
      if (process.env.CABINA_SIN_RESPALDO_GATE === '1') throw new Error('respaldo desactivado en este entorno')
      const lista = await gate<TermGate[]>('list')
      fuente = 'sfterm-gate'
      terminales = await Promise.all(lista.map(async t => {
        let texto = ''
        try { const r = await gate<string | { text?: string }>('read', { id: t.id, lines: 40 }); texto = typeof r === 'string' ? r : r?.text ?? '' } catch { /* sin buffer */ }
        const sub = registro.find(s => s.id === t.id && !s.cerrado)
        return { id: t.id, titulo: t.title, cwd: t.cwd.replace(homedir(), '~'), proc: t.proc, estado: estadoDe(t.proc, texto), ...leerPantalla(texto), ultimas: limpiarLineas(texto, lineas), ...(sub ? { subagente: sub } : {}) }
      }))
    } catch (g) { fuente = 'ninguna'; error += ` · SFTerm tampoco respondió: ${g instanceof Error ? g.message : g}` }
  }
  // Subagentes sin pantalla (6 oct 2026): no viven en el motor; su tarjeta sale de su bitácora de eventos.
  try {
    const { terminalesSinPantalla } = await import('./sin-pantalla.js')
    const propias = await terminalesSinPantalla(registro, lineas)
    terminales = [...terminales.filter(t => !propias.some(x => x.id === t.id)), ...propias]
    const anotar = (l: Subagente[]) => {
      let cambio = false
      const nuevo = l.map(s => { const tok = propias.find(x => x.id === s.id && !s.cerrado)?.conversacion?.tokens; if (tok != null && tok !== s.tokens) { cambio = true; return { ...s, tokens: tok } } return s })
      return cambio ? nuevo : null
    }
    if (anotar(registro)) registro = await mutarRegistro(anotar)
    if (topes) topes = calcularTopes(registro, new Set([...terminales.filter(t => t.origen !== 'sin-pantalla').map(t => t.id), ...propias.filter(t => t.estado === 'trabajando').map(t => t.id)]))
  } catch (e) { error = [error, `subagentes sin pantalla: ${e instanceof Error ? e.message : e}`].filter(Boolean).join(' · ') }
  const permitidos = await harnessPermitidos().catch(() => HARNESS_PERMITIDOS)
  // Procesos con dueño (5 oct 2026): el registro completo (también los cerrados) dice de qué agente era cada worktree.
  const [srv, svc, int, procs] = await Promise.all([servidoresVivos(), serviciosVivos(), leerInternas().catch(() => [] as TareaInterna[]), leerProcesos({ subagentes: subRefs(registro), terminales: termRefs(terminales) }).catch(() => undefined)])
  return {
    fuente, sfterm: fuente !== 'ninguna', internas: int.map(t => ({ ...t, descripcion: tachar(t.descripcion), ...(t.actividad ? { actividad: tachar(t.actividad) } : {}), ...(t.resumen ? { resumen: tachar(t.resumen).slice(0, 300) } : {}), ...(t.resultado ? { resultado: undefined } : {}) })), ...(resumen ? { motor: resumen } : {}), ...(topes ? { topes } : {}),
    permitidos: { harness: permitidos, carpetas: ['/tmp', '~/Developer'] },
    terminales, servidores: srv, servicios: svc, ...(procs ? { procesos: procs } : {}), leidoEn: new Date().toISOString(), ...(error ? { error } : {}),
  }
}
