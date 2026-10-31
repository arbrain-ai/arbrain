import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlmacenPush } from './pushServidor'

/**
 * `push_subscriptions` con el cliente de servicio. Va con service role porque la tabla no tiene política UPDATE para
 * `authenticated` y el upsert por endpoint (re-registrar el mismo teléfono) fallaba con la sesión. El `userId` que
 * recibe SIEMPRE es el de la sesión (lo resuelve la ruta), nunca uno del cliente; cada consulta filtra por él.
 */
export function almacenSupabase(db: SupabaseClient): AlmacenPush {
  return {
    async guardar(userId, s) {
      const { error } = await db.from('push_subscriptions').upsert(
        { user_id: userId, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, updated_at: new Date().toISOString() },
        { onConflict: 'endpoint' },
      )
      if (error) throw new Error(`push_subscriptions upsert: ${error.message}`)
    },
    async borrar(userId, endpoint) {
      const { error } = await db.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
      if (error) throw new Error(`push_subscriptions delete: ${error.message}`)
    },
    async deUsuario(userId) {
      const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
      if (error) throw new Error(`push_subscriptions select: ${error.message}`)
      return data ?? []
    },
    async borrarIds(userId, ids) {
      if (!ids.length) return
      await db.from('push_subscriptions').delete().in('id', ids).eq('user_id', userId)
    },
    async registrar(intentos) {
      if (!intentos.length) return
      const { error } = await db.from('push_log').insert(intentos)
      if (error) console.error('push_log insert failed:', error.message)
    },
  }
}

/** Cuántos acuses guarda la base local del alumno (v0.2.18): es un archivo que se reescribe completo en cada aviso. */
export const MAX_PUSH_LOG_LOCAL = 300

/**
 * Edición cliente: el mismo almacén sobre su base local (`createServiceClient()` ya la devuelve), con `push_log` acotado a
 * los últimos `MAX_PUSH_LOG_LOCAL` acuses para que no crezca sin fin.
 */
export function almacenAlumno(db: SupabaseClient, max = MAX_PUSH_LOG_LOCAL): AlmacenPush {
  const base = almacenSupabase(db)
  return {
    ...base,
    async registrar(intentos) {
      await base.registrar(intentos)
      if (!intentos.length) return
      const { data } = await db.from('push_log').select('id, created_at').order('created_at', { ascending: false }).range(max, max + 5000)
      const viejos = (data ?? []).map((f: { id: string }) => f.id)
      if (viejos.length) await db.from('push_log').delete().in('id', viejos)
    },
  }
}
