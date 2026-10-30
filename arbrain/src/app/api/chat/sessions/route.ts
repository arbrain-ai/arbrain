import { requireChatPrincipal, resolveChatConversation, chatAccessResponse, requireExpectedChatOwner } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { isNonDefaultAccount } from '@/features/chat/stores/account-store'
import { filtroCuentas } from '@/features/chat/lib/recientes-cuentas'
import { ownerIds } from '@/features/avisos/server'
import { HILOS_RUTINAS, IDS_HILOS_RUTINAS } from '@/shared/constants/rutinas-hilos'
import { mezclarSesionesSdk, type SdkConversacionDto } from '@/features/chat/lib/sesiones-sdk'

async function requireChatUser() {
  try { return { user: await requireChatPrincipal(), error: null } }
  catch (error) { return { user: null, error: chatAccessResponse(error) } }
}

async function sesionesSdkDelJournal(claudeclawUrl: Promise<string> | string, ownerId: string): Promise<SdkConversacionDto[]> {
  try {
    const res = await fetch(`${await claudeclawUrl}/chat/sdk-sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId }),
      signal: AbortSignal.timeout(2_500),
    })
    if (!res.ok) return []
    const json = await res.json() as { sessions?: unknown }
    return Array.isArray(json.sessions) ? json.sessions as SdkConversacionDto[] : []
  } catch { return [] }
}

export async function GET(request: Request) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') ?? '30'
  const source = searchParams.get('source')
  // TEMPORAL (2026-07-08): "espacio" de cuenta. 'bro' = conversaciones que corren
  // sobre la segunda cuenta de Claude; 'default'/ausente = la cuenta principal (account NULL).
  // 1 oct 2026: acepta varias separadas por coma («default,bro,codex») para «Recientes» de la barra.
  const account = searchParams.get('account')

  if (source === 'mc') {
    const service = createServiceClient()
    let query = service
      .from('chat_sessions')
      .select('*')
    // `sort=last_message` (1 oct 2026): por el último mensaje, como agrupa «Recientes» por día. Renombrar
    // o tocar una conversación mueve su updated_at sin que haya habido mensaje nuevo. Las filas sin mensajes
    // quedan al final, ordenadas por updated_at. Sin el parámetro, el orden de siempre.
    query = searchParams.get('sort') === 'last_message'
      ? query.order('last_message_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false })
      : query.order('updated_at', { ascending: false })
    query = query.limit(Number(limit) || 30)

    if (auth.user!.personalOwner) query = query.or(`profile_id.eq.${auth.user!.id},profile_id.is.null`)
    else query = query.eq('profile_id', auth.user!.id)

    // Filtro por espacio de cuenta (solo cuando el cliente lo pide, para no
    // romper llamadas legacy sin el param). Una cuenta = igual que siempre; varias = un `or`
    // de PostgREST, que se combina con AND con el `or` de profile_id de arriba (params `or=` distintos).
    const filtro = filtroCuentas(account)
    if (filtro?.eq) query = query.eq('account', filtro.eq)
    else if (filtro?.isNull) query = query.is('account', null)
    else if (filtro?.or) query = query.or(filtro.or)
    // `fijadas=1` (1 oct 2026): solo las fijadas (columna is_favorite), para la sección de arriba de «Recientes»
    // sin importar su antigüedad.
    if (searchParams.get('fijadas') === '1') query = query.eq('is_favorite', true)
    // `rutinas=1` (4 oct 2026): los hilos de la carpeta «Rutinas» (ids fijos, rutinas-hilos.ts), sin importar su antigüedad.
    const soloRutinas = searchParams.get('rutinas') === '1'
    if (soloRutinas) query = query.in('id', [...IDS_HILOS_RUTINAS])
    // Archivadas (1 oct 2026): salen de todas las listas. `archivadas=1` trae solo ellas, para poder desarchivar.
    // Conservan is_favorite: al desarchivar vuelven fijadas si lo estaban.
    const soloArchivadas = searchParams.get('archivadas') === '1'
    query = soloArchivadas ? query.not('archived_at', 'is', null) : query.is('archived_at', null)

    // Los hilos existen desde la primera vez que la carpeta se pide (no hay que esperar al primer reporte del cron):
    // alta idempotente con id fijo; si ya están, no toca nada. Solo el dueño personal, que es de quien son.
    if (soloRutinas && auth.user!.personalOwner) {
      // El mismo dueño al que escribe el webhook de los crons (no el usuario sintético de la app de escritorio).
      const [dueno] = await ownerIds(service)
      if (dueno) {
        const fijos = HILOS_RUTINAS.flatMap((h) => (h.sesionId ? [{ id: h.sesionId, title: h.titulo }] : []))
        await service.from('chat_sessions').upsert(
          fijos.map((h) => ({ ...h, is_favorite: false, profile_id: dueno })),
          { onConflict: 'id', ignoreDuplicates: true },
        )
        // «Investigaciones» (v1) pasa a «Información»: mismo hilo, nuevo título.
        for (const h of fijos) await service.from('chat_sessions').update({ title: h.title }).eq('id', h.id).neq('title', h.title)
      }
    }
    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })
    // Conversaciones solo-SDK que Arbrain conduce (1 oct 2026): sin fila en la base, solo las conoce el
    // journal del daemon. Las fijadas son filas de la base, así que ahí no se mezclan. Si el daemon no
    // responde o es de una versión sin el endpoint, la lista queda como estaba (degrada en silencio).
    if (searchParams.get('fijadas') === '1' || soloRutinas || soloArchivadas) return Response.json({ sessions: data ?? [] })
    const sdk = await sesionesSdkDelJournal(claudeclawUrl, auth.user!.id)
    return Response.json({
      sessions: mezclarSesionesSdk(data ?? [], sdk, {
        cuentas: account,
        porUltimoMensaje: searchParams.get('sort') === 'last_message',
        limite: Number(limit) || 30,
      }),
    })
  }

  try {
    // TEMPORAL: pool de sesiones CLI por cuenta ('bro' → su carpeta de configuración en el daemon).
    const accountQs = isNonDefaultAccount(account) ? `&account=${account}` : ''
    // Filtro por tipo de sesión: 'chat' = conversaciones reales, 'cron' = crons
    // y procesos de fondo (pestaña Crons del sidebar).
    const kind = searchParams.get('kind')
    const kindQs = kind === 'chat' || kind === 'cron' ? `&kind=${kind}` : ''
    const res = await fetch(`${await claudeclawUrl}/sessions?limit=${limit}${accountQs}${kindQs}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
    })
    if (!res.ok) throw new Error(`ClaudeClaw ${res.status}`)
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ sessions: [], degraded: true, error: 'ClaudeClaw unreachable' })
  }
}

