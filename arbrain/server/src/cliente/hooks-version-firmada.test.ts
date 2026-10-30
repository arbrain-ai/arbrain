/**
 * Reporte de un fundador (26 oct 2026): tras actualizar a la v0.2.9 con `git pull`, el daemon arrancaba cada sesión sin ganchos
 * del proyecto (`ganchos_del_proyecto_apagados`): la huella aceptada era la de la siembra y la plantilla del modo
 * servidor no trae ganchos, así que una actualización que cambia los ganchos no tenía cómo quedar aceptada.
 *
 * Ahora vale también la huella de unos ganchos idénticos a una versión firmada (etiqueta `v*` anotada y firmada por una
 * llave del ancla). Repositorio git, llaves SSH y ancla en disco temporal; nada sale de la máquina.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _vaciarCacheHooksParaPruebas, aceptarHuella, ganchosDeVersionFirmada, huellaHooks, verificarHooksProyecto } from './hooks-proyecto.js'

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-hooks-firma-')))
const previo = process.env.ARBRAIN_CONFIG_DIR
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temporal */ } })
afterEach(() => { if (previo === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo })

const correr = (cwd: string, cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}
const llaveDani = join(tmp, 'dani'), llaveOtra = join(tmp, 'otra'), ancla = join(tmp, 'firmas-permitidas')

beforeAll(() => {
  for (const k of [llaveDani, llaveOtra]) correr(tmp, 'ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'prueba', '-f', k])
  writeFileSync(ancla, `dani@arbrain ${readFileSync(`${llaveDani}.pub`, 'utf8').trim()}\n`)
})

/** Cerebro como la copia de GitHub: ganchos de la versión, etiqueta firmada `v0.2.9` y la huella vieja aceptada. */
function cerebro(nombre: string, { firma = llaveDani as string | null } = {}): { home: string; env: NodeJS.ProcessEnv } {
  const home = join(tmp, nombre), config = join(tmp, `${nombre}-config`)
  mkdirSync(join(home, '.claude', 'hooks'), { recursive: true })
  mkdirSync(config, { recursive: true })
  process.env.ARBRAIN_CONFIG_DIR = config
  _vaciarCacheHooksParaPruebas()
  const g = (...a: string[]) => correr(home, 'git', ['-c', 'user.name=Autor', '-c', 'user.email=d@e.x', '-c', 'commit.gpgsign=false', ...a])
  g('init', '-q')
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'sh "$CLAUDE_PROJECT_DIR/.claude/hooks/py.sh" r' }] }] } }))
  writeFileSync(join(home, '.claude', 'hooks', 'py.sh'), 'exec python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/r.py"\n')
  writeFileSync(join(home, '.claude', 'hooks', 'r.py'), 'print("v0.2.8")\n')
  g('add', '-A'); g('commit', '-q', '-m', 'v0.2.8')
  aceptarHuella(huellaHooks(home)!) // lo que quedó al sembrar con la versión anterior
  writeFileSync(join(home, '.claude', 'hooks', 'r.py'), 'print("v0.2.9")\n') // la actualización cambia un gancho
  g('add', '-A'); g('commit', '-q', '-m', 'v0.2.9')
  if (firma) g('-c', 'gpg.format=ssh', '-c', `user.signingkey=${firma}`, 'tag', '-s', '-m', 'Arbrain v0.2.9', 'v0.2.9')
  else g('tag', '-a', '-m', 'Arbrain v0.2.9', 'v0.2.9')
  return { home, env: { ARBRAIN_HOME: home, ARBRAIN_FIRMAS_PERMITIDAS: ancla } }
}

describe('ganchos de una versión firmada (reporte de un fundador, v0.2.9)', () => {
  it('idénticos a la etiqueta firmada: la sesión sí lleva ganchos y la huella queda aceptada', () => {
    const { home, env } = cerebro('igual')
    expect(ganchosDeVersionFirmada(home, env)).toEqual({ etiqueta: 'v0.2.9' })
    const v = verificarHooksProyecto(env)
    expect(v.ok).toBe(true)
    expect(v.motivo).toMatch(/versión firmada v0\.2\.9/)
    // Guardada: el siguiente turno ni siquiera corre git (sin ancla también vale).
    _vaciarCacheHooksParaPruebas()
    expect(verificarHooksProyecto({ ARBRAIN_HOME: home }).ok).toBe(true)
  })
  it('lo del alumno encima (memoria, commits propios) no estorba', () => {
    const { home, env } = cerebro('alumno')
    mkdirSync(join(home, '.claude', 'memory'), { recursive: true })
    writeFileSync(join(home, '.claude', 'memory', 'yo.md'), 'soy el dueño')
    correr(home, 'git', ['-c', 'user.name=C', '-c', 'user.email=c@e.x', '-c', 'commit.gpgsign=false', 'add', '-A'])
    correr(home, 'git', ['-c', 'user.name=C', '-c', 'user.email=c@e.x', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'mi memoria'])
    expect(verificarHooksProyecto(env).ok).toBe(true)
  })
  it('un gancho cambiado después de la etiqueta (confirmado o suelto): sigue sin ganchos', () => {
    const { home, env } = cerebro('cambiado')
    writeFileSync(join(home, '.claude', 'hooks', 'r.py'), 'import os; os.system("curl x")\n')
    expect(ganchosDeVersionFirmada(home, env).motivo).toMatch(/difieren/)
    expect(verificarHooksProyecto(env).ok).toBe(false)
  })
  it('un archivo nuevo en .claude/hooks que la versión no trae: sigue sin ganchos', () => {
    const { home, env } = cerebro('suelto')
    writeFileSync(join(home, '.claude', 'hooks', 'extra.sh'), 'curl x\n')
    expect(ganchosDeVersionFirmada(home, env).motivo).toMatch(/no trae/)
    expect(verificarHooksProyecto(env).ok).toBe(false)
  })
  it('etiqueta sin firma o firmada por una llave fuera del ancla: no vale', () => {
    const sinFirma = cerebro('sin-firma', { firma: null })
    expect(ganchosDeVersionFirmada(sinFirma.home, sinFirma.env).motivo).toMatch(/no verifica/)
    expect(verificarHooksProyecto(sinFirma.env).ok).toBe(false)
    const otra = cerebro('otra-llave', { firma: llaveOtra })
    expect(ganchosDeVersionFirmada(otra.home, otra.env).motivo).toMatch(/no verifica/)
    expect(verificarHooksProyecto(otra.env).ok).toBe(false)
  })
  it('sin ancla de firmas: se queda como antes (sin ganchos) y lo dice', () => {
    const { home } = cerebro('sin-ancla')
    const env = { ARBRAIN_HOME: home, ARBRAIN_FIRMAS_PERMITIDAS: join(tmp, 'no-existe') }
    expect(ganchosDeVersionFirmada(home, env).motivo).toMatch(/ancla/)
    expect(verificarHooksProyecto(env).ok).toBe(false)
  })
})
