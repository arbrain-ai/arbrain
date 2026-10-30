import {hash} from './context.js'
import {consultSchema} from './tools.js'
import type {InferenceTools,Identity,Provider,ToolTrace} from './types.js'
export function consultationHandler(scope:InferenceTools,signal:AbortSignal,infer:(provider:Provider,question:string)=>Promise<{text:string;identity:Identity;usage?:Record<string,unknown>}>){
 return async(raw:unknown):Promise<{text:string;error:boolean}>=>{
  let trace:ToolTrace|undefined
  try{
   signal.throwIfAborted();const input=consultSchema.parse(raw),id='consult-'+hash(input)
   const existing=scope.traces.find(t=>t.id===id)
   if(existing)return {text:existing.state==='complete'?JSON.stringify({identity:existing.identity,text:existing.text}):'Consulta anterior incompleta; no se repitió automáticamente.',error:existing.state!=='complete'}
   if(scope.traces.filter(t=>t.name==='consult_provider').length>=2)return {text:'Límite de dos aclaraciones alcanzado; integra lo disponible.',error:true}
   trace={id,name:'consult_provider',input,state:'running',startedAt:Date.now()};scope.traces.push(trace);scope.update(trace)
   const result=await infer(input.provider,input.question);signal.throwIfAborted()
   Object.assign(trace,result,{state:'complete',endedAt:Date.now()});scope.update(trace)
   return {text:JSON.stringify(result),error:false}
  }catch{
   if(trace&&!signal.aborted){Object.assign(trace,{state:'failed',error:'No se obtuvo la aclaración; conserva las propuestas originales.',endedAt:Date.now()});scope.update(trace)}
   return {text:'No se obtuvo la aclaración. No inventes su resultado.',error:true}
  }
 }
}
