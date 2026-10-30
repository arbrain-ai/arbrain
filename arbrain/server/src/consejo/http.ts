import { parseSettings } from './settings.js'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConsejoEngine } from './engine.js'
import { ConsejoStore } from './store.js'
import { ConsejoRuntime } from './runtime.js'
import { relevantKnowledge } from './knowledge.js'
import { CONVERSATION_CONTRACT } from './context.js'
import { ConsejoError, type Submission, type Executor } from './types.js'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'

export function sharedInstructions(message:string): string {
  // One read of each canonical source per accepted turn. No provider-specific summaries.
  return CONVERSATION_CONTRACT + '\n' + ['CLAUDE.md', '.claude/memory/MEMORY.md', '.claude/now.md'].map(file =>
    `\nFuente ${file} (fotografía histórica, no datos en vivo):\n${readFileSync(join(PROJECT_ROOT, file), 'utf8')}`).join('\n') + relevantKnowledge(PROJECT_ROOT,message).map(source=>`\nFuente íntegra ${source.path}:\n${source.text}`).join('\n')
}
let engine: ConsejoEngine | undefined
export function consejoEngine(executor?: Executor): ConsejoEngine {
  if (!engine) {
    mkdirSync(STORE_DIR, { recursive: true })
    engine = new ConsejoEngine(new ConsejoStore(join(STORE_DIR, 'consejo.db')), new ConsejoRuntime(), sharedInstructions, 600_000, 280_000, executor)
  }
  return engine
}
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)
function requireId(x: unknown): asserts x is string { if (!uuid(x)) throw new ConsejoError('Identificador inválido.', 400) }
export function handleConsejo(body: Record<string, unknown>, e = consejoEngine()): unknown {
  const owner = body.ownerId
  if (typeof owner !== 'string' || !uuid(owner)) throw new ConsejoError('Propietario requerido.', 400)
  if (body.action === 'catalog') return new ConsejoRuntime().catalog(AbortSignal.timeout(25000)).catch(error=>{throw new ConsejoError(error instanceof Error ? error.message : 'No se pudo consultar las cuentas.',503)})
  if (body.action === 'list') return { ownerId: owner, conversations: e.store.list(owner) }
  requireId(body.conversationId)
  if (body.action === 'create') return { conversation: e.store.create(owner, body.conversationId) }
  const conversation = e.store.conversation(owner, body.conversationId)
  if (body.action === 'snapshot') {
    const turns = e.store.turns(owner, conversation.id).map(({ packet, sourcePacket: _source, requestHash, owner: _owner, contextPreparation, evidence:_evidence, ...turn }) => ({ ...turn, proposals:Object.fromEntries(Object.entries(turn.proposals).map(([stage,p])=>[stage,{...p,tools:p.tools?.map(t=>({...t,text:t.name==='consult_provider'?t.text:undefined}))}])), settings: packet.settings, target: packet.target, references: packet.references.map(r=>({turnId:r.turnId,source:r.provider})), packetHash: packet.hash, contextVersion: packet.summary?.version ?? 0, contextPreparation: contextPreparation ? { state: contextPreparation.state, error: contextPreparation.error } : undefined }))
    return { conversation, turns }
  }
  requireId(body.turnId)
  if (body.action === 'answer') {
    if (typeof body.requestId !== 'string' || !body.requestId) throw new ConsejoError('Pregunta inválida.',400)
    const answers=body.answers && typeof body.answers==='object' && !Array.isArray(body.answers) ? Object.fromEntries(Object.entries(body.answers).filter((entry):entry is [string,string]=>typeof entry[1]==='string')) : null
    return {ok:e.answer(owner,conversation.id,body.turnId,body.requestId,answers)}
  }
  if (body.action === 'submit') {
    requireId(body.branchId)
    if (body.parentId !== null) requireId(body.parentId)
    if (body.editTurnId !== undefined) requireId(body.editTurnId)
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 50_000) throw new ConsejoError('Mensaje inválido o demasiado largo.', 400)
    if (body.attachments !== undefined) {
      if (!Array.isArray(body.attachments) || body.attachments.length > 5 || JSON.stringify(body.attachments).length > 12_000_000) throw new ConsejoError('Hasta cinco adjuntos, 12 MB en total.', 413)
      for (const a of body.attachments) {
        if (!a || typeof a.name !== 'string' || typeof a.content !== 'string' || !['text','image'].includes(a.type)) throw new ConsejoError('Adjunto inválido.', 400)
        if (a.type === 'text' && a.content.length > 100_000) throw new ConsejoError('El documento es demasiado largo.', 413)
        if (a.type === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a.content)) throw new ConsejoError('Imagen inválida.', 400)
      }
    }
    if(body.references!==undefined && (!Array.isArray(body.references)||body.references.length>12||body.references.some(r=>!r||!uuid(r.turnId)||!['claude','openai','synthesis'].includes(r.source))))throw new ConsejoError('Referencias inválidas.',400)
    if(body.target!==undefined && !['both','claude','openai'].includes(String(body.target)))throw new ConsejoError('Destinatario inválido.',400)
    e.submit(owner, { conversationId: body.conversationId, turnId: body.turnId, branchId: body.branchId, parentId: body.parentId as string | null, message: body.message, ...(body.target ? {target:body.target} : {}), ...(body.references ? {references:body.references} : {}), ...(body.settings !== undefined ? { settings: parseSettings(body.settings) } : {}), ...(body.attachments ? { attachments: body.attachments } : {}), ...(body.editTurnId ? { editTurnId: body.editTurnId } : {}) } as Submission)
  } else if (body.action === 'retry') { requireId(body.requestId); e.retry(owner, conversation.id, body.turnId, body.requestId) }
  else if (body.action === 'cancel') e.cancel(owner, conversation.id, body.turnId)
  else if (body.action === 'individual') {
    if (body.provider !== 'claude' && body.provider !== 'openai') throw new ConsejoError('Proveedor inválido.', 400)
    e.individual(owner, conversation.id, body.turnId, body.provider)
  } else throw new ConsejoError('Acción desconocida.', 400)
  return handleConsejo({ ownerId: owner, conversationId: conversation.id, action: 'snapshot' }, e)
}
