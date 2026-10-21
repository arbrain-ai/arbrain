import { instalacionOriginal } from '../dueno.js'
import {liveStore,liveToolbox} from './runtime.js'
import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
if(process.env.ARBRAIN_LIVE_CANARY!=='1')throw Error('Canary only')
const scope={owner:(process.env.ARBRAIN_LIVE_OWNER ?? instalacionOriginal().perfil_id ?? ''),account:'yt',conversationId:randomUUID()},turn=randomUUID(),ac=new AbortController();liveStore().begin(scope,turn)
try{
 const toolbox=liveToolbox(scope,turn,ac.signal,()=>{})
 const results=await Promise.all(['knowledge','operations','content','radar','briefings'].map(async source=>{
  const t=performance.now(),response=await toolbox.call({action:'query',source,query:source==='knowledge'?{text:'Arbrain voz'}:{limit:3}})
  if(response.error)return {source,error:response.text}
  const receipt=JSON.parse(response.text)
  return {source,queriedAt:receipt.queriedAt,hash:receipt.hash,coverage:receipt.coverage,elapsedMs:performance.now()-t,keys:typeof receipt.data==='object'?Object.keys(receipt.data??{}):[],sampleType:typeof receipt.data}
 }))
 writeFileSync('docs/builds/arbrain-live-workspace-2026-09-14/evidence/sources-final-read.json',JSON.stringify(results,null,2)+'\n');console.log(results)
}finally{liveStore().end(scope,turn);liveStore().close()}
