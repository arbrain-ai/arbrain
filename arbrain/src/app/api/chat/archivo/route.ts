import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { ErrorArchivo, resolverArchivoChat, seVe, urlArchivoFirmado } from '@/lib/archivos-chat-server'
import type { ArchivoFirmado } from '@/lib/archivos-chat'

// Archivos que Levy genera, abiertos desde el chat (29 oct 2026, T6): con la sesión de siempre, valida la ruta contra el
// cerebro y las carpetas abiertas y devuelve un enlace firmado a ESE archivo (lib/archivos-chat-server.ts). El enlace se
// abre sin cookie: en el navegador del sistema (app de escritorio) y en Safari (app del teléfono).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    const principal = await requireChatPrincipal()
    if (!principal.owner) return Response.json({ error: 'Solo la dueña o el dueño de este cerebro abre sus archivos.' }, { status: 403, headers: NO_CACHE })
    const ruta = new URL(request.url).searchParams.get('ruta') ?? ''
    const a = await resolverArchivoChat(ruta)
    const cuerpo: ArchivoFirmado = { url: urlArchivoFirmado(a.real), nombre: a.nombre, ver: seVe(a.nombre), bytes: a.bytes }
    return Response.json(cuerpo, { headers: NO_CACHE })
  } catch (error) {
    if (error instanceof ErrorArchivo || error instanceof ChatAccessError) return Response.json({ error: error.message }, { status: error.status, headers: NO_CACHE })
    return Response.json({ error: 'No se pudo preparar el archivo.' }, { status: 500, headers: NO_CACHE })
  }
}
