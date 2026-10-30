import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { CATALOGO, HABILITADOS_POR_DEFECTO, catalogoPublico, consultarOpenRouter, guardarHabilitado, leerHabilitados, leerModelosOpenRouter, olvidarOpenRouter, rutaDeEntrada } from './catalogo.js'
import { catalogoJson } from './codex-proveedor.js'
import { rutaDeCuenta } from './registro.js'

afterEach(() => { olvidarOpenRouter(); vi.unstubAllEnvs() })

const openrouter = (ids: string[]) => ({
  consultadoEn: '2026-10-02T22:40:00.000Z', error: null,
  modelos: leerModelosOpenRouter({ data: ids.map(id => ({ id, pricing: { prompt: '0.0000001', completion: '0.0000005' }, context_length: 1_050_000 })) }),
})
const TODOS = CATALOGO.map(e => e.openrouterId).filter(id => id !== 'google/gemini-4-argon')
const entorno = (extra: Partial<Parameters<typeof catalogoPublico>[0]> = {}) => ({
  openrouter: openrouter(TODOS), habilitados: [...HABILITADOS_POR_DEFECTO], motorApi: true, llave: true,
  resolverClaude: (c: string[]) => c[0] ?? null, ...extra,
})

describe('catálogo de modelos', () => {
  it('trae el top 10 del índice más Sonnet 5.5 y GPT-6 Luna; Anthropic por suscripción, el resto por OpenRouter', () => {
    expect(CATALOGO.filter(e => e.puesto).map(e => e.puesto)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(CATALOGO.map(e => e.id)).toEqual(expect.arrayContaining(['sonnet-5.5', 'gpt-6-luna']))
    for (const e of CATALOGO) {
      expect(e.via).toBe(e.laboratorio === 'Anthropic' ? 'suscripcion' : 'openrouter')
      if (e.via === 'openrouter') expect(rutaDeEntrada(e)?.modelId).toBe(e.openrouterId)
    }
  })

  it('por defecto solo enciende Opus 5.5, Sonnet 5.5, Haiku 5.5, DeepSeek y GPT-6 Luna', () => {
    const db = new Database(':memory:')
    expect(leerHabilitados(db)).toEqual(['opus-5.5', 'sonnet-5.5', 'haiku-5.5', 'deepseek-v4.1-flash', 'gpt-6-luna'])
    const vista = catalogoPublico(entorno())
    expect(vista.modelos.filter(m => m.habilitado).map(m => m.id)).toEqual(['opus-5.5', 'deepseek-v4.1-flash', 'sonnet-5.5', 'haiku-5.5', 'gpt-6-luna'])
  })

  it('Anthropic solo pide ids fijos de versión: un alias suelto de un SDK viejo nunca baja de generación (8 oct 2026)', () => {
    for (const e of CATALOGO.filter(x => x.via === 'suscripcion')) {
      expect(e.claude?.length).toBeGreaterThan(0)
      for (const id of e.claude!) expect(id).toMatch(/^claude-[a-z]+-\d+-\d+(\[1m\])?$/)
    }
    // SDK 0.3.288: `haiku` resolvía a Haiku 4.5; el catálogo vivo no tenía claude-haiku-5-5.
    const filas = [{ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }]
    const resolverViejo = (c: string[]) => c.map(id => filas.find(f => f.value === id || f.resolvedModel === id)).find(Boolean)?.value ?? null
    const haiku = catalogoPublico(entorno({ resolverClaude: resolverViejo })).modelos.find(m => m.id === 'haiku-5.5')!
    expect(haiku.modelo).toBeNull()
    expect(haiku.disponible).toBe(false)
    expect(haiku.habilitado).toBe(false)
  })

  it('un id que no está en OpenRouter queda deshabilitado con el motivo, y nunca encendido', () => {
    const vista = catalogoPublico(entorno({ habilitados: ['gemini-4-argon'] }))
    const gemini = vista.modelos.find(m => m.id === 'gemini-4-argon')!
    expect(gemini).toMatchObject({ disponible: false, habilitado: false, openrouter: { existe: false, precio: null } })
    expect(gemini.motivo).toContain('No existe en el catálogo de OpenRouter')
  })

  it('el precio por millón sale de OpenRouter', () => {
    const luna = catalogoPublico(entorno()).modelos.find(m => m.id === 'gpt-6-luna')!
    expect(luna.openrouter.precio).toEqual({ entrada: 0.1, salida: 0.5 })
    expect(luna).toMatchObject({ cuenta: 'gpt-luna', modelo: 'openai/gpt-6-luna', disponible: true })
  })

  it('sin OpenRouter, sin interruptor o sin llave lo dice; Claude depende de su catálogo vivo', () => {
    const caido = catalogoPublico(entorno({ openrouter: { consultadoEn: 'x', modelos: null, error: 'OpenRouter respondió 503.' } }))
    expect(caido.modelos.find(m => m.id === 'gpt-6-luna')!.motivo).toContain('No se pudo verificar en OpenRouter')
    expect(caido.modelos.find(m => m.id === 'opus-5.5')!.disponible).toBe(true)
    expect(catalogoPublico(entorno({ motorApi: false })).modelos.find(m => m.id === 'deepseek-v4.1-flash')!.motivo).toContain('ARBRAIN_MOTOR_API')
    expect(catalogoPublico(entorno({ llave: false })).modelos.find(m => m.id === 'deepseek-v4.1-flash')!.motivo).toContain('OPENROUTER_API_KEY')
    expect(catalogoPublico(entorno({ resolverClaude: () => null })).modelos.find(m => m.id === 'fable-5.1')!.disponible).toBe(false)
  })

  it('los interruptores se guardan en orden de catálogo e ignoran ids desconocidos', () => {
    const db = new Database(':memory:')
    expect(guardarHabilitado(db, 'fable-5.1', true)).toEqual(['opus-5.5', 'fable-5.1', 'deepseek-v4.1-flash', 'sonnet-5.5', 'haiku-5.5', 'gpt-6-luna'])
    expect(guardarHabilitado(db, 'opus-5.5', false)).toEqual(['fable-5.1', 'deepseek-v4.1-flash', 'sonnet-5.5', 'haiku-5.5', 'gpt-6-luna'])
    expect(leerHabilitados(db)).toEqual(['fable-5.1', 'deepseek-v4.1-flash', 'sonnet-5.5', 'haiku-5.5', 'gpt-6-luna'])
    expect(() => guardarHabilitado(db, 'otro', true)).toThrow()
  })

  it('consulta OpenRouter una vez por hora y no cachea fallos', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-6-luna', pricing: { prompt: '0.0000001', completion: '0.0000005' } }] })))
    await consultarOpenRouter(fetcher as unknown as typeof fetch, 1000)
    await consultarOpenRouter(fetcher as unknown as typeof fetch, 2000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    olvidarOpenRouter()
    const falla = vi.fn(async () => new Response('x', { status: 503 }))
    expect((await consultarOpenRouter(falla as unknown as typeof fetch, 1000)).error).toContain('503')
    await consultarOpenRouter(falla as unknown as typeof fetch, 1001)
    expect(falla).toHaveBeenCalledTimes(2)
  })

  it('el catálogo de Codex de DeepSeek no cambia; los nuevos anuncian bajo/medio/alto y su ventana', () => {
    const deepseek = JSON.parse(catalogoJson(rutaDeCuenta('deepseek')!)).models[0]
    expect(deepseek.supported_reasoning_levels.map((l: { effort: string }) => l.effort)).toEqual(['low', 'high', 'max'])
    expect(deepseek.default_reasoning_level).toBe('high')
    const luna = JSON.parse(catalogoJson(rutaDeCuenta('gpt-luna')!)).models[0]
    expect(luna).toMatchObject({ slug: 'openai/gpt-6-luna', display_name: 'GPT-6 Luna', default_reasoning_level: 'medium', context_window: 1_050_000, apply_patch_tool_type: null })
    expect(luna.supported_reasoning_levels.map((l: { effort: string }) => l.effort)).toEqual(['low', 'medium', 'high'])
    expect(luna.base_instructions).toContain('based on GPT-6 Luna')
  })

  it('ninguna ruta por API difiere los MCP detrás de la búsqueda de herramientas (manos y web_* visibles)', () => {
    for (const cuenta of ['deepseek', 'gpt-luna']) expect(JSON.parse(catalogoJson(rutaDeCuenta(cuenta)!)).models[0].supports_search_tool).toBe(false)
  })
})
