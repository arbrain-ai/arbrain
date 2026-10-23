// Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1). Lo puro del supervisor
// (scripts/servidor/telefono.mjs), las órdenes contra un `tailscale` falso que anota sus argumentos, y lo puro de la web
// (Host permitido, cookie Secure, código de entrada, QR).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  apagar, binarioTailscale, codigoNuevo, crearCodigos, encender, entornoWeb, estado, fallaServe, guardarEstado, hostValido,
  interpretarStatus, leerEstado, manejadoresServe, normalizarCodigo, puertoLibreHttps, puertoNuestro, urlTelefono, atenderControl,
} from '../../scripts/servidor/telefono.mjs'
import { esHostTelefono, hostTelefono, llegaPorTelefono } from '../../src/features/telefono/host-telefono'
import { pareceCodigo } from '../../src/features/telefono/codigo'
import { codigoQR } from '../../src/features/telefono/qr'
import { cookieSesion } from '../../src/lib/modo-servidor'

const FALSO = join(import.meta.dirname, '..', '..', 'scripts', 'servidor', 'tailscale-falso.mjs')
const HOST = 'maquina.ejemplo.ts.net'

function entorno(over: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tel-'))
  const config = join(dir, 'config')
  mkdirSync(config)
  const env = { ARBRAIN_TAILSCALE: FALSO, ARBRAIN_TAILSCALE_FALSO_DIR: join(dir, 'ts'), ...over }
  // El falso hereda process.env: cada prueba deja solo sus variables.
  for (const k of ['ARBRAIN_TAILSCALE_FALSO_ESTADO', 'ARBRAIN_TAILSCALE_FALSO_HTTPS', 'ARBRAIN_TAILSCALE_FALSO_HOST']) delete process.env[k]
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  const bin = binarioTailscale({ env })!
  const registro = () => { try { return readFileSync(join(dir, 'ts', 'registro.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).args as string[]) } catch { return [] } }
  return { R: { config }, bin, registro, dir }
}

test('host *.ts.net: solo nombres MagicDNS válidos', () => {
  assert.ok(hostValido(HOST))
  for (const malo of ['ts.net', 'evil.com', 'a.ejemplo.ts.net.evil.com', 'A.ejemplo.ts.net', 'x..ejemplo.ts.net', '-a.ejemplo.ts.net', 'a b.ejemplo.ts.net', '127.0.0.1']) assert.equal(hostValido(malo), false, malo)
  assert.equal(urlTelefono(HOST, 443), `https://${HOST}`)
  assert.equal(urlTelefono(HOST, 8443), `https://${HOST}:8443`)
})

test('status de Tailscale: conectado, sin sesión, desconectado, sin MagicDNS', () => {
  assert.deepEqual(interpretarStatus({ BackendState: 'Running', Self: { DNSName: `${HOST}.`, CapMap: { https: null } }, CertDomains: [HOST], CurrentTailnet: { Name: 'x' } }), { estado: 'listo', host: HOST, https: true, cuenta: 'x' })
  assert.equal(interpretarStatus({ BackendState: 'Running', Self: { DNSName: `${HOST}.` }, CertDomains: null }).https, false)
  assert.deepEqual(interpretarStatus({ BackendState: 'NeedsLogin', AuthURL: 'https://login.tailscale.com/a/abc' }), { estado: 'falta-sesion', enlace: 'https://login.tailscale.com/a/abc' })
  assert.equal(interpretarStatus({ BackendState: 'NeedsLogin', AuthURL: 'https://evil.com/a' }).enlace, null)
  assert.equal(interpretarStatus({ BackendState: 'NoState' }).estado, 'falta-sesion')
  assert.equal(interpretarStatus({ BackendState: 'Stopped' }).estado, 'apagado')
  assert.equal(interpretarStatus({ BackendState: 'Running', Self: { DNSName: 'maquina.' } }).estado, 'sin-magicdns')
  assert.equal(interpretarStatus('no es json').estado, 'ilegible')
})

test('serve: reconoce lo nuestro y no pisa lo que la persona ya publica', () => {
  const sc = { Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:8123' } } }, [`${HOST}:8443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:4310' } } }, 'otra.ejemplo.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4310' } } } } }
  const m = manejadoresServe(JSON.stringify(sc), HOST)!
  assert.equal(m.length, 2)
  assert.equal(puertoNuestro(m, 4310), 8443)
  assert.equal(puertoNuestro(m, 9999), null)
  assert.equal(puertoLibreHttps(m), 10000)
  assert.equal(puertoLibreHttps([]), 443)
})

