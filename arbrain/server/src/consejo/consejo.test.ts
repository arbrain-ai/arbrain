import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ConsejoStore } from './store.js'
import { ConsejoEngine, IDENTITIES } from './engine.js'
import { packet, pathTo } from './context.js'
import { assertClaudeAccount, assertOpenAIAccount, claudeOptions, CODEX_LOCKDOWN, deliberationEnv } from './runtime.js'
import { handleConsejo } from './http.js'
import type { Packet, Runtime, Stage, Submission } from './types.js'
const owner = randomUUID()
const stores: ConsejoStore[] = []
afterEach(() => { for (const s of stores.splice(0)) s.close() })
function setup(custom?: Partial<Runtime>, filename = ':memory:') {
  const store = new ConsejoStore(filename); stores.push(store)
  const calls: Array<{ stage: Stage; packet: Packet; proposals: unknown }> = []
  const runtime: Runtime = {
    identities: async () => structuredClone(IDENTITIES),
    infer: async (stage, p, proposals) => { calls.push({ stage, packet: p, proposals }); return { text: `${stage}: ${p.messages.at(-1)!.content}`, identity: IDENTITIES[stage === 'openai' ? 'openai' : 'claude'] } }, ...custom,
  }
  const e = new ConsejoEngine(store, runtime, () => 'Levy common instructions')
  const c = store.create(owner, randomUUID())
  const input = (message = 'pregunta'): Submission => ({ conversationId: c.id, turnId: randomUUID(), branchId: c.rootBranchId, parentId: null, message })
  return { e, store, c, input, calls, runtime }
}
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('Consejo deterministic contract', () => {
  it('persists acceptance before inference, shares a frozen packet, runs independent proposals then synthesis', async () => {
    const s = setup(); const input = s.input()
    s.e.submit(owner, input)
    expect(s.store.turn(owner,s.c.id,input.turnId).packet.hash).toHaveLength(64)
    await s.e.idle(input.turnId)
    expect(s.calls.map(c => c.stage)).toEqual(['claude','openai','synthesis'])
    expect(s.calls[0].packet).toEqual(s.calls[1].packet)
    expect(s.calls[0].packet).not.toBe(s.calls[1].packet)
    expect(JSON.stringify(s.calls[1].proposals)).not.toContain('claude: pregunta')
    expect(JSON.stringify(s.calls[2].proposals)).toContain('claude: pregunta')
    expect(s.store.turn(owner,s.c.id,input.turnId).delivery).toBe('integrated')
  })
  it('maintains five public turns including correction and retrieves real individual sources only when referenced', async () => {
    const s = setup(); let parentId: string | null = null
    for (const message of ['Estrategia inicial: 20 horas','Corrección: son 4 horas, no 20','¿Qué significa elegir libremente?','Profundiza en la perspectiva de Claude','Continúa con lo anterior']) {
      const input: Submission = { ...s.input(message), parentId }; s.e.submit(owner,input); await s.e.idle(input.turnId); parentId = input.turnId
    }
    const last = s.calls.at(-1)!.packet
    expect(last.messages).toHaveLength(9)
    expect(last.messages[2].content).toContain('Corrección: son 4')
    expect(last.references).toEqual([])
    expect(s.calls[9].packet.references).toHaveLength(2)
    expect(s.calls[9].packet.references[0].text).toBe('claude: ¿Qué significa elegir libremente?')
    expect(last.messages.filter(m=>m.role==='assistant').every(m=>m.content.startsWith('synthesis:'))).toBe(true)
  })
  it('one selected provider runs once without the other provider or synthesis',async()=>{
    const s=setup();const input={...s.input('Sólo tú'),target:'openai' as const};s.e.submit(owner,input);await s.e.idle(input.turnId)
    expect(s.calls.map(c=>c.stage)).toEqual(['openai']);expect(s.store.turn(owner,s.c.id,input.turnId).delivery).toBe('openai')
  })
  it('selected responses freeze exact text and identity, reject foreign or future references',async()=>{
    const s=setup();const first=s.input();s.e.submit(owner,first);await s.e.idle(first.turnId)
    const second={...s.input('Retoma esto'),parentId:first.turnId,references:[{turnId:first.turnId,source:'openai' as const}]}
    s.e.submit(owner,second);await s.e.idle(second.turnId)
    expect(s.calls.at(-1)!.packet.references).toEqual([{turnId:first.turnId,provider:'openai',text:'openai: pregunta',identity:IDENTITIES.openai}])
    expect(s.calls.at(-1)!.packet.messages[1].identity).toEqual(IDENTITIES.claude)
    expect(()=>s.e.submit(owner,{...s.input(),parentId:second.turnId,references:[{turnId:randomUUID(),source:'claude'}]})).toThrow('rama')
  })
  it('retrieval sees only the confirmed lineage and preserves traces across retry without exposing raw reads in snapshots',async()=>{
    let fail=true;const s=setup({infer:async(stage,p,proposals,signal,tools)=>{
      expect(tools?.history).toEqual([])
      tools!.cache['test']={text:'private source body',observedAt:1}
      tools!.update({id:stage,name:'consejo_read',input:{action:'read',path:'safe.md'},state:'complete',text:'private source body',startedAt:1})
      if(stage==='synthesis'&&fail)throw new Error('interrupted')
      return {text:'done',identity:IDENTITIES[stage==='openai'?'openai':'claude']}
    }})
    const first=s.input();s.e.submit(owner,first);await s.e.idle(first.turnId)
    expect(s.store.turn(owner,s.c.id,first.turnId).proposals.claude.tools?.[0].text).toBe('private source body')
    const json=JSON.stringify(handleConsejo({action:'snapshot',ownerId:owner,conversationId:s.c.id},s.e));expect(json).not.toContain('private source body');expect(json).toContain('safe.md')
    fail=false;s.e.retry(owner,s.c.id,first.turnId);await s.e.idle(first.turnId);expect(s.store.turn(owner,s.c.id,first.turnId).state).toBe('complete')
  })
  it('separates owners, conversations and immutable account provenance', async () => {
    const s = setup(); const input = s.input('private'); s.e.submit(owner,input); await s.e.idle(input.turnId)
    expect(() => s.store.turn(randomUUID(),s.c.id,input.turnId)).toThrow('no encontrado')
    const other = s.store.create(owner,randomUUID())
    expect(() => s.store.turn(owner,other.id,input.turnId)).toThrow()
    expect(() => s.e.submit(owner,{ ...s.input(), conversationId: other.id,branchId: other.rootBranchId,parentId: input.turnId })).toThrow()
    expect(s.store.list(randomUUID())).toEqual([])
    expect(s.store.turn(owner,s.c.id,input.turnId).packet.identities).toEqual(IDENTITIES)
  })
  it('deduplicates requests before and after completion and rejects ID content changes', async () => {
    const s=setup(); const input=s.input(); s.e.submit(owner,input); s.e.submit(owner,input); await s.e.idle(input.turnId); s.e.submit(owner,input)
    expect(s.calls).toHaveLength(3)
    expect(()=>s.e.submit(owner,{...input,message:'different'})).toThrow('otro contenido')
  })
  it('rejects concurrent follows until their parent final is delivered and rejects stale heads', async () => {
    const wait=deferred<void>(); const s=setup({ identities:async()=>{ await wait.promise; return IDENTITIES } }); const first=s.input()
    s.e.submit(owner,first)
    expect(()=>s.e.submit(owner,{...s.input(),parentId:first.turnId})).toThrow('Espera')
    wait.resolve(); await s.e.idle(first.turnId)
    expect(()=>s.e.submit(owner,s.input())).toThrow('historial cambió')
  })
  it('edits on a new branch and preserves old branch without rejected future premises', async () => {
    const s=setup(); const first=s.input('dato original');s.e.submit(owner,first);await s.e.idle(first.turnId)
    const second={...s.input('futuro rechazado'),parentId:first.turnId};s.e.submit(owner,second);await s.e.idle(second.turnId)
    const edit={...s.input('dato corregido'),editTurnId:first.turnId,branchId:randomUUID()};s.e.submit(owner,edit);await s.e.idle(edit.turnId)
    expect(s.store.turns(owner,s.c.id)).toHaveLength(3)
    expect(s.calls.at(-1)!.packet.messages).toHaveLength(1)
    expect(JSON.stringify(s.calls.at(-1)!.packet)).not.toContain('futuro rechazado')
    expect(pathTo(s.store.turns(owner,s.c.id),second.turnId)).toHaveLength(2)
  })
  it.each(['claude','openai','synthesis'] as Stage[])('recovers %s failure without repeating successful branches',async failed => {
    const s=setup(); const base=s.runtime.infer; let fail=true
    s.runtime.infer=async(...args)=>{ if(args[0]===failed && fail)throw new Error('rate limit');return base(...args) }
    const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const before=s.store.turn(owner,s.c.id,input.turnId)
    expect(before.state).toBe('failed');expect(before.proposals[failed].error).toContain('rate limit')
    const hash=before.packet.hash;fail=false;s.e.retry(owner,s.c.id,input.turnId);s.e.retry(owner,s.c.id,input.turnId);await s.e.idle(input.turnId)
    const after=s.store.turn(owner,s.c.id,input.turnId)
    expect(after.state).toBe('complete');expect(after.packet.hash).toBe(hash)
    expect(s.calls.filter(c=>c.stage==='claude')).toHaveLength(1)
    expect(s.calls.filter(c=>c.stage==='openai')).toHaveLength(1)
  })
  it('never labels a single proposal as a synthesis; explicit continuation enters canonical history',async()=>{
    const s=setup();const base=s.runtime.infer;s.runtime.infer=async(...a)=>{if(a[0]==='openai')throw new Error('missing');return base(...a)}
    const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const single=s.e.individual(owner,s.c.id,input.turnId,'claude');expect(single.delivery).toBe('claude');expect(single.final).toBe('claude: pregunta')
    expect(s.calls.some(c=>c.stage==='synthesis')).toBe(false)
  })
  it('fences late results after cancellation and signals both child calls',async()=>{
    const gate=deferred<void>();const signals:AbortSignal[]=[]
    const s=setup({infer:async(stage,p,props,signal,tools)=>{tools?.update({id:stage,name:'consejo_read',input:{action:'history'},state:'running',startedAt:1});signals.push(signal);await gate.promise;return {text:'late',identity:IDENTITIES[stage==='openai'?'openai':'claude']}}})
    const input=s.input();s.e.submit(owner,input);await new Promise(r=>setTimeout(r,5));s.e.cancel(owner,s.c.id,input.turnId)
    expect(signals).toHaveLength(2);expect(signals.every(s=>s.aborted)).toBe(true)
    gate.resolve();await s.e.idle(input.turnId)
    const t=s.store.turn(owner,s.c.id,input.turnId);expect(t.state).toBe('cancelled');expect(t.final).toBeUndefined();expect(t.proposals.claude.text).toBeUndefined();expect(t.proposals.claude.tools?.[0].state).toBe('cancelled')
  })
  it('restart marks unfinished work recoverable without executing, preserving completed proposal',async()=>{
    const filename=join(mkdtempSync(join(tmpdir(),'consejo-test-')),'test.db')
    const s=setup({},filename); const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const t=s.store.turn(owner,s.c.id,input.turnId);t.state='running';t.proposals.synthesis={state:'running'};delete t.final;s.store.save(t)
    const e2=new ConsejoEngine(s.store,s.runtime,()=> 'new context')
    expect(s.calls).toHaveLength(3)
    expect(s.store.turn(owner,s.c.id,input.turnId).state).toBe('failed')
    e2.retry(owner,s.c.id,input.turnId);await e2.idle(input.turnId)
    expect(s.calls.filter(c=>c.stage==='claude')).toHaveLength(1)
    expect(s.calls.at(-1)!.packet.instructions).toBe('Levy common instructions')
  })
  it('fails closed before inference on wrong identity, rather than spending another subscription',async()=>{
    const s=setup({identities:async()=>({...IDENTITIES,openai:{...IDENTITIES.openai,account:'otra.cuenta.yt@example.com'}})})
    const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    expect(s.calls).toEqual([]);expect(s.store.turn(owner,s.c.id,input.turnId).state).toBe('failed')
  })
  it('rejects changed served identity and empty outputs',async()=>{
    const s=setup({infer:async(stage)=>({text:'wrong',identity:{...IDENTITIES[stage==='openai'?'openai':'claude'],model:'smaller'}})})
    const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    expect(s.store.turn(owner,s.c.id,input.turnId).final).toBeUndefined()
  })
  it('cannot truncate a shared context silently',()=>{
    expect(()=>packet('a'.repeat(1_200_001),[],randomUUID(),'hello',[],IDENTITIES)).toThrow('compactación compartida')
  })
  it('deadline releases a stuck runtime and fences late events',async()=>{
    const s=setup({identities:()=>new Promise(()=>{})})
    const e=new ConsejoEngine(s.store,s.runtime,()=> 'common',15)
    const input=s.input();e.submit(owner,input);await e.idle(input.turnId)
    expect(s.store.turn(owner,s.c.id,input.turnId).state).toBe('failed')
    expect(s.store.turn(owner,s.c.id,input.turnId).proposals.claude.error).toContain('tiempo')
  })
  it('a repeated retry operation does not execute again even after its failure',async()=>{
    const infer=vi.fn(async()=>{throw new Error('rate limit')})
    const s=setup({infer});const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const retryId=randomUUID();s.e.retry(owner,s.c.id,input.turnId,retryId);await s.e.idle(input.turnId)
    const count=infer.mock.calls.length;s.e.retry(owner,s.c.id,input.turnId,retryId);await s.e.idle(input.turnId)
    expect(infer).toHaveBeenCalledTimes(count)
  })
  it('rejects stale writers rather than overwriting a cancelled revision',async()=>{
    const s=setup();const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const old=s.store.turn(owner,s.c.id,input.turnId);const newer=s.store.turn(owner,s.c.id,input.turnId)
    newer.state='cancelled';s.store.save(newer)
    expect(()=>s.store.save(old)).toThrow('cambió durante')
    expect(s.store.turn(owner,s.c.id,input.turnId).state).toBe('cancelled')
  })
  it('counts cumulative native images in the shared budget',()=>{
    expect(()=>packet('common',[],randomUUID(),'hello',Array.from({length:13},()=>({type:'image' as const,name:'image',content:'data:image/png;base64,AA=='})),IDENTITIES)).toThrow('imágenes acumuladas')
  })
  it('does not expose instructions or private packet in client recovery',async()=>{
    const s=setup();const input=s.input();s.e.submit(owner,input);await s.e.idle(input.turnId)
    const json=JSON.stringify(handleConsejo({action:'snapshot',ownerId:owner,conversationId:s.c.id},s.e))
    expect(json).not.toContain('Levy common instructions');expect(json).not.toContain('requestHash');expect(json).toContain('packetHash')
  })
  it.each([{action:'list',ownerId:'x'},{action:'create',ownerId:owner,conversationId:'../../path'}])('rejects invalid scope %j',body=>{
    const s=setup();expect(()=>handleConsejo(body,s.e)).toThrow()
  })
  it('refuses provider-controlled account and URL attachments',()=>{
    const s=setup();const body={action:'submit',ownerId:owner,...s.input(),attachments:[{type:'image',name:'test',content:'https://private.example/write'}]}
    expect(()=>handleConsejo(body,s.e)).toThrow('Imagen inválida')
  })
  it('does not call the runtime if persistence fails',async()=>{
    const s=setup();vi.spyOn(s.store,'insert').mockImplementation(()=>{throw new Error('disk full')})
    expect(()=>s.e.submit(owner,s.input())).toThrow('disk full');await Promise.resolve();expect(s.calls).toHaveLength(0)
  })
})
describe('deliberation runtime boundary',()=>{
  it('removes tools, hooks, MCP, plugins, inherited paid credentials and filesystem instructions in Claude',async()=>{
    const o=claudeOptions('/isolated');expect(o.tools).toEqual([]);expect(o.settingSources).toEqual([]);expect(o.hooks).toEqual({});expect(o.mcpServers).toEqual({});expect(o.strictMcpConfig).toBe(true);expect(o.persistSession).toBe(false)
    expect(o.permissionMode).not.toBe('bypassPermissions')
    for(const tool of ['Bash','Write','Skill','Agent','mcp__email__send'])expect((await o.canUseTool!(tool,{}, { signal:new AbortController().signal,toolUseID:'test' } as never))?.behavior).toBe('deny')
    expect(deliberationEnv()).not.toHaveProperty('ANTHROPIC_API_KEY');expect(deliberationEnv()).not.toHaveProperty('OPENAI_API_KEY');expect(deliberationEnv()).not.toHaveProperty('OPENCLAW_GATEWAY_TOKEN')
  })
  it.each(['shell_tool','unified_exec','apps','plugins','hooks','codex_hooks','multi_agent','goals','computer_use','js_repl','image_generation','memory_tool'])('disables OpenAI %s runtime capability',feature=>expect(CODEX_LOCKDOWN[`features.${feature}`]).toBe(false))
  it('requires exact subscription identities',()=>{
    expect(()=>assertOpenAIAccount({type:'chatgpt',email:'otra.cuenta.yt@example.com'})).toThrow(/Falta autenticar/)
    expect(()=>assertOpenAIAccount({type:'apiKey',email:IDENTITIES.openai.account})).toThrow()
    expect(()=>assertClaudeAccount({email:IDENTITIES.claude.account,apiProvider:'firstParty',subscriptionType:'max',apiKeySource:'env'})).toThrow()
  })
})
