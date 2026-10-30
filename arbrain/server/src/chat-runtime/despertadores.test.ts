import Database from 'better-sqlite3'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChatJournal } from './journal.js'
import { Despertadores, DespertadorInvalido, TOPES, dispararVencidos, resolverHora } from './despertadores.js'

const scope = { owner: 'daniel', account: 'default', conversationId: 'chat-1' }
const silencio = { info: () => {}, warn: () => {} }
function abrir(file = ':memory:') {
  let ahora = Date.parse('2026-10-03T12:00:00Z') // 06:00 en México
  const db = new Database(file)
  const clock = () => ahora
  return { db, journal: new ChatJournal(db, clock), d: new Despertadores(db, clock), avanzar: (ms: number) => { ahora += ms }, ahora: () => ahora }
}

describe('despertadores durables', () => {
  it('crea, lista y cancela; valida las formas de hora', () => {
    const { d } = abrir()
    const uno = d.crear(scope, { texto: 'revisa la QA', enMinutos: 5 })
    expect(uno.estado).toBe('pendiente')
    expect(d.listar(scope).map(x => x.id)).toEqual([uno.id])
    expect(() => d.crear(scope, { texto: '' , enMinutos: 1 })).toThrow(DespertadorInvalido)
    expect(() => d.crear(scope, { texto: 'x', enMinutos: 1, aLas: '10:00' })).toThrow(DespertadorInvalido)
    expect(() => d.crear(scope, { texto: 'x', cadaMinutos: 1 })).toThrow(/mínimo 5/)
    expect(() => d.crear(scope, { texto: 'x', enMinutos: 60 * 24 * 9 })).toThrow(/8 días/)
    expect(d.cancelar({ ...scope, conversationId: 'otra' }, uno.id)).toBe(false)
    expect(d.cancelar(scope, uno.id)).toBe(true)
    expect(d.listar(scope)).toEqual([])
  })
  it('«HH:MM» es hora de México y pasa a mañana si ya pasó', () => {
    const base = Date.parse('2026-10-03T12:00:00Z') // 06:00 MX
    expect(new Date(resolverHora('14:05', base)).toISOString()).toBe('2026-10-03T20:05:00.000Z')
    expect(new Date(resolverHora('05:00', base)).toISOString()).toBe('2026-10-04T11:00:00.000Z')
    expect(() => resolverHora('2026-10-03T14:05:00', base)).toThrow(/zona/)
  })
  it('topa los pendientes por conversación', () => {
    const { d } = abrir()
    for (let i = 0; i < TOPES.pendientesPorConversacion; i++) d.crear(scope, { texto: `n${i}`, enMinutos: 10 + i })
    expect(() => d.crear(scope, { texto: 'uno más', enMinutos: 30 })).toThrow(/tope/)
  })
  it('al vencer acepta un turno NORMAL en el journal y sobrevive a reabrir la base (reinicio)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'despertadores-'))
    const file = join(dir, 'db.sqlite')
    const a = abrir(file)
    a.journal.accept({ ...scope, turnId: 't0' }, { message: 'hola', source: 'desktop', overrides: { model: 'claude-opus-5-5', effort: 'high', fast: false, ultracode: false } })
    const creado = a.d.crear(scope, { texto: 'mira si terminó el build', enMinutos: 1 })
    a.db.close()
    // «Reinicio»: otra conexión, otro objeto, mismo archivo.
    const b = abrir(file)
    b.avanzar(30_000)
    expect(dispararVencidos(b.d, b.journal, silencio)).toBe(0)
    b.avanzar(31_000)
    expect(dispararVencidos(b.d, b.journal, silencio)).toBe(1)
    const turno = b.journal.get({ ...scope, turnId: b.d.get(creado.id)!.ultimoTurnId! })!
    expect(turno.status).toBe('queued')
    expect(turno.input).toMatchObject({ despertador: { id: creado.id, texto: 'mira si terminó el build', disparo: 1 }, overrides: { model: 'claude-opus-5-5' } })
    expect(String((turno.input as { message: string }).message)).toContain(`${DUENO_M} no escribió este mensaje`)
    expect(b.d.get(creado.id)).toMatchObject({ estado: 'hecho', disparos: 1, ultimoTurnId: turno.turnId })
    expect(dispararVencidos(b.d, b.journal, silencio)).toBe(0)
    b.db.close()
  })
  it('recurrente: avanza su hora, cuenta las veces y no recupera los perdidos uno por uno', () => {
    const { d, journal, avanzar } = abrir()
    const r = d.crear(scope, { texto: 'revisa', cadaMinutos: 10, veces: 2 })
    avanzar(10 * 60_000)
    expect(dispararVencidos(d, journal, silencio)).toBe(1)
    expect(d.get(r.id)).toMatchObject({ estado: 'pendiente', restantes: 1, disparos: 1 })
    avanzar(55 * 60_000) // servidor apagado casi una hora
    expect(dispararVencidos(d, journal, silencio)).toBe(1)
    expect(d.get(r.id)).toMatchObject({ estado: 'hecho', disparos: 2 })
  })
  it('frena un bucle: más de 12 despertares en una hora en la misma conversación', () => {
    const { d, journal, avanzar } = abrir()
    for (let i = 0; i < TOPES.disparosPorHoraPorConversacion; i++) {
      d.crear(scope, { texto: `eco ${i}`, enMinutos: 1 })
      avanzar(61_000)
      expect(dispararVencidos(d, journal, silencio)).toBe(1)
    }
    const otro = d.crear(scope, { texto: 'uno más', enMinutos: 1 })
    avanzar(61_000)
    expect(dispararVencidos(d, journal, silencio)).toBe(0)
    expect(d.get(otro.id)).toMatchObject({ estado: 'frenado' })
  })
})

describe('herramienta despertador de la Cabina', () => {
  it('crea y lista en la conversación del entorno y se niega sin ella', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cabina-despertador-'))
    process.env.CLAUDECLAW_STORE_DIR = dir
    const { vi } = await import('vitest')
    vi.resetModules()
    const { ejecutarCabina } = await import('../cabina/tools.js')
    delete process.env.ARBRAIN_CABINA_SCOPE
    expect((await ejecutarCabina('despertador', { accion: 'listar' })).error).toBe(true)
    process.env.ARBRAIN_CABINA_SCOPE = JSON.stringify(scope)
    const creado = await ejecutarCabina('despertador', { accion: 'crear', texto: 'corre la QA', enMinutos: 5 })
    expect(creado.error).toBeFalsy()
    expect(creado.text).toMatch(/Despertador creado: d-/)
    const lista = await ejecutarCabina('despertador', { accion: 'listar' })
    expect(lista.text).toContain('corre la QA')
    delete process.env.ARBRAIN_CABINA_SCOPE; delete process.env.CLAUDECLAW_STORE_DIR
  })
})
