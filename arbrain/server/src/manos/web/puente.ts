/**
 * Puente local entre la extensión Arbrain Manos y los agentes.
 *
 *   extensión (Chrome) ──ws /extension──┐
 *                                       ├── puente 127.0.0.1:<puerto>
 *   manos MCP (Claude, Codex, …) ─ws /agente─┘
 *
 * Un solo puente por Mac, aunque haya varias sesiones de manos: la primera que
 * lo necesita lo arranca como proceso suelto (`asegurarPuente` en cliente.ts) y
 * sobrevive a que esa sesión termine. Seguridad del canal:
 *   - escucha solo en 127.0.0.1 y exige Host local (frena DNS rebinding);
 *   - la extensión se presenta con el token y su Origin debe ser el ID fijo de
 *     Arbrain Manos (`chrome-extension://<ID>`);
 *   - los agentes mandan el token en `x-arbrain-token` y no pueden traer Origin:
 *     una página web nunca puede manejar las manos aunque adivinara el puerto;
 *   - sin telemetría: nada sale de esta Mac.
 *
 * El token vive en ~/.config/arbrain/web/token (0600) y se copia a
 * `arbrain/extension/token.json` (en .gitignore) para que la extensión lo lea.
 */
import { DUENO, DUENO_M, perfilesChrome } from '../../dueno.js'
import { DIR_ARBRAIN } from '../../edicion.js'
import { createServer, type IncomingMessage } from 'node:http'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'

/** ID fijo de la extensión (sale de la llave pública en manifest.json). */
export const ID_EXTENSION = 'jgdlhnbliijjagmlbbpkdaldkpfkkbjb'
export const PUERTO_DEFECTO = 47917

export const dirWeb = () => process.env.MANOS_WEB_DIR || join(DIR_ARBRAIN(), 'web')
export const puertoWeb = () => Number(process.env.MANOS_WEB_PUERTO || PUERTO_DEFECTO)
export const dirExtension = () => process.env.MANOS_WEB_EXTENSION_DIR || fileURLToPath(new URL('../../../../extension', import.meta.url))

