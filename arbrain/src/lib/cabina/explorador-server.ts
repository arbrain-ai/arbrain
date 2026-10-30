import 'server-only'
/**
 * Lado servidor del explorador de archivos (8 oct 2026). La raíz y la lista plana de lo que se puede ver.
 *
 *  · Raíz: `ARBRAIN_EXPLORADOR_RAIZ`, o `raiz` en ~/.config/arbrain/explorador.json, o el repo vivo (el mismo que lee la vista
 *    documento). Tiene que caer dentro de lo que la vista documento ya permite (repo, ~/Developer, carpetas del dueño) y lejos
 *    de credenciales; si no, se usa el repo y se dice por qué.
 *  · Lista: `git ls-files` (respeta .gitignore, incluye lo nuevo sin commit y quita lo borrado). Fuera de un repo, se recorre
 *    el disco con tope. Siempre pasa por `visible` (arbol.ts): sin node_modules, .git, .next ni nada que parezca llave.
 *  · Se recuerda 10 s: abrir carpetas una tras otra no vuelve a preguntarle a git.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { resolverRuta, rutaPermitida } from '@/features/cabina/documento/ruta'
import { OCULTAS_SIEMPRE, sinEnlacesInternos, visible } from '@/features/cabina/explorador/arbol'
import { raices } from './documento-server'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'

export const ARCHIVO_CONFIG = () => path.join(dirConfigArbrain(), 'explorador.json')
const VIDA_MS = 10_000
const TOPE_RECORRIDO = 60_000

export interface Raiz { ruta: string; nombre: string; aviso?: string }

function pedidaPorConfig(): string | null {
  if (process.env.ARBRAIN_EXPLORADOR_RAIZ) return process.env.ARBRAIN_EXPLORADOR_RAIZ
  try {
    const j = JSON.parse(readFileSync(ARCHIVO_CONFIG(), 'utf8')) as { raiz?: unknown }
    return typeof j.raiz === 'string' && j.raiz.trim() ? j.raiz.trim() : null
  } catch { return null }
}

/** La raíz del explorador, ya resuelta en disco y validada. */
export async function raizExplorador(): Promise<Raiz> {
  const r = raices()
  const repo = await realpath(r.repo).catch(() => r.repo)
  const porDefecto: Raiz = { ruta: repo, nombre: path.basename(repo) }
  const pedida = pedidaPorConfig()
  if (!pedida) return porDefecto
  const res = resolverRuta(pedida, r)
  if ('error' in res) return { ...porDefecto, aviso: `La raíz configurada no se puede usar (${res.error}). Muestro el repo.` }
  try {
    const real = await realpath(res.abs)
    if (rutaPermitida(real, r) && rutaPermitida(real, { ...r, repo })) return { ...porDefecto, aviso: 'La raíz configurada apunta fuera de lo permitido. Muestro el repo.' }
    if (!(await stat(real)).isDirectory()) return { ...porDefecto, aviso: 'La raíz configurada no es una carpeta. Muestro el repo.' }
    return { ruta: real, nombre: path.basename(real) }
  } catch { return { ...porDefecto, aviso: 'La raíz configurada ya no existe. Muestro el repo.' } }
}

function git(raiz: string, args: string[]): Promise<string | null> {
  return new Promise(resolve => {
    execFile('git', ['-C', raiz, ...args], { maxBuffer: 128 * 1024 * 1024, timeout: 15_000 }, (err, out) => resolve(err ? null : out))
  })
}

async function porGit(raiz: string): Promise<string[] | null> {
  const [todos, borrados] = await Promise.all([
    git(raiz, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']),
    git(raiz, ['ls-files', '-z', '--deleted']),
  ])
  if (todos == null) return null
  const fuera = new Set((borrados ?? '').split('\0').filter(Boolean))
  return [...new Set(todos.split('\0'))].filter(f => f && !fuera.has(f))
}

async function porDisco(raiz: string): Promise<string[]> {
  const out: string[] = []
  const caminar = async (rel: string, nivel: number) => {
    if (out.length >= TOPE_RECORRIDO || nivel > 12) return
    let entradas: import('node:fs').Dirent[] = []
    try { entradas = await readdir(path.join(raiz, rel), { withFileTypes: true }) } catch { return }
    for (const e of entradas) {
      if (OCULTAS_SIEMPRE.has(e.name)) continue
      const hijo = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await caminar(hijo, nivel + 1)
      else if (e.isFile() || e.isSymbolicLink()) out.push(hijo)
      if (out.length >= TOPE_RECORRIDO) return
    }
  }
  await caminar('', 0)
  return out
}

/** Enlaces simbólicos versionados (modo 120000) y a dónde apuntan, ya resuelto. Los que no resuelven se ignoran. */
async function destinosDeEnlaces(raiz: string): Promise<Map<string, string>> {
  const salida = await git(raiz, ['ls-files', '-s', '-z', '--cached'])
  const out = new Map<string, string>()
  if (!salida) return out
  const rutas = salida.split('\0').filter(l => l.startsWith('120000 ')).map(l => l.slice(l.indexOf('\t') + 1))
  await Promise.all(rutas.map(async r => { try { out.set(r, await realpath(path.join(raiz, r))) } catch { /* roto: se queda */ } }))
  return out
}

let memo: { raiz: string; en: number; lista: string[]; deGit: boolean } | null = null

/** Todos los archivos visibles bajo la raíz, relativos a ella. */
export async function listaDe(raiz: string): Promise<{ lista: string[]; deGit: boolean }> {
  if (memo && memo.raiz === raiz && Date.now() - memo.en < VIDA_MS) return memo
  const deGit = await porGit(raiz)
  const bruta = deGit ?? await porDisco(raiz)
  const lista = (deGit ? sinEnlacesInternos(bruta, await destinosDeEnlaces(raiz), await realpath(raiz).catch(() => raiz)) : bruta).filter(visible)
  memo = { raiz, en: Date.now(), lista, deGit: deGit != null }
  return memo
}
