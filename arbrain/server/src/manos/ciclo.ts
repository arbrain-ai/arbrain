/**
 * Ciclo de vida de las manos atado al turno (1 nov 2026, opción 2 firmada por Daniel; docs/builds/
 * manos-permiso-por-app-2026-11-01). Común a todos los adaptadores: solo usa `soltar()` del contrato.
 *
 * 1. Soltar al terminar. Cuando el turno de chat que usó las manos termina, el proceso de manos suelta al instante los
 *    candados de su sesión (y el Halo se va con ellos) en vez de esperar los 15 s de vida del candado. El proceso no ve
 *    el turno: tras cada acción le pregunta al daemon cuántos turnos de su conversación ya terminaron
 *    (`POST /manos/turno`) cada segundo, solo mientras sus candados podrían seguir vivos. Sin conversación (la
 *    instalación de Daniel, donde `encargar` ya suelta al terminar cada encargo): no hace nada.
 *
 * 2. Matar huérfanos al arrancar. Cuando el daemon de la edición cliente arranca, todavía no hay ningún proceso de manos
 *    suyo: cualquier copia viva de SU binario de manos (ArbrainManos de la app en macOS, ManosWindows.exe de su caché en
 *    Windows) quedó de una vida anterior y puede seguir escuchando el teclado o capturando. Se termina. Solo el binario
 *    exacto de esta instalación: nunca la ArbrainManos de Daniel ni la de otra copia.
 */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Adaptador } from './contrato.js'
import { soltarManos } from './encargar.js'
import { rutaAppCasa } from './adaptadores/casa.js'

// ---------- 1. Soltar al terminar el turno ----------

export interface FuenteTurno { estado(conversacion: string): Promise<{ vivo: boolean; fin: number } | null> }

/** Daemon real: `POST /manos/turno` con el pase (solo lectura de un contador). */
export function turnoHttp(fetcher: typeof fetch = fetch): FuenteTurno {
  return {
    async estado(conversacion) {
      const puerto = process.env.MC_SERVER_PORT, token = process.env.ARBRAIN_PASE_AGENTE || process.env.OPENCLAW_GATEWAY_TOKEN
      if (!puerto || !token) return null
      try {
        const r = await fetcher(`http://127.0.0.1:${puerto}/manos/turno`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ conversacion }), signal: AbortSignal.timeout(2_000) })
        if (!r.ok) return null
        const j = await r.json() as { vivo?: unknown; fin?: unknown }
        return { vivo: j.vivo === true, fin: Number(j.fin) || 0 }
      } catch { return null }
    },
  }
}

/** Cuánto se vigila tras la última acción: lo que vive un candado (15 s) y un margen. */
const VIGILAR_MS = 20_000

/**
 * Vigía del turno en el proceso de manos. `actuo()` tras cada herramienta que toma una ventana; si el turno de la
 * conversación termina mientras los candados siguen vivos, `soltar` corre al instante.
 */
export class VigiaTurno {
  private base: number | null = null
  private ultima = 0
  private reloj: NodeJS.Timeout | null = null
  private consultando = false
  /** Veces que soltó por fin de turno (para pruebas y bitácora). */
  soltadas = 0

  constructor(private readonly adaptador: () => Adaptador | null, private readonly op: { conversacion?: () => string | null; fuente?: FuenteTurno; cadaMs?: number; vigilarMs?: number } = {}) {}

  private conversacion = () => (this.op.conversacion ?? (() => process.env.ARBRAIN_MANOS_CONVERSACION || null))()

  /** Una herramienta acaba de tomar (o pudo tomar) una ventana. */
  async actuo(): Promise<void> {
    const c = this.conversacion()
    if (!c) return
    this.ultima = Date.now()
    if (this.base === null) {
      const e = await (this.op.fuente ?? turnoHttp()).estado(c)
      if (!e) return
      this.base = e.fin
    }
    if (!this.reloj) {
      this.reloj = setInterval(() => { void this.tic(c) }, this.op.cadaMs ?? 1000)
      this.reloj.unref?.()
    }
  }

  private parar(): void { if (this.reloj) clearInterval(this.reloj); this.reloj = null; this.base = null }

