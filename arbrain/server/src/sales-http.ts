import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { PROJECT_ROOT } from './config.js'
const pending=new Map<string,Promise<{status:number;body:unknown}>>()
/** The request handler authenticates the daemon token before reaching this read-only service. */
export function handleSales(params:URLSearchParams){
 const days=params.get('days')??'30',video=params.get('video'),scope=params.get('scope')??'all',offset=params.get('offset')??'0'
 if(!['0','7','30','90'].includes(days)||!['all','unattributed'].includes(scope)||!/^\d{1,6}$/.test(offset)||(video&&!/^[\w-]{11}$/.test(video)))return Promise.resolve({status:400,body:{error:'Consulta de ventas inválida.'}})
 const args=['--days',days,'--scope',scope,'--offset',offset,...(video?['--video',video]:[]),...(params.get('refresh')==='1'?['--refresh']:[]),...(params.get('snapshot')==='1'?['--snapshot']:[])]
 const key=args.join('|'),existing=pending.get(key);if(existing)return existing
 const work=new Promise<{status:number;body:unknown}>(resolve=>{
  execFile(process.env.PLANNING_PYTHON??'python3',[join(PROJECT_ROOT,'arbrain/server/scripts/analytics/sales_reconcile.py'),...args],{timeout:600_000,maxBuffer:8_000_000},(error,stdout)=>{
   try{const body=JSON.parse(stdout);resolve({status:error||body.error?503:200,body})}catch{resolve({status:503,body:{error:'No se pudo leer la reconciliación de ventas.'}})}
  })
 }).finally(()=>pending.delete(key))
 pending.set(key,work);return work
}
