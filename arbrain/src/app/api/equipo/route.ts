import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { createServiceClient } from '@/lib/supabase/service'
import type { AgenteVivo, FotoEquipo, PersonaVivo } from '@/features/cabina/vistas/equipo-modelo'

// Vista «equipo» (5 oct 2026): el organigrama vivo. Por cada perfil de Arbrain, su foto, cuándo entró
// (auth.last_sign_in_at), su última conversación, su campana y si tiene push. Levy: su última corrida de rutina.
// Solo lectura. `yo` es el perfil del que pregunta: el escritorio (sesión sintética) toma de aquí su foto.
// Lo que falla se dice en `errores` y queda en null: falta de dato no es cero.

const noStore = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const principal = await requireChatPrincipal()
    const db = createServiceClient()
    const errores: string[] = []
    const { data: perfiles, error } = await db.from('profiles').select('id, full_name, avatar_url, role').in('role', ['owner', 'admin']).order('created_at')
    if (error) throw new Error(error.message)
    const ids = (perfiles ?? []).map(p => p.id)
    const [avisos, sesiones, push, corrida, usuarios] = await Promise.all([
      db.from('avisos').select('user_id, title, created_at, read_at').in('user_id', ids).order('created_at', { ascending: false }).limit(400),
      db.from('chat_sessions').select('profile_id, updated_at').in('profile_id', ids).order('updated_at', { ascending: false }).limit(200),
      db.from('push_subscriptions').select('user_id').in('user_id', ids),
      db.from('conversations').select('created_at').eq('source', 'cron').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      Promise.all(ids.map(id => db.auth.admin.getUserById(id).then(r => r.error ? null : r.data.user?.last_sign_in_at ?? null).catch(() => null))),
    ])
    if (avisos.error) errores.push('No se pudo leer la campana.')
    if (sesiones.error) errores.push('No se pudieron leer las conversaciones.')
    if (push.error) errores.push('No se pudo leer el push.')
    if (corrida.error) errores.push('No se pudo leer la última rutina de Levy.')
    const personas: PersonaVivo[] = (perfiles ?? []).map((p, i) => {
      const suyos = avisos.data?.filter(a => a.user_id === p.id) ?? null
      return {
        id: p.id, nombre: p.full_name ?? 'Sin nombre', avatar: p.avatar_url ?? null,
        entro: usuarios[i] ?? null,
        conversacion: sesiones.data?.find(s => s.profile_id === p.id)?.updated_at ?? null,
        sinLeer: suyos ? suyos.filter(a => !a.read_at).length : null,
        ultimoAviso: suyos?.[0] ? { titulo: suyos[0].title, en: suyos[0].created_at } : null,
        push: push.error ? null : (push.data ?? []).some(s => s.user_id === p.id),
      }
    })
    // Trinity y Sensei son caras del mismo cerebro (features/live/agents.ts): no llevan registro propio todavía.
    const agentes: AgenteVivo[] = [{ id: 'levy', ultima: corrida.data?.created_at ?? null }, { id: 'trinity', ultima: null }, { id: 'sensei', ultima: null }]
    const yo = personas.find(p => p.id === principal.id) ?? null
    return Response.json({ personas, agentes, yo, leidoEn: new Date().toISOString(), errores } satisfies FotoEquipo & { yo: PersonaVivo | null }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) return Response.json({ error: 'No se pudo leer el equipo.' }, { status: 503, headers: noStore })
    return chatAccessResponse(error)
  }
}
