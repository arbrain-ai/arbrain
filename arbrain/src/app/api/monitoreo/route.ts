import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Monitoreo de cohorte (CONTRATO-DAEMON.md §7): estado del consentimiento y «qué se enviaría» (vista previa exacta).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/cohorte', { plazoMs: 5_000 })
}
