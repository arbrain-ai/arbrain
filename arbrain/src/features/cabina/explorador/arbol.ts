/**
 * Explorador de archivos (8 oct 2026, Daniel: «principalmente por control», como el árbol lateral de VS Code o el de SFTerm).
 * La parte pura: qué ruta se puede pedir, qué se esconde, cómo se arma una carpeta a partir de la lista plana de archivos,
 * cómo se busca por nombre y qué ícono lleva cada archivo. Sin fs ni React: tests/cabina/explorador.test.ts.
 *
 * La lista plana sale de `git ls-files` (respeta .gitignore) o, si la raíz no es un repo, de recorrer el disco.
 * Siempre se esconden node_modules, .git, .next y lo que parece credencial; el servidor vuelve a validarlo al abrir.
 */
import { pareceSecreto } from '../documento/ruta'

/** Carpetas y archivos que nunca salen, aunque git no los ignore. */
export const OCULTAS_SIEMPRE = new Set(['node_modules', '.git', '.next', '.turbo', '.vercel', '.DS_Store'])

/** ¿Esta ruta relativa sale en el explorador? */
export function visible(rel: string): boolean {
  const partes = rel.split('/')
  return !partes.some(p => OCULTAS_SIEMPRE.has(p)) && !pareceSecreto(rel)
}

/**
 * La carpeta o el archivo que se pide, relativo a la raíz. '' es la raíz. Nunca sube («..»), nunca es absoluta, nunca
 * entra a lo escondido. Devuelve la ruta limpia o el motivo del rechazo.
 */
export function relativaSegura(pedida: string | null | undefined): { rel: string } | { error: string } {
  const p = (pedida ?? '').trim()
  if (!p || p === '.' || p === '/') return { rel: '' }
  if (p.length > 1000 || p.includes('\0')) return { error: 'Ruta inválida.' }
  if (p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:/.test(p) || p.includes('\\')) return { error: 'La ruta va relativa a la raíz del explorador.' }
  const partes = p.split('/').filter(x => x && x !== '.')
  if (partes.includes('..')) return { error: 'La ruta no puede subir con «..».' }
  const rel = partes.join('/')
  if (!visible(rel)) return { error: 'Eso no se muestra en el explorador.' }
  return { rel }
}

/**
 * Quita de la lista los enlaces simbólicos cuyo destino cae DENTRO de la raíz: son un duplicado de una carpeta o archivo que
 * ya se ve (arbrain-extension → arbrain/extension) y salían como archivos grises. `destinos` va de ruta del enlace al destino
 * ya resuelto (absoluto); los que salen de la raíz se quedan.
 */
export function sinEnlacesInternos(lista: readonly string[], destinos: ReadonlyMap<string, string>, raiz: string): string[] {
  const base = raiz.replace(/\/+$/, '')
  const dentro = (d: string) => d === base || d.startsWith(`${base}/`)
  return lista.filter(f => { const d = destinos.get(f); return d == null || !dentro(d) })
}

export interface Entrada {
  nombre: string
  /** Relativa a la raíz. */
  ruta: string
  tipo: 'carpeta' | 'archivo'
  /** Carpeta: cuántos archivos hay dentro, a cualquier profundidad. */
  n?: number
}

const comparar = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

/** Lo que hay directamente dentro de `dir` ('' = raíz): carpetas primero, luego archivos, cada grupo por nombre. */
export function hijosDe(lista: readonly string[], dir: string): Entrada[] {
  const prefijo = dir ? `${dir}/` : ''
  const carpetas = new Map<string, number>(), archivos: Entrada[] = []
  for (const f of lista) {
    if (prefijo && !f.startsWith(prefijo)) continue
    const resto = f.slice(prefijo.length)
    const corte = resto.indexOf('/')
    if (corte < 0) { if (resto) archivos.push({ nombre: resto, ruta: prefijo + resto, tipo: 'archivo' }) }
    else { const c = resto.slice(0, corte); carpetas.set(c, (carpetas.get(c) ?? 0) + 1) }
  }
  return [
    ...[...carpetas].sort(([a], [b]) => comparar(a, b)).map(([nombre, n]) => ({ nombre, ruta: prefijo + nombre, tipo: 'carpeta' as const, n })),
    ...archivos.sort((a, b) => comparar(a.nombre, b.nombre)),
  ]
}

/** ¿Existe esa carpeta en la lista? ('' siempre). */
export const esCarpeta = (lista: readonly string[], dir: string) => !dir || lista.some(f => f.startsWith(`${dir}/`))

/** Sin mayúsculas ni acentos. */
export const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface Resultado extends Entrada {
  /** Dónde cae la coincidencia dentro del nombre: [desde, hasta). */
  marca: [number, number]
}

/**
 * Buscar por nombre, como ⌘P: archivos y carpetas cuyo NOMBRE contiene la consulta (sin acentos ni mayúsculas). Primero lo
 * que empieza igual, luego lo menos profundo y lo más corto. Si la consulta lleva «/», se compara contra la ruta entera.
 */
