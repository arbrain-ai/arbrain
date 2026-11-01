/**
 * LemonFox y Groq falsos para la e2e del teléfono (prueba-avisos.mjs, v0.2.18 · b7, 31 oct 2026).
 *
 * El daemon del alumno llama a `https://api.lemonfox.ai` (voz) y a `https://api.groq.com` (marcas de cada palabra) con
 * sus direcciones fijas (cliente/voz.ts, cliente/marcas-groq.ts). Para probar ESE camino sin una llave de pago, la prueba
 * levanta un proxy local y le pasa al supervisor `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` (Node 22.21 o más) y una CA de
 * prueba de un día (`NODE_EXTRA_CA_CERTS`). El proxy abre el túnel TLS solo de esos dos hosts hacia un servidor de aquí,
 * con un certificado firmado por esa CA; cualquier otro host (FCM, Anthropic…) pasa tal cual. Nada se instala en el
 * sistema: la CA vive en una carpeta temporal y solo la conocen los procesos de esta prueba.
 *
 * El LemonFox falso devuelve un WAV de 24 kHz con un tono por palabra del texto; el Groq falso, las palabras con esos
 * mismos tiempos. Así el daemon arma `X-Marcas` como con los de verdad. Se anota cada pedido (sin la llave).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOSTS = new Set(['api.lemonfox.ai', 'api.groq.com'])
const SR = 24_000
const INICIO_S = 0.2
const PALABRA_S = 0.25
const PAUSA_S = 0.1

/** CA de un día y certificado de hoja para los dos hosts, con `openssl`. */
function certificados(dir) {
  const ossl = (...a) => {
    const r = spawnSync('openssl', a, { cwd: dir, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`openssl ${a[0]} falló: ${(r.stderr || '').slice(-300)}`)
  }
  ossl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '1', '-subj', '/CN=Arbrain prueba CA',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
  ossl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'hoja.key', '-out', 'hoja.csr', '-subj', '/CN=api.lemonfox.ai')
  writeFileSync(join(dir, 'hoja.ext'), `subjectAltName=${[...HOSTS].map((h) => `DNS:${h}`).join(',')}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`)
  ossl('x509', '-req', '-in', 'hoja.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'hoja.pem', '-days', '1', '-extfile', 'hoja.ext')
  return { ca: join(dir, 'ca.pem'), key: readFileSync(join(dir, 'hoja.key')), cert: readFileSync(join(dir, 'hoja.pem')) }
}

const palabrasDe = (texto) => texto.split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)

/** WAV mono de 16 bits: silencio, y un tono de PALABRA_S por palabra separado por PAUSA_S. */
function wavDe(n) {
  const total = Math.ceil((INICIO_S + n * (PALABRA_S + PAUSA_S) + 0.2) * SR)
  const datos = Buffer.alloc(total * 2)
  for (let i = 0; i < n; i++) {
    const desde = Math.round((INICIO_S + i * (PALABRA_S + PAUSA_S)) * SR)
    for (let k = 0; k < PALABRA_S * SR; k++) datos.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * k) / SR) * 12_000), (desde + k) * 2)
  }
  const c = Buffer.alloc(44)
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVE', 8)
  c.write('fmt ', 12); c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(1, 22)
  c.writeUInt32LE(SR, 24); c.writeUInt32LE(SR * 2, 28); c.writeUInt16LE(2, 32); c.writeUInt16LE(16, 34)
  c.write('data', 36); c.writeUInt32LE(datos.length, 40)
  return Buffer.concat([c, datos])
}

const leerCuerpo = (req) => new Promise((si) => { const p = []; req.on('data', (d) => p.push(d)); req.on('end', () => si(Buffer.concat(p))) })

