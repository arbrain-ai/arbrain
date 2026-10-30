import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ConsejoEngine, IDENTITIES } from './engine.js'
import { ConsejoStore } from './store.js'
import { parseSettings, selectedIdentities, stageSelection, validateCatalog } from './settings.js'
import { handleConsejo } from './http.js'
import type { ModelCatalog, ModelSettings, Packet, Stage } from './types.js'

const settings:ModelSettings={claude:{model:'claude-sonnet-5',effort:'high'},openai:{model:'gpt-5.6-sol',effort:'low'}}
const catalog:ModelCatalog={claude:{account:IDENTITIES.claude.account,models:[{model:settings.claude.model,label:'Sonnet',efforts:['high']}]},openai:{account:IDENTITIES.openai.account,models:[{model:settings.openai.model,label:'Sol',efforts:['low']}]}}

it('derives accounts only from the server and validates supported model/effort pairs',()=>{
  const parsed=parseSettings({...settings,claude:{...settings.claude,account:'intruder',billing:'api'}})
  expect(parsed).toEqual(settings)
  expect(selectedIdentities(parsed).claude.account).toBe(IDENTITIES.claude.account)
  expect(()=>validateCatalog(catalog,parsed)).not.toThrow()
  expect(()=>validateCatalog(catalog,{...settings,openai:{...settings.openai,effort:'ultra'}})).toThrow('no admite')
  expect(()=>validateCatalog(catalog,{...settings,claude:{model:'unknown'}})).toThrow('no está disponible')
  expect(()=>validateCatalog({...catalog,openai:{...catalog.openai,account:'otra.cuenta.yt@example.com'}},settings)).toThrow('cuenta')
  expect(()=>parseSettings({claude:{model:'x'}})).toThrow('ambos')
  expect(()=>parseSettings({...settings,claude:{model:'$(touch nope)'}})).toThrow('inválido')
})

it.each([settings,{...settings,synthesis:{provider:'openai',...settings.openai}} as ModelSettings])('freezes choices per turn, preserves them across failed synthesis/retry, rejects changed duplicate and exposes only safe settings',async(settings)=>{
  const store=new ConsejoStore(':memory:'); const owner=randomUUID(); const c=store.create(owner,randomUUID())
  const calls:Array<{stage:Stage;packet:Packet}>=[]; let fail=true
  const engine=new ConsejoEngine(store,{
    identities:async(_signal,choices)=>selectedIdentities(choices),
    infer:async(stage,p)=>{calls.push({stage,packet:structuredClone(p)});if(stage==='synthesis'&&fail)throw new Error('offline');return {text:'respuesta',identity:stageSelection(p,stage).identity}},
  },()=> 'secret instructions')
  try {
    const input={conversationId:c.id,turnId:randomUUID(),branchId:c.rootBranchId,parentId:null,message:'Opinión',settings:structuredClone(settings)}
    engine.submit(owner,input); input.settings.claude.effort='low'
    await engine.idle(input.turnId)
    expect(store.turn(owner,c.id,input.turnId).packet.settings).toEqual(settings)
    expect(()=>engine.submit(owner,input)).toThrow('otro contenido')
    fail=false;engine.retry(owner,c.id,input.turnId);await engine.idle(input.turnId)
    expect(calls.map(x=>x.stage)).toEqual(['claude','openai','synthesis','synthesis'])
    for (const call of calls) expect(call.packet.settings).toEqual(settings)
    expect(calls[0].packet.hash).toBe(calls.at(-1)!.packet.hash)
    expect(store.turn(owner,c.id,input.turnId).state).toBe('complete')
    expect(store.turn(owner,c.id,input.turnId).proposals.synthesis.identity).toEqual(stageSelection(calls[0].packet,'synthesis').identity)
    const snapshot=handleConsejo({action:'snapshot',ownerId:owner,conversationId:c.id},engine)
    expect(JSON.stringify(snapshot)).toContain('claude-sonnet-5')
    expect(JSON.stringify(snapshot)).not.toContain('secret instructions')
  } finally {store.close()}
})

it('validates the third model and its own effort against the chosen real account',()=>{
  const custom:ModelSettings={...settings,synthesis:{provider:'openai',model:settings.openai.model,effort:'low'}}
  expect(parseSettings({...custom,synthesis:{...custom.synthesis,account:'wrong',billing:'api'}})).toEqual(custom)
  expect(()=>validateCatalog(catalog,custom)).not.toThrow()
  expect(()=>validateCatalog(catalog,{...custom,synthesis:{...custom.synthesis!,effort:'high'}})).toThrow('para Levy')
  expect(()=>validateCatalog(catalog,{...custom,synthesis:{...custom.synthesis!,model:settings.claude.model}})).toThrow('para Levy')
  expect(()=>parseSettings({...settings,synthesis:{provider:'other',model:'gpt-6-astra'}})).toThrow('Proveedor')
  expect(()=>parseSettings({...settings,synthesis:{provider:'openai',model:'bad/model'}})).toThrow('inválido')
})

it('selects a separate synthesis identity and effort without changing independent proposal choices',()=>{
  const p={identities:IDENTITIES,settings:{...settings,synthesis:{provider:'openai' as const,model:'gpt-6-astra',effort:'high'}}}
  expect(stageSelection(p,'synthesis')).toEqual({identity:IDENTITIES.openai,effort:'high'})
  expect(stageSelection(p,'openai').identity.model).toBe(settings.openai.model)
  expect(stageSelection(p,'claude').identity.model).toBe(settings.claude.model)
  expect(stageSelection({identities:IDENTITIES},'synthesis').identity).toEqual(IDENTITIES.claude)
  expect(stageSelection({identities:IDENTITIES,settings},'synthesis').effort).toBe('high')
})

it('refuses a synthesis from the wrong provider even when the returned text is valid',async()=>{
  const store=new ConsejoStore(':memory:');const owner=randomUUID();const c=store.create(owner,randomUUID())
  const custom:ModelSettings={...settings,synthesis:{provider:'openai',...settings.openai}}
  const e=new ConsejoEngine(store,{identities:async()=>selectedIdentities(custom),infer:async(stage,p)=>({text:'respuesta',identity:stage==='synthesis'?stageSelection(p,'claude').identity:stageSelection(p,stage).identity})},()=> 'context')
  const input={conversationId:c.id,turnId:randomUUID(),branchId:c.rootBranchId,parentId:null,message:'Reflexión',settings:custom}
  try {e.submit(owner,input);await e.idle(input.turnId);const t=store.turn(owner,c.id,input.turnId);expect(t.proposals.synthesis.state).toBe('failed');expect(t.proposals.synthesis.error).toContain('cuenta o el modelo');expect(t.final).toBeUndefined()}
  finally {store.close()}
})

it('stops before either inference when selected identity is substituted',async()=>{
  const store=new ConsejoStore(':memory:');const owner=randomUUID();const c=store.create(owner,randomUUID());let calls=0
  const e=new ConsejoEngine(store,{identities:async()=>IDENTITIES,infer:async()=>{calls++;throw new Error('must not run')}},()=> 'context')
  const input={conversationId:c.id,turnId:randomUUID(),branchId:c.rootBranchId,parentId:null,message:'Reflexión',settings}
  try {e.submit(owner,input);await e.idle(input.turnId);expect(calls).toBe(0);expect(store.turn(owner,c.id,input.turnId).state).toBe('failed')}
  finally {store.close()}
})
