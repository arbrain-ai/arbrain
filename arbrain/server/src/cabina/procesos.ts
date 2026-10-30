/**
 * Qué escucha en el Studio y DE QUIÉN es (5 oct 2026, Daniel: «en Servidores hay mucha basura prendida, muchos puertos
 * escuchando… quiero diferenciar servidores encendidos de distintas conversaciones, así como diferenciamos agentes»).
 *
 * Antes el Taller pintaba `lsof` tal cual: «node :3461», «Python :8088». Ahora cada proceso que escucha lleva dueño:
 *
 *  · sistema   un servicio del negocio (LaunchAgent o proceso conocido): nombre humano y área (Arbrain, Voz, Salud…).
 *  · casa      los puentes del entorno físico (casa/entorno-fisico/*_server.py, puertos 8085–8091): luces, Pixoo, Shure…
 *  · conversacion  lo levantó una conversación o un agente que SIGUE vivo (su cadena de padres llega a él, su cwd está
 *              en el worktree de un agente abierto o en el scratchpad de una sesión que se mueve).
 *  · huerfano  quien lo levantó ya cerró, y se puede comprobar: no lo administra launchd, su padre murió (ppid 1) y
 *              su dueño (agente, sesión o worktree) ya no corre. Solo estos se pueden apagar desde el Taller.
 *  · oculto    lo del sistema operativo (ControlCenter :5000/:7000, rapportd, limactl :53, Logitech) y los hijos de un
 *              servicio (el corredor del agent-server): no son del dueño y no se muestran.
 *
 * La recolección (lsof, ps, launchctl, tailscale) está separada de la regla (`clasificar`, pura) para probarla.
 * Apagar re-verifica en el momento: mismo pid, misma hora de arranque y todavía huérfano; si no, no toca nada.
 */
