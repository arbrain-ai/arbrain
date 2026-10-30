import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { rutaDaemon } from '@/lib/rutinas-cliente'

// Una rutina del alumno (T8, 29 oct 2026):
//   POST {accion: pausar | reanudar | probar}   «probar» la corre ahora, por el mismo camino que las programadas
//   DELETE                                       la borra (la pestaña pide confirmación antes)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const { accion } = await request.json().catch(() => ({})) as { accion?: unknown }
  const ruta = rutaDaemon((await ctx.params).id, accion === 'borrar' ? null : accion)
  if (!ruta) return Response.json({ error: 'Acción no permitida.' }, { status: 400, headers: NOCACHE })
  return alDaemon(ruta, { method: 'POST', body: '{}' })
}

export async function DELETE(request: Request, ctx: Ctx) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const ruta = rutaDaemon((await ctx.params).id, 'borrar')
  if (!ruta) return Response.json({ error: 'Esa rutina no existe.' }, { status: 400, headers: NOCACHE })
  return alDaemon(ruta, { method: 'DELETE' })
}
