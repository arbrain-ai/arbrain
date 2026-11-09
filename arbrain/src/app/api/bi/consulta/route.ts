import { planningError, planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { estadoDirecto } from '@/lib/modo-directo/servidor'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { consultaEn, esDinero, esVentana } from '@/features/bi/catalogo'
import { catalogoVigente, ejecutar, raizCerebro } from '@/features/bi/servidor'

// Business Intelligence (7 nov 2026): corre UNA consulta del catálogo vigente (el del autor o el genérico conectado a las
// fuentes del dueño; features/bi/servidor.ts) con su ventana. Nada fuera del catálogo se ejecuta. En modo directo (solo en
// la instalación del autor), lo que es dinero no se lee (423). Una consulta genérica sin fuente responde 409 con lo que la
// conectaría: el panel lo dice como «conecta tu fuente», no como falla.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NOCACHE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!panelNegocioEncendido()) return Response.json({ ok: false, error: 'Business Intelligence está apagado en esta instalación.' }, { status: 404, headers: NOCACHE })
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const id = q.get('id') ?? '', ventana = Number(q.get('ventana'))
    const raiz = raizCerebro()
    const c = consultaEn((await catalogoVigente(raiz)).catalogo, id)
    if (!c || !esVentana(ventana) || !c.ventanas.includes(ventana)) return Response.json({ ok: false, error: 'Consulta fuera del catálogo.' }, { status: 400, headers: NOCACHE })
    if (c.conectada === false) return Response.json({ ok: false, error: `Conecta tu fuente: ${c.falta ?? 'esta consulta todavía no tiene de dónde leer.'}`, sinFuente: true }, { status: 409, headers: NOCACHE })
    if (esDinero(c) && !esEdicionCliente() && (await estadoDirecto()).prendido) return Response.json({ ok: false, error: 'Oculto en directo.' }, { status: 423, headers: NOCACHE })
    return Response.json(await ejecutar(id, ventana, raiz), { headers: NOCACHE })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) return Response.json({ ok: false, error: error.message }, { status: 503, headers: NOCACHE })
    return planningError(error)
  }
}