  async tic(c: string): Promise<void> {
    if (this.consultando || this.base === null) return
    if (Date.now() - this.ultima > (this.op.vigilarMs ?? VIGILAR_MS)) { this.parar(); return } // los candados ya vencieron solos
    this.consultando = true
    try {
      const e = await (this.op.fuente ?? turnoHttp()).estado(c)
      if (e && this.base !== null && e.fin > this.base) {
        this.parar()
        const a = this.adaptador()
        if (a) { await soltarManos(a); this.soltadas++ }
      }
    } finally { this.consultando = false }
  }

  cerrar(): void { this.parar() }
}

// ---------- 2. Huérfanos al arrancar ----------

export interface Proceso { pid: number; comando: string }
export interface OpcionesHuerfanos {
  plataforma?: string
  /** Rutas exactas del binario de manos de ESTA instalación. */
  binarios?: string[]
  listar?: () => Promise<Proceso[]>
  matar?: (pid: number) => void
  yo?: number
}

/** El binario de manos de esta instalación (cliente): ArbrainManos de la app o ManosWindows.exe de su caché. */
export function binariosManos(plataforma: string = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (plataforma === 'darwin') return [join(rutaAppCasa(env), 'Contents', 'MacOS', 'ArbrainManos')]
  // Windows: el exe que trajo el instalador o cualquiera compilado en la caché de esta instalación (la carpeta, con su barra).
  if (plataforma === 'win32') return [env.MANOS_WINDOWS_EXE || '', `${env.MANOS_WINDOWS_CACHE || join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Arbrain', 'manos-windows')}\\`].filter(Boolean)
  return []
}

function listarProcesos(plataforma: string): Promise<Proceso[]> {
  return new Promise(ok => {
    if (plataforma === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process ManosWindows -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)`t$($_.Path)" }'], { windowsHide: true, timeout: 10_000 }, (_e, out) => ok(parsear(String(out ?? ''), '\t')))
      return
    }
    execFile('ps', ['-axo', 'pid=,command='], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => ok(parsear(String(out ?? ''), ' ')))
  })
}

function parsear(salida: string, sep: string): Proceso[] {
  const r: Proceso[] = []
  for (const linea of salida.split(/\r?\n/)) {
    const t = linea.trim()
    const i = t.indexOf(sep)
    if (i <= 0) continue
    const pid = Number(t.slice(0, i))
    if (Number.isInteger(pid) && pid > 0) r.push({ pid, comando: t.slice(i + 1).trim() })
  }
  return r
}

/**
 * Termina las copias del binario de manos de esta instalación que quedaron de una vida anterior del daemon. Devuelve
 * los pids terminados. Coincidencia por ruta exacta (o, en Windows, por la carpeta de la caché de esta instalación).
 */
export async function matarHuerfanos(op: OpcionesHuerfanos = {}): Promise<number[]> {
  const plataforma = op.plataforma ?? process.platform
  const binarios = (op.binarios ?? binariosManos(plataforma)).filter(b => b.length > 4)
  if (!binarios.length) return []
  const procesos = await (op.listar ?? (() => listarProcesos(plataforma)))().catch(() => [] as Proceso[])
  const yo = op.yo ?? process.pid
  const insensible = plataforma === 'win32'
  const norm = (s: string) => insensible ? s.toLowerCase() : s
  const muertos: number[] = []
  for (const p of procesos) {
    if (p.pid === yo) continue
    const cmd = norm(p.comando)
    // macOS: el comando empieza con la ruta exacta del ejecutable (y nada pegado a ella). Windows: ruta del exe o su caché.
    const es = binarios.some(b => { const x = norm(b); return insensible ? cmd.startsWith(x) : cmd === x || cmd.startsWith(`${x} `) })
    if (!es) continue
    try { (op.matar ?? (pid => process.kill(pid, 'SIGTERM')))(p.pid); muertos.push(p.pid) } catch { /* ya no existía */ }
  }
  return muertos
}

/** Para pruebas: suelta sin esperar a la vigía. */
export const _soltarParaPruebas = soltarManos
