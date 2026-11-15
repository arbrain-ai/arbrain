/**
 * Mapa v16 · las RECETAS de las islas (14 nov 2026). Puro: el esquema se lee con tolerancia, y cada receta del mapa que vive
 * en el repo se lee sin errores y solo apunta a destinos de la lista blanca del lienzo (canvas/islas/destinos.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { destinosDe, fuentesDe, leerReceta } from '../../src/features/mapa/receta'
import { leerDestino } from '../../src/features/canvas/islas/destinos'
import { leerReceta as leerRecetaMotor } from '../../src/features/canvas/islas/receta'

const CARPETA = path.resolve(__dirname, '../../../docs/builds/mapa-v16/islas')

test('una receta mínima se lee; lo que falta se avisa sin romper', () => {
  const r = leerReceta({ esquema: 'arbrain.isla/v1', id: 'x', ancho: 1440, alto: 900, filas: [{ bloques: [{ tipo: 'texto', texto: 'hola' }, { nada: 1 }] }, { bloques: [] }] }, new Set(['texto']))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.receta.filas.length, 1)
  assert.equal(r.receta.filas[0].bloques[0].peso, 1)
  assert.equal(r.avisos.length, 2)
})

test('sin id, tamaño o filas no hay isla', () => {
  assert.equal(leerReceta({ ancho: 1440, alto: 900, filas: [] }).ok, false)
  assert.equal(leerReceta({ id: 'x', ancho: 10, alto: 900, filas: [{ bloques: [{ tipo: 'a' }] }] }).ok, false)
  assert.equal(leerReceta('no').ok, false)
})

test('un bloque de un tipo desconocido se conserva y se avisa (receta escrita para una versión más nueva)', () => {
  const r = leerReceta({ id: 'x', ancho: 1440, alto: 900, filas: [{ bloques: [{ tipo: 'futuro' }] }] }, new Set(['texto']))
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.receta.filas[0].bloques[0].tipo, 'futuro'); assert.match(r.avisos.join(' '), /futuro/) }
})

test('fuentes y destinos se juntan de todos los bloques', () => {
  const r = leerReceta({ id: 'x', ancho: 1440, alto: 900, filas: [{ bloques: [{ tipo: 'a', vivo: { fuente: 'pulso:venta' }, botones: [{ texto: 'P', destino: 'url:https://polar.sh/x' }] }] }] })
  assert.ok(r.ok)
  if (r.ok) { assert.deepEqual(fuentesDe(r.receta), ['pulso:venta']); assert.deepEqual(destinosDe(r.receta), ['url:https://polar.sh/x']) }
})

/** Las islas del mapa v16 que ya están en la rejilla del MOTOR (`ejemplo` es del MOTOR; lo que sigue en filas está en obra). */
const enRejilla = (d: string) => { try { return Array.isArray(JSON.parse(readFileSync(path.join(CARPETA, d, 'receta.json'), 'utf8')).bloques) } catch { return false } }
const recetas = existsSync(CARPETA) ? readdirSync(CARPETA).filter(d => d !== 'ejemplo' && existsSync(path.join(CARPETA, d, 'receta.json')) && enRejilla(d)) : []

test('las recetas del mapa v16 existen', () => { assert.ok(recetas.length >= 9, `solo hay ${recetas.length}`) })

for (const id of recetas) {
  test(`receta «${id}»: se lee, su id es su carpeta y cada botón va a un destino de la lista blanca`, () => {
    const json = JSON.parse(readFileSync(path.join(CARPETA, id, 'receta.json'), 'utf8'))
    const r = leerReceta(json)
    assert.ok(r.ok, r.ok ? '' : r.errores.join(' '))
    if (!r.ok) return
    assert.equal(r.receta.id, id)
    // el validador del MOTOR (dueño del esquema arbrain.isla/v1): la receta pasa sin errores de estructura
    const m = leerRecetaMotor(json)
    assert.ok(m.ok, m.ok ? '' : m.errores.join(' '))
    if (m.ok && 'errores' in m && Array.isArray((m as { errores?: string[] }).errores)) assert.deepEqual((m as { errores?: string[] }).errores, [])
    assert.equal(r.receta.ancho, 1440)
    for (const d of destinosDe(r.receta)) assert.ok(leerDestino(d, u => /(^|\.)arbrain\.ai$/.test(u.hostname)), `destino fuera de la lista blanca: ${d}`)
  })
}

test('los esquemas puros de ISLAS cubren exactamente los tipos del registro de componentes', () => {
  // el registro importa componentes (React + CSS): se compara contra el texto de sus archivos, sin montarlos
  const dir = path.resolve(__dirname, '../../src/features/mapa/bloques')
  const claves = new Set<string>()
  for (const f of readdirSync(dir).filter(x => x.endsWith('.tsx'))) {
    const src = readFileSync(path.join(dir, f), 'utf8')
    const m = /export const BLOQUES_\w+: Record<string, ComponenteBloque> = \{([\s\S]*?)\n\}/.exec(src)
    if (m) for (const k of m[1].matchAll(/'?([a-z][a-z-]*)'?\s*:/g)) claves.add(k[1])
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TIPOS_ISLAS, ESQUEMAS_ISLAS } = require('../../src/features/mapa/esquemas') as typeof import('../../src/features/mapa/esquemas')
  assert.deepEqual([...claves].sort(), [...TIPOS_ISLAS].sort())
  assert.deepEqual(ESQUEMAS_ISLAS['organo-vivo'].fuentes({ tipo: 'organo-vivo', organo: 'venta' }).sort(), ['embudo', 'pulso:venta'])
})
