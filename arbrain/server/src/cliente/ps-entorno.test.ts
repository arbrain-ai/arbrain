/**
 * Prueba de punta a punta del contrato v2 §2.1 (endurecimiento, 11 oct 2026): lanza el daemon REAL en edición cliente
 * con HOME, datos y cerebro temporales, le entrega los secretos por stdin como la app, y mira con `ps eww` (lo que
 * vería cualquier proceso del mismo usuario) el entorno del daemon, del CLI de Claude que lanza y de un hook del
 * workspace (un hijo del CLI, como Bash). Llaves y tokens son falsos; ningún puerto de Daniel (3000/3099/3218/3300).
 *
 * Esperado: el daemon no muestra ningún secreto; el CLI muestra SOLO la llave BYOK (inevitable: la usa) y nunca el
 * token del daemon ni el de confirmar; el hook no ve ni la llave ni los tokens, solo el pase de agente.
 * Windows no tiene `ps eww`: se salta allí. Sin binario del CLI para esta plataforma, también.
 */
import { describe, it, expect } from 'vitest'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SERVER = join(AQUI, '..', '..')
const requerir = createRequire(import.meta.url)
const RESERVADOS = new Set([3000, 3099, 3218, 3300])

function binarioCli(): string | null {
  try {
    const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
    const p = join(dirname(requerir.resolve(`${pkg}/package.json`)), 'claude')
    return existsSync(p) ? p : null
  } catch { return null }
}

const puertoLibre = (): Promise<number> => new Promise((ok, mal) => {
  const s = createServer()
  s.once('error', mal)
  s.listen(0, '127.0.0.1', () => {
    const p = (s.address() as { port: number }).port
    s.close(() => RESERVADOS.has(p) ? puertoLibre().then(ok, mal) : ok(p))
  })
})

const esperar = async (cond: () => boolean, ms: number) => {
  const fin = Date.now() + ms
  while (Date.now() < fin) { if (cond()) return true; await new Promise(r => setTimeout(r, 100)) }
  return cond()
}

