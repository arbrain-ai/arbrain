import { randomUUID } from 'node:crypto'
import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { createServiceClient } from '@/lib/supabase/service'
import { LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { faltaPrimerArranque, guardarPrimerArranque, leerPrimerArranque } from '@/features/primer-arranque/lib/estado'
import { VERSION_TEXTOS } from '@/features/primer-arranque/textos/legales'
import { FUENTE_BIENVENIDA, mensajeBienvenida } from '@/features/primer-arranque/textos/bienvenida'
import { estadoSandbox } from '@/features/permisos/lib/sandbox-server'
import { computerUseDisponible, plataformaServidor } from '@/features/permisos/lib/disponibilidad'

// Primer arranque de la edición cliente (11 oct 2026): aceptación de los textos legales, nombre y cierre con el
// primer mensaje de Levy. Solo la app (cookie del secreto por instalación); en la instalación de Daniel no existe.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  try {
    const estado = leerPrimerArranque()
    // `sandbox` (contrato v3 §6.1): el resumen final avisa si cada comando de terminal pedirá un clic en este equipo.
    // `servidor` (29 oct 2026): la unidad de systemd de nube.sh marca que esta instalación vive en el servidor de la persona.
    return Response.json({ estado, falta: faltaPrimerArranque(estado), versionTextos: VERSION_TEXTOS, sandbox: estadoSandbox(), servidor: process.env.ARBRAIN_SERVIDOR_NUBE === '1' }, { headers: NOCACHE })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No pude leer el estado.' }, { status: 503, headers: NOCACHE })
  }
}

type Cuerpo = { accion?: unknown; version?: unknown; nombre?: unknown }

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as Cuerpo
  try {
    if (body.accion === 'aceptar') {
      if (body.version !== VERSION_TEXTOS) return Response.json({ error: 'Los textos cambiaron. Recarga para leer la versión nueva.' }, { status: 409, headers: NOCACHE })
      return Response.json({ estado: guardarPrimerArranque({ aceptado: { version: VERSION_TEXTOS, fecha: new Date().toISOString() } }) }, { headers: NOCACHE })
    }
    if (body.accion === 'nombre') {
      const nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 60) : ''
      return Response.json({ estado: guardarPrimerArranque({ nombre: nombre || null }) }, { headers: NOCACHE })
    }
    if (body.accion === 'completar') {
      const estado = leerPrimerArranque()
      if (estado.aceptado?.version !== VERSION_TEXTOS) return Response.json({ error: 'Falta aceptar el aviso de privacidad, los términos y la licencia.' }, { status: 409, headers: NOCACHE })
      // La conversación de bienvenida nace una sola vez; si ya existe, se reabre.
      let sesion = estado.sesionBienvenida
      if (!sesion) {
        sesion = randomUUID()
        const db = createServiceClient()
        const ahora = new Date().toISOString()
        const s = await db.from('chat_sessions').insert({ id: sesion, title: 'Bienvenida', profile_id: LOCAL_DESKTOP_USER_ID, account: null, last_message_at: ahora, is_favorite: false, archived_at: null })
        if (s.error) throw new Error(s.error.message)
        const m = await db.from('chat_messages').insert({ session_id: sesion, role: 'assistant', content: mensajeBienvenida(estado.nombre, { computerUse: computerUseDisponible(true, plataformaServidor(process.env, process.platform)), servidor: process.env.ARBRAIN_SERVIDOR_NUBE === '1' }), created_at: ahora, metadata: { source: FUENTE_BIENVENIDA } })
        if (m.error) throw new Error(m.error.message)
      }
      return Response.json({ estado: guardarPrimerArranque({ completado: new Date().toISOString(), sesionBienvenida: sesion }), sesion }, { headers: NOCACHE })
    }
    return Response.json({ error: 'Acción desconocida.' }, { status: 400, headers: NOCACHE })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No pude guardar.' }, { status: 503, headers: NOCACHE })
  }
}