test('fallas de serve: enlace para activar HTTPS, permiso de Linux, error', () => {
  assert.deepEqual(fallaServe('Serve is not enabled.\nTo enable, visit:\n  https://login.tailscale.com/f/serve?node=x\n'), { estado: 'falta-https', enlace: 'https://login.tailscale.com/f/serve?node=x' })
  assert.equal(fallaServe("Access denied: serve config denied\nUse 'sudo tailscale serve'").estado, 'falta-permiso')
  assert.equal(fallaServe('boom').estado, 'error')
})

test('códigos de entrada: forma, un solo uso, vencen a los 10 minutos, máximo 3 vivos', () => {
  const c = codigoNuevo()
  assert.match(c, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/)
  assert.ok(pareceCodigo(c) && pareceCodigo(c.toUpperCase().replace('-', ' ')))
  assert.equal(pareceCodigo('abcd-efgh-ijkl'), false)
  assert.equal(normalizarCodigo(' ABCD EFGH '), 'abcd-efgh')
  let t = 0
  const cods = crearCodigos(() => t)
  const a = cods.nuevo().codigo
  assert.equal(cods.canjear(a.toUpperCase()), true)
  assert.equal(cods.canjear(a), false, 'un solo uso')
  const b = cods.nuevo().codigo
  t += 10 * 60_000 + 1
  assert.equal(cods.canjear(b), false, 'vencido')
  const viejos = [cods.nuevo().codigo, cods.nuevo().codigo, cods.nuevo().codigo, cods.nuevo().codigo]
  assert.equal(cods.cuantos, 3)
  assert.equal(cods.canjear(viejos[0]), false, 'el más viejo se descarta')
  assert.equal(cods.canjear(viejos[3]), true)
})

test('binario: el explícito (.mjs con este Node), el del PATH o los lugares conocidos por sistema', () => {
  const b = binarioTailscale({ env: { ARBRAIN_TAILSCALE: '/x/falso.mjs', ARBRAIN_TAILSCALE_SOCKET: '/tmp/ts.sock' }, existe: () => true, node: '/n/node' })
  assert.deepEqual(b, { cmd: '/n/node', pre: ['/x/falso.mjs', '--socket=/tmp/ts.sock'] })
  assert.equal(binarioTailscale({ env: { PATH: '/a:/b' }, plataforma: 'linux', existe: (p: string) => p === '/b/tailscale' })?.cmd, '/b/tailscale')
  assert.equal(binarioTailscale({ env: { PATH: '' }, plataforma: 'darwin', existe: (p: string) => p.startsWith('/Applications/') })?.cmd, '/Applications/Tailscale.app/Contents/MacOS/Tailscale')
  assert.match(binarioTailscale({ env: { Path: '', ProgramFiles: 'C:\\PF' }, plataforma: 'win32', existe: (p: string) => /tailscale\.exe$/.test(p) })?.cmd ?? '', /PF.Tailscale.tailscale\.exe$/)
  assert.equal(binarioTailscale({ env: { PATH: '' }, plataforma: 'linux', existe: () => false }), null)
})

