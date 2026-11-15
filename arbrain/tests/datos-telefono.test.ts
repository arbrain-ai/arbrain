import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 12 nov 2026, Daniel: «siento que se me acaban rapidísimo los datos al hablar contigo». Medidor de lo que la web manda
// al iPhone (server/services/datos-telefono). Precargado en la web viva: un error suyo no puede tumbarla.
const dir = fileURLToPath(new URL('../server/services/datos-telefono/', import.meta.url))
const m = createRequire(import.meta.url)(join(dir, 'medir.cjs'))

test('categorías del medidor de datos del teléfono', () => {
  assert.equal(m.categoria('/api/chat/tts?x=1', ''), 'tts')
  assert.equal(m.categoria('/api/chat/tts-fast', ''), 'tts')
  assert.equal(m.categoria('/api/chat/active?ids=a,b', ''), 'sondeo')
  assert.equal(m.categoria('/api/chat/stream?session=1', ''), 'stream')
  assert.equal(m.categoria('/api/live/speech', ''), 'tts')
  assert.equal(m.categoria('/api/live/workspace', ''), 'stream')
  assert.equal(m.categoria('/api/chat/sessions/abc/messages', ''), 'sesiones')
  assert.equal(m.categoria('/api/chat', ''), 'sesiones')
  assert.equal(m.categoria('/api/chat/transcribe', ''), 'otros')
  assert.equal(m.categoria('/_next/static/chunks/a.js', ''), 'estaticos')
  assert.equal(m.categoria('/sw.js', ''), 'estaticos')
  assert.equal(m.categoria('/avatares/levy.glb', ''), 'estaticos')
  assert.equal(m.categoria('/chat', ''), 'otros')
  assert.equal(m.categoria('/api/notifications/stream', 'text/event-stream; charset=utf-8'), 'stream')
  assert.equal(m.prefijo('/api/chat/sessions/0f8e1c2a-1111-2222-3333-444455556666/x'), '/api/chat/sessions')
  assert.equal(m.prefijo('/_next/static/chunks/a.js'), '/_next/static')
  assert.ok(m.esIphone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)'))
  assert.ok(!m.esIphone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'))
})

test('el acumulador suma por día de Ciudad de México y empieza de cero al vaciar', () => {
  const a = new m.Acumulador(Date.parse('2026-11-12T05:00:00Z'))
  const t = Date.parse('2026-11-12T05:30:00Z') // 23:30 del 11 en CDMX
  a.pedido(t, 'tts'); a.bytes(t, 'tts', '/api/chat/tts', 1000); a.bytes(t, 'tts', '/api/chat/tts', 500)
  const l = a.vaciar(t).map((x: string) => JSON.parse(x))
  assert.equal(l.length, 1)
  assert.deepEqual([l[0].dia, l[0].categoria, l[0].bytes, l[0].pedidos], ['2026-11-11', 'tts', 1500, 1])
  assert.deepEqual(a.vaciar(t), [])
})

test('precargado en un servidor http real: cuenta exacto lo del iPhone (SSE incluido) y nada más', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'datos-tel-'))
  const log = join(tmp, 'datos.jsonl')
  const guion = `
    const http = require('http')
    const s = http.createServer((req, res) => {
      if (req.url.startsWith('/eventos')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: uno\\n\\n'); res.write(Buffer.from('data: dos\\n\\n')); res.end('data: fin\\n\\n')
      } else if (req.url === '/vacio') { res.statusCode = 304; res.end() }
      else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: 'ñ'.repeat(100) })) }
    })
    s.listen(0, '127.0.0.1', async () => {
      const port = s.address().port, iphone = { 'user-agent': 'X (iPhone; CPU iPhone OS 18_7)' }
      const pedir = (p, h) => new Promise((ok) => http.get({ port, path: p, headers: h, agent: false }, (r) => {
        let n = 0; r.on('data', (c) => n += c.length); r.on('end', () => ok(n))
      }))
      const total = []
      for (const [p, h] of [['/eventos', iphone], ['/api/chat/active', iphone], ['/vacio', iphone], ['/api/chat/active', {}]])
        total.push({ p, cuerpo: await pedir(p, h), iphone: !!h['user-agent'] })
      console.log(JSON.stringify(total)); s.close(); process.exit(0)
    })`
  const r = spawnSync(process.execPath, ['--require', join(dir, 'datos-telefono.cjs'), '-e', guion], { env: { ...process.env, DATOS_TELEFONO_LOG: log }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const lineas = readFileSync(log, 'utf8').trim().split('\n').map((x) => JSON.parse(x))
  const por = Object.fromEntries(lineas.map((l) => [l.categoria, l]))
  // Cuerpo exacto (las cabeceras suman encima): SSE 33 bytes; el JSON de 200 «ñ» (2 bytes cada una) + 10.
  assert.equal(por.stream.pedidos, 1)
  assert.ok(por.stream.bytes > 33 && por.stream.bytes < 33 + 300, String(por.stream.bytes))
  assert.equal(por.sondeo.pedidos, 1) // la petición sin UA de iPhone no cuenta
  assert.ok(por.sondeo.bytes > 210 && por.sondeo.bytes < 210 + 300, String(por.sondeo.bytes))
  assert.ok(por.otros.bytes > 0 && por.otros.bytes < 300) // 304: solo cabeceras
})
