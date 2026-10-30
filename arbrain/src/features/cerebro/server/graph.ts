// Segundo Cerebro — parser server-side (SOLO lectura).
// Convierte .claude/memory (markdown curado, links [x](path) + menciones `foo.md`),
// las skills (.claude/skills/<n>/SKILL.md), los documentos del negocio (docs/business-os/*.md, el mismo
// corte que Taller › Archivos) y, a pedido, .claude/knowledge (frontmatter YAML + wiki links [[...]]) en un grafo.
// 5 oct 2026 (Taller › Memoria · «Ver tu cerebro»): las tres capas base se conectan entre sí — una memoria que nombra
// `habit-system` o enlaza su ruta toca a la skill; una mención de `docs/business-os/x.md` toca al documento.
// NUNCA escribe en esos directorios. Corre en Node (route handlers), jamás en el cliente.
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import type {
  BrokenRef,
  CerebroEdge,
  CerebroCapa,
  CerebroEdgeKind,
  CerebroGraph,
  CerebroNode,
  CerebroNodeDetail,
  CerebroNodeType,
} from '../types'
import { instalacion } from '@/config'

const ROOT_CANDIDATES = [
  process.env.BUSINESS_OS_ROOT,
  instalacion().raizRepoRespaldo,
  path.join(process.cwd(), '..'),
  path.join(process.cwd(), '..', '..'),
].filter(Boolean) as string[]

function resolveRoot(): string | null {
  for (const candidate of ROOT_CANDIDATES) {
    if (existsSync(path.join(candidate, '.claude', 'memory', 'MEMORY.md'))) {
      return candidate
    }
  }
  return null
}

const MEMORY_SUBDIRS: Record<string, CerebroNodeType> = {
  user: 'user',
  project: 'project',
  feedback: 'feedback',
  reference: 'reference',
}

/** Lo que nunca entra al grafo ni se sirve (mismo veto que Taller › Archivos). */
const VETADO = /(^|\/)(credenciales|secret|\.env)|credenciales-operativas/i

const KNOWLEDGE_SUBDIRS: Record<string, CerebroNodeType> = {
  concepts: 'concept',
  connections: 'connection',
}

interface ParsedFile {
  id: string
  type: CerebroNodeType
  absPath: string
  title: string
  description: string | null
  excerpt: string
  tags: string[]
  date: string | null
  editedAt: string | null
  lines: number
  /** refs crudas encontradas en el archivo, aún sin resolver */
  rawRefs: { ref: string; kind: CerebroEdgeKind }[]
}

// ---------------------------------------------------------------------------
// Helpers de texto
// ---------------------------------------------------------------------------

