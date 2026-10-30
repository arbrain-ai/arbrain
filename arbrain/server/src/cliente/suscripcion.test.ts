/**
 * Motor «Mi Claude Code» (21 oct 2026): el chat del alumno con SU Claude Code y su suscripción, sin que Arbrain lea,
 * copie ni guarde ningún token y sin heredar llaves de API. Todo en temporales; ningún `claude` real ni credencial.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepararEntornoCliente } from './arranque.js'
import { entornoClaude, vaciarCofreParaPruebas } from './cofre.js'
import { estadoLlaves, faltaLlaveClaude } from './llaves.js'
import { modeloParaProveedor } from './proveedor.js'
import { mensajeFalloDeCuenta } from './sin-saldo.js'
import { requireClaudeSubscription } from '../chat-runtime/claude-session.js'
import {
  ARCHIVO_MOTOR, buscarClaude, candidatosClaude, CODIGO_SIN_SESION, detectarSuscripcion, entornoSinApi, fuentesDeAjustes,
  guardarMotorElegido, interpretarEstadoAuth, leerMotorElegido, motorSuscripcion, VIAS_DE_API,
} from './suscripcion.js'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const T = 'a'.repeat(64)
const LLAVE = 'sk-ant-api03-' + 'x'.repeat(40)
const OR = 'sk-or-v1-' + 'y'.repeat(40)
const base = (datos = join(tmp('sus-'), 'datos')) => ({ ARBRAIN_EDICION: 'cliente', ARBRAIN_DATA_DIR: datos, ARBRAIN_HOME: join(tmp('ws-'), 'cerebro'), MC_SERVER_PORT: '4567', MISSION_CONTROL_ORIGIN: 'http://127.0.0.1:4568', ARBRAIN_SECRETOS: 'stdin', CLAUDE_CONFIG_DIR: '/aislada/de/arbrain' }) as NodeJS.ProcessEnv
const AUTH_MAX = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'alumna@ejemplo.com', orgId: 'org-123', orgName: 'Su org', subscriptionType: 'max', configDirectory: '/Users/tu-usuario/.claude' })

let edicionPrevia: string | undefined, motorPrevio: string | undefined
beforeEach(() => { vaciarCofreParaPruebas(); edicionPrevia = process.env.ARBRAIN_EDICION; motorPrevio = process.env.ARBRAIN_MOTOR_CLAUDE })
afterEach(() => {
  vaciarCofreParaPruebas()
  if (edicionPrevia === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = edicionPrevia
  if (motorPrevio === undefined) delete process.env.ARBRAIN_MOTOR_CLAUDE; else process.env.ARBRAIN_MOTOR_CLAUDE = motorPrevio
})

describe('detección de la sesión (claude auth status)', () => {
  it('con sesión de claude.ai: hay suscripción y solo salen método y plan, nunca correo ni organización', () => {
    const r = interpretarEstadoAuth(AUTH_MAX)
    expect(r).toEqual({ sesion: true, metodo: 'claude.ai', plan: 'max' })
    expect(JSON.stringify(r)).not.toMatch(/alumna|org-123|Su org|\.claude/)
  })
  it('sin sesión, o con una llave de API / apiKeyHelper / otro proveedor: no cuenta como suscripción', () => {
    expect(interpretarEstadoAuth(JSON.stringify({ loggedIn: false, authMethod: 'none' }))).toMatchObject({ sesion: false, code: CODIGO_SIN_SESION })
    for (const metodo of ['api_key', 'api_key_helper', 'oauth_token', 'third_party']) {
      expect(interpretarEstadoAuth(JSON.stringify({ loggedIn: true, authMethod: metodo, apiProvider: 'firstParty' }))).toMatchObject({ sesion: false, code: 'otra_via' })
    }
    expect(interpretarEstadoAuth(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' })).sesion).toBe(false)
    expect(interpretarEstadoAuth('no es json')).toMatchObject({ sesion: false, code: 'error' })
  })
  it('corre `claude auth status --json` sin llaves de API ni la carpeta aislada de Arbrain (ve la sesión de la terminal)', async () => {
    const vistos: Array<{ archivo: string; args: string[]; env: Record<string, string> }> = []
    const env = { ARBRAIN_EDICION: 'cliente', PATH: '/usr/bin', ANTHROPIC_API_KEY: LLAVE, OPENROUTER_API_KEY: OR, ANTHROPIC_BASE_URL: 'https://openrouter.ai/api', CLAUDE_CONFIG_DIR: '/aislada', CLAUDE_CODE_OAUTH_TOKEN: 'oat-prueba' } as NodeJS.ProcessEnv
    const r = await detectarSuscripcion({ env, ruta: '/x/claude', ejecutar: async (archivo, args, e) => { vistos.push({ archivo, args, env: e }); return { stdout: AUTH_MAX, code: 0 } } })
    expect(r).toEqual({ instalado: true, sesion: true, metodo: 'claude.ai', plan: 'max', activo: false })
    expect(vistos[0].archivo).toBe('/x/claude')
    expect(vistos[0].args).toEqual(['auth', 'status', '--json'])
    for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(vistos[0].env).not.toHaveProperty(k)
    expect(vistos[0].env.PATH).toBe('/usr/bin')
  })
  it('sin `claude` instalado lo dice; salida 1 del CLI = sin sesión aunque el JSON diga otra cosa', async () => {
    expect(await detectarSuscripcion({ env: {}, ruta: null })).toMatchObject({ instalado: false, sesion: false, code: 'sin_claude' })
    expect(await detectarSuscripcion({ env: {}, ruta: '/x/claude', ejecutar: async () => ({ stdout: AUTH_MAX, code: 1 }) })).toMatchObject({ instalado: true, sesion: false, code: CODIGO_SIN_SESION })
  })
  it('busca `claude` también donde lo dejan los instaladores oficiales (la app arranca con un PATH mínimo)', () => {
    const c = candidatosClaude({ PATH: '/usr/bin' }, 'darwin', '/Users/tu-usuario')
    expect(c).toContain('/Users/tu-usuario/.local/bin/claude')
    expect(c).toContain('/opt/homebrew/bin/claude')
    const home = tmp('home-')
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'claude'), '')
    expect(buscarClaude({ PATH: '' }, 'linux', home)).toBe(join(home, '.local', 'bin', 'claude'))
    expect(candidatosClaude({ PATH: 'C:\\Windows' }, 'win32', 'C:\\Users\\tu-usuario').some(p => p.endsWith('claude.exe'))).toBe(true)
  })
})

describe('la elección del motor', () => {
  it('se guarda en la configuración (0600, sin secretos) y se lee; algo raro cuenta como «no eligió»', () => {
    const dir = join(tmp('conf-'), 'config')
    expect(leerMotorElegido(dir)).toBeNull()
    guardarMotorElegido(dir, 'suscripcion')
    expect(leerMotorElegido(dir)).toBe('suscripcion')
    if (process.platform !== 'win32') expect(statSync(join(dir, ARCHIVO_MOTOR)).mode & 0o777).toBe(0o600)
    writeFileSync(join(dir, ARCHIVO_MOTOR), '{"motor":"otro"}')
    expect(leerMotorElegido(dir)).toBeNull()
  })
  it('solo vale en la edición cliente: la instalación original no cambia', () => {
    expect(motorSuscripcion({ ARBRAIN_EDICION: 'cliente', ARBRAIN_MOTOR_CLAUDE: 'suscripcion' })).toBe(true)
    expect(motorSuscripcion({ ARBRAIN_EDICION: 'original', ARBRAIN_MOTOR_CLAUDE: 'suscripcion' })).toBe(false)
    expect(fuentesDeAjustes(['project', 'user'], { ARBRAIN_EDICION: 'original', ARBRAIN_MOTOR_CLAUDE: 'suscripcion' })).toEqual(['project', 'user'])
    expect(entornoClaude({ ARBRAIN_MOTOR_CLAUDE: 'suscripcion', ANTHROPIC_API_KEY: LLAVE }, false).ANTHROPIC_API_KEY).toBe(LLAVE)
  })
})

describe('arranque y CLI con «Mi Claude Code»', () => {
  const arrancar = (motor: 'suscripcion' | 'llave' | null, llaves: Record<string, string>) => {
    const datos = join(tmp('sus-'), 'datos')
    if (motor) guardarMotorElegido(join(datos, 'config'), motor)
    const env = base(datos)
    const r = prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ...llaves }))
    expect(r.ok).toBe(true)
    return env
  }

  it('el CLI usa la carpeta de la persona y NO recibe ANTHROPIC_API_KEY ni OpenRouter aunque estén guardadas', () => {
    const env = arrancar('suscripcion', { ANTHROPIC_API_KEY: LLAVE, OPENROUTER_API_KEY: OR })
    expect(env.ARBRAIN_MOTOR_CLAUDE).toBe('suscripcion')
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ARBRAIN_PROVEEDOR_CLAUDE).toBeUndefined()
    // Un ANTHROPIC_API_KEY que se colara al entorno del daemon (shell de la persona) tampoco pasa.
    const cli = entornoClaude({ ...env, ANTHROPIC_API_KEY: LLAVE, ANTHROPIC_AUTH_TOKEN: OR, CLAUDE_CODE_OAUTH_TOKEN: 'oat-prueba' }, true)
    for (const k of VIAS_DE_API) expect(cli).not.toHaveProperty(k)
    expect(Object.values(cli).join('\n')).not.toMatch(/sk-ant-api03|sk-or-v1|oat-prueba/)
    expect(cli.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe('1')
    expect(fuentesDeAjustes(['project', 'user'], env)).toEqual(['project'])
  })

  it('el chat cuenta como listo con la suscripción, el proveedor lo dice y los modelos no se traducen a OpenRouter', () => {
    const env = arrancar('suscripcion', {})
    process.env.ARBRAIN_EDICION = 'cliente'; process.env.ARBRAIN_MOTOR_CLAUDE = 'suscripcion'
    expect(estadoLlaves(env)).toMatchObject({ chat: true, proveedor: 'suscripcion' })
    expect(faltaLlaveClaude(env)).toBe(false)
    expect(modeloParaProveedor('claude-sonnet-4-5', { ...env, ARBRAIN_PROVEEDOR_CLAUDE: 'openrouter' })).toBe('claude-sonnet-4-5')
  })

  it('con llave (o sin elegir) todo sigue como antes: carpeta aislada y la llave al CLI', () => {
    for (const motor of ['llave', null] as const) {
      const env = arrancar(motor, { ANTHROPIC_API_KEY: LLAVE })
      expect(env.ARBRAIN_MOTOR_CLAUDE).toBeUndefined()
      expect(env.CLAUDE_CONFIG_DIR).toBe('/aislada/de/arbrain')
      expect(entornoClaude(env, true).ANTHROPIC_API_KEY).toBe(LLAVE)
    }
  })

  it('el lanzador puede fijar el motor por entorno (manda sobre el archivo)', () => {
    const datos = join(tmp('sus-'), 'datos')
    guardarMotorElegido(join(datos, 'config'), 'llave')
    const env = { ...base(datos), ARBRAIN_MOTOR_CLAUDE: 'suscripcion' }
    expect(prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T })).ok).toBe(true)
    expect(env.ARBRAIN_MOTOR_CLAUDE).toBe('suscripcion')
    expect(readFileSync(join(datos, 'config', ARCHIVO_MOTOR), 'utf8')).toContain('llave')
  })

  it('cada sesión exige suscripción: si el CLI corre con llave de API, no se envía nada', () => {
    const sub = { apiProvider: 'firstParty', subscriptionType: 'max', tokenSource: 'claude.ai', apiKeySource: 'none' } as Parameters<typeof requireClaudeSubscription>[0]
    expect(() => requireClaudeSubscription(sub, true, true)).not.toThrow()
    expect(() => requireClaudeSubscription({ ...sub, apiKeySource: 'ANTHROPIC_API_KEY' } as typeof sub, true, true)).toThrow(/suscripción/)
    expect(() => requireClaudeSubscription({ apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' } as typeof sub, true, true)).toThrow()
    // Con llave, la edición cliente no lo exige (la llave ES la vía).
    expect(() => requireClaudeSubscription({ apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' } as typeof sub, true, false)).not.toThrow()
  })

  it('el chat explica el fallo sin hablar de llaves ni de recargar', () => {
    const m = mensajeFalloDeCuenta('llave_invalida', 'suscripcion', 'Not logged in · Please run /login')
    expect(m).toMatch(/pulsa «Iniciar sesión con Claude»/)
    expect(m).not.toMatch(/escribe `claude`|abre una terminal/)
    expect(m).not.toMatch(/^Tu llave no funcionó/)
    expect(mensajeFalloDeCuenta('sin_saldo', 'suscripcion', '')).toMatch(/plan de Claude/)
  })
})

describe('el entorno sin vías de API', () => {
  it('quita llaves, gateways, proveedores de nube y carpetas de credenciales; deja lo demás', () => {
    const e = entornoSinApi({ PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: LLAVE, ANTHROPIC_BASE_URL: 'x', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CONFIG_DIR: '/c', CLAUDE_SECURESTORAGE_CONFIG_DIR: '/s' })
    expect(e).toEqual({ PATH: '/bin', HOME: '/h' })
  })
})

// ── Prueba en Windows del 22 oct 2026 (docs/builds/prueba-windows-2026-10-22, puntos 10, 11 y 12) ─────────────────
import { EventEmitter } from 'node:events'
import {
  activarSuscripcionEnCaliente, cancelarLoginClaude, claudeDeEscritorio, comandoInstalarClaude, comandoParaEjecutar,
  conectarSuscripcionSiHay, estadoLogin, iniciarLoginClaude, interpretarPathDelRegistro, MENSAJE_LENTO, MENSAJE_SIN_CLAUDE,
  MENSAJE_SIN_SESION,
} from './suscripcion.js'
import { MENSAJE_FALTA_LLAVE } from './llaves.js'
import { esFaltaLlave } from './sin-saldo.js'

describe('detección fiable (Windows, PATH viejo, solo app de escritorio)', () => {
  it('lee el PATH vigente del registro y expande %VARIABLES% (un CLI instalado después del daemon)', () => {
    const salida = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\.local\\bin;C:\\Herramientas;%NO_EXISTE%\\x;\r\n'
    expect(interpretarPathDelRegistro(salida, { USERPROFILE: 'C:\\Users\\Usuario Ejemplo' })).toEqual(['C:\\Users\\Usuario Ejemplo\\.local\\bin', 'C:\\Herramientas'])
    expect(interpretarPathDelRegistro('ERROR: no existe', {})).toEqual([])
    const c = candidatosClaude({ PATH: 'C:\\Windows' }, 'win32', 'C:\\Users\\ana', ['D:\\nuevo'])
    expect(c.some(p => p.startsWith('D:\\nuevo') || p.startsWith('D:/nuevo'))).toBe(true)
  })
  it('un claude.cmd en una ruta con espacios va entre comillas por shell; un .exe va directo, sin shell', () => {
    expect(comandoParaEjecutar('C:\\Users\\Usuario Ejemplo\\AppData\\Roaming\\npm\\claude.cmd')).toEqual({ archivo: '"C:\\Users\\Usuario Ejemplo\\AppData\\Roaming\\npm\\claude.cmd"', shell: true })
    expect(comandoParaEjecutar('C:\\Users\\ana\\.local\\bin\\claude.exe')).toEqual({ archivo: 'C:\\Users\\ana\\.local\\bin\\claude.exe', shell: false })
  })
  it('encuentra el Claude Code que trae la app de escritorio de Claude, el de versión más nueva', () => {
    const home = tmp('desk-')
    const raiz = join(home, 'Library', 'Application Support', 'Claude', 'claude-code')
    for (const v of ['2.1.9', '2.1.304']) {
      const d = join(raiz, v, 'abc123', 'claude.app', 'Contents', 'MacOS')
      mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'claude'), '')
    }
    expect(claudeDeEscritorio({}, 'darwin', home)).toBe(join(raiz, '2.1.304', 'abc123', 'claude.app', 'Contents', 'MacOS', 'claude'))
    const appdata = tmp('appdata-')
    mkdirSync(join(appdata, 'Claude', 'claude-code', '2.1.308'), { recursive: true }); writeFileSync(join(appdata, 'Claude', 'claude-code', '2.1.308', 'claude.exe'), '')
    expect(claudeDeEscritorio({ APPDATA: appdata }, 'win32', 'C:\\nadie')).toBe(join(appdata, 'Claude', 'claude-code', '2.1.308', 'claude.exe'))
    // Sin ningún otro `claude` (solo la app de escritorio, como en la PC de la prueba), buscarClaude cae a ese.
    expect(buscarClaude({ PATH: '', APPDATA: appdata }, 'win32', tmp('vacio-'), [])).toBe(join(appdata, 'Claude', 'claude-code', '2.1.308', 'claude.exe'))
  })
  it('si `auth status` no contesta a tiempo (antivirus la primera vez) lo dice en una línea, sin «no veo tu sesión»', async () => {
    const r = await detectarSuscripcion({ env: {}, ruta: '/x/claude', ejecutar: async () => ({ stdout: '', code: -1, lento: true }) })
    expect(r).toMatchObject({ instalado: true, sesion: false, code: 'lento', mensaje: MENSAJE_LENTO })
  })
  it('cada aviso es UNA línea, sin comandos para copiar ni prompts', () => {
    for (const m of [MENSAJE_SIN_SESION, MENSAJE_SIN_CLAUDE, MENSAJE_LENTO, MENSAJE_FALTA_LLAVE]) {
      expect(m).not.toMatch(/\n|`/)
      expect(m.length).toBeLessThan(220)
    }
  })
  it('el instalador es el oficial, sin administrador', () => {
    expect(comandoInstalarClaude('win32').args.join(' ')).toContain('irm https://claude.ai/install.ps1 | iex')
    expect(comandoInstalarClaude('darwin').args.join(' ')).toContain('curl -fsSL https://claude.ai/install.sh | bash')
  })
})

class ProcesoFalso extends EventEmitter { matado = false; kill() { this.matado = true; return true } }

describe('«Iniciar sesión con Claude»: el login oficial del CLI, sin ver el token', () => {
  afterEach(() => cancelarLoginClaude())
  it('lanza `claude auth login --claudeai` sin llaves de API ni carpeta aislada, no lee su salida, y al terminar avisa', () => {
    const vistos: Array<{ archivo: string; args: string[]; env: Record<string, string> }> = []
    const proc = new ProcesoFalso()
    let terminado = 0
    const env = { PATH: '/usr/bin', ANTHROPIC_API_KEY: LLAVE, CLAUDE_CONFIG_DIR: '/aislada', CLAUDE_CODE_OAUTH_TOKEN: 'oat' } as NodeJS.ProcessEnv
    const r = iniciarLoginClaude({ env, ruta: '/x/claude', alTerminar: () => { terminado++ }, lanzar: (archivo, args, e) => { vistos.push({ archivo, args, env: e }); return proc as never } })
    expect(r).toMatchObject({ estado: 'esperando' })
    expect(vistos[0].args).toEqual(['auth', 'login', '--claudeai'])
    for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(vistos[0].env).not.toHaveProperty(k)
    // Uno a la vez: el segundo clic devuelve el mismo intento.
    expect(iniciarLoginClaude({ env, ruta: '/x/claude', lanzar: () => { throw new Error('no debía lanzar otro') } })).toMatchObject({ estado: 'esperando' })
    proc.emit('exit', 0)
    expect(estadoLogin()).toMatchObject({ estado: 'listo' })
    expect(terminado).toBe(1)
  })
  it('si el CLI sale con error, el estado dice qué hacer en una línea', () => {
    const proc = new ProcesoFalso()
    iniciarLoginClaude({ env: {}, ruta: '/x/claude', lanzar: () => proc as never })
    proc.emit('exit', 1)
    expect(estadoLogin()).toMatchObject({ estado: 'fallo' })
    expect(estadoLogin()?.mensaje).not.toMatch(/\n|`/)
  })
  it('sin Claude Code no lanza nada', () => {
    expect(iniciarLoginClaude({ env: {}, ruta: null, lanzar: () => { throw new Error('no') } })).toMatchObject({ estado: 'sin_claude' })
  })
})

describe('conectar solo (sin llave y con sesión)', () => {
  it('fija el motor en caliente, lo guarda y quita del proceso toda vía de API y la carpeta aislada', () => {
    const dir = join(tmp('conf-'), 'config')
    const env = { ARBRAIN_EDICION: 'cliente', CLAUDE_CONFIG_DIR: '/aislada', ANTHROPIC_BASE_URL: 'https://x' } as NodeJS.ProcessEnv
    expect(activarSuscripcionEnCaliente(dir, true, env)).toBe(true)
    expect(env.ARBRAIN_MOTOR_CLAUDE).toBe('suscripcion')
    expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR')
    expect(env).not.toHaveProperty('ANTHROPIC_BASE_URL')
    expect(leerMotorElegido(dir)).toBe('suscripcion')
    expect(motorSuscripcion(env)).toBe(true)
  })
  it('con llave no cambia nada en caliente (eso pide reiniciar) y fuera de la edición cliente tampoco', () => {
    const env = { ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv
    expect(activarSuscripcionEnCaliente(undefined, false, env)).toBe(false)
    expect(activarSuscripcionEnCaliente(undefined, true, {} as NodeJS.ProcessEnv)).toBe(false)
  })
  it('respeta a quien eligió «usar una llave» y no conecta sin sesión', async () => {
    const dir = join(tmp('conf-'), 'config')
    const conSesion = async () => ({ instalado: true, sesion: true, activo: false })
    const sinSesion = async () => ({ instalado: true, sesion: false, activo: false })
    expect(await conectarSuscripcionSiHay({ sinLlave: true, configDir: dir, env: { ARBRAIN_EDICION: 'cliente' }, detectar: sinSesion })).toBe(false)
    guardarMotorElegido(dir, 'llave')
    expect(await conectarSuscripcionSiHay({ sinLlave: true, configDir: dir, env: { ARBRAIN_EDICION: 'cliente' }, detectar: conSesion })).toBe(false)
    const dir2 = join(tmp('conf-'), 'config')
    const env = { ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv
    expect(await conectarSuscripcionSiHay({ sinLlave: true, configDir: dir2, env, detectar: conSesion })).toBe(true)
    expect(env.ARBRAIN_MOTOR_CLAUDE).toBe('suscripcion')
  })
})

describe('sin llave ni sesión el chat dice cómo conectarse (punto 11)', () => {
  it('el aviso nombra los dos caminos y la web lo reconoce por su inicio', () => {
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Iniciar sesión con Claude/)
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Conectar con OpenRouter/)
    expect(esFaltaLlave({ error: true, diagnostic: MENSAJE_FALTA_LLAVE })).toBe(true)
    expect(esFaltaLlave({ error: false, diagnostic: MENSAJE_FALTA_LLAVE })).toBe(false)
    expect(esFaltaLlave({ error: true, diagnostic: 'No se pudo confirmar el modelo Claude.' })).toBe(false)
  })
})
