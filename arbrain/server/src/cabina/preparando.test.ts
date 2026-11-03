import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { conPreparando, leerPreparando, VIGENCIA_MS } from './preparando.js'

// 2 nov 2026: el Taller decía «Nadie trabaja ahora» mientras `delegar` llevaba 4:48 creando el worktree.
describe('preparando: el agente que todavía nace se ve en el Taller', () => {
  let dir = '', antes: string | undefined
  beforeEach(() => { antes = process.env.ARBRAIN_CONFIG_DIR; dir = mkdtempSync(join(tmpdir(), 'preparando-')); process.env.ARBRAIN_CONFIG_DIR = dir })
  afterEach(() => { if (antes === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = antes; rmSync(dir, { recursive: true, force: true }) })
  const base = { nombre: 'linea-de-la-hora', harness: 'claude', origen: 'conv-1', aislamiento: 'worktree' as const }

  it('mientras prepara se lee; al nacer o fallar desaparece', async () => {
    let visto: Awaited<ReturnType<typeof leerPreparando>> = []
    const r = await conPreparando(base, async () => { visto = await leerPreparando(); return 900446 })
    expect(r).toBe(900446)
    expect(visto.map(x => [x.nombre, x.origen, x.aislamiento, x.pid])).toEqual([['linea-de-la-hora', 'conv-1', 'worktree', process.pid]])
    expect(await leerPreparando()).toEqual([])
    await expect(conPreparando(base, async () => { throw new Error('topes') })).rejects.toThrow('topes')
    expect(await leerPreparando()).toEqual([])
  })

  it('una marca de un proceso muerto o vieja no se pinta y se borra', async () => {
    const carpeta = join(dir, 'subagentes-preparando'); mkdirSync(carpeta, { recursive: true })
    const ahora = Date.parse('2026-11-02T12:20:00Z')
    writeFileSync(join(carpeta, 'muerto.json'), JSON.stringify({ ...base, clave: 'muerto', desde: '2026-11-02T12:16:00Z', pid: 999999 }))
    writeFileSync(join(carpeta, 'vieja.json'), JSON.stringify({ ...base, clave: 'vieja', desde: new Date(ahora - VIGENCIA_MS - 1).toISOString(), pid: 1 }))
    writeFileSync(join(carpeta, 'viva.json'), JSON.stringify({ ...base, clave: 'viva', desde: '2026-11-02T12:16:46Z', pid: 1 }))
    const l = await leerPreparando(ahora, pid => pid === 1)
    expect(l.map(x => x.clave)).toEqual(['viva'])
    expect(readdirSync(carpeta).sort()).toEqual(['viva.json'])
  })
})
