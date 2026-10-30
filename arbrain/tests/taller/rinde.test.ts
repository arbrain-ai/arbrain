import test from 'node:test'
import assert from 'node:assert/strict'
import { disparosEn30, fmtTokens, leerRendimiento, propuestaVigente, type PropuestaRinde, type TareaRinde } from '../../src/features/rutinas/rinde'

const AHORA = Date.parse('2026-10-05T18:00:00-06:00')
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString()
const tarea = (id: string, schedule = '0 3 * * *', status: 'active' | 'paused' = 'active', lastDias: number | null = 1): TareaRinde =>
  ({ id, schedule, status, last_run: lastDias == null ? null : Math.floor((AHORA - lastDias * 86_400_000) / 1000), last_result: 'ok' })
const prop = (o: Partial<PropuestaRinde>): PropuestaRinde => ({ id: 'p', clave: 'poda:x', tipo: 'poda', neurona: 'x', titulo: 't', propuesta: 'p', ahorro_estimado: null, riesgo: null, estado: 'propuesta', created_at: hace(30), updated_at: hace(30), ...o })

test('disparos en 30 días: diario, varias horas, semanal, mensual, cada N minutos', () => {
  assert.equal(disparosEn30('0 3 * * *'), 30)
  assert.equal(disparosEn30('15 2,8,14,20 * * *'), 120)
  assert.equal(disparosEn30('0 7 * * 0'), 4.3)
  assert.equal(disparosEn30('0 3 1 * *'), 1)
  assert.equal(disparosEn30('*/10 * * * *'), 4320)
  assert.equal(disparosEn30('raro'), null)
})

test('falla ≥60 % con ≥3 corridas = ya no rinde; una corrida sin usage es sin dato, no cero', () => {
  const r = leerRendimiento([tarea('a'), tarea('b')], [
    ...[1, 2, 3, 4].map((d) => ({ job: 'a', status: d < 4 ? 'error' : 'success', at: hace(d), tokens: null })),
    { job: 'b', status: 'success', at: hace(1), tokens: 900 }, { job: 'b', status: 'success', at: hace(2), tokens: 100 },
  ], [], AHORA)
  assert.equal(r[0].id, 'a')
  assert.equal(r[0].tono, 'no-rinde')
  assert.match(r[0].motivo, /Falló 3 de 4/)
  assert.doesNotMatch(r[0].motivo, /La última salió bien/) // la más reciente (hace 1 día) falló
  assert.equal(r[0].tokens, null)
  const b = r.find((x) => x.id === 'b')!
  assert.equal(b.tono, 'rinde')
  assert.equal(b.tokens, 1000)
  assert.equal(b.parte, 1)
})

test('activa que no corre en mucho tiempo no rinde; la pausada solo se dice', () => {
  const r = leerRendimiento([tarea('muda', '0 3 * * *', 'active', 20), tarea('quieta', '0 3 * * *', 'paused', 22), tarea('mensual', '0 3 1 * *', 'active', 4)], [], [], AHORA)
  assert.equal(r.find((x) => x.id === 'muda')!.tono, 'no-rinde')
  assert.equal(r.find((x) => x.id === 'quieta')!.tono, 'pausada')
  assert.equal(r.find((x) => x.id === 'mensual')!.tono, 'sin-dato')
})

test('las propuestas se cruzan por neurona o por clave, y las de rutinas retiradas ya no aplican', () => {
  const p1 = prop({ id: '1', neurona: 'hipocampo + plasticidad-lectura' })
  const p2 = prop({ id: '2', neurona: 'Metabolismo', clave: 'dieta:workspace-backup' })
  const p3 = prop({ id: '3', neurona: 'twitter-monitor', clave: 'dieta:twitter-monitor' })
  const r = leerRendimiento([tarea('hipocampo'), tarea('workspace-backup')], [], [p1, p2, p3, prop({ id: '4', estado: 'firmada', neurona: 'hipocampo' })], AHORA)
  assert.deepEqual(r.find((x) => x.id === 'hipocampo')!.propuestas.map((p) => p.id), ['1'])
  assert.deepEqual(r.find((x) => x.id === 'workspace-backup')!.propuestas.map((p) => p.id), ['2'])
  const ids = new Set(['hipocampo', 'workspace-backup'])
  assert.equal(propuestaVigente(p1, ids), true)
  assert.equal(propuestaVigente(p2, ids), true)
  assert.equal(propuestaVigente(p3, ids), false)
})

test('tokens legibles; sin medición dice «sin dato»', () => {
  assert.equal(fmtTokens(152_575_361), '153 M')
  assert.equal(fmtTokens(1_500_000), '1.5 M')
  assert.equal(fmtTokens(58_171), '58 K')
  assert.equal(fmtTokens(null), 'sin dato')
})
