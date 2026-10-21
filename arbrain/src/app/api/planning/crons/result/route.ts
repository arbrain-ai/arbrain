import { planningOwner, planningError } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
export async function GET(request:Request){
 try{
  await planningOwner()
  const id=new URL(request.url).searchParams.get('id')
  if(!id||!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:'Ejecución inválida.'},{status:400})
  const {data,error}=await createServiceClient().from('conversations').select('id,response,error,status,created_at').eq('source','cron').eq('id',id).maybeSingle()
  if(error)throw new Error('No se pudo leer el resultado.')
  if(!data)return Response.json({error:'Ejecución no encontrada.'},{status:404})
  return Response.json(data,{headers:{'Cache-Control':'no-store'}})
 }catch(error){return planningError(error)}
}
