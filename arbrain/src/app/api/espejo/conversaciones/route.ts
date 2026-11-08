/**
 * Ajustes › Máquinas (5 nov 2026): ¿tus conversaciones están en tus dos máquinas? Solo lectura. Con el espejo apagado
 * responde `{ activo: false }` y Ajustes no muestra nada (el modo no se ve en el chat).
 */
import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { estadoConversaciones } from '@/lib/espejo-conversaciones'
import { maquinasConDiario } from '@/lib/espejo-conversaciones/diario'
import { maquinaEnEspejo } from '@/lib/espejo-conversaciones/pulso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const no = await soloAppCliente(request)
  if (no) return no
  const estado = estadoConversaciones()
  const m = maquinaEnEspejo()
  return Response.json({ ...estado, maquinas: m ? maquinasConDiario(m.cerebro) : [] }, { headers: NOCACHE })
}
