import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, type ClientRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const VIGIA = resolve(__dirname, '../scripts/system/arbrain-web-vigia.mjs')
// El vigilante es del Studio de la instalación original; la copia del alumno no lo trae y estas pruebas no aplican.
const HAY_VIGIA = existsSync(VIGIA)
const { decidir, diagnosticar, etimeASegundos, resumirPedidos, deployEnCurso } = HAY_VIGIA ? await import(VIGIA) : ({} as Record<string, any>)
const cfg = { umbral: 2, maxReiniciosHora: 3, graciaS: 90 }
const sano = { status: 200, cuerpo: { ok: true, destino: 'local', etapas: { url: { ok: true }, supabase: { ok: true }, daemon: { ok: true } } } }

describe.skipIf(!HAY_VIGIA)('juicio del vigilante', () => {
  it('diagnostica el web, no al daemon', () => {
    expect(diagnosticar(sano, true)).toBeNull()
    expect(diagnosticar({ error: 'TIMEOUT' }, false)).toMatch(/colgado/)
    expect(diagnosticar({ status: 503, cuerpo: { ok: false, etapas: { url: { ok: false } } } }, false)).toMatch(/URL del daemon/)
    const daemonCaido = { status: 200, cuerpo: { ...sano.cuerpo, etapas: { ...sano.cuerpo.etapas, daemon: { ok: false } } } }
    expect(diagnosticar(daemonCaido, false)).toBeNull() // el daemon está caído de verdad: reiniciar el web no sirve
    expect(diagnosticar(daemonCaido, true)).toMatch(/no alcanza al daemon/) // el daemon contesta directo: el web está atorado
  })

  it('reinicia a la segunda sonda enferma, no a la primera', () => {
    const a = decidir({ racha: 0 }, { enfermo: true, uptimeS: 600, ahora: 1_000_000 }, cfg)
    expect(a.accion).toBe('contar')
    const b = decidir(a.estado, { enfermo: true, uptimeS: 660, ahora: 1_060_000 }, cfg)
    expect(b.accion).toBe('reiniciar')
    expect(b.estado.racha).toBe(0)
    expect(b.estado.reinicios).toEqual([1_060_000])
  })

  it('no juzga a un proceso recién arrancado (deploy o KeepAlive)', () => {
    expect(decidir({ racha: 1 }, { enfermo: true, uptimeS: 20, ahora: 1 }, cfg).accion).toBe('nada')
  })

  it('freno anti-bucle: pasado el tope por hora solo avisa, y una vez por hora', () => {
    const ahora = 10 * 3_600_000
    const prev = { racha: 1, reinicios: [ahora - 50 * 60_000, ahora - 30 * 60_000, ahora - 10 * 60_000] }
    const t = decidir(prev, { enfermo: true, uptimeS: 600, ahora }, cfg)
    expect(t.accion).toBe('tope')
    expect(decidir(t.estado, { enfermo: true, uptimeS: 660, ahora: ahora + 60_000 }, cfg).accion).toBe('contar')
    // Una hora después los reinicios viejos salen de la ventana y vuelve a poder reiniciar.
    const luego = decidir({ ...t.estado, racha: 1 }, { enfermo: true, uptimeS: 600, ahora: ahora + 61 * 60_000 }, cfg)
    expect(luego.accion).toBe('reiniciar')
  })

  it('sano limpia la racha', () => {
    expect(decidir({ racha: 1, desde: 5 }, { enfermo: false, uptimeS: null, ahora: 9 }, cfg).estado).toMatchObject({ racha: 0, desde: null })
  })

  it('utilidades', () => {
    expect(etimeASegundos('01:05')).toBe(65)
    expect(etimeASegundos('2-03:00:01')).toBe(2 * 86400 + 3 * 3600 + 1)
    expect(resumirPedidos([{ ruta: '/a' }, { ruta: '/b' }, { ruta: '/a' }])).toBe('/a ×2, /b')
    expect(deployEnCurso({ fase: 'cambiando', ts: 1000 }, 2000)).toBe(true)
    expect(deployEnCurso({ fase: 'listo', ts: 1000 }, 2000)).toBe(false)
  })
})

// ─── Simulacro del cuelgue del 7 oct con un servidor real ─────────────────────────────────────────────────────
// Un proceso Node que, como el web de ese día, deja colgada toda ruta del chat. El vigilante debe: contar la
// primera sonda, a la segunda capturar evidencia (el inspector ve las peticiones colgadas), «reiniciar» (aquí un
// comando que sana al servidor), esperar a que vuelva y dejar la nota en la «bitácora».
const SERVIDOR = `
const http = require('node:http'), fs = require('node:fs')
const sano = process.argv[2]
http.createServer((req, res) => {
  if (req.url.startsWith('/api/salud/chat') && fs.existsSync(sano)) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, destino: 'local', etapas: { url: { ok: true }, supabase: { ok: true }, daemon: { ok: true } } }))
  }
  // Colgado: nunca contesta (la promesa compartida que no resolvía).
}).listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port) + '\\n') })
`

