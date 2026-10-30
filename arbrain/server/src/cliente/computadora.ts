/**
 * Taller › Computadora del alumno (T16 del inventario de la cohorte, 29 oct 2026). Un alumno con una MacBook Air de 8 GB
 * (28 oct): «como tengo 8 giga… se me estaba trabando mucho Arbrain»; otro pidió «la sección Computadora (RAM y forzar
 * salida)»; la Mac Mini de un tercero se durmió y sus rutinas no corrieron. Lo que responde, en palabras de alguien que no es
 * técnico: cuánta memoria queda (con semáforo), cuánto disco libre, qué tan ocupado va el procesador, si la computadora
 * puede dormirse y qué 8 apps usan más memoria (Chrome y sus ayudantes como una sola), con «Cerrar» por app.
 *
 *   GET  /computadora           la foto
 *   POST /computadora/cerrar    {id}  cierre amable (Mac: AppleScript «quit»; Windows: taskkill sin /F) y espera unos segundos
 *   POST /computadora/forzar    {id}  forzar salida (Mac: kill -9; Windows: taskkill /F), solo tras el cierre amable
 * Solo edición cliente y solo la app: el pase de agente no abre estas rutas (cofre.ts › RUTAS_DEL_PASE) y cerrar o forzar
 * exigen además el secreto de la app (`X-Arbrain-Confirmar`, server.ts). Lectura con `ps`, `vm_stat`, `pmset` (Mac) y
 * PowerShell `Get-Process`/`tasklist`, `powercfg` (Windows): nada se cambia en el sistema. Cada cierre queda en «Lo que
 * hizo Levy» (bitacora.ts).
 *
 * Nunca se deja cerrar: procesos del sistema (rutas de macOS o de Windows), de otro usuario, de Arbrain mismo (su app,
 * su daemon, su web, el motor: la cadena de procesos del daemon y todo lo que vive en una carpeta «arbrain»), `claude`
 * ni `node`. Se elige por lista de permitidos: una app del usuario actual, fuera de las rutas del sistema.
 */
import { execFile } from 'node:child_process'
import { cpus, freemem, homedir, platform as plataformaOs, totalmem } from 'node:os'
import { statfsSync } from 'node:fs'
import { basename } from 'node:path'

export type Plataforma = 'mac' | 'windows' | 'otra'
export type Semaforo = 'verde' | 'amarillo' | 'rojo'

/** Un proceso leído del sistema, ya normalizado entre plataformas. */
export interface Proceso {
  pid: number
  ppid?: number
  /** Mac: uid del dueño. */
  uid?: number
  /** Windows: sesión (la del daemon = el usuario sentado frente a la computadora). */
  sesion?: number
  memoriaKb: number
  /** Mac: ruta completa del ejecutable. Windows: `Path` (null si no se puede leer: de otro usuario o del sistema). */
  ruta: string | null
  /** Windows: nombre de imagen sin `.exe`. Mac: se deduce de la ruta. */
  nombre?: string
  /** Windows: la descripción del producto («Google Chrome»), si la da. */
  descripcion?: string
}

export interface GrupoApp {
  /** Estable entre lecturas: es lo que manda la pantalla para cerrar. */
  id: string
  nombre: string
  memoriaMb: number
  procesos: number
  pids: number[]
  cerrable: boolean
  /** Por qué no se puede cerrar, en palabras del dueño. */
  motivo?: string
  /** Mac: la carpeta .app (para el «quit» por AppleScript). */
  bundle?: string
}

export interface Contexto {
  plataforma: Plataforma
  /** Mac: uid del usuario actual. */
  uid?: number
  /** Windows: sesión del daemon. */
  sesion?: number
  /** Pids de Arbrain que nunca se cierran: el daemon, su cadena de padres y sus hijos. */
  protegidos: ReadonlySet<number>
}

// ── Lectura pura ──────────────────────────────────────────────────────────────────────────────────────────────────

/** `ps -axo pid=,ppid=,uid=,rss=,comm=` (macOS). `comm` va al final y puede llevar espacios. */
export function parsearPsMac(salida: string): Proceso[] {
  const lista: Proceso[] = []
  for (const linea of salida.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(linea)
    if (!m) continue
    lista.push({ pid: Number(m[1]), ppid: Number(m[2]), uid: Number(m[3]), memoriaKb: Number(m[4]), ruta: m[5] })
  }
  return lista
}

