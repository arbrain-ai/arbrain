/**
 * Red team 4 M4-3: la web saluda al motor con el token de la apertura; sin token, el saludo de siempre. Si el binario
 * del motor ya está construido (`arbrain/motor/target/debug/arbrain-motor`), además se prueba en vivo en una carpeta
 * aislada de /tmp: sin token no entra, con el token sí. Nunca toca el motor de Daniel.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { saludo } from '../../src/lib/motor-saludo'

test('saludo: token solo si la app lo dio', () => {
  assert.deepEqual(saludo('arbrain-web', undefined), { op: 'hello', proto: 1, client: 'arbrain-web' })
  assert.deepEqual(saludo('arbrain-web', ''), { op: 'hello', proto: 1, client: 'arbrain-web' })
  assert.deepEqual(saludo('arbrain-web', 'abc'), { op: 'hello', proto: 1, client: 'arbrain-web', token: 'abc' })
})

const BIN = join(__dirname, '..', '..', 'motor', 'target', 'debug', 'arbrain-motor')
const SRC = join(__dirname, '..', '..', 'motor', 'src')
/** Solo se prueba en vivo con un binario construido DESPUÉS del código actual: uno viejo (sin token) se quedaría esperando. */
function binarioAlDia(): boolean {
  if (!existsSync(BIN)) return false
  const bin = statSync(BIN).mtimeMs
  try { return readdirSync(SRC).every(f => statSync(join(SRC, f)).mtimeMs <= bin) } catch { return false }
}

function pedirHello(sock: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return new Promise(ok => {
    const s = connect(sock)
    let buf = Buffer.alloc(0)
    const fin = (v: Record<string, unknown> | null) => { s.destroy(); ok(v) }
    s.on('error', () => fin(null))
    s.on('close', () => fin(null))
    s.on('data', d => {
      buf = Buffer.concat([buf, d])
      if (buf.length < 9) return
      const len = buf.readUInt32LE(5)
      if (buf.length < 9 + len) return
      fin(JSON.parse(buf.subarray(9, 9 + len).toString('utf8')))
    })
    s.on('connect', () => {
      const p = Buffer.from(JSON.stringify(cuerpo)), h = Buffer.alloc(9)
      h.writeUInt8(1, 0); h.writeUInt32LE(1, 1); h.writeUInt32LE(p.length, 5)
      s.write(Buffer.concat([h, p]))
    })
    setTimeout(() => fin(null), 5000).unref()
  })
}

test('motor real con token: sin token no entra, con el de la apertura sí', { skip: process.platform === 'win32' || !binarioAlDia(), timeout: 30_000 }, async () => {
  const dir = mkdtempSync('/tmp/arbrain-web-motor-')
  const sock = join(dir, 'arbrain-0a0a0a', 'motor.sock')
  const token = 'ab'.repeat(32)
  const motor: ChildProcess = spawn(BIN, [], { env: { PATH: process.env.PATH ?? '', HOME: dir, ARBRAIN_MOTOR_SOCK: sock, ARBRAIN_MOTOR_SECRETOS: 'stdin' } as unknown as NodeJS.ProcessEnv, stdio: ['pipe', 'ignore', 'ignore'] })
  motor.stdin!.write(JSON.stringify({ ARBRAIN_MOTOR_TOKEN: token }) + '\n')
  try {
    for (let i = 0; i < 100 && !existsSync(sock); i++) await new Promise(r => setTimeout(r, 50))
    assert.equal(statSync(sock).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, 'arbrain-0a0a0a')).mode & 0o777, 0o700)
    const sin = await pedirHello(sock, saludo('intruso', undefined))
    assert.notEqual(sin?.res, 'hello')
    const otro = await pedirHello(sock, saludo('intruso', 'cd'.repeat(32)))
    assert.notEqual(otro?.res, 'hello')
    const bien = await pedirHello(sock, saludo('arbrain-web', token))
    assert.equal(bien?.res, 'hello')
    assert.equal(bien?.auth, true)
  } finally {
    // El vigía: soltar su stdin lo apaga (mata sus terminales y sale).
    motor.stdin!.end()
    await new Promise(r => {
      if (motor.exitCode !== null) return r(null)
      const t = setTimeout(() => { motor.kill('SIGKILL'); r(null) }, 5000)
      motor.once('exit', () => { clearTimeout(t); r(null) })
    })
    rmSync(dir, { recursive: true, force: true })
  }
})
