// Bienvenida en bucle (29 oct 2026, un fundador en Windows): con la bienvenida completada, un fallo al leer
// `<datos>/web/primer-arranque.json` se tragaba como «primera vez» y la app lo mandaba otra vez a la bienvenida. Solo
// «no existe» es primera vez; cualquier otro fallo se registra y la API responde 503 con el motivo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { faltaPrimerArranque, irABienvenida, leerPrimerArranque, PrimerArranqueIlegible } from '../../src/features/primer-arranque/lib/estado'
import { VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'

const completo = (nombre = 'Fulano de Tal') => JSON.stringify({ version: 1, aceptado: { version: VERSION_TEXTOS, fecha: '2026-10-28T12:00:00.000Z' }, nombre, completado: '2026-10-28T12:05:00.000Z', sesionBienvenida: null }, null, 1)

function conDatos(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'arbrain-primer-arranque-'))
  const antes = process.env.ARBRAIN_DATA_DIR
  process.env.ARBRAIN_DATA_DIR = dir
  const errores: string[] = []
  const original = console.error
  console.error = (...a: unknown[]) => { errores.push(a.map(String).join(' ')) }
  try { fn(dir) } finally {
    console.error = original
    if (antes === undefined) delete process.env.ARBRAIN_DATA_DIR
    else process.env.ARBRAIN_DATA_DIR = antes
    rmSync(dir, { recursive: true, force: true })
  }
  return errores
}

test('sin archivo: primera vez, va a la bienvenida', () => {
  conDatos(() => {
    assert.equal(leerPrimerArranque().completado, null)
    assert.equal(irABienvenida(), true)
  })
})

test('completo: no vuelve a la bienvenida', () => {
  conDatos((dir) => {
    writeFileSync(join(dir, 'primer-arranque.json'), completo())
    assert.equal(leerPrimerArranque().nombre, 'Fulano de Tal')
    assert.equal(faltaPrimerArranque(), false)
    assert.equal(irABienvenida(), false)
  })
})

test('con BOM (editado en Windows): se lee igual', () => {
  conDatos((dir) => {
    writeFileSync(join(dir, 'primer-arranque.json'), '﻿' + completo())
    assert.equal(leerPrimerArranque().nombre, 'Fulano de Tal')
    assert.equal(irABienvenida(), false)
  })
})

test('ilegible: lanza con el motivo, lo registra y NO manda a la bienvenida', () => {
  const errores = conDatos((dir) => {
    // Un directorio en lugar del archivo: el read falla con un error que no es ENOENT (EISDIR), en cualquier sistema.
    mkdirSync(join(dir, 'primer-arranque.json'))
    assert.throws(() => leerPrimerArranque(), (e: unknown) => e instanceof PrimerArranqueIlegible && /EISDIR/.test(e.message))
    assert.equal(irABienvenida(), false)
  })
  assert.ok(errores.some((l) => l.includes('[primer-arranque]') && l.includes('EISDIR')), errores.join('\n'))
})

test('JSON roto: lanza, lo registra y no manda a la bienvenida', () => {
  const errores = conDatos((dir) => {
    writeFileSync(join(dir, 'primer-arranque.json'), '{"version":1,"nombre":"Iv')
    assert.throws(() => leerPrimerArranque(), PrimerArranqueIlegible)
    assert.equal(irABienvenida(), false)
  })
  assert.ok(errores.some((l) => l.includes('[primer-arranque]')))
})

test('sin carpeta de datos: la bienvenida lo explica (sigue yendo ahí)', () => {
  const antes = process.env.ARBRAIN_DATA_DIR
  delete process.env.ARBRAIN_DATA_DIR
  try { assert.equal(irABienvenida(), true) } finally { if (antes !== undefined) process.env.ARBRAIN_DATA_DIR = antes }
})

test('la API devuelve 503 con motivo en vez de «falta»; el shell y la página usan irABienvenida', () => {
  const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
  const api = fuente('src/app/api/primer-arranque/route.ts')
  assert.match(api, /e instanceof PrimerArranqueIlegible \? 'ilegible'/)
  assert.match(api, /status: 503/)
  assert.match(fuente('src/app/(main)/layout.tsx'), /if \(irABienvenida\(\)\) redirect\('\/bienvenida'\)/)
  assert.match(fuente('src/app/bienvenida/page.tsx'), /if \(!irABienvenida\(\)\) redirect\('\/chat'\)/)
})