/** Memoria disponible en bytes según `vm_stat` (libre + inactiva + especulativa + purgable, la cuenta del vigía). */
export function leerVmStat(salida: string): number | null {
  const pagina = Number(/page size of (\d+)/.exec(salida)?.[1] ?? 0)
  if (!pagina) return null
  const v = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(salida)?.[1] ?? 0)
  return (v('Pages free') + v('Pages inactive') + v('Pages speculative') + v('Pages purgeable')) * pagina
}

/**
 * PowerShell `Get-Process | Select-Object Id,ProcessName,WorkingSet64,Path,SessionId,Description | ConvertTo-Json`.
 * Un solo proceso llega como objeto y no como lista.
 */
export function parsearGetProcess(json: string): Proceso[] {
  let datos: unknown
  try { datos = JSON.parse(json.replace(/^\uFEFF/, '')) } catch { return [] }
  const filas = Array.isArray(datos) ? datos : datos && typeof datos === 'object' ? [datos] : []
  const lista: Proceso[] = []
  for (const f of filas as Array<Record<string, unknown>>) {
    const pid = Number(f.Id)
    if (!Number.isInteger(pid) || pid <= 0) continue
    lista.push({
      pid,
      sesion: Number.isInteger(Number(f.SessionId)) ? Number(f.SessionId) : undefined,
      memoriaKb: Math.round(Number(f.WorkingSet64 ?? 0) / 1024) || 0,
      ruta: typeof f.Path === 'string' && f.Path ? f.Path : null,
      nombre: typeof f.ProcessName === 'string' ? f.ProcessName : undefined,
      descripcion: typeof f.Description === 'string' && f.Description.trim() ? f.Description.trim() : undefined,
    })
  }
  return lista
}

/** Una línea CSV de `tasklist` (campos entre comillas). */
function camposCsv(linea: string): string[] {
  const campos: string[] = []
  const re = /"((?:[^"]|"")*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(linea))) campos.push(m[1].replace(/""/g, '"'))
  return campos
}

/**
 * Respaldo de Windows: `tasklist /FO CSV /NH` («Nombre de imagen","PID","Sesión","Núm. de sesión","Uso de memoria»).
 * La memoria viene con separador de miles del idioma («123,456 K» o «123.456 K»): se quedan solo los dígitos. Sin ruta:
 * con esta lectura nada se puede cerrar (no se sabe si es del sistema).
 */
export function parsearTasklist(csv: string): Proceso[] {
  const lista: Proceso[] = []
  for (const linea of csv.split(/\r?\n/)) {
    const c = camposCsv(linea)
    if (c.length < 5) continue
    const pid = Number(c[1])
    if (!Number.isInteger(pid) || pid <= 0) continue
    lista.push({ pid, sesion: Number(c[3]), memoriaKb: Number(c[4].replace(/\D/g, '')) || 0, ruta: null, nombre: c[0].replace(/\.exe$/i, '') })
  }
  return lista
}

export interface Sueno {
  /** ¿El ajuste permite que se duerma sola? null = no se pudo leer. */
  puedeDormirse: boolean | null
  /** A los cuántos minutos sin uso (null si nunca o no se sabe). */
  minutos: number | null
  /** Apps que ahora mismo lo impiden (Mac), aunque el ajuste lo permita. */
  impidenAhora: string[]
}

/** `pmset -g` (y opcionalmente `pmset -g assertions`) de macOS. */
export function leerPmset(general: string, aserciones = ''): Sueno {
  const deshabilitado = /^\s*SleepDisabled\s+1\b/m.test(general)
  const m = /^\s*sleep\s+(\d+)(.*)$/m.exec(general)
  if (!m && !deshabilitado) return { puedeDormirse: null, minutos: null, impidenAhora: [] }
  const minutos = m ? Number(m[1]) : 0
  const impidenAhora = new Set<string>()
  const por = /sleep prevented by ([^)]+)\)/.exec(m?.[2] ?? '')?.[1]
  if (por) for (const a of por.split(',')) if (a.trim()) impidenAhora.add(a.trim())
  // Aserciones: «PreventUserIdleSystemSleep named: "…"» con el nombre del proceso entre paréntesis al inicio de la línea.
  for (const l of aserciones.split('\n')) {
    const a = /pid \d+\(([^)]+)\):.*PreventUserIdleSystemSleep/.exec(l)
    if (a) impidenAhora.add(a[1])
  }
  const puede = !deshabilitado && minutos > 0
  return { puedeDormirse: puede, minutos: puede ? minutos : null, impidenAhora: [...impidenAhora] }
}

