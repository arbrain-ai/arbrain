/**
 * Rutinas del alumno por HTTP (T8, 29 oct 2026): crear, validar, pausar, reanudar y borrar sobre la base real (SQLite en
 * una carpeta temporal). Lo que propone Levy con su pase nace en pausa.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const store = mkdtempSync(join(tmpdir(), 'arbrain-rutinas-'))
const previo = { store: process.env.CLAUDECLAW_STORE_DIR }
process.env.CLAUDECLAW_STORE_DIR = store

type R = typeof import('./rutinas.js')
type Db = typeof import('../db.js')
let r: R, db: Db
const sinAviso = () => null
const app = { conPase: false, aviso: sinAviso }
const pase = { conPase: true, aviso: sinAviso }

beforeAll(async () => {
  db = await import('../db.js')
  r = await import('./rutinas.js')
  db.initDatabase()
})
afterAll(() => {
  if (previo.store === undefined) delete process.env.CLAUDECLAW_STORE_DIR; else process.env.CLAUDECLAW_STORE_DIR = previo.store
  rmSync(store, { recursive: true, force: true })
})
beforeEach(() => { db.getDb().prepare('DELETE FROM scheduled_tasks').run() })

const crear = (cuerpo: Record<string, unknown>, op = app) => r.atenderRutinas('POST', '/schedule', cuerpo, op)!

describe('crear', () => {
  it('desde la app nace activa, con su próxima corrida y un id legible sin acentos', () => {
    const res = crear({ prompt: 'Resúmeme mi día y lo que tengo pendiente', schedule: '0 7 * * *' })
    expect(res.status).toBe(201)
    const t = res.cuerpo.tarea as { id: string; status: string; next_run: number; schedule: string }
    expect(t.status).toBe('active')
    expect(t.id).toMatch(/^rutina-resumeme-mi-dia-y-[a-z0-9]+$/)
    expect(t.next_run).toBeGreaterThan(Date.now() / 1000)
    const lista = r.atenderRutinas('GET', '/schedule', {}, app)!
    expect((lista.cuerpo.tasks as unknown[]).length).toBe(1)
    expect(lista.cuerpo).toHaveProperty('tz')
    expect(lista.cuerpo.aviso).toBeNull()
  })

  it('con el pase de Levy nace en pausa y lo dice', () => {
    const res = crear({ prompt: 'cada lunes revisa mis metas', schedule: '0 9 * * 1' }, pase)
    expect(res.status).toBe(201)
    expect((res.cuerpo.tarea as { status: string; id: string }).status).toBe('paused')
    expect((res.cuerpo.tarea as { id: string }).id.startsWith('levy-')).toBe(true)
    expect(String(res.cuerpo.mensaje)).toMatch(/Activar/)
    expect(db.getDueTasks()).toHaveLength(0)
  })

  it('valida la entrada: texto, horario, frecuencia y tope', () => {
    expect(crear({ schedule: '0 7 * * *' }).status).toBe(400)
    expect(crear({ prompt: 'ok', schedule: '0 7 * * *' }).status).toBe(400)
    expect(crear({ prompt: 'x'.repeat(r.PROMPT_MAX + 1), schedule: '0 7 * * *' }).status).toBe(400)
    for (const malo of [undefined, '', '0 7 * *', '0 7 * * * *', '61 7 * * *', '0 7 * * MON; rm', '@daily'])
      expect(crear({ prompt: 'resume mi día', schedule: malo }).status, String(malo)).toBe(400)
    const seguido = crear({ prompt: 'resume mi día', schedule: '*/5 * * * *' })
    expect(seguido.status).toBe(400)
    expect(String(seguido.cuerpo.error)).toMatch(/15 minutos/)
    expect(crear({ prompt: 'resume mi día', schedule: '*/15 * * * *' }).status).toBe(201)
    expect(crear({ prompt: 'resume mi día', schedule: '0 * * * *' }).status).toBe(201)
    for (let i = 2; i < r.MAX_RUTINAS; i++) db.createTask({ id: `t-${i}`, chat_id: 'c', thread_id: null, prompt: 'p', schedule: '0 7 * * *', next_run: 1, status: 'paused', created_at: 1 })
    const tope = crear({ prompt: 'una más', schedule: '0 8 * * *' })
    expect(tope.status).toBe(409)
  })

  it('el aviso explica por qué no correrían (p. ej. la suscripción sin llave de tope)', () => {
    const res = r.atenderRutinas('GET', '/schedule', {}, { conPase: false, aviso: () => 'no corren con tu suscripción' })!
    expect(res.cuerpo.aviso).toBe('no corren con tu suscripción')
  })
})

describe('pausar, reanudar y borrar', () => {
  it('pausa y reanuda sin tocar la última corrida', () => {
    const id = (crear({ prompt: 'resume mi día', schedule: '0 7 * * *' }).cuerpo.tarea as { id: string }).id
    db.getDb().prepare('UPDATE scheduled_tasks SET last_run = 1000, last_result = ? WHERE id = ?').run('Listo', id)
    expect(r.atenderRutinas('POST', `/schedule/${id}/pause`, {}, app)!.status).toBe(200)
    expect(db.getTask(id)!.status).toBe('paused')
    const re = r.atenderRutinas('POST', `/schedule/${id}/resume`, {}, app)!
    expect(re.status).toBe(200)
    const t = db.getTask(id)!
    expect(t.status).toBe('active')
    expect(t.last_run).toBe(1000)
    expect(t.last_result).toBe('Listo')
    expect(t.next_run).toBeGreaterThan(Date.now() / 1000)
  })

  it('borra; una que no existe da 404; métodos y rutas ajenas no son suyos', () => {
    const id = (crear({ prompt: 'resume mi día', schedule: '0 7 * * *' }).cuerpo.tarea as { id: string }).id
    expect(r.atenderRutinas('DELETE', `/schedule/${id}`, {}, app)!.status).toBe(200)
    expect(db.getTask(id)).toBeUndefined()
    expect(r.atenderRutinas('DELETE', `/schedule/${id}`, {}, app)!.status).toBe(404)
    expect(r.atenderRutinas('POST', `/schedule/${id}/run`, {}, app)).toBeNull()
    expect(r.atenderRutinas('GET', `/schedule/${id}`, {}, app)).toBeNull()
    expect(r.atenderRutinas('PUT', '/schedule', {}, app)).toBeNull()
    expect(r.atenderRutinas('GET', '/otra', {}, app)).toBeNull()
  })
})

describe('id y slug', () => {
  it('el slug es el de schedule-cli', () => {
    expect(r.slugRutina('Di hola al equipo hoy mismo')).toBe('di-hola-al-equipo')
    expect(r.idRutina('¿Qué pasó?', 'app', 0)).toBe('rutina-que-paso-0')
    expect(r.idRutina('!!!', 'levy', 0)).toBe('levy-rutina-0')
  })
})
