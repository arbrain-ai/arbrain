import {timingSafeEqual} from 'node:crypto'
import {createServiceClient} from '@/lib/supabase/service'
import {createSFClient} from '@/lib/supabase/sf-client'
import {CLAUDECLAW_TOKEN} from '@/lib/claudeclaw'
import {LOCAL_DESKTOP_EMAIL} from '@/lib/desktop-auth'
import {callPlanning} from '@/lib/planning/server'
export const maxDuration=120
/** Server-to-server reader. The daemon supplies a verified conversation owner, never browser HTML. */
export async function POST(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??''
 if(!CLAUDECLAW_TOKEN||Buffer.byteLength(token)!==Buffer.byteLength(CLAUDECLAW_TOKEN)||!timingSafeEqual(Buffer.from(token),Buffer.from(CLAUDECLAW_TOKEN)))return Response.json({error:'Unauthorized'},{status:401})
 try{
  const {owner,source,query={}}=await request.json()
  if(typeof owner!=='string'||!query||typeof query!=='object'||Array.isArray(query))return Response.json({error:'Consulta inválida.'},{status:400})
  const {data:profile,error:ownerError}=await createServiceClient().from('profiles').select('id,role,email').eq('id',owner).maybeSingle()
  if(ownerError||profile?.role!=='owner'||profile?.email?.toLowerCase()!==LOCAL_DESKTOP_EMAIL.toLowerCase())return Response.json({error:'Propietario personal no verificado.'},{status:403})
  let data:unknown,coverage:string
  if(source==='planning'){
   const from=String(query.from??''),to=String(query.to??'')
   if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>93*86400000)return Response.json({error:'Usa from/to ISO, un período positivo de hasta 93 días.'},{status:400})
   data=await callPlanning({action:'snapshot',from,to,includeCompleted:query.includeCompleted===true})
   coverage='Calendario y Todoist desde su pluma vigente; conservar fuente, IDs, zonas horarias y errores parciales.'
  }else if(source==='objectives'){
   data=await callPlanning({action:'objectives-read'})
   coverage='Objetivos desde su fuente vigente; decisiones existentes, no propuestas nuevas.'
  }else if(source==='content'||source==='radar'){
   const limit=Math.min(100,Math.max(1,Number(query.limit)||30)),offset=Math.max(0,Math.floor(Number(query.offset)||0))
   if(!Number.isSafeInteger(offset)||offset>10000)return Response.json({error:'Paginación inválida.'},{status:400})
   const columns=source==='radar'?'video_id,title,published_at,views,updated_at,channel_name,thumbnail_url,duration_seconds':'video_id,title,published_at,views,avg_view_percentage,updated_at,link_slug,thumbnail_url,analytics_synced_at'
   const result=await createSFClient().from(source==='radar'?'intel_videos':'youtube_videos').select(columns).order('published_at',{ascending:false}).range(offset,offset+limit)
   if(result.error)throw new Error('No se pudieron consultar los videos.')
   data={items:(result.data??[]).slice(0,limit),offset,nextOffset:(result.data?.length??0)>limit?offset+limit:null}
   coverage='Métricas observadas de videos; updated_at/analytics_synced_at indican frescura. Las vistas no prueban ventas.'
  }else if(source==='operations'){
   const result=await createServiceClient().from('conversations').select('id,prompt,status,error,created_at').eq('source','cron').order('created_at',{ascending:false}).limit(50)
   if(result.error)throw new Error('No se pudieron leer las ejecuciones.')
   data=result.data;coverage='Historial de ejecuciones con su fecha/estado; no certifica salud instantánea de servicios.'
  }else if(source==='briefings'){
   const result=await createServiceClient().from('conversations').select('id,prompt,response,status,error,created_at').eq('source','cron').in('prompt',['morning-briefing','business-council','monthly-review']).order('created_at',{ascending:false}).limit(12)
   if(result.error)throw new Error('No se pudieron leer los informes existentes.')
   data=result.data;coverage='Informes históricos existentes con fecha/estado. No se regeneraron y no acreditan datos de hoy.'
  }else return Response.json({error:'Fuente no admitida.'},{status:400})
  return Response.json({data,coverage,readAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
 }catch(error){return Response.json({error:error instanceof Error?error.message:'No se pudo consultar la fuente.'},{status:503})}
}