/**
 * `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` (Windows). Las etiquetas cambian con el idioma; los dos últimos
 * valores hexadecimales son siempre «conectada» (AC) y «con batería» (DC), en segundos. 0 = nunca. Se usa el de conectada.
 */
export function leerPowercfg(salida: string): Sueno {
  const hex = [...salida.matchAll(/0x([0-9a-f]{8})\b/gi)].map(m => parseInt(m[1], 16))
  if (hex.length < 2) return { puedeDormirse: null, minutos: null, impidenAhora: [] }
  const ac = hex[hex.length - 2]
  return { puedeDormirse: ac > 0, minutos: ac > 0 ? Math.round(ac / 60) : null, impidenAhora: [] }
}

// ── Agrupar por app y decidir qué se puede cerrar ────────────────────────────────────────────────────────────────

/** Nombres que nunca se cierran desde aquí, en cualquier plataforma (Arbrain y su motor). */
const NUNCA = /^(arbrain|claude|node|bun|next-server|tsx)$/i
/** Rutas del sistema en macOS. */
const SISTEMA_MAC = /^\/(System|usr|bin|sbin|private|Library\/Apple|Library\/Application Support\/Apple)\//
/** Solo se cierran apps instaladas donde viven las apps (no un Python.app de Homebrew ni un framework). */
const APPS_MAC = /^(\/Applications|\/Users\/[^/]+\/Applications)\//
/** Ayudantes y piezas de Windows que viven fuera de C:\Windows o que otras apps usan por dentro. */
const SISTEMA_WIN = new Set(['explorer', 'dwm', 'csrss', 'winlogon', 'svchost', 'sihost', 'ctfmon', 'taskhostw', 'runtimebroker', 'shellexperiencehost',
  'startmenuexperiencehost', 'searchhost', 'searchapp', 'textinputhost', 'applicationframehost', 'conhost', 'securityhealthsystray', 'lsass', 'services',
  'smss', 'wininit', 'fontdrvhost', 'msedgewebview2', 'widgets', 'lockapp', 'system', 'idle', 'registry', 'memory compression', 'powershell', 'pwsh', 'cmd'])

