/**
 * Marcador de edición del repo (carril O, red team A3, 11 oct 2026): la copia del alumno trae `arbrain/EDICION` y nace
 * cliente sin variables; el repo de Daniel no lo trae y nada cambia. Todo en temporales.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIR_ARBRAIN, RUTAS_MARCADOR_REPO, aplicarMarcadorRepo, esEdicionCliente, leerMarcador, marcadorRepoCliente } from './edicion.js'

const CLAVES = ['ARBRAIN_EDICION', 'ARBRAIN_CONFIG_DIR', 'ARBRAIN_DATA_DIR']
let previo: Record<string, string | undefined> = {}
beforeEach(() => { previo = Object.fromEntries(CLAVES.map(k => [k, process.env[k]])) })
afterEach(() => { for (const k of CLAVES) { if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k] } })

const marcador = (texto: string) => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'edicion-')), 'EDICION')
  writeFileSync(ruta, texto)
  return ruta
}

describe('marcador del repo', () => {
  it('busca arbrain/server/EDICION y arbrain/EDICION junto a este módulo', () => {
    expect(RUTAS_MARCADOR_REPO[0].endsWith(join('server', 'EDICION'))).toBe(true)
    expect(RUTAS_MARCADOR_REPO[1].endsWith(join('arbrain', 'EDICION'))).toBe(true)
  })

  // En la copia del alumno el marcador SÍ existe (lo escribe el generador): ahí vale la prueba de abajo.
  const enLaCopia = RUTAS_MARCADOR_REPO.some(r => existsSync(r))
  it.runIf(enLaCopia)('en la copia del alumno existe y dice cliente: sin variable, el proceso nace cliente', () => {
    expect(marcadorRepoCliente()).toBe(true)
    const env: NodeJS.ProcessEnv = {}
    expect(aplicarMarcadorRepo(env)).toBe(true)
    expect(env.ARBRAIN_EDICION).toBe('cliente')
  })

  it.skipIf(enLaCopia)('en este checkout (repo de Daniel o su worktree) no existe: la edición sigue siendo la de Daniel', () => {
    for (const r of RUTAS_MARCADOR_REPO) expect(existsSync(r)).toBe(false)
    expect(marcadorRepoCliente()).toBe(false)
    const env: NodeJS.ProcessEnv = {}
    expect(aplicarMarcadorRepo(env)).toBe(false)
    expect(env.ARBRAIN_EDICION).toBeUndefined()
  })

  it('lee la primera línea útil: comentarios y vacías no cuentan', () => {
    expect(leerMarcador(marcador('# copia del alumno\n\n  Cliente  \n'))).toBe('cliente')
    expect(leerMarcador(marcador('# solo comentario\n'))).toBe('')
    expect(leerMarcador(join(tmpdir(), 'no-existe-edicion-xyz'))).toBe('')
  })

  it('con marcador cliente y sin variable, fija ARBRAIN_EDICION=cliente (lo heredan los hijos)', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(aplicarMarcadorRepo(env, [join(tmpdir(), 'no-existe-xyz'), marcador('cliente\n')])).toBe(true)
    expect(env.ARBRAIN_EDICION).toBe('cliente')
    expect(esEdicionCliente(env)).toBe(true)
  })

  it('la variable explícita manda sobre el marcador (también para salir a propósito)', () => {
    const rutas = [marcador('cliente\n')]
    const original: NodeJS.ProcessEnv = { ARBRAIN_EDICION: 'original' }
    expect(aplicarMarcadorRepo(original, rutas)).toBe(false)
    expect(esEdicionCliente(original)).toBe(false)
    const cliente: NodeJS.ProcessEnv = { ARBRAIN_EDICION: 'cliente' }
    expect(aplicarMarcadorRepo(cliente, rutas)).toBe(false)
    expect(esEdicionCliente(cliente)).toBe(true)
  })

  it('un marcador con otro valor no convierte a nadie', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(aplicarMarcadorRepo(env, [marcador('original\n')])).toBe(false)
    expect(esEdicionCliente(env)).toBe(false)
  })
})

describe('carpeta de configuración', () => {
  it('Daniel sin carpeta explícita: ~/.config/arbrain (sin cambios)', () => {
    delete process.env.ARBRAIN_EDICION; delete process.env.ARBRAIN_CONFIG_DIR; delete process.env.ARBRAIN_DATA_DIR
    expect(DIR_ARBRAIN()).toBe(join(homedir(), '.config/arbrain'))
  })
  it('cliente sin carpeta explícita (copia fuera de la app): nunca la de Daniel', () => {
    delete process.env.ARBRAIN_CONFIG_DIR; delete process.env.ARBRAIN_DATA_DIR
    process.env.ARBRAIN_EDICION = 'cliente'
    expect(DIR_ARBRAIN()).toBe(join(homedir(), '.config/arbrain-cliente'))
  })
  it('la carpeta explícita manda en ambas ediciones', () => {
    process.env.ARBRAIN_CONFIG_DIR = '/tmp/x-config'
    process.env.ARBRAIN_EDICION = 'cliente'
    expect(DIR_ARBRAIN()).toBe('/tmp/x-config')
  })
})
