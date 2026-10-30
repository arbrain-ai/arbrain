import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Tope de gasto (seguridad del alumno, 12 oct 2026): lo que OpenRouter deja ver de la llave (GET /api/v1/key) y los
// enlaces para poner el límite. La llave nunca pasa por aquí: la consulta la hace el daemon.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/gasto', { plazoMs: 12_000 })
}