const NOMBRES_WIN: Record<string, string> = { chrome: 'Google Chrome', msedge: 'Microsoft Edge', firefox: 'Firefox', brave: 'Brave', code: 'Visual Studio Code', zoom: 'Zoom', teams: 'Microsoft Teams', 'ms-teams': 'Microsoft Teams', whatsapp: 'WhatsApp', spotify: 'Spotify', slack: 'Slack', discord: 'Discord', obs64: 'OBS', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook' }

/** La primera carpeta `.app` de una ruta de macOS: la de Chrome aunque el proceso sea un ayudante anidado. */
export function bundleDe(ruta: string): string | null {
  const i = ruta.indexOf('.app/')
  if (i < 0) return ruta.endsWith('.app') ? ruta : null
  return ruta.slice(0, i + 4)
}

const esDeArbrain = (ruta: string | null) => !!ruta && /[\\/][^\\/]*arbrain[^\\/]*[\\/]/i.test(ruta)
const nombreMotor = (nombre: string) => /^claude$/i.test(nombre) ? 'Claude Code' : nombre
const SIEMPRE_ABIERTO = 'Es Arbrain: lo necesitas abierto para hablar con Levy.'
const DEL_MOTOR = 'Lo usan Arbrain y Levy por dentro.'

/** Agrupa por app y decide si cada grupo se puede cerrar. Ordenado de más a menos memoria. Pura. */
export function agrupar(procesos: Proceso[], ctx: Contexto): GrupoApp[] {
  const grupos = new Map<string, GrupoApp & { razones: Set<string> }>()
  for (const p of procesos) {
    let id: string, nombre: string, bundle: string | undefined
    let razon: string | null = null
    if (ctx.plataforma === 'mac') {
      const ruta = p.ruta ?? ''
      const b = bundleDe(ruta)
      nombre = b ? basename(b, '.app') : basename(ruta) || `Proceso ${p.pid}`
      id = b ?? ruta
      bundle = b ?? undefined
      if (esDeArbrain(ruta) || /^arbrain$/i.test(nombre)) { nombre = 'Arbrain'; id = 'arbrain'; razon = SIEMPRE_ABIERTO }
      else if (NUNCA.test(nombre)) { id = `motor:${nombre.toLowerCase()}`; nombre = nombreMotor(nombre); razon = DEL_MOTOR }
      else if (ctx.protegidos.has(p.pid)) razon = DEL_MOTOR
      else if (p.uid !== ctx.uid) razon = 'Es del sistema o de otro usuario.'
      else if (SISTEMA_MAC.test(ruta)) razon = 'Es parte de macOS.'
      else if (!b || !APPS_MAC.test(b)) razon = 'Es un proceso de fondo, no una app.'
    } else {
      const base = (p.nombre ?? (p.ruta ? basename(p.ruta).replace(/\.exe$/i, '') : '')) || `Proceso ${p.pid}`
      const clave = base.toLowerCase()
      id = clave
      nombre = NOMBRES_WIN[clave] ?? p.descripcion ?? base
      const ruta = p.ruta
      if (esDeArbrain(ruta) || /^arbrain$/i.test(base)) { nombre = 'Arbrain'; id = 'arbrain'; razon = SIEMPRE_ABIERTO }
      else if (NUNCA.test(base)) { nombre = nombreMotor(base); id = `motor:${clave}`; razon = DEL_MOTOR }
      else if (ctx.protegidos.has(p.pid)) razon = DEL_MOTOR
      else if (SISTEMA_WIN.has(clave)) razon = 'Es parte de Windows.'
      else if (!ruta) razon = 'Es del sistema o de otro usuario.'
      else if (/^[a-z]:\\windows\\/i.test(ruta)) razon = 'Es parte de Windows.'
      else if (ctx.sesion !== undefined && p.sesion !== ctx.sesion) razon = 'Es de otro usuario.'
    }
    const g = grupos.get(id) ?? { id, nombre, memoriaMb: 0, procesos: 0, pids: [], cerrable: true, razones: new Set<string>(), ...(bundle ? { bundle } : {}) }
    g.memoriaMb += p.memoriaKb / 1024
    g.procesos++
    g.pids.push(p.pid)
    if (razon) g.razones.add(razon)
    grupos.set(id, g)
  }
  return [...grupos.values()]
    .map(({ razones, ...g }) => {
      const motivo = [...razones][0]
      return { ...g, memoriaMb: Math.round(g.memoriaMb), cerrable: !motivo, ...(motivo ? { motivo } : {}) }
    })
    .sort((a, b) => b.memoriaMb - a.memoriaMb)
}

/** Los pids de Arbrain que nunca se cierran: el daemon, toda su cadena de padres (la app) y todos sus descendientes. */
export function pidsProtegidos(procesos: Proceso[], propio: number, padre?: number): Set<number> {
  const protegidos = new Set<number>([propio])
  if (padre) protegidos.add(padre)
  const porPid = new Map(procesos.map(p => [p.pid, p]))
  let actual = porPid.get(propio)?.ppid ?? padre
  for (let i = 0; actual && actual > 1 && i < 32; i++) { protegidos.add(actual); actual = porPid.get(actual)?.ppid }
  let crecio = true
  while (crecio) {
    crecio = false
    for (const p of procesos) if (p.ppid && p.ppid > 1 && protegidos.has(p.ppid) && !protegidos.has(p.pid)) { protegidos.add(p.pid); crecio = true }
  }
  return protegidos
}

// ── Semáforo y consejos (texto fijo, sin IA) ─────────────────────────────────────────────────────────────────────

export function semaforoMemoria(disponible: number, total: number): Semaforo {
  const usada = total > 0 ? 1 - disponible / total : 0
  return usada >= 0.9 ? 'rojo' : usada >= 0.75 ? 'amarillo' : 'verde'
}

const NAVEGADOR = /chrome|edge|brave|firefox|safari|arc|opera/i
const GB = 1024 ** 3

export function consejos(f: { plataforma: Plataforma; memoria: { total: number; semaforo: Semaforo } | null; discoLibre: number | null; procesador: number | null; sueno: Sueno; apps: GrupoApp[]; tieneRutinas: boolean }): string[] {
  const lista: string[] = []
  const apretada = f.memoria && f.memoria.semaforo !== 'verde'
  if (apretada) {
    const nav = f.apps.find(a => NAVEGADOR.test(a.nombre))
    lista.push(nav
      ? `Cierra las pestañas de ${nav.nombre} que no estés usando: cada pestaña guarda su página en memoria.`
      : 'Cierra las apps que no estés usando: abajo ves cuáles ocupan más.')
  }
  if (f.memoria && f.memoria.total <= 8.5 * GB) lista.push('Con 8 GB de memoria, deja abierta una sola app pesada además de Arbrain (por ejemplo, Chrome con muchas pestañas, Zoom o un editor de video).')
  else if (f.memoria?.semaforo === 'rojo') lista.push('Si sigue lenta, reinicia la computadora: libera la memoria que las apps no devolvieron.')
  if (f.discoLibre !== null && f.discoLibre < 10 * GB) lista.push(f.plataforma === 'windows' ? 'Te queda poco disco: vacía la Papelera de reciclaje y borra descargas viejas.' : 'Te queda poco disco: vacía la Papelera y borra descargas viejas.')
  if (f.procesador !== null && f.procesador >= 85) lista.push('El procesador va al tope: espera a que termine lo que está corriendo o cierra la app que más trabaja.')
  if (f.sueno.puedeDormirse && f.tieneRutinas) {
    lista.push(f.plataforma === 'windows'
      ? 'Tu computadora puede suspenderse y tus rutinas no corren mientras duerme. Para evitarlo: Configuración › Sistema › Inicio/apagado y suspensión (o «Energía»), y en «Cuando esté conectado, suspender después de» elige «Nunca». Déjala conectada.'
      : 'Tu Mac puede dormirse y tus rutinas no corren mientras duerme. Para evitarlo: Ajustes del Sistema › Batería › Opciones (en una Mac de escritorio: Ajustes del Sistema › Energía) y activa «Evitar el reposo automático cuando la pantalla esté apagada». Si es laptop, déjala conectada.')
  }
  return lista
}

// ── Comandos (inyectables en las pruebas: aquí nunca se cierra nada de verdad) ─────────────────────────────────────

export type Ejecutar = (cmd: string, args: string[], plazoMs?: number) => Promise<string>

export const ejecutarReal: Ejecutar = (cmd, args, plazoMs = 6000) => new Promise((ok, mal) => {
  execFile(cmd, args, { timeout: plazoMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (e, stdout) => e && !stdout ? mal(e) : ok(String(stdout)))
})

export interface Deps {
  plataforma: Plataforma
  ejecutar: Ejecutar
  pid: number
  ppid: number
  uid?: number
  memoriaTotal: () => number
  memoriaLibre: () => number
  discoLibre: () => number | null
  procesador: () => Promise<number | null>
  tieneRutinas: () => boolean
  esperar: (ms: number) => Promise<void>
  anotar?: (que: string, motivo: string) => void
}

export function plataformaActual(p = plataformaOs()): Plataforma {
  return p === 'darwin' ? 'mac' : p === 'win32' ? 'windows' : 'otra'
}

/** % ocupado de todo el procesador en una ventana corta (funciona igual en Mac y Windows: `loadavg` es 0 en Windows). */
export async function medirProcesador(ventanaMs = 400): Promise<number | null> {
  const muestra = () => cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { total: a.total + t, libre: a.libre + c.times.idle } }, { total: 0, libre: 0 })
  const a = muestra()
  await new Promise(r => setTimeout(r, ventanaMs))
  const b = muestra()
  const total = b.total - a.total
  return total > 0 ? Math.round(100 * (1 - (b.libre - a.libre) / total)) : null
}

