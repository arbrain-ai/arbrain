import {describe,it,expect,vi} from 'vitest'
const source='../../../src/features/chat/lib/composer-drafts.ts'
const sizing='../../../src/features/chat/lib/composer-size.ts'
const {ComposerDrafts,composerDraftKey}=await import(source)
const {composerInputCap}=await import(sizing)
// Persistencia real del navegador (df5b6ef8: texto e imágenes en claves separadas) sobre un disco en memoria.
const {crearPersistenciaBorradores}=await import('../../../src/features/chat/lib/draft-persistence.ts')
const empty={text:'',files:[],references:[],edit:null}
function harness() {
  const disk=new Map<string,unknown>()
  const storage=crearPersistenciaBorradores({get:async(key:string)=>disk.get(key),set:async(key:string,value:unknown)=>{disk.set(key,structuredClone(value))},del:async(key:string)=>{disk.delete(key)}})
  return {disk,storage,store:new ComposerDrafts(storage)}
}
describe('Unsent composer drafts',()=>{
  it('isolates owner, provider and conversation, restoring text, attachments and references',async()=>{
    const {store,storage}=harness()
    const a=composerDraftKey('daniel','consejo','a'),b=composerDraftKey('daniel','consejo','b')
    await store.load(a,empty)
    const draft={text:'Mi corrección intacta',files:[{name:'texto.txt',content:'Árbol\nfinal'}],references:[{turnId:'1',source:'claude'}],edit:{id:'1',parentId:null}}
    store.update(a,empty,()=>draft); await store.idle(a)
    await store.load(b,empty); expect(store.entry(b,empty).value).toEqual(empty)
    expect(store.entry(a,empty).value).toEqual(draft)
    const restarted=new ComposerDrafts(storage);await restarted.load(a,empty)
    expect(restarted.entry(a,empty).value).toEqual(draft)
    for(const key of [composerDraftKey('other','consejo','a'),composerDraftKey('daniel','codex','a')]){await restarted.load(key,empty);expect(restarted.entry(key,empty).value).toEqual(empty)}
  })
  it('preserves binary attachments through storage, never their expired preview URL',async()=>{
    const {store,storage}=harness(),image=new Blob(['pixel'],{type:'image/png'})
    store.update('image',empty,()=>({...empty,files:[image]}));await store.idle('image')
    const restarted=new ComposerDrafts(storage);await restarted.load('image',empty)
    expect(await restarted.entry('image',empty).value.files[0].text()).toBe('pixel')
  })
  it('a late load cannot replace text already typed',async()=>{
    let resolve!:(value:unknown)=>void
    const store=new ComposerDrafts({get:()=>new Promise(r=>{resolve=r}),set:async()=>{}})
    const loading=store.load('a',empty)
    store.update('a',empty,()=>({...empty,text:'nuevo'}));resolve({...empty,text:'viejo'});await loading
    expect(store.entry('a',empty).value.text).toBe('nuevo')
  })
  it('acknowledgement clears only the exact sent draft; preserves later typing and another conversation',async()=>{
    const {store}=harness(),sent={...empty,text:'enviado'}
    store.update('a',empty,()=>sent);store.update('b',empty,()=>({...empty,text:'otro'}))
    store.update('a',empty,()=>({...empty,text:'siguiente'}));store.clearIfUnchanged('a',empty,sent)
    expect(store.entry('a',empty).value.text).toBe('siguiente')
    expect(store.entry('b',empty).value.text).toBe('otro')
    const current=store.entry('a',empty).value;store.clearIfUnchanged('a',empty,current);await store.idle('a')
    expect(store.entry('a',empty).value).toEqual(empty)
  })
  it('reports persistence failures without losing the in-memory draft',async()=>{
    const store=new ComposerDrafts({get:async()=>undefined,set:vi.fn().mockRejectedValue(new Error('quota'))})
    store.update('a',empty,()=>({...empty,text:'conservar'}));await store.idle('a')
    expect(store.entry('a',empty).value.text).toBe('conservar')
    expect(store.entry('a',empty).error).toContain('no pudo guardarse')
  })
  it('grows to ~8 lines, then scrolls; with the keyboard open it never takes over the viewport',()=>{
    // 8 renglones × 24 px + 8 px de padding = 200 px (composer de botón único, 1 oct).
    expect(composerInputCap(1000,false)).toBe(200)
    expect(composerInputCap(2000,false)).toBe(200)
    expect(composerInputCap(350,true)).toBe(126)
    expect(composerInputCap(180,false)).toBe(112)
    expect(composerInputCap(1000,false,24,15)).toBe(207)
  })
})
