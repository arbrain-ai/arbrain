/**
 * Canvas v4 — resolver el medio de un nodo con nervio (14 oct 2026, model/nervio.ts).
 *
 * GET ?src=<candidato>&src=<candidato>… → MedioResuelto. El primero que exista gana: `env:HT_VSL2_URL` (si está
 * definida y es https), `medio:vsl2/*\/vsl2.mp4` (el corte más reciente del pipeline), `medio:arbrain-medios/…`.
 * Solo dice DÓNDE está y cuánto dura; los bytes los sirve `./flujo` con Range.
 */
import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { resolverMedio } from '@/lib/canvas/nervio-medios'
import { sondear } from '@/lib/cabina/documento-server'
import { esEdicionCliente } from '@/lib/edicion'

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401, headers: NO_CACHE })
  if (esEdicionCliente()) return NextResponse.json({ ok: false, error: 'Los medios del Studio no existen en esta edición.' }, { status: 404, headers: NO_CACHE })
  const src = new URL(request.url).searchParams.getAll('src').slice(0, 6)
  if (!src.length) return NextResponse.json({ ok: false, error: 'falta src' }, { status: 400, headers: NO_CACHE })
  const r = await resolverMedio(src, { sondear })
  return NextResponse.json(r, { headers: NO_CACHE })
}