export function depsReales(tieneRutinas: () => boolean, anotar?: Deps['anotar']): Deps {
  return {
    plataforma: plataformaActual(),
    ejecutar: ejecutarReal,
    pid: process.pid,
    ppid: process.ppid,
    uid: typeof process.getuid === 'function' ? process.getuid() : undefined,
    memoriaTotal: totalmem,
    memoriaLibre: freemem,
    discoLibre: () => { try { const s = statfsSync(homedir()); return s.bavail * s.bsize } catch { return null } },
    procesador: () => medirProcesador(),
    tieneRutinas,
    esperar: ms => new Promise(r => setTimeout(r, ms)),
    anotar,
  }
}

const PS_WIN = 'Get-Process | Select-Object Id,ProcessName,WorkingSet64,Path,SessionId,Description | ConvertTo-Json -Compress'

/** Los procesos de la computadora (solo lectura). */
export async function leerProcesos(d: Deps): Promise<Proceso[]> {
  if (d.plataforma === 'mac') return parsearPsMac(await d.ejecutar('ps', ['-axo', 'pid=,ppid=,uid=,rss=,comm=']))
  if (d.plataforma === 'windows') {
    try {
      const l = parsearGetProcess(await d.ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_WIN], 10_000))
      if (l.length) return l
    } catch { /* respaldo abajo */ }
    return parsearTasklist(await d.ejecutar('tasklist', ['/FO', 'CSV', '/NH']))
  }
  return []
}