/** `ps eww` del pid (lo mismo que vería otro proceso del usuario). En Linux además /proc/<pid>/environ. */
function entornoVisible(pid: number): string {
  let s = ''
  try { s += execFileSync('ps', ['eww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }) } catch { /* ya salió */ }
  if (process.platform === 'linux') try { s += readFileSync(`/proc/${pid}/environ`, 'utf8') } catch { /* ya salió */ }
  return s
}

/** Descendientes vivos de `raiz` (hijos, nietos…). */
function descendientes(raiz: number): number[] {
  const filas = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number))
  const out: number[] = []
  let frontera = [raiz]
  while (frontera.length) {
    const hijos = filas.filter(([, pp]) => frontera.includes(pp)).map(([p]) => p)
    out.push(...hijos)
    frontera = hijos
  }
  return out
}

const CLI = binarioCli()
const correr = process.platform !== 'win32' && !!CLI

describe.skipIf(!correr)('ps eww: ningún secreto en el entorno del daemon ni de sus hijos (contrato v2)', () => {
  it('daemon cliente real con HOME temporal', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'arbrain-ps-'))
    const home = join(raiz, 'home'), datos = join(raiz, 'datos'), cerebro = join(raiz, 'cerebro'), salida = join(raiz, 'salida')
    for (const d of [home, datos, join(cerebro, '.claude'), salida]) mkdirSync(d, { recursive: true })
    // Un hook del workspace hace de «Bash del agente»: vuelca su entorno y el `ps eww` de su padre (el CLI).
    writeFileSync(join(cerebro, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `env > '${salida}/hook-env.txt'; ps eww -o command= -p $PPID > '${salida}/cli-ps.txt' 2>&1; true` }] }] } }))
    const T = 'd1'.repeat(32), C = 'c0'.repeat(32), P = 'a9'.repeat(32), LLAVE = 'sk-ant-api03-PRUEBA-falsa-' + 'x'.repeat(40)
    const [puerto, puertoWeb] = [await puertoLibre(), await puertoLibre()]

    const tsx = pathToFileURL(requerir.resolve('tsx/esm')).href
    const daemon: ChildProcess = spawn(process.execPath, ['--import', tsx, join(SERVER, 'src', 'index.ts')], {
      cwd: datos, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', NODE_ENV: 'production', LOG_LEVEL: 'warn',
        ARBRAIN_EDICION: 'cliente', ARBRAIN_SECRETOS: 'stdin', ARBRAIN_VIGILAR_STDIN: '1',
        ARBRAIN_DATA_DIR: datos, ARBRAIN_HOME: cerebro, MC_SERVER_PORT: String(puerto), MISSION_CONTROL_ORIGIN: `http://127.0.0.1:${puertoWeb}`,
      },
    })
    let log = ''
    daemon.stdout!.on('data', d => { log += String(d) })
    daemon.stderr!.on('data', d => { log += String(d) })
    // Como la app: una línea JSON en stdin y el stdin queda abierto (vigía §5).
    daemon.stdin!.write(JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C, ARBRAIN_PASE_AGENTE: P, ANTHROPIC_API_KEY: LLAVE }) + '\n')
    const pid = daemon.pid!
    const H = (b: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${b}`, 'Content-Type': 'application/json', ...extra })
    const url = (r: string) => `http://127.0.0.1:${puerto}${r}`
    try {
      expect(await esperar(() => log.includes('ARBRAIN_DAEMON_LISTO'), 45_000), log.slice(-2000)).toBe(true)

      // 1) El daemon: ni tokens ni llave en lo que ve otro proceso.
      const delDaemon = entornoVisible(pid)
      expect(delDaemon).toContain('ARBRAIN_SECRETOS=stdin')
      for (const s of [T, C, P, LLAVE]) expect(delDaemon).not.toContain(s)

      // 2) Rutas: vida sin credencial; el pase de agente no abre las rutas de la app ni resuelve aunque adivine.
      expect((await fetch(url('/vivo'))).status).toBe(200)
      expect((await fetch(url('/health'))).status).toBe(401)
      expect((await fetch(url('/health'), { headers: H(T) })).status).toBe(200)
      expect((await fetch(url('/health'), { headers: H(P) })).status).toBe(200)
      expect(typeof (await (await fetch(url('/health'), { headers: H(T) })).json() as { sandbox?: unknown }).sandbox).toBe('boolean')
      expect(typeof (await (await fetch(url('/confirmaciones'), { headers: H(T) })).json() as { sandbox?: unknown }).sandbox).toBe('boolean')
      expect((await fetch(url('/confirmaciones/resolver'), { method: 'POST', headers: H(P, { 'X-Arbrain-Confirmar': T }), body: '{"id":"cf_000000000000","decision":"permitir"}' })).status).toBe(403)
      expect((await fetch(url('/confirmaciones/resolver'), { method: 'POST', headers: H(T, { 'X-Arbrain-Confirmar': P }), body: '{"id":"cf_000000000000","decision":"permitir"}' })).status).toBe(403)
      expect((await fetch(url('/apagar'), { method: 'POST', headers: H(P), body: '{}' })).status).toBe(403)
      // Red team 4 M4-2: el pase no lee conversaciones, actividad, uso, pendientes, archivos ni cifras de la persona.
      for (const ruta of ['/sessions', '/chat/backstage?chatId=x', '/ops/recent', '/usage', '/confirmaciones', '/fs/read?path=CLAUDE.md', '/fs/list', '/cohorte'])
        expect((await fetch(url(ruta), { headers: H(P) })).status, `pase GET ${ruta}`).toBe(403)
      expect((await fetch(url('/cabina'), { method: 'POST', headers: H(P), body: '{"que":"memoria"}' })).status).toBe(403)
      expect((await fetch(url('/schedule'), { headers: H(P) })).status).toBe(200)
      expect((await fetch(url('/sessions'), { headers: H(T) })).status).toBe(200)

      // 2b) Red team C2 (contrato v3): con computer use apagado (así nace cada apertura) nadie crea confirmaciones de
      // manos por HTTP: 403. En Linux, «no disponible»; en macOS y Windows (0.1.2), «apagado».
      const disponible = process.platform === 'darwin' || process.platform === 'win32'
      const post = (r: string, b: string, cuerpo: unknown, extra: Record<string, string> = {}) => fetch(url(r), { method: 'POST', headers: H(b, extra), body: JSON.stringify(cuerpo) })
      expect((await post('/confirmaciones/pedir', P, { origen: 'cron', resumen: 'Guardar un borrador (no envía nada)', huella: 'agente:abc' })).status).toBe(403)
      expect((await post('/confirmaciones/consumir', P, { huella: 'agente:abc' })).status).toBe(403)
      expect((await post('/confirmaciones/pedir', P, { herramienta: 'manos:actuar', partes: ['git push origin main'] })).status).toBe(403)
      expect((await post('/confirmaciones/pedir', T, { herramienta: 'manos:actuar', partes: ['git push origin main'] })).status).toBe(403)
      expect((await (await fetch(url('/confirmaciones'), { headers: H(T) })).json() as { pendientes: unknown[] }).pendientes).toEqual([])
      // 2c) Nace apagado. Ni el pase ni el token sin el secreto de la app lo encienden; el archivo no se escribe hasta
      // que la persona decide desde la app.
      expect(await (await fetch(url('/manos/estado'), { headers: H(P) })).json()).toMatchObject({ encendido: false, voz: [] })
      expect(await (await fetch(url('/manos/interruptor'), { headers: H(T) })).json()).toMatchObject({ encendido: false, disponible })
      expect((await post('/manos/interruptor', P, { encendido: true }, { 'X-Arbrain-Confirmar': C })).status).toBe(403)
      expect((await post('/manos/interruptor', T, { encendido: true })).status).toBe(403)
      expect(existsSync(join(datos, 'config', 'manos', 'computer-use.json'))).toBe(false)
      const intento = await post('/manos/interruptor', T, { encendido: true }, { 'X-Arbrain-Confirmar': C })
      if (!disponible) {
        expect(intento.status).toBe(403)
        expect(await intento.json()).toMatchObject({ code: 'no_disponible' })
        expect(await (await fetch(url('/manos/estado'), { headers: H(P) })).json()).toMatchObject({ encendido: false })
      } else {
        // La app (token + secreto de confirmar) sí lo enciende; entonces el MCP de manos puede pedir el clic de la persona,
        // pero nunca con texto o huella propios (400), y aprobar sigue siendo solo de la app.
        expect(intento.status).toBe(200)
        expect(await (await fetch(url('/manos/estado'), { headers: H(P) })).json()).toMatchObject({ encendido: true })
        expect((await post('/confirmaciones/pedir', P, { origen: 'cron', resumen: 'Guardar un borrador', huella: 'agente:abc' })).status).toBe(400)
        const pedida = await post('/confirmaciones/pedir', P, { herramienta: 'manos:actuar', partes: ['TextEdit', 'enviar'] })
        expect(pedida.status).toBe(200)
        const { id } = await pedida.json() as { id: string }
        expect((await post('/confirmaciones/resolver', P, { id, decision: 'permitir' }, { 'X-Arbrain-Confirmar': C })).status).toBe(403)
        expect((await post('/manos/interruptor', T, { encendido: false })).status).toBe(200)
        expect(await (await fetch(url('/manos/estado'), { headers: H(P) })).json()).toMatchObject({ encendido: false })
      }

      // 2d) Red team 3 A-4: la ruta se lee UNA vez. Variantes con `..`, `.`, `//` y codificación, tal cual por el cable
      // (sin que el cliente HTTP las normalice): 403 con el pase y con el token; el daemon sigue vivo.
      const crudo = (ruta: string, bearer: string) => new Promise<number>((ok, mal) => {
        const r = http.request({ host: '127.0.0.1', port: puerto, method: 'POST', path: ruta, headers: H(bearer) }, res => { res.resume(); ok(res.statusCode ?? 0) })
        r.on('error', mal); r.end('{}')
      })
      for (const ruta of ['/x/../apagar', '/./apagar', '//apagar', '/x/%2e%2e/apagar', '/x/%2E%2E/apagar', '/x/.%2e/apagar', '/x%2f..%2fapagar',
        '/x/..%2fapagar', '/apagar#x', '/x/../llaves/probar', '/x/../manos/interruptor', '/x/../newchat', '/x/../cohorte/venta', '/x/../chat']) {
        expect(await crudo(ruta, P), `pase ${ruta}`).toBe(403)
        expect(await crudo(ruta, T), `token ${ruta}`).toBe(403)
      }
      expect((await fetch(url('/vivo'))).status).toBe(200)
      expect((await fetch(url('/health'), { headers: H(T) })).status).toBe(200)
      // 2e) Red team 3 M-1/M-2: el pase no reinicia la conversación, no fabrica cifras del monitoreo, no lanza
      // síntesis ni corre las rutinas de la persona.
      for (const ruta of ['/newchat', '/cohorte/venta', '/synthesize', '/schedule/x/run', '/schedule/x/pause'])
        expect((await post(ruta, P, { tipo: 'cierre', monto: 999999, prompt: 'x' })).status, ruta).toBe(403)
      expect((await (await fetch(url('/cohorte'), { headers: H(T) })).json() as { vista_previa: { dias: Array<{ cierres: number }> } }).vista_previa.dias.every(d => d.cierres === 0)).toBe(true)

      // 3) Un turno: el daemon lanza el CLI de Claude y éste el hook. La llave es falsa: el turno falla después, no importa.
      void fetch(url('/chat'), { method: 'POST', headers: H(T), body: JSON.stringify({ message: 'hola' }), signal: AbortSignal.timeout(80_000) }).catch(() => undefined)
      expect(await esperar(() => existsSync(join(salida, 'hook-env.txt')) && existsSync(join(salida, 'cli-ps.txt')), 60_000), log.slice(-2000)).toBe(true)
      const hijos = descendientes(pid)
      const vistos = hijos.map(h => ({ pid: h, env: entornoVisible(h) }))
      await esperar(() => readFileSync(join(salida, 'cli-ps.txt'), 'utf8').length > 0, 5_000)
      const hookEnv = readFileSync(join(salida, 'hook-env.txt'), 'utf8')
      const cliPs = readFileSync(join(salida, 'cli-ps.txt'), 'utf8')

      // El hook (hijo del CLI, como Bash): ni llave ni tokens; sí su pase y el puerto.
      for (const s of [T, C, LLAVE]) expect(hookEnv).not.toContain(s)
      expect(hookEnv).toContain(`ARBRAIN_PASE_AGENTE=${P}`)
      expect(hookEnv).toContain(`MC_SERVER_PORT=${puerto}`)
      // El CLI: tiene la llave (la usa) y el scrub; jamás el token del daemon ni el de confirmar.
      expect(cliPs).toContain(LLAVE)
      expect(cliPs).toContain('CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1')
      for (const s of [T, C]) expect(cliPs).not.toContain(s)
      // Todo descendiente vivo del daemon: ninguno con los tokens internos.
      for (const v of vistos) for (const s of [T, C]) expect(v.env, `pid ${v.pid}`).not.toContain(s)

      const corto = (t: string) => t.replace(LLAVE, '<LLAVE-FALSA>').replace(new RegExp(P, 'g'), '<PASE>').replace(/\s+/g, ' ').slice(0, 260)
      // Nombres de variables que `ps eww` muestra (los valores no se imprimen: la llave es falsa, pero igual).
      const claves = (t: string) => [...new Set(t.match(/(?<=\s)[A-Z][A-Z0-9_]*(?==)/g) ?? [])].sort().join(' ')
      console.log([
        `[ps eww] daemon pid ${pid}: ${corto(delDaemon)}`,
        `[ps eww] daemon, variables visibles: ${claves(delDaemon)}`,
        `[ps eww] CLI (padre del hook): ${corto(cliPs)}…`,
        `[ps eww] CLI, variables visibles: ${claves(cliPs)}`,
        `[hook] claves del entorno: ${hookEnv.split('\n').map(l => l.split('=')[0]).filter(Boolean).sort().join(' ')}`,
        `[descendientes] ${vistos.length} vivos revisados, 0 con token del daemon o de confirmar`,
      ].join('\n'))
    } finally {
      daemon.stdin!.end()
      await esperar(() => daemon.exitCode !== null || daemon.signalCode !== null, 8_000)
      try { process.kill(-pid, 'SIGKILL') } catch { /* ya salió */ }
    }
  }, 150_000)
})
