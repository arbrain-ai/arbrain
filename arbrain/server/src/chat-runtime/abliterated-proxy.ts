/**
 * Proxy local del espacio «abliterated» (3 nov 2026). abliteration.ai responde 400 «more images than the limit of 4»
 * cuando el historial COMPLETO de un request trae más de 4 imágenes; el CLI reenvía todo el historial en cada llamada,
 * así que tras la quinta captura de pantalla la conversación quedaba muerta para siempre. Daniel: «sácame del medio y
 * resuelve».
 *
 * El CLI apunta aquí (`ANTHROPIC_BASE_URL=http://127.0.0.1:<puerto>`) y este proxy reenvía al endpoint real dejando solo
 * las 4 imágenes más recientes; las anteriores se vuelven un texto que dice que se omitieron. La transcripción en disco
 * no se toca: el recorte vive solo en el request. Escucha solo en loopback.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { Readable } from 'node:stream'
import type { AddressInfo } from 'node:net'

export const MAX_IMAGENES = 4
export const TEXTO_OMITIDA = '[imagen anterior omitida: este modelo acepta máximo 4 imágenes por request]'

type Bloque = Record<string, unknown>

/** Deja solo las `max` imágenes más recientes del arreglo `messages` (formato Anthropic). Devuelve cuántas quitó. */
export function recortarImagenes(cuerpo: { messages?: unknown }, max = MAX_IMAGENES): number {
  const mensajes = Array.isArray(cuerpo.messages) ? (cuerpo.messages as Bloque[]) : []
  let vistas = 0, quitadas = 0
  const recorrer = (contenido: unknown): void => {
    if (!Array.isArray(contenido)) return
    for (let i = contenido.length - 1; i >= 0; i--) {
      const b = contenido[i] as Bloque | null
      if (!b || typeof b !== 'object') continue
      if (b.type === 'image') {
        vistas++
        if (vistas > max) { contenido[i] = { type: 'text', text: TEXTO_OMITIDA }; quitadas++ }
      } else if (b.type === 'tool_result') recorrer(b.content)
    }
  }
  for (let i = mensajes.length - 1; i >= 0; i--) recorrer(mensajes[i]?.content)
  return quitadas
}

const SALTAR_PETICION = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'transfer-encoding'])
const SALTAR_RESPUESTA = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection'])

function leerCuerpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok, mal) => {
    const partes: Buffer[] = []
    req.on('data', (c: Buffer) => partes.push(c))
    req.on('end', () => ok(Buffer.concat(partes)))
    req.on('error', mal)
  })
}

export function crearProxy(destino: string): Server {
  const base = destino.replace(/\/+$/, '')
  return createServer(async (req, res) => {
    try {
      let cuerpo: Buffer | undefined = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : await leerCuerpo(req)
      if (cuerpo?.length && /\/messages(\?|$)/.test(req.url ?? '') && String(req.headers['content-type'] ?? '').includes('json')) {
        try {
          const json = JSON.parse(cuerpo.toString('utf8'))
          if (recortarImagenes(json) > 0) cuerpo = Buffer.from(JSON.stringify(json))
        } catch { /* no es JSON válido: va tal cual */ }
      }
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(req.headers)) if (v != null && !SALTAR_PETICION.has(k)) headers[k] = Array.isArray(v) ? v.join(', ') : v
      headers['accept-encoding'] = 'identity'
      const r = await fetch(base + (req.url ?? '/'), { method: req.method, headers, body: cuerpo ? new Uint8Array(cuerpo) : undefined })
      const salida: Record<string, string> = {}
      r.headers.forEach((v, k) => { if (!SALTAR_RESPUESTA.has(k)) salida[k] = v })
      res.writeHead(r.status, salida)
      if (r.body) Readable.fromWeb(r.body as import('node:stream/web').ReadableStream).pipe(res)
      else res.end()
    } catch (err) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `proxy abliterated: ${(err as Error).message}` } }))
    }
  })
}

const proxies = new Map<string, Promise<string>>()

/** URL local del proxy hacia `destino`. Uno por destino, vive lo que vive el daemon. */
export function urlProxyAbliterated(destino: string): Promise<string> {
  let p = proxies.get(destino)
  if (!p) {
    p = new Promise<string>((ok, mal) => {
      const s = crearProxy(destino)
      s.on('error', mal)
      s.listen(0, '127.0.0.1', () => { s.unref(); ok(`http://127.0.0.1:${(s.address() as AddressInfo).port}`) })
    })
    p.catch(() => proxies.delete(destino))
    proxies.set(destino, p)
  }
  return p
}
