// El panel de una extensión instalada: la URL firmada que abre SOLO su carpeta `panel/` (vista aislada, SPEC §2), su título
// y sus acciones. La firma dura entre 6 y 12 h y es la misma en cada relectura (no recarga el iframe).
import { NOCACHE } from '@/lib/daemon-local'
import { alDaemonExt, soloDueno } from '@/lib/extensiones/servidor'
import { firmar } from '@/lib/cabina/documento-server'
import { alcancePanel, urlPanel } from '@/features/extensiones/crudo'
import { esNombreExtension, leerManifiesto } from '@/features/extensiones/modelo'
import { tr } from '@/shared/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const no = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: NOCACHE })

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sin = await soloDueno()
  if (sin) return sin
  if (!esNombreExtension(id)) return no(404, tr('No existe.'))
  const r = await alDaemonExt('/extensiones')
  if (!r.ok) return r
  const estado = await r.json() as { extensiones?: Array<{ id: string; instalada: unknown; manifiesto: unknown }> }
  const e = estado.extensiones?.find(x => x.id === id)
  if (!e?.instalada) return no(404, tr('Esa extensión no está instalada.'))
  const m = leerManifiesto(e.manifiesto)
  if (!m?.panel) return no(404, tr('Esa extensión no trae panel.'))
  if (!m.panel.entrada.startsWith('panel/')) return no(422, tr('El panel de una extensión vive en su carpeta panel/.'))
  return Response.json({
    ok: true, id, titulo: m.panel.titulo, acciones: m.panel.acciones, datos: m.panel.datos,
    url: urlPanel(firmar(alcancePanel(id)), id, m.panel.entrada.slice('panel/'.length)),
  }, { headers: NOCACHE })
}
