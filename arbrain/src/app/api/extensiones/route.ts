// Extensiones (21 nov 2026, fase 2 del SPEC docs/builds/extensiones-2026-11-20): la tienda. GET = catálogo, lo instalado,
// requisitos, llaves (si están, nunca su valor) y tareas. Lo resuelve el daemon (server/src/extensiones/tienda.ts).
import { alDaemonExt, soloDueno } from '@/lib/extensiones/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloDueno()
  if (no) return no
  return alDaemonExt('/extensiones')
}
