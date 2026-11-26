// Extensiones: POST instalar | actualizar | quitar | llaves (el dueño, desde la app; instalar corre `claude plugin` y puede
// tardar) y GET fuente?f=ext:… (lo que pide el panel; solo lo declarado en su arbrain.json, lo demás `negado`).
import { NOCACHE } from '@/lib/daemon-local'
import { alDaemonExt, soloDueno } from '@/lib/extensiones/servidor'
import { esNombreExtension, FORMA_FUENTE_EXT } from '@/features/extensiones/modelo'
import { tr } from '@/shared/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MUTACIONES = new Set(['instalar', 'actualizar', 'quitar', 'llaves'])
type Ctx = { params: Promise<{ id: string; accion: string }> }
const no = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: NOCACHE })

export async function GET(request: Request, { params }: Ctx) {
  const { id, accion } = await params
  const sin = await soloDueno()
  if (sin) return sin
  if (!esNombreExtension(id) || accion !== 'fuente') return no(404, tr('No existe.'))
  const f = new URL(request.url).searchParams.get('f') ?? ''
  // Forma inválida: negado sin preguntarle al daemon (nunca un error que el panel confunda con «sin dato»).
  if (!FORMA_FUENTE_EXT.test(f)) return Response.json({ estado: 'negado', valor: null, fecha: null }, { headers: NOCACHE })
  return alDaemonExt(`/extensiones/${id}/fuente?f=${encodeURIComponent(f)}`)
}

export async function POST(request: Request, { params }: Ctx) {
  const { id, accion } = await params
  const sin = await soloDueno(request, true)
  if (sin) return sin
  if (!esNombreExtension(id) || !MUTACIONES.has(accion)) return no(404, tr('No existe.'))
  const cuerpo = await request.json().catch(() => ({})) as Record<string, unknown>
  // Solo lo que el daemon entiende: el «Sí» del dueño y las llaves. Nada más viaja.
  const limpio = { ...(cuerpo.consentimiento === true ? { consentimiento: true } : {}), ...(cuerpo.llaves && typeof cuerpo.llaves === 'object' && !Array.isArray(cuerpo.llaves) ? { llaves: cuerpo.llaves } : {}) }
  return alDaemonExt(`/extensiones/${id}/${accion}`, { method: 'POST', body: JSON.stringify(limpio), plazoMs: 200_000 })
}
