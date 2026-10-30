import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { estadoSandbox } from '@/features/permisos/lib/sandbox-server'

// Confirmaciones humanas pendientes del freno (AUDITORIA I8; CONTRATO-DAEMON.md v3 §6). La web las pinta como diálogo.
// Se agrega `sandbox` (v3 §6.1): sin sandbox (Windows, Linux sin bubblewrap) todo comando de terminal pide clic y el
// diálogo lo explica.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  const r = await alDaemon('/confirmaciones', { plazoMs: 3_000 })
  if (!r.ok) return r
  const j = await r.json().catch(() => null) as { pendientes?: unknown; terminadas?: unknown } | null
  // `terminadas` (ronda 3): «Córrelo tú» recién terminado, para que su tarjeta quede en «Listo».
  return Response.json({ pendientes: Array.isArray(j?.pendientes) ? j.pendientes : [], terminadas: Array.isArray(j?.terminadas) ? j.terminadas : [], sandbox: estadoSandbox() }, { headers: NOCACHE })
}
