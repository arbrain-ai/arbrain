import {describe,it,expect} from 'vitest'
import {LiveStore,type LiveScope} from './store.js'
import type {Artifact} from './scene.js'
const scope:LiveScope={owner:'owner',account:'bro',conversationId:'conversation'}
function fixture(){const store=new LiveStore(':memory:');store.begin(scope,'turn');const receipt=store.receipt(scope,'turn',{source:'qa',query:{period:'7d'},coverage:'fixture',data:[1,2,3]});const a:Artifact={id:'a',title:'A',html:'<p>values</p>',frame:{x:0,y:0,width:100,height:100},pinned:false,evidence:'observed',sources:[{receiptId:receipt.id,label:'QA'}]};return {store,a}}
describe('live workspace journal',()=>{
 it('persists scene separately by owner/account/conversation',()=>{const {store,a}=fixture();try{store.apply(scope,'turn',{id:'op',baseRevision:0,operations:[{type:'put',artifact:a}]});expect(store.read(scope).scene.artifacts).toHaveLength(1);for(const other of [{...scope,owner:'other'},{...scope,account:'yt'},{...scope,conversationId:'other'}])expect(store.read(other).scene.artifacts).toHaveLength(0)}finally{store.close()}})
 it('rejects canceled and superseded work',()=>{const {store,a}=fixture();try{expect(()=>store.begin(scope,'new')).toThrow(/activo/);store.end(scope,'turn');store.begin(scope,'new');expect(()=>store.apply(scope,'turn',{id:'op',baseRevision:0,operations:[{type:'put',artifact:a}]})).toThrow(/activo/);store.end(scope,'turn');expect(store.read(scope).activeTurn).toBe('new')}finally{store.close()}})
 it('duplicate delivery is idempotent; different content with same id fails',()=>{const {store,a}=fixture();try{const patch={id:'op',baseRevision:0,operations:[{type:'put' as const,artifact:a}]};store.apply(scope,'turn',patch);store.apply(scope,'turn',patch);expect(store.read(scope).scene.revision).toBe(1);expect(()=>store.apply(scope,'turn',{...patch,operations:[{type:'title',title:'wrong'}]})).toThrow(/reutilizado/)}finally{store.close()}})
 it('undo/redo preserve identities with monotonically increasing revision',()=>{const {store,a}=fixture();try{store.apply(scope,'turn',{id:'op',baseRevision:0,operations:[{type:'put',artifact:a}]});expect(store.history(scope,'turn','undo',1).artifacts).toHaveLength(0);const back=store.history(scope,'turn','redo',2);expect(back.revision).toBe(3);expect(back.artifacts[0].id).toBe('a')}finally{store.close()}})
})
it('replayed operation never returns an obsolete scene after newer edits',()=>{
 const {store,a}=fixture()
 try{
 const patch={id:'op',baseRevision:0,operations:[{type:'put' as const,artifact:a}]}
 store.apply(scope,'turn',patch)
 store.apply(scope,'turn',{id:'next',baseRevision:1,operations:[{type:'title',title:'Current'}]})
 expect(store.apply(scope,'turn',patch).title).toBe('Current')
 expect(store.read(scope).scene.revision).toBe(2)
 }finally{store.close()}
})
it('interactive state survives layout edits, replacement and history',()=>{
 const {store,a}=fixture()
 try{
 store.apply(scope,'turn',{id:'put',baseRevision:0,operations:[{type:'put',artifact:a}]})
 store.rendered(scope,1,'a',{type:'rendered',detail:{state:{filter:'annual'}}})
 store.apply(scope,'turn',{id:'move',baseRevision:1,operations:[{type:'move',id:'a',frame:{x:0,y:0,width:50,height:100}}]})
 expect(store.read(scope).scene.artifacts[0].state).toEqual({filter:'annual'})
 store.apply(scope,'turn',{id:'update',baseRevision:2,operations:[{type:'put',artifact:{...a,title:'Updated'}}]})
 expect(store.read(scope).scene.artifacts[0].state).toEqual({filter:'annual'})
 expect(store.history(scope,'turn','undo',3).artifacts[0].state).toEqual({filter:'annual'})
 store.close()
 }catch(error){store.close();throw error}
})