export function buscar(lista: readonly string[], consulta: string, max = 60): { resultados: Resultado[]; total: number } {
  const q = sinAcentos(consulta.trim())
  if (!q) return { resultados: [], total: 0 }
  const porRuta = q.includes('/')
  const vistos = new Set<string>(), candidatos: (Resultado & { peso: number })[] = []
  const probar = (ruta: string, tipo: Entrada['tipo']) => {
    if (vistos.has(ruta)) return
    vistos.add(ruta)
    const nombre = ruta.slice(ruta.lastIndexOf('/') + 1)
    const donde = sinAcentos(porRuta ? ruta : nombre)
    const i = donde.indexOf(q)
    if (i < 0) return
    const base = ruta.length - nombre.length
    const profundidad = ruta.split('/').length
    const peso = (i === 0 || (!porRuta && /[-_. ]/.test(nombre[i - 1] ?? '')) ? 0 : 1000) + (tipo === 'carpeta' ? 0 : 1) + profundidad * 10 + nombre.length
    candidatos.push({ nombre, ruta, tipo, marca: porRuta ? [Math.max(0, i - base), Math.max(0, Math.min(nombre.length, i + q.length - base))] : [i, i + q.length], peso })
  }
  for (const f of lista) {
    const partes = f.split('/')
    for (let k = 1; k < partes.length; k++) probar(partes.slice(0, k).join('/'), 'carpeta')
    probar(f, 'archivo')
  }
  candidatos.sort((a, b) => a.peso - b.peso || comparar(a.ruta, b.ruta))
  return { resultados: candidatos.slice(0, max).map(({ peso: _peso, ...r }) => r), total: candidatos.length }
}

/** Las carpetas que hay que abrir para ver `ruta` (sin incluirla): «a/b/c.md» → ['a', 'a/b']. */
export function ancestros(ruta: string): string[] {
  const partes = ruta.split('/').filter(Boolean)
  return partes.slice(0, -1).map((_, k) => partes.slice(0, k + 1).join('/'))
}

// ── Íconos y apertura ──

export type Clase = 'md' | 'texto' | 'codigo' | 'datos' | 'config' | 'imagen' | 'video' | 'audio' | 'pdf' | 'html' | 'otro'

const CLASE: Record<string, Clase> = {
  md: 'md', markdown: 'md', mdx: 'md',
  txt: 'texto', log: 'texto', csv: 'datos', tsv: 'datos',
  json: 'datos', jsonc: 'datos', jsonl: 'datos', yaml: 'datos', yml: 'datos', toml: 'datos', xml: 'datos', plist: 'datos', sql: 'datos', ipynb: 'datos',
  ts: 'codigo', tsx: 'codigo', js: 'codigo', jsx: 'codigo', mjs: 'codigo', cjs: 'codigo', py: 'codigo', swift: 'codigo', rb: 'codigo', go: 'codigo', rs: 'codigo',
  java: 'codigo', kt: 'codigo', c: 'codigo', h: 'codigo', cpp: 'codigo', hpp: 'codigo', m: 'codigo', mm: 'codigo', css: 'codigo', scss: 'codigo',
  sh: 'codigo', zsh: 'codigo', bash: 'codigo', vue: 'codigo', svelte: 'codigo', php: 'codigo', lua: 'codigo', dart: 'codigo', r: 'codigo',
  ini: 'config', cfg: 'config', conf: 'config', lock: 'config',
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', gif: 'imagen', svg: 'imagen', avif: 'imagen', ico: 'imagen', heic: 'imagen',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio', aif: 'audio', aiff: 'audio',
  pdf: 'pdf', html: 'html', htm: 'html', mmd: 'md', mermaid: 'md',
}
const CONFIG_POR_NOMBRE = /^(\.gitignore|\.gitattributes|\.editorconfig|\.prettierrc|\.eslintrc|\.nvmrc|\.npmignore|Dockerfile|Makefile|Procfile|LICENSE|Gemfile|Brewfile|CODEOWNERS)$/

export function claseDe(nombre: string): Clase {
  if (CONFIG_POR_NOMBRE.test(nombre)) return 'config'
  const i = nombre.lastIndexOf('.')
  return i > 0 ? CLASE[nombre.slice(i + 1).toLowerCase()] ?? 'otro' : 'otro'
}

/** Lenguaje de highlight.js para el resaltado en solo lectura; undefined = texto mono sin color. */
const LENGUAJE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', swift: 'swift', rb: 'ruby',
  go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', m: 'objectivec', mm: 'objectivec', css: 'css', scss: 'scss',
  sh: 'bash', zsh: 'bash', bash: 'bash', php: 'php', lua: 'lua', r: 'r', json: 'json', jsonc: 'json', ipynb: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', xml: 'xml', plist: 'xml', sql: 'sql', vue: 'xml', svelte: 'xml', dart: 'dart',
}
export function lenguajeDe(nombre: string): string | undefined {
  if (nombre === 'Dockerfile') return 'dockerfile'
  if (nombre === 'Makefile') return 'makefile'
  const i = nombre.lastIndexOf('.')
  return i > 0 ? LENGUAJE[nombre.slice(i + 1).toLowerCase()] : undefined
}

/** Une la raíz absoluta con una relativa ya validada. */
export const absoluta = (raiz: string, rel: string) => rel ? `${raiz.replace(/\/+$/, '')}/${rel}` : raiz

export function pesoArchivos(n: number): string {
  return `${n.toLocaleString('es-MX')} ${n === 1 ? 'archivo' : 'archivos'}`
}