export async function POST(request: Request) {
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as { id?: string; expectedOwnerId?: string; title?: string; firstMessage?: string; account?: string }
  try {
    requireExpectedChatOwner(auth.user!, body.expectedOwnerId)
    if (body.id !== undefined && (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))) throw new ChatAccessError('Invalid conversation ID', 400)
  } catch (error) { return chatAccessResponse(error) }
  const titleSource = body.title?.trim() || body.firstMessage?.trim() || 'Nueva conversacion'
  const title = titleSource.slice(0, 55) + (titleSource.length > 55 ? '...' : '')
  // TEMPORAL (2026-07-08): la conversación nace atada a una cuenta. 'bro' = segunda
  // cuenta de Claude; cualquier otra cosa = NULL (cuenta principal). Fijo de por vida de la
  // conversación (el resume del SDK vive por config-dir, no se cambia a mitad).
  let account
  try { account = accountId(body.account) } catch (error) { return chatAccessResponse(error) }
  const service = createServiceClient()

  const { data, error } = await service
    .from('chat_sessions')
    .insert({
      ...(body.id ? { id: body.id } : {}),
      title,
      profile_id: auth.user!.id,
      account: account === 'default' ? null : account,
    })
    .select('*')
    .single()

  if (error || !data) {
    if (body.id && error?.code === '23505') {
      try { await resolveChatConversation(auth.user!, body.id, account) } catch (accessError) { return chatAccessResponse(accessError) }
      const existing = await service.from('chat_sessions').select('*').eq('id', body.id).single()
      if (!existing.error && existing.data) return Response.json({ session: existing.data })
    }
    return Response.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 })
  }

  return Response.json({ session: data })
}

