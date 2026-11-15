/**
 * «Descargar» en la vista documento (12 nov 2026, Daniel viendo un video de 700 MB en el visor: «me dejas un botón para
 * "download" por si lo veo en la laptop o teléfono, poderlo bajar al Finder y así lo descargo y luego lo miro desde el gym»).
 *
 * Dos pasos, como los archivos del chat (archivos-chat-server.ts):
 *   1. `/api/cabina/documento?ruta=…` (con la sesión de siempre: `planningOwner`) valida el archivo y trae `descarga`, un
 *      enlace firmado a ESE archivo y a ningún otro.
 *   2. `/api/cabina/documento/descargar/<token>/<nombre>` lo manda como adjunto, en flujo y con `Range`. Sin cookie a propósito:
 *      la app de escritorio lo abre en el navegador del sistema (WKWebView de Tauri cancela las descargas) y la PWA del
 *      teléfono puede pasarlo a Safari; ninguno de los dos lleva la sesión. La firma (HMAC con el secreto de la vista
 *      documento, con prefijo propio: un token de `crudo` o del chat no vale aquí, ni al revés) dice qué archivo y hasta
 *      cuándo.
 *
 * Al servir se vuelve a validar TODO con la misma función que pinta el visor (`resolverEnDisco`: raíces permitidas, `..`,
 * carpetas de credenciales, nombres de llaves, enlaces simbólicos que salen), más los tipos que el visor enseña (nunca código,
 * carpetas ni formatos que no pinta) y el modo directo. Sin `server-only` para que las pruebas lo importen; solo lo usa la ruta.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Raices, TipoDocumento } from '@/features/cabina/documento/ruta'
import { cabecerasArchivo } from '@/lib/archivos-chat-server'
import { flujoArchivo, rangoPedido } from '@/lib/flujo-archivo'
import { rutaSensibleDirecto } from '@/lib/modo-directo/reglas'
import { secretoDeFirma } from '@/lib/secreto-firma'
import { ErrorDocumento, raices, resolverEnDisco } from './documento-disco'
import { tr } from '@/shared/i18n'

/** Lo que el visor pinta y por tanto se puede bajar. Código, carpetas y formatos desconocidos, no. */
export const DESCARGABLES: ReadonlySet<TipoDocumento> = new Set(['md', 'txt', 'html', 'mermaid', 'imagen', 'video', 'audio', 'pdf', 'docx', 'xlsx', 'csv'])
export const esDescargable = (t: TipoDocumento) => DESCARGABLES.has(t)

// ── Firma ──
const PREFIJO = 'documento-descarga:'
const TRAMO_MS = 6 * 3600_000
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const hmac = (cuerpo: string) => b64(createHmac('sha256', secretoDeFirma()).update(cuerpo).digest()).slice(0, 43)

/** Caduca por tramos de 6 h (vive de 6 a 12 h), como `crudo`: el visor relee cada 3 s y así el enlace no cambia en cada lectura. */
export function firmarDescarga(real: string, ahora = Date.now()): string {
  const cuerpo = b64(JSON.stringify({ d: PREFIJO + real, e: (Math.floor(ahora / TRAMO_MS) + 2) * TRAMO_MS }))
  return `${cuerpo}.${hmac(cuerpo)}`
}

/** La ruta real firmada, o null si la firma no cuadra, ya venció o es de otro uso. */
export function verificarDescarga(token: string, ahora = Date.now()): string | null {
  const [cuerpo, firma, sobra] = (token ?? '').split('.')
  if (!cuerpo || !firma || sobra !== undefined) return null
  const esperada = hmac(cuerpo)
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try {
    const { d, e } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as { d?: unknown; e?: unknown }
    if (typeof d !== 'string' || !d.startsWith(PREFIJO) || typeof e !== 'number' || e <= ahora) return null
    return d.slice(PREFIJO.length)
  } catch { return null }
}

/** URL relativa con el nombre del archivo al final (lo que el navegador y el iPhone proponen al guardar). */
export function urlDescargaDocumento(real: string, ahora = Date.now()): string {
  return `/api/cabina/documento/descargar/${firmarDescarga(real, ahora)}/${encodeURIComponent(path.basename(real))}`
}

// ── Servir ──
const no = (status: number, msg: string) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export interface PedidoDescarga {
  token: string; nombre: string; rango: string | null
  /** ¿La transmisión en directo está prendida? (lib/modo-directo/servidor.ts; se inyecta para probar sin el daemon). */
  directoPrendido: () => Promise<boolean>
  raices?: Raices; ahora?: number
}

export async function servirDescarga(p: PedidoDescarga): Promise<Response> {
  const firmada = verificarDescarga(p.token, p.ahora)
  if (!firmada) return no(403, tr('Este enlace ya venció. Vuelve a abrir el archivo en Arbrain y toca Descargar otra vez.'))
  // El nombre de la URL solo sirve para que el navegador proponga bien el archivo; tiene que ser el del archivo firmado.
  let pedido = p.nombre
  try { pedido = decodeURIComponent(p.nombre) } catch { /* tal cual */ }
  if (pedido !== path.basename(firmada) && p.nombre !== path.basename(firmada)) return no(404, tr('No existe.'))
  let real: string, tipo: TipoDocumento
  try {
    // Se firma la ruta real; si el repo se configuró por un enlace (business-os → artificial-brain, /var → /private/var), la
    // misma validación se corre también con el repo resuelto, como hace el visor tras seguir enlaces.
    const r = p.raices ?? raices()
    const doc = await resolverEnDisco(firmada, r).catch(async (e: unknown) => {
      const repoReal = await realpath(r.repo).catch(() => r.repo)
      if (!(e instanceof ErrorDocumento) || e.status !== 403 || repoReal === r.repo) throw e
      return resolverEnDisco(firmada, { ...r, repo: repoReal })
    })
    real = doc.real; tipo = doc.tipo
  } catch (e) {
    if (e instanceof ErrorDocumento) return no(e.status, e.message)
    return no(500, tr('No se pudo leer el archivo.'))
  }
  // Se firmó la ruta real: si ahora resuelve a otra (alguien cambió un enlace simbólico), no se sirve.
  if (real !== firmada) return no(403, tr('No permitido.'))
  if (!esDescargable(tipo)) return no(403, tr('Ese tipo de archivo no se descarga desde el visor.'))
  if (rutaSensibleDirecto(real) && await p.directoPrendido()) return no(423, tr('Oculto por modo directo.'))
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return no(404, tr('No existe.'))
  const c = cabecerasArchivo(path.basename(real), true)
  const headers: Record<string, string> = {
    'Content-Type': c.tipo,
    'Content-Disposition': c.disposicion,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Accept-Ranges': 'bytes',
  }
  if (c.csp) headers['Content-Security-Policy'] = c.csp
  const rango = rangoPedido(p.rango, info.size)
  if (rango === 'fuera') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
  if (rango) return new Response(flujoArchivo(real, rango), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${rango.start}-${rango.end}/${info.size}`, 'Content-Length': String(rango.end - rango.start + 1) } })
  return new Response(flujoArchivo(real), { headers: { ...headers, 'Content-Length': String(info.size) } })
}
