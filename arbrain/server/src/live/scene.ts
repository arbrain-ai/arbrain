/** Scene is a document, not a catalog of dashboard widgets. Coordinates are percentages. */
export type Frame = { x: number; y: number; width: number; height: number }
export type Provenance = { receiptId: string; label: string }
export type Artifact = {
  id: string
  title: string
  frame: Frame
  html: string
  css?: string
  /** Optional worker program: renders HTML from data, never gets DOM or credentials. */
  program?: string
  data?: unknown
  state?: unknown
  sources: Provenance[]
  evidence: 'observed' | 'proposal' | 'scenario' | 'unknown'
  pinned: boolean
  group?: string
  note?: string
}
export type Scene = {
  version: 1
  revision: number
  title: string
  artifacts: Artifact[]
  selected: string[]
  focused: string | null
}
export type SceneOperation =
  | { type: 'put'; artifact: Artifact }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; frame: Frame }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'select'; ids: string[] }
  | { type: 'focus'; id: string | null }
  | { type: 'annotate'; id: string; note: string }
  | { type: 'group'; ids: string[]; group: string }
  | { type: 'title'; title: string }
export type ScenePatch = { id: string; baseRevision: number; operations: SceneOperation[] }
export const emptyScene = (): Scene => ({ version: 1, revision: 0, title: 'Espacio de trabajo', artifacts: [], selected: [], focused: null })
export class SceneError extends Error { }
const ID = /^[a-zA-Z0-9_-]{1,100}$/
const MAX_SIZE = 2_000_000
function requireId(id: string) { if (!ID.test(id) || ['__proto__','prototype','constructor'].includes(id)) throw new SceneError('Identificador inválido') }
function requireText(value: unknown, max: number) { if (typeof value !== 'string' || value.length > max) throw new SceneError('Texto inválido o demasiado grande') }
export function validateFrame(frame: Frame) {
  if (!frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)) throw new SceneError('Geometría inválida')
  if (frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > 100.001 || frame.y + frame.height > 100.001) throw new SceneError('La pieza debe caber en el espacio visible')
}
export function validateScene(scene: Scene, allowedReceipts: ReadonlySet<string>) {
  if (scene.version !== 1 || !Number.isSafeInteger(scene.revision) || scene.revision < 0 || !Array.isArray(scene.artifacts) || scene.artifacts.length > 64) throw new SceneError('Escena inválida')
  requireText(scene.title, 200)
  if (JSON.stringify(scene).length > MAX_SIZE) throw new SceneError('Escena demasiado grande')
  const ids = new Set<string>()
  for (const artifact of scene.artifacts) {
    requireId(artifact.id)
    if (ids.has(artifact.id)) throw new SceneError('Identificador duplicado')
    ids.add(artifact.id)
    validateFrame(artifact.frame)
    requireText(artifact.title, 200); requireText(artifact.html, 300_000)
    if (artifact.state !== undefined && JSON.stringify(artifact.state).length > 16000) throw new SceneError('Estado interactivo demasiado grande')
    if (artifact.css !== undefined) requireText(artifact.css, 100_000)
    if (artifact.program !== undefined) requireText(artifact.program, 100_000)
    if (artifact.note !== undefined) requireText(artifact.note, 4000)
    if (artifact.group !== undefined) requireText(artifact.group, 100)
    if (typeof artifact.pinned !== 'boolean' || !['observed','proposal','scenario','unknown'].includes(artifact.evidence) || !Array.isArray(artifact.sources)) throw new SceneError('Metadatos inválidos')
    for (const source of artifact.sources) {
      if (!allowedReceipts.has(source.receiptId)) throw new SceneError('La pieza cita una consulta no verificada en esta conversación')
      requireText(source.label, 300)
    }
    if (artifact.evidence === 'observed' && !artifact.sources.length) throw new SceneError('Los datos observados necesitan una consulta verificable')
  }
  if (!Array.isArray(scene.selected) || scene.selected.some(id => !ids.has(id)) || (scene.focused !== null && !ids.has(scene.focused))) throw new SceneError('Selección inexistente')
  return scene
}
/** Atomic: invalid patch leaves prior scene untouched. Pinned objects need an explicit unpin. */
export function applyScenePatch(current: Scene, patch: ScenePatch, receipts: ReadonlySet<string>): Scene {
  requireId(patch.id)
  if (patch.baseRevision !== current.revision) throw new SceneError('La escena cambió. Vuelve a leerla antes de editar.')
  if (!Array.isArray(patch.operations) || !patch.operations.length || patch.operations.length > 256) throw new SceneError('Operaciones inválidas')
  const next = structuredClone(current)
  const find = (id: string) => {
    const artifact = next.artifacts.find(a => a.id === id)
    if (!artifact) throw new SceneError('La pieza ya no existe')
    return artifact
  }
  for (const op of patch.operations) {
    switch (op.type) {
      case 'put': {
        const existing = next.artifacts.findIndex(a => a.id === op.artifact.id)
        if (existing >= 0 && next.artifacts[existing].pinned) throw new SceneError('Desfija la pieza explícitamente antes de sustituirla')
        if (existing >= 0) { const replacement=structuredClone(op.artifact); if(replacement.state===undefined)replacement.state=next.artifacts[existing].state; next.artifacts[existing]=replacement }
        else next.artifacts.push(structuredClone(op.artifact))
        break
      }
      case 'remove':
        if (find(op.id).pinned) throw new SceneError('Desfija la pieza explícitamente antes de retirarla')
        next.artifacts = next.artifacts.filter(a => a.id !== op.id)
        next.selected = next.selected.filter(id => id !== op.id)
        if (next.focused === op.id) next.focused = null
        break
      case 'move': if (find(op.id).pinned) throw new SceneError('La pieza está fija'); find(op.id).frame = op.frame; break
      case 'pin': find(op.id).pinned = op.pinned; break
      case 'select': op.ids.forEach(find); next.selected = [...new Set(op.ids)]; break
      case 'focus': if (op.id !== null) find(op.id); next.focused = op.id; break
      case 'annotate': find(op.id).note = op.note; break
      case 'group': op.ids.forEach(id => { find(id).group = op.group }); break
      case 'title': next.title = op.title; break
      default: throw new SceneError('Operación desconocida')
    }
  }
  next.revision++
  return validateScene(next, receipts)
}
export function sceneContext(scene: Scene) {
  return {
    revision: scene.revision, title: scene.title, focused: scene.focused, selected: scene.selected,
    objects: scene.artifacts.map(a => ({ id:a.id,title:a.title,frame:a.frame,pinned:a.pinned,group:a.group,note:a.note,evidence:a.evidence,sources:a.sources,state:a.state })),
  }
}
