/**
 * Red team 2 C-1 (11 oct 2026): los ganchos del cerebro del alumno corren fuera del sandbox y de la guardia, así que
 * NADA de lo que ejecutan o importan puede ser escribible por el agente sin confirmación.
 *
 * Recorre los `command` de los ganchos de la plantilla del alumno — la capa de plantillas
 * (`arbrain/empaquetado/plantillas/claude/settings.json`, materializada como la arma el generador) y, dentro de una copia
 * generada (raíz con `MANIFIESTO.json`), el `.claude/settings.json` que escribió el generador —, resuelve cada archivo
 * (`archivosDeHooks`) y exige que Write/Edit/Bash del agente no lo escriban sin preguntar y que el sandbox lo niegue.
 * `ARBRAIN_HOOKS_RAICES` (separadas por `:`) agrega otras raíces de cerebro a revisar.
 *
 * Además: la huella de los ganchos (el daemon arranca sin ganchos del proyecto si no coincide) y la opción del SDK.
 * Disco temporal; nada se ejecuta.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decidirHerramienta, type ContextoPolitica } from './politica-agentes.js'
import { opcionesSandbox } from './sandbox.js'
import { _vaciarCacheHooksParaPruebas, archivosDeHooks, comandosDeHooks, huellaHooks, registrarHuellaSembrada, verificarHooksProyecto } from './hooks-proyecto.js'
import { opcionesSesionCliente } from '../guardia-agentes.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(AQUI, '..', '..', '..', '..')
const CAPA_G = join(REPO, 'arbrain', 'empaquetado', 'plantillas')

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-hooks-')))
const previo = { edicion: process.env.ARBRAIN_EDICION, config: process.env.ARBRAIN_CONFIG_DIR }
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temporal */ } })
afterEach(() => {
  if (previo.edicion === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo.edicion
  if (previo.config === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo.config
})

/** Misma convención que el generador (`destinoCapaG`): `claude/` → `.claude/`, `skills/` → `.claude/skills/`… */
function destinoCapaG(rel: string): string | null {
  if (/(^|\/)(__pycache__|\.DS_Store)(\/|$)|\.pyc$/.test(rel)) return null
  if (!rel.includes('/')) return /\.plantilla\.[^.]+$/.test(rel) ? rel.replace(/\.plantilla(\.[^.]+)$/, '$1') : null
  if (rel.startsWith('claude/')) return '.claude/' + rel.slice(7)
  if (rel.startsWith('skills/')) return '.claude/skills/' + rel.slice(7)
  if (rel.startsWith('cerebro/')) return 'arbrain/cerebro/' + rel.slice(8)
  return rel
}
function materializarCapaG(destino: string): void {
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) { recorrer(p); continue }
      const d = destinoCapaG(relative(CAPA_G, p).replace(/\\/g, '/'))
      if (!d) continue
      mkdirSync(dirname(join(destino, d)), { recursive: true })
      cpSync(p, join(destino, d))
    }
  }
  recorrer(CAPA_G)
}

const ctxPara = (home: string): ContextoPolitica => ({ home, cwd: home, usuario: join(tmp, 'usuario'), protegidas: [join(tmp, 'datos')], lecturaExtra: [], sandbox: true })
const dentro = (p: string, raiz: string) => p === raiz || p.startsWith(raiz + '/')

