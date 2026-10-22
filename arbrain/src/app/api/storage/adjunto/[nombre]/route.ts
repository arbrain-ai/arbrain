import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esEdicionCliente } from '@/lib/edicion'
import { leerAdjuntoLocal } from '@/lib/adjuntos-locales'

// Sirve un adjunto del chat guardado en la carpeta de datos de la edición cliente (v0.2.6, lib/adjuntos-locales.ts).
// Solo con sesión, solo por nombre exacto generado por el servidor, con el MIME de nuestra lista y sin ejecutar nada:
// nosniff, CSP que niega todo y sandbox. En la instalación original no existe (sus adjuntos viven en Storage).

export const runtime = 'nodejs'

const fallo = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nombre: string }> }) {
  if (!esEdicionCliente()) return fallo(404, 'No disponible en esta edición')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fallo(401, 'Unauthorized')

  const { nombre } = await params
  const adjunto = leerAdjuntoLocal(nombre)
  if (!adjunto) return fallo(404, 'no existe')
  const inline = adjunto.tipo.startsWith('image/') || adjunto.tipo === 'application/pdf' || adjunto.tipo.startsWith('text/')
  return new NextResponse(new Uint8Array(adjunto.bytes), {
    headers: {
      'Content-Type': adjunto.tipo.startsWith('text/') ? `${adjunto.tipo}; charset=utf-8` : adjunto.tipo,
      'Content-Length': String(adjunto.bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nombre}"`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // El visor de PDF del navegador no abre bajo `sandbox`; el resto sí lo lleva.
      'Content-Security-Policy': `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'${adjunto.tipo === 'application/pdf' ? '' : '; sandbox'}`,
    },
  })
}
