import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// La ruta de salud del chat de Arbrain (7 oct 2026): recorre el camino de un mensaje sin gastar modelo y nunca cuelga.
const f = vi.hoisted(() => ({ url: vi.fn(), supabase: vi.fn() }))
vi.mock('@/lib/claudeclaw', () => ({ getClaudeclawUrl: f.url, CLAUDECLAW_TOKEN: 'token-de-prueba' }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ limit: () => ({ abortSignal: (s: AbortSignal) => f.supabase(s) }) }) }) }),
}))
import { GET } from '../../src/app/api/salud/chat/route'
import { sondearChat } from '../../src/lib/salud-chat'

const daemonOk = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
const pedir = (headers: Record<string, string> = {}, host = '127.0.0.1:3300') => GET(new Request(`http://${host}/api/salud/chat`, { headers }))

beforeEach(() => {
  f.url.mockReset().mockResolvedValue('http://localhost:3099')
  f.supabase.mockReset().mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn(async () => daemonOk()))
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ARBRAIN_SALUD_PRUEBA })

describe('/api/salud/chat', () => {
  it('sano: 200 con tiempos por etapa y sin detalle para quien no trae credencial', async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    const b = await r.json()
    expect(b.ok).toBe(true)
    expect(b.etapas.url.ok && b.etapas.supabase.ok && b.etapas.daemon.ok).toBe(true)
    expect(b.destino).toBeNull()
    expect(JSON.stringify(b)).not.toContain('localhost')
  })

  it('con el bearer del gateway desde 127.0.0.1 da el detalle; por el Funnel no', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('caído', { status: 502 })))
    const local = await (await pedir({ authorization: 'Bearer token-de-prueba' })).json()
    expect(local.destino).toBe('local')
    expect(local.etapas.daemon.error).toBe('HTTP 502')
    const funnel = await (await pedir({ authorization: 'Bearer token-de-prueba' }, 'equipo.example.org:10000')).json()
    expect(funnel.etapas.daemon.error).toBeUndefined()
    const malo = await (await pedir({ authorization: 'Bearer otro-token-de-pru' })).json()
    expect(malo.destino).toBeNull()
  })

  it('daemon o Supabase caídos se reportan sin tumbar al web (reiniciarlo no los arregla)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    f.supabase.mockResolvedValue({ error: { message: 'boom' } })
    const r = await pedir()
    expect(r.status).toBe(200)
    const b = await r.json()
    expect(b.etapas.daemon.ok).toBe(false)
    expect(b.etapas.supabase.ok).toBe(false)
  })

  it('el cuelgue del 7 oct: la URL del daemon nunca se resuelve ⇒ 503 en plazo, no una petición colgada', async () => {
    process.env.ARBRAIN_SALUD_PRUEBA = 'url'
    const t0 = Date.now()
    const r = await pedir()
    expect(Date.now() - t0).toBeLessThan(5_000)
    expect(r.status).toBe(503)
    const b = await r.json()
    expect(b.ok).toBe(false)
    expect(b.etapas.url.ok).toBe(false)
  }, 10_000)

  it('un daemon que no contesta se corta dentro del plazo total de 5 s', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('abortado'))))))
    f.supabase.mockImplementation(() => new Promise(() => {}))
    const t0 = Date.now()
    const r = await pedir()
    expect(Date.now() - t0).toBeLessThan(5_500)
    const b = await r.json()
    expect(b.ok).toBe(true)
    expect(b.etapas.supabase.ok).toBe(false)
    expect(b.etapas.daemon.ok).toBe(false)
  }, 10_000)
})

describe('sondearChat', () => {
  it('marca destino remoto cuando la URL es el túnel', async () => {
    const s = await sondearChat({ resolverUrl: async () => 'https://x.trycloudflare.com', consultarSupabase: async () => {}, consultarDaemon: async () => {} })
    expect(s.destino).toBe('remoto')
  })
})
