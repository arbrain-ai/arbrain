/**
 * Conectar de un clic (1 nov 2026): la app pide un vínculo, el alumno confirma un código corto en arbrain.ai y el daemon
 * recoge el token directo. El código de dispositivo y el token nunca llegan a la app; un 404 deja la vía del token; al
 * conectar llegan solos el expediente, el norte, el retrato y el camino. Datos de prueba inventados.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { Progreso } from './progreso.js'

const EDICION = process.env.ARBRAIN_EDICION
afterEach(() => { if (EDICION === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = EDICION })

const BASE = 'http://127.0.0.1:9/api/progreso'
const DISPOSITIVO = 'dev_' + 'a1'.repeat(20)
const TOKEN = 'arb_vinculo_0123456789abcdef'

function armar() {
  const raiz = mkdtempSync(join(tmpdir(), 'cerebro-vinc-'))
  for (const d of ['.claude/memory/user', '.claude/memory/project']) mkdirSync(join(raiz, d), { recursive: true })
  writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias.md'), '<!-- arbrain:expediente pendiente -->\n# Mi meta\n')
  writeFileSync(join(raiz, '.claude/memory/RETRATO.md'), '<!-- arbrain:retrato pendiente -->\n# Retrato del dueño\n\n_Pendiente. Levy lo llena contigo._\n')
  const datos = mkdtempSync(join(tmpdir(), 'datos-vinc-'))
  let ahora = new Date(2026, 10, 1, 9).getTime()
  const p = new Progreso(new Database(':memory:'), datos, () => raiz, () => ahora)
  const llamadas: { url: string; cuerpo: Record<string, unknown> | null; auth: string | null }[] = []
  const estado = { aprobado: false, vincular: 200, token: 200 }
  const fetcher = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, cuerpo: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('authorization') })
    if (url.endsWith('/vincular')) {
      if (estado.vincular === 404) return new Response('<html>no encontrado</html>', { status: 404 })
      return new Response(JSON.stringify({ codigo_dispositivo: DISPOSITIVO, codigo_usuario: 'KX7P-2M9Q', url: '/conectar?codigo=KX7P-2M9Q', intervalo: 3, expira_en: 600 }), { status: 200 })
    }
    if (url.endsWith('/vincular/token')) {
      if (estado.token !== 200) return new Response(JSON.stringify({ error: 'no' }), { status: estado.token })
      return estado.aprobado ? new Response(JSON.stringify({ token: TOKEN }), { status: 200 }) : new Response(JSON.stringify({ estado: 'pendiente' }), { status: 202 })
    }
    if (url.endsWith('/expediente')) return new Response(JSON.stringify({ nombre: 'Prueba', respuestas: { quiero: 'Tiempo con mi familia', meta_monto: 900, meta_fecha: '2027-01-20', activos: '20 años en logística' }, markdown: '# Expediente de Prueba\n' }), { status: 200 })
    if (url.endsWith('/camino')) return new Response(JSON.stringify({ v: 1, dia: 7, inicio: '2026-10-26' }), { status: 200 })
    return new Response('{}', { status: 500 })
  }) as unknown as typeof fetch
  return { raiz, datos, p, llamadas, estado, fetcher, avanzar: (ms: number) => { ahora += ms } }
}

describe('conectar de un clic', () => {
  it('pide el vínculo, espera la confirmación, conecta y siembra todo; el código de dispositivo y el token no salen', async () => {
    const { raiz, datos, p, llamadas, estado, fetcher } = armar()
    process.env.ARBRAIN_EDICION = 'cliente'
    const v = await p.vincular(BASE, fetcher)
    expect(v.resultado).toBe('esperando')
    expect(v.vinculo).toMatchObject({ estado: 'esperando', codigo: 'KX7P-2M9Q', url: 'http://127.0.0.1:9/conectar?codigo=KX7P-2M9Q' })
    expect(llamadas[0].cuerpo).not.toHaveProperty('token')
    const visto = JSON.stringify(p.resumen())
    expect(visto).not.toContain(DISPOSITIVO)

    expect(await p.sondearVinculo(fetcher)).toBe('esperando')
    expect(p.resumen().conectado).toBe(false)
    estado.aprobado = true
    let dormidas = 0
    expect(await p.esperarVinculo(fetcher, async () => { dormidas++ })).toBe('conectado')
    expect(dormidas).toBe(1)
    expect(llamadas.find(l => l.url.endsWith('/vincular/token'))?.cuerpo).toEqual({ codigo_dispositivo: DISPOSITIVO })

    const r = p.resumen()
    expect(r.conectado).toBe(true)
    expect(r.pista).toBe(TOKEN.slice(0, 8))
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    expect(statSync(join(datos, 'progreso.json')).mode & 0o777).toBe(0o600)
    expect(llamadas.find(l => l.url.endsWith('/expediente'))?.auth).toBe(`Bearer ${TOKEN}`)
    expect(readFileSync(join(raiz, '.claude/memory/project/meta-90-dias.md'), 'utf8')).toContain('900 USD al mes')
    expect(readFileSync(join(raiz, '.claude/memory/RETRATO.md'), 'utf8')).toContain('«Tiempo con mi familia»')
    expect(readFileSync(join(raiz, '.claude/memory/project/mi-camino.md'), 'utf8')).toContain('día 7 de 90')
  })

  it('sin la ruta en arbrain.ai (404) queda la vía del token; solo en edición cliente; una página de otro dominio no pasa', async () => {
    const { p, estado, fetcher } = armar()
    process.env.ARBRAIN_EDICION = 'daniel'
    expect((await p.vincular(BASE, fetcher)).resultado).toBe('no_cliente')
    process.env.ARBRAIN_EDICION = 'cliente'
    estado.vincular = 404
    expect((await p.vincular(BASE, fetcher)).resultado).toBe('sin_ruta')
    expect(p.resumen().vinculo).toBeNull()
    const ajeno = (async () => new Response(JSON.stringify({ codigo_dispositivo: DISPOSITIVO, codigo_usuario: 'KX7P-2M9Q', url: 'https://otro.example/conectar' }), { status: 200 })) as unknown as typeof fetch
    expect((await p.vincular(BASE, ajeno)).resultado).toBe('fallo')
    expect((await p.vincular('http://ejemplo.com/api', fetcher)).resultado).toBe('fallo') // http fuera de la máquina
  })

  it('vence, se rechaza o se cancela sin conectar nada', async () => {
    const { p, estado, fetcher, avanzar } = armar()
    process.env.ARBRAIN_EDICION = 'cliente'
    await p.vincular(BASE, fetcher)
    avanzar(601_000)
    expect(p.resumen().vinculo?.estado).toBe('expirado')
    expect(await p.sondearVinculo(fetcher)).toBe('expirado')

    await p.vincular(BASE, fetcher)
    estado.token = 403
    expect(await p.sondearVinculo(fetcher)).toBe('rechazado')
    expect(p.resumen().conectado).toBe(false)

    estado.token = 200
    await p.vincular(BASE, fetcher)
    p.desconectar()
    expect(p.resumen().vinculo).toBeNull()
    expect(await p.esperarVinculo(fetcher, async () => {})).toBeNull()
  })
})
