import 'server-only'
/**
 * Arbrain habla con su motor de terminales (panel-claridad, 1 oct 2026).
 *
 * El motor (`arbrain/motor`, launchd `com.arbrain.motor`) es el dueño de las PTYs
 * inmortales del Studio y habla el cable de `sfterm-ptyd` PROTO 1:
 * `[u8 kind][u32 id LE][u32 len LE][payload]`, CTL = JSON, DATA = bytes del PTY.
 * Aquí la web de Arbrain es UN CLIENTE MÁS, como SFTerm: se engancha a una terminal
 * (`attach`: replay + salida en vivo), escribe y ajusta el tamaño. No arranca, no
 * mata ni reinicia nada del motor. Solo funciona donde vive el socket (el Studio).
 */
import { connect, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { esEdicionCliente } from '@/lib/edicion'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'
import { saludo } from '@/lib/motor-saludo'

const KIND_CTL = 1
const KIND_DATA = 2
// Edición cliente: la ruta la pasa la app (`ARBRAIN_MOTOR_SOCK`); si falta, junto a su configuración, nunca la de Daniel.
export const motorSock = () => process.env.ARBRAIN_MOTOR_SOCK || (esEdicionCliente() ? join(dirConfigArbrain(), 'motor.sock') : join(homedir(), '.config/arbrain/motor.sock'))

type Res = { res?: string; evt?: string; msg?: string; [k: string]: unknown }
export class MotorError extends Error {}

function marco(kind: number, id: number, payload: Buffer): Buffer {
  const h = Buffer.alloc(9)
  h.writeUInt8(kind, 0); h.writeUInt32LE(id, 1); h.writeUInt32LE(payload.length, 5)
  return Buffer.concat([h, payload])
}

/** Una conexión al motor: peticiones CTL con respuesta, y un oyente para DATA y eventos. */
export class ConexionMotor {
  private sock: Socket | null = null
  private buf: Buffer = Buffer.alloc(0)
  private next = 1
  private pendientes = new Map<number, { ok: (r: Res) => void; mal: (e: Error) => void; timer: NodeJS.Timeout }>()
  onDatos: (term: number, bytes: Buffer) => void = () => {}
  onEvento: (e: Res) => void = () => {}
  onCierre: () => void = () => {}

  async abrir(cliente: string) {
    await new Promise<void>((resolve, reject) => {
      const s = connect(motorSock())
      s.once('error', e => reject(new MotorError(`El motor no responde: ${e.message}`)))
      s.once('connect', () => { this.sock = s; s.on('error', () => {}); resolve() })
      s.on('data', d => this.recibir(d))
      s.on('close', () => { this.sock = null; for (const p of this.pendientes.values()) { clearTimeout(p.timer); p.mal(new MotorError('El motor cerró la conexión.')) } this.pendientes.clear(); this.onCierre() })
    })
    // Red team 4 M4-3: en cliente el motor exige el token de esta apertura (la app se lo da a la web por stdin).
    const r = await this.pedir(saludo(cliente))
    if (r.res !== 'hello') throw new MotorError(r.msg ?? 'El motor rechazó el saludo.')
  }

  private recibir(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d])
    let off = 0
    while (this.buf.length - off >= 9) {
      const len = this.buf.readUInt32LE(off + 5)
      if (this.buf.length - off - 9 < len) break
      const kind = this.buf.readUInt8(off), id = this.buf.readUInt32LE(off + 1), payload = this.buf.subarray(off + 9, off + 9 + len)
      off += 9 + len
      if (kind === KIND_DATA) { this.onDatos(id, Buffer.from(payload)); continue }
      let msg: Res
      try { msg = JSON.parse(payload.toString('utf8')) } catch { continue }
      if (id === 0) { this.onEvento(msg); continue }
      const p = this.pendientes.get(id); if (!p) continue
      this.pendientes.delete(id); clearTimeout(p.timer); p.ok(msg)
    }
    this.buf = this.buf.subarray(off)
  }

  pedir(req: Record<string, unknown>, plazo = 5000): Promise<Res> {
    const s = this.sock
    if (!s) return Promise.reject(new MotorError('Sin conexión con el motor.'))
    const id = this.next++
    return new Promise((ok, mal) => {
      const timer = setTimeout(() => { this.pendientes.delete(id); mal(new MotorError(`El motor no respondió a ${req.op}.`)) }, plazo)
      this.pendientes.set(id, { ok, mal, timer })
      s.write(marco(KIND_CTL, id, Buffer.from(JSON.stringify(req))))
    })
  }

  async op(req: Record<string, unknown>, plazo?: number): Promise<Res> {
    const r = await this.pedir(req, plazo)
    if (r.res === 'err') throw new MotorError(String(r.msg ?? 'Error del motor.'))
    return r
  }

  cerrar() { this.sock?.destroy(); this.sock = null }
}

/** Una petición suelta (escribir, cambiar tamaño): abre, pide y cierra. */
export async function unaVez(req: Record<string, unknown>): Promise<Res> {
  const c = new ConexionMotor()
  try { await c.abrir('arbrain-web'); return await c.op(req) } finally { c.cerrar() }
}
