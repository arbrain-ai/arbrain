import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enCheckoutPrincipal, parsearShortstat, prepararAislamiento, real, slugRama, type PuertoAislamiento } from './aislamiento.js'

/** Un repo principal y un ~/Developer de mentira: wt.sh no corre; se anota lo que se le pidió. */
function banco(o: { existentes?: string[]; ramas?: string[]; raizGit?: string | null } = {}) {
  const base = real(mkdtempSync(join(tmpdir(), 'arbrain-aislar-')))
  const dev = join(base, 'Developer'), repo = join(dev, 'artificial-brain')
  mkdirSync(join(repo, 'arbrain/server'), { recursive: true })
  const llamadas: string[][] = []
  const existentes = new Set((o.existentes ?? []).map(n => join(dev, n)))
  const puerto: PuertoAislamiento = {
    repo, dev,
    wt: async args => { llamadas.push(args); const d = join(dev, `wt-${args[1]}`); mkdirSync(d, { recursive: true }); existentes.add(d); return `ruido\n${d}\n` },
    existe: r => existentes.has(r) || r.startsWith(repo),
    ramaExiste: async (_r, rama) => (o.ramas ?? []).includes(rama),
    raizGit: async () => o.raizGit ?? null,
  }
  return { dev, repo, puerto, llamadas }
}

describe('aislamiento de delegar (brecha 3)', () => {
  it('dentro del checkout principal el default es worktree y conserva la subcarpeta pedida', async () => {
    const b = banco()
    const r = await prepararAislamiento({ nombre: 'Arreglar el Taller: ámbar', cwd: join(b.repo, 'arbrain/server') }, b.puerto)
    expect(b.llamadas).toEqual([['nuevo', 'arreglar-el-taller-ambar']])
    expect(r).toEqual({ aislamiento: 'worktree', rama: 'arreglar-el-taller-ambar', raiz: join(b.dev, 'wt-arreglar-el-taller-ambar'), cwd: join(b.dev, 'wt-arreglar-el-taller-ambar/arbrain/server') })
  })
  it('el checkout principal con «carpeta» se rechaza', async () => {
    const b = banco()
    await expect(prepararAislamiento({ nombre: 'x', cwd: b.repo, aislamiento: 'carpeta' }, b.puerto)).rejects.toThrow(/checkout principal/)
    await expect(prepararAislamiento({ nombre: 'x', cwd: join(b.repo, 'arbrain'), aislamiento: 'carpeta' }, b.puerto)).rejects.toThrow(/checkout principal/)
    expect(b.llamadas).toEqual([])
  })
  it('fuera del repo el default es la carpeta tal cual (pruebas en /tmp, otro worktree)', async () => {
    const b = banco()
    expect(await prepararAislamiento({ nombre: 'x', cwd: '/tmp/prueba-x' }, b.puerto)).toEqual({ cwd: '/tmp/prueba-x', aislamiento: 'carpeta' })
    // un worktree de agente dentro del repo (.claude/worktrees) no es el checkout principal
    expect(enCheckoutPrincipal(join(b.repo, '.claude/worktrees/agent-1'), b.repo)).toBe(false)
    expect(enCheckoutPrincipal(join(b.repo, 'arbrain'), b.repo)).toBe(true)
  })
  it('no reusa la carpeta ni la rama de otro agente: sufijo -2, -3…', async () => {
    const b = banco({ existentes: ['wt-taller'], ramas: ['taller-2'] })
    const r = await prepararAislamiento({ nombre: 'taller', cwd: b.repo }, b.puerto)
    expect(r.rama).toBe('taller-3')
  })
  it('worktree fuera del repo principal usa el repo git que lo contiene, o lo rechaza si no hay', async () => {
    const otro = banco({ raizGit: '/tmp/otro-repo' })
    await prepararAislamiento({ nombre: 'y', cwd: '/tmp/otro-repo/src', aislamiento: 'worktree' }, otro.puerto)
    expect(otro.llamadas).toEqual([['nuevo', 'y', '--repo', '/tmp/otro-repo']])
    const sin = banco()
    await expect(prepararAislamiento({ nombre: 'y', cwd: '/tmp/nada', aislamiento: 'worktree' }, sin.puerto)).rejects.toThrow(/no está en un repo git/)
  })
  it('slugRama y shortstat', () => {
    expect(slugRama('¡Ñandú — prueba 2!')).toBe('nandu-prueba-2')
    expect(slugRama('***')).toBe('subagente')
    expect(parsearShortstat(' 3 files changed, 10 insertions(+), 2 deletions(-)')).toEqual({ archivos: 3, mas: 10, menos: 2 })
    expect(parsearShortstat(' 1 file changed, 1 deletion(-)')).toEqual({ archivos: 1, mas: 0, menos: 1 })
    expect(parsearShortstat('')).toEqual({ archivos: 0, mas: 0, menos: 0 })
  })
})