function stripMd(text: string): string {
  return text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstHeading(content: string): string | null {
  const m = content.match(/^#\s+(.+)$/m)
  return m ? stripMd(m[1]) : null
}

function humanize(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/-\d{4}-\d{2}(-\d{2})?$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractExcerpt(content: string): string {
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, '')
  const blocks = body.split(/\n\s*\n/)
  for (const block of blocks) {
    const clean = stripMd(
      block
        .split('\n')
        .filter((l) => !/^#{1,6}\s/.test(l))
        .join(' '),
    )
    if (clean.length > 40) {
      return clean.length > 300 ? clean.slice(0, 297) + '…' : clean
    }
  }
  return ''
}

function dateFromFilename(filename: string): string | null {
  const full = filename.match(/(\d{4}-\d{2}-\d{2})/)
  if (full) return full[1]
  const partial = filename.match(/(\d{4}-\d{2})(?!-\d)/)
  if (partial) return `${partial[1]}-01`
  return null
}

function daysSince(date: string | null): number | null {
  if (!date) return null
  const then = new Date(`${date}T00:00:00Z`).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000))
}

// Frontmatter YAML simple (title/date/tags/connects/sources — el formato real
// del knowledge-compiler; no necesitamos un parser YAML completo)
function parseFrontmatter(content: string): {
  title: string | null
  date: string | null
  tags: string[]
  connects: string[]
} {
  const out: { title: string | null; date: string | null; tags: string[]; connects: string[] } = {
    title: null,
    date: null,
    tags: [],
    connects: [],
  }
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return out
  for (const line of fm[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (!kv) continue
    const [, key, value] = kv
    if (key === 'title') out.title = value.replace(/^["']|["']$/g, '').trim() || null
    if (key === 'date') out.date = value.trim().slice(0, 10) || null
    if (key === 'tags') {
      const arr = value.match(/\[([^\]]*)\]/)
      if (arr) out.tags = arr[1].split(',').map((t) => t.trim()).filter(Boolean)
    }
    if (key === 'connects') {
      for (const m of value.matchAll(/\[\[([^\]]+)\]\]/g)) out.connects.push(m[1])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Extracción de referencias crudas
// ---------------------------------------------------------------------------

function extractMemoryRefs(content: string): { ref: string; kind: CerebroEdgeKind }[] {
  const refs: { ref: string; kind: CerebroEdgeKind }[] = []
  // [label](ruta.md) — links markdown
  for (const m of content.matchAll(/\[[^\]]*\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
    if (!m[1].startsWith('http')) refs.push({ ref: m[1], kind: 'link' })
  }
  // `ruta/archivo.md` o `archivo.md` — menciones en backticks (el patrón "Linaje con")
  for (const m of content.matchAll(/`([A-Za-z0-9_\-./]+\.md)`/g)) {
    refs.push({ ref: m[1], kind: 'mention' })
  }
  // `habit-system` o `.claude/skills/polar/…` — una skill nombrada (se resuelve contra las skills que existen)
  for (const m of content.matchAll(/`([a-z][a-z0-9-]{2,40})`/g)) refs.push({ ref: `skill:${m[1]}`, kind: 'mention' })
  for (const m of content.matchAll(/(?:^|[\s(`])(?:\.claude\/)?skills\/([a-z][a-z0-9-]{2,40})\//g)) refs.push({ ref: `skill:${m[1]}`, kind: 'link' })
  // Nombre con guion fuera de backticks («usa habit-system»): solo nombres compuestos, los simples son palabras comunes.
  for (const m of content.matchAll(/(?<![\w`/.-])([a-z]+(?:-[a-z0-9]+)+)(?![\w`/-])/g)) refs.push({ ref: `skill:${m[1]}`, kind: 'mention' })
  return refs
}

function extractKnowledgeRefs(content: string): { ref: string; kind: CerebroEdgeKind }[] {
  const refs: { ref: string; kind: CerebroEdgeKind }[] = []
  const body = content.replace(/^---\n[\s\S]*?\n---/, '')
  // [[wiki links]] en el body (los del frontmatter connects van aparte)
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    refs.push({ ref: m[1].trim(), kind: 'wiki' })
  }
  // Menciones a memory/ en backticks (cross-capa)
  for (const m of body.matchAll(/`(?:\.claude\/)?(memory\/[A-Za-z0-9_\-./]+\.md)`/g)) {
    refs.push({ ref: m[1], kind: 'mention' })
  }
  return refs
}

// ---------------------------------------------------------------------------
// Índices curados (descripciones)
// ---------------------------------------------------------------------------

async function readMemoryIndex(memoryRoot: string): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>()
  // Formato vigente (cirugía v2, 31 ago 2026): «- `project/x.md` — descripción. **T:** disparadores» en
  // MEMORY-user.md, MEMORY-indice.md y MEMORY-archivo.md. El formato viejo «- [t](x.md) — d» queda por compatibilidad.
  for (const indice of ['MEMORY.md', 'MEMORY-user.md', 'MEMORY-indice.md', 'MEMORY-archivo.md']) {
    let raw: string
    try { raw = await readFile(path.join(memoryRoot, indice), 'utf8') } catch { continue }
    for (const m of raw.matchAll(/^\s*-\s*(?:\[[^\]]+\]\(([^)]+\.md)\)|`([^`]+\.md)`)\s*—\s*(.+)$/gm)) {
      const id = `memory/${(m[1] ?? m[2]).replace(/^(\.claude\/)?memory\//, '')}`
      if (descriptions.has(id)) continue // el índice vivo manda sobre el archivo rotado
      const clean = stripMd(m[3].replace(/\s*\*\*T:\*\*.*$/, '').replace(/\s*_\(rotada[^)]*\)_\s*$/, ''))
      descriptions.set(id, clean.length > 400 ? clean.slice(0, 397) + '…' : clean)
    }
  }
  return descriptions
}

async function readKnowledgeIndex(knowledgeRoot: string): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>()
  try {
    const raw = await readFile(path.join(knowledgeRoot, 'index.md'), 'utf8')
    for (const line of raw.split('\n')) {
      if (!line.startsWith('|')) continue
      const cells = line.split('|').map((c) => c.trim())
      // | [[concepts/x]] | summary | sources | updated |
      const linkCell = cells.find((c) => c.startsWith('[['))
      if (!linkCell) continue
      const ref = linkCell.replace(/^\[\[|\]\]$/g, '')
      const idx = cells.indexOf(linkCell)
      const summary = cells[idx + 1]
      if (summary && summary.length > 10) {
        const clean = stripMd(summary)
        descriptions.set(
          `knowledge/${ref}.md`,
          clean.length > 400 ? clean.slice(0, 397) + '…' : clean,
        )
      }
    }
  } catch {
    /* opcional */
  }
  return descriptions
}

// ---------------------------------------------------------------------------
// Escaneo principal
// ---------------------------------------------------------------------------

async function scanDir(
  dirAbs: string,
  idPrefix: string,
  type: CerebroNodeType,
  layer: 'memory' | 'knowledge',
): Promise<ParsedFile[]> {
  if (!existsSync(dirAbs)) return []
  const entries = await readdir(dirAbs)
  const files: ParsedFile[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue
    const id = `${idPrefix}/${entry}`
    if (VETADO.test(id)) continue
    const absPath = path.join(dirAbs, entry)
    let content: string
    try {
      content = await readFile(absPath, 'utf8')
    } catch {
      continue
    }
    const editedAt = await fileMtimeIso(absPath)
    if (layer === 'memory') {
      const date = dateFromFilename(entry) ?? editedAt?.slice(0, 10) ?? null
      files.push({
        id,
        type,
        absPath,
        title: firstHeading(content) ?? humanize(entry),
        description: null,
        excerpt: extractExcerpt(content),
        tags: [],
        date,
        editedAt,
        lines: content.split('\n').length,
        rawRefs: extractMemoryRefs(content),
      })
    } else {
      const fm = parseFrontmatter(content)
      const rawRefs = extractKnowledgeRefs(content)
      for (const c of fm.connects) rawRefs.push({ ref: c, kind: 'connects' })
      files.push({
        id,
        type,
        absPath,
        title: fm.title ?? firstHeading(content) ?? humanize(entry),
        description: null,
        excerpt: extractExcerpt(content),
        tags: fm.tags,
        date: fm.date ?? editedAt?.slice(0, 10) ?? null,
        editedAt,
        lines: content.split('\n').length,
        rawRefs,
      })
    }
  }
  return files
}

async function fileMtimeIso(absPath: string): Promise<string | null> {
  try {
    const s = await stat(absPath)
    return s.mtime.toISOString()
  } catch {
    return null
  }
}

/**
 * «Cuándo cambió» de verdad (5 oct 2026): el mtime miente tras un checkout o un `git pull` (todo parece de hoy y el
 * lienzo se pintaba de oro entero). Vale el último commit de las últimas `dias` jornadas o, si el archivo tiene cambios
 * sin commitear, su mtime. Sin git (otra máquina), ningún nodo es «del ahora»: mejor callar que dorar todo.
 * Rutas relativas al repo (.claude/memory/…, .claude/skills/…, docs/business-os/…).
 */
function git(root: string, args: string[]): Promise<string | null> {
  return new Promise((ok) => execFile('git', ['-C', root, ...args], { timeout: 8_000, maxBuffer: 8 << 20 }, (e, out) => ok(e ? null : out)))
}
async function cambiosRecientes(root: string, dias = 3): Promise<{ commit: Map<string, string>; sucios: Set<string> } | null> {
  const dirs = ['.claude/memory', '.claude/skills', 'docs/business-os']
  const [log, status] = await Promise.all([
    git(root, ['log', `--since=${dias}.days`, '--name-only', '--format=%x01%cI', '--', ...dirs]),
    git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...dirs]),
  ])
  if (log == null || status == null) return null
  const commit = new Map<string, string>()
  let fecha = ''
  for (const l of log.split('\n')) {
    if (l.startsWith('\x01')) fecha = l.slice(1).trim()
    else if (l.trim() && !commit.has(l.trim())) commit.set(l.trim(), fecha) // el log va del más nuevo al más viejo
  }
  const sucios = new Set(status.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop()!.trim()))
  return { commit, sucios }
}
const rutaRepo = (id: string) => (id.startsWith('docs/') ? id : `.claude/${id}`)

/** Una skill = su SKILL.md (las referencias cuelgan de ella, como en Taller › Archivos). */
async function scanSkills(skillsRoot: string): Promise<ParsedFile[]> {
  if (!existsSync(skillsRoot)) return []
  const out: ParsedFile[] = []
  for (const name of (await readdir(skillsRoot)).sort()) {
    if (name.startsWith('.') || name.startsWith('_')) continue
    const absPath = path.join(skillsRoot, name, 'SKILL.md')
    let content: string
    try { content = await readFile(absPath, 'utf8') } catch { continue }
    const fm = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
    const desc = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null
    const editedAt = await fileMtimeIso(absPath)
    out.push({
      id: `skills/${name}/SKILL.md`,
      type: 'skill',
      absPath,
      title: name,
      description: desc ? (desc.length > 400 ? desc.slice(0, 397) + '…' : desc) : null,
      excerpt: extractExcerpt(content),
      tags: [],
      date: editedAt?.slice(0, 10) ?? null,
      editedAt,
      lines: content.split('\n').length,
      rawRefs: extractMemoryRefs(content).filter((r) => r.ref !== `skill:${name}`),
    })
  }
  return out
}

/** Documentos del negocio: los .md de primer nivel de docs/business-os (el mismo corte que Taller › Archivos). */
async function scanDocs(root: string): Promise<ParsedFile[]> {
  const dir = path.join(root, 'docs', 'business-os')
  if (!existsSync(dir)) return []
  const out: ParsedFile[] = []
  for (const entry of (await readdir(dir)).sort()) {
    if (!entry.endsWith('.md') || entry.startsWith('.')) continue
    const id = `docs/business-os/${entry}`
    if (VETADO.test(id)) continue
    const absPath = path.join(dir, entry)
    let content: string
    try { content = await readFile(absPath, 'utf8') } catch { continue }
    const editedAt = await fileMtimeIso(absPath)
    out.push({
      id,
      type: 'documento',
      absPath,
      title: firstHeading(content) ?? humanize(entry),
      description: null,
      excerpt: extractExcerpt(content),
      tags: [],
      date: dateFromFilename(entry) ?? editedAt?.slice(0, 10) ?? null,
      editedAt,
      lines: content.split('\n').length,
      rawRefs: extractMemoryRefs(content),
    })
  }
  return out
}

// Resuelve una ref cruda a un id de nodo conocido (o null)
function resolveRef(
  ref: string,
  fromId: string,
  ids: Set<string>,
  byBasename: Map<string, string[]>,
): string | null {
  // Una skill nombrada: solo si existe (un `main` o un `v2` en backticks no es nada).
  if (ref.startsWith('skill:')) {
    const id = `skills/${ref.slice(6)}/SKILL.md`
    return ids.has(id) ? id : null
  }
  const clean = ref.replace(/^\.\//, '').replace(/^(\.\.\/)+/, '').replace(/^\.claude\//, '')
  const fromDir = path.posix.dirname(fromId) // ej. 'memory/user'
  const layerRoot = fromId.startsWith('knowledge/') ? 'knowledge' : 'memory'
  // Ruta dentro de una skill (`habit-system/references/diario.md`, `skills/polar/scripts/…`): toca a la skill.
  const enSkill = /^(?:skills\/)?([a-z][a-z0-9-]+)\/(?:references|scripts|SKILL\.md)/.exec(clean)
  if (enSkill && ids.has(`skills/${enSkill[1]}/SKILL.md`)) return `skills/${enSkill[1]}/SKILL.md`

  const candidates: string[] = []
  if (clean.endsWith('.md')) {
    // rutas explícitas: relativas al índice de capa, a .claude/, o al dir del archivo
    candidates.push(
      clean, // ya viene como memory/... o knowledge/...
      `${layerRoot}/${clean}`,
      path.posix.normalize(path.posix.join(fromDir, clean)),
      `memory/${clean}`,
      `knowledge/${clean}`,
    )
    for (const c of candidates) {
      if (ids.has(c)) return c
    }
    // basename único (menciones tipo `juego-infinito.md`)
    const base = path.posix.basename(clean)
    const matches = byBasename.get(base)
    if (matches && matches.length >= 1) {
      // Preferir misma capa; si sigue ambiguo, tomar el primero (determinista)
      const sameLayer = matches.filter((m) => m.startsWith(layerRoot + '/'))
      return sameLayer[0] ?? matches[0]
    }
    return null
  }

  // wiki links sin extensión: concepts/x, connections/y, o bare 'x'
  if (clean.startsWith('daily/')) return null // logs diarios: fuera del grafo
  candidates.push(
    `knowledge/${clean}.md`,
    `knowledge/concepts/${clean}.md`,
    `knowledge/connections/${clean}.md`,
    `${layerRoot}/${clean}.md`,
  )
  for (const c of candidates) {
    if (ids.has(c)) return c
  }
  return null
}

async function buildGraphUncached(capas: CerebroCapa[]): Promise<CerebroGraph> {
  const root = resolveRoot()
  if (!root) {
    return {
      ok: false,
      reason: 'memory_unavailable',
      nodes: [],
      edges: [],
      meta: {
        generatedAt: new Date().toISOString(),
        fileCount: 0,
        isolatedCount: 0,
        brokenRefs: [],
        tagCounts: {},
      },
    }
  }

  const memoryRoot = path.join(root, '.claude', 'memory')
  const knowledgeRoot = path.join(root, '.claude', 'knowledge')

  const files: ParsedFile[] = []
  const porCapa: Partial<Record<CerebroCapa, number>> = {}
  const sumar = (capa: CerebroCapa, lote: ParsedFile[]) => { files.push(...lote); porCapa[capa] = (porCapa[capa] ?? 0) + lote.length }
  if (capas.includes('memoria')) {
    for (const [subdir, type] of Object.entries(MEMORY_SUBDIRS)) {
      sumar('memoria', await scanDir(path.join(memoryRoot, subdir), `memory/${subdir}`, type, 'memory'))
    }
  }
  if (capas.includes('skills')) sumar('skills', await scanSkills(path.join(root, '.claude', 'skills')))
  if (capas.includes('documentos')) sumar('documentos', await scanDocs(root))
  if (capas.includes('knowledge')) {
    for (const [subdir, type] of Object.entries(KNOWLEDGE_SUBDIRS)) {
      sumar('knowledge', await scanDir(path.join(knowledgeRoot, subdir), `knowledge/${subdir}`, type, 'knowledge'))
    }
  }

  // «Del ahora» (oro): commit reciente o cambio sin commitear; nunca el mtime de un checkout
  const cambios = await cambiosRecientes(root)
  for (const f of files) {
    const r = rutaRepo(f.id)
    f.editedAt = !cambios ? null : cambios.sucios.has(r) ? f.editedAt : cambios.commit.get(r) ?? null
  }

  // Descripciones curadas de los índices
  const [memDesc, knowDesc] = await Promise.all([
    readMemoryIndex(memoryRoot),
    readKnowledgeIndex(knowledgeRoot),
  ])
  for (const f of files) {
    f.description = memDesc.get(f.id) ?? knowDesc.get(f.id) ?? f.description
  }

  // Índices de resolución
  const ids = new Set(files.map((f) => f.id))
  const byBasename = new Map<string, string[]>()
  for (const f of files) {
    const base = path.posix.basename(f.id)
    byBasename.set(base, [...(byBasename.get(base) ?? []), f.id])
  }

  // Aristas
  const edgeKeys = new Set<string>()
  const edges: CerebroEdge[] = []
  const brokenRefs: BrokenRef[] = []
  const addEdge = (source: string, target: string, kind: CerebroEdgeKind) => {
    if (source === target) return
    // una arista por par (independiente de dirección) y por kind estructural vs tag
    const [a, b] = [source, target].sort()
    const key = `${a}→${b}:${kind === 'tag' ? 'tag' : 'ref'}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ source, target, kind })
  }

  // Una ref que apunta fuera del corpus (skills, accelerator/, docs/, repo en
  // general) es EXTERNA, no rota. Rota = parece del corpus pero no resuelve.
  const CORPUS_PREFIX =
    /^(\.claude\/)?(memory|knowledge|user|project|feedback|reference|concepts|connections)\//
  const looksInCorpus = (ref: string) => !ref.startsWith('skill:') && (!ref.includes('/') || CORPUS_PREFIX.test(ref))

  for (const f of files) {
    for (const { ref, kind } of f.rawRefs) {
      const target = resolveRef(ref, f.id, ids, byBasename)
      if (target) {
        addEdge(f.id, target, kind)
      } else if (!ref.startsWith('daily/') && !/^https?:/.test(ref) && looksInCorpus(ref)) {
        brokenRefs.push({ from: f.id, ref })
      }
    }
  }

  // Aristas por tags compartidos (solo knowledge, ≥2 tags en común, tags no genéricos)
  const tagCounts: Record<string, number> = {}
  for (const f of files) {
    for (const t of f.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1
  }
  const tagged = files.filter((f) => f.tags.length > 0)
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      const shared = tagged[i].tags.filter(
        (t) => tagged[j].tags.includes(t) && (tagCounts[t] ?? 0) <= 10,
      )
      if (shared.length >= 2) addEdge(tagged[i].id, tagged[j].id, 'tag')
    }
  }

  // Grados
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }

  const nodes: CerebroNode[] = files.map((f) => ({
    id: f.id,
    type: f.type,
    title: f.title,
    description: f.description,
    excerpt: f.excerpt,
    tags: f.tags,
    date: f.date,
    daysOld: daysSince(f.date),
    lines: f.lines,
    degree: degree.get(f.id) ?? 0,
    editedAt: f.editedAt,
  }))

  return {
    ok: true,
    nodes,
    edges,
    meta: {
      generatedAt: new Date().toISOString(),
      fileCount: files.length,
      isolatedCount: nodes.filter((n) => n.degree === 0).length,
      brokenRefs: brokenRefs.slice(0, 100),
      tagCounts,
      capas: porCapa,
    },
  }
}

// Cache con TTL corto por combinación de capas: el corpus cambia poco.
const cache = new Map<string, { graph: CerebroGraph; ts: number }>()
const CACHE_TTL_MS = 30_000
/** Las capas que lee el grafo si nadie pide otras: las mismas de Taller › Archivos. Knowledge, a pedido. */
const CAPAS_POR_OMISION: CerebroCapa[] = ['memoria', 'skills', 'documentos']

export async function buildGraph(force = false, capas: CerebroCapa[] = CAPAS_POR_OMISION): Promise<CerebroGraph> {
  const clave = [...new Set(capas)].sort().join(',')
  const hit = cache.get(clave)
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS && hit.graph.ok) {
    return hit.graph
  }
  const graph = await buildGraphUncached(capas)
  cache.set(clave, { graph, ts: Date.now() })
  return graph
}

/** El grafo que contiene a un id: el base si es de sus capas; con knowledge si el id es de knowledge. */
const capasDe = (id: string): CerebroCapa[] => id.startsWith('knowledge/') ? [...CAPAS_POR_OMISION, 'knowledge'] : CAPAS_POR_OMISION

/** Ruta absoluta de un nodo: los documentos cuelgan del repo; lo demás, de .claude/. */
function rutaDe(root: string, id: string): string | null {
  const base = id.startsWith('docs/') ? root : path.join(root, '.claude')
  const abs = path.join(base, id)
  return abs.startsWith(base + path.sep) ? abs : null
}

// ---------------------------------------------------------------------------
// Detalle de un nodo (contenido completo + backlinks resueltos)
// ---------------------------------------------------------------------------

const SAFE_ID = /^(memory|knowledge|skills|docs\/business-os)\/[A-Za-z0-9_\-./]+\.md$/

export async function getNodeDetail(id: string): Promise<CerebroNodeDetail | null> {
  if (!SAFE_ID.test(id) || id.includes('..') || VETADO.test(id)) return null
  const root = resolveRoot()
  if (!root) return null
  const graph = await buildGraph(false, capasDe(id))
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) return null

  // Guardia anti path-traversal: el resuelto debe seguir dentro de su raíz
  const absPath = rutaDe(root, id)
  if (!absPath) return null

  let content: string
  try {
    content = await readFile(absPath, 'utf8')
  } catch {
    return null
  }

  const titleOf = new Map(graph.nodes.map((n) => [n.id, n]))
  const outlinks = graph.edges
    .filter((e) => e.source === id && e.kind !== 'tag')
    .map((e) => ({ id: e.target, kind: e.kind, ...pick(titleOf.get(e.target)) }))
  const backlinks = graph.edges
    .filter((e) => e.target === id && e.kind !== 'tag')
    .map((e) => ({ id: e.source, kind: e.kind, ...pick(titleOf.get(e.source)) }))

  return {
    ...node,
    content,
    sourcePath: id.startsWith('docs/') ? id : `.claude/${id}`,
    outlinks,
    backlinks,
  }
}

function pick(node: CerebroNode | undefined): { title: string; type: CerebroNodeType } {
  return { title: node?.title ?? '(desconocido)', type: node?.type ?? 'concept' }
}

// ---------------------------------------------------------------------------
// Selección de slice para síntesis (cuando el usuario no elige nodos)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'para', 'como', 'esta', 'este', 'esto', 'pero', 'donde', 'cuando', 'sobre',
  'entre', 'desde', 'hasta', 'porque', 'que', 'con', 'una', 'unos', 'unas',
  'los', 'las', 'del', 'mas', 'más', 'muy', 'hay', 'fue', 'ser', 'son',
  'tiene', 'tengo', 'hacer', 'hago', 'puedo', 'quiero', 'debo', 'deberia',
  'debería', 'cual', 'cuál', 'cuales', 'todo', 'todos', 'nada', 'algo',
  'aprendimos', 'aprendi', 'aprendí', 'dime', 'dame', 'necesito', 'ayuda',
  'the', 'and', 'for', 'with', 'what', 'how', 'why', 'about',
])

export async function autoSelectNodes(question: string, limit = 8): Promise<string[]> {
  const graph = await buildGraph(false, [...CAPAS_POR_OMISION, 'knowledge'])
  const tokens = question
    .toLowerCase()
    .split(/[^a-záéíóúñü0-9-]+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t))
  if (tokens.length === 0) return []

  // Haystacks por nodo + IDF por token: "benja"/"imperio" (raros) pesan mucho
  // más que "saas"/"factory" (aparecen en medio corpus y solo meten ruido).
  const stacks = graph.nodes.map((n) => ({
    id: n.id,
    degree: n.degree,
    title: `${n.title} ${n.id}`.toLowerCase(),
    tags: n.tags.join(' ').toLowerCase(),
    body: `${n.description ?? ''} ${n.excerpt}`.toLowerCase(),
  }))
  const idf = new Map<string, number>()
  for (const t of tokens) {
    const df = stacks.filter((s) => s.title.includes(t) || s.tags.includes(t) || s.body.includes(t)).length
    idf.set(t, Math.log((stacks.length + 1) / (df + 1)))
  }
  const scored = stacks
    .map((s) => {
      let score = 0
      for (const t of tokens) {
        const w = idf.get(t) ?? 0
        if (w <= 0.05) continue // token omnipresente: no discrimina
        if (s.title.includes(t)) score += 3 * w
        if (s.tags.includes(t)) score += 2 * w
        if (s.body.includes(t)) score += 1 * w
      }
      return { id: s.id, score: score + Math.min(s.degree, 5) * 0.05 }
    })
    .filter((s) => s.score >= 1)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.id)
}

// Caps pensados para el MAX_INPUT_LENGTH=50K de claudeclaw: contenido 40K +
// preámbulo del prompt ≈ 42K, nunca se trunca del lado del agente.
export async function readNodeContents(
  nodeIds: string[],
  perNodeCap = 6000,
  totalCap = 40_000,
): Promise<{ id: string; title: string; content: string }[]> {
  const out: { id: string; title: string; content: string }[] = []
  let total = 0
  for (const id of nodeIds) {
    const detail = await getNodeDetail(id)
    if (!detail) continue
    let content = detail.content
    if (content.length > perNodeCap) {
      content = content.slice(0, perNodeCap) + '\n\n[…truncado…]'
    }
    if (total + content.length > totalCap) break
    total += content.length
    out.push({ id, title: detail.title, content })
  }
  return out
}
