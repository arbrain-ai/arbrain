/**
 * Red team de la noche de seguridad (21→22 oct 2026, carril 2-APP-ALUMNO), lo que se cierra en la política:
 *   M1  un recorrido recursivo (Grep, Glob, grep -r, rg, find, tar, cp -r…) cuya raíz CONTIENE llaves, sesiones o la
 *       carpeta de datos de la app se niega, ni con clic (lo aprobado corre fuera del sandbox).
 *   M3  la sesión de Claude Code y de Codex del usuario (`~/.claude`, `~/.claude.json`, `.credentials.json`, `~/.codex`)
 *       cuenta como secreto; el `.claude/` del cerebro sigue con su regla.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { contextoPolitica, decidirHerramienta, ancestroSensible } from './politica-agentes.js'
import { validarCarpeta } from './carpetas.js'
import { opcionesSandbox } from './sandbox.js'

const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-rtn-')))
afterAll(() => rmSync(raiz, { recursive: true, force: true }))
const usuario = join(raiz, 'u')
const home = join(usuario, 'Arbrain')
const datos = join(usuario, 'Library', 'Application Support', 'ai.arbrain.servidor', 'daemon')
for (const d of [home, join(home, '.claude', 'memory'), join(datos, 'config'), join(usuario, '.claude'), join(usuario, '.codex'), join(usuario, 'Documents', 'proyecto'), join(usuario, 'Library', 'Caches')]) mkdirSync(d, { recursive: true })
writeFileSync(join(usuario, '.claude', '.credentials.json'), '{}')
writeFileSync(join(usuario, '.claude.json'), '{}')
writeFileSync(join(datos, 'config', 'acceso.json'), '{}')
const ctx = contextoPolitica({ sandbox: true, abiertas: [] }, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') })
const tipo = (h: string, i: unknown) => decidirHerramienta(h, i, ctx).tipo

describe('M3: la sesión de Claude Code y Codex del usuario es secreta', () => {
  it('Read, Grep y Bash sobre ~/.claude, ~/.claude.json, .credentials.json y ~/.codex: negar', () => {
    expect(tipo('Read', { file_path: join(usuario, '.claude', '.credentials.json') })).toBe('negar')
    expect(tipo('Read', { file_path: '~/.claude.json' })).toBe('negar')
    expect(tipo('Read', { file_path: '~/.claude/projects/x/abc.jsonl' })).toBe('negar')
    expect(tipo('Read', { file_path: '~/.codex/auth.json' })).toBe('negar')
    expect(tipo('Grep', { pattern: 'sk-ant', path: '~/.claude' })).toBe('negar')
    expect(tipo('Bash', { command: 'cat ~/.claude/.credentials.json' })).toBe('negar')
    expect(tipo('Bash', { command: 'cat "$HOME/.claude.json"' })).toBe('negar')
    expect(tipo('Bash', { command: 'cat .credentials.json' })).toBe('negar')
  })
  it('el .claude/ del cerebro sigue igual: la memoria se lee y se escribe', () => {
    expect(tipo('Read', { file_path: join(home, '.claude', 'memory', 'MEMORY.md') })).toBe('permitir')
    expect(tipo('Write', { file_path: join(home, '.claude', 'memory', 'nota.md'), content: 'x' })).toBe('permitir')
  })
  it('no se puede abrir ~/.claude ni ~/.codex como carpeta', () => {
    const op = { usuario, home, protegidas: ctx.protegidas, motivoSecreto: () => null }
    expect(validarCarpeta(join(usuario, '.claude'), op).ok).toBe(false)
    expect(validarCarpeta(join(usuario, '.codex'), op).ok).toBe(false)
  })
  it('el sandbox niega leer la sesión', () => {
    const deny = (opcionesSandbox(ctx).filesystem as { denyRead: string[] }).denyRead
    for (const d of ['.claude', '.claude.json', '.codex']) expect(deny).toContain(join(usuario, d))
  })
})

describe('M1: recorrer una carpeta que contiene secretos se niega, ni con clic', () => {
  it('ancestroSensible ve la carpeta de datos dentro de ~/Library', () => {
    expect(ancestroSensible(join(usuario, 'Library'), ctx)).toBeTruthy()
    expect(ancestroSensible(usuario, ctx)).toBeTruthy()
    expect(ancestroSensible(join(usuario, 'Documents'), ctx)).toBeNull()
  })
  it('Grep y Glob sobre un ancestro: negar; sobre una carpeta concreta de fuera: confirmar', () => {
    expect(tipo('Grep', { pattern: 'sk-ant', path: '~/Library' })).toBe('negar')
    expect(tipo('Grep', { pattern: 'x', path: '~' })).toBe('negar')
    expect(tipo('Grep', { pattern: 'x', path: '/' })).toBe('negar')
    expect(tipo('Glob', { pattern: '~/**/llaves.json' })).toBe('negar')
    expect(tipo('Glob', { pattern: '**/*.json', path: join(usuario, 'Library') })).toBe('negar')
    expect(tipo('Grep', { pattern: 'x', path: '~/Documents/proyecto' })).toBe('confirmar')
    expect(tipo('Grep', { pattern: 'x', path: '~/Library/Caches' })).toBe('confirmar')
    // Leer UN archivo de fuera no recorre nada: sigue pidiendo clic.
    expect(tipo('Read', { file_path: '~/Documents/proyecto/a.txt' })).toBe('confirmar')
  })
  it('Bash recursivo sobre un ancestro: negar (grep -r en clúster, rg, find, tar, cp -r, cd y luego rg)', () => {
    for (const command of [
      'grep -r sk-ant ~/Library', 'grep -nri token ~', 'grep --recursive x /', 'rg sk-ant ~/Library', 'rg -uuu x ~',
      'find ~ -name llaves.json', 'find / -name acceso.json', 'tar czf /tmp/x.tgz ~/Library', 'cp -R ~/Library /tmp/lib',
      'cd ~ && rg sk-ant', 'cd ~/Library && grep -r x .', 'rsync -a ~/ /tmp/copia',
    ]) expect(tipo('Bash', { command }), command).toBe('negar')
  })
  it('lo de siempre sigue: rg y grep -r dentro del cerebro corren; fuera en una carpeta concreta, clic', () => {
    expect(tipo('Bash', { command: 'rg TODO' })).toBe('permitir')
    expect(tipo('Bash', { command: 'grep -rn hola .claude/memory' })).toBe('permitir')
    expect(tipo('Bash', { command: 'rg x ~/Documents/proyecto' })).toBe('confirmar')
    expect(tipo('Bash', { command: 'ls ~' })).toBe('confirmar')
  })
})
