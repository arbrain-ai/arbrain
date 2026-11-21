/**
 * Extensiones (21 nov 2026, fase 2 del SPEC docs/builds/extensiones-2026-11-20): el modelo, la fuente `ext:` con disco,
 * la tienda (instalar, actualizar, quitar) con un CLI de Claude Code simulado que escribe lo mismo que el real, las
 * tareas en el scheduler y su corrida con entorno mínimo. Al final, si hay `claude` y el catálogo del repo, la misma
 * instalación con el CLI de verdad en una carpeta de Claude Code temporal (no toca la del dueño).
 */
import { execFile } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cumpleVersion, declarada, FORMA_FUENTE_EXT, idTarea, leerManifiesto, leerMensajePanel, textoDeAccion, urlDeAccion, type Manifiesto } from './modelo.js'
import { archivoDelPanel, fuenteCatalogo, leerInstaladas, resolverFuenteExt } from './disco.js'
import { darDeAlta, darDeBaja, leerIdTarea, prepararCorrida, type AlmacenTareas, type FilaTarea } from './tareas.js'
import { atenderExtensiones, binarioClaude, cliReal, estado, type DepsTienda, type SalidaCli } from './tienda.js'

const correr = promisify(execFile)

const MANIFIESTO = {
  esquema: 'arbrain.extension/v1',
  nombre: 'Demo',
  resumen: 'Una extensión de prueba con panel y una tarea semanal.',
  frases: ['instálame la demo'],
  requiere: { arbrain: '>=0.2.0', skills_base: [] as string[], programas: [] as string[], extensiones: [] as string[], llaves: [{ clave: 'demo_api_key', para: 'Leer la API de prueba.', opcional: false }] },
  permisos: { lee: ['.claude/memory/extensiones/demo/'], escribe: ['.claude/memory/extensiones/demo/'], red: ['api.example'], lienzo: false, programa: true },
  panel: {
    titulo: 'Demo', entrada: 'panel/index.html', seccion: 'contenido',
    datos: ['$CEREBRO/.claude/memory/extensiones/demo/datos.json', '$CEREBRO/.claude/memory/extensiones/demo/enlace.json', '$DATOS/cache.json', '$CEREBRO/.claude/memory/RETRATO.json'],
    acciones: [{ id: 'censar', etiqueta: 'Correr el censo', pide: 'Corre el censo de la demo.' }],
  },
  tareas: [{ id: 'semanal', cada: '0 20 * * 0', corre: './scripts/tarea.mjs', argumentos: ['estudio'], necesita: ['demo_api_key'] }],
  licencia: { nivel: 'gratis' },
}

const TAREA_MJS = `import { writeFileSync, mkdirSync } from 'node:fs'
const d = process.env.ARBRAIN_RAIZ + '/.claude/memory/extensiones/demo'
mkdirSync(d, { recursive: true })
writeFileSync(d + '/corrida.json', JSON.stringify({ args: process.argv.slice(2), llave: process.env.DEMO_API_KEY, cwd: process.cwd(),
  token: process.env.OPENCLAW_GATEWAY_TOKEN ?? null, anthropic: process.env.ANTHROPIC_API_KEY ?? null, raiz: process.env.CLAUDE_PLUGIN_ROOT, datos: process.env.CLAUDE_PLUGIN_DATA }))
console.log('listo')
`

let T: string
let cerebro: string, config: string, catalogo: string, llaves: string

