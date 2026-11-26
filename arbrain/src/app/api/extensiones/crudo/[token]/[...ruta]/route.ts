// Los archivos del panel de una extensión, aislados (21 nov 2026, SPEC §2). Sin cookie (el iframe tiene origen opaco): la
// firma dice de qué extensión y hasta cuándo. Solo de su carpeta `panel/` instalada (lo valida otra vez el daemon, con
// disco y sin enlaces que escapen). HTML con la CSP de las vistas: `sandbox allow-scripts`, sin red, sin WebRTC.
import { verificar } from '@/lib/cabina/documento-server'
import { bytesDelDaemon } from '@/lib/extensiones/servidor'
import { CSP_PANEL, rutaPedida } from '@/features/extensiones/crudo'
import { blindarSrcDoc } from '@/features/chat/lib/html-blindado'
import { tr } from '@/shared/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const no = (status: number, msg: string) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(_: Request, { params }: { params: Promise<{ token: string; ruta: string[] }> }) {
  const { token, ruta } = await params
  const pedida = rutaPedida(verificar(token), ruta)
  if (!pedida) return no(403, tr('Enlace vencido: vuelve a abrir el panel.'))
  const r = await bytesDelDaemon(`/extensiones/${pedida.id}/panel/${pedida.ruta.split('/').map(encodeURIComponent).join('/')}`)
  if (!r) return no(502, tr('Tu Arbrain local no responde.'))
  if (r.status !== 200) return no(r.status === 404 ? 404 : 502, tr('No existe.'))
  const headers: Record<string, string> = { 'Content-Type': r.tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
  if (/^text\/html|^image\/svg/.test(r.tipo)) {
    headers['Content-Security-Policy'] = CSP_PANEL
    if (r.tipo.startsWith('text/html')) {
      const cuerpo = blindarSrcDoc(new TextDecoder().decode(r.bytes))
      return new Response(cuerpo, { headers: { ...headers, 'Content-Length': String(Buffer.byteLength(cuerpo)) } })
    }
  }
  return new Response(Buffer.from(r.bytes), { headers: { ...headers, 'Content-Length': String(r.bytes.byteLength) } })
}
