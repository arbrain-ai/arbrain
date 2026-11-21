import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aEspanol, reloj } from './textos.js'
import { HERRAMIENTAS_EDITOR, SCARLET_VISIBLES, ejecutarEditor, llamadasDe, proyectoMasReciente, type Contexto } from './herramientas.js'
import { editorHabilitado } from './config.js'
import { emitirEditor, sincronizar } from '../cabina/panel-bus.js'

const CAMBIOS = [
  { id: 'chg_a_review', state: 'ready', taskId: 'tsk_1', fromVersion: 'v1', toVersion: 'v2', cutAssessments: [
    { index: 0, verdict: 'ask', start: 0, end: 613.6, summary: 'Quitar los 10:13 de preparación', reason: 'antes de la intro' },
    { index: 1, verdict: 'cut', start: 700, end: 701 },
    { index: 2, verdict: 'ask', askOrder: 2, start: 864, end: 865.7, summary: 'El «con, con»' },
  ] },
  { id: 'chg_b_review', state: 'rejected', cutAssessments: [{ index: 0, verdict: 'ask', start: 1, end: 2 }] },
]

function ctxFalso(rutas: Record<string, unknown>, llamadas: { method: string; ruta: string; body?: unknown }[] = []): Contexto {
  return {
    motor: (async (method: string, ruta: string, body?: unknown) => {
      llamadas.push({ method, ruta, body })
      const r = rutas[`${method} ${ruta}`]
      if (r === undefined) throw new Error(`ruta no prevista ${method} ${ruta}`)
      return r
    }) as Contexto['motor'],
    activo: async () => 'prj_uno',
    elegir: () => {},
    lanzarIngesta: () => ({ pid: 1, log: '/tmp/x.log' }),
    abrir: async (p, t) => ({ confirmado: true, text: `abrí ${p ?? 'galería'} (${t})` }),
  }
}

