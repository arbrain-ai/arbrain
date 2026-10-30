import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HabitosLocales, RUTA_HABITOS, habitosSemilla } from '../../src/lib/sistema/habitos-local'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { racha } from '../../src/features/planning/habitos-dia'

const OWNER = '00000000-0000-4000-8000-000000000001'
const nueva = () => new HabitosLocales(mkdtempSync(join(tmpdir(), 'habitos-local-')), OWNER)
const q = (o: Record<string, string>) => new URLSearchParams({ timeZone: 'America/Mexico_City', ...o })
const marca = (h: HabitosLocales, date: string, clave: string, hecho: boolean | null, expectedRevision = 0, extra: Record<string, unknown> = {}) =>
  h.escribir({ owner: OWNER, date, clave, hecho, source: 'manual', requestId: randomUUID(), expectedRevision, timeZone: 'America/Mexico_City', ...extra })

test('cliente: /api/sistema existe; la inteligencia del autor no', () => {
  assert.equal(apiPermitidaEnCliente('/api/sistema'), true)
  assert.equal(apiPermitidaEnCliente('/api/sistema/inteligencia'), false)
})

test('sin archivo: la semilla trae solo «Objetivo del día», activo', () => {
  const s = nueva().leer(q({ date: '2026-10-21', from: '2026-08-23', to: '2026-10-21' }))
  assert.deepEqual(s.habitos.map(h => [h.clave, h.nombre, h.activo]), [['objetivo_dia', 'Objetivo del día', true]])
  assert.equal(s.owner, OWNER)
  assert.deepEqual(s.records, [])
  assert.equal(habitosSemilla().habitos.length, 1)
})

test('marcar, repetir el recibo, conflicto de revisión y hábito desconocido (mismas reglas que la RPC)', async () => {
  const h = nueva()
  const rid = randomUUID()
  const cmd = { owner: OWNER, date: '2026-10-21', clave: 'objetivo_dia', hecho: true, source: 'manual', requestId: rid, expectedRevision: 0, timeZone: 'America/Mexico_City' }
  const a = await h.escribir(cmd)
  assert.equal(a.status, 200)
  assert.equal((a.cuerpo.record as { revision: number }).revision, 1)
  assert.equal((await h.escribir(cmd)).cuerpo.replayed, true)
  assert.equal((await h.escribir({ ...cmd, hecho: false })).status, 409)
  assert.equal((await marca(h, '2026-10-21', 'objetivo_dia', null, 0)).status, 409, 'revisión vieja')
  assert.equal((await marca(h, '2026-10-21', 'objetivo_dia', null, 1)).status, 200)
  assert.equal((await marca(h, '2026-10-21', 'meditar', true)).status, 404)
  const disco = JSON.parse(readFileSync(join(h.raiz, RUTA_HABITOS), 'utf8'))
  assert.ok(Array.isArray(disco._como_se_usa), 'el archivo nace con su instructivo')
  assert.equal(disco.registro['2026-10-21'].objetivo_dia.hecho, null)
})

test('un hábito que Levy agrega a mano aparece, cuenta racha y el inactivo no se pinta', async () => {
  const h = nueva()
  mkdirSync(join(h.raiz, '.claude/plan'), { recursive: true })
  const d = habitosSemilla()
  d.habitos.push({ clave: 'caminar', nombre: 'Caminar 20 min', seccion: 'cuerpo', orden: 1, activo: true }, { clave: 'viejo', nombre: 'Viejo', activo: false })
  writeFileSync(join(h.raiz, RUTA_HABITOS), JSON.stringify(d))
  for (const dia of ['2026-10-18', '2026-10-19', '2026-10-20']) assert.equal((await marca(h, dia, 'caminar', true)).status, 200)
  const s = h.leer(q({ date: '2026-10-21', from: '2026-08-23', to: '2026-10-21' }))
  assert.deepEqual(s.habitos.map(x => x.clave), ['objetivo_dia', 'caminar'])
  assert.equal(s.catalog.length, 3)
  const m = (f: string) => s.records.find(r => r.fecha === f && r.habito_clave === 'caminar')?.hecho
  assert.equal(racha(m, '2026-10-21', '2026-10-21', s.from).dias, 3, 'hoy sin marcar: la racha sigue viva')
  assert.deepEqual(s.history.map(x => x.fecha), ['2026-10-18', '2026-10-19', '2026-10-20'])
})

test('evidencia importada no pisa una marca explícita; reflexión se guarda', async () => {
  const h = nueva()
  await marca(h, '2026-10-21', 'objetivo_dia', true)
  const r = await h.escribir({ owner: OWNER, date: '2026-10-21', clave: 'objetivo_dia', hecho: false, source: 'diary', evidence: 'foto', requestId: randomUUID(), expectedRevision: 1 })
  assert.equal(r.cuerpo.error, 'explicit_correction')
  await h.escribir({ tipo: 'reflexion', date: '2026-10-21', campo: 'prioridad_am', valor: 'Instalar mi cerebro' })
  assert.equal(h.leer(q({ date: '2026-10-21' })).reflexion.prioridad_am, 'Instalar mi cerebro')
  await assert.rejects(h.escribir({ owner: 'otra', date: '2026-10-21', clave: 'objetivo_dia', hecho: true, requestId: randomUUID(), expectedRevision: 1 }), /otra identidad/)
})
