import { describe, expect, it } from 'vitest'
import { avisarAlTelefono, codificarVista, nombreVista, rutaTelefono } from './telefono.js'
import { parseMostrar } from './tools.js'

const decodificar = (url: string) => JSON.parse(Buffer.from(new URL(url, 'https://x').searchParams.get('abrir')!, 'base64url').toString('utf8'))

describe('«ábrelo en mi teléfono»', () => {
  it('telefono:true implica fijar y no admite soltar', () => {
    expect(parseMostrar({ vista: 'calendario', telefono: true })).toMatchObject({ telefono: true, fijar: true })
    expect(() => parseMostrar({ vista: 'calendario', telefono: true, soltar: true })).toThrow(/soltar/)
    expect(() => parseMostrar({ vista: 'calendario', telefono: 'sí' })).toThrow(/telefono/)
  })

  it('el enlace lleva solo la invocación (con acentos intactos), nunca fijar ni guardar', () => {
    const url = rutaTelefono({ vista: 'lienzo', paginaId: 'p-1', zona: 'ht:op', titulo: 'Embudo · prueba «ñ»', fijar: true, guardar: true, telefono: true })
    expect(url.startsWith('/telefono?abrir=')).toBe(true)
    expect(decodificar(url)).toEqual({ vista: 'lienzo', paginaId: 'p-1', zona: 'ht:op', titulo: 'Embudo · prueba «ñ»' })
    expect(codificarVista({ vista: 'salud' })).not.toMatch(/[+/=]/)
  })

  it('el nombre del aviso: el título, el archivo de un documento o el nombre de la vista', () => {
    expect(nombreVista({ vista: 'lienzo', titulo: 'Embudo' })).toBe('Embudo')
    expect(nombreVista({ vista: 'documento', ruta: 'docs/a/b/guion.md' })).toBe('guion.md')
    expect(nombreVista({ vista: 'salud' })).toBe('Salud')
  })

  it('manda el push por la ruta de avisos con el enlace y dice cuántos aparatos lo recibieron', async () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'tok'
    process.env.MC_URL = 'http://studio:3300'
    let pedido: { url: string; body: Record<string, unknown>; auth: string } | null = null
    const r = await avisarAlTelefono({ vista: 'salud', enfoque: 'Cómo dormiste' }, async (url, init) => {
      pedido = { url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) }
      return new Response(JSON.stringify({ sent: 2, entrega: 'push' }))
    })
    expect(r.ok).toBe(true)
    expect(r.texto).toMatch(/2 dispositivo/)
    expect(pedido!.url).toBe('http://studio:3300/api/notifications/send')
    expect(pedido!.auth).toBe('Bearer tok')
    expect(pedido!.body).toMatchObject({ title: '📱 Salud', body: 'Cómo dormiste', source: 'cabina:telefono', kind: 'agente' })
    expect(decodificar(String(pedido!.body.url))).toEqual({ vista: 'salud', enfoque: 'Cómo dormiste' })
  })

  it('sin iPhone suscrito o con error no lo da por enviado', async () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = 'tok'
    expect((await avisarAlTelefono({ vista: 'salud' }, async () => new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions found' })))).ok).toBe(false)
    expect((await avisarAlTelefono({ vista: 'salud' }, async () => { throw new Error('caído') })).ok).toBe(false)
  })
})