import { execFile } from 'node:child_process'
import { open, stat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { carpetasClaude } from '../cuentas-alternas.js'

const run = promisify(execFile)

export type Clase = 'sistema' | 'casa' | 'conversacion' | 'huerfano' | 'oculto'
export type Area = 'Arbrain' | 'Levy' | 'Datos' | 'Túneles' | 'Voz' | 'Salud' | 'Manos' | 'Apps' | 'Casa'

export interface Dueno {
  tipo: 'agente' | 'sesion' | 'levy' | 'terminal' | 'worktree' | 'nadie'
  /** Nombre humano: el del agente, el título de la sesión o el worktree. */
  nombre: string
  /** Id de conversación del chat de Levy (para nombrarla y abrirla en la app). */
  conversacion?: string
  /** Id de sesión de Claude Code / SDK: la app lo cruza con sus conversaciones (sdkSessionId). */
  sesion?: string
  vivo: boolean
  /** ISO de la última señal de vida del dueño (transcript, cierre del agente), si se conoce. */
  ultimaSenal?: string
}

export interface Proceso {
  pid: number
  /** Puertos de usuario (sin efímeros ≥ 49152, salvo que no tenga otros). */
  puertos: number[]
  nombre: string
  /** Una línea de qué es, en palabras de dueño. */
  que?: string
  clase: Clase
  area?: Area
  dueno?: Dueno
  /** Por qué es huérfano, comprobable: qué cerró y cuándo. */
  razon?: string
  /** ISO de arranque. */
  desde: string
  /** Habla HTTP y tiene sentido abrirlo en el navegador. */
  web: boolean
  /** Lo publica Tailscale (Funnel o tailnet). */
  publicado?: boolean
  /** `pid:arranque(ms)`: lo que el botón Apagar manda de vuelta para que el servidor re-verifique. */
  firma: string
}

// ── Entrada cruda (lo que se recolecta) ──
export interface ProcCrudo { pid: number; ppid: number; inicio: number; comando: string; cwd?: string }
export interface Escucha { pid: number; proceso: string; puertos: number[] }
export interface SubagenteRef { id: number; nombre: string; cwd: string; sesion?: string; cerrado?: string; pid?: number; origen?: string | null }
export interface TerminalRef { id: number; pid?: number; titulo: string; cwd: string; subagente?: { nombre: string; origen?: string | null } }
export interface SesionInfo { titulo?: string; mtime?: number }
export interface Contexto {
  escuchas: Escucha[]
  procesos: Map<number, ProcCrudo>
  /** pid → label de launchd (incluye application.*). */
  launchd: Map<number, string>
  subagentes: SubagenteRef[]
  terminales: TerminalRef[]
  /** Puertos que publica Tailscale serve/funnel. */
  publicados: Set<number>
  /** Lo leído de los transcripts por id de sesión (título y última escritura). */
  sesiones: Map<string, SesionInfo>
  /** pid del agent-server (el corredor y el SDK cuelgan de él). */
  yo: number
  ahora: number
  home?: string
}

const H = () => homedir()
const EFIMERO = 49152
/** Una sesión que no escribe su transcript en 2 h se da por cerrada. */
export const SESION_VIVA_MS = 2 * 60 * 60_000

// ── Lo que es del sistema operativo: no se muestra ──
const DEL_SO = /^(\/System\/|\/usr\/libexec\/|\/usr\/sbin\/|\/Library\/Application Support\/|\/Applications\/Utilities\/|\/opt\/homebrew\/bin\/limactl\b)/
const LABEL_SO = /^(com\.apple\.|application\.com\.apple\.)/

// ── Casa: los puentes del entorno físico ──
const CASA: Record<string, { nombre: string; que: string }> = {
  cb60b: { nombre: 'Luz Neewer CB60B', que: 'La luz principal del set, por Bluetooth' },
  panel: { nombre: 'Panel de la Casa', que: 'La página que controla todo el set' },
  wiz: { nombre: 'Focos WiZ', que: 'Las luces de ambiente' },
  shure: { nombre: 'Micrófono Shure', que: 'El micrófono del set' },
  pixoo: { nombre: 'Pantalla Pixoo', que: 'La pantalla de píxeles del escritorio' },
  shelly: { nombre: 'Enchufes Shelly', que: 'Los enchufes inteligentes' },
  obs: { nombre: 'OBS', que: 'El control de la grabación' },
}
function deLaCasa(comando: string): { nombre: string; que: string } | null {
  const m = /entorno-fisico\/([\w-]+?)(?:_server)?\.py\b/.exec(comando)
  if (!m) return null
  const clave = m[1].replace(/_server$/, '')
  return CASA[clave] ?? { nombre: clave.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()), que: 'Puente del entorno físico' }
}

