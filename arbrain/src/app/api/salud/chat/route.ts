import { timingSafeEqual } from 'node:crypto'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { createServiceClient } from '@/lib/supabase/service'
import { isLocalHostname } from '@/lib/desktop-auth'
import { sondearChat, versionPublica, type SaludChat } from '@/lib/salud-chat'

// Salud real del chat (7 oct 2026): la consultan la app de escritorio (¿uso el servidor del Studio?) y el vigilante
// com.levy.arbrain-web-vigia (¿reinicio el web?). Detalle en `arbrain/src/lib/salud-chat.ts`.
//
// Sin sesión a propósito: la app de escritorio la pide desde Rust, sin cookie. Pasa por el proxy (las rutas /api sin
// cookie siguen de largo), así que también lo ejercita. Como el web sale por el Funnel, sin credencial solo devuelve
// semáforos y tiempos; los mensajes de error y el destino exigen el bearer del gateway y llegar por 127.0.0.1.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

function conDetalle(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  const dado = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '')
  const esperado = Buffer.from(CLAUDECLAW_TOKEN)
  if (!esperado.length || dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return false
  try { return isLocalHostname(new URL(request.url).hostname) } catch { return false }
}

// Simulacro del cuelgue, solo si quien arranca el servidor lo pide (nunca en producción):
//   ARBRAIN_SALUD_PRUEBA=cuelgue → la ruta no contesta nunca (lo que pasó el 7 oct).
//   ARBRAIN_SALUD_PRUEBA=url     → la URL del daemon no se resuelve; la sonda debe contestar 503 en plazo.
const nunca = () => new Promise<never>(() => {})

export async function GET(request: Request) {
  const prueba = process.env.ARBRAIN_SALUD_PRUEBA
  if (prueba === 'cuelgue') await nunca()

  const salud: SaludChat = await sondearChat({
    resolverUrl: prueba === 'url' ? nunca : getClaudeclawUrl,
    consultarSupabase: async signal => {
      const { error } = await createServiceClient().from('chat_messages').select('id').limit(1).abortSignal(signal)
      if (error) throw new Error(error.message)
    },
    consultarDaemon: async (url, signal) => {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json().catch(() => null) as { ok?: boolean } | null
      if (body?.ok !== true) throw new Error('el daemon no dijo ok')
    },
  })
  const cuerpo = conDetalle(request) ? salud : versionPublica(salud)
  return Response.json(cuerpo, { status: salud.ok ? 200 : 503, headers: noStore })
}
