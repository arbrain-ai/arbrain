// Mi marca (lib/mi-marca.ts): `mi-marca/tema.css` del dueño, leído en cada carga. El layout lo enlaza después de
// globals.css, así que sus variables pisan las del autor sin recompilar. Sin archivo, una hoja vacía (nunca 404).
import { dirMiMarca, leerTema } from '@/lib/mi-marca'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const tema = await leerTema(dirMiMarca())
  return new Response(tema || '/* Sin mi-marca/tema.css: colores del autor. */\n', {
    headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  })
}
