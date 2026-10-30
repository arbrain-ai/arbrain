import { planningOwner, planningError } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { createServiceClient } from '@/lib/supabase/service'
import type { CronSchedule, CronSnapshot } from '@/features/planning/types'

export async function GET(request: Request) {
  try {
    await planningOwner()
    const params = new URL(request.url).searchParams
    const from = params.get('from'), to = params.get('to')
    if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from) || Date.parse(to)-Date.parse(from)>65*86400000) {
      return Response.json({ error: 'Rango inválido.' }, { status: 400 })
    }
    const state: CronSnapshot = { jobs: [], runs: [], timeZone: 'America/Mexico_City', loadedAt: new Date().toISOString(), scheduleError: null, historyError: null }
    await Promise.all([
      (async () => {
        try {
          if (!CLAUDECLAW_TOKEN) throw new Error('La conexión al scheduler no está configurada.')
          const res = await fetch(`${await getSchedulerUrl()}/schedule`, {
            headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, signal: AbortSignal.timeout(8_000), cache: 'no-store',
          })
          if (!res.ok) throw new Error('El scheduler no está disponible.')
          const data = await res.json()
          if (!Array.isArray(data.tasks)) throw new Error('El scheduler devolvió un formato desconocido.')
          state.jobs = (data.tasks as CronSchedule[]).filter(j => !j.id.includes('-migrated')).map(j => ({
            id: j.id, schedule: j.schedule, status: j.status, next_run: j.next_run, last_run: j.last_run, last_result: j.last_result,
          }))
          if (typeof data.tz === 'string') state.timeZone = data.tz
        } catch (error) { state.scheduleError = error instanceof Error ? error.message : 'Scheduler no disponible.' }
      })(),
      (async () => {
        try {
          const service=createServiceClient()
          const data: {id:string;prompt:string|null;error:string|null;status:string;created_at:string;usage:unknown}[]=[]
          for(let offset=0;offset<10000;offset+=500){
            const page=await service.from('conversations')
              .select('id,prompt,error,status,created_at,usage').eq('source','cron')
              .gte('created_at',from).lt('created_at',to).order('created_at',{ascending:false}).order('id').range(offset,offset+499)
            if(page.error)throw page.error
            data.push(...(page.data??[]))
            if(!page.data||page.data.length<500)break
            if(offset===9500)state.historyTruncated=true
          }
          state.runs = (data ?? []).map(r => {
            const duration = (r.usage as { durationMs?: unknown } | null)?.durationMs
            return { id: r.id, job_id: r.prompt ?? '', response: null, error: r.error?.slice(0,300)??null,
              status: r.status, created_at: r.created_at,
              duration_ms: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null }
          })
        } catch { state.historyError = 'No se pudo leer el historial de ejecuciones.' }
      })(),
    ])
    return Response.json(state, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
