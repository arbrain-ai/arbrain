import { promises as fs } from 'fs'
import path from 'path'
import { instalacion } from '@/config'

/**
 * Biblioteca personal de Daniel: los PDFs/EPUB viven en `personal/libros` (submódulo
 * PRIVADO, fuera del repo público, gitignored). Estos helpers resuelven esa carpeta en
 * la máquina de Daniel (app desktop Tauri o `npm run dev`) y sirven los archivos por API
 * server-side. En Vercel esa carpeta NO existe -> `findLibraryRoot()` devuelve null y la
 * biblioteca personal simplemente no aparece (los libros publicados sí, van por el lector publicado).
 */

export const LIBRARY_ABSOLUTE_FALLBACK = instalacion().bibliotecaPersonal

let cachedRoot: string | null | undefined

export async function findLibraryRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot
  const candidates: string[] = []
  if (process.env.PERSONAL_LIBROS_DIR) candidates.push(process.env.PERSONAL_LIBROS_DIR)
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, 'casa', 'personal', 'libros'))
    candidates.push(path.join(dir, 'personal', 'libros'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  if (LIBRARY_ABSOLUTE_FALLBACK) candidates.push(LIBRARY_ABSOLUTE_FALLBACK)
  for (const c of candidates) {
    try {
      const st = await fs.stat(c)
      if (st.isDirectory()) {
        cachedRoot = c
        return c
      }
    } catch {
      /* siguiente candidato */
    }
  }
  cachedRoot = null
  return null
}

const FOLDER_LABELS: Record<string, string> = {
  '01-cibernetica-sistemas': 'Cibernética & Sistemas',
  '02-marketing-ofertas': 'Marketing & Ofertas',
  '03-negocio-startups': 'Negocio & Startups',
  '04-operaciones-liderazgo': 'Operaciones & Liderazgo',
  '05-riqueza-inversion': 'Riqueza & Inversión',
  '06-productividad-foco': 'Productividad & Foco',
  '07-cuerpo-longevidad': 'Cuerpo & Longevidad',
  '08-mente-psicologia': 'Mente & Psicología',
  '09-estrategia-clasicos': 'Estrategia & Clásicos',
  '10-ficcion-sistemas': 'Ficción & Sistemas',
  '11-biografias': 'Biografías',
  '12-epistemologia-frontera': 'Epistemología & Frontera',
}

// Los fundamentales que Daniel cita a diario -> se muestran primero.
const CORE_FOLDER = '01-cibernetica-sistemas'

const KEEP_UPPER = new Set(['ES', 'EN', 'US', 'UK', 'IA', 'AI', 'MBA', 'V2', 'V3'])

function titleize(fileNoExt: string): { author: string; title: string } {
  const tokens = fileNoExt.split('-').filter(Boolean)
  const author = cap(tokens[0] || fileNoExt)
  const rest = tokens.slice(1).map((t) => (KEEP_UPPER.has(t.toUpperCase()) ? t.toUpperCase() : cap(t)))
  return { author, title: rest.join(' ') || author }
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function folderLabel(key: string): string {
  if (FOLDER_LABELS[key]) return FOLDER_LABELS[key]
  return key
    .replace(/^\d+-/, '')
    .split('-')
    .map(cap)
    .join(' ')
}

export type LibFile = { author: string; title: string; rel: string; ext: 'pdf' | 'epub'; size: number }
export type LibFolder = { key: string; label: string; core: boolean; files: LibFile[] }

export async function listLibrary(): Promise<{ available: boolean; folders: LibFolder[] }> {
  const root = await findLibraryRoot()
  if (!root) return { available: false, folders: [] }
  const entries = await fs.readdir(root, { withFileTypes: true })
  const folders: LibFolder[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const dirPath = path.join(root, e.name)
    let names: string[]
    try {
      names = await fs.readdir(dirPath)
    } catch {
      continue
    }
    const files: LibFile[] = []
    for (const name of names) {
      const m = /\.(pdf|epub)$/i.exec(name)
      if (!m) continue
      let size = 0
      try {
        size = (await fs.stat(path.join(dirPath, name))).size
      } catch {
        /* best effort */
      }
      const { author, title } = titleize(name.replace(/\.(pdf|epub)$/i, ''))
      files.push({ author, title, rel: `${e.name}/${name}`, ext: m[1].toLowerCase() as 'pdf' | 'epub', size })
    }
    if (files.length) {
      files.sort((a, b) => a.author.localeCompare(b.author))
      folders.push({ key: e.name, label: folderLabel(e.name), core: e.name === CORE_FOLDER, files })
    }
  }
  // fundamentales primero, luego alfabético por carpeta
  folders.sort((a, b) => (a.core === b.core ? a.key.localeCompare(b.key) : a.core ? -1 : 1))
  return { available: true, folders }
}

/** Resuelve un `rel` a ruta absoluta segura DENTRO de la biblioteca, o null si es inválida. */
export async function resolveLibraryFile(rel: string): Promise<{ full: string; ext: string } | null> {
  if (!rel || rel.includes('..') || rel.startsWith('/')) return null
  if (!/\.(pdf|epub)$/i.test(rel)) return null
  const root = await findLibraryRoot()
  if (!root) return null
  const rootResolved = path.resolve(root)
  const full = path.resolve(rootResolved, rel)
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null
  try {
    const st = await fs.stat(full)
    if (!st.isFile()) return null
  } catch {
    return null
  }
  return { full, ext: path.extname(full).slice(1).toLowerCase() }
}