const libre = () => new Promise<number>(r => { const s = createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)) }) })

describe.skipIf(!HAY_VIGIA)('simulacro del cuelgue', () => {
  let hijo: ChildProcess
  let puerto = 0
  const dir = mkdtempSync(join(tmpdir(), 'vigia-'))
  const marca = join(dir, 'reiniciado')
  const bitacora = join(dir, 'bitacora.txt')
  const colgadas: ClientRequest[] = []
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const inspector = await libre()
    writeFileSync(join(dir, 'servidor.cjs'), SERVIDOR)
    hijo = spawn(process.execPath, [`--inspect-port=${inspector}`, join(dir, 'servidor.cjs'), marca], { stdio: ['ignore', 'pipe', 'ignore'] })
    puerto = await new Promise<number>(r => hijo.stdout!.once('data', d => r(Number(String(d).trim()))))
    // Las conexiones de WebKit atoradas en el chat.
    for (const ruta of ['/api/chat/stream', '/api/chat/stream', '/api/chat/models']) {
      const req = httpRequest({ host: '127.0.0.1', port: puerto, path: `${ruta}?secreto=1` }); req.on('error', () => {}); req.end(); colgadas.push(req)
    }
    await new Promise(r => setTimeout(r, 200))
    env = {
      ...process.env,
      VIGIA_URL: `http://127.0.0.1:${puerto}/api/salud/chat`,
      VIGIA_DAEMON_URL: 'http://127.0.0.1:9/health',
      VIGIA_PID: String(hijo.pid),
      VIGIA_GRACIA_S: '0',
      VIGIA_PLAZO_MS: '700',
      VIGIA_ESPERA_VUELTA_MS: '10000',
      VIGIA_INSPECTOR_PUERTO: String(inspector),
      VIGIA_ESTADO: join(dir, 'estado.json'),
      VIGIA_EVIDENCIAS: join(dir, 'evidencias'),
      VIGIA_DEPLOY_ESTADO: join(dir, 'no-existe.json'),
      VIGIA_ENV_FILES: join(dir, 'no-existe.env'),
      VIGIA_REINICIAR_CMD: JSON.stringify(['touch', marca]),
      VIGIA_BITACORA_CMD: JSON.stringify([process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(bitacora)}, process.argv[1] + '\\n'); console.log('{"recorded":true}')`]),
      OPENCLAW_GATEWAY_TOKEN: 'x',
    }
  })
  afterAll(() => { colgadas.forEach(r => r.destroy()); hijo?.kill() })

  const pasada = (args: string[] = []) => new Promise<string>((res, rej) => execFile(process.execPath, [VIGIA, ...args], { env, timeout: 30_000 }, (e, out, err) => e ? rej(new Error(`${e.message}\n${err}`)) : res(out)))
  const estado = () => JSON.parse(readFileSync(env.VIGIA_ESTADO!, 'utf8'))

  it('detecta, captura evidencia, reinicia y anota en la bitácora', async () => {
    await pasada()
    expect(estado().racha).toBe(1)
    expect(existsSync(marca)).toBe(false)

    await pasada()
    expect(existsSync(marca)).toBe(true) // reinició
    const [archivo] = readdirSync(env.VIGIA_EVIDENCIAS!)
    const ev = JSON.parse(readFileSync(join(env.VIGIA_EVIDENCIAS!, archivo), 'utf8'))
    expect(ev.inspector.pid).toBe(hijo.pid)
    const rutas = ev.inspector.pedidos.map((p: { ruta: string }) => p.ruta)
    expect(rutas.filter((r: string) => r === '/api/chat/stream')).toHaveLength(2)
    expect(rutas).toContain('/api/chat/models')
    expect(JSON.stringify(ev)).not.toContain('secreto') // sin query strings
    const nota = readFileSync(bitacora, 'utf8')
    expect(nota).toMatch(/\/api\/chat\/stream ×2/)
    expect(nota).toMatch(/volvió en \d+ s/)
    expect(estado().pendientes).toEqual([])

    await pasada() // ya sano
    expect(estado().racha).toBe(0)
    expect(estado().reinicios).toHaveLength(1)
  }, 60_000)
})