function escribirExtension(version: string, cambios: (m: typeof MANIFIESTO) => void = () => {}) {
  const ext = join(catalogo, 'extensiones', 'demo')
  mkdirSync(join(ext, '.claude-plugin'), { recursive: true })
  mkdirSync(join(ext, 'panel'), { recursive: true })
  mkdirSync(join(ext, 'scripts'), { recursive: true })
  writeFileSync(join(ext, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', displayName: 'Demo', version, description: 'Demo', author: { name: 'Arbrain' }, license: 'Apache-2.0' }))
  const m = structuredClone(MANIFIESTO); cambios(m)
  writeFileSync(join(ext, 'arbrain.json'), JSON.stringify(m))
  writeFileSync(join(ext, 'panel', 'index.html'), '<!doctype html><p>panel demo</p>')
  writeFileSync(join(ext, 'scripts', 'tarea.mjs'), TAREA_MJS)
  writeFileSync(join(ext, 'README.md'), '# Demo\n\nUna demo para probar la tienda.\n')
}

/** Lo que escribe el CLI de verdad (visto el 20 nov con 2.1.321): settings.local.json, known_marketplaces, installed_plugins, caché. */
function cliFalso(llamadas: string[][]): (args: string[]) => Promise<SalidaCli> {
  const inst = join(config, 'plugins', 'installed_plugins.json')
  const leer = () => existsSync(inst) ? JSON.parse(readFileSync(inst, 'utf8')) : { version: 2, plugins: {} }
  const copiar = (id: string) => {
    const v = JSON.parse(readFileSync(join(catalogo, 'extensiones', id, '.claude-plugin', 'plugin.json'), 'utf8')).version
    const destino = join(config, 'plugins', 'cache', 'arbrain', id, v)
    cpSync(join(catalogo, 'extensiones', id), destino, { recursive: true })
    const j = leer(); j.plugins[`${id}@arbrain`] = [{ scope: 'local', installPath: destino, version: v, installedAt: 'x', lastUpdated: 'x', projectPath: cerebro }]
    writeFileSync(inst, JSON.stringify(j))
  }
  return async args => {
    llamadas.push(args)
    const [a, b, c] = args
    if (a === 'marketplace' && b === 'add') {
      writeFileSync(join(cerebro, '.claude', 'settings.local.json'), JSON.stringify({ extraKnownMarketplaces: { arbrain: { source: { source: 'directory', path: c } } } }))
      mkdirSync(join(config, 'plugins'), { recursive: true })
      writeFileSync(join(config, 'plugins', 'known_marketplaces.json'), JSON.stringify({ arbrain: { installLocation: c } }))
      return { codigo: 0, salida: 'ok' }
    }
    if (a === 'marketplace' && b === 'update') return { codigo: 0, salida: 'ok' }
    if (a === 'install' || a === 'update') { copiar(b.split('@')[0]); return { codigo: 0, salida: 'ok' } }
    if (a === 'uninstall') {
      const j = leer(); delete j.plugins[b]; writeFileSync(inst, JSON.stringify(j))
      rmSync(join(config, 'plugins', 'data', `${b.split('@')[0]}-arbrain`), { recursive: true, force: true })
      return { codigo: 0, salida: 'ok' }
    }
    return { codigo: 1, salida: `no sé hacer ${args.join(' ')}` }
  }
}

function almacen(): AlmacenTareas & { filas: FilaTarea[] } {
  const filas: FilaTarea[] = []
  return {
    filas,
    listar: () => filas.map(f => ({ ...f })),
    crear: t => { filas.push({ id: t.id, prompt: t.prompt, schedule: t.schedule, status: 'active', next_run: t.nextRun, last_run: null, last_result: null }) },
    borrar: id => { const i = filas.findIndex(f => f.id === id); if (i >= 0) filas.splice(i, 1) },
  }
}

function deps(llamadas: string[][], tareas = almacen(), extra: Partial<DepsTienda> = {}): DepsTienda {
  return {
    cerebro, configDir: config, archivoLlaves: llaves, env: { ARBRAIN_EXTENSIONES_FUENTE: catalogo, PATH: process.env.PATH },
    raicesCatalogo: [cerebro], versionArbrain: '0.2.29', claude: cliFalso(llamadas), tareas, proxima: () => 1_900_000_000, ...extra,
  }
}

beforeEach(() => {
  T = mkdtempSync(join(tmpdir(), 'arbrain-ext-'))
  cerebro = join(T, 'cerebro'); config = join(T, 'config'); catalogo = join(T, 'catalogo'); llaves = join(T, 'llaves', 'llaves.env')
  mkdirSync(join(cerebro, '.claude', 'memory'), { recursive: true })
  mkdirSync(join(catalogo, '.claude-plugin'), { recursive: true })
  writeFileSync(join(catalogo, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'arbrain', owner: { name: 'Arbrain' }, metadata: { version: '0.1.0' }, plugins: [{ name: 'demo', source: './extensiones/demo', category: 'mercado', tags: ['panel'] }] }))
  escribirExtension('0.1.0')
})
afterEach(() => { rmSync(T, { recursive: true, force: true }) })

describe('modelo', () => {
  const m = leerManifiesto(MANIFIESTO)!

  it('lee el arbrain.json y descarta lo que no cumple', () => {
    expect(m.nombre).toBe('Demo')
    expect(m.tareas[0]).toMatchObject({ id: 'semanal', corre: 'scripts/tarea.mjs', necesita: ['demo_api_key'] })
    // RETRATO.json no cae dentro de permisos.lee: ni siquiera queda declarado.
    expect(m.panel!.datos).not.toContain('$CEREBRO/.claude/memory/RETRATO.json')
    expect(leerManifiesto({ ...MANIFIESTO, esquema: 'otro' })).toBeNull()
    const malo = leerManifiesto({ ...MANIFIESTO, permisos: { ...MANIFIESTO.permisos, lee: ['/', '../x', '.claude/skills/canvas/', '.claude/memory/ok/'] },
      tareas: [{ id: 'x', cada: '* * * * *', corre: '../../fuera.sh', argumentos: [], necesita: ['otra_llave'] }, { id: 'y', cada: 'rm -rf', corre: 'a.sh' }] })!
    expect(malo.permisos.lee).toEqual(['.claude/memory/ok/'])
    expect(malo.tareas).toEqual([])
  })

  it('la fuente ext: tiene su propia puerta: solo lo declarado y dentro del permiso', () => {
    expect(declarada('ext:$CEREBRO/.claude/memory/extensiones/demo/datos.json', m)).toMatchObject({ raiz: 'cerebro', permiso: '.claude/memory/extensiones/demo/' })
    expect(declarada('ext:$DATOS/cache.json', m)).toMatchObject({ raiz: 'datos' })
    expect(declarada('ext:$CEREBRO/.claude/memory/extensiones/demo/otra.json', m)).toBeNull()
    expect(declarada('ext:$CEREBRO/.claude/memory/RETRATO.json', m)).toBeNull()
    expect(declarada('ext:$CEREBRO/.claude/memory/extensiones/demo/../../MEMORY.json', m)).toBeNull()
    expect(declarada('pulso:venta', m)).toBeNull()
    expect(FORMA_FUENTE_EXT.test('ext:$CEREBRO/a/../b.json')).toBe(true) // la forma deja pasar `..`; la puerta no
    expect(declarada('ext:$CEREBRO/a/../b.json', { ...m, panel: { ...m.panel!, datos: ['$CEREBRO/a/../b.json'] } })).toBeNull()
  })

  it('mensajes del panel, acciones y versión mínima', () => {
    expect(leerMensajePanel({ tipo: 'pedir', fuente: 'ext:$CEREBRO/x.json' })).toEqual({ tipo: 'pedir', fuente: 'ext:$CEREBRO/x.json' })
    expect(leerMensajePanel({ tipo: 'pedir', fuente: 'pulso:venta' })).toBeNull()
    expect(leerMensajePanel({ tipo: 'foto' })).toBeNull()
    expect(textoDeAccion('chat:censar', m)).toBe('Corre el censo de la demo.')
    expect(textoDeAccion('chat:borrar-todo', m)).toBeNull()
    expect(urlDeAccion('url:https://ejemplo.mx/oferta')).toBe('https://ejemplo.mx/oferta')
    expect(urlDeAccion('url:http://ejemplo.mx')).toBeNull()
    expect(urlDeAccion('url:https://a:b@ejemplo.mx')).toBeNull()
    expect(urlDeAccion('url:javascript:alert(1)')).toBeNull()
    expect(cumpleVersion('>=0.2.0', '0.2.29')).toBe(true)
    expect(cumpleVersion('>=0.2.0', '0.1.3')).toBe(false)
    expect(cumpleVersion('^0.2.0', '0.3.0')).toBe(false)
    expect(cumpleVersion('>=0.2.0', null)).toBeNull()
    expect(idTarea('demo', 'semanal')).toBe('ext-demo--semanal')
    expect(leerIdTarea('ext-demo--semanal')).toEqual({ extension: 'demo', tarea: 'semanal' })
    expect(leerIdTarea('morning-briefing')).toBeNull()
  })
})

describe('fuente ext: con disco', () => {
  const m = leerManifiesto(MANIFIESTO)!
  const dir = () => join(cerebro, '.claude', 'memory', 'extensiones', 'demo')

  it('ok con fecha; no existe = vacío; JSON roto = vacío con error; lo no declarado, negado', () => {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(join(dir(), 'datos.json'), '{"canales":3}')
    writeFileSync(join(cerebro, '.claude', 'memory', 'RETRATO.json'), '{"privado":true}')
    const r = resolverFuenteExt('ext:$CEREBRO/.claude/memory/extensiones/demo/datos.json', m, { cerebro, datos: null })
    expect(r.estado).toBe('ok'); expect(r.valor).toEqual({ canales: 3 }); expect(r.fecha).toBeTruthy()
    expect(resolverFuenteExt('ext:$DATOS/cache.json', m, { cerebro, datos: join(T, 'nada') }).estado).toBe('vacio')
    writeFileSync(join(dir(), 'datos.json'), '{roto')
    expect(resolverFuenteExt('ext:$CEREBRO/.claude/memory/extensiones/demo/datos.json', m, { cerebro, datos: null })).toMatchObject({ estado: 'vacio', error: 'JSON roto' })
    expect(resolverFuenteExt('ext:$CEREBRO/.claude/memory/RETRATO.json', m, { cerebro, datos: null }).estado).toBe('negado')
    expect(resolverFuenteExt('ext:$CEREBRO/.claude/settings.local.json', m, { cerebro, datos: null }).estado).toBe('negado')
  })

  it('un enlace que sale de la carpeta del permiso se niega aunque quede dentro del cerebro', () => {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(join(cerebro, '.claude', 'memory', 'secreto.json'), '{"no":1}')
    symlinkSync(join(cerebro, '.claude', 'memory', 'secreto.json'), join(dir(), 'enlace.json'))
    expect(resolverFuenteExt('ext:$CEREBRO/.claude/memory/extensiones/demo/enlace.json', m, { cerebro, datos: null }).estado).toBe('negado')
  })
})

describe('tienda', () => {
  it('el catálogo sale de la fuente configurable: carpeta o dueño/repo', () => {
    expect(fuenteCatalogo({ ARBRAIN_EXTENSIONES_FUENTE: catalogo }, [cerebro])).toMatchObject({ tipo: 'carpeta' })
    expect(fuenteCatalogo({ ARBRAIN_EXTENSIONES_FUENTE: 'arbrain-ai/arbrain-extensiones' }, [cerebro])).toMatchObject({ tipo: 'remoto', spec: 'arbrain-ai/arbrain-extensiones' })
    expect(fuenteCatalogo({ ARBRAIN_EXTENSIONES_FUENTE: 'no/existe/aqui' }, [cerebro])).toBeNull()
    // Copia del alumno: sin la carpeta del repo del autor, el catálogo publicado.
    expect(fuenteCatalogo({}, [cerebro])).toMatchObject({ tipo: 'remoto', spec: 'arbrain-ai/arbrain-extensiones' })
    const e = estado(deps([]))
    expect(e.catalogo).toMatchObject({ disponible: true, conectado: false, tipo: 'carpeta' })
    expect(e.extensiones).toHaveLength(1)
    expect(e.extensiones[0]).toMatchObject({ id: 'demo', nombre: 'Demo', version: '0.1.0', instalada: null, acerca: 'Una demo para probar la tienda.' })
    expect(JSON.stringify(e)).not.toContain(config)
  })

  it('instalar: pide el «Sí» y la llave; luego conecta, instala, guarda la llave 0600 y da de alta la tarea', async () => {
    const llamadas: string[][] = []
    const tareas = almacen()
    const d = deps(llamadas, tareas)
    const sinSi = await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { llaves: { demo_api_key: 'k-123' } }, d)
    expect(sinSi).toMatchObject({ status: 409, json: { necesitaConsentimiento: true } })
    const sinLlave = await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true }, d)
    expect(sinLlave).toMatchObject({ status: 422, json: { faltanLlaves: ['demo_api_key'] } })
    expect(llamadas).toEqual([])
    const ok = await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k-123', ajena: 'x' } }, d)
    expect(ok?.status).toBe(200)
    expect(llamadas.map(a => a.slice(0, 2).join(' '))).toEqual(['marketplace add', 'install demo@arbrain'])
    expect(llamadas[1]).toEqual(['install', 'demo@arbrain', '--scope', 'local'])
    expect(tareas.filas.map(f => [f.id, f.schedule])).toEqual([['ext-demo--semanal', '0 20 * * 0']])
    expect(readFileSync(llaves, 'utf8')).toBe('DEMO_API_KEY=k-123\n')
    expect(statSync(llaves).mode & 0o777).toBe(0o600)
    const e = estado(d)
    const demo = e.extensiones[0]
    expect(demo.instalada).toMatchObject({ version: '0.1.0', ambito: 'local' })
    expect(demo.llaves).toEqual([expect.objectContaining({ clave: 'demo_api_key', guardada: true })])
    expect(demo.tareas).toEqual([expect.objectContaining({ id: 'semanal', alta: true, estado: 'active' })])
    expect(JSON.stringify(e)).not.toContain('k-123')
  })

  it('falta un programa: no instala y dice cómo conseguirlo', async () => {
    escribirExtension('0.1.0', m => { m.requiere.programas = ['yt-dlp'] })
    const llamadas: string[][] = []
    const r = await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k' } }, deps(llamadas, almacen(), { programa: () => null }))
    expect(r).toMatchObject({ status: 422, json: { faltan: [expect.objectContaining({ tipo: 'programa', nombre: 'yt-dlp', ok: false })] } })
    expect(llamadas).toEqual([])
  })

  it('actualizar pone las tareas al día; quitar las da de baja y deja los datos del dueño', async () => {
    const llamadas: string[][] = []
    const tareas = almacen()
    const d = deps(llamadas, tareas)
    await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k' } }, d)
    tareas.filas[0].status = 'paused'
    escribirExtension('0.1.1')
    expect(estado(d).extensiones[0]).toMatchObject({ actualizable: true, version: '0.1.1' })
    const igual = await atenderExtensiones('POST', '/extensiones/demo/actualizar', new URLSearchParams(), {}, d)
    expect(igual).toMatchObject({ status: 200, json: { version: '0.1.1', tareas: { iguales: ['ext-demo--semanal'] } } })
    expect(tareas.filas[0].status).toBe('paused') // la pausa del dueño se respeta
    escribirExtension('0.1.2', m => { m.tareas[0].cada = '0 7 * * 1' })
    await atenderExtensiones('POST', '/extensiones/demo/actualizar', new URLSearchParams(), {}, d)
    expect(tareas.filas.map(f => f.schedule)).toEqual(['0 7 * * 1'])

    const datos = join(cerebro, '.claude', 'memory', 'extensiones', 'demo')
    mkdirSync(datos, { recursive: true }); writeFileSync(join(datos, 'universo.json'), '{}')
    const r = await atenderExtensiones('POST', '/extensiones/demo/quitar', new URLSearchParams(), {}, d)
    expect(r).toMatchObject({ status: 200, json: { bajas: ['ext-demo--semanal'] } })
    expect(tareas.filas).toEqual([])
    expect(leerInstaladas(config, cerebro).size).toBe(0)
    expect(existsSync(join(datos, 'universo.json'))).toBe(true)
    expect(llamadas.at(-1)).toEqual(['uninstall', 'demo@arbrain', '--scope', 'local', '-y'])
  })

  it('panel y fuente por HTTP: solo de la versión instalada y solo dentro de panel/', async () => {
    const d = deps([])
    expect(await atenderExtensiones('GET', '/extensiones/demo/panel/index.html', new URLSearchParams(), {}, d)).toMatchObject({ status: 404 })
    await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k' } }, d)
    const a = await atenderExtensiones('GET', '/extensiones/demo/panel/index.html', new URLSearchParams(), {}, d)
    expect(a && 'archivo' in a ? a.archivo.bytes.toString() : '').toContain('panel demo')
    const inst = leerInstaladas(config, cerebro).get('demo')!
    expect(archivoDelPanel(inst.installPath, '../arbrain.json')).toBeNull()
    expect(archivoDelPanel(inst.installPath, '..%2Farbrain.json')).toBeNull()
    expect(await atenderExtensiones('GET', '/extensiones/demo/panel/..%2Farbrain.json', new URLSearchParams(), {}, d)).toMatchObject({ status: 404 })
    const f = await atenderExtensiones('GET', '/extensiones/demo/fuente', new URLSearchParams({ f: 'ext:$CEREBRO/.claude/memory/RETRATO.json' }), {}, d)
    expect(f).toMatchObject({ status: 200, json: { estado: 'negado' } })
    expect(await atenderExtensiones('GET', '/extensiones/Demo/fuente', new URLSearchParams(), {}, d)).toMatchObject({ status: 400 })
  })
})

