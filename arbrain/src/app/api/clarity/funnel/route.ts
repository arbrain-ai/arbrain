import { planningOwner, planningError } from '@/lib/planning/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { civilToday, civilMidnight, shiftDay } from '@/features/sistema/calendar-days'
import { addFunnelEvents, createFunnelSessions, funnelStages } from '@/features/clarity/funnel-model'
export async function GET(request:Request) {
 try {
  await planningOwner()
  const params=new URL(request.url).searchParams,id=params.get('video')??'',days=[0,7,30,90].includes(Number(params.get('days')))&&params.has('days')?Number(params.get('days')):30
  if(!/^[\w-]{11}$/.test(id))return Response.json({error:'Video inválido.'},{status:400})
  const sf=createSFClient(),now=new Date(),from=days?civilMidnight(shiftDay(civilToday('America/Mexico_City',now),-(days-1)),'America/Mexico_City').toISOString():'1970-01-01T00:00:00.000Z',to=now.toISOString()
  const video=await sf.from('youtube_videos').select('video_id,title,link_slug').eq('video_id',id).maybeSingle()
  if(video.error)throw new Error('No se pudo consultar el video.')
  if(!video.data)return Response.json({error:'Video no encontrado.'},{status:404})
  const base={video:video.data,from:days?from:null,to,days,loadedAt:to,timeZone:'America/Mexico_City'}
  const headers={'Cache-Control':'private, no-store'}
  if(!video.data.link_slug)return Response.json({...base,tracking:false,reason:'No hay un enlace asociado a este video en el registro.'},{headers})
  const link=await sf.from('tracked_links').select('id,slug,source,campaign,is_active').eq('slug',video.data.link_slug).maybeSingle()
  if(link.error)throw new Error('No se pudo consultar el enlace de seguimiento.')
  if(!link.data)return Response.json({...base,tracking:false,reason:'El slug del video no tiene un enlace registrado.'},{headers})
  const clicks=await sf.from('link_clicks').select('id',{count:'exact',head:true}).eq('link_id',link.data.id).gte('clicked_at',from).lt('clicked_at',to)
  if(clicks.error){console.error('[clarity/funnel]',clicks.error.code,clicks.error.message);throw new Error('No se pudieron consultar los clics del enlace.')}
  const state=createFunnelSessions(),sessions=state.stages
  let truncated=false
  for(let offset=0;offset<=10000;offset+=500){
   const result=await sf.from('funnel_events').select('id,session_id,event_name,created_at').eq('link_slug',link.data.slug).in('event_name',[...funnelStages]).gte('created_at',from).lt('created_at',to).order('created_at').order('id').range(offset,offset+499)
   if(result.error)throw new Error('No se pudo consultar el recorrido del enlace.')
   const rows=result.data??[]
   if(offset===10000){truncated=rows.length>0;break}
   addFunnelEvents(state,rows)
   if(rows.length<500)break
  }
  return Response.json({...base,tracking:true,link:link.data,clicks:clicks.count,landing:sessions.about_page_view.size,cta:sessions.about_cta_click.size,checkout:sessions.checkout_page_view.size,withoutSession:state.withoutSession,truncated},{headers})
 }catch(error){return planningError(error)}
}