function contexto(d: Deps, procesos: Proceso[]): Contexto {
  return {
    plataforma: d.plataforma,
    uid: d.uid,
    sesion: procesos.find(p => p.pid === d.pid)?.sesion,
    protegidos: pidsProtegidos(procesos, d.pid, d.ppid),
  }
}

async function leerSueno(d: Deps): Promise<Sueno> {
  try {
    if (d.plataforma === 'mac') {
      const [g, a] = await Promise.all([d.ejecutar('pmset', ['-g']), d.ejecutar('pmset', ['-g', 'assertions']).catch(() => '')])
      return leerPmset(g, a)
    }
    if (d.plataforma === 'windows') return leerPowercfg(await d.ejecutar('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE']))
  } catch { /* sin dato */ }
  return { puedeDormirse: null, minutos: null, impidenAhora: [] }
}

export const MAX_APPS = 8

export interface FotoComputadora {
  plataforma: Plataforma
  memoria: { total: number; disponible: number; usada: number; semaforo: Semaforo } | null
  discoLibre: number | null
  procesador: number | null
  sueno: Sueno
  apps: GrupoApp[]
  tieneRutinas: boolean
  consejos: string[]
}

export async function leerComputadora(d: Deps): Promise<FotoComputadora> {
  const [procesos, vm, sueno, procesador] = await Promise.all([
    leerProcesos(d).catch(() => [] as Proceso[]),
    d.plataforma === 'mac' ? d.ejecutar('vm_stat', []).catch(() => '') : Promise.resolve(''),
    leerSueno(d),
    d.procesador().catch(() => null),
  ])
  const total = d.memoriaTotal()
  const disponible = d.plataforma === 'mac' ? leerVmStat(vm) ?? d.memoriaLibre() : d.memoriaLibre()
  const memoria = total > 0 ? { total, disponible, usada: Math.max(0, total - disponible), semaforo: semaforoMemoria(disponible, total) } : null
  const apps = agrupar(procesos, contexto(d, procesos)).slice(0, MAX_APPS)
  const tieneRutinas = d.tieneRutinas()
  const discoLibre = d.discoLibre()
  const base = { plataforma: d.plataforma, memoria, discoLibre, procesador, sueno, apps, tieneRutinas }
  return { ...base, consejos: consejos(base) }
}

// ── Cerrar ───────────────────────────────────────────────────────────────────────────────────────────────────────

const ID_VALIDO = /^[^\0\n\r]{1,400}$/

export type ResultadoCierre =
  | { ok: true; cerrada: boolean; nombre: string; puedeForzar?: boolean; mensaje: string }
  | { ok: false; status: number; error: string }

async function grupoVivo(d: Deps, id: string): Promise<GrupoApp | undefined> {
  const procesos = await leerProcesos(d)
  return agrupar(procesos, contexto(d, procesos)).find(g => g.id === id)
}

