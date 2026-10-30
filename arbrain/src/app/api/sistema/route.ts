import { randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { civilToday, habitRange, isCivilDate } from '@/features/sistema/calendar-days'
import { zonaDueno } from '@/shared/lib/zona-dueno'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { HabitosLocales } from '@/lib/sistema/habitos-local'

const REFLEXION_FIELDS = ['prioridad_am', 'respuesta_am', 'respuesta_pm'] as const
const CHECK_COLUMNS = 'fecha, habito_clave, hecho, revision, updated_at, source, evidence, request_id'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    const uid = await planningOwner()
    // Edición cliente (21 oct 2026): los hábitos viven en el cerebro del alumno (.claude/plan/habitos.json), misma forma.
    if (esEdicionCliente()) return Response.json(new HabitosLocales(raizWorkspace(), uid).leer(new URL(request.url).searchParams), { headers })
    let range: ReturnType<typeof habitRange>
    try { range = habitRange(new URL(request.url).searchParams) }
    catch { throw new ChatAccessError('Fecha, zona horaria o rango inválido.', 400) }
    const { date, from, to } = range
    const service = createServiceClient()
    const historyPage = (offset: number) => service.from('sistema_checks').select(CHECK_COLUMNS).eq('user_id', uid)
      .gte('fecha', from).lte('fecha', to).order('fecha').order('habito_clave').range(offset, offset + 999)
    // La primera página del historial viaja en el MISMO Promise.all (26 sep 2026):
    // antes era un round-trip extra en serie en cada apertura de Hoy.
    const [hb, checks, refl, firstPage] = await Promise.all([
      service.from('sistema_habitos').select('id, clave, nombre, seccion, icono, orden, activo, created_at').eq('user_id', uid).order('orden').order('clave'),
      service.from('sistema_checks').select(CHECK_COLUMNS).eq('user_id', uid).eq('fecha', date),
      service.from('sistema_reflexion').select('prioridad_am, respuesta_am, respuesta_pm, updated_at').eq('user_id', uid).eq('fecha', date).maybeSingle(),
      historyPage(0),
    ])
    if (hb.error || checks.error || refl.error) throw new Error('No se pudieron leer los hábitos. Reintenta.')
    // Supabase's default 1,000-row cap must not truncate a month/year silently.
    const records: NonNullable<typeof checks.data> = []
    for (let offset = 0; ; offset += 1000) {
      const page = offset === 0 ? firstPage : await historyPage(offset)
      if (page.error) throw new Error('No se pudo leer el historial completo. Reintenta.')
      records.push(...(page.data ?? []))
      if (!page.data || page.data.length < 1000) break
    }
    const byDate = new Map<string, number>()
    for (const c of records) if (c.hecho === true) byDate.set(c.fecha, (byDate.get(c.fecha) ?? 0) + 1)
    return Response.json({
      owner: uid, ...range,
      habitos: hb.data.filter((h) => h.activo), catalog: hb.data,
      checks: checks.data, records,
      done: checks.data.filter((c) => c.hecho === true).map((c) => c.habito_clave),
      reflexion: refl.data ?? { prioridad_am: '', respuesta_am: '', respuesta_pm: '' },
      history: Array.from(byDate, ([fecha, done]) => ({ fecha, done })),
    }, { headers })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    const uid = await planningOwner()
    checkMutationOrigin(request)
    const raw = await request.text()
    if (raw.length > 16_384) throw new ChatAccessError('Registro demasiado largo.', 413)
    let body: Record<string, unknown>
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      body = parsed
    } catch { throw new ChatAccessError('JSON inválido.', 400) }
    if (esEdicionCliente()) {
      const r = await new HabitosLocales(raizWorkspace(), uid).escribir(body)
      return Response.json(r.cuerpo, { status: r.status, headers })
    }
    let today: string
    try { today = civilToday(typeof body.timeZone === 'string' ? body.timeZone : zonaDueno()) }
    catch { throw new ChatAccessError('Zona horaria inválida.', 400) }
    const date = body.date ?? today
    if (!isCivilDate(date)) throw new ChatAccessError('Fecha inválida.', 400)
    const service = createServiceClient()
    if (body.tipo === 'reflexion') {
      const campo = body.campo as typeof REFLEXION_FIELDS[number]
      if (!REFLEXION_FIELDS.includes(campo) || typeof body.valor !== 'string' || body.valor.length > 8000) {
        throw new ChatAccessError('Campo o reflexión inválidos.', 400)
      }
      const { error } = await service.from('sistema_reflexion').upsert(
        { user_id: uid, fecha: date, [campo]: body.valor, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,fecha' },
      )
      if (error) throw new Error('No se pudo guardar la reflexión.')
      return Response.json({ ok: true }, { headers })
    }
    if (typeof body.clave !== 'string' || !body.clave || body.clave.length > 100 ||
      (body.hecho !== true && body.hecho !== false && body.hecho !== null)) {
      throw new ChatAccessError('Hábito/estado inválido: usa true, false o null.', 400)
    }
    const source = body.source ?? 'manual'
    if (!['manual', 'keyboard', 'conversation', 'diary', 'sfcal-import'].includes(String(source))) {
      throw new ChatAccessError('Procedencia inválida.', 400)
    }
    const evidence = body.evidence ?? null
    if (evidence !== null && (typeof evidence !== 'string' || evidence.length > 2000)) throw new ChatAccessError('Evidencia inválida.', 400)
    if (['diary', 'sfcal-import'].includes(String(source)) && !(typeof evidence === 'string' && evidence.trim())) throw new ChatAccessError('Falta la evidencia de origen.', 400)
    if (body.owner !== undefined && body.owner !== uid) throw new ChatAccessError('El registro pertenece a otra identidad.', 409)
    const requestId = body.requestId ?? randomUUID()
    if (typeof requestId !== 'string' || !UUID.test(requestId)) throw new ChatAccessError('Identificador inválido.', 400)
    let expected = body.expectedRevision
    // Backward compatibility for the historical chat checklist. New surfaces and
    // agent/diary commands always supply both revision and stable request ID.
    if (expected === undefined && body.requestId === undefined && source === 'manual') {
      const prior = await service.from('sistema_checks').select('revision').eq('user_id', uid).eq('fecha', date).eq('habito_clave', body.clave).maybeSingle()
      if (prior.error) throw new Error('No se pudo verificar la revisión del hábito.')
      expected = prior.data?.revision ?? 0
    }
    if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw new ChatAccessError('Falta una revisión válida del registro.', 400)
    const { data, error } = await service.rpc('sistema_write_check_v1', {
      p_owner: uid, p_date: date, p_key: body.clave, p_state: body.hecho,
      p_request: requestId, p_expected: expected, p_source: source, p_evidence: evidence,
    })
    if (error) throw new Error('No se pudo guardar el hábito. Puedes reintentar la misma operación.')
    return Response.json(data, { status: data.status ?? 200, headers })
  } catch (error) { return planningError(error) }
}
