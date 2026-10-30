import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Qué llaves ve el daemon (`/health` › llaves): confirma que tomó la llave después de que la app lo reinició.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/health', { plazoMs: 3_000 })
}
