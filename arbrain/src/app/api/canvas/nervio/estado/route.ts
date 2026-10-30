/**
 * Canvas v4 — el estado vivo de los nodos con nervio (14 oct 2026, model/nervio.ts).
 *
 * POST { fuentes: FuenteEstado[] } → { ok, estados: { [claveFuente]: EstadoVivo } }. En lote y con caché del lado
 * del servidor (lib/canvas/nervio-estado.ts): el lienzo pide como mucho cada minuto y solo con la pestaña a la vista.
 */
import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { claveFuente, fuenteValida, type EstadoVivo } from '@/features/canvas/model/nervio'
import { medirFuente } from '@/lib/canvas/nervio-estado'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  if (!await authenticateDraw3(request)) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401, headers: NO_CACHE })
  const body = await request.json().catch(() => null) as { fuentes?: unknown[] } | null
  const fuentes = (Array.isArray(body?.fuentes) ? body!.fuentes : []).slice(0, 40).map(fuenteValida).filter(f => !!f)
  const opciones = { hosts: instalacion().dominiosPropios, launchd: process.platform === 'darwin' && !esEdicionCliente() }
  const estados: Record<string, EstadoVivo> = {}
  await Promise.all(fuentes.map(async f => { estados[claveFuente(f)] = await medirFuente(f, opciones) }))
  return NextResponse.json({ ok: true, estados }, { headers: NO_CACHE })
}
