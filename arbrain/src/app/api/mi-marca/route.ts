// Mi marca (lib/mi-marca.ts): nombre y logo del dueño para la ventana. Sin datos sensibles: pasa sin sesión para que
// también la pantalla de entrada lleve su marca.
import { dirMiMarca, leerMiMarca } from '@/lib/mi-marca'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return Response.json(await leerMiMarca(dirMiMarca()), { headers: { 'Cache-Control': 'no-store' } })
}
