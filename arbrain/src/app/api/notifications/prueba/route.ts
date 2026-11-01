import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { esFallaDeAuth, respuestaServicioCaido } from '@/lib/infra-errores'
import { almacenSupabase } from '@/features/notifications/lib/almacenSupabase'
import { crearLimitador, enviarPrueba, VENTANA_PRUEBA_MS } from '@/features/notifications/lib/pushServidor'
import { prepararVapid } from '@/features/notifications/lib/vapid'
import { esEdicionCliente } from '@/lib/edicion'
import { almacenAlumno } from '@/features/notifications/lib/almacenSupabase'
import { dirMiMarca, leerMiMarca } from '@/lib/mi-marca'
import { leerPrimerArranque } from '@/features/primer-arranque/lib/estado'

/**
 * «Enviarme una prueba» de Ajustes › Notificaciones (12 oct 2026). Sin parámetros de destinatario: va SOLO a los
 * dispositivos del usuario de la sesión, una cada 30 s. No crea aviso en la campana; deja acuse en `push_log`
 * (job_id `prueba-ajustes`).
 */
const limitador = crearLimitador(VENTANA_PRUEBA_MS)

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user && esFallaDeAuth(error)) return respuestaServicioCaido()
  try {
    const db = createServiceClient()
    const cliente = esEdicionCliente()
    let nombre: string | null = null
    // Edición cliente (v0.2.18): su base local no tiene perfiles; su nombre vive en Mi marca o, si no, en su bienvenida.
    if (user && cliente) {
      nombre = (await leerMiMarca(dirMiMarca()).catch(() => null))?.nombre ?? null
      if (!nombre) try { nombre = leerPrimerArranque().nombre } catch { /* sin bienvenida legible: sin nombre */ }
    }
    else if (user) {
      const { data } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      nombre = (data as { full_name?: string | null } | null)?.full_name ?? null
    }
    const r = await enviarPrueba({
      usuario: user?.id ?? null,
      nombre,
      cliente,
      vapidLista: prepararVapid(),
      almacen: cliente ? almacenAlumno(db) : almacenSupabase(db),
      enviar: async (s, payload) => { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60, urgency: 'high' }) },
      limitador,
    })
    return NextResponse.json(r.json, { status: r.status, headers: r.headers })
  } catch (err) {
    console.error('notifications/prueba:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'No se pudo enviar la prueba. Intenta de nuevo.' }, { status: 500 })
  }
}
