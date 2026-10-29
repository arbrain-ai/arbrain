// Mi marca (lib/mi-marca.ts): `mi-marca/logo.svg|png|webp` del dueño. Un SVG puede traer scripts: se sirve con una CSP
// que no deja correr nada y en caja de arena, por si alguien lo abre directo.
import { dirMiMarca, leerLogo } from '@/lib/mi-marca'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const logo = await leerLogo(dirMiMarca())
  if (!logo) return Response.json({ error: 'Sin logo en mi-marca/.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(new Uint8Array(logo.buf), {
    headers: {
      'Content-Type': logo.tipo,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
