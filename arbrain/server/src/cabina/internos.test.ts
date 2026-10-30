import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analizarTranscripcion, internas, observarEvento, observarSDK, olvidarEnMemoria, olvidarTranscripciones, rutaDeSalida, salidaDe, textoDeTranscripcion, tipoDe, vaciar } from './internos.js'

const ctx = { conversationId: 'c1', turnId: 't1' }

describe('tareas internas de Levy (subagentes del SDK y comandos en segundo plano)', () => {
  beforeEach(() => { process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'internos-')); olvidarEnMemoria(); olvidarTranscripciones() })

  it('clasifica por tipo del SDK', () => {
    expect(tipoDe('local_agent')).toBe('subagente')
    expect(tipoDe('local_bash')).toBe('comando')
    expect(tipoDe('local_workflow')).toBe('workflow')
    expect(tipoDe(undefined, 'Explore')).toBe('subagente')
  })

  it('sigue el ciclo de vida de un subagente en primer plano y guarda su resultado', async () => {
    observarEvento(ctx, { type: 'task_started', taskId: 'a1', description: 'Revisar el spec', subagentType: 'Explore', taskType: 'local_agent', toolUseId: 'tu1' })
    observarEvento(ctx, { type: 'task_progress', taskId: 'a1', description: 'Revisar el spec', totalTokens: 1200, toolUses: 3, lastToolName: 'Read', summary: 'Leyendo COMUN.md' })
    let [t] = await (vaciar().then(internas))
    expect(t).toMatchObject({ id: 'a1', tipo: 'subagente', estado: 'trabajando', resumen: 'Leyendo COMUN.md', tokens: 1200, detalle: 'Explore', conversacion: 'c1' })
    observarEvento(ctx, { type: 'tool_result', toolId: 'tu1', content: 'Encontré 3 conflictos.' })
    observarEvento(ctx, { type: 'task_notification', taskId: 'a1', status: 'completed', summary: 'Listo', totalTokens: 2000 })
    ;[t] = await (vaciar().then(internas))
    expect(t).toMatchObject({ estado: 'completada', tokens: 2000 })
    expect((await salidaDe('a1')).texto).toBe('Encontré 3 conflictos.')
  })

  it('un comando en segundo plano enlaza su archivo de salida y lo lee sin secretos', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'cc-')), 'tasks'); const { mkdirSync } = await import('node:fs'); mkdirSync(out)
    const f = join(out, 'b9x.output'); writeFileSync(f, 'compilando\nTOKEN=abc123456\nlisto\n')
    observarEvento(ctx, { type: 'task_started', taskId: 'b9x', description: 'npm run build', taskType: 'local_bash', toolUseId: 'tu2' })
    observarEvento(ctx, { type: 'tool_result', toolId: 'tu2', content: `Command running in background with ID: b9x. Output is being written to: ${f}` })
    await vaciar()
    const [t] = await internas()
    expect(t).toMatchObject({ tipo: 'comando', segundoPlano: true, salida: f })
    const s = await salidaDe('b9x', 10, x => x.replace(/TOKEN=\S+/, 'TOKEN=••••'))
    expect(s.fuente).toBe('archivo'); expect(s.texto).toContain('listo'); expect(s.texto).not.toContain('abc123456')
  })

  it('las notificaciones que llegan después del turno (buzón de fondo) cierran la tarea', async () => {
    observarSDK(ctx, { type: 'system', subtype: 'task_started', task_id: 'c3', description: 'Agente largo', task_type: 'local_agent' })
    observarSDK(ctx, { type: 'system', subtype: 'task_notification', task_id: 'c3', status: 'failed', summary: 'Se cayó', output_file: '/etc/passwd', usage: { total_tokens: 9, tool_uses: 1, duration_ms: 5 } })
    observarSDK(ctx, { type: 'system', subtype: 'task_started', task_id: 'amb', description: 'vigía', ambient: true })
    await vaciar()
    const l = await internas()
    expect(l.map(t => t.id)).toEqual(['c3'])
    expect(l[0].estado).toBe('falló')
    // una ruta fuera de las raíces del CLI nunca se lee
    expect((await salidaDe('c3')).fuente).toBe('resumen')
  })

  it('un comando lanzado desde un subagente recuerda a su agente padre (parent_task_id)', async () => {
    observarSDK(ctx, { type: 'system', subtype: 'task_started', task_id: 'ag', description: 'Póster por código', task_type: 'local_agent' })
    observarSDK(ctx, { type: 'system', subtype: 'task_started', task_id: 'bx', description: 'Wait for render', task_type: 'local_bash', parent_task_id: 'ag' })
    observarEvento(ctx, { type: 'task_started', taskId: 'by', description: 'Typecheck', taskType: 'local_bash' })
    await vaciar()
    const l = await internas()
    expect(l.find(t => t.id === 'bx')?.padre).toBe('ag')
    expect(l.find(t => t.id === 'by')?.padre).toBeUndefined()
    expect(l.find(t => t.id === 'ag')?.padre).toBeUndefined()
  })

  it('una tarea cuyo proceso dueño murió se muestra detenida', async () => {
    const ahora = new Date().toISOString()
    writeFileSync(join(process.env.ARBRAIN_CONFIG_DIR!, 'internos.json'), JSON.stringify([{ id: 'z', tipo: 'subagente', descripcion: 'x', estado: 'trabajando', desde: ahora, actualizado: ahora, conversacion: 'c', turno: 't', pid: 999999 }]))
    expect((await internas())[0]).toMatchObject({ estado: 'detenida' })
  })

  it('lee rutas y transcripciones del CLI', () => {
    expect(rutaDeSalida('Output is being written to: /private/tmp/claude-501/x/tasks/abc.output')).toBe('/private/tmp/claude-501/x/tasks/abc.output')
    expect(textoDeTranscripcion('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hola"},{"type":"tool_use","name":"Read"}]}}\n')).toBe('Hola\n· usó Read')
  })

  // 2 oct 2026 (Daniel: «los títulos no son descriptivos»): el título es la tarea con la que Levy lanzó
  // al agente; lo que el SDK anuncia después («Running Typecheck arbrain») es su actividad.
  it('el título conserva la descripción original aunque el SDK anuncie «Running …»', async () => {
    observarEvento(ctx, { type: 'task_started', taskId: 'a2', description: 'Barra de entrada: esfuerzo y contexto', subagentType: 'general-purpose', taskType: 'local_agent' })
    observarEvento(ctx, { type: 'task_progress', taskId: 'a2', description: 'Running Typecheck arbrain', totalTokens: 140127, toolUses: 72, lastToolName: 'Bash' })
    observarEvento(ctx, { type: 'task_updated', taskId: 'a2', description: 'Reading ChatPanel.tsx' })
    let [t] = await (vaciar().then(internas))
    expect(t.descripcion).toBe('Barra de entrada: esfuerzo y contexto')
    expect(t.actividad).toBe('Reading ChatPanel.tsx')
    expect(t).toMatchObject({ tokens: 140127, usos: 72, ultimaHerramienta: 'Bash' })
    // repetir el título no lo convierte en actividad
    observarEvento(ctx, { type: 'task_progress', taskId: 'a2', description: 'Barra de entrada: esfuerzo y contexto' })
    ;[t] = await (vaciar().then(internas))
    expect(t.actividad).toBe('Reading ChatPanel.tsx')
  })

  it('una tarea que nació sin descripción adopta la primera que llega', async () => {
    observarEvento(ctx, { type: 'task_started', taskId: 'a3', taskType: 'local_agent' })
    observarEvento(ctx, { type: 'task_progress', taskId: 'a3', description: 'Revisar el spec' })
    observarEvento(ctx, { type: 'task_progress', taskId: 'a3', description: 'Reading COMUN.md' })
    const [t] = await (vaciar().then(internas))
    expect(t).toMatchObject({ descripcion: 'Revisar el spec', actividad: 'Reading COMUN.md' })
  })

  it('la duración total y el resumen largo llegan con el cierre', async () => {
    observarSDK(ctx, { type: 'system', subtype: 'task_started', task_id: 'd1', description: 'Auditar permisos', task_type: 'local_agent' })
    observarSDK(ctx, { type: 'system', subtype: 'task_notification', task_id: 'd1', status: 'completed', summary: 'Informe: '.padEnd(900, 'x'), usage: { total_tokens: 96000, tool_uses: 11, duration_ms: 754_000 } })
    const [t] = await (vaciar().then(internas))
    expect(t).toMatchObject({ estado: 'completada', duracionMs: 754_000, tokens: 96000, usos: 11 })
    expect(t.resumen?.length).toBe(900)
  })
})

