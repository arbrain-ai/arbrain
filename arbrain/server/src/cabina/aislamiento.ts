/**
 * Aislamiento de un subagente (29 oct 2026, brecha 3 del benchmark de orquestación). Hasta hoy el worktree era una regla
 * del prompt («su cwd sale de wt.sh nuevo»): Levy podía olvidarla y un subagente editaba el checkout principal, donde
 * Daniel y otros agentes trabajan. Mismo patrón que `una-sola-via.ts` corrigió el 27 oct: la regla pasa al código.
 *
 *  · `worktree`: `wt.sh nuevo <slug>` crea ~/Developer/wt-<slug> en la rama <slug> (checkout ralo, node_modules
 *    enlazado) y el subagente trabaja ahí, en la misma subcarpeta que pidió. La rama queda en el registro.
 *  · `carpeta`: el cwd tal cual (pruebas en /tmp, otro repo, un worktree que ya existe).
 *  · Default: `worktree` si el cwd cae dentro del checkout principal (`repoPrincipal()`); si no, `carpeta`.
 *  · Un cwd en el checkout principal con `carpeta` se rechaza. Claude Code hace lo mismo: «blocks an Edit, Write…
 *    that targets a path in the main checkout».
 */
import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DUENO } from '../dueno.js'

const run = promisify(execFile)
export type Aislamiento = 'worktree' | 'carpeta'
export const AISLAMIENTOS: readonly Aislamiento[] = ['worktree', 'carpeta']

export const repoPrincipal = () => real(process.env.ARBRAIN_REPO || join(homedir(), 'Developer/artificial-brain'))

/** La ruta real (resuelve enlaces simbólicos de la ruta) aunque la carpeta final aún no exista. */
export function real(p: string): string {
  let r = resolve(p), resto = ''
  while (!existsSync(r) && dirname(r) !== r) { resto = resto ? join(basename(r), resto) : basename(r); r = dirname(r) }
  try { r = realpathSync(r) } catch { /* se queda como está */ }
  return resto ? join(r, resto) : r
}

const dentroDe = (ruta: string, raiz: string) => ruta === raiz || ruta.startsWith(raiz + sep)
/** ¿Esta ruta es el checkout principal (o una carpeta suya)? Los worktrees de `.claude/worktrees/` viven dentro pero son otro árbol. */
export function enCheckoutPrincipal(cwd: string, repo = repoPrincipal()): boolean {
  const r = real(cwd)
  return dentroDe(r, repo) && !dentroDe(r, join(repo, '.claude/worktrees'))
}

/** «Arreglar el Taller: ámbar» → «arreglar-el-taller-ambar» (nombre de rama y de carpeta wt-…). */
export function slugRama(nombre: string): string {
  const s = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  return s || 'subagente'
}

export interface PuertoAislamiento {
  repo: string
  /** Corre wt.sh con estos argumentos y devuelve su stdout. */
  wt(args: string[]): Promise<string>
  existe(ruta: string): boolean
  ramaExiste(repo: string, rama: string): Promise<boolean>
  /** Raíz del repo git que contiene esta ruta, o null. */
  raizGit(ruta: string): Promise<string | null>
  dev: string
}

const WT = () => join(dirname(fileURLToPath(import.meta.url)), '../../scripts/worktrees/wt.sh')
export const puertoReal = (): PuertoAislamiento => ({
  repo: repoPrincipal(),
  dev: join(homedir(), 'Developer'),
  wt: async args => (await run('/bin/bash', [WT(), ...args], { timeout: 180_000, maxBuffer: 1 << 20 })).stdout,
  existe: existsSync,
  ramaExiste: async (repo, rama) => run('git', ['-C', repo, 'rev-parse', '-q', '--verify', `refs/heads/${rama}`], { timeout: 10_000 }).then(() => true, () => false),
  raizGit: async ruta => {
    let r = real(ruta)
    while (!existsSync(r) && dirname(r) !== r) r = dirname(r)
    return run('git', ['-C', r, 'rev-parse', '--show-toplevel'], { timeout: 10_000 }).then(x => x.stdout.trim() || null, () => null)
  },
})

export interface Preparado { cwd: string; aislamiento: Aislamiento; rama?: string; raiz?: string }

