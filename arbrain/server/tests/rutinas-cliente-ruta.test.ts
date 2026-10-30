import { beforeEach, describe, expect, it, vi } from 'vitest'

// Taller › Rutinas de la edición cliente (T8, 29 oct 2026): la ruta web `/api/rutinas` (adaptador hacia el daemon) y el
// formateo de horarios que ve el dueño.
const d = vi.hoisted(() => ({ solo: vi.fn(), al: vi.fn() }))
vi.mock('@/lib/daemon-local', () => ({ soloAppCliente: d.solo, alDaemon: d.al, NOCACHE: { 'Cache-Control': 'no-store' } }))
import { GET, POST } from '../../src/app/api/rutinas/route'
import { DELETE, POST as ACCION } from '../../src/app/api/rutinas/[id]/route'
import { cronDeFormulario, cuandoRutina, cuerpoCrear, proximaEn, rutaDaemon, validarFormulario, vistaRutina } from '../../src/lib/rutinas-cliente'

const ok = () => Response.json({ ok: true })
const req = (metodo: string, cuerpo?: unknown) => new Request('http://127.0.0.1:3300/api/rutinas', { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), headers: { 'Content-Type': 'application/json' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  d.solo.mockReset().mockResolvedValue(null)
  d.al.mockReset().mockImplementation(async () => ok())
})

describe('/api/rutinas', () => {
  it('fuera de la edición cliente (o sin la app) no llega al daemon', async () => {
    d.solo.mockResolvedValue(Response.json({ error: 'No disponible en esta edición.' }, { status: 404 }))
    expect((await GET()).status).toBe(404)
    expect((await POST(req('POST', { prompt: 'resume mi día', schedule: '0 7 * * *' }))).status).toBe(404)
    expect((await DELETE(req('DELETE'), ctx('rutina-a'))).status).toBe(404)
    expect(d.al).not.toHaveBeenCalled()
  })

  it('lista y crea sobre /schedule del daemon; crear exige origen propio', async () => {
    await GET()
    expect(d.al).toHaveBeenLastCalledWith('/schedule')
    await POST(req('POST', { prompt: '  Resúmeme mi día  ', schedule: '0  7 * * *', extra: 'x' }))
    expect(d.solo).toHaveBeenLastCalledWith(expect.any(Request), true)
    expect(d.al).toHaveBeenLastCalledWith('/schedule', { method: 'POST', body: JSON.stringify({ prompt: 'Resúmeme mi día', schedule: '0 7 * * *' }) })
  })

  it('rechaza lo que no es un horario o un texto antes de llegar al daemon', async () => {
    for (const cuerpo of [{}, { prompt: 'hola', schedule: '@daily' }, { prompt: 'x', schedule: '0 7 * * *' }, { prompt: 'hola hola', schedule: '0 7 * * * *' }, null]) {
      expect((await POST(req('POST', cuerpo))).status, JSON.stringify(cuerpo)).toBe(400)
    }
    expect(d.al).not.toHaveBeenCalled()
  })

  it('pausar, reanudar, probar y borrar van a la ruta del daemon; ids raros y acciones ajenas, 400', async () => {
    await ACCION(req('POST', { accion: 'pausar' }), ctx('rutina-a-1'))
    expect(d.al).toHaveBeenLastCalledWith('/schedule/rutina-a-1/pause', { method: 'POST', body: '{}' })
    await ACCION(req('POST', { accion: 'reanudar' }), ctx('levy-b'))
    expect(d.al).toHaveBeenLastCalledWith('/schedule/levy-b/resume', { method: 'POST', body: '{}' })
    await ACCION(req('POST', { accion: 'probar' }), ctx('levy-b'))
    expect(d.al).toHaveBeenLastCalledWith('/schedule/levy-b/run', { method: 'POST', body: '{}' })
    await DELETE(req('DELETE'), ctx('levy-b'))
    expect(d.al).toHaveBeenLastCalledWith('/schedule/levy-b', { method: 'DELETE' })
    d.al.mockClear()
    expect((await ACCION(req('POST', { accion: 'borrar' }), ctx('levy-b'))).status).toBe(400)
    expect((await ACCION(req('POST', { accion: 'apagar' }), ctx('levy-b'))).status).toBe(400)
    expect((await ACCION(req('POST', { accion: 'pausar' }), ctx('../apagar'))).status).toBe(400)
    expect((await DELETE(req('DELETE'), ctx('a/b'))).status).toBe(400)
    expect(d.al).not.toHaveBeenCalled()
  })
})

