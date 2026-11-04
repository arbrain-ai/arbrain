import { homedir } from 'node:os'
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { onboardingV2Encendido } from '@/features/primer-arranque/v2/interruptor'
import { hallazgosLocales } from '@/features/primer-arranque/v2/negocio-local'

// «Trae tu negocio» del onboarding v2 (vista previa, 3 nov 2026): cuántas conversaciones y qué carpetas recientes hay.
// Solo cifras y nombres de carpeta, nunca contenido. Apagado el interruptor, 404; sin la sesión de la app, 401.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!onboardingV2Encendido()) return new Response(null, { status: 404 })
  if (!(await isDesktopAuthBypassFromHeaders())) return Response.json({ error: 'Solo desde la app.' }, { status: 401 })
  return Response.json(hallazgosLocales(process.env, homedir()), { headers: { 'Cache-Control': 'no-store' } })
}
