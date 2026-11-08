import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ownerIds, registrar } from '@/features/avisos/server'
import { esEdicionCliente } from '@/lib/edicion'

export const dynamic = 'force-dynamic'

/**
 * El sincronizador autónomo (shared/components/SyncAutonomo.tsx, 4 nov 2026) anota aquí lo que hizo solo. Todo va a la
 * bitácora de Levy, nunca a la campana; la única excepción es una falla que no se resolvió en N intentos («irresoluble»):
 * esa queda UNA vez en la campana, sin sonar (clave `sync:<id>`: si ya existe, no se repite).
 */
const EVENTOS = new Set(['conflicto_resuelto', 'fallas', 'espejo', 'error', 'irresoluble'])

export async function POST(request: Request) {
  if (esEdicionCliente()) return NextResponse.json({ ok: false }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { evento?: unknown; titulo?: unknown; detalle?: unknown; id?: unknown }
  const evento = typeof body.evento === 'string' && EVENTOS.has(body.evento) ? body.evento : null
  const titulo = typeof body.titulo === 'string' ? body.titulo.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  if (!evento || !titulo) return NextResponse.json({ error: 'evento y titulo requeridos' }, { status: 400 })
  const detalle = typeof body.detalle === 'string' ? body.detalle.slice(0, 1000) : null
  const id = typeof body.id === 'string' ? body.id.slice(0, 120) : null
  const service = createServiceClient()

  if (evento !== 'irresoluble') {
    const ok = await registrar(service, { kind: 'sistema', entrega: 'bitacora', source: 'sync-autonomo' }, { title: titulo, body: detalle }, [])
    return NextResponse.json({ ok, entrega: 'bitacora' })
  }

  const clave = `sync:${id ?? titulo}`
  const { data: ya } = await service.from('avisos').select('id').eq('clave', clave).limit(1)
  if (ya?.length) return NextResponse.json({ ok: true, entrega: 'campana', repetido: true })
  const destino = await ownerIds(service)
  const ok = await registrar(service, { kind: 'alerta', entrega: 'campana', source: 'sync-autonomo' }, { title: titulo, body: detalle, url: '/settings?seccion=mac', clave }, destino.length ? destino : [user.id])
  // Que también quede en la bitácora: Levy ve la historia completa en un solo lugar.
  await registrar(service, { kind: 'sistema', entrega: 'bitacora', source: 'sync-autonomo' }, { title: `Subió a la campana: ${titulo}`, body: detalle }, [])
  return NextResponse.json({ ok, entrega: 'campana' })
}
