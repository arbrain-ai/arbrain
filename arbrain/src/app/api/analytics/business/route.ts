import { planningOwner, planningError } from '@/lib/planning/server'
import { createSFClient } from '@/lib/supabase/sf-client'
// Compatibility for Vision. The former access-verification ranking was not sales.
export async function GET() {
 try {
  await planningOwner()
  const sf=createSFClient()
  const [metrics,goal]=await Promise.all([
   sf.from('daily_business_metrics').select('mrr_cents,active_subs,date,polar_reconciled_at').not('polar_reconciled_at','is',null).order('polar_reconciled_at',{ascending:false}).limit(1).maybeSingle(),
   sf.from('app_settings').select('value').eq('key','north_star_mrr_cents').maybeSingle(),
  ])
  if(metrics.error)throw new Error('No se pudo consultar la reconciliación de Polar.')
  return Response.json({latestBilling:metrics.data,topVideos:[],videosUpdatedAt:null,northStarCents:typeof goal.data?.value==='number'?goal.data.value:null,attributionStatus:'unverified',attributionNotice:'Las verificaciones de acceso no son ventas. Ranking retirado hasta reconciliar atribución con Polar.'},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return planningError(error)}
}
