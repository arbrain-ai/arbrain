/**
 * Llamadas de la web a SU daemon en la edición cliente (empaquetado, 11 oct 2026; CONTRATO-DAEMON.md).
 * Solo servidor. El token del daemon y el de confirmar viven en el entorno de Next (los pasa la app); el navegador
 * nunca los ve.
 */
import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { esEdicionCliente } from '@/lib/edicion'
import { checkMutationOrigin } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { urlDaemonCliente } from '@/lib/claudeclaw'

export const NOCACHE = { 'Cache-Control': 'no-store' }

/** Rutas solo de la edición cliente y solo para la app (cookie del secreto por instalación). */
export async function soloAppCliente(request?: Request, mutacion = false): Promise<Response | null> {
  if (!esEdicionCliente()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NOCACHE })
  if (!(await isDesktopAuthBypassFromHeaders())) return Response.json({ error: 'Abre Arbrain desde la app.' }, { status: 401, headers: NOCACHE })
  if (mutacion && request) {
    try { checkMutationOrigin(request) } catch (e) { return Response.json({ error: e instanceof ChatAccessError ? e.message : 'Origen no autorizado.' }, { status: 403, headers: NOCACHE }) }
  }
  return null
}

export function tokenDaemon(): string {
  return (process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.ARBRAIN_DAEMON_TOKEN ?? '').trim()
}

/** Secreto que solo conoce la app (no el modelo): autoriza confirmar acciones y dar consentimiento. */
export function tokenConfirmar(): string {
  return (process.env.ARBRAIN_TOKEN_CONFIRMAR ?? '').trim()
}

export async function alDaemon(ruta: string, init: RequestInit & { confirmar?: boolean; plazoMs?: number } = {}): Promise<Response> {
  const token = tokenDaemon()
  if (!token) return Response.json({ error: 'La app no le pasó a la web la llave de su servidor local. Cierra y abre Arbrain.' }, { status: 503, headers: NOCACHE })
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (init.confirmar) {
    const c = tokenConfirmar()
    if (!c) return Response.json({ error: 'Esta copia de Arbrain no puede aprobar acciones (falta el secreto de la app).' }, { status: 503, headers: NOCACHE })
    headers.set('X-Arbrain-Confirmar', c)
  }
  // Una lectura que cae por la red ANTES de recibir respuesta (en Windows, el socket keep-alive que el daemon ya cerró)
  // se repite una vez: en la CI de Windows de la 0.2.16 ese «fetch failed» salía tras unos segundos sin peticiones.
  // Solo GET/HEAD: lo que escribe nunca se repite solo.
  const lectura = ['GET', 'HEAD'].includes(String(init.method ?? 'GET').toUpperCase())
  const pedir = () => fetch(`${urlDaemonCliente()}${ruta}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(init.plazoMs ?? 8_000) })
  try {
    const r = await pedir().catch((e: unknown) => {
      if (lectura && e instanceof TypeError && /fetch failed/.test(e.message)) return pedir()
      throw e
    })
    const texto = await r.text()
    return new Response(texto || '{}', { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/json', ...NOCACHE } })
  } catch {
    return Response.json({ error: 'Tu Arbrain local no responde. Si acabas de cambiar una llave, espera unos segundos.', code: 'sin_daemon' }, { status: 502, headers: NOCACHE })
  }
}