export async function prepararAislamiento(p: { nombre: string; cwd: string; aislamiento?: Aislamiento }, puerto: PuertoAislamiento = puertoReal()): Promise<Preparado> {
  if (p.aislamiento && !AISLAMIENTOS.includes(p.aislamiento)) throw new Error(`Aislamiento inválido (hay: ${AISLAMIENTOS.join(', ')}).`)
  const pedido = real(p.cwd)
  const principal = enCheckoutPrincipal(pedido, puerto.repo)
  const modo = p.aislamiento ?? (principal ? 'worktree' : 'carpeta')
  if (modo === 'carpeta') {
    if (principal) throw new Error(`${p.cwd} es el checkout principal: ahí trabajan ${DUENO} y otros agentes. Usa aislamiento "worktree" (el default dentro del repo) y el subagente trabaja en su propia copia.`)
    return { cwd: p.cwd, aislamiento: 'carpeta' }
  }
  const repo = principal ? puerto.repo : await puerto.raizGit(pedido)
  if (!repo) throw new Error(`${p.cwd} no está en un repo git: aislamiento "worktree" necesita uno. Usa aislamiento "carpeta".`)
  const sub = relative(real(repo), pedido)
  const base = slugRama(p.nombre)
  let rama: string | null = null
  for (let k = 1; k <= 20 && !rama; k++) {
    const c = k === 1 ? base : `${base}-${k}`
    if (!puerto.existe(join(puerto.dev, `wt-${c}`)) && !(await puerto.ramaExiste(repo, c))) rama = c
  }
  if (!rama) throw new Error(`Ya hay 20 worktrees o ramas «${base}…»; ponle otro nombre al subagente.`)
  const salida = await puerto.wt(['nuevo', rama, ...(real(repo) !== puerto.repo ? ['--repo', repo] : [])]).catch((e: Error & { stderr?: string }) => { throw new Error(`wt.sh nuevo falló: ${(e.stderr || e.message).trim().slice(0, 300)}`) })
  const raiz = salida.trim().split('\n').at(-1)?.trim() ?? ''
  if (!raiz || !puerto.existe(raiz)) throw new Error(`wt.sh nuevo no devolvió una carpeta válida («${raiz.slice(0, 200)}»).`)
  return { cwd: sub && !sub.startsWith('..') ? join(raiz, sub) : raiz, aislamiento: 'worktree', rama, raiz }
}

// ── Lo que cambió en su rama (brecha 5): «+N −M en K archivos» en el detalle del agente ──
export interface CambiosRama { rama: string; mas: number; menos: number; archivos: number }

/** « 3 files changed, 10 insertions(+), 2 deletions(-)» → números (cualquier parte puede faltar). */
export function parsearShortstat(s: string): { mas: number; menos: number; archivos: number } {
  const n = (re: RegExp) => Number(re.exec(s)?.[1] ?? 0)
  return { archivos: n(/(\d+) files? changed/), mas: n(/(\d+) insertions?\(\+\)/), menos: n(/(\d+) deletions?\(-\)/) }
}

const cacheCambios = new Map<string, { en: number; valor: CambiosRama | null }>()
/** Desde donde salió de main hasta su carpeta (lo guardado y lo que aún no guarda). null si no es un worktree con rama. */
export async function cambiosDeRama(raiz: string, rama?: string, ttlMs = 15_000): Promise<CambiosRama | null> {
  const c = cacheCambios.get(raiz)
  if (c && Date.now() - c.en < ttlMs) return c.valor
  const git = (...a: string[]) => run('git', ['-C', raiz, ...a], { timeout: 8_000, maxBuffer: 1 << 20 }).then(x => x.stdout.trim())
  let valor: CambiosRama | null = null
  try {
    const nombre = rama ?? await git('rev-parse', '--abbrev-ref', 'HEAD')
    const base = await git('merge-base', 'main', 'HEAD').catch(() => git('merge-base', 'origin/main', 'HEAD'))
    if (nombre && nombre !== 'HEAD' && nombre !== 'main') valor = { rama: nombre, ...parsearShortstat(await git('diff', '--shortstat', base)) }
  } catch { valor = null }
  cacheCambios.set(raiz, { en: Date.now(), valor })
  if (cacheCambios.size > 200) cacheCambios.delete(cacheCambios.keys().next().value!)
  return valor
}