/** Lee el token o lo crea (0600). */
export function token(dir = dirWeb()): string {
  const ruta = join(dir, 'token')
  if (existsSync(ruta)) {
    const t = readFileSync(ruta, 'utf8').trim()
    if (t.length >= 32) return t
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const t = randomBytes(32).toString('base64url')
  writeFileSync(ruta, t + '\n', { mode: 0o600 })
  chmodSync(ruta, 0o600)
  return t
}

/** Deja `token.json` dentro de la carpeta de la extensión para que la extensión lo lea. */
export function publicarTokenExtension(t: string, puerto: number, dir = dirExtension()): string | null {
  if (!existsSync(join(dir, 'manifest.json'))) return null
  const ruta = join(dir, 'token.json')
  const contenido = JSON.stringify({ token: t, puerto }) + '\n'
  if (!existsSync(ruta) || readFileSync(ruta, 'utf8') !== contenido) writeFileSync(ruta, contenido, { mode: 0o600 })
  return ruta
}

/** Firma de reto: ninguno de los dos lados manda el token; cada uno prueba que lo tiene. */
export const firmar = (tok: string, que: string) => createHmac('sha256', tok).update(que).digest('hex')

const igual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

interface Extension { ws: WebSocket; navegador: string; version: string; perfil: string; desde: number; id: number }
interface Pendiente { agente: WebSocket; idAgente: unknown; timer: NodeJS.Timeout; ext: Extension }

const vistaExt = (e: Extension) => ({ id: e.id, navegador: e.navegador, version: e.version, perfil: e.perfil, desde: e.desde })

/** Perfil (correo de Chrome) del dueño: a quien va el trabajo web si nadie elige otro. */
export const perfilDefecto = () => perfilesChrome().defecto  // MANOS_PERFIL_DEFECTO o instalacion.json; '' = sin preferencia

/**
 * Enrutado: `extension` numérico manda; luego `perfil` (subcadena del correo, sin mayúsculas; la más reciente que coincida);
 * sin destino, la del perfil por defecto del dueño aunque haya otra conectada después; si ninguna coincide, la más reciente.
 */
export function elegirExtension(lista: Extension[], extension?: unknown, perfil?: unknown): Extension | undefined {
  if (typeof extension === 'number') return lista.find(e => e.id === extension)
  const q = typeof perfil === 'string' ? perfil.trim().toLowerCase() : ''
  if (q) return [...lista].reverse().find(e => e.perfil.includes(q))
  const d = perfilDefecto()
  return (d ? [...lista].reverse().find(e => e.perfil === d) : undefined) ?? lista[lista.length - 1]
}

export interface OpcionesPuente { puerto?: number; token?: string; idsPermitidos?: string[]; log?: (s: string) => void; host?: string }

export interface Puente { puerto: number; cerrar(): Promise<void>; extensiones(): { id: number; navegador: string; version: string; perfil: string; desde: number }[] }

export async function iniciarPuente(op: OpcionesPuente = {}): Promise<Puente> {
  const puerto = op.puerto ?? puertoWeb()
  const tok = op.token ?? token()
  const ids = new Set(op.idsPermitidos ?? [ID_EXTENSION, ...(process.env.MANOS_WEB_IDS_EXTRA || '').split(',').filter(Boolean)])
  const log = op.log ?? (() => {})
  const extensiones: Extension[] = []
  const pendientes = new Map<number, Pendiente>()
  let siguiente = 1
  let numExt = 0

  const hostLocal = (req: IncomingMessage) => {
    const h = (req.headers.host || '').toLowerCase()
    return h === `127.0.0.1:${puerto}` || h === `localhost:${puerto}`
  }

  const http = createServer((req, res) => {
    // Salud sin secretos (para el canario y los humanos): no expone nada de las pestañas.
    if (req.url === '/salud' && hostLocal(req) && !req.headers.origin) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, extensiones: extensiones.length }))
      return
    }
    res.writeHead(404); res.end()
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 })

  http.on('upgrade', (req, socket, cabeza) => {
    const ruta = (req.url || '').split('?')[0]
    const origin = req.headers.origin
    const rechazar = (motivo: string) => { log(`rechazado ${ruta}: ${motivo}`); socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy() }
    if (!hostLocal(req)) return rechazar('host no local')
    if (ruta === '/extension') {
      const id = (origin || '').replace(/^chrome-extension:\/\//, '')
      if (!origin?.startsWith('chrome-extension://') || !ids.has(id)) return rechazar(`origen ${origin ?? '(ninguno)'}`)
      wss.handleUpgrade(req, socket, cabeza, ws => aceptarExtension(ws))
    } else if (ruta === '/agente') {
      if (origin) return rechazar('un agente local no trae Origin: esto vino de una página')
      const t = String(req.headers['x-arbrain-token'] || '')
      if (!igual(t, tok)) return rechazar('token de agente')
      wss.handleUpgrade(req, socket, cabeza, ws => aceptarAgente(ws))
    } else rechazar('ruta')
  })

  function aceptarExtension(ws: WebSocket) {
    let ext: Extension | null = null
    const reto = randomBytes(24).toString('hex')
    ws.send(JSON.stringify({ tipo: 'reto', reto }))
    const plazo = setTimeout(() => { if (!ext) ws.close(4001, 'sin hola') }, 3000)
    ws.on('message', datos => {
      let m: any
      try { m = JSON.parse(String(datos)) } catch { return }
      if (!ext) {
        // La extensión firma nuestro reto con el token (no lo manda) y nos reta a nosotros.
        if (m.tipo !== 'hola' || typeof m.firma !== 'string' || typeof m.reto !== 'string' || m.reto.length < 32 || !igual(m.firma, firmar(tok, `extension:${reto}`))) { log('extensión con firma inválida'); ws.close(4001, 'token'); return }
        clearTimeout(plazo)
        ext = { ws, navegador: String(m.navegador || '').slice(0, 200), version: String(m.version || ''), perfil: String(m.perfil || '').trim().toLowerCase().slice(0, 200), desde: Date.now(), id: ++numExt }
        extensiones.push(ext)
        log(`extensión ${ext.id} conectada (${ext.version})${ext.perfil ? ` · perfil ${ext.perfil}` : ''}`)
        ws.send(JSON.stringify({ tipo: 'bienvenida', firma: firmar(tok, `puente:${m.reto}`) }))
        return
      }
      if (m.tipo === 'latido' || m.tipo === 'pong') return
      const p = typeof m.id === 'number' ? pendientes.get(m.id) : undefined
      if (!p) return
      pendientes.delete(m.id); clearTimeout(p.timer)
      if (p.agente.readyState === 1) p.agente.send(JSON.stringify({ id: p.idAgente, ok: m.ok, r: m.r, error: m.error, ms: m.ms }))
    })
    ws.on('close', () => {
      clearTimeout(plazo)
      const i = ext ? extensiones.indexOf(ext) : -1
      if (i >= 0) extensiones.splice(i, 1)
      if (ext) {
        log(`extensión ${ext.id} desconectada`)
        // Lo pendiente con esa extensión falla ya, no al agotar el tope.
        for (const [id, p] of pendientes) if (p.ext === ext) {
          clearTimeout(p.timer); pendientes.delete(id)
          if (p.agente.readyState === 1) p.agente.send(JSON.stringify({ id: p.idAgente, ok: false, error: 'la extensión se desconectó a mitad de la acción (¿se cerró Chrome?): observa de nuevo antes de repetir' }))
        }
      }
    })
  }

  function aceptarAgente(ws: WebSocket) {
    ws.on('message', datos => {
      let m: any
      try { m = JSON.parse(String(datos)) } catch { return }
      if (m.metodo === 'estado') {
        ws.send(JSON.stringify({ id: m.id, ok: true, r: { extensiones: extensiones.map(vistaExt) } }))
        return
      }
      const ext = elegirExtension(extensiones, m.extension, m.perfil)
      if (!ext) {
        const pedida = typeof m.extension === 'number' ? `la extensión ${m.extension}` : String(m.perfil || '').trim() ? `el perfil «${m.perfil}»` : 'la extensión Arbrain'
        ws.send(JSON.stringify({ id: m.id, ok: false, error: `SIN_EXTENSION: ${pedida} no está conectada${extensiones.length ? ` (conectadas: ${extensiones.map(e => `${e.id}${e.perfil ? ` ${e.perfil}` : ''}`).join(', ')})` : ''}. Pídele a ${DUENO} que la instale o abra Chrome (INSTALAR.md).` })); return
      }
      const id = siguiente++
      const tope = Math.min(Math.max(Number(m.tope_ms) || 45_000, 1000), 120_000)
      const timer = setTimeout(() => {
        if (!pendientes.delete(id)) return
        if (ws.readyState === 1) ws.send(JSON.stringify({ id: m.id, ok: false, error: `la extensión no respondió ${m.metodo} en ${tope} ms` }))
      }, tope)
      pendientes.set(id, { agente: ws, idAgente: m.id, timer, ext })
      ext.ws.send(JSON.stringify({ id, metodo: m.metodo, args: m.args ?? {} }))
    })
    ws.on('close', () => { for (const [id, p] of pendientes) if (p.agente === ws) { clearTimeout(p.timer); pendientes.delete(id) } })
  }

  await new Promise<void>((ok, mal) => {
    http.once('error', mal)
    http.listen(puerto, op.host ?? '127.0.0.1', () => { http.off('error', mal); ok() })
  })
  log(`puente escuchando en 127.0.0.1:${puerto}`)
  return {
    puerto,
    extensiones: () => extensiones.map(vistaExt),
    cerrar: async () => {
      for (const e of extensiones) e.ws.close()
      for (const c of wss.clients) c.terminate()
      await new Promise<void>(r => http.close(() => r()))
    },
  }
}

// Proceso suelto: `tsx src/manos/web/puente.ts`.
if (process.argv[1] && /puente\.(js|ts)$/.test(process.argv[1])) {
  const dir = dirWeb()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const archivoLog = join(dir, 'puente.log')
  const log = (s: string) => { try { appendFileSync(archivoLog, `${new Date().toISOString()} ${s}\n`) } catch {} }
  const t = token(dir)
  const puerto = puertoWeb()
  publicarTokenExtension(t, puerto)
  iniciarPuente({ puerto, token: t, log }).catch(e => {
    log(`no arrancó: ${(e as Error).message}`)
    process.exit((e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 0 : 1)
  })
}
