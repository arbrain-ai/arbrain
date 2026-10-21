import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { applyScenePatch, emptyScene, type Scene, type ScenePatch } from './scene.js'
export type LiveScope={owner:string;account:string;conversationId:string}
export type QueryReceipt={id:string;source:string;query:Record<string,unknown>;queriedAt:string;data:unknown;hash:string;coverage:string}
type Workspace={scene:Scene;past:Scene[];future:Scene[];receipts:QueryReceipt[];activeTurn:string|null;renders:Record<string,unknown>}
const key=(scope:LiveScope)=>JSON.stringify([scope.owner,scope.account,scope.conversationId])
const clone=<T>(value:T):T=>structuredClone(value)
export class LiveStore {
 private activeTurns=new Map<string,string>()
 readonly db:Database.Database
 constructor(filename:string){
  this.db=new Database(filename);this.db.pragma('journal_mode=WAL')
  this.db.exec(`CREATE TABLE IF NOT EXISTS live_workspaces(scope TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS live_operations(scope TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(scope,id));`)
 }
 read(scope:LiveScope):Workspace{
  const row=this.db.prepare('SELECT data FROM live_workspaces WHERE scope=?').get(key(scope)) as {data:string}|undefined
  return row?JSON.parse(row.data):{scene:emptyScene(),past:[],future:[],receipts:[],activeTurn:null,renders:{}}
 }
 private save(scope:LiveScope,data:Workspace){this.db.prepare('INSERT INTO live_workspaces VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET data=excluded.data').run(key(scope),JSON.stringify(data))}
 begin(scope:LiveScope,turn:string){this.db.transaction(()=>{const id=key(scope),active=this.activeTurns.get(id);if(active&&active!==turn)throw new Error('Otro turno sigue activo en este espacio. Espera su finalización.');const w=this.read(scope);w.activeTurn=turn;this.save(scope,w);this.activeTurns.set(id,turn)})()}
 end(scope:LiveScope,turn:string){this.db.transaction(()=>{const w=this.read(scope);if(w.activeTurn===turn){w.activeTurn=null;this.save(scope,w);this.activeTurns.delete(key(scope))}})()}
 private active(workspace:Workspace,turn:string){if(!turn||workspace.activeTurn!==turn)throw new Error('El turno ya no está activo. No se cambió la escena.')}
 receipt(scope:LiveScope,turn:string,input:Omit<QueryReceipt,'id'|'queriedAt'|'hash'>):QueryReceipt{
  return this.db.transaction(()=>{
   const w=this.read(scope);this.active(w,turn)
   const raw=JSON.stringify(input.data);if(raw.length>2_000_000)throw new Error('Consulta demasiado grande: pagina los resultados.')
   const receipt={...input,id:randomUUID(),queriedAt:new Date().toISOString(),hash:createHash('sha256').update(raw).digest('hex')}
   w.receipts.push(receipt)
   // Preserve every receipt referenced by a visible or recoverable artifact.
   const referenced=new Set([w.scene,...w.past,...w.future].flatMap(s=>s.artifacts.flatMap(a=>a.sources.map(r=>r.receiptId))))
   w.receipts=w.receipts.filter((r,i)=>i>=w.receipts.length-40||referenced.has(r.id))
   this.save(scope,w);return receipt
  })()
 }
 apply(scope:LiveScope,turn:string,patch:ScenePatch):Scene{
  return this.db.transaction(()=>{
   const w=this.read(scope);this.active(w,turn)
   const fingerprint=createHash('sha256').update(JSON.stringify(patch)).digest('hex')
   const previous=this.db.prepare('SELECT fingerprint,result FROM live_operations WHERE scope=? AND id=?').get(key(scope),patch.id) as {fingerprint:string;result:string}|undefined
   if(previous){if(previous.fingerprint!==fingerprint)throw new Error('Identificador de operación reutilizado con otro contenido.');return clone(w.scene)}
   const next=applyScenePatch(w.scene,patch,new Set(w.receipts.map(r=>r.id)))
   w.past=[...w.past,w.scene].slice(-30);w.future=[];w.scene=next;w.renders={}
   this.save(scope,w)
   this.db.prepare('INSERT INTO live_operations VALUES (?,?,?,?)').run(key(scope),patch.id,fingerprint,JSON.stringify(next))
   return next
  })()
 }
 history(scope:LiveScope,turn:string,direction:'undo'|'redo',expectedRevision:number):Scene{
  return this.db.transaction(()=>{
   const w=this.read(scope);this.active(w,turn)
   if(w.scene.revision!==expectedRevision)throw new Error('La escena cambió. Vuelve a leerla.')
   const from=direction==='undo'?w.past:w.future,to=direction==='undo'?w.future:w.past
   const previous=from.pop();if(!previous)throw new Error('No hay otra versión disponible.')
   to.push(clone(w.scene));w.scene={...previous,revision:w.scene.revision+1};w.renders={};this.save(scope,w);return w.scene
  })()
 }
 select(scope:LiveScope,ids:string[]){this.db.transaction(()=>{
  const w=this.read(scope);if(ids.length>64||ids.some(id=>!w.scene.artifacts.some(a=>a.id===id)))throw new Error('Selección inexistente.')
  w.scene.selected=[...new Set(ids)];this.save(scope,w)
 })()}
 rendered(scope:LiveScope,revision:number,id:string,receipt:unknown){this.db.transaction(()=>{
  const w=this.read(scope);if(w.scene.revision!==revision||!w.scene.artifacts.some(a=>a.id===id))return
  if(JSON.stringify(receipt).length>50000)throw new Error('Recibo visual demasiado grande.')
  const state=(receipt as {detail?:{state?:unknown}})?.detail?.state
  if(state!==undefined){if(JSON.stringify(state).length>16000)throw new Error('Estado interactivo demasiado grande.');w.scene.artifacts.find(a=>a.id===id)!.state=state}
  w.renders={...w.renders,[id]:receipt};this.save(scope,w)
 })()}
 close(){this.db.close()}
}