describe('editor de video', () => {
  it('traduce los resúmenes automáticos del motor Scarlet', () => {
    expect(aEspanol('Removed 441 s across 61 cuts.')).toBe('Quité 441 s en 61 cortes.')
    expect(aEspanol('Removed 88.27 s across 26 cuts. Dialogue cuts are pending review.')).toBe('Quité 88,27 s en 26 cortes. Hay cortes de diálogo esperando tu revisión.')
    expect(aEspanol('Removed 1.7 s at 2:03.')).toBe('Quité 1,7 s en 2:03.')
    expect(aEspanol('Review 3 optional dialogue cuts')).toBe('Revisar 3 cortes opcionales de diálogo')
    expect(aEspanol('Corté las muletillas')).toBe('Corté las muletillas')
    expect(reloj(613.6)).toBe('10:14')
    expect(reloj(3725)).toBe('1:02:05')
  })

  it('las dudas son los «ask» de cambios que esperan revisión, numeradas', () => {
    const ls = llamadasDe(CAMBIOS)
    expect(ls.map(l => [l.n, l.cambio, l.indice])).toEqual([[1, 'chg_a_review', 0], [2, 'chg_a_review', 2]])
    expect(proyectoMasReciente([{ id: 'prj_a', updatedAt: '2026-11-18' }, { id: 'prj_b', updatedAt: '2026-11-19' }])).toBe('prj_b')
  })

  it('llamadas lista las dudas y guarda la elección de Daniel con las versiones del cambio', async () => {
    const hechas: { method: string; ruta: string; body?: unknown }[] = []
    const ctx = ctxFalso({ 'GET /projects/prj_uno/changes': { changes: CAMBIOS }, 'PUT /changes/chg_a_review/cut-choices': {} }, hechas)
    const lista = await ejecutarEditor('llamadas', {}, ctx)
    expect(lista.error).toBeFalsy()
    expect(lista.text).toMatch(/2 duda\(s\)/)
    expect(lista.text).toMatch(/1\. 0:00–10:14 \(10:14\)/)
    expect(lista.text).toMatch(/2\. 14:24–14:26 \(1,7 s\)/)
    const r = await ejecutarEditor('llamadas', { cambio: 'chg_a_review', cortar: [1], conservar: [2] }, ctx)
    expect(r.error).toBeFalsy()
    expect(hechas.at(-1)).toEqual({ method: 'PUT', ruta: '/changes/chg_a_review/cut-choices', body: { fromVersion: 'v1', toVersion: 'v2', choices: [{ index: 0, choice: 'cut' }, { index: 2, choice: 'keep' }] } })
  })

  it('pedir_pase usa la skill de estilo por defecto; tarea traduce el resumen', async () => {
    const hechas: { method: string; ruta: string; body?: unknown }[] = []
    const ctx = ctxFalso({ 'POST /projects/prj_uno/tasks': { task: { id: 'tsk_9' } }, 'GET /tasks/tsk_9': { task: { id: 'tsk_9', kind: 'edit', state: 'done', instruction: '/daniel-talking-head', summary: 'Removed 61.2 s across 12 cuts.', workedMs: 1_260_000 } } }, hechas)
    expect((await ejecutarEditor('pedir_pase', {}, ctx)).text).toMatch(/tsk_9/)
    expect(hechas[0].body).toMatchObject({ kind: 'edit', instruction: '/daniel-talking-head', effort: 'high', model: 'opus' })
    const t = await ejecutarEditor('tarea', { tarea: 'tsk_9' }, ctx)
    expect(t.text).toMatch(/terminada, 21 min/)
    expect(t.text).toMatch(/Quité 61,2 s en 12 cortes/)
    expect((await ejecutarEditor('tarea', { tarea: 'rm -rf' }, ctx)).error).toBe(true)
  })

  it('valida antes de tocar el motor: toma sin cámara, proyecto mal formado', async () => {
    const ctx = ctxFalso({})
    const dir = mkdtempSync(path.join(tmpdir(), 'toma-'))
    expect((await ejecutarEditor('crear_desde_toma', { carpeta: dir }, ctx)).text).toMatch(/no tiene camara\.mp4/)
    writeFileSync(path.join(dir, 'camara.mp4'), '')
    expect((await ejecutarEditor('crear_desde_toma', { carpeta: dir }, ctx)).text).toMatch(/Ingesta lanzada \(pid 1\)/)
    expect((await ejecutarEditor('versiones', { proyecto: '../x' }, ctx)).error).toBe(true)
    expect((await ejecutarEditor('crear_desde_toma', { carpeta: '/Users/x/Movies/OBS/abortadas/2026-11-19_05-30-00' }, ctx)).text).toMatch(/guarda de cámara/)
  })

  it('abrir_editor pasa el nombre del proyecto; con galeria, sin proyecto', async () => {
    const ctx = ctxFalso({ 'GET /projects': { projects: [{ id: 'prj_uno', name: 'Toma 26 sep' }] } })
    expect((await ejecutarEditor('abrir_editor', {}, ctx)).text).toMatch(/abrí prj_uno \(Toma 26 sep\)/)
    expect((await ejecutarEditor('abrir_editor', { galeria: true }, ctx)).text).toMatch(/abrí galería/)
  })

  it('lo que Levy carga por turno cabe: herramientas propias pequeñas y Scarlet acotado', () => {
    expect(JSON.stringify(HERRAMIENTAS_EDITOR).length).toBeLessThan(6000)
    expect(SCARLET_VISIBLES.has('timeline_propose')).toBe(false)
    expect(SCARLET_VISIBLES.has('dialogue_apply_cuts')).toBe(false)
  })

  it('el interruptor: LEVY_EDITOR_MCP=0 y la edición cliente lo apagan', () => {
    expect(editorHabilitado({ ...process.env, LEVY_EDITOR_MCP: '0' })).toBe(false)
    expect(editorHabilitado({ ...process.env, ARBRAIN_EDICION: 'cliente' })).toBe(false)
  })

  it('bus: el comando editor solo va a una app que sabe atenderlo', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'panel-'))
    const ahora = Date.now()
    sincronizar({ clientId: 'web-vieja', dispositivo: 'mac', conversacion: 'conv-1', escribio: { 'conv-1': new Date(ahora).toISOString() } }, ahora, dir)
    const viejo = emitirEditor('prj_uno', 'Toma', 'conv-1', ahora, dir)
    expect(viejo.versionVieja).toBe(true)
    expect(viejo.comando.para).toBe('nadie')
    expect(sincronizar({ clientId: 'web-vieja', dispositivo: 'mac', conversacion: 'conv-1' }, ahora + 10, dir).comandos).toHaveLength(0)
    sincronizar({ clientId: 'web-nueva', dispositivo: 'mac', conversacion: 'conv-1', sabe: ['conversacion', 'editor'] }, ahora + 20, dir)
    const nuevo = emitirEditor('prj_uno', 'Toma', 'conv-1', ahora + 30, dir)
    expect(nuevo.versionVieja).toBe(false)
    expect(nuevo.comando.input).toEqual({ vista: 'editor', titulo: 'Toma', pantalla: 'secundaria', proyecto: 'prj_uno' })
    const llegan = sincronizar({ clientId: 'web-nueva', dispositivo: 'mac', conversacion: 'conv-1', sabe: ['conversacion', 'editor'] }, ahora + 40, dir).comandos
    expect(llegan.map(c => c.accion)).toEqual(['editor'])
  })
})
