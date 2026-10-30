/**
 * Tema por hora (4 oct 2026, 21:08): Daniel vio la app en claro de noche porque un toque viejo al botón del pie
 * dejó «light» guardado para siempre. Lo elegido a mano caduca en el siguiente cambio de tramo (06:00 / 19:00).
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { finDelTramo, temaGuardadoVigente } from '../../src/shared/lib/tema-por-hora'

// 21:08 en Ciudad de México (UTC-6) = 03:08 UTC del día siguiente.
const NOCHE = new Date('2026-10-05T03:08:00Z')

test('lo guardado sin fecha (antes del arreglo) ya no fija el tema: vuelve a automático', () => {
  assert.equal(temaGuardadoVigente('light', null, NOCHE.getTime()), 'auto')
  assert.equal(temaGuardadoVigente('dark', '', NOCHE.getTime()), 'auto')
})

test('claro/oscuro a mano vale hasta su fecha y luego es automático', () => {
  const hasta = String(NOCHE.getTime() + 60_000)
  assert.equal(temaGuardadoVigente('light', hasta, NOCHE.getTime()), 'light')
  assert.equal(temaGuardadoVigente('light', hasta, NOCHE.getTime() + 120_000), 'auto')
  assert.equal(temaGuardadoVigente('auto', hasta, NOCHE.getTime()), 'auto')
  assert.equal(temaGuardadoVigente('system', null, NOCHE.getTime()), 'auto')
})

test('el tramo de la noche termina a las 06:00 de México; el del día, a las 19:00', () => {
  assert.equal(new Date(finDelTramo(NOCHE)).toISOString(), '2026-10-05T12:00:00.000Z')
  assert.equal(new Date(finDelTramo(new Date('2026-10-04T16:30:00Z'))).toISOString(), '2026-10-05T01:00:00.000Z')
  assert.equal(new Date(finDelTramo(new Date('2026-10-04T08:00:00Z'))).toISOString(), '2026-10-04T12:00:00.000Z')
})

test('el script de arranque aplica la misma caducidad antes de hidratar', () => {
  const layout = readFileSync(join(__dirname, '../../src/app/layout.tsx'), 'utf8')
  assert.match(layout, /mission-control-theme-hasta/)
  assert.match(layout, /hasta > Date\.now\(\)/)
})
