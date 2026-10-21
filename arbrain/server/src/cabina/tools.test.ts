import { describe, expect, it } from 'vitest'
import { callCabina, parseMostrar, parseAbrir, CABINA_TOOLS, cabinaDynamicTools } from './tools.js'
import { handle } from './mcp-stdio.js'

describe('cabina', () => {
  it('titular de negocio: la promesa, el copy aprobado o el precio; nunca un registro de firma', async () => {
    const { titular } = await import('./negocio.js')
    expect(titular('# X\n## Promesa HT\nEscala a $999 USD al mes. Otra cosa.', '')).toBe('Escala a $999 USD al mes.')
    expect(titular('# X\nEs la fuente del About: «Deja a la IA trabajando por ti», tres clases.', '')).toMatch(/^«Deja a la IA/)
    expect(titular('# X\n1 ene · FIRMADO por la persona: «lanzar el 15». Precio 1,234 y tope 9 se reconfirman.', '')).toBe('Precio 1,234 y tope 9 se reconfirman.')
  })
  it('titular con ancla: una frase partida en dos líneas del markdown sale entera', async () => {
    const { titular } = await import('./negocio.js')
    expect(titular('# X\n\nEn 90 días, tu Cerebro Artificial vendiéndolo a negocios, sin\ncontratar a nadie ni vender tus horas. Más.\n', '', /^En 90 días/))
      .toBe('En 90 días, tu Cerebro Artificial vendiéndolo a negocios, sin contratar a nadie ni vender tus horas.')
  })
  it('valida vistas y fechas reales', () => {
    expect(parseMostrar({ vista: 'calendario', alcance: 'mes', fecha: '2026-10-01' })).toMatchObject({ vista: 'calendario', alcance: 'mes' })
    expect(() => parseMostrar({ vista: 'calendario', fecha: '2026-02-30' })).toThrow(/no existe/)
    expect(() => parseMostrar({ vista: 'otra' })).toThrow(/vista debe ser/)
    expect(() => parseMostrar({ vista: 'lienzo' })).toThrow(/paginaId/)
    // Sección Lienzo (3 oct 2026): sin página abre la última usada; la zona sí necesita página y solo es del lienzo.
    expect(parseAbrir({ destino: 'lienzo' })).toMatchObject({ destino: 'lienzo' })
    expect(parseAbrir({ destino: 'lienzo', paginaId: 'abc', zona: 'ht:hito' })).toMatchObject({ zona: 'ht:hito' })
    expect(() => parseAbrir({ destino: 'lienzo', zona: 'ht:hito' })).toThrow(/paginaId/)
    expect(() => parseAbrir({ destino: 'calendario', zona: 'x' })).toThrow(/lienzo/)
    expect(parseMostrar({ vista: 'negocio', seccion: 'oferta' })).toMatchObject({ seccion: 'oferta' })
    expect(parseMostrar({ vista: 'trabajos', agenteId: 7 })).toMatchObject({ agenteId: 7 })
    expect(() => parseMostrar({ vista: 'negocio', seccion: 'otra' })).toThrow(/seccion/)
  })
  it('los verbos con efecto validan antes de tocar nada', async () => {
    const { ejecutarCabina } = await import('./tools.js')
    expect((await ejecutarCabina('atender', {})).error).toBe(true)
    expect((await ejecutarCabina('delegar', { nombre: 'x', harness: 'bash', encargo: 'y', cwd: '/tmp/x' })).error).toBe(true)
    expect((await ejecutarCabina('cerrar', { agenteId: 'no' })).error).toBe(true)
  })
  it('confirma sin devolver datos ni HTML', () => {
    const r = callCabina('mostrar', { vista: 'objetivos', alcance: 'mes' })
    expect(r.error).toBeFalsy()
    expect(r.text).toMatch(/datos en vivo/)
    expect(callCabina('abrir', { destino: 'calendario', fecha: '2026-10-15' }).text).toMatch(/2026-10-15/)
    expect(callCabina('nada', {}).error).toBe(true)
  })
  it('habla MCP por stdio', async () => {
    expect(await handle({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).toMatchObject({ result: { serverInfo: { name: 'cabina' } } })
    expect(((await handle({ id: 2, method: 'tools/list' })) as { result: { tools: unknown[] } }).result.tools).toHaveLength(CABINA_TOOLS.length)
    expect(await handle({ id: 3, method: 'tools/call', params: { name: 'mostrar', arguments: { vista: 'centro' } } })).toMatchObject({ result: { isError: false } })
    expect(await handle({ method: 'notifications/initialized' })).toBeNull()
    expect(cabinaDynamicTools().map(t => t.name)).toEqual(['cabina_mostrar', 'cabina_pizarron', 'cabina_archivero', 'cabina_panel', 'cabina_abrir', 'cabina_atender', 'cabina_delegar', 'cabina_retomar', 'cabina_detener', 'cabina_interactivo', 'cabina_cerrar'])
  })
  it('la vista vive en el chat; fijar es opcional y explícito (panel-claridad)', () => {
    expect(parseMostrar({ vista: 'calendario' }).fijar).toBeUndefined()
    expect(parseMostrar({ vista: 'finanzas', fijar: true }).fijar).toBe(true)
    expect(() => parseMostrar({ vista: 'finanzas', fijar: 'sí' })).toThrow(/fijar/)
    expect(callCabina('mostrar', { vista: 'finanzas', fijar: true }).text).toMatch(/fijada en el panel/)
    expect(callCabina('mostrar', { vista: 'finanzas' }).text).not.toMatch(/panel/)
    const props = (CABINA_TOOLS.find(t => t.name === 'mostrar')!.inputSchema as { properties: Record<string, unknown> }).properties
    expect(props.fijar).toBeTruthy()
  })
  it('Levy puede mostrar finanzas y contenido (vistas v2)', () => {
    expect(callCabina('mostrar', { vista: 'finanzas' }).error).toBeUndefined()
    expect(callCabina('mostrar', { vista: 'contenido' }).error).toBeUndefined()
    expect(callCabina('mostrar', { vista: 'rutinas', fijar: true }).error).toBeUndefined()
    expect(callCabina('mostrar', { vista: 'servidores', fijar: true }).error).toBeUndefined()
  })
})
