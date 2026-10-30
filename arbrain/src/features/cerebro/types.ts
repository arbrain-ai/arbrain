// Segundo Cerebro — tipos compartidos entre el parser server-side y la UI.
// Nodo = memoria curada (.claude/memory), skill (.claude/skills/<n>/SKILL.md),
// documento del negocio (docs/business-os/*.md) o, a pedido, knowledge compilado.
// Los IDs son rutas relativas a .claude/ (ej. 'memory/user/paraguay.md',
// 'skills/habit-system/SKILL.md'), salvo los documentos: relativas al repo ('docs/business-os/x.md').

export type CerebroNodeType =
  | 'user'
  | 'project'
  | 'feedback'
  | 'reference'
  | 'skill'
  | 'documento'
  | 'concept'
  | 'connection'

export type CerebroEdgeKind = 'link' | 'mention' | 'wiki' | 'connects' | 'tag'

/** Las capas que puede leer el grafo. Taller › Memoria pide las tres primeras; knowledge (≈1,000 notas) es opcional. */
export type CerebroCapa = 'memoria' | 'skills' | 'documentos' | 'knowledge'
export const CAPAS_BASE: CerebroCapa[] = ['memoria', 'skills', 'documentos']

export interface CerebroNode {
  id: string
  type: CerebroNodeType
  title: string
  /** Descripción curada (MEMORY.md / knowledge index.md) si existe */
  description: string | null
  /** Primer párrafo del archivo, sin markdown */
  excerpt: string
  tags: string[]
  /** YYYY-MM-DD — filename (memory) o frontmatter (knowledge); fallback mtime */
  date: string | null
  daysOld: number | null
  lines: number
  degree: number
  /** ISO del último cambio real (commit de los últimos días, o mtime si tiene cambios sin commitear). Lo de 48 h va en oro. */
  editedAt?: string | null
}

export interface CerebroEdge {
  source: string
  target: string
  kind: CerebroEdgeKind
}

export interface BrokenRef {
  from: string
  ref: string
}

export interface CerebroGraph {
  ok: boolean
  reason?: string
  nodes: CerebroNode[]
  edges: CerebroEdge[]
  meta: {
    generatedAt: string
    fileCount: number
    isolatedCount: number
    brokenRefs: BrokenRef[]
    /** tag → cuántos nodos lo llevan (para chips/filtros) */
    tagCounts: Record<string, number>
    /** Capas leídas y cuántos nodos trajo cada una (para decir de dónde salen las cifras). */
    capas?: Partial<Record<CerebroCapa, number>>
  }
}

export interface CerebroNodeDetail extends CerebroNode {
  /** Markdown completo del archivo (read-only) */
  content: string
  /** Ruta absoluta legible para mostrar la fuente */
  sourcePath: string
  outlinks: CerebroLinkRef[]
  backlinks: CerebroLinkRef[]
}

export interface CerebroLinkRef {
  id: string
  title: string
  type: CerebroNodeType
  kind: CerebroEdgeKind
}

export type SynthesisMode = 'brief' | 'simple' | 'journey' | 'contenido'

// Paleta (5 oct 2026, lenguaje de la casa: «oro para el ahora; el resto, morado de marca o neutro»). Antes eran seis
// colores de arcoíris. Memoria = tonos de morado por capa; skills y documentos = neutros, y se distinguen por FORMA
// (rombo y cuadrado) además de tono. El oro queda libre para lo que cambió en las últimas 48 h.
// Estos valores son los del tema oscuro (la 3D es un planetario oscuro siempre); el 2D lee su paleta de los tokens CSS.
export const TYPE_META: Record<
  CerebroNodeType,
  { label: string; color: string; group: CerebroCapa; forma: 'circulo' | 'rombo' | 'cuadro' }
> = {
  user: { label: 'Sobre ti', color: '#A968F7', group: 'memoria', forma: 'circulo' },
  project: { label: 'Proyectos', color: '#8B5CF6', group: 'memoria', forma: 'circulo' },
  feedback: { label: 'Reglas', color: '#C4B5FD', group: 'memoria', forma: 'circulo' },
  reference: { label: 'Referencias', color: '#7C6BB0', group: 'memoria', forma: 'circulo' },
  skill: { label: 'Skills', color: '#E4E4E7', group: 'skills', forma: 'rombo' },
  documento: { label: 'Documentos', color: '#A1A1AA', group: 'documentos', forma: 'cuadro' },
  concept: { label: 'Conceptos', color: '#71717A', group: 'knowledge', forma: 'circulo' },
  connection: { label: 'Conexiones', color: '#52525B', group: 'knowledge', forma: 'circulo' },
}

/** Oro: lo que cambió en las últimas 48 h. */
export const VENTANA_AHORA_MS = 48 * 3_600_000
export const esDelAhora = (n: { editedAt?: string | null }, ahora = Date.now()) =>
  !!n.editedAt && ahora - Date.parse(n.editedAt) < VENTANA_AHORA_MS

export const SYNTHESIS_MODES: Record<
  SynthesisMode,
  { label: string; hint: string }
> = {
  brief: {
    label: 'Brief de decisión',
    hint: 'Contexto → opciones → recomendación → siguiente acción',
  },
  simple: {
    label: 'Explicado simple',
    hint: 'HTML navegable para que un principiante lo entienda',
  },
  journey: {
    label: 'Journey',
    hint: 'Historia cronológica que cruza los nodos elegidos',
  },
  contenido: {
    label: 'Ángulo de contenido',
    hint: 'Idea de video: hook, tesis, estructura',
  },
}
