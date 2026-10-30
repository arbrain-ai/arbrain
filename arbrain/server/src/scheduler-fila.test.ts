/**
 * Fila del scheduler en la edición cliente (24 oct 2026, hallazgo del prototipo del modo espejo): una rutina que se
 * queda esperando (un clic, un modelo lento) ya no detiene a las demás. La misma rutina nunca corre dos veces a la vez y
 * hay un tope de rutinas simultáneas. La instalación original sigue en fila, como siempre.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const store = mkdtempSync(join(tmpdir(), 'arbrain-fila-'))
const previo = { store: process.env.CLAUDECLAW_STORE_DIR, edicion: process.env.ARBRAIN_EDICION, paralelo: process.env.ARBRAIN_RUTINAS_PARALELO }
process.env.CLAUDECLAW_STORE_DIR = store

type Sched = typeof import('./scheduler.js')
type Db = typeof import('./db.js')
let s: Sched, db: Db

beforeAll(async () => {
  db = await import('./db.js')
  s = await import('./scheduler.js')
  db.initDatabase()
})
afterAll(() => {
  s._ejecutorParaPruebas(null)
  for (const [k, v] of [['CLAUDECLAW_STORE_DIR', previo.store], ['ARBRAIN_EDICION', previo.edicion], ['ARBRAIN_RUTINAS_PARALELO', previo.paralelo]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(store, { recursive: true, force: true })
})

const vencida = (id: string) => db.createTask({ id, chat_id: 'c', thread_id: null, prompt: `rutina ${id}`, schedule: '0 7 * * *', next_run: Math.floor(Date.now() / 1000) - 60, status: 'active', created_at: 1 } as never)
const esperar = async (cond: () => boolean, ms = 2000) => { const fin = Date.now() + ms; while (!cond() && Date.now() < fin) await new Promise(r => setTimeout(r, 10)); return cond() }

beforeEach(() => {
  db.getDb().prepare('DELETE FROM scheduled_tasks').run()
  delete process.env.ARBRAIN_RUTINAS_PARALELO
})

describe('fila del scheduler', () => {
  it('cliente: la segunda rutina corre aunque la primera siga esperando una confirmación', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const corridas: string[] = []
    let soltar: () => void = () => {}
    s._ejecutorParaPruebas((t) => {
      corridas.push(t.id)
      if (t.id === 'a-escribe-now') return new Promise<void>(r => { soltar = r }) // espera un clic que nadie da
      return Promise.resolve()
    })
    vencida('a-escribe-now'); vencida('b-brief')
    await s.runDueTasks()
    expect(await esperar(() => corridas.includes('b-brief'))).toBe(true)
    expect(s._enCursoParaPruebas().has('a-escribe-now')).toBe(true)
    // Un pase nuevo mientras la primera sigue: no la repite.
    await s.runDueTasks()
    expect(corridas.filter(x => x === 'a-escribe-now')).toHaveLength(1)
    soltar()
    expect(await esperar(() => s._enCursoParaPruebas().size === 0)).toBe(true)
  })

  it('cliente: tope de rutinas a la vez; lo que no cupo corre en cuanto hay lugar', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    process.env.ARBRAIN_RUTINAS_PARALELO = '1'
    const corridas: string[] = []
    const sueltas: Array<() => void> = []
    s._ejecutorParaPruebas((t) => { corridas.push(t.id); return new Promise<void>(r => sueltas.push(r)) })
    vencida('r1'); vencida('r2')
    await s.runDueTasks()
    expect(corridas).toHaveLength(1)
    sueltas.shift()!()
    expect(await esperar(() => corridas.length === 2)).toBe(true)
    sueltas.shift()!()
    expect(await esperar(() => s._enCursoParaPruebas().size === 0)).toBe(true)
  })

  it('una rutina que falla no tumba la fila', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const corridas: string[] = []
    s._ejecutorParaPruebas((t) => { corridas.push(t.id); return t.id === 'x-falla' ? Promise.reject(new Error('boom')) : Promise.resolve() })
    vencida('x-falla'); vencida('y-sigue')
    await s.runDueTasks()
    expect(await esperar(() => corridas.includes('y-sigue') && s._enCursoParaPruebas().size === 0)).toBe(true)
  })

  it('instalación original: sigue en fila (el pase espera cada rutina entera, una tras otra)', async () => {
    process.env.ARBRAIN_EDICION = 'original'
    const orden: string[] = []
    s._ejecutorParaPruebas(async (t) => { orden.push(`inicia ${t.id}`); await new Promise(r => setTimeout(r, 30)); orden.push(`termina ${t.id}`) })
    vencida('o1'); vencida('o2')
    await s.runDueTasks()
    orden.push('pase')
    expect(orden).toEqual(['inicia o1', 'termina o1', 'inicia o2', 'termina o2', 'pase'])
    expect(s._enCursoParaPruebas().size).toBe(0)
  })
})