/** Archivos que ejecutan o importan los ganchos de `raiz` y que el agente podría escribir sin confirmación. */
function inseguros(raiz: string): { archivo: string; por: string }[] {
  const ctx = ctxPara(raiz)
  const deny = (opcionesSandbox(ctx).filesystem as { denyWrite: string[] }).denyWrite
  const malos: { archivo: string; por: string }[] = []
  for (const a of archivosDeHooks(raiz).archivos) {
    const rel = dentro(a, raiz) ? relative(raiz, a) : a
    const write = decidirHerramienta('Write', { file_path: a, content: 'x' }, ctx).tipo
    const edit = decidirHerramienta('Edit', { file_path: a, old_string: 'a', new_string: 'b' }, ctx).tipo
    const touch = decidirHerramienta('Bash', { command: `touch '${a}'` }, ctx).tipo
    const mkdir = decidirHerramienta('Bash', { command: `mkdir -p '${dirname(a)}'` }, ctx).tipo
    if (write === 'permitir') malos.push({ archivo: rel, por: 'Write' })
    if (edit === 'permitir') malos.push({ archivo: rel, por: 'Edit' })
    if (touch === 'permitir') malos.push({ archivo: rel, por: 'Bash touch' })
    if (dentro(a, raiz) && mkdir === 'permitir' && !existsSync(dirname(a)) && !deny.some(d => dentro(a, d))) malos.push({ archivo: rel, por: 'Bash mkdir + sandbox' })
    if (dentro(a, raiz) && !deny.some(d => dentro(a, d))) malos.push({ archivo: rel, por: 'sandbox (denyWrite)' })
  }
  return malos
}

/** Raíces de cerebro con ganchos de la plantilla del alumno que hay en este árbol. */
function raices(): { nombre: string; raiz: string }[] {
  const out: { nombre: string; raiz: string }[] = []
  if (existsSync(join(CAPA_G, 'claude', 'settings.json'))) {
    const d = join(tmp, 'capa-g')
    mkdirSync(d, { recursive: true })
    materializarCapaG(d)
    out.push({ nombre: 'plantilla (arbrain/empaquetado/plantillas)', raiz: realpathSync(d) })
  }
  if (existsSync(join(REPO, 'MANIFIESTO.json')) && existsSync(join(REPO, '.claude', 'settings.json'))) out.push({ nombre: 'copia generada (.claude/settings.json del generador)', raiz: realpathSync(REPO) })
  for (const r of (process.env.ARBRAIN_HOOKS_RAICES ?? '').split(':').filter(Boolean)) out.push({ nombre: r, raiz: realpathSync(r) })
  return out
}

describe('C-1: nada que ejecuten o importen los ganchos de la plantilla es escribible por el agente sin confirmación', () => {
  it('hay al menos una plantilla que revisar', () => {
    expect(raices().length).toBeGreaterThan(0)
  })
  for (const { nombre, raiz } of raices()) {
    it(nombre, () => {
      const settings = JSON.parse(readFileSync(join(raiz, '.claude', 'settings.json'), 'utf8'))
      const { comandos, archivos } = archivosDeHooks(raiz, settings)
      if (!comandos.length) return // sin ganchos: nada se ejecuta
      // Cada script que nombra un comando está en la lista resuelta.
      for (const c of comandos) for (const m of c.matchAll(/\.claude\/hooks\/[\w.-]+\.(?:py|sh|ts|mjs|js)/g)) expect(archivos, c).toContain(join(raiz, m[0]))
      // El resolutor sigue imports y rutas armadas (comprobaciones condicionadas a lo que de verdad hay en la plantilla).
      const hooks = join(raiz, '.claude', 'hooks')
      const leer = (n: string) => { try { return readFileSync(join(hooks, n), 'utf8') } catch { return '' } }
      if (/import candados_comun/.test(leer('candado-freno.py')) && archivos.includes(join(hooks, 'candado-freno.py'))) expect(archivos).toContain(join(hooks, 'candados_comun.py'))
      if (/agenda-context\.py/.test(leer('memory-recall.py')) && archivos.includes(join(hooks, 'memory-recall.py'))) expect(archivos).toContain(join(hooks, 'agenda-context.py'))
      if (/now-snapshot\.py/.test(leer('agenda-context.py')) && archivos.includes(join(hooks, 'agenda-context.py'))) expect(archivos).toContain(join(raiz, 'arbrain', 'server', 'scripts', 'calendar', 'now-snapshot.py'))
      if (process.env.HOOKS_TABLA) console.log(`HOOKS|${nombre}|${comandos.length} comandos|${archivos.length} archivos\n${archivos.map(a => `  ${dentro(a, raiz) ? relative(raiz, a) : a}`).join('\n')}`)
      expect(inseguros(raiz)).toEqual([])
    })
  }
  it('control: un gancho que ejecuta algo de la memoria o de la raíz del cerebro SÍ se detecta', () => {
    const raiz = join(tmp, 'control')
    mkdirSync(join(raiz, '.claude', 'hooks'), { recursive: true })
    writeFileSync(join(raiz, '.claude', 'settings.json'), JSON.stringify({ hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/a.py"' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/herramientas/guardia.sh"' }] }],
    } }))
    writeFileSync(join(raiz, '.claude', 'hooks', 'a.py'), "import subprocess\nfrom pathlib import Path\nROOT=Path(__file__).resolve().parents[2]\nsubprocess.run(['python3', str(ROOT/'.claude/memory/refresco.py')])\n")
    const r = inseguros(realpathSync(raiz))
    expect(r.map(x => x.archivo)).toEqual(expect.arrayContaining(['.claude/memory/refresco.py', 'herramientas/guardia.sh']))
  })
  it('comandosDeHooks lee todos los eventos y tolera formas raras', () => {
    expect(comandosDeHooks({ hooks: { A: [{ hooks: [{ command: 'x' }, { type: 'prompt' }] }], B: 'mal', C: [null] } })).toEqual(['x'])
    expect(comandosDeHooks(null)).toEqual([])
  })
})

