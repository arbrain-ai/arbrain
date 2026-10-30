import { planningOwner, planningError } from '@/lib/planning/server'
import { CLAUDECLAW_TOKEN, getSchedulerUrl } from '@/lib/claudeclaw'
export const maxDuration=120
export async function GET(request:Request){
 try{
  await planningOwner()
  const query=new URL(request.url).searchParams
  const params=new URLSearchParams()
  for(const key of ['days','video','scope','offset'])if(query.has(key))params.set(key,query.get(key)!)
  if(request.headers.get('x-arbrain-refresh')==='1')params.set('refresh','1')
  const url=process.env.SALES_URL_PINNED??await getSchedulerUrl()
  const response=await fetch(`${url}/analytics/sales?${params}`,{headers:{Authorization:`Bearer ${CLAUDECLAW_TOKEN}`},cache:'no-store',signal:AbortSignal.timeout(115000)})
  const body=await response.json().catch(()=>({error:'La reconciliación de ventas no está disponible.'}))
  return Response.json(body,{status:response.status,headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return planningError(error)}
}
