import { servirDescarga } from '@/lib/cabina/descarga-documento'
import { estadoDirecto } from '@/lib/modo-directo/servidor'

// «Descargar» del visor (12 nov 2026): el archivo ORIGINAL como adjunto, en flujo y con Range, por su enlace firmado. La
// lógica y las validaciones viven en lib/cabina/descarga-documento.ts (probadas en tests/cabina/descarga-documento.test.ts).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string; nombre: string }> }) {
  const { token, nombre } = await params
  return servirDescarga({ token, nombre, rango: request.headers.get('range'), directoPrendido: async () => (await estadoDirecto()).prendido })
}