export async function PATCH(request: Request) {
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as {
    sessionId?: string
    title?: string
    is_favorite?: boolean
    /** Favorita (4 oct 2026): estrella; marcarla también fija. */
    is_starred?: boolean
    touch?: boolean
    /** Semáforo del sidebar: marca la conversación como vista (→ gris). */
    markRead?: boolean
    /** «Marcar como no leído» (1 oct 2026): borra la marca de visto y el semáforo vuelve a morado si Levy fue el último en hablar. */
    markUnread?: boolean
    /** Archivar (true) o desarchivar (false): `archived_at` con fecha o nulo. */
    archived?: boolean
    /**
     * Orden manual de Fijadas (4 oct 2026): los ids de la sección, de arriba abajo, tras soltar un arrastre.
     * Todas quedan fijadas con su posición (la que entra arrastrándola desde los días también).
     */
    ordenFijadas?: string[]
  }
  if (Array.isArray(body.ordenFijadas)) return guardarOrdenFijadas(auth.user!, body.ordenFijadas)
  if (!body.sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
  try { await resolveChatConversation(auth.user!, body.sessionId) } catch (error) { return chatAccessResponse(error) }

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim()
  // Fijar o desfijar desde el menú limpia la posición: una recién fijada entra arriba, y una desfijada no la guarda.
  if (typeof body.is_favorite === 'boolean') {
    update.is_favorite = body.is_favorite
    update.pinned_position = null
    if (!body.is_favorite) update.is_starred = false // una favorita siempre está fijada
  }
  // Estrella única (v3, 10 oct 2026, firmado): la favorita es una sola, a donde llegan los reportes de las rutinas.
  let duenoEstrella: string | null = null
  if (typeof body.is_starred === 'boolean') {
    update.is_starred = body.is_starred
    if (body.is_starred) {
      // Marcar favorita una suelta la fija (entra arriba); si ya estaba fijada conserva su lugar.
      const { data: actual } = await createServiceClient().from('chat_sessions').select('is_favorite, profile_id').eq('id', body.sessionId).maybeSingle()
      if (actual && !actual.is_favorite) { update.is_favorite = true; update.pinned_position = null }
      duenoEstrella = actual?.profile_id ?? null
    }
  }
  if (body.touch) update.updated_at = new Date().toISOString()
  if (body.markRead) update.last_read_at = new Date().toISOString()
  else if (body.markUnread) update.last_read_at = null
  if (typeof body.archived === 'boolean') update.archived_at = body.archived ? new Date().toISOString() : null
  if (Object.keys(update).length === 0) return Response.json({ error: 'No update fields' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('chat_sessions')
    .update(update)
    .eq('id', body.sessionId)
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  // …y le quita la estrella a la anterior (a todas las demás del mismo dueño). `desmarcadas` deja que la pantalla
  // apague esas estrellas al instante; las otras ventanas se enteran por el canal de la estrella y al releer la lista.
  let desmarcadas: string[] = []
  if (body.is_starred === true && duenoEstrella) {
    const { data: otras, error: errorOtras } = await service
      .from('chat_sessions')
      .update({ is_starred: false })
      .eq('profile_id', duenoEstrella)
      .eq('is_starred', true)
      .neq('id', body.sessionId)
      .select('id')
    if (errorOtras) console.error('[chat/sessions] estrella única:', errorOtras.message)
    desmarcadas = (otras ?? []).map((o) => o.id as string)
  }
  return Response.json({ session: data, desmarcadas })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FIJADAS_ORDEN = 100

async function guardarOrdenFijadas(user: Awaited<ReturnType<typeof requireChatPrincipal>>, ids: unknown[]) {
  if (ids.length === 0 || ids.length > MAX_FIJADAS_ORDEN || new Set(ids).size !== ids.length || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    return Response.json({ error: 'ordenFijadas inválido' }, { status: 400 })
  }
  const lista = ids as string[]
  try { await Promise.all(lista.map((id) => resolveChatConversation(user, id))) } catch (error) { return chatAccessResponse(error) }
  const service = createServiceClient()
  const resultados = await Promise.all(lista.map((id, i) =>
    service.from('chat_sessions').update({ is_favorite: true, pinned_position: i }).eq('id', id)))
  const fallo = resultados.find((r) => r.error)
  if (fallo?.error) return Response.json({ error: fallo.error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await requireChatUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as { sessionId?: string }
  if (!body.sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
  try { await resolveChatConversation(auth.user!, body.sessionId) } catch (error) { return chatAccessResponse(error) }

  const service = createServiceClient()
  const { error } = await service.from('chat_sessions').delete().eq('id', body.sessionId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
