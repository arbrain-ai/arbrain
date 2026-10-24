/**
 * Git sin sorpresas para el espejo: nunca interactivo, nunca `--force`, nunca `reset`. Cada llamada devuelve
 * { ok, status, out, err } y quien llama decide; ninguna lanza.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = ['-c', 'core.quotepath=off', '-c', 'advice.detachedHead=false', '-c', 'commit.gpgsign=false', '-c', 'merge.autoStash=false', '-c', 'pull.rebase=false']

export function git(dir, args, { entrada, plazo = 120_000, binario = false, env } = {}) {
  const r = spawnSync('git', [...BASE, ...args], {
    cwd: dir,
    encoding: binario ? 'buffer' : 'utf8',
    input: entrada,
    timeout: plazo,
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: process.env.GIT_ASKPASS ?? '', GCM_INTERACTIVE: 'never', ...env },
  })
  const err = (binario ? (r.stderr?.toString('utf8') ?? '') : (r.stderr ?? '')) + (r.error ? ` ${r.error.message}` : '')
  return { ok: r.status === 0, status: r.status, out: r.stdout ?? (binario ? Buffer.alloc(0) : ''), err: err.trim() }
}

/** Carpeta .git real (soporta worktrees, donde .git es un archivo). */
export function dirGit(dir) {
  const r = git(dir, ['rev-parse', '--git-dir'])
  if (!r.ok) return null
  const g = r.out.trim()
  return g.startsWith('/') || /^[A-Za-z]:[\\/]/.test(g) ? g : join(dir, g)
}

export function esRepo(dir) { return git(dir, ['rev-parse', '--is-inside-work-tree']).out.trim() === 'true' }
export function ramaActual(dir) { return git(dir, ['branch', '--show-current']).out.trim() }
export function hayFusionEnCurso(dir) {
  const g = dirGit(dir)
  return !!g && ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply'].some((f) => existsSync(join(g, f)))
}
export function existeRef(dir, ref) { return git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok }
export function contar(dir, rango) {
  const r = git(dir, ['rev-list', '--count', rango])
  return r.ok ? Number.parseInt(r.out.trim(), 10) || 0 : 0
}
/** Contenido de `ruta` en `ref` como texto, o null si no existe. */
export function mostrar(dir, ref, ruta) {
  const r = git(dir, ['show', `${ref}:${ruta}`])
  return r.ok ? r.out : null
}

/** `git status --porcelain=v1 -z` → [{ x, y, ruta, origen }] (renombres con su origen). */
export function cambios(dir) {
  const r = git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (!r.ok) return []
  const partes = r.out.split('\0')
  const lista = []
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]
    if (!p) continue
    const x = p[0], y = p[1], ruta = p.slice(3)
    let origen = null
    if (x === 'R' || x === 'C') origen = partes[++i]
    lista.push({ x, y, ruta, origen })
  }
  return lista
}

/** Identidad para los commits del espejo si la persona no configuró una (no toca su configuración). */
export function identidad(dir, host) {
  const nombre = git(dir, ['config', 'user.name']).out.trim()
  const correo = git(dir, ['config', 'user.email']).out.trim()
  return [
    ...(nombre ? [] : ['-c', `user.name=Mi Arbrain (${host})`]),
    ...(correo ? [] : ['-c', `user.email=${host}@mi-arbrain.local`]),
  ]
}
