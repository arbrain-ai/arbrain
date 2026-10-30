/**
 * Cliente del motor de Arbrain (arbrain/motor): el dueño de las PTYs inmortales.
 *
 * Mismo cable que `sfterm-ptyd` PROTO 1 ([u8 kind][u32 id LE][u32 len LE][payload]),
 * más las operaciones aditivas del motor: `info` (terminales + proceso en primer
 * plano) y `screen` (pantalla del emulador VT sin cabeza). Sin gate de archivos y
 * sin que SFTerm tenga que estar abierto.
 *
 * Una conexión persistente por proceso; si el motor se reinicia (relevo o apagón)
 * se reconecta sola en la siguiente llamada. Una desconexión no se interpreta como
 * muerte de ninguna terminal: eso lo dice el motor con `list`.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN } from '../edicion.js'
import { connect, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KIND_CTL = 1
const KIND_DATA = 2

export const motorSock = () => process.env.ARBRAIN_MOTOR_SOCK || join(DIR_ARBRAIN(), 'motor.sock')

export interface ProcInfo { pid: number; name: string; argv: string[]; cwd: string | null; start_s: number; config_dir: string | null }
export interface TermDetail { id: number; pid: number; cwd: string; cols: number; rows: number; born_ms: number; origin: 'motor' | 'sfterm-ptyd'; readonly: boolean; fg: ProcInfo | null }
export interface MotorInfo { pid: number; sock: string; started_ms: number; relevos: number; legacy: string | null; legacy_connected: boolean; legacy_readonly: boolean }
type Res = { res: string; msg?: string; [k: string]: unknown }

export function frame(kind: number, id: number, payload: Buffer): Buffer {
  const h = Buffer.alloc(9)
  h.writeUInt8(kind, 0); h.writeUInt32LE(id, 1); h.writeUInt32LE(payload.length, 5)
  return Buffer.concat([h, payload])
}

/** Parte un stream en marcos completos; devuelve el resto sin consumir. */
export function parseFrames(buf: Buffer): { frames: { kind: number; id: number; payload: Buffer }[]; rest: Buffer } {
  const frames = []
  let off = 0
  while (buf.length - off >= 9) {
    const len = buf.readUInt32LE(off + 5)
    if (buf.length - off - 9 < len) break
    frames.push({ kind: buf.readUInt8(off), id: buf.readUInt32LE(off + 1), payload: buf.subarray(off + 9, off + 9 + len) })
    off += 9 + len
  }
  return { frames, rest: buf.subarray(off) }
}

export class MotorError extends Error {}

class Conexion {
  private sock: Socket | null = null
  private ready: Promise<{ pid: number }> | null = null
  private next = 1
  private buf: Buffer = Buffer.alloc(0)
  private pending = new Map<number, { resolve: (r: Res) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

  constructor(private path: string) {}

  private abrir(): Promise<{ pid: number }> {
    return new Promise((resolve, reject) => {
      const s = connect(this.path)
      const fallo = (e: Error) => { this.cerrar(e); reject(new MotorError(`motor no disponible en ${this.path}: ${e.message}`)) }
      s.once('error', fallo)
      s.on('data', d => this.recibir(d))
      s.on('close', () => this.cerrar(new MotorError('el motor cerró la conexión')))
      s.once('connect', () => {
        s.off('error', fallo)
        s.on('error', () => { /* 'close' limpia */ })
        this.sock = s
        this.enviar({ op: 'hello', proto: 1, client: 'arbrain-agent-server' }).then(r => {
          if (r.res !== 'hello') return reject(new MotorError(r.msg ?? 'saludo rechazado'))
          resolve({ pid: Number(r.pid) })
        }, reject)
      })
    })
  }

  private cerrar(e: Error) {
    this.sock?.destroy(); this.sock = null; this.ready = null; this.buf = Buffer.alloc(0) as Buffer
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(e) }
    this.pending.clear()
  }

  private recibir(d: Buffer) {
    const { frames, rest } = parseFrames(Buffer.concat([this.buf, d]))
    this.buf = rest
    for (const f of frames) {
      if (f.kind !== KIND_CTL || f.id === 0) continue // DATA (no nos enganchamos) y eventos
      const p = this.pending.get(f.id); if (!p) continue
      this.pending.delete(f.id); clearTimeout(p.timer)
      try { p.resolve(JSON.parse(f.payload.toString('utf8'))) } catch (e) { p.reject(e as Error) }
    }
  }

  private enviar(req: Record<string, unknown>, timeout = 5000): Promise<Res> {
    const s = this.sock
    if (!s) return Promise.reject(new MotorError('sin conexión con el motor'))
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new MotorError(`el motor no respondió a ${req.op}`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      s.write(frame(KIND_CTL, id, Buffer.from(JSON.stringify(req))))
    })
  }

  async call(req: Record<string, unknown>, timeout?: number): Promise<Res> {
    if (!this.ready) this.ready = this.abrir()
    await this.ready
    const r = await this.enviar(req, timeout)
    if (r.res === 'err') throw new MotorError(String(r.msg ?? 'error del motor'))
    return r
  }
}

let conexion: Conexion | null = null
let conexionPath = ''
function con(): Conexion {
  const p = motorSock()
  if (!conexion || conexionPath !== p) { conexion = new Conexion(p); conexionPath = p }
  return conexion
}

export const motor = {
  async info(): Promise<{ motor: MotorInfo; terms: TermDetail[] }> {
    const r = await con().call({ op: 'info' }, 8000)
    return { motor: r.motor as MotorInfo, terms: r.terms as TermDetail[] }
  },
  async screen(id: number, lines = 40): Promise<string> {
    return String((await con().call({ op: 'screen', id, lines })).text ?? '')
  },
  async spawn(p: { cwd: string; command: string; cols?: number; rows?: number }): Promise<{ id: number; pid: number }> {
    const r = await con().call({ op: 'spawn', cwd: p.cwd, cols: p.cols ?? 120, rows: p.rows ?? 36, scrollback: null, shell_integration: true, colorfgbg: '15;0', command: p.command }, 10_000)
    return { id: Number(r.id), pid: Number(r.pid) }
  },
  async write(id: number, data: string): Promise<void> { await con().call({ op: 'write', id, data }) },
  /**
   * Cerrar una terminal. Candado (1 oct 2026): solo cierra sola las que nacieron en el motor
   * (las lanzó Levy con `delegar`). Una adoptada de SFTerm es de Daniel: exige `autoriza`, la
   * cita de Daniel que la nombra, y queda en el log del motor. Ese día Levy cerró t5–t13 con un
   * script que llamaba esto directo, rodeando el candado de `cerrar`; ya no hay esa puerta.
   */
  async kill(id: number, opts: { autoriza?: string } = {}): Promise<void> {
    const autoriza = opts.autoriza?.trim()
    if (!autoriza) {
      const t = (await con().call({ op: 'info' }, 8000)).terms as TermDetail[] | undefined
      const term = t?.find(x => x.id === id)
      if (term && term.origin !== 'motor') {
        throw new MotorError(`La terminal ${id} es de SFTerm, no la lanzó Levy. Solo se cierra si ${DUENO} la nombró: pasa su cita en «autoriza».`)
      }
    }
    await con().call({ op: 'kill', id, ...(autoriza ? { autoriza: autoriza.slice(0, 300) } : {}) })
  },
}