/** Cierra una app: amable y espera hasta `esperaMs`; con `forzar`, forzar salida. Vuelve a leer los procesos antes de actuar. */
export async function cerrarApp(d: Deps, id: unknown, opciones: { forzar: boolean; esperaMs?: number }): Promise<ResultadoCierre> {
  if (typeof id !== 'string' || !ID_VALIDO.test(id)) return { ok: false, status: 400, error: 'Falta qué app cerrar.' }
  if (d.plataforma === 'otra') return { ok: false, status: 400, error: 'En esta computadora no puedo cerrar apps desde aquí.' }
  let g: GrupoApp | undefined
  try { g = await grupoVivo(d, id) } catch { return { ok: false, status: 503, error: 'No pude leer las apps abiertas. Intenta de nuevo.' } }
  if (!g) return { ok: true, cerrada: true, nombre: id, mensaje: 'Esa app ya estaba cerrada.' }
  if (!g.cerrable) return { ok: false, status: 403, error: `No se puede cerrar ${g.nombre}: ${(g.motivo ?? '').replace(/\.$/, '').toLowerCase()}.` }
  const tam = g.memoriaMb >= 1024 ? `${(g.memoriaMb / 1024).toFixed(1)} GB` : `${g.memoriaMb} MB`
  const pidsArg = g.pids.map(String)
  try {
    if (opciones.forzar) {
      if (d.plataforma === 'mac') await d.ejecutar('kill', ['-9', ...pidsArg])
      else await d.ejecutar('taskkill', ['/F', ...g.pids.flatMap(p => ['/PID', String(p)])])
    } else if (d.plataforma === 'mac') {
      if (g.bundle) await d.ejecutar('osascript', ['-e', 'on run argv', '-e', 'if application (item 1 of argv) is running then tell application (item 1 of argv) to quit', '-e', 'end run', g.bundle], 8000)
      else await d.ejecutar('kill', ['-TERM', ...pidsArg])
    } else {
      await d.ejecutar('taskkill', g.pids.flatMap(p => ['/PID', String(p)]))
    }
  } catch { /* un proceso que ya terminó hace fallar al comando: se comprueba abajo */ }
  d.anotar?.(`${opciones.forzar ? 'Forzar salida de' : 'Cerrar'} «${g.nombre}» (${g.procesos} ${g.procesos === 1 ? 'proceso' : 'procesos'}, ${tam})`, 'Lo pediste en Taller › Computadora.')
  const espera = opciones.esperaMs ?? (opciones.forzar ? 1500 : 6000)
  for (let t = 0; t < espera; t += 500) {
    await d.esperar(500)
    const sigue = await grupoVivo(d, id).catch(() => undefined)
    if (!sigue) return { ok: true, cerrada: true, nombre: g.nombre, mensaje: `${g.nombre} se cerró.` }
  }
  return opciones.forzar
    ? { ok: true, cerrada: false, nombre: g.nombre, mensaje: `${g.nombre} sigue abierta. Reinicia la computadora si no responde.` }
    : { ok: true, cerrada: false, nombre: g.nombre, puedeForzar: true, mensaje: `${g.nombre} no se cerró. Puede estar esperando que guardes algo: revísala, o fuerza la salida (se pierde lo que no hayas guardado).` }
}

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }

/** Atiende /computadora*. null si la ruta no es suya. `secretoApp`: la llamada trae el secreto de la app (solo ella cierra). */
export async function atenderComputadora(metodo: string | undefined, ruta: string, cuerpo: Record<string, unknown>, opciones: { secretoApp: boolean; deps: Deps }): Promise<Respuesta | null> {
  if (ruta === '/computadora' && metodo === 'GET') return { status: 200, cuerpo: { ...(await leerComputadora(opciones.deps)) } }
  if (metodo !== 'POST' || (ruta !== '/computadora/cerrar' && ruta !== '/computadora/forzar')) return null
  if (!opciones.secretoApp) return { status: 403, cuerpo: { error: 'Solo tú, desde la app, puedes cerrar apps.' } }
  const r = await cerrarApp(opciones.deps, cuerpo.id, { forzar: ruta === '/computadora/forzar' })
  return r.ok ? { status: 200, cuerpo: r } : { status: r.status, cuerpo: { error: r.error } }
}
