/**
 * `encargar` (nodo E, 3 oct): el pedido completo en una llamada MCP, con el freno obedeciendo SOLO la cita
 * textual de Daniel, avance en vivo y un resultado con pasos, tiempo y URL o captura.
 *
 * El modelo es un guion: se reemplaza el SDK de Claude por uno falso que llama a las herramientas del cerebro en
 * el orden que dice cada prueba. Nada toca la pantalla: el adaptador es falso y la web va apagada.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Adaptador } from './contrato.js'

// ---------- Modelo de guion (sustituye al SDK) ----------
type PasoGuion = { tool: string; args: any } | 'colgar'
const sdk = vi.hoisted(() => ({ guion: [] as any[], prompts: [] as string[], respuestas: [] as { tool: string; text: string; isError?: boolean }[], modelos: [] as string[], herramientas: [] as string[][] }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  tool: (name: string, _d: string, _s: unknown, handler: (a: any) => Promise<any>) => ({ name, handler }),
  createSdkMcpServer: (o: { tools: any[] }) => ({ tools: o.tools }),
  query: ({ prompt, options }: any) => {
    let cerrado = false
    let soltar: () => void = () => {}
    const gen = (async function* () {
      for await (const m of prompt) { sdk.prompts.push(String(m.message.content)); break }
      sdk.modelos.push(options.model)
      const tools = options.mcpServers.manos.tools as { name: string; handler: (a: any) => Promise<any> }[]
      sdk.herramientas.push(tools.map(t => t.name))
      for (const p of sdk.guion as PasoGuion[]) {
        if (cerrado) return
        if (p === 'colgar') { await new Promise<void>(ok => { soltar = ok }); if (cerrado) return; continue }
        const t = tools.find(x => x.name === p.tool)
        if (!t) throw new Error(`el guion pide ${p.tool}, que el cerebro no ofrece`)
        const r = await t.handler(structuredClone(p.args))
        sdk.respuestas.push({ tool: p.tool, text: r.content[0].text, isError: r.isError })
      }
      yield { type: 'result', subtype: 'success', total_cost_usd: 0.01 }
    })()
    return Object.assign(gen, { close: () => { cerrado = true; soltar() } })
  },
}))

const { pedir, citaLiteral, resumirPasos } = await import('./cerebro.js')
const { ejecutarEncargar, ENCARGAR_TOOL, preguntaPara } = await import('./encargar.js')
const mcp = await import('./mcp-stdio.js')

// ---------- Adaptador falso que anota lo que le llega ----------
function falso() {
  const actuar: any[] = []
  const mostrar: any[] = []
  const a: Adaptador = {
    nombre: 'falso',
    observar: async p => ({ app: 'Notas', pid: 7, ventana: 3, titulo: 'Nota', elementos: [{ ref: 'e1', rol: 'AXButton', etiqueta: 'Enviar' }, { ref: 'e2', rol: 'AXTextArea', etiqueta: 'Mensaje' }], texto: '[e1] AXButton «Enviar»\n[e2] AXTextArea «Mensaje»', total_elementos: 2, ...(p.captura ? { captura: '/tmp/falsa.png' } : {}) }),
    actuar: async p => { actuar.push(structuredClone(p)); return { ok: true, efecto: 'confirmado' } },
    apps: async () => [{ nombre: 'Notas', bundle: 'com.apple.Notes', pid: 7, activa: false }],
    abrir: async () => ({ pid: 7, ventanas: [] }),
    ventanas: async () => [{ id: 3, pid: 7, app: 'Notas', titulo: 'Nota', marco: { x: 0, y: 0, w: 800, h: 600 }, en_pantalla: true }] as any,
    verificar: async () => ({ cumple: true, detalle: '' }),
    cursor: async () => ({ x: 1, y: 2 }),
    salud: async () => ({ ok: true, detalle: '' }),
    mostrar: async p => { mostrar.push(p) },
    cerrar: async () => {},
  }
  return { a, actuar, mostrar }
}

const decisor = () => ({ nombre: 'nada', decidir: async () => { throw new Error('no se usa') } })
const base = (m: Adaptador) => ({ manos: m, decisor, web: null, sinRecetas: true, sinPrecalentar: true, sinAprender: true, silencio: true } as const)

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'encargar-'))
  process.env.MANOS_BITACORA_DIR = join(dir, 'bitacora')
  process.env.MANOS_ENCARGOS_DIR = join(dir, 'encargos')
  process.env.MANOS_RECETAS_DIR = join(dir, 'recetas')
})
afterAll(() => { delete process.env.MANOS_ENCARGOS_DIR })
beforeEach(() => { sdk.guion = []; sdk.prompts = []; sdk.respuestas = []; sdk.modelos = []; sdk.herramientas = [] })

describe('freno: la autoridad es la cita textual de Daniel, no la redacción de Levy', () => {
  it('citaLiteral exige un trozo real (≥4 letras) de sus palabras', () => {
    expect(citaLiteral('escríbele a Lucía que llego tarde', 'llego tarde')).toBe(true)
    expect(citaLiteral('escríbele a Lucía que llego tarde', 'sí, envíalo')).toBe(false)
    expect(citaLiteral('escríbele a Lucía que llego tarde', '')).toBe(false)
    expect(citaLiteral('escríbele a Lucía', 'a')).toBe(false)
  })

  it('una confirmación que solo está en el pedido de Levy se quita; la que está en la cita llega al freno', async () => {
    const { a, actuar } = falso()
    sdk.guion = [
      { tool: 'observar', args: { pid: 7 } },
      { tool: 'actuar', args: { pid: 7, accion: 'click', ref: 'e1', confirmacion: 'sí, envíalo ya' } },
      { tool: 'observar', args: { pid: 7 } },
      { tool: 'actuar', args: { pid: 7, accion: 'click', ref: 'e1', confirmacion: 'mándale que llego tarde' } },
      { tool: 'terminar', args: { estado: 'hecho', resumen: 'enviado', evidencia: 'leído de vuelta' } },
    ]
    const r = await pedir('La persona dijo «sí, envíalo ya»: manda el mensaje a Lucía', { ...base(a), cita: 'mándale que llego tarde a Lucía' })
    expect(actuar[0].confirmacion).toBeUndefined()
    expect(actuar[1].confirmacion).toBe('mándale que llego tarde')
    expect(r.estado).toBe('hecho')
    // Personas de por medio: empieza en Opus (estándar firmado), y el modelo ve la cita aparte.
    expect(sdk.modelos[0]).toBe('claude-opus-5-5')
    expect(sdk.prompts[0]).toMatch(/SUS PALABRAS TEXTUALES[^\n]*mándale que llego tarde/)
  })

  it('«ponme» en el pedido de Levy no trae nada al frente si Daniel no lo dijo', async () => {
    const { a, mostrar } = falso()
    sdk.guion = [
      { tool: 'mostrar', args: { ventana: 3 } },
      { tool: 'terminar', args: { estado: 'hecho', resumen: 'listo' } },
    ]
    await pedir('ponme la nota abierta', { ...base(a), cita: 'lee la nota del plan' })
    expect(mostrar).toHaveLength(0)
    expect(sdk.respuestas[0]).toMatchObject({ tool: 'mostrar', isError: true })
    expect(sdk.respuestas[0].text).toMatch(/no dice «ponme»/)
  })

  it('con la extensión viva no se ofrece navegar (abre ventanas en el Chrome de Daniel; demo del 3 oct)', async () => {
    const { a } = falso()
    const canal = { llamar: async () => [], cerrar: async () => {} }
    sdk.guion = [{ tool: 'terminar', args: { estado: 'hecho', resumen: 'ok' } }]
    await pedir('abre la página de prueba', { ...base(a), web: () => ({ canal, ultimaPestana: null } as any) })
    expect(sdk.herramientas[0]).toContain('web_abrir')
    expect(sdk.herramientas[0]).not.toContain('navegar')
    await pedir('abre la página de prueba', { ...base(a) })
    expect(sdk.herramientas[1]).toContain('navegar')
  })

  it('el modelo que topa con el freno termina en requiere_confirmacion y encargar lo devuelve como pregunta', () => {
    const q = preguntaPara({ estado: 'requiere_confirmacion', detalle: 'el botón Enviar manda el mensaje' })
    expect(q).toMatch(new RegExp(`Pregúntale a ${DUENO}`))
    expect(q).toMatch(/Enviar/)
    expect(preguntaPara({ estado: 'hecho' })).toBeUndefined()
  })
})

describe('encargar: resultado completo, avance y tope', () => {
  it('devuelve resultado, evidencia, pasos resumidos, tiempo y captura; avisa cada paso', async () => {
    const { a } = falso()
    sdk.guion = [
      { tool: 'observar', args: { pid: 7 } },
      { tool: 'actuar', args: { pid: 7, accion: 'escribir', ref: 'e2', texto: 'hola' } },
      { tool: 'terminar', args: { estado: 'hecho', resumen: 'texto escrito sin enviar', evidencia: 'valor leído: «hola»' } },
    ]
    const avances: any[] = []
    const r = await ejecutarEncargar({ pedido: 'escribe «hola» en la nota', cita: 'escribe hola en la nota' }, {
      manos: a, decisor,
      pedir: (p, op) => pedir(p, { ...op, ...base(a), cita: op.cita, captura: op.captura, progreso: op.progreso, presupuestoMs: op.presupuestoMs }),
      progreso: p => avances.push(p),
    })
    const j = JSON.parse(r.text)
    expect(r.error).toBeFalsy()
    expect(j).toMatchObject({ estado: 'hecho', ok: true, resultado: 'texto escrito sin enviar', evidencia: 'valor leído: «hola»', ruta: 'modelo', captura: '/tmp/falsa.png' })
    expect(j.pasos.join('\n')).toMatch(/actuar escribir/)
    expect(typeof j.tiempo_s).toBe('number')
    expect(avances.map(x => x.fase)).toEqual(expect.arrayContaining(['inicio', 'modelo', 'paso', 'cierre', 'fin']))
    expect(avances.every(x => x.encargo === j.encargo)).toBe(true)
    // La UI lee el estado en disco: termina con el resultado y sin texto de la app.
    const estado = JSON.parse(readFileSync(join(process.env.MANOS_ENCARGOS_DIR!, `${j.encargo}.json`), 'utf8'))
    expect(estado).toMatchObject({ estado: 'hecho', ok: true, tiempo_s: j.tiempo_s })
    expect(JSON.stringify(estado)).not.toMatch(/Mensaje»|AXTextArea «/)
  })

  it('sin cita no corre: el freno necesita a quién obedecer', async () => {
    const { a } = falso()
    const r = await ejecutarEncargar({ pedido: 'borra la nota' }, { manos: a, decisor, pedir: async () => { throw new Error('no debía correr') } })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/cita/)
  })

  it('el tope corta un modelo colgado y no abre otro intento', async () => {
    const { a } = falso()
    sdk.guion = ['colgar']
    const t = Date.now()
    const r = await pedir('cuenta los guardados', { ...base(a), presupuestoMs: 3500 })
    expect(Date.now() - t).toBeLessThan(6000)
    expect(r.estado).toBe('fallo')
    expect(r.detalle).toMatch(/se agotó el tiempo/)
    expect(r.intentos).toHaveLength(1)
  }, 10_000)

  it('Daniel detiene el encargo: se corta el modelo, no se abre otro intento y las manos sueltan (el Halo se apaga)', async () => {
    const { a } = falso()
    let soltadas = 0
    ;(a as any).soltar = async () => { soltadas++ }
    sdk.guion = ['colgar']
    const control = new AbortController()
    setTimeout(() => control.abort(), 300)
    const t = Date.now()
    const r = await ejecutarEncargar({ pedido: 'cuenta los guardados', cita: 'cuenta los guardados' }, { manos: a, decisor, pedir: (pd, op) => pedir(pd, { ...op, ...base(a), presupuestoMs: 60_000 }), senal: control.signal })
    expect(Date.now() - t).toBeLessThan(3000)
    expect(JSON.parse(r.text).resultado).toMatch(new RegExp(`${DUENO_M} detuvo`))
    expect(sdk.modelos).toHaveLength(1)
    expect(soltadas).toBe(1)
  }, 10_000)

  it('las manos sueltan también si el cerebro revienta', async () => {
    const { a } = falso()
    let soltadas = 0
    ;(a as any).soltar = async () => { soltadas++ }
    await ejecutarEncargar({ pedido: 'x', cita: 'x' }, { manos: a, decisor, pedir: async () => { throw new Error('boom') } })
    expect(soltadas).toBe(1)
  })

  it('notifications/cancelled del MCP aborta el encargo en curso', async () => {
    const r = await mcp.handle({ method: 'notifications/cancelled', params: { requestId: 999, reason: 'Daniel detuvo' } } as any)
    expect(r).toBeNull()
  })

  it('resumirPasos quita duplicados seguidos y recorta largo', () => {
    const p = (accion: string) => ({ herramienta: 'actuar', accion, resultado: 'ok' as const, ms: 1 })
    expect(resumirPasos([p('click'), p('click'), p('tecla')])).toEqual(['actuar click → ok', 'actuar tecla → ok'])
    const largo = resumirPasos(Array.from({ length: 30 }, (_, i) => p(`c${i}`)), 10)
    expect(largo).toHaveLength(10)
    expect(largo[6]).toMatch(/pasos más/)
  })
})

describe('encargar en el servidor MCP', () => {
  it('es la primera herramienta y las instrucciones la ponen antes que las finas', async () => {
    const lista = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) as any
    expect(lista.result.tools[0].name).toBe('encargar')
    expect(lista.result.tools[0].inputSchema.required).toEqual(['pedido', 'cita'])
    const ini = await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} }) as any
    const txt = ini.result.instructions as string
    expect(txt.indexOf('encargar')).toBeGreaterThan(-1)
    expect(txt.indexOf('encargar')).toBeLessThan(txt.indexOf('observa → actúa'))
    expect(txt).toMatch(/herramientas finas[^.]*minutos/)
    expect(ENCARGAR_TOOL.description).toMatch(/PRIMERA OPCIÓN/)
  })

  it('con progressToken manda notifications/progress crecientes y responde con el resultado', async () => {
    const { a } = falso()
    mcp.usarAdaptador(a)
    sdk.guion = [
      { tool: 'observar', args: { pid: 7 } },
      { tool: 'terminar', args: { estado: 'hecho', resumen: 'la nota dice hola', evidencia: 'título «Nota»' } },
    ]
    mcp.usarCerebro((p, op) => pedir(p, { ...op, ...base(a), cita: op.cita, captura: op.captura, progreso: op.progreso, presupuestoMs: op.presupuestoMs }))
    const notas: any[] = []
    const r = await mcp.handle({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'encargar', arguments: { pedido: 'lee la nota', cita: 'qué dice la nota' }, _meta: { progressToken: 'tok-1' } } }, n => notas.push(n)) as any
    expect(r.result.isError).toBe(false)
    expect(JSON.parse(r.result.content[0].text)).toMatchObject({ estado: 'hecho', resultado: 'la nota dice hola' })
    expect(notas.length).toBeGreaterThan(2)
    expect(notas.every(n => n.method === 'notifications/progress' && n.params.progressToken === 'tok-1')).toBe(true)
    const progresos = notas.map(n => n.params.progress)
    expect(progresos).toEqual([...progresos].sort((x, y) => x - y))
    expect(new Set(progresos).size).toBe(progresos.length)
    expect(readdirSync(process.env.MANOS_ENCARGOS_DIR!).some(f => f.endsWith('.json'))).toBe(true)
  })

  it('sin progressToken no manda notificaciones', async () => {
    const { a } = falso()
    mcp.usarAdaptador(a)
    sdk.guion = [{ tool: 'terminar', args: { estado: 'hecho', resumen: 'ok' } }]
    const notas: any[] = []
    await mcp.handle({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'encargar', arguments: { pedido: 'x', cita: 'haz x' } } }, n => notas.push(n))
    expect(notas).toHaveLength(0)
  })
})