describe('transcripción de un subagente: título, modelo, contexto y lo que dijo', () => {
  const homeAntes = process.env.HOME
  let home: string
  const linea = (o: unknown) => JSON.stringify(o) + '\n'
  const asistente = (content: unknown[], extra: Record<string, unknown> = {}) => linea({ type: 'assistant', message: { role: 'assistant', model: 'claude-sonnet-5-5', content, usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: 9000, output_tokens: 50 }, ...extra } })
  const transcripcion = () =>
    linea({ type: 'user', message: { role: 'user', content: 'Quita el botón de buscar y revisa los tipos.' } }) +
    linea({ type: 'attachment', attachment: { type: 'hook' } }) +
    asistente([{ type: 'text', text: 'Voy a leer el panel.' }]) +
    asistente([{ type: 'tool_use', id: 'u1', name: 'Read', input: { file_path: '/repo/arbrain/PanelDerecho.tsx' } }]) +
    linea({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'ok' }] } }) +
    asistente([{ type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'npx tsc --noEmit', description: 'Typecheck arbrain TOKEN=abc123456' } }]) +
    asistente([{ type: 'tool_use', id: 'u3', name: 'Bash', input: { command: 'npx vitest run' } }]) +
    asistente([{ type: 'text', text: 'Listo: quité el botón y los tipos pasan.' }], { usage: { input_tokens: 3, cache_creation_input_tokens: 500, cache_read_input_tokens: 128_000, output_tokens: 80 } })

  beforeEach(() => {
    process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'internos-')); olvidarEnMemoria(); olvidarTranscripciones()
    home = mkdtempSync(join(tmpdir(), 'home-')); process.env.HOME = home
    const sub = join(home, '.claude/projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'), 'sesion-1/subagents')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, 'agent-ag1.jsonl'), transcripcion())
    writeFileSync(join(sub, 'agent-ag1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Quitar el buscador de Arbrain', toolUseId: 'tu' }))
  })
  afterEach(() => { process.env.HOME = homeAntes })

  it('analizarTranscripcion: encargo, modelo, contexto, lo dicho y herramientas agrupadas', () => {
    const d = analizarTranscripcion(transcripcion())
    expect(d.encargo).toBe('Quita el botón de buscar y revisa los tipos.')
    expect(d.modelo).toBe('claude-sonnet-5-5')
    expect(d.contexto).toBe(3 + 500 + 128_000)
    expect(d.dicho).toEqual(['Voy a leer el panel.', 'Listo: quité el botón y los tipos pasan.'])
    expect(d.final).toBe('Listo: quité el botón y los tipos pasan.')
    expect(d.herramientas).toEqual([{ nombre: 'Bash', n: 2 }, { nombre: 'Read', n: 1 }])
    expect(d.usos).toBe(3)
    expect(d.acciones[0]).toEqual({ herramienta: 'Read', objetivo: 'PanelDerecho.tsx' })
  })

  it('analizarTranscripcion ignora el modelo sintético y las líneas cortadas', () => {
    const d = analizarTranscripcion(asistente([{ type: 'text', text: 'hola' }]) + asistente([{ type: 'text', text: 'error' }], { model: '<synthetic>' }) + '{"type":"assistant","mess')
    expect(d.modelo).toBe('claude-sonnet-5-5')
    expect(d.dicho).toEqual(['hola', 'error'])
  })

  it('recupera el título original, el modelo y el contexto aunque el registro ya lo pisara', async () => {
    writeFileSync(join(process.env.ARBRAIN_CONFIG_DIR!, 'internos.json'), JSON.stringify([{ id: 'ag1', tipo: 'subagente', descripcion: 'Running Typecheck arbrain', estado: 'trabajando', desde: new Date().toISOString(), actualizado: new Date().toISOString(), conversacion: 'c1', turno: 't1', pid: process.pid, tokens: 140127 }]))
    const [t] = await internas()
    expect(t).toMatchObject({ descripcion: 'Quitar el buscador de Arbrain', actividad: 'Running Typecheck arbrain', modelo: 'claude-sonnet-5-5', contexto: 128_503, tokens: 140127 })
  })

  it('sin transcripción no inventa modelo ni contexto', async () => {
    writeFileSync(join(process.env.ARBRAIN_CONFIG_DIR!, 'internos.json'), JSON.stringify([{ id: 'sin-archivo', tipo: 'subagente', descripcion: 'Algo', estado: 'trabajando', desde: new Date().toISOString(), actualizado: new Date().toISOString(), conversacion: 'c1', turno: 't1', pid: process.pid }]))
    const [t] = await internas()
    expect(t.modelo).toBeUndefined(); expect(t.contexto).toBeUndefined(); expect(t.descripcion).toBe('Algo')
  })

  it('salidaDe entrega encargo, lo último que dijo, herramientas y acciones, sin secretos', async () => {
    writeFileSync(join(process.env.ARBRAIN_CONFIG_DIR!, 'internos.json'), JSON.stringify([{ id: 'ag1', tipo: 'subagente', descripcion: 'x', estado: 'completada', desde: new Date().toISOString(), actualizado: new Date().toISOString(), conversacion: 'c1', turno: 't1', pid: process.pid }]))
    const s = await salidaDe('ag1', 60, x => x.replace(/TOKEN=\S+/g, 'TOKEN=••••'))
    expect(s.fuente).toBe('archivo')
    expect(s.descripcion).toBe('Quitar el buscador de Arbrain')
    expect(s.detalle).toMatchObject({ encargo: 'Quita el botón de buscar y revisa los tipos.', final: 'Listo: quité el botón y los tipos pasan.', modelo: 'claude-sonnet-5-5', usos: 3 })
    expect(s.detalle?.herramientas[0]).toEqual({ nombre: 'Bash', n: 2 })
    expect(JSON.stringify(s)).not.toContain('abc123456')
    expect(s.detalle?.acciones.some(a => a.objetivo?.includes('TOKEN=••••'))).toBe(true)
    expect(s.texto).toContain('Voy a leer el panel.')
  })
})

