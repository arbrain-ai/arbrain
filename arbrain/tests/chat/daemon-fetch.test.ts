import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchConPlazoDeCabeceras, textoConPlazo } from '../../src/lib/daemon-fetch'

// Chat colgado del 7 oct 2026: un daemon que acepta y no responde retenía una de las 6 conexiones de WebKit
// para siempre. El proxy aborta si no llegan cabeceras a tiempo; un stream ya abierto puede durar.

async function servidor(handler: Parameters<typeof createServer>[1]): Promise<{ url: string; server: Server }> {
  const server = createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }
}
const cerrar = (server: Server) => { server.closeAllConnections(); server.close() }

test('sin cabeceras en el plazo: TimeoutError (no AbortError) y la conexión se suelta', async () => {
  const { url, server } = await servidor(() => { /* nunca responde */ })
  try {
    const t0 = Date.now()
    await assert.rejects(fetchConPlazoDeCabeceras(url, { method: 'POST' }, 150), (e: Error) => e.name === 'TimeoutError')
    assert.ok(Date.now() - t0 < 2_000)
  } finally { cerrar(server) }
})

test('con cabeceras a tiempo, el stream sigue abierto más allá del plazo', async () => {
  const { url, server } = await servidor((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: uno\n\n')
    setTimeout(() => { res.write('data: dos\n\n'); res.end() }, 400)
  })
  try {
    const res = await fetchConPlazoDeCabeceras(url, {}, 150)
    const texto = await res.text()
    assert.match(texto, /uno[\s\S]*dos/)
  } finally { cerrar(server) }
})

test('el cierre del navegador se sigue propagando como AbortError', async () => {
  const { url, server } = await servidor(() => { /* nunca responde */ })
  try {
    const ac = new AbortController()
    const pendiente = fetchConPlazoDeCabeceras(url, { signal: ac.signal }, 5_000)
    setTimeout(() => ac.abort(), 50)
    await assert.rejects(pendiente, (e: Error) => e.name === 'AbortError')
  } finally { cerrar(server) }
})

test('textoConPlazo: un cuerpo JSON que nunca termina no cuelga la respuesta', async () => {
  const { url, server } = await servidor((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"live":') })
  try {
    const res = await fetchConPlazoDeCabeceras(url, {}, 1_000)
    await assert.rejects(textoConPlazo(res, 150), (e: Error) => e.name === 'TimeoutError')
  } finally { cerrar(server) }
})
