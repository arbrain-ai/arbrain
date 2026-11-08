import { planningError, planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { estadoDirecto } from '@/lib/modo-directo/servidor'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { consultaDe, esVentana } from '@/features/bi/catalogo'
import { ejecutar, ayer, raizCerebro } from '@/features/bi/servidor'
import { datosSimulados, type Escenario } from '@/features/bi/simulado'

// Business Intelligence (7 nov 2026): corre UNA consulta del catálogo (features/bi/catalogo.ts) con su ventana. Nada fuera
// del catálogo se ejecuta. En modo directo, lo que es dinero no se lee (423). ARBRAIN_BI_SIMULADO=calma|alarma (solo fuera
// de producción) responde con datos simulados para capturas y video; la respuesta lo dice (`simulado: true`).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NOCACHE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!panelNegocioEncendido() || esEdicionCliente()) return Response.json({ ok: false, error: 'Business Intelligence está apagado en esta instalación.' }, { status: 404, headers: NOCACHE })
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const id = q.get('id') ?? '', ventana = Number(q.get('ventana'))
    const c = consultaDe(id)
    if (!c || !esVentana(ventana) || !c.ventanas.includes(ventana)) return Response.json({ ok: false, error: 'Consulta fuera del catálogo.' }, { status: 400, headers: NOCACHE })
    if (c.unidad === 'usd' && (await estadoDirecto()).prendido) return Response.json({ ok: false, error: 'Oculto en directo.' }, { status: 423, headers: NOCACHE })
    const sim = process.env.NODE_ENV !== 'production' ? process.env.ARBRAIN_BI_SIMULADO : undefined
    if (sim) {
      const datos = datosSimulados(id, ventana, ayer(), sim === 'alarma' ? 'alarma' : 'calma' satisfies Escenario)
      return Response.json({ ok: true, consulta: id, ventana, datos, hasta: ayer(), leidoEn: new Date().toISOString(), simulado: true }, { headers: NOCACHE })
    }
    return Response.json(await ejecutar(id, ventana, raizCerebro()), { headers: NOCACHE })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) return Response.json({ ok: false, error: error.message }, { status: 503, headers: NOCACHE })
    return planningError(error)
  }
}
