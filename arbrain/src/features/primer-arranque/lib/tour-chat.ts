/**
 * El capítulo del tour como mensaje de Levy en el chat (1 nov 2026). Solo servidor: escribe en la base local de chat
 * igual que el primer mensaje de bienvenida (app/api/primer-arranque/route.ts).
 */
import { randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { FUENTE_TOUR } from './tour'
import type { Entrega } from './tour-servidor'

/** Pone el capítulo como mensaje de Levy. Sin sesión: la de bienvenida o, si no existe, una nueva. */
export async function publicarCapitulo(entrega: Entrega, sesion: string | null, creadoEn = new Date()): Promise<{ sesion: string; mensaje: Record<string, unknown> }> {
  const db = createServiceClient()
  let id = sesion
  if (!id) {
    id = randomUUID()
    const s = await db.from('chat_sessions').insert({ id, title: 'Recorrido de Levy', profile_id: LOCAL_DESKTOP_USER_ID, account: null, last_message_at: creadoEn.toISOString(), is_favorite: false, archived_at: null })
    if (s.error) throw new Error(s.error.message)
  }
  const fila = { id: randomUUID(), session_id: id, role: 'assistant', content: entrega.texto, created_at: creadoEn.toISOString(), metadata: { source: FUENTE_TOUR, capitulo: entrega.capitulo.id, mostrar: entrega.capitulo.mostrar } }
  const m = await db.from('chat_messages').insert(fila)
  if (m.error) throw new Error(m.error.message)
  await db.from('chat_sessions').update({ last_message_at: creadoEn.toISOString() }).eq('id', id)
  return { sesion: id, mensaje: fila }
}