test('encender → publica solo con serve (nunca funnel), guarda el estado y la web recibe el Host', async () => {
  const { R, bin, registro } = entorno()
  assert.deepEqual(entornoWeb(R), {})
  const r = await encender({ R, puertoWeb: 4310, bin })
  assert.equal(r.estado, 'encendido')
  assert.equal(r.url, `https://${HOST}`)
  assert.deepEqual(entornoWeb(R), { ARBRAIN_TELEFONO_HOST: HOST, ARBRAIN_TELEFONO_PUERTO: '443' })
  const llamadas = registro()
  assert.ok(llamadas.some((a) => a.join(' ') === 'serve --bg --yes --https=443 http://127.0.0.1:4310'), JSON.stringify(llamadas))
  assert.ok(!llamadas.some((a) => a.includes('funnel')))
  assert.equal((await estado({ R, puertoWeb: 4310, bin })).estado, 'encendido')
  // Otra vez: idempotente, no vuelve a publicar.
  const antes = registro().filter((a) => a[0] === 'serve' && a[1] === '--bg').length
  assert.equal((await encender({ R, puertoWeb: 4310, bin })).estado, 'encendido')
  assert.equal(registro().filter((a) => a[0] === 'serve' && a[1] === '--bg').length, antes)
  // Apagar quita solo lo nuestro y la web deja de aceptar el Host.
  assert.equal((await apagar({ R, puertoWeb: 4310, bin })).estado, 'apagado')
  assert.ok(registro().some((a) => a.join(' ') === 'serve --yes --https=443 off'))
  assert.deepEqual(entornoWeb(R), {})
  assert.equal(leerEstado(R).encendido, false)
  assert.equal((await estado({ R, puertoWeb: 4310, bin })).estado, 'apagado')
})

