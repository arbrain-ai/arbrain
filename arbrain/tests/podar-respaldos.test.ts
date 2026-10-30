import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, existsSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { planDePoda, podarRespaldos, CONSERVAR } from '../scripts/podar-respaldos.mjs'

const hora = 60 * 60 * 1000
const e = (nombre: string, mtimeMs: number) => ({ nombre, dir: '/x', mtimeMs })

test('conserva los respaldos más recientes y aparta el resto', () => {
  const respaldos = Array.from({ length: 12 }, (_, i) => e(`Arbrain-${i}.app`, i * hora))
  const plan = planDePoda({ respaldos, restos: [] }, 100 * hora)
  assert.equal(plan.length, 12 - CONSERVAR)
  assert.ok(!plan.some((p: { nombre: string }) => p.nombre === 'Arbrain-11.app'))
})

test('nunca toca la app instalada, la pendiente ni un stage reciente', () => {
  const ahora = 100 * hora
  const restos = [e('Arbrain.app', 0), e('.Arbrain-pendiente.app', 0), e('.Arbrain-pendiente.json', 0), e('.Arbrain-stage-1.app', ahora - 60_000), e('.Arbrain-stage-2.app', 0), e('.Arbrain-failed-3.app', 0), e('.Arbrain-pendiente-4.json.viejo', 0), e('Blender.app', 0)]
  const nombres = planDePoda({ respaldos: [], restos }, ahora).map((p: { nombre: string }) => p.nombre)
  assert.deepEqual(nombres.sort(), ['.Arbrain-failed-3.app', '.Arbrain-pendiente-4.json.viejo', '.Arbrain-stage-2.app'])
})

test('borra directo lo que sobra del tope, sin Papelera, y solo copias de Arbrain', () => {
  const apps = mkdtempSync(path.join(tmpdir(), 'podar-'))
  const backups = path.join(apps, '.arbrain-backups')
  mkdirSync(backups)
  for (let i = 0; i < CONSERVAR + 3; i++) {
    mkdirSync(path.join(backups, `Arbrain-${i}.app/Contents`), { recursive: true })
    writeFileSync(path.join(backups, `Arbrain-${i}.app/Contents/x`), 'x')
  }
  mkdirSync(path.join(backups, 'personal.app'))           // no tiene forma de copia: nunca se toca
  mkdirSync(path.join(apps, 'Arbrain.app'))                 // la instalada
  mkdirSync(path.join(apps, 'otra'))
  symlinkSync(path.join(apps, 'otra'), path.join(apps, '.Arbrain-stage-9.app')) // enlace con nombre de resto
  const borrados = podarRespaldos(apps, { log: () => {} })
  assert.equal(borrados, 3)
  assert.equal(readdirSync(backups).filter(n => n.startsWith('Arbrain-')).length, CONSERVAR)
  assert.ok(existsSync(path.join(backups, 'personal.app')))
  assert.ok(existsSync(path.join(apps, 'Arbrain.app')))
  assert.ok(existsSync(path.join(apps, 'otra')))
  assert.ok(!existsSync(path.join(apps, '.Trash')))
})