describe('formulario simple a cron', () => {
  it('presets', () => {
    expect(cronDeFormulario({ tipo: 'diario', hora: '07:00' })).toEqual({ ok: true, schedule: '0 7 * * *' })
    expect(cronDeFormulario({ tipo: 'entre-semana', hora: '18:30' })).toEqual({ ok: true, schedule: '30 18 * * 1-5' })
    expect(cronDeFormulario({ tipo: 'semanal', hora: '09:05', dia: 1 })).toEqual({ ok: true, schedule: '5 9 * * 1' })
    expect(cronDeFormulario({ tipo: 'cada-hora' })).toEqual({ ok: true, schedule: '0 * * * *' })
    expect(cronDeFormulario({ tipo: 'avanzado', cron: ' 30  7 * * 1-5 ' })).toEqual({ ok: true, schedule: '30 7 * * 1-5' })
  })
  it('errores en palabras del dueño', () => {
    expect(cronDeFormulario({ tipo: 'diario', hora: '25:00' }).ok).toBe(false)
    expect(cronDeFormulario({ tipo: 'semanal', hora: '07:00', dia: 9 }).ok).toBe(false)
    expect(cronDeFormulario({ tipo: 'avanzado', cron: '@daily' }).ok).toBe(false)
    expect(validarFormulario({ que: ' ', tipo: 'diario', hora: '07:00' })).toEqual({ ok: false, error: 'Escribe qué quieres que haga.' })
    expect(validarFormulario({ que: 'cada mañana resúmeme mi día', tipo: 'diario', hora: '07:00' })).toEqual({ ok: true, prompt: 'cada mañana resúmeme mi día', schedule: '0 7 * * *' })
  })
})

describe('horario en lenguaje humano', () => {
  it('frases', () => {
    expect(cuandoRutina('0 7 * * *')).toBe('Cada día a las 7:00')
    expect(cuandoRutina('30 18 * * 1-5')).toBe('De lunes a viernes a las 18:30')
    expect(cuandoRutina('5 9 * * 1')).toBe('Cada lunes a las 9:05')
    expect(cuandoRutina('0 10 * * 0')).toBe('Cada domingo a las 10:00')
    expect(cuandoRutina('0 10 * * 0,6')).toBe('Sábados y domingos a las 10:00')
    expect(cuandoRutina('0 * * * *')).toBe('Cada hora, en punto')
    expect(cuandoRutina('15 * * * *')).toBe('Cada hora, al minuto 15')
    expect(cuandoRutina('*/30 * * * *')).toBe('Cada 30 minutos')
    expect(cuandoRutina('0 8 1 * *')).toBe('El día 1 de cada mes a las 8:00')
    expect(cuandoRutina('0 8 1 1 *')).toBe('Horario avanzado: 0 8 1 1 *')
  })
  it('próxima corrida', () => {
    const tz = 'America/Mexico_City'
    const ahora = Date.parse('2026-10-30T15:00:00Z') // vie 30 oct, 9:00 en CDMX
    expect(proximaEn(Date.parse('2026-10-30T19:00:00Z') / 1000, ahora, tz)).toBe('hoy 13:00')
    expect(proximaEn(Date.parse('2026-10-31T13:00:00Z') / 1000, ahora, tz)).toBe('mañana 7:00')
    expect(proximaEn(Date.parse('2026-11-02T13:00:00Z') / 1000, ahora, tz)).toMatch(/^lun.* 2 .*nov.* · 7:00$/)
    expect(proximaEn(null, ahora, tz)).toBe('sin fecha')
  })
  it('vista de una rutina: activa, en pausa, propuesta por Levy, con falla', () => {
    const ahora = Date.parse('2026-10-30T15:00:00Z')
    const base = { id: 'rutina-a', prompt: 'Resúmeme mi día\ncon detalle', schedule: '0 7 * * *', status: 'active' as const, next_run: Date.parse('2026-10-31T13:00:00Z') / 1000, last_run: null, last_result: null }
    const v = vistaRutina(base, ahora, 'America/Mexico_City')
    expect(v).toMatchObject({ titulo: 'Resúmeme mi día', cuando: 'Cada día a las 7:00', activa: true, deLevy: false, proxima: 'mañana 7:00', ultima: null, resultado: null, fallo: false })
    const p = vistaRutina({ ...base, id: 'levy-x', status: 'paused' }, ahora)
    expect(p).toMatchObject({ activa: false, deLevy: true, proxima: 'en pausa' })
    const f = vistaRutina({ ...base, last_run: ahora / 1000 - 600, last_result: 'Error: Error: Las rutinas automáticas no corren con tu suscripción' }, ahora, 'America/Mexico_City')
    expect(f.fallo).toBe(true)
    expect(f.ultima).toBe('hace 10 min')
    expect(f.resultado).toBe('Las rutinas automáticas no corren con tu suscripción')
  })
  it('adaptador puro', () => {
    expect(rutaDaemon('a', 'pausar')).toBe('/schedule/a/pause')
    expect(rutaDaemon('a', 'borrar')).toBe('/schedule/a')
    expect(rutaDaemon('a b', 'pausar')).toBeNull()
    expect(rutaDaemon(1, 'pausar')).toBeNull()
    expect(cuerpoCrear({ prompt: 'hola mundo', schedule: '0 7 * * *', id: 'x' })).toEqual({ prompt: 'hola mundo', schedule: '0 7 * * *' })
  })
})
