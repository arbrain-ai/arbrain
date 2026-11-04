import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { TEXTO_OMITIDA, recortarImagenes, urlProxyAbliterated } from './abliterated-proxy.js'

const img = () => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } })
const contar = (c: unknown): number => JSON.stringify(c).split('"type":"image"').length - 1

describe('proxy abliterated: máximo 4 imágenes por request (3 nov)', () => {
  it('deja las 4 más recientes, incluidas las de tool_result, y marca las demás', () => {
    const cuerpo = { messages: [
      { role: 'user', content: [img(), { type: 'text', text: 'hola' }] },
      { role: 'user', content: [{ type: 'tool_result', content: [img(), img()] }] },
      { role: 'user', content: [{ type: 'tool_result', content: [img()] }] },
      { role: 'user', content: [img(), img()] },
    ] }
    expect(recortarImagenes(cuerpo)).toBe(2)
    expect(contar(cuerpo)).toBe(4)
    expect((cuerpo.messages[0].content[0] as { text?: string }).text).toBe(TEXTO_OMITIDA)
    expect(contar(cuerpo.messages[3])).toBe(2)
  })

  it('reenvía al destino con el cuerpo recortado y las cabeceras de auth', async () => {
    let recibido: { auth?: string; imagenes: number } | null = null
    const destino = createServer((req, res) => {
      let b = ''
      req.on('data', c => { b += c })
      req.on('end', () => {
        recibido = { auth: req.headers.authorization, imagenes: contar(JSON.parse(b)) }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
      })
    })
    await new Promise<void>(ok => destino.listen(0, '127.0.0.1', ok))
    const url = await urlProxyAbliterated(`http://127.0.0.1:${(destino.address() as AddressInfo).port}`)
    const r = await fetch(`${url}/v1/messages?beta=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ messages: [{ role: 'user', content: [img(), img(), img(), img(), img(), img()] }] }),
    })
    expect(await r.json()).toEqual({ ok: true })
    expect(recibido).toEqual({ auth: 'Bearer t', imagenes: 4 })
    destino.close()
  })
})
