import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ChatJournal } from './journal.js'
import { type CorredorRegistro, codeStamp, corredorEntry, workerConfirmedDead } from './corredor-registro.js'

export interface LanzadorOptions {
  /** Dónde escribe el corredor su bitácora (stdout y stderr). */
  logFile: string
  /** Directorio de trabajo del corredor: el del agent-server, para que resuelva sus rutas igual. */
  cwd: string
  cooldownMs?: number
  settleMs?: number
  launch?: (entry: string) => void
  isDead?: (workerId: string) => boolean
  clock?: () => number
  onLaunch?: (info: { entry: string; stamp: string }) => void
}

/**
 * Asegura un corredor vivo, que no se esté retirando y con el código actual, cuando hay
 * turnos en cola. Es la única forma en que el agent-server «ejecuta» un turno con el corredor
 * encendido: lo deja en el journal y se asegura de que alguien lo recoja.
 */
export class CorredorLanzador {
  private lastLaunch = 0
  constructor(private journal: ChatJournal, private registro: CorredorRegistro, private options: LanzadorOptions) {}

  ensure(): 'listo' | 'lanzado' | 'sin-cola' | 'esperando' {
    if (!this.journal.queued(1).length) return 'sin-cola'
    const now = (this.options.clock ?? Date.now)()
    const stamp = codeStamp()
    const vivos = this.registro.alive(this.options.isDead ?? workerConfirmedDead)
    const settled = !/^\d+$/.test(stamp) || now - Number(stamp) >= (this.options.settleMs ?? 10_000)
    // Mientras dist/ se reescribe, sirve cualquier corredor vivo; con el build asentado, solo el actual.
    if (vivos.some(r => !r.draining && (r.stamp === stamp || !settled))) return 'listo'
    if (!settled) return 'esperando'
    if (now - this.lastLaunch < (this.options.cooldownMs ?? 5_000)) return 'esperando'
    this.lastLaunch = now
    const entry = corredorEntry()
    ;(this.options.launch ?? (file => this.spawnDetached(file)))(entry)
    this.options.onLaunch?.({ entry, stamp })
    return 'lanzado'
  }

  /** Sesión propia (setsid): el kill del grupo de procesos del job de launchd no lo alcanza. */
  private spawnDetached(entry: string): void {
    mkdirSync(dirname(this.options.logFile), { recursive: true })
    const out = openSync(this.options.logFile, 'a')
    try {
      const child = spawn(process.execPath, [...process.execArgv, entry], {
        cwd: this.options.cwd, detached: true, stdio: ['ignore', out, out],
        env: { ...process.env, ARBRAIN_CORREDOR_PARENT: String(process.pid) },
      })
      child.on('error', () => { /* el siguiente pulso vuelve a intentarlo tras el enfriamiento */ })
      child.unref()
    } finally { closeSync(out) }
  }
}

export function defaultCorredorLog(agentServerDir: string): string {
  return join(agentServerDir, 'logs', 'corredor.log')
}
