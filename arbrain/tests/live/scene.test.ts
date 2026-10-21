import test from 'node:test'
import assert from 'node:assert/strict'
import { applyScenePatch, emptyScene, sceneContext, type Artifact } from '../../src/features/live/scene/model.ts'
const receipts = new Set(['query-1'])
const piece = (id: string, x=0, width=100): Artifact => ({ id,title:id,frame:{x,y:0,width,height:100},html:'<svg><text>Una forma nueva</text></svg>',sources:[{receiptId:'query-1',label:'Fuente verificada'}],evidence:'observed',pinned:false })
test('arbitrary layouts and new markup need no registered widget type', () => {
  let scene=emptyScene()
  scene=applyScenePatch(scene,{id:'op1',baseRevision:0,operations:[{type:'put',artifact:piece('uno',0,37)},{type:'put',artifact:piece('dos',37,63)}]},receipts)
  assert.equal(scene.artifacts[0].frame.width,37)
  assert.equal(scene.artifacts[1].frame.width,63)
  assert.equal(sceneContext(scene).objects[1].id,'dos')
})
test('patch rollback is atomic, pinned objects cannot disappear incidentally', () => {
  const a=piece('uno');a.pinned=true
  const scene=applyScenePatch(emptyScene(),{id:'op1',baseRevision:0,operations:[{type:'put',artifact:a}]},receipts)
  const before=JSON.stringify(scene)
  assert.throws(()=>applyScenePatch(scene,{id:'op2',baseRevision:1,operations:[{type:'title',title:'changed'},{type:'remove',id:'uno'}]},receipts),/Desfija/)
  assert.equal(JSON.stringify(scene),before)
  const next=applyScenePatch(scene,{id:'op3',baseRevision:1,operations:[{type:'pin',id:'uno',pinned:false},{type:'remove',id:'uno'}]},receipts)
  assert.equal(next.artifacts.length,0)
})
test('stale revisions and invented provenance cannot update a scene', () => {
  assert.throws(()=>applyScenePatch(emptyScene(),{id:'op',baseRevision:4,operations:[{type:'put',artifact:piece('one')}]},receipts),/cambió/)
  assert.throws(()=>applyScenePatch(emptyScene(),{id:'op',baseRevision:0,operations:[{type:'put',artifact:piece('one')}]},new Set()),/consulta no verificada/)
})
test('focus and selection remain valid through removals and reordering', () => {
  const scene=applyScenePatch(emptyScene(),{id:'op',baseRevision:0,operations:[{type:'put',artifact:piece('one')},{type:'focus',id:'one'},{type:'select',ids:['one']},{type:'remove',id:'one'}]},receipts)
  assert.equal(scene.focused,null);assert.deepEqual(scene.selected,[])
})
test('invalid geometry cannot escape viewport and observed data cannot lack sources', () => {
  const a=piece('one',60,60)
  assert.throws(()=>applyScenePatch(emptyScene(),{id:'op',baseRevision:0,operations:[{type:'put',artifact:a}]},receipts),/caber/)
  const b=piece('two');b.sources=[]
  assert.throws(()=>applyScenePatch(emptyScene(),{id:'op',baseRevision:0,operations:[{type:'put',artifact:b}]},receipts),/consulta verificable/)
})
test('reserved prototype identifiers cannot enter scene maps',()=>{
 assert.throws(()=>applyScenePatch(emptyScene(),{id:'op',baseRevision:0,operations:[{type:'put',artifact:piece('__proto__')}]},receipts),/Identificador/)
})
