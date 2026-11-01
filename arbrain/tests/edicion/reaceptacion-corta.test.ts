// Re-aceptación corta (0.2.18, 31 oct 2026, PROPUESTA 80/20 #12 / b6): quien ya terminó la bienvenida y actualiza con
// textos legales nuevos ve solo «legal» y «autonomía», no nombre, llaves ni «listo». El alumno nuevo recorre todo igual
// que antes, y nadie queda atrapado: aceptar los textos basta para que el shell deje entrar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guardarPrimerArranque, irABienvenida, reaceptacionCorta } from '../../src/features/primer-arranque/lib/estado'
import { esReaceptacion, PASOS, PASOS_REACEPTACION, pasosVisibles } from '../../src/features/primer-arranque/lib/pasos'
import { VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const estado = (version: string | null, completado: string | null) =>
  JSON.stringify({ version: 1, aceptado: version ? { version, fecha: '2026-10-29T12:00:00.000Z' } : null, nombre: 'Fulano', completado, sesionBienvenida: completado ? 's-1' : null })

function conDatos(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'arbrain-reaceptacion-'))
  const antes = process.env.ARBRAIN_DATA_DIR
  process.env.ARBRAIN_DATA_DIR = dir
  const original = console.error
  console.error = () => {}
  try { fn(dir) } finally {
    console.error = original
    if (antes === undefined) delete process.env.ARBRAIN_DATA_DIR
    else process.env.ARBRAIN_DATA_DIR = antes
    rmSync(dir, { recursive: true, force: true })
  }
}

test('esReaceptacion: solo quien ya terminó y aceptó otra versión', () => {
  assert.equal(esReaceptacion(null, VERSION_TEXTOS), false)
  assert.equal(esReaceptacion({ completado: null, aceptado: null }, VERSION_TEXTOS), false, 'alumno nuevo')
  assert.equal(esReaceptacion({ completado: null, aceptado: { version: '2026-10-11' } }, VERSION_TEXTOS), false, 'a medias: bienvenida completa')
  assert.equal(esReaceptacion({ completado: 'x', aceptado: { version: VERSION_TEXTOS } }, VERSION_TEXTOS), false, 'al día')
  assert.equal(esReaceptacion({ completado: 'x', aceptado: { version: '2026-10-11' } }, VERSION_TEXTOS), true)
  assert.equal(esReaceptacion({ completado: 'x', aceptado: null }, VERSION_TEXTOS), true)
})

test('los pasos: corta = legal y autonomía; la completa no cambia', () => {
  assert.deepEqual([...PASOS_REACEPTACION], ['legal', 'autonomia'])
  for (const m of [false, true]) for (const cu of [false, true]) assert.deepEqual(pasosVisibles(m, cu, true), ['legal', 'autonomia'])
  assert.deepEqual(pasosVisibles(false, true), PASOS.filter(p => p !== 'monitoreo'))
  assert.deepEqual(pasosVisibles(true, false), [...PASOS])
  assert.deepEqual(pasosVisibles(true, false, false), [...PASOS])
})

test('alumno nuevo: bienvenida completa, como siempre', () => {
  conDatos(() => {
    assert.equal(irABienvenida(), true)
    assert.equal(reaceptacionCorta(), false)
  })
})

test('a medias (aceptó pero no terminó): bienvenida completa', () => {
  conDatos((dir) => {
    writeFileSync(join(dir, 'primer-arranque.json'), estado(VERSION_TEXTOS, null))
    assert.equal(irABienvenida(), true)
    assert.equal(reaceptacionCorta(), false)
  })
})

test('bienvenida completa con textos viejos: corta; al aceptar, el shell deja entrar (nadie atrapado)', () => {
  conDatos((dir) => {
    writeFileSync(join(dir, 'primer-arranque.json'), estado('2026-10-11', '2026-10-28T12:05:00.000Z'))
    assert.equal(irABienvenida(), true)
    assert.equal(reaceptacionCorta(), true)
    // «legal» guarda la aceptación: aunque cierre la app antes de «autonomía», ya no vuelve a la bienvenida (si estaba
    // en Autónomo con el texto viejo, la tarjeta de migración del shell le pregunta una vez).
    guardarPrimerArranque({ aceptado: { version: VERSION_TEXTOS, fecha: new Date().toISOString() } })
    assert.equal(irABienvenida(), false)
    assert.equal(reaceptacionCorta(), false)
  })
})

test('estado ilegible: ni bienvenida ni corta (el bucle del 29 oct sigue cerrado)', () => {
  conDatos((dir) => {
    mkdirSync(join(dir, 'primer-arranque.json'))
    assert.equal(irABienvenida(), false)
    assert.equal(reaceptacionCorta(), false)
  })
})

test('la página decide en el servidor y la pantalla abre en «legal»; al guardar la autonomía vuelve al chat', () => {
  assert.match(fuente('src/app/bienvenida/page.tsx'), /<PrimerArranque reaceptacion=\{reaceptacionCorta\(\)\} \/>/)
  const ui = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(ui, /useState<Paso>\(demo\?\.paso \?\? \(reaceptacion \? 'legal' : 'bienvenida'\)\)/)
  assert.match(ui, /pasosVisibles\(conMonitoreo, cu\.disponible, reaceptacion\)/)
  assert.match(ui, /if \(ultimo\) \{ window\.location\.replace\('\/chat'\); return \}/)
  // Quien estaba en Autónomo con el texto viejo ve Autónomo propuesto (con sus casillas vacías); «carpeta» elegida se respeta.
  assert.match(ui, /const tenia = j\.reaceptar \|\| j\.migracion \? 'autonomo' : j\.modo/)
  // Sin «Atrás» en el primer paso (en la corta es «legal»).
  assert.match(ui, /\{i > 0 && paso !== 'listo' && \(/)
})