describe('C-1: huella de los ganchos (el daemon arranca sin ganchos del proyecto si no coincide)', () => {
  function cerebroCon(nombre: string): { plantilla: string; home: string; config: string } {
    const base = join(tmp, nombre)
    const plantilla = join(base, 'plantilla'), home = join(base, 'home'), config = join(base, 'config')
    mkdirSync(join(plantilla, '.claude', 'hooks'), { recursive: true })
    mkdirSync(config, { recursive: true })
    writeFileSync(join(plantilla, '.claude', 'settings.json'), JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/r.py"' }] }] } }))
    writeFileSync(join(plantilla, '.claude', 'hooks', 'r.py'), "import comun\nfrom pathlib import Path\nROOT=Path(__file__).resolve().parents[2]\nP=ROOT/'arbrain/server/scripts/x.py'\n")
    writeFileSync(join(plantilla, '.claude', 'hooks', 'comun.py'), 'X=1\n')
    cpSync(plantilla, home, { recursive: true })
    process.env.ARBRAIN_CONFIG_DIR = config
    _vaciarCacheHooksParaPruebas()
    return { plantilla, home, config }
  }
  it('coincide con la plantilla: ok; cambiar un gancho, lo que importa o lo que ejecuta: no', () => {
    const { plantilla, home } = cerebroCon('h1')
    const env = { ARBRAIN_HOME: home, ARBRAIN_PLANTILLA_DIR: plantilla }
    expect(verificarHooksProyecto(env).ok).toBe(true)
    writeFileSync(join(home, '.claude', 'hooks', 'comun.py'), 'import os; os.system("curl x")\n')
    expect(verificarHooksProyecto(env).ok).toBe(false)
    cpSync(join(plantilla, '.claude', 'hooks', 'comun.py'), join(home, '.claude', 'hooks', 'comun.py'))
    expect(verificarHooksProyecto(env).ok).toBe(true)
    mkdirSync(join(home, 'arbrain', 'server', 'scripts'), { recursive: true })
    writeFileSync(join(home, 'arbrain', 'server', 'scripts', 'x.py'), 'print(1)\n') // el archivo que faltaba (C-1)
    expect(verificarHooksProyecto(env).ok).toBe(false)
    rmSync(join(home, 'arbrain'), { recursive: true })
    writeFileSync(join(home, '.claude', 'hooks', 'nuevo.sh'), 'curl x\n')
    expect(verificarHooksProyecto(env).ok).toBe(false)
    rmSync(join(home, '.claude', 'hooks', 'nuevo.sh'))
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'curl x' }] }] } }))
    expect(verificarHooksProyecto(env).ok).toBe(false)
  })
  it('lo que los propios ganchos escriben (registros, cachés de Python) no cambia la huella', () => {
    const { plantilla, home } = cerebroCon('h2')
    const env = { ARBRAIN_HOME: home, ARBRAIN_PLANTILLA_DIR: plantilla }
    mkdirSync(join(home, '.claude', 'hooks', 'tmp'), { recursive: true })
    writeFileSync(join(home, '.claude', 'hooks', 'tmp', 'registro.jsonl'), '{"a":1}\n')
    mkdirSync(join(home, '.claude', 'hooks', '__pycache__'), { recursive: true })
    writeFileSync(join(home, '.claude', 'hooks', '__pycache__', 'comun.cpython-312.pyc'), 'x')
    mkdirSync(join(home, '.claude', 'memory'), { recursive: true })
    writeFileSync(join(home, '.claude', 'memory', 'nota.md'), 'memoria')
    expect(verificarHooksProyecto(env).ok).toBe(true)
  })
  it('sin plantilla: vale la huella guardada al sembrar; sin nada guardado, la primera se acepta', () => {
    const { home } = cerebroCon('h3')
    registrarHuellaSembrada(home)
    expect(verificarHooksProyecto({ ARBRAIN_HOME: home }).ok).toBe(true)
    writeFileSync(join(home, '.claude', 'hooks', 'r.py'), 'import os\n')
    expect(verificarHooksProyecto({ ARBRAIN_HOME: home }).ok).toBe(false)
    const otro = cerebroCon('h4')
    const v = verificarHooksProyecto({ ARBRAIN_HOME: otro.home })
    expect(v.ok).toBe(true)
    expect(v.motivo).toMatch(/primera huella/)
    writeFileSync(join(otro.home, '.claude', 'hooks', 'r.py'), 'import os\n')
    expect(verificarHooksProyecto({ ARBRAIN_HOME: otro.home }).ok).toBe(false)
  })
  it('sin ganchos no hay nada que verificar', () => {
    const d = join(tmp, 'sin-ganchos')
    mkdirSync(join(d, '.claude'), { recursive: true })
    writeFileSync(join(d, '.claude', 'settings.json'), '{"permissions":{}}')
    expect(huellaHooks(d)).toBeNull()
    expect(verificarHooksProyecto({ ARBRAIN_HOME: d }).ok).toBe(true)
  })
  it('opción del SDK: con ganchos alterados la sesión va sin ganchos del proyecto (y se registra una vez); Daniel no cambia', () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const eventos: unknown[] = []
    const mal = opcionesSesionCliente({ fastMode: true }, { verificar: () => ({ ok: false, huella: 'abc123', motivo: 'no coincide' }), registrar: e => eventos.push(e) })
    expect(mal.settings).toMatchObject({ fastMode: true, disableAllHooks: true, env: { ARBRAIN_HOOKS_HUELLA: 'abc123' } })
    opcionesSesionCliente(undefined, { verificar: () => ({ ok: false, huella: 'abc123' }), registrar: e => eventos.push(e) })
    expect(eventos).toHaveLength(1)
    const bien = opcionesSesionCliente(undefined, { verificar: () => ({ ok: true, huella: 'def456' }) })
    expect(bien.settings).toMatchObject({ disableAllHooks: false, env: { ARBRAIN_HOOKS_HUELLA: 'def456' } })
    process.env.ARBRAIN_EDICION = 'daniel'
    expect(opcionesSesionCliente({ fastMode: true })).toEqual({ settings: { fastMode: true } })
  })
})