/** Arranca el proxy y los dos proveedores. Devuelve el entorno para el supervisor, las llaves falsas y los pedidos. */
export async function proveedoresVozFalsos({ host = '127.0.0.1', sinProxy = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'arbrain-voz-falsa-'))
  const { ca, key, cert } = certificados(dir)
  const llaves = { LEMONFOX_API_KEY: randomBytes(16).toString('hex'), GROQ_API_KEY: `gsk_${randomBytes(26).toString('hex')}` }
  const pedidos = []
  let ultimoTexto = ''

  const proveedor = https.createServer({ key, cert }, async (req, res) => {
    const cuerpo = await leerCuerpo(req)
    const h = (req.headers.host ?? '').split(':')[0]
    const auth = req.headers.authorization ?? ''
    const json = (status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
    if (h === 'api.lemonfox.ai' && req.method === 'POST' && req.url === '/v1/audio/speech') {
      let o = {}
      try { o = JSON.parse(cuerpo.toString('utf8')) } catch { /* */ }
      pedidos.push({ proveedor: 'lemonfox', llave: auth === `Bearer ${llaves.LEMONFOX_API_KEY}`, formato: o.response_format, voz: o.voice, idioma: o.language, caracteres: String(o.input ?? '').length })
      if (auth !== `Bearer ${llaves.LEMONFOX_API_KEY}`) return json(401, { error: { message: 'invalid API key' } })
      if (o.response_format !== 'wav') return json(415, { error: { message: 'la prueba solo sirve WAV' } })
      ultimoTexto = String(o.input ?? '')
      res.writeHead(200, { 'Content-Type': 'audio/wav' })
      return res.end(wavDe(palabrasDe(ultimoTexto).length))
    }
    if (h === 'api.groq.com' && auth !== `Bearer ${llaves.GROQ_API_KEY}`) return json(401, { error: { message: 'invalid API key' } })
    if (h === 'api.groq.com' && req.method === 'GET' && req.url === '/openai/v1/models') return json(200, { data: [{ id: 'whisper-large-v3' }] })
    if (h === 'api.groq.com' && req.method === 'POST' && req.url === '/openai/v1/audio/transcriptions') {
      const crudo = cuerpo.toString('latin1')
      pedidos.push({ proveedor: 'groq', llave: true, bytes: cuerpo.length, porPalabra: /timestamp_granularities\[\]"\r\n\r\nword/.test(crudo) })
      const palabras = palabrasDe(ultimoTexto).map((word, i) => {
        const start = INICIO_S + i * (PALABRA_S + PAUSA_S)
        return { word, start: Math.round(start * 1000) / 1000, end: Math.round((start + PALABRA_S) * 1000) / 1000 }
      })
      return json(200, { text: ultimoTexto, words: palabras })
    }
    pedidos.push({ proveedor: h, ruta: `${req.method} ${req.url}`, inesperado: true })
    return json(404, { error: { message: 'ruta sin falso' } })
  })
  await new Promise((si) => proveedor.listen(0, host, si))

  // Proxy: túnel TLS al proveedor falso para sus dos hosts; el resto pasa tal cual.
  const proxy = http.createServer((req, res) => {
    // Pedidos http:// absolutos (sin TLS): se reenvían.
    let u
    try { u = new URL(req.url) } catch { res.writeHead(400); return res.end() }
    const p = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
    p.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(p)
  })
  const sockets = new Set()
  proxy.on('connect', (req, socket, cabeza) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {})
    const [destino, puerto] = String(req.url).split(':')
    const arriba = HOSTS.has(destino) ? net.connect(proveedor.address().port, host) : net.connect(Number(puerto) || 443, destino)
    arriba.on('error', () => socket.destroy())
    arriba.on('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (cabeza?.length) arriba.write(cabeza)
      arriba.pipe(socket); socket.pipe(arriba)
    })
    sockets.add(arriba); arriba.on('close', () => sockets.delete(arriba))
  })
  await new Promise((si) => proxy.listen(0, host, si))
  const url = `http://${host}:${proxy.address().port}`

  return {
    llaves,
    pedidos,
    env: {
      HTTPS_PROXY: url, HTTP_PROXY: url, https_proxy: url, http_proxy: url,
      NO_PROXY: ['127.0.0.1', 'localhost', '::1', ...sinProxy].join(','),
      no_proxy: ['127.0.0.1', 'localhost', '::1', ...sinProxy].join(','),
      NODE_USE_ENV_PROXY: '1',
      NODE_EXTRA_CA_CERTS: ca,
    },
    cerrar() {
      for (const s of sockets) s.destroy()
      proxy.close(); proveedor.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
