// Computer use (seguridad, 10 oct 2026; AUDITORIA I7): apagado por defecto en la edición cliente, con interruptor.
// Instalación original: el archivo que lee el servidor de manos (arbrain/server/src/manos/politica.ts).
// Edición cliente (contrato v3 §6.2, red team M1): la fuente es el daemon; la web nunca escribe el archivo.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estadoDe, estadoDesdeDaemon, fijarComputerUse, fijarComputerUseCliente, leerComputerUse, leerComputerUseCliente, type PedirAlDaemon } from '../../src/features/permisos/lib/computer-use'

const previo = { e: process.env.ARBRAIN_EDICION, d: process.env.ARBRAIN_CONFIG_DIR }
afterEach(() => {
  if (previo.e === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo.e
  if (previo.d === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo.d
})

test('regla: lo decidido manda; sin decisión, apagado en cliente y encendido en la instalación de Daniel', () => {
  assert.deepEqual(estadoDe(null, true), { edicion: 'cliente', encendido: false, decidido: false })
  assert.deepEqual(estadoDe(null, false), { edicion: 'estandar', encendido: true, decidido: false })
  assert.equal(estadoDe({ encendido: true }, true).encendido, true)
  assert.equal(estadoDe({ encendido: false }, false).encendido, false)
  assert.equal(estadoDe({ encendido: 'si' }, true).decidido, false)
})

test('instalación original: la decisión queda en un archivo 0600 que leen las manos', () => {
  process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cu-'))
  process.env.ARBRAIN_EDICION = 'original'
  const e = fijarComputerUse(false)
  assert.equal(e.encendido, false)
  assert.equal(e.decidido, true)
  const ruta = join(process.env.ARBRAIN_CONFIG_DIR, 'manos', 'computer-use.json')
  assert.equal(statSync(ruta).mode & 0o777, 0o600)
  assert.equal(JSON.parse(readFileSync(ruta, 'utf8')).encendido, false)
  assert.equal(leerComputerUse().encendido, false)
})

test('cliente: la web nunca escribe el archivo del interruptor (M1)', () => {
  process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cu-'))
  process.env.ARBRAIN_EDICION = 'cliente'
  assert.throws(() => fijarComputerUse(true), /daemon/)
  assert.throws(() => fijarComputerUse(false), /daemon/)
  assert.equal(existsSync(join(process.env.ARBRAIN_CONFIG_DIR, 'manos', 'computer-use.json')), false)
})

test('cliente: el estado viene del daemon; ilegible = apagado y sin decidir', () => {
  assert.deepEqual(estadoDesdeDaemon({ encendido: false, decision: null }), { edicion: 'cliente', encendido: false, decidido: false })
  assert.deepEqual(estadoDesdeDaemon({ encendido: true, decision: { encendido: true, decidido_en: '2026-10-11T18:00:00Z', por: 'app' } }),
    { edicion: 'cliente', encendido: true, decidido: true, decidido_en: '2026-10-11T18:00:00Z' })
  assert.deepEqual(estadoDesdeDaemon(null), { edicion: 'cliente', encendido: false, decidido: false })
  assert.equal(estadoDesdeDaemon({ encendido: 'true' as unknown as boolean, decision: null }).encendido, false)
})

/** Daemon falso que aplica la regla de §6.2: encender exige el secreto de confirmar; apagar no. */
function daemonFalso() {
  let estado = { encendido: false, decision: null as null | { encendido: boolean; decidido_en: string; por: string } }
  const llamadas: Array<{ ruta: string; metodo: string; confirmar: boolean; cuerpo: unknown }> = []
  const pedir: PedirAlDaemon = async (ruta, init = {}) => {
    const metodo = init.method ?? 'GET'
    const cuerpo = init.body ? JSON.parse(String(init.body)) : undefined
    llamadas.push({ ruta, metodo, confirmar: !!init.confirmar, cuerpo })
    if (ruta !== '/manos/interruptor') return Response.json({ error: 'no' }, { status: 404 })
    if (metodo === 'GET') return Response.json(estado)
    if (cuerpo.encendido && !init.confirmar) return Response.json({ error: 'Solo la persona, desde la app, puede encender computer use.' }, { status: 403 })
    estado = { encendido: cuerpo.encendido, decision: { encendido: cuerpo.encendido, decidido_en: new Date().toISOString(), por: 'app' } }
    return Response.json({ encendido: estado.encendido })
  }
  return { pedir, llamadas }
}

test('cliente: encender va al daemon con el secreto de confirmar; apagar, sin él', async () => {
  const d = daemonFalso()
  const inicial = await leerComputerUseCliente(d.pedir)
  assert.ok('estado' in inicial)
  assert.deepEqual(inicial.estado, { edicion: 'cliente', encendido: false, decidido: false })

  const on = await fijarComputerUseCliente(d.pedir, true)
  assert.ok('estado' in on)
  assert.equal(on.estado.encendido, true)
  assert.equal(on.estado.decidido, true)
  assert.deepEqual(d.llamadas[1], { ruta: '/manos/interruptor', metodo: 'POST', confirmar: true, cuerpo: { encendido: true } })

  const off = await fijarComputerUseCliente(d.pedir, false)
  assert.ok('estado' in off)
  assert.equal(off.estado.encendido, false)
  assert.equal(d.llamadas[3].confirmar, false, 'apagar no necesita el secreto (dirección segura)')
})

test('cliente: si el daemon niega o no responde, la web devuelve su error tal cual (no inventa un encendido)', async () => {
  const niega: PedirAlDaemon = async () => Response.json({ error: 'Solo la persona, desde la app, puede encender computer use.' }, { status: 403 })
  const r = await fijarComputerUseCliente(niega, true)
  assert.ok('error' in r)
  assert.equal(r.error.status, 403)
  const caido: PedirAlDaemon = async () => Response.json({ error: 'Tu Arbrain local no responde.', code: 'sin_daemon' }, { status: 502 })
  const l = await leerComputerUseCliente(caido)
  assert.ok('error' in l)
  assert.equal(l.error.status, 502)
})