describe('cierres que el SDK no emite (3 oct 2026)', () => {
  it('un shell «stopped» por notificación de sesión y un comando con su resultado dejan de trabajar', async () => {
    const { absorber } = await import('./internos-cierre.js')
    const { cerrarLoNotificado } = await import('./internos.js')
    const c = { notificadas: new Map<string, string>(), resultados: new Map<string, { fondo: boolean }>() }
    absorber([
      JSON.stringify({ type: 'user', message: { content: '<task-notification>\n<task-id>by12ya01u</task-id>\n<tool-use-id>toolu_01A</tool-use-id>\n<status>stopped</status>\n</task-notification>' } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_02B', content: 'listo' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_03C', content: 'Command running in background with ID: x' }] } }),
    ].join('\n'), c)
    const base = { tipo: 'comando' as const, descripcion: 'x', estado: 'trabajando' as const, desde: new Date().toISOString(), actualizado: new Date().toISOString(), conversacion: 'c', turno: 't', pid: process.pid }
    const l = await cerrarLoNotificado([
      { ...base, id: 'by12ya01u', toolUseId: 'toolu_01A', segundoPlano: true, salida: '/tmp/x/tasks/by12ya01u.output' },
      { ...base, id: 'fg', toolUseId: 'toolu_02B' },
      { ...base, id: 'bg', toolUseId: 'toolu_03C' },
      { ...base, id: 'sigue', toolUseId: 'toolu_04D' },
    ], async () => c)
    expect(l.map(t => [t.id, t.estado])).toEqual([['by12ya01u', 'detenida'], ['fg', 'completada'], ['bg', 'trabajando'], ['sigue', 'trabajando']])
  })
})
