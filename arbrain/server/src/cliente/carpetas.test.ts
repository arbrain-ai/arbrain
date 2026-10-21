/**
 * Seguridad del alumno (12 oct 2026), punto 1: carpetas abiertas una por una por la persona.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirCarpeta, carpetasAbiertas, cerrarCarpeta, validarCarpeta, type ValidarOpciones } from './carpetas.js'
import { contextoPolitica, decidirHerramienta, motivoRutaSecreta, type ContextoPolitica } from './politica-agentes.js'
import { rutaSoloApp } from './cofre.js'

let raiz = '', usuario = '', home = '', datos = '', proyecto = ''
let op: ValidarOpciones
const previo = process.env.ARBRAIN_CONFIG_DIR
beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-carpetas-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Arbrain'); datos = join(raiz, 'datos'); proyecto = join(usuario, 'Documents', 'tienda')
  for (const d of [home, datos, proyecto, join(usuario, '.ssh'), join(usuario, 'Library', 'Application Support', 'Google', 'Chrome'), join(usuario, '.config', 'algo')]) mkdirSync(d, { recursive: true })
  writeFileSync(join(proyecto, 'README.md'), '# tienda'); writeFileSync(join(proyecto, '.env'), 'X=1')
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
  const ctx = contextoPolitica({}, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') })
  op = { usuario, home, protegidas: ctx.protegidas, motivoSecreto: r => motivoRutaSecreta(r, { ...ctx, lecturaExtra: [] }) }
})
afterAll(() => { if (previo === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo; rmSync(raiz, { recursive: true, force: true }) })

describe('carpetas abiertas', () => {
  it('no se abre lo que no se debe', () => {
    for (const r of ['/', usuario, '~', raiz, join(usuario, '.ssh'), join(usuario, 'Library'), join(usuario, 'Library', 'Application Support', 'Google', 'Chrome'),
      join(usuario, '.config', 'algo'), datos, join(datos, 'config'), home, join(usuario, 'no-existe'), join(proyecto, 'README.md'), 'Documents/tienda', '/etc'])
      expect(validarCarpeta(r, op).ok, r).toBe(false)
    expect(validarCarpeta('~/Documents/tienda', op)).toEqual({ ok: true, ruta: proyecto })
  })
  it('sin abrirla: leer pide clic y escribir se niega; abierta: leer libre, escribir con clic, secretos negados', () => {
    const base: ContextoPolitica = { home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], sandbox: true }
    expect(decidirHerramienta('Read', { file_path: join(proyecto, 'README.md') }, base).tipo).toBe('confirmar')
    expect(decidirHerramienta('Write', { file_path: join(proyecto, 'x.md'), content: 'x' }, base).tipo).toBe('negar')
    expect(abrirCarpeta('~/Documents/tienda', op).ok).toBe(true)
    expect(carpetasAbiertas().map(c => c.ruta)).toEqual([proyecto])
    const ctx = contextoPolitica({ sandbox: true }, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') })
    expect(ctx.abiertas).toEqual([proyecto])
    expect(decidirHerramienta('Read', { file_path: join(proyecto, 'README.md') }, ctx).tipo).toBe('permitir')
    expect(decidirHerramienta('Bash', { command: `cat ${proyecto}/README.md` }, ctx).tipo).toBe('permitir')
    expect(decidirHerramienta('Grep', { pattern: 'tienda', path: proyecto }, ctx).tipo).toBe('permitir')
    expect(decidirHerramienta('Write', { file_path: join(proyecto, 'x.md'), content: 'x' }, ctx).tipo).toBe('confirmar')
    expect(decidirHerramienta('Bash', { command: `echo x > ${proyecto}/x.md` }, ctx).tipo).toBe('confirmar')
    expect(decidirHerramienta('Read', { file_path: join(proyecto, '.env') }, ctx).tipo).toBe('negar')
    // Sigue cerrada cualquier otra carpeta.
    expect(decidirHerramienta('Read', { file_path: join(usuario, 'Documents', 'otra.md') }, ctx).tipo).toBe('confirmar')
    expect(cerrarCarpeta(proyecto)).toEqual([])
    expect(decidirHerramienta('Read', { file_path: join(proyecto, 'README.md') }, contextoPolitica({ sandbox: true }, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') })).tipo).toBe('confirmar')
  })
  it('la lista vive en la carpeta protegida: el agente no se abre carpetas', () => {
    const ctx = contextoPolitica({ sandbox: true }, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') })
    expect(decidirHerramienta('Write', { file_path: join(datos, 'config', 'carpetas-abiertas.json'), content: '{"carpetas":[{"ruta":"/"}]}' }, ctx).tipo).toBe('negar')
    expect(rutaSoloApp('POST', '/carpetas')).toBe(true)
    expect(rutaSoloApp('GET', '/carpetas')).toBe(true)
  })
})
