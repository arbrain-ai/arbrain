// Taller › Rutinas en la edición cliente (T8, 29 oct 2026): la pestaña aparece para el alumno y su API existe; la de Daniel
// (`/api/planning/crons`, Studio y Supabase) sigue fuera. La edición se fija antes de importar: el Taller la lee al cargar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.ARBRAIN_EDICION = 'cliente'
const g = globalThis as unknown as Record<string, unknown>
const mem = new Map<string, string>()
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } }

test('cliente: el Taller tiene Agentes, Rutinas, Memoria y Computadora (T16); Historia sigue fuera', async () => {
  const { SEGMENTOS_TALLER, aSegmento } = await import('../../src/features/cabina/panel/taller-segmento')
  assert.deepEqual(SEGMENTOS_TALLER.map(s => s.id), ['terminales', 'rutinas', 'memoria', 'maquina'])
  assert.equal(SEGMENTOS_TALLER.find(s => s.id === 'rutinas')?.etiqueta, 'Rutinas')
  assert.equal(aSegmento('rutinas'), 'rutinas')
  assert.equal(aSegmento('historia'), 'terminales')
})

test('cliente: /api/rutinas existe; /api/planning/crons sigue fuera', async () => {
  const { apiPermitidaEnCliente } = await import('../../src/lib/edicion')
  assert.equal(apiPermitidaEnCliente('/api/rutinas'), true)
  assert.equal(apiPermitidaEnCliente('/api/rutinas/rutina-resumen-1'), true)
  assert.equal(apiPermitidaEnCliente('/api/planning/crons'), false)
  assert.equal(apiPermitidaEnCliente('/api/rutinas-x'), false)
})

test('el panel pinta la vista del alumno solo en cliente y la de Daniel queda igual', () => {
  const panel = readFileSync(join(__dirname, '../../src/features/cabina/panel/PanelDerecho.tsx'), 'utf8')
  assert.match(panel, /vista === 'rutinas' && esEdicionCliente\(\) \? <RutinasCliente \/>/)
  assert.match(panel, /vista === 'rutinas' \? <div className=\{w\.rutinas\}><VistaRutinasViva/)
})

test('la pestaña vacía explica que se le puede pedir a Levy y que la computadora debe estar encendida', () => {
  const vista = readFileSync(join(__dirname, '../../src/features/rutinas/RutinasCliente.tsx'), 'utf8')
  assert.match(vista, /pídesela a Levy en el chat/)
  assert.match(vista, /cada mañana a las 7 resúmeme mi día/)
  assert.match(vista, /debe estar encendida/)
})