describe('tareas en el scheduler', () => {
  const m = leerManifiesto(MANIFIESTO) as Manifiesto

  it('alta, igual y baja', () => {
    const t = almacen()
    expect(darDeAlta('demo', m, t, () => 1).altas).toEqual(['ext-demo--semanal'])
    expect(darDeAlta('demo', m, t, () => 1).iguales).toEqual(['ext-demo--semanal'])
    t.crear({ id: 'morning-briefing', prompt: 'x', schedule: '0 6 * * *', nextRun: 1 })
    expect(darDeAlta('demo', { ...m, tareas: [] }, t, () => 1).bajas).toEqual(['ext-demo--semanal'])
    expect(darDeAlta('demo', m, t, () => { throw new Error('cron') }).invalidas).toEqual(['ext-demo--semanal'])
    expect(darDeBaja('demo', t)).toEqual([])
    expect(t.filas.map(f => f.id)).toEqual(['morning-briefing'])
  })

  it('la corrida usa la carpeta instalada, entorno mínimo y solo las llaves declaradas', async () => {
    const d = deps([])
    await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k-777' } }, d)
    const env = { ...process.env, OPENCLAW_GATEWAY_TOKEN: 'secreto-del-daemon', ANTHROPIC_API_KEY: 'sk-alumno' }
    const c = prepararCorrida('ext-demo--semanal', { cerebro, configDir: config, archivoLlaves: llaves, env })
    expect(c.cwd).toBe(cerebro)
    expect(c.env.DEMO_API_KEY).toBe('k-777')
    expect(c.env.OPENCLAW_GATEWAY_TOKEN).toBeUndefined()
    expect(c.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(c.env.PYTHONDONTWRITEBYTECODE).toBe('1')
    await correr(c.cmd, c.args, { cwd: c.cwd, env: c.env, timeout: 20_000 })
    const hecho = JSON.parse(readFileSync(join(cerebro, '.claude', 'memory', 'extensiones', 'demo', 'corrida.json'), 'utf8'))
    expect(hecho).toMatchObject({ args: ['estudio'], llave: 'k-777', token: null, anthropic: null })
    expect(resolve(hecho.raiz)).toContain(join('cache', 'arbrain', 'demo'))
    expect(hecho.datos).toBe(join(config, 'plugins', 'data', 'demo-arbrain'))
  })

  it('sin llave no corre; con la extensión quitada la fila sobra; un script que escapa no corre', async () => {
    const d = deps([])
    await atenderExtensiones('POST', '/extensiones/demo/instalar', new URLSearchParams(), { consentimiento: true, llaves: { demo_api_key: 'k' } }, d)
    const ctx = { cerebro, configDir: config, archivoLlaves: join(T, 'otras.env'), env: { PATH: process.env.PATH } }
    expect(() => prepararCorrida('ext-demo--semanal', ctx)).toThrow(/Falta la llave demo_api_key/)
    const inst = leerInstaladas(config, cerebro).get('demo')!
    const am = JSON.parse(readFileSync(join(inst.installPath, 'arbrain.json'), 'utf8'))
    am.tareas[0].corre = './scripts/enlace.mjs'
    writeFileSync(join(inst.installPath, 'arbrain.json'), JSON.stringify(am))
    symlinkSync(join(T, 'fuera.mjs'), join(inst.installPath, 'scripts', 'enlace.mjs'))
    writeFileSync(join(T, 'fuera.mjs'), 'console.log(1)'); chmodSync(join(T, 'fuera.mjs'), 0o755)
    expect(() => prepararCorrida('ext-demo--semanal', { ...ctx, archivoLlaves: llaves })).toThrow(/sale de la carpeta/)
    await atenderExtensiones('POST', '/extensiones/demo/quitar', new URLSearchParams(), {}, d)
    try { prepararCorrida('ext-demo--semanal', { ...ctx, archivoLlaves: llaves }); throw new Error('no lanzó') } catch (e) { expect((e as { sobra?: boolean }).sobra).toBe(true) }
  })
})

// ── Con el CLI de verdad (si existe y está el catálogo del repo): en una carpeta de Claude Code temporal ──
const CATALOGO_REPO = fileURLToPath(new URL('../../../../docs/builds/extensiones-2026-11-20/arbrain-extensiones', import.meta.url))
const hayCli = !!binarioClaude() && existsSync(join(CATALOGO_REPO, '.claude-plugin', 'marketplace.json')) && process.env.ARBRAIN_PRUEBA_CLI_REAL !== '0'

describe.skipIf(!hayCli)('con el CLI de Claude Code de verdad', () => {
  it('conecta el catálogo, instala mapa-de-negocio en ámbito local y la quita', async () => {
    mkdirSync(join(cerebro, '.claude', 'skills', 'canvas'), { recursive: true }) // la pide de la base
    const tareas = almacen()
    const d: DepsTienda = { ...deps([], tareas), env: { ARBRAIN_EXTENSIONES_FUENTE: CATALOGO_REPO, PATH: process.env.PATH }, claude: cliReal(cerebro, config) }
    const e0 = estado(d)
    expect(e0.extensiones.map(x => x.id)).toEqual(expect.arrayContaining(['mapa-de-negocio', 'competencia']))
    const r = await atenderExtensiones('POST', '/extensiones/mapa-de-negocio/instalar', new URLSearchParams(), {}, { ...d, programa: () => '/usr/bin/true' })
    if (r?.status !== 200 && 'json' in r!) throw new Error(JSON.stringify(r.json))
    const s = JSON.parse(readFileSync(join(cerebro, '.claude', 'settings.local.json'), 'utf8'))
    expect(s.enabledPlugins).toMatchObject({ 'mapa-de-negocio@arbrain': true })
    expect(leerInstaladas(config, cerebro).get('mapa-de-negocio')).toMatchObject({ scope: 'local' })
    const q = await atenderExtensiones('POST', '/extensiones/mapa-de-negocio/quitar', new URLSearchParams(), {}, d)
    expect(q?.status).toBe(200)
    expect(leerInstaladas(config, cerebro).has('mapa-de-negocio')).toBe(false)
  }, 60_000)
})
