import { parseSettings, selectedIdentities, stageSelection } from './settings.js'
import { CUENTAS_CONSEJO } from './identidades.js'
import { randomUUID } from 'node:crypto'
import { isExecutionRequest } from './executor.js'
import { ConsejoStore } from './store.js'
import { hash, packet, pathTo, responseSources, packetSize, summaryInput, compactPacket } from './context.js'
import { ConsejoError, type Identity, type Provider, type Runtime, type Stage, type Submission, type Turn, type Executor } from './types.js'
export const IDENTITIES: Record<Provider, Identity> = {
  claude: { provider: 'claude', account: CUENTAS_CONSEJO.claude, model: 'claude-fable-5-1', billing: 'subscription' },
  openai: { provider: 'openai', account: CUENTAS_CONSEJO.openai, model: 'gpt-6-astra', billing: 'subscription' },
}
export function checkIdentities(actual: Record<Provider, Identity>, expected = IDENTITIES): void {
  for (const p of ['claude', 'openai'] as const) if (hash(actual[p]) !== hash(expected[p])) throw new ConsejoError(`La identidad efectiva de ${p} no coincide con Consejo. No se usará otra cuenta o modelo.`)
}
export class ConsejoEngine {
  private active = new Map<string, { abort: AbortController; done: Promise<void> }>()
  constructor(readonly store: ConsejoStore, private runtime: Runtime, private instructions: (message:string) => string, private timeoutMs = 600_000, private contextThreshold = 280_000, private executor?: Executor) { store.recover() }
  submit(owner: string, input: Submission): Turn {
    const c = this.store.conversation(owner, input.conversationId)
    const requestHash = hash(input)
    const turns = this.store.turns(owner, c.id)
    const existing = turns.find(t => t.id === input.turnId)
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConsejoError('Ese envío ya existe con otro contenido.')
      return existing // Reconnection or repeated POST never calls a provider again.
    }
    if (!input.message.trim()) throw new ConsejoError('Escribe un mensaje.', 400)
    if (this.active.size >= 3) throw new ConsejoError('Consejo está ocupado. Conserva el borrador y reintenta.', 429)
    let parentId = input.parentId
    if (input.editTurnId) {
      const edited = this.store.turn(owner, c.id, input.editTurnId)
      if (input.branchId === c.rootBranchId || turns.some(t => t.branchId === input.branchId)) throw new ConsejoError('Una edición requiere una rama nueva.')
      parentId = edited.parentId
    } else {
      const branch = turns.filter(t => t.branchId === input.branchId)
      if (!branch.length && input.branchId !== c.rootBranchId) throw new ConsejoError('Rama desconocida.')
      const head = branch.at(-1)?.id ?? null
      if (head !== parentId) throw new ConsejoError('El historial cambió. Recupera el último turno antes de enviar.')
    }
    const history = pathTo(turns, parentId)
    const attachments = input.attachments ?? []
    const settings = parseSettings(input.settings)
    const common = packet(this.instructions(input.message), history, input.turnId, input.message, attachments, selectedIdentities(settings), input.references)
    if(input.target && !['both','claude','openai'].includes(input.target)) throw new ConsejoError('Destinatario inválido.',400)
    if (settings) common.settings = settings
    if (input.target) common.target = input.target
    { const {hash:_hash,...body}=common; common.hash=hash(body) }
    const t: Turn = {
      id: input.turnId, owner, conversationId: c.id, branchId: input.branchId, parentId,
      mode: isExecutionRequest(input.message) ? 'execution' : 'deliberation',
      requestHash, packet: common, message: input.message, attachments, state: 'pending', createdAt: Date.now(), revision: 1,
      proposals: { claude: { state: 'pending' }, openai: { state: 'pending' }, synthesis: { state: 'pending' } },
    }
    this.store.insert(t) // Durability BEFORE any provider call.
    this.launch(t)
    return this.store.turn(owner, c.id, t.id)
  }
  retry(owner: string, conversationId: string, id: string, requestId: string = randomUUID()): Turn {
    const t = this.store.turn(owner, conversationId, id)
    if (this.active.has(id) || t.state === 'complete' || t.retryIds?.includes(requestId)) return t
    if (this.store.turns(owner, conversationId).some(x => x.parentId === id)) throw new ConsejoError('Este turno ya tiene una continuación; crea una rama para cambiarlo.')
    if (this.active.size >= 3) throw new ConsejoError('Consejo está ocupado.', 429)
    t.retryIds = [...(t.retryIds ?? []), requestId]
    for (const p of Object.values(t.proposals)) if (p.state !== 'complete') { p.state = 'pending'; delete p.error }
    t.state = 'pending'; this.store.save(t); this.launch(t)
    return this.store.turn(owner, conversationId, id)
  }
  cancel(owner: string, conversationId: string, id: string): Turn {
    const t = this.store.turn(owner, conversationId, id)
    if (t.state === 'complete' || t.state === 'cancelled') return t
    t.state = 'cancelled'
    if (t.execution?.state === 'running') t.execution.state = 'cancelled'
    if (t.contextPreparation?.state === 'running') t.contextPreparation.state = 'cancelled'
    for (const p of Object.values(t.proposals)) if (p.state !== 'complete') { p.state = 'cancelled'; p.endedAt = Date.now(); for(const tool of p.tools??[])if(tool.state==='running'){tool.state='cancelled';tool.endedAt=Date.now()} }
    this.store.save(t) // Fence late writes before signalling children.
    this.active.get(id)?.abort.abort()
    return t
  }
  individual(owner: string, conversationId: string, id: string, provider: Provider): Turn {
    const t = this.store.turn(owner, conversationId, id)
    if (t.state === 'complete') return t
    if (this.active.has(id)) throw new ConsejoError('Espera a que termine o se detenga el turno.')
    const p = t.proposals[provider]
    if (p.state !== 'complete' || !p.text) throw new ConsejoError('Esa perspectiva no está disponible.')
    t.final = p.text; t.delivery = provider; t.state = 'complete'; this.store.save(t)
    return t
  }
  answer(owner:string,conversationId:string,turnId:string,requestId:string,answers:Record<string,string>|null):boolean {
    const t=this.store.turn(owner,conversationId,turnId)
    const question=t.execution?.progress?.questions.find(q=>q.requestId===requestId && q.status==='pending')
    if(t.state!=='running'||!question||!this.executor)throw new ConsejoError('La pregunta no pertenece a este turno activo.')
    const ok=this.executor.answer(requestId,answers)
    if(!ok)throw new ConsejoError('La pregunta ya expiró o se resolvió.')
    question.status=answers?'answered':'skipped';this.store.save(t);return true
  }
  async idle(id: string): Promise<void> { await this.active.get(id)?.done }
  private launch(t: Turn): void {
    const abort = new AbortController()
    // Schedule after the entry exists, including synchronously rejected test runtimes.
    const done = Promise.resolve().then(() => this.run(t, abort)).finally(() => this.active.delete(t.id))
    this.active.set(t.id, { abort, done })
    void done.catch(() => { /* DB failure: persisted running state becomes recoverable on restart. */ })
  }
  private async run(t: Turn, abort: AbortController): Promise<void> {
    const timer = setTimeout(() => abort.abort(), this.timeoutMs)
    const alive = () => !abort.signal.aborted && this.store.turn(t.owner, t.conversationId, t.id).state !== 'cancelled'
    const save = () => { if (alive()) this.store.save(t) }
    try {
      if (!alive()) return
      t.state = 'running'; save()
      if(t.mode==='execution') {
        if(!this.executor)throw new Error('La vía de ejecución no está instalada en este host.')
        t.execution={state:'running',startedAt:Date.now()};save()
        try {
          const result=await withAbort(this.executor.execute(structuredClone(t),abort.signal,progress=>{
            if(!alive())return
            // A question answer may have incremented the stored revision meanwhile.
            const current=this.store.turn(t.owner,t.conversationId,t.id)
            t.revision=current.revision
            t.execution={...t.execution!,progress};save()
          }),abort.signal)
          if(!alive())return
          t.revision=this.store.turn(t.owner,t.conversationId,t.id).revision
          t.execution={...t.execution!,...result,state:'complete',endedAt:Date.now()}
          t.final=result.text;t.delivery='execution';t.state='complete';save()
        }catch(error){
          if(alive()){t.execution={...t.execution!,state:'failed',error:error instanceof Error?error.message:'Falló el ejecutor.',endedAt:Date.now()};t.state='failed';save()}
        }
        return
      }
      checkIdentities(await withAbort(this.runtime.identities(abort.signal, t.packet.settings), abort.signal), t.packet.identities)
      if (!alive()) return
      if (packetSize(t.packet) > this.contextThreshold && t.contextPreparation?.state !== 'complete' && (summaryInput(t.packet) || packetSize(t.packet) > 400_000)) {
        const input = summaryInput(t.packet)
        if (!input || !this.runtime.summarize) throw new Error('No se puede compactar este paquete común. Conservamos los originales; reduce el mensaje o las fuentes explícitas.')
        t.contextPreparation = {state:'running',startedAt:Date.now()}; save()
        try {
          const result = await withAbort(this.runtime.summarize(input,abort.signal),abort.signal)
          if (!alive()) return
          if (hash(result.identity) !== hash(IDENTITIES.claude)) throw new Error('La compactación cambió de cuenta o modelo.')
          const compacted = compactPacket(t.packet,input,result.text)
          if (packetSize(compacted) > 400_000) throw new Error('El resumen conserva demasiadas correcciones o fuentes originales para este turno. Reduce las fuentes explícitas; no se truncó el contexto.')
          t.sourcePacket = structuredClone(t.packet)
          t.packet = compacted
          t.contextPreparation = {...result,state:'complete',startedAt:t.contextPreparation.startedAt,endedAt:Date.now()}
          save() // One immutable prepared packet, durably installed BEFORE either proposal.
        } catch(error) {
          t.contextPreparation = {...t.contextPreparation,state:'failed',error:error instanceof Error?error.message:'Falló el resumen común.',endedAt:Date.now()}; save(); throw error
        }
      }
      const history=responseSources(pathTo(this.store.turns(t.owner,t.conversationId),t.parentId))
      t.evidence ??= {}
      const infer = async (stage: Stage) => {
        const p = t.proposals[stage]
        if (p.state === 'complete' || !alive()) return
        p.state = 'running'; p.startedAt = Date.now(); save()
        try {
          const result = await withAbort(this.runtime.infer(stage, structuredClone(t.packet), stage === 'synthesis' ? structuredClone(t.proposals) : { claude: { state: 'pending' }, openai: { state: 'pending' }, synthesis: { state: 'pending' } }, abort.signal, {history,cache:t.evidence!,traces:p.tools ?? [],update:trace=>{
            if(!alive())return
            p.tools ??= []; const index=p.tools.findIndex(x=>x.id===trace.id)
            if(index<0)p.tools.push(structuredClone(trace));else p.tools[index]=structuredClone(trace)
            save()
          }}), abort.signal)
          if (!alive()) return
          const expected = stageSelection(t.packet, stage).identity
          if (hash(result.identity) !== hash(expected)) throw new Error('El proveedor cambió la cuenta o el modelo; no se publicó su respuesta.')
          if (!result.text.trim()) throw new Error('El proveedor terminó sin respuesta pública.')
          Object.assign(p, result, { state: 'complete' })
        } catch (error) { p.state = 'failed'; p.error = error instanceof Error ? error.message : 'Falló esta etapa.' }
        finally { p.endedAt = Date.now(); save() }
      }
      if(t.packet.target && t.packet.target!=='both') {
        const target=t.packet.target
        for(const s of ['claude','openai','synthesis'] as const) if(s!==target)t.proposals[s]={state:'cancelled'}
        await infer(target)
        if(!alive())return
        if(t.proposals[target].state==='complete'){t.final=t.proposals[target].text;t.delivery=target;t.state='complete'}
        else t.state='failed'
        save();return
      }
      await Promise.all([infer('claude'), infer('openai')])
      if (!alive()) return
      if (t.proposals.claude.state === 'complete' && t.proposals.openai.state === 'complete') {
        await infer('synthesis')
      } else { t.proposals.synthesis = { state: 'failed', error: 'Falta una perspectiva. Reintenta o continúa con la disponible.' } }
      if (!alive()) return
      if (t.proposals.synthesis.state === 'complete') {
        t.final = t.proposals.synthesis.text; t.delivery = 'integrated'; t.state = 'complete'
      } else t.state = 'failed'
      save()
    } catch (error) {
      if (alive()) {
        t.state = 'failed'
        for (const p of Object.values(t.proposals)) if (p.state !== 'complete') { p.state = 'failed'; p.error = error instanceof Error ? error.message : 'No se pudo iniciar Consejo.' }
        save()
      }
    } finally {
      clearTimeout(timer)
      const current = this.store.turn(t.owner, t.conversationId, t.id)
      if (abort.signal.aborted && current.state !== 'cancelled' && current.state !== 'complete') {
        current.state = 'failed'
        for (const p of Object.values(current.proposals)) if (p.state !== 'complete') { p.state = 'failed'; p.error = 'Se agotó el tiempo de esta etapa. No se reenvió.'; p.endedAt = Date.now(); for(const tool of p.tools??[])if(tool.state==='running'){tool.state='failed';tool.error='Etapa interrumpida por tiempo.';tool.endedAt=Date.now()} }
        this.store.save(current)
      }
    }
  }
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Cancelado o tiempo agotado.'))
    if (signal.aborted) { void promise.catch(() => {}); abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
