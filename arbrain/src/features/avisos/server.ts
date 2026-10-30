import type { createServiceClient } from '@/lib/supabase/service'
import { LOCAL_DESKTOP_EMAIL, isLocalDesktopUserId } from '@/lib/desktop-auth'
import type { Decision } from './policy'

// Registro de avisos (25 sep 2026): cada notificación deja fila ANTES de sonar.
// avisos = campana del dueño; bitacora = telemetría para Levy. Ver la migración
// 20260925_avisos.sql y policy.ts.

type Service = ReturnType<typeof createServiceClient>
/** `clave` = la etiqueta del emisor (el `tag` del push). Con ella el emisor cierra su aviso cuando la causa se
 * resolvió (POST /api/avisos/resolver, 29 oct 2026). */
export interface AvisoInput { title: string; body?: string | null; url?: string | null; clave?: string | null }

/** Buzón del dueño (4 oct 2026). La socia también es `owner` (mismos permisos), pero lo que
 * no trae destinatario —rutinas, agenda, salud del servidor, sesiones huérfanas— es de
 * El dueño, no de todo perfil owner: filtrar por rol solo duplicaría sus avisos en el
 * teléfono de la socia y haría ambiguo cualquier `.limit(1)`. Sus avisos propios llegan por
 * `userId` explícito o por el dueño de la conversación. */
export async function ownerIds(supabase: Service): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'owner').eq('email', LOCAL_DESKTOP_EMAIL)
  return data?.map(o => o.id) ?? []
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
/** Perfil real que el daemon declara dueño del turno; el id sintético del escritorio no es un perfil. */
export const perfilDelTurno = (v: unknown): string | null => esUuid(v) && !isLocalDesktopUserId(v) ? v : null

/** Escribe el aviso donde la política dice. Devuelve si quedó registrado: un aviso
 * sin fila no se da por entregado aunque el push haya salido. */
export async function registrar(supabase: Service, decision: Decision, aviso: AvisoInput, userIds: string[]): Promise<boolean> {
  const title = aviso.title.slice(0, 200), body = aviso.body?.slice(0, 1000) ?? null, url = aviso.url ?? null
  try {
    if (decision.entrega === 'bitacora') {
      const { error } = await supabase.from('bitacora').insert({ source: decision.source, title, body, url })
      if (error) console.error('[avisos] bitacora insert failed:', error.message)
      return !error
    }
    if (!userIds.length || decision.kind === 'sistema') return false
    const clave = aviso.clave?.trim().slice(0, 200) || null
    const filas = userIds.map(user_id => ({
      user_id, kind: decision.kind, source: decision.source, title, body, url, pushed: decision.entrega === 'push', ...(clave ? { clave } : {}),
    }))
    let { error } = await supabase.from('avisos').insert(filas)
    // Una base sin la migración 20261029 no conoce `clave`: el aviso entra igual, sin ella (nunca se pierde un aviso).
    if (error && clave && /clave/.test(error.message)) ({ error } = await supabase.from('avisos').insert(filas.map(({ clave: _c, ...f }) => f)))
    if (error) console.error('[avisos] avisos insert failed:', error.message)
    return !error
  } catch (err) {
    console.error('[avisos] registrar threw:', err instanceof Error ? err.message : err)
    return false
  }
}
