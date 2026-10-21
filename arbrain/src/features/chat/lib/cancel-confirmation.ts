/** Read-only follow-up to an accepted stop; never reissues the mutation. */
export async function confirmStopped(scope:{chatSessionId:string;turnId:string;account:string},request:typeof fetch=fetch,delay:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 for(const ms of [100,200,400,800,1200]){
  await delay(ms)
  try{
   const response=await request('/api/chat/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(scope),signal:AbortSignal.timeout(3000)})
   if(!response.ok)continue
   const result=await response.json()
   if(result.turn?.turnId!==scope.turnId)continue
   if(['completed','failed','interrupted'].includes(result.turn.status))return result.turn.status as 'completed'|'failed'|'interrupted'
  }catch{ /* Keep uncertainty explicit after the bounded follow-up. */ }
 }
 return null
}