// ── Servicios conocidos: por label de launchd o por su comando ──
interface Conocido { nombre: string; area: Area; que: string; web?: boolean }
const POR_LABEL: Record<string, Conocido> = {
  'com.claudeclaw.app': { nombre: 'Servidor de Levy', area: 'Levy', que: 'El chat de Levy, sus crons y esta misma vista', web: false },
  'com.levy.arbrain-web': { nombre: 'Arbrain web', area: 'Arbrain', que: 'La app que abres en el navegador y en el Funnel' },
  'com.levy.mc-sql-gateway': { nombre: 'Puerta SQL de Mission Control', area: 'Datos', que: 'Consultas a la base local', web: false },
  'com.claudeclaw.ngrok': { nombre: 'Túnel ngrok', area: 'Túneles', que: 'Abre el servidor de Levy hacia afuera' },
  'com.claudeclaw.cloudflared': { nombre: 'Túnel Cloudflare', area: 'Túneles', que: 'Segunda salida del servidor de Levy', web: false },
  'com.claudeclaw.health-receiver': { nombre: 'Receptor de Salud', area: 'Salud', que: 'Recibe lo que manda tu reloj', web: false },
  'com.claudeclaw.voz-agentes': { nombre: 'Voz de los agentes', area: 'Voz', que: 'La voz con la que hablan Levy y los agentes' },
  'com.saasfactory.sfremote': { nombre: 'SF Remote', area: 'Apps', que: 'Puente del control remoto en tu tailnet' },
  'com.arbrain.motor': { nombre: 'Motor de Arbrain', area: 'Arbrain', que: 'Las terminales de los agentes', web: false },
}
const POR_COMANDO: [RegExp, Conocido][] = [
  [/src\/manos\/web\/puente\.ts/, { nombre: 'Puente de la extensión Arbrain', area: 'Manos', que: 'Con él Levy usa tu Chrome sin tocar tus pestañas', web: false }],
  [/ssh: .*\.colima\/.*\[mux\]/, { nombre: 'Base de Mission Control', area: 'Datos', que: 'Supabase local: tareas, calendario y Arbrain', web: false }],
  [/mission-control\/sql-gateway/, POR_LABEL['com.levy.mc-sql-gateway']],
  [/Servers\/arbrain-web\//, POR_LABEL['com.levy.arbrain-web']],
  [/health_receiver\.py/, POR_LABEL['com.claudeclaw.health-receiver']],
  [/voz-agentes\/server\.py/, POR_LABEL['com.claudeclaw.voz-agentes']],
  [/sfremote\/bridge/, POR_LABEL['com.saasfactory.sfremote']],
]
/** Puertos que no hablan HTTP aunque el proceso sea genérico. */
const NO_WEB = new Set([53, 5432, 6543, 54322, 54323, 54390, 4041])

const CORREDOR = /(?:agent-server|arbrain\/server)\/(dist|src)\/chat-runtime\/corredor\.(js|ts)\b/
const HARNESS = /(^|\/)(claude|codex)(\s|$)|claude-agent-sdk/
const sesionEnArgs = (c: string) => /--(?:resume|session-id)[= ]([0-9a-f-]{36})/.exec(c)?.[1]
/** /private/tmp/claude-501/<proyecto>/<sesión>/scratchpad → sesión. */
export const sesionDeScratchpad = (ruta: string) => /\/claude-\d+\/[^/]+\/([0-9a-f-]{36})\/scratchpad\b/.exec(ruta)?.[1]
/** ~/Developer/wt-<nombre> o …/.claude/worktrees/agent-<id> → raíz del worktree. */
export function worktreeDe(ruta: string): { raiz: string; nombre: string } | null {
  const m = /^(.*\/Developer\/(wt-[^/]+))(?:\/|$)/.exec(ruta) ?? /^(.*\/\.claude\/worktrees\/([^/]+))(?:\/|$)/.exec(ruta)
  return m ? { raiz: m[1], nombre: m[2] } : null
}
/** «wt-taller-minimalista» → «Taller minimalista»; «agent-aef7e45…» → «Agente aef7e4». */
export function nombreWorktree(n: string) {
  const a = /^agent-([0-9a-f]{6})/.exec(n)
  if (a) return `Agente ${a[1]}`
  const t = n.replace(/^wt-/, '').replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const corto = (ruta: string, home: string) => ruta.replace(home, '~')
/** Entre comillas españolas, sin duplicarlas si el nombre ya las trae. */
const cita = (n: string) => /^«/.test(n) ? n : `«${n}»`
/** Nombre de algo sin catálogo: qué es por su comando, nunca «node» o «Python» a secas. */
export function nombreGenerico(p: ProcCrudo, home = H()): { nombre: string; que: string } {
  const c = p.comando, carpeta = p.cwd ? basename(p.cwd) : ''
  const lugar = carpeta && carpeta !== '/' ? carpeta : ''
  if (/Google Chrome.*--headless/.test(c)) return { nombre: 'Chrome invisible', que: `Navegador sin ventana para pruebas${lugar ? ` (${lugar})` : ''}` }
  if (/next(-server| dev)/.test(c)) return { nombre: `Servidor de prueba de ${lugar === 'arbrain' ? 'Arbrain' : lugar || 'una app'}`, que: 'Next.js en modo desarrollo' }
  if (/http\.server/.test(c)) return { nombre: `Carpeta publicada${lugar ? ` · ${lugar}` : ''}`, que: `Sirve los archivos de ${p.cwd ? corto(p.cwd, home) : 'una carpeta'}` }
  if (/(?:agent-server|arbrain\/server)\/(dist\/index\.js|src\/index\.ts)/.test(c) || (/\b(dist\/index\.js|src\/index\.ts)\b/.test(c) && /\/(?:agent-server|arbrain\/server)$/.test(p.cwd ?? ''))) return { nombre: 'Copia de prueba del servidor de Levy', que: 'Un agent-server de banco de pruebas' }
  if (/vite|serve\.mjs|npm run dev|webpack/.test(c)) return { nombre: `Servidor de prueba${lugar ? ` · ${lugar}` : ''}`, que: 'Servidor de desarrollo' }
  if (/\bpython/i.test(c)) { const s = /([\w-]+)\.py\b/.exec(c)?.[1]; return { nombre: s ? `Script ${s}` : `Script de Python${lugar ? ` · ${lugar}` : ''}`, que: 'Programa en Python' } }
  if (/\bnode\b/.test(c)) { const s = [...c.matchAll(/([\w-]+)\.(m?[jt]s)(?=\s|$)/g)].filter(m => !/^(loader|preflight|cli|index)$/.test(m[1])).at(-1)?.[1]; return { nombre: s ? `Programa ${s}` : `Programa de Node${lugar ? ` · ${lugar}` : ''}`, que: 'Programa en Node' } }
  const bin = basename(c.split(/\s+/)[0] ?? '') || 'Programa'
  return { nombre: bin, que: lugar ? `En ${lugar}` : 'Programa' }
}

function cadena(pid: number, procs: Map<number, ProcCrudo>): ProcCrudo[] {
  const out: ProcCrudo[] = []
  let p = procs.get(pid)
  for (let i = 0; p && i < 40; i++) { out.push(p); if (p.ppid <= 1) break; p = procs.get(p.ppid) }
  return out
}

const enRaiz = (ruta: string | undefined, raiz: string) => !!ruta && (ruta === raiz || ruta.startsWith(raiz + '/'))
const iso = (ms: number) => new Date(ms).toISOString()
function haceTexto(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m < 60 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`
}

/** La regla, pura: de lo recolectado a la lista que pinta el Taller. */
export function clasificar(ctx: Contexto): Proceso[] {
  const home = ctx.home ?? H()
  const vivos = [...ctx.procesos.values()]
  const harness = vivos.filter(p => HARNESS.test(p.comando))
  const sesionesVivasPorArgs = new Set(harness.map(p => sesionEnArgs(p.comando)).filter(Boolean) as string[])
  const terminalPorPid = new Map(ctx.terminales.filter(t => t.pid).map(t => [t.pid!, t]))
  const conocidoPid = new Map<number, Conocido>()
  for (const [pid, label] of ctx.launchd) if (POR_LABEL[label]) conocidoPid.set(pid, POR_LABEL[label])

  const sesionViva = (id: string) => sesionesVivasPorArgs.has(id)
    || ctx.subagentes.some(s => s.sesion === id && !s.cerrado)
    || (ctx.sesiones.get(id)?.mtime ?? 0) > ctx.ahora - SESION_VIVA_MS
  // Un harness que es HIJO del proceso evaluado (el SDK de un agent-server de prueba) no cuenta como su dueño.
  const worktreeVivo = (raiz: string, propio: number) => harness.some(p => enRaiz(p.cwd, raiz) && !cadena(p.pid, ctx.procesos).some(a => a.pid === propio))
    || ctx.terminales.some(t => enRaiz(t.cwd.replace(/^~/, home), raiz))
    || ctx.subagentes.some(s => !s.cerrado && enRaiz(s.cwd.replace(/^~/, home), raiz))

  const out: Proceso[] = []
  for (const e of ctx.escuchas) {
    const p = ctx.procesos.get(e.pid) ?? { pid: e.pid, ppid: 0, inicio: ctx.ahora, comando: e.proceso }
    const label = ctx.launchd.get(e.pid)
    const propios = e.puertos.filter(x => x < EFIMERO)
    const base = { pid: e.pid, desde: iso(p.inicio), firma: `${e.pid}:${p.inicio}`, publicado: e.puertos.some(x => ctx.publicados.has(x)) || undefined }
    const web = (puertos: number[], conocido?: Conocido) => conocido?.web !== false && puertos.some(x => !NO_WEB.has(x))
    const ocultar = () => out.push({ ...base, puertos: e.puertos, nombre: e.proceso, clase: 'oculto', web: false })

    // 1 · Sistema operativo
    if ((label && LABEL_SO.test(label)) || DEL_SO.test(p.comando) || /^(rapportd|ControlCe|logioptio|LogiPlugi|limactl)$/.test(e.proceso)) { ocultar(); continue }
    // El corredor del chat sobrevive a propósito a que el agent-server se reinicie (queda con ppid 1 y se retira solo al
    // terminar sus turnos): es del servicio, nunca huérfano. 6 oct 2026: el Taller lo marcó y el barrendero lo habría apagado.
    if (CORREDOR.test(p.comando)) { ocultar(); continue }
    // 2 · La Casa
    const casa = deLaCasa(p.comando)
    if (casa) { out.push({ ...base, puertos: propios.length ? propios : e.puertos, ...casa, clase: 'casa', area: 'Casa', web: true }); continue }
    // 3 · Servicio conocido (por launchd o por comando); su hijo con puerto efímero se oculta
    const conocido = (label ? POR_LABEL[label] : undefined) ?? POR_COMANDO.find(([re]) => re.test(p.comando))?.[1]
    const ancestros = cadena(e.pid, ctx.procesos).slice(1)
    const padreServicio = ancestros.find(a => conocidoPid.has(a.pid) || a.pid === ctx.yo)
    if (conocido && !worktreeDe(p.cwd ?? '')) {
      // Un servicio conocido conserva su puerto aunque sea alto (la puerta SQL vive en :54390).
      out.push({ ...base, puertos: propios.length ? propios : e.puertos, nombre: conocido.nombre, que: conocido.que, clase: 'sistema', area: conocido.area, web: web(propios, conocido) }); continue
    }
    if (label && !/^application\./.test(label) && !worktreeDe(p.cwd ?? '')) {
      // LaunchAgent del negocio sin ficha: sistema con su label en palabras.
      if (!propios.length) { ocultar(); continue }
      out.push({ ...base, puertos: propios, nombre: label.replace(/^(com|so)\.(claudeclaw|levy|arbrain|saasfactory)\./, ''), que: 'Servicio del Studio', clase: 'sistema', area: 'Arbrain', web: web(propios) }); continue
    }
    if (padreServicio && !propios.length) { ocultar(); continue }

    // 4 · ¿De quién es? Cadena de padres → terminal del motor, harness vivo o el propio agent-server
    const generico = nombreGenerico(p, home)
    const puertos = propios.length ? propios : e.puertos
    let dueno: Dueno | undefined
    const terminalAgente = ancestros.map(a => terminalPorPid.get(a.pid)).find(t => t?.subagente)
    const harnessCerca = ancestros.find(a => HARNESS.test(a.comando))
    const terminalCerca = ancestros.map(a => terminalPorPid.get(a.pid)).find(Boolean)
    if (terminalAgente?.subagente) {
      dueno = { tipo: 'agente', nombre: terminalAgente.subagente.nombre, vivo: true, ...(terminalAgente.subagente.origen ? { conversacion: terminalAgente.subagente.origen } : {}) }
    } else if (harnessCerca) {
      const sesion = sesionEnArgs(harnessCerca.comando)
      const wt = worktreeDe(harnessCerca.cwd ?? '')
      const info = sesion ? ctx.sesiones.get(sesion) : undefined
      const deLevy = cadena(harnessCerca.pid, ctx.procesos).some(a => a.pid === ctx.yo)
      dueno = { tipo: deLevy ? 'levy' : 'sesion', nombre: info?.titulo ?? (deLevy ? 'Levy (chat)' : wt ? nombreWorktree(wt.nombre) : terminalCerca?.titulo ?? 'Una sesión de Claude'), vivo: true, ...(sesion ? { sesion } : {}) }
    } else if (terminalCerca) {
      dueno = { tipo: 'terminal', nombre: terminalCerca.titulo, vivo: true }
    } else if (ancestros.some(a => a.pid === ctx.yo)) {
      dueno = { tipo: 'levy', nombre: 'Levy (chat)', vivo: true }
    }
    // 5 · Sin padre vivo que lo reclame: scratchpad de una sesión o worktree de un agente
    const rutas = [p.cwd ?? '', p.comando]
    if (!dueno) {
      const sesion = rutas.map(sesionDeScratchpad).find(Boolean)
      const wt = rutas.map(worktreeDe).find(Boolean) ?? null
      if (sesion) {
        const info = ctx.sesiones.get(sesion), sub = ctx.subagentes.find(s => s.sesion === sesion)
        dueno = { tipo: sub ? 'agente' : 'sesion', nombre: sub?.nombre ?? info?.titulo ?? `Sesión ${sesion.slice(0, 6)}`, sesion, vivo: sesionViva(sesion),
          ...(sub?.origen ? { conversacion: sub.origen } : {}), ...(info?.mtime ? { ultimaSenal: iso(info.mtime) } : sub?.cerrado ? { ultimaSenal: sub.cerrado } : {}) }
      } else if (wt) {
        const subs = ctx.subagentes.filter(s => enRaiz(s.cwd.replace(/^~/, home), wt.raiz))
        const sub = subs.find(s => !s.cerrado) ?? subs.at(-1)
        const vivo = worktreeVivo(wt.raiz, e.pid)
        dueno = { tipo: sub ? 'agente' : 'worktree', nombre: sub?.nombre ?? nombreWorktree(wt.nombre), vivo,
          ...(sub?.origen ? { conversacion: sub.origen } : {}), ...(sub?.cerrado && !vivo ? { ultimaSenal: sub.cerrado } : {}) }
      }
    }
    // La raíz de su cadena (el último antes de launchd) no la administra launchd ni es una app: quien lo abrió murió.
    const raiz = cadena(e.pid, ctx.procesos).at(-1)
    const huerfanoDePadre = !!raiz && raiz.ppid <= 1 && !ctx.launchd.has(raiz.pid)
    if (dueno?.vivo) { out.push({ ...base, puertos, ...generico, clase: 'conversacion', dueno, web: web(puertos) }); continue }
    if (dueno) {
      const cuando = dueno.ultimaSenal ? ` ${haceTexto(ctx.ahora - Date.parse(dueno.ultimaSenal))}` : ''
      const razon = dueno.tipo === 'agente' ? `Su agente ${cita(dueno.nombre)} ya cerró${cuando}.`
        : dueno.tipo === 'sesion' ? `La ${/^Sesión [0-9a-f]{6}$/.test(dueno.nombre) ? dueno.nombre.toLowerCase() : `sesión ${cita(dueno.nombre)}`} no se mueve${cuando ? ` desde${cuando}` : ' desde hace más de 2 h'}.`
        : `Nadie trabaja ya en el worktree ${cita(dueno.nombre)}.`
      out.push({ ...base, puertos, ...generico, clase: 'huerfano', dueno, razon, web: web(puertos) }); continue
    }
    if (huerfanoDePadre) {
      out.push({ ...base, puertos, ...generico, clase: 'huerfano', dueno: { tipo: 'nadie', nombre: 'Nadie', vivo: false },
        razon: `Nadie lo administra: quien lo abrió ya cerró. Arrancó ${haceTexto(ctx.ahora - p.inicio)}.`, web: web(puertos) }); continue
    }
    // Padre vivo pero desconocido (p. ej. una app tuya): no es basura comprobable; se oculta como del sistema.
    ocultar()
  }
  const PESO: Record<Clase, number> = { huerfano: 0, conversacion: 1, sistema: 2, casa: 3, oculto: 4 }
  return out.sort((a, b) => PESO[a.clase] - PESO[b.clase] || (a.puertos[0] ?? 0) - (b.puertos[0] ?? 0))
}

// ── Recolección ──
async function sh(cmd: string, args: string[], timeout = 8000) {
  try { return (await run(cmd, args, { timeout, maxBuffer: 8_000_000, env: { ...process.env, LC_ALL: 'C' } })).stdout } catch (e) { return (e as { stdout?: string }).stdout ?? '' }
}

export function parsearLsof(out: string): Escucha[] {
  const por = new Map<number, Escucha>()
  let actual: Escucha | null = null
  for (const l of out.split('\n')) {
    if (l.startsWith('p')) { const pid = Number(l.slice(1)); actual = por.get(pid) ?? { pid, proceso: '', puertos: [] }; por.set(pid, actual) }
    else if (l.startsWith('c') && actual) actual.proceso = l.slice(1).replace(/\\x20/g, ' ')
    else if (l.startsWith('n') && actual) { const m = /:(\d+)$/.exec(l); if (m && !actual.puertos.includes(Number(m[1]))) actual.puertos.push(Number(m[1])) }
  }
  for (const e of por.values()) e.puertos.sort((a, b) => a - b)
  return [...por.values()].filter(e => e.puertos.length)
}

export function parsearPs(out: string): Map<number, ProcCrudo> {
  const m = new Map<number, ProcCrudo>()
  for (const l of out.split('\n')) {
    // pid ppid «Mon Oct  5 18:08:32 2026» comando
    const r = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]{8}\s+\d{4})\s+(.*)$/.exec(l)
    if (!r) continue
    const inicio = Date.parse(r[3])
    m.set(Number(r[1]), { pid: Number(r[1]), ppid: Number(r[2]), inicio: Number.isFinite(inicio) ? inicio : 0, comando: r[4] })
  }
  return m
}

export function parsearLaunchctl(out: string): Map<number, string> {
  const m = new Map<number, string>()
  for (const l of out.split('\n').slice(1)) { const c = l.split('\t'); if (c.length === 3 && /^\d+$/.test(c[0])) m.set(Number(c[0]), c[2]) }
  return m
}

async function cwds(pids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>()
  if (!pids.length) return m
  const out = await sh('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'])
  let pid = 0
  for (const l of out.split('\n')) { if (l.startsWith('p')) pid = Number(l.slice(1)); else if (l.startsWith('n') && pid) m.set(pid, l.slice(1)) }
  return m
}

async function publicados(): Promise<Set<number>> {
  const out = await sh('/Applications/Tailscale.app/Contents/MacOS/Tailscale', ['serve', 'status', '--json'], 4000)
  const s = new Set<number>()
  try {
    const web = (JSON.parse(out) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }).Web ?? {}
    for (const h of Object.values(web)) for (const x of Object.values(h.Handlers ?? {})) { const m = /:(\d+)/.exec(x.Proxy ?? ''); if (m) s.add(Number(m[1])) }
  } catch { /* sin tailscale */ }
  return s
}

/** Título (ai-title) y última escritura del transcript de una sesión, en cualquier cuenta (~/.claude*). Cacheado por mtime. */
const cacheSesion = new Map<string, { mtime: number; titulo?: string }>()
async function leerSesion(id: string, proyecto: string | undefined, home = H()): Promise<SesionInfo> {
  const dirs = carpetasClaude()
  for (const d of dirs) {
    const proyectos = proyecto ? [proyecto] : []
    for (const pr of proyectos) {
      const ruta = `${home}/${d}/projects/${pr}/${id}.jsonl`
      const st = await stat(ruta).catch(() => null)
      if (!st) continue
      const c = cacheSesion.get(ruta)
      if (c && c.mtime === st.mtimeMs) return { titulo: c.titulo, mtime: st.mtimeMs }
      // La primera vez se lee entero; después solo la cola (el título se reescribe abajo), conservando el anterior.
      let titulo = c?.titulo
      try {
        let texto: string
        if (c) { const fh = await open(ruta, 'r'); try { const n = Math.min(st.size, 1_000_000), b = Buffer.alloc(n); await fh.read(b, 0, n, st.size - n); texto = b.toString('utf8') } finally { await fh.close() } }
        else texto = await readFile(ruta, 'utf8')
        const ts = [...texto.matchAll(/"aiTitle":"((?:[^"\\]|\\.)*)"/g)]
        if (ts.length) titulo = JSON.parse(`"${ts.at(-1)![1]}"`)
      } catch { /* ilegible */ }
      cacheSesion.set(ruta, { mtime: st.mtimeMs, titulo })
      return { titulo, mtime: st.mtimeMs }
    }
  }
  return {}
}

let foto: { en: number; procesos: Proceso[] } | null = null
/** Lo que escucha, clasificado. Cacheado 8 s: el Taller lo relee cada 4 s. */
export async function procesos(o: { subagentes: SubagenteRef[]; terminales: TerminalRef[]; fresco?: boolean }): Promise<Proceso[]> {
  if (!o.fresco && foto && Date.now() - foto.en < 8000) return foto.procesos
  const [lsof, ps, lc, pub] = await Promise.all([
    sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']), sh('ps', ['-axo', 'pid=,ppid=,lstart=,command=']), sh('launchctl', ['list']), publicados(),
  ])
  const escuchas = parsearLsof(lsof), procs = parsearPs(ps)
  const harness = [...procs.values()].filter(p => HARNESS.test(p.comando)).map(p => p.pid)
  const dir = await cwds([...new Set([...escuchas.map(e => e.pid), ...harness, ...escuchas.flatMap(e => cadena(e.pid, procs).map(p => p.pid))])])
  for (const [pid, cwd] of dir) { const p = procs.get(pid); if (p) p.cwd = cwd }
  // Sesiones que hace falta leer: las de los scratchpads de quien escucha y las de los harness en su cadena.
  const sesiones = new Map<string, SesionInfo>()
  const pedir = new Map<string, string | undefined>()
  for (const e of escuchas) {
    const p = procs.get(e.pid); if (!p) continue
    for (const r of [p.cwd ?? '', p.comando]) {
      const m = /\/claude-\d+\/([^/]+)\/([0-9a-f-]{36})\/scratchpad\b/.exec(r)
      if (m) pedir.set(m[2], m[1])
    }
    for (const a of cadena(e.pid, procs)) { const s = sesionEnArgs(a.comando); if (s && !pedir.has(s)) pedir.set(s, a.cwd ? a.cwd.replace(/[/.]/g, '-') : undefined) }
  }
  await Promise.all([...pedir].map(async ([id, pr]) => sesiones.set(id, await leerSesion(id, pr))))
  const lista = clasificar({ escuchas, procesos: procs, launchd: parsearLaunchctl(lc), subagentes: o.subagentes, terminales: o.terminales, publicados: pub, sesiones, yo: process.pid, ahora: Date.now() })
  foto = { en: Date.now(), procesos: lista }
  return lista
}

/** Apagar un huérfano: re-verifica (mismo pid, mismo arranque, sigue huérfano) y manda SIGTERM; SIGKILL a los 4 s si sigue. */
export async function apagar(firma: string, o: { subagentes: SubagenteRef[]; terminales: TerminalRef[] }): Promise<{ ok: true; nombre: string } | { ok: false; error: string; status: number }> {
  const [pidTxt] = firma.split(':')
  const pid = Number(pidTxt)
  if (!Number.isInteger(pid) || pid <= 1) return { ok: false, status: 400, error: 'Firma inválida.' }
  const lista = await procesos({ ...o, fresco: true })
  const x = lista.find(p => p.firma === firma)
  if (!x) return { ok: false, status: 409, error: 'Ese proceso ya no es el mismo (cerró o cambió de pid). No toqué nada.' }
  if (x.clase !== 'huerfano') return { ok: false, status: 409, error: `${cita(x.nombre)} ya no es huérfano: ${x.dueno?.vivo ? `su dueño ${cita(x.dueno.nombre)} volvió` : 'tiene dueño'}. No lo apagué.` }
  try { process.kill(pid, 'SIGTERM') } catch (e) { return { ok: false, status: 500, error: `No se pudo apagar: ${e instanceof Error ? e.message : e}` } }
  setTimeout(() => {
    // Solo si sigue siendo EL MISMO proceso (el pid no se reusó).
    void sh('ps', ['-o', 'lstart=', '-p', String(pid)]).then(out => { const t = Date.parse(out.trim()); if (t && `${pid}:${t}` === firma) { try { process.kill(pid, 'SIGKILL') } catch { /* ya cerró */ } } })
  }, 4000)
  foto = null
  return { ok: true, nombre: x.nombre }
}
