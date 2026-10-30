import { planningOwner, planningError } from '@/lib/planning/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { createServiceClient } from '@/lib/supabase/service'
import { briefNames } from '@/features/clarity/types'

export async function GET(request: Request) {
 try {
  const ownerId = await planningOwner()
  const section = new URL(request.url).searchParams.get('section') ?? 'overview'
  const headers = {'Cache-Control':'private, no-store'}
  if (!['overview','results','radar'].includes(section)) return Response.json({error:'Vista desconocida.'},{status:400,headers})
  const sf = createSFClient()
  if (section !== 'overview') {
   const radar = section === 'radar'
   const columns = radar ? 'video_id,title,published_at,views,updated_at,channel_name,thumbnail_url,duration_seconds' : 'video_id,title,published_at,views,avg_view_percentage,updated_at,link_slug,thumbnail_url,analytics_synced_at'
   const result = await sf.from(radar ? 'intel_videos' : 'youtube_videos').select(columns).order('published_at',{ascending:false}).limit(101)
   if(result.error) throw new Error('No se pudieron consultar los videos. Reintenta; ausencia no significa cero.')
   return Response.json({ownerId,videos:(result.data??[]).slice(0,100),limited:(result.data?.length??0)>100,loadedAt:new Date().toISOString()},{headers})
  }
  const [billingResult,...briefResults] = await Promise.all([
   sf.from('daily_business_metrics').select('date,mrr_cents,active_subs,cancel_at_period_end,polar_reconciled_at').not('polar_reconciled_at','is',null).order('polar_reconciled_at',{ascending:false}).limit(400),
   ...Object.keys(briefNames).map(job=>createServiceClient().from('conversations').select('id,prompt,status,error,created_at').eq('source','cron').eq('prompt',job).order('created_at',{ascending:false}).limit(1).maybeSingle()),
  ])
  const issues:string[]=[]
  if(billingResult.error) issues.push('No se pudo consultar la reconciliación de Polar.')
  const briefs = briefResults.flatMap((r,i)=>{if(r.error){issues.push(`No se pudo consultar ${Object.values(briefNames)[i]}.`);return []}return r.data?[r.data]:[]})
  const history=Array.isArray(billingResult.data)?billingResult.data:[]
  const billing=billingResult.error?null:history[0]??null
  const previousDate=billing?.date ? new Date(Date.parse(`${billing.date}T12:00:00Z`)-7*86400000).toISOString().slice(0,10):null
  const previousBilling=history.find(row=>row.date===previousDate)??null
  // Hasta 400 cortes (≈1 año) para que Finanzas compare el MRR con el inicio de 3M, 6M y 12M. Serie de cortes reconciliados (uno por fecha, viejo → nuevo) para la chispa de la Cabina.
  const porFecha=new Map<string,{date:string;mrr_cents:number|null;active_subs:number|null}>()
  for(const row of history){if(!porFecha.has(row.date))porFecha.set(row.date,{date:row.date,mrr_cents:row.mrr_cents,active_subs:row.active_subs})}
  const serie=[...porFecha.values()].sort((a,b)=>a.date.localeCompare(b.date))
  return Response.json({ownerId,billing,previousBilling,history:serie,briefs,issues,loadedAt:new Date().toISOString()},{headers})
 } catch(error) { return planningError(error) }
}
