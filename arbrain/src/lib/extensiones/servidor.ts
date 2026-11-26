import 'server-only'
/**
 * Extensiones · la web habla con SU daemon (21 nov 2026, fase 2 del SPEC docs/builds/extensiones-2026-11-20).
 *
 * La tienda, las tareas y los archivos de los paneles viven en el daemon (`server/src/extensiones/tienda.ts`): es quien
 * sabe la carpeta de Claude Code del dueño y es dueño del scheduler. La web solo autentica (el dueño, desde la app) y
 * reenvía. Edición cliente: el daemon local de la app (`alDaemon`). Instalación original: el daemon del scheduler.
 */
import { alDaemon, NOCACHE, tokenDaemon } from '@/lib/daemon-local'
import { CLAUDECLAW_TOKEN, getSchedulerUrl, urlDaemonCliente } from '@/lib/claudeclaw'
import { esEdicionCliente } from '@/lib/edicion'
import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { checkMutationOrigin } from '@/lib/planning/server'
import { tr } from '@/shared/i18n'

/** Solo el dueño (y, al escribir, desde el origen de la app). null = pasa. */
export async function soloDueno(request?: Request, mutacion = false): Promise<Response | null> {
  try {
    const p = await requireChatPrincipal()
    if (!p.owner) throw new ChatAccessError(tr('Solo el dueño administra las extensiones.'), 403)
    if (mutacion && request) checkMutationOrigin(request)
    return null
  } catch (e) {
    const status = e instanceof ChatAccessError ? e.status : 401
    return Response.json({ ok: false, error: e instanceof Error ? e.message : tr('No autorizado.') }, { status, headers: NOCACHE })
  }
}

async function destino(): Promise<{ url: string; token: string }> {
  if (esEdicionCliente()) return { url: urlDaemonCliente(), token: tokenDaemon() }
  return { url: await getSchedulerUrl(), token: CLAUDECLAW_TOKEN }
}

/** JSON del daemon tal cual (con su estado HTTP). Instalar llama al CLI: plazo largo. */
export async function alDaemonExt(ruta: string, init: RequestInit & { plazoMs?: number } = {}): Promise<Response> {
  if (esEdicionCliente()) return alDaemon(ruta, { ...init, plazoMs: init.plazoMs ?? 8_000 })
  const { url, token } = await destino()
  if (!token) return Response.json({ ok: false, error: tr('Falta la llave del servidor local (OPENCLAW_GATEWAY_TOKEN).') }, { status: 503, headers: NOCACHE })
  try {
    const r = await fetch(`${url}${ruta}`, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(init.plazoMs ?? 8_000),
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    const texto = await r.text()
    const json = (() => { try { return JSON.parse(texto) as unknown } catch { return null } })()
    if (json === null) return Response.json({ ok: false, error: tr('Tu servidor de Arbrain respondió algo que no se esperaba (¿aún no tiene la versión con extensiones?).') }, { status: 502, headers: NOCACHE })
    return Response.json(json, { status: r.status, headers: NOCACHE })
  } catch {
    return Response.json({ ok: false, error: tr('Tu Arbrain local no responde. Si acabas de cambiar una llave, espera unos segundos.'), code: 'sin_daemon' }, { status: 502, headers: NOCACHE })
  }
}

/** Un archivo del panel (bytes): `alDaemon` lee texto y rompería una imagen. */
export async function bytesDelDaemon(ruta: string): Promise<{ status: number; bytes: Uint8Array; tipo: string } | null> {
  const { url, token } = await destino()
  if (!token) return null
  try {
    const r = await fetch(`${url}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get('content-type') ?? 'application/octet-stream' }
  } catch { return null }
}