test('encender no pisa una publicación ajena en 443: usa 8443 y al apagar la deja', async () => {
  const { R, bin, dir } = entorno()
  mkdirSync(join(dir, 'ts'), { recursive: true })
  writeFileSync(join(dir, 'ts', 'serve.json'), JSON.stringify({ Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:8123' } } } } }))
  const r = await encender({ R, puertoWeb: 4310, bin })
  assert.equal(r.url, `https://${HOST}:8443`)
  await apagar({ R, puertoWeb: 4310, bin })
  const sc = JSON.parse(readFileSync(join(dir, 'ts', 'serve.json'), 'utf8'))
  assert.equal(sc.Web[`${HOST}:443`].Handlers['/'].Proxy, 'http://127.0.0.1:8123')
  assert.equal(sc.Web[`${HOST}:8443`], undefined)
})

test('sin sesión de Tailscale: da el enlace para iniciarla y no publica nada', async () => {
  const { R, bin, registro } = entorno({ ARBRAIN_TAILSCALE_FALSO_ESTADO: 'NeedsLogin' })
  const r = await encender({ R, puertoWeb: 4310, bin })
  assert.equal(r.estado, 'falta-sesion')
  assert.match(r.enlace ?? '', /^https:\/\/login\.tailscale\.com\/a\//)
  assert.ok(!registro().some((a) => a[0] === 'serve' && a[1] === '--bg'))
  assert.deepEqual(entornoWeb(R), {})
})

test('red sin HTTPS: devuelve el enlace para activarlo sin quedarse esperando', async () => {
  const { R, bin } = entorno({ ARBRAIN_TAILSCALE_FALSO_HTTPS: '0' })
  const t0 = Date.now()
  const r = await encender({ R, puertoWeb: 4310, bin })
  assert.equal(r.estado, 'falta-https')
  assert.match(r.enlace ?? '', /^https:\/\/login\.tailscale\.com\/f\/serve/)
  assert.ok(Date.now() - t0 < 15_000)
  assert.equal(leerEstado(R).encendido, false)
})

test('sin Tailscale instalado', async () => {
  const { R } = entorno()
  assert.equal((await encender({ R, puertoWeb: 4310, bin: null })).estado, 'falta-tailscale')
  assert.equal((await estado({ R, puertoWeb: 4310, bin: null })).estado, 'falta-tailscale')
})

test('control del supervisor: encender relanza la web; el canje de código es solo de la web', async () => {
  const { R, bin } = entorno()
  let reinicios = 0
  const ctx = { R, puertoWeb: () => 4310, reiniciarWeb: async () => { reinicios++ }, registrar: () => {}, codigos: crearCodigos(), bin }
  const [s, j] = (await atenderControl({ metodo: 'POST', ruta: '/telefono/encender', cuerpo: {}, esWeb: false, esCli: true }, ctx))!
  assert.equal(s, 200); assert.equal(j.estado, 'encendido'); assert.equal(j.reiniciaWeb, true)
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(reinicios, 1)
  const [, c] = (await atenderControl({ metodo: 'POST', ruta: '/telefono/codigo', cuerpo: {}, esWeb: true, esCli: false }, ctx))!
  assert.equal(await atenderControl({ metodo: 'POST', ruta: '/telefono/codigo/canjear', cuerpo: { codigo: c.codigo }, esWeb: false, esCli: true }, ctx), null)
  assert.deepEqual((await atenderControl({ metodo: 'POST', ruta: '/telefono/codigo/canjear', cuerpo: { codigo: c.codigo }, esWeb: true, esCli: false }, ctx))![1], { ok: true })
  assert.equal(await atenderControl({ metodo: 'GET', ruta: '/telefono/otra', cuerpo: {}, esWeb: true, esCli: false }, ctx), null)
})

test('estado guardado: lo ilegible o ajeno cuenta como apagado', () => {
  const { R } = entorno()
  guardarEstado(R, { encendido: true, host: 'evil.com', puertoHttps: 443 })
  assert.deepEqual(entornoWeb(R), {})
  guardarEstado(R, { encendido: true, host: HOST, puertoHttps: 22 })
  assert.deepEqual(entornoWeb(R), {})
  writeFileSync(join(R.config, 'telefono.json'), '{roto')
  assert.equal(leerEstado(R).encendido, false)
})

// ── Web ────────────────────────────────────────────────────────────────────────────────────────────────────────

const ENV_ON = { ARBRAIN_EDICION: 'cliente', ARBRAIN_MODO_SERVIDOR: '1', ARBRAIN_TELEFONO_HOST: HOST, ARBRAIN_TELEFONO_PUERTO: '443' }

test('web: el Host del teléfono vale solo encendido, en modo servidor de la edición cliente y por HTTPS', () => {
  assert.equal(hostTelefono(ENV_ON), HOST)
  assert.ok(esHostTelefono(HOST, ENV_ON))
  assert.ok(esHostTelefono(`${HOST}:443`, ENV_ON))
  assert.ok(esHostTelefono(HOST.toUpperCase(), ENV_ON))
  assert.equal(esHostTelefono(`${HOST}:8443`, ENV_ON), false)
  assert.ok(esHostTelefono(`${HOST}:8443`, { ...ENV_ON, ARBRAIN_TELEFONO_PUERTO: '8443' }))
  assert.equal(esHostTelefono('otra.ejemplo.ts.net', ENV_ON), false)
  assert.ok(llegaPorTelefono(HOST, 'https', ENV_ON))
  assert.equal(llegaPorTelefono(HOST, 'http', ENV_ON), false, 'en claro no')
  assert.equal(llegaPorTelefono(HOST, null, ENV_ON), false)
  assert.equal(llegaPorTelefono(HOST, 'https', { ...ENV_ON, ARBRAIN_TELEFONO_HOST: '' }), false, 'apagado')
  assert.equal(llegaPorTelefono(HOST, 'https', { ...ENV_ON, ARBRAIN_MODO_SERVIDOR: '' }), false, 'fuera del modo servidor')
  assert.equal(llegaPorTelefono(HOST, 'https', { ...ENV_ON, ARBRAIN_TELEFONO_HOST: 'evil.com' }), false)
})

test('web: la cookie lleva Secure solo por el teléfono', () => {
  assert.doesNotMatch(cookieSesion('c', 'v'), /Secure/)
  assert.match(cookieSesion('c', 'v', true), /; Secure$/)
  assert.match(cookieSesion('c', 'v', true), /HttpOnly; SameSite=Strict/)
})

test('QR: tamaño por versión y los tres patrones de posición', () => {
  const m = codigoQR(`https://${HOST}`)
  assert.equal(m.length, 29) // versión 3
  for (const [x, y] of [[0, 0], [m.length - 7, 0], [0, m.length - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(m[y]![x + i]); assert.ok(m[y + 6]![x + i]); assert.ok(m[y + i]![x]); assert.ok(m[y + 3]![x + 3]) }
  }
  assert.equal(codigoQR('https://' + 'a'.repeat(150) + '.ts.net').length, 53)
  assert.throws(() => codigoQR('x'.repeat(400)))
})
