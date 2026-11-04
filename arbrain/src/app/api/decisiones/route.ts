import { aLaBandeja } from '@/features/decisiones/server'

// Bandeja de decisiones (autonomía v2, 3 nov 2026): GET la vista (tarjetas, decididas hoy, espera, «Lo que hice solo» y
// la política); POST { accion } = resolver {id, respuesta, comentario} · lote {ids, respuesta} · politica {preset, ajustes}
// · deshacer {ts, dia}. Decidir, cambiar la política y deshacer son de la persona: llevan el secreto de la web.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return aLaBandeja(request, '/decisiones')
}

const RUTA: Record<string, string> = { resolver: '/decisiones/resolver', lote: '/decisiones/lote', politica: '/autonomia/politica', deshacer: '/autonomia/deshacer' }

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => ({})) as Record<string, unknown>
  const ruta = RUTA[String(cuerpo.accion ?? '')]
  if (!ruta) return Response.json({ error: 'accion: resolver, lote, politica o deshacer' }, { status: 400 })
  const { accion: _a, ...resto } = cuerpo
  return aLaBandeja(request, ruta, { metodo: 'POST', cuerpo: resto, decidir: true })
}
