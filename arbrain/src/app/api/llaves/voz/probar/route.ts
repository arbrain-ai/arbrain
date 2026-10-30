import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// «Probar» de Ajustes › Voz (21 oct 2026): el daemon prueba la llave de Groq que le entregó la app. La llave nunca pasa
// por aquí: vive en el llavero y solo la recibe el daemon.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  return alDaemon('/voz/probar', { method: 'POST', plazoMs: 15_000 })
}
