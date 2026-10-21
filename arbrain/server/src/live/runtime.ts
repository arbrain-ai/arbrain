import { relevantKnowledge } from '../consejo/knowledge.js'
import { PROJECT_ROOT } from '../config.js'
import { readEnvFile } from '../env.js'
import { mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { STORE_DIR } from '../config.js'
import { handleSales } from '../sales-http.js'
import { LiveStore, type LiveScope } from './store.js'
import { LiveToolbox, type LiveReader } from './tools.js'
let store:LiveStore|undefined
export function liveStore(){
 if(!store){mkdirSync(STORE_DIR,{recursive:true});const file=join(STORE_DIR,'live-workspaces.db');store=new LiveStore(file);for(const path of [file,file+'-wal',file+'-shm']){try{chmodSync(path,0o600)}catch{}}}
 return store
}
export const liveReaders:Record<string,LiveReader>={
 sales:async(query,signal)=>{
  signal.throwIfAborted()
  const params=new URLSearchParams()
  const allowed=['days','video','scope','offset','refresh','snapshot']
  for(const [k,v] of Object.entries(query)){if(!allowed.includes(k)||!['string','number','boolean'].includes(typeof v))throw new Error('Parámetro de ventas inválido. Usa days=0|7|30|90, video, scope=all|unattributed, offset, snapshot=1 y refresh=1.');params.set(k,String(v))}
  const resident=process.env.ARBRAIN_LIVE_CANARY==='1'?process.env.LIVE_SALES_ORIGIN:undefined
  const result=resident ? await (async()=>{const r=await fetch(`${resident}?${params}`,{signal});return {status:r.status,body:await r.json()}})() : await handleSales(params)
  signal.throwIfAborted()
  if(result.status!==200)throw new Error('La fuente de ventas no respondió con datos válidos. No se creó un recibo.')
  if(params.get('snapshot')==='1'&&(result.body as {readMode?:string}).readMode!=='snapshot')throw new Error('Esta instancia de ventas aún no admite snapshot. Consulta sin snapshot para obtener una lectura verificada.')
  return {data:result.body,coverage:'Órdenes reconciliadas de Polar; conservar períodos, divisas y cobertura de atribución del resultado.'}
 },
}
export function liveToolbox(scope:LiveScope,turn:string,signal:AbortSignal,emit:(event:Record<string,unknown>)=>void){
 const readers={...liveReaders}
 if(process.env.ARBRAIN_LIVE_CANARY==='1')readers.qa_wait=async(_query,signal)=>{
  await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(new Error('QA read cancelled'))};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve()},12000);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop()})
  return {data:{kind:'QA only',completed:true},coverage:'Synthetic delay for cancellation testing; not business data.'}
 }
 readers.knowledge=async(query,signal)=>{signal.throwIfAborted();if(typeof query.text!=='string'||!query.text.trim())throw new Error('Usa text con el tema que buscas.');return {data:relevantKnowledge(PROJECT_ROOT,query.text),coverage:'Documentos históricos completos recuperados del índice; no son métricas actuales.'}}
 for(const source of ['planning','objectives','content','radar','briefings','operations'])readers[source]=async(query,signal)=>{
  const origin=process.env.LIVE_DATA_ORIGIN || 'http://127.0.0.1:3300'
  const response=await fetch(`${origin}/api/live/data`,{method:'POST',headers:{Authorization:`Bearer ${readEnvFile(['OPENCLAW_GATEWAY_TOKEN']).OPENCLAW_GATEWAY_TOKEN??''}`,'Content-Type':'application/json'},body:JSON.stringify({owner:scope.owner,source,query}),signal})
  const result=await response.json() as {data?:unknown;coverage?:string;error?:string}
  if(!response.ok||!result.coverage)throw new Error(result.error||'La fuente no respondió con datos verificables.')
  return {data:result.data,coverage:result.coverage}
 }
 return new LiveToolbox(liveStore(),scope,turn,signal,readers,emit)
}
