// tr(): español por defecto, inglés del catálogo, variables, plurales y el idioma guardado en disco (13 nov 2026).
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fijarIdiomaPrueba, localeIntl, tr, trn, traduccionEn } from '../../src/shared/i18n/tr'
import { leerIdiomaDisco, normalizarIdioma } from '../../src/shared/i18n/idioma'

afterEach(() => fijarIdiomaPrueba(null))

test('en español devuelve el texto fuente, con sus variables', () => {
  fijarIdiomaPrueba('es')
  assert.equal(tr('Ajustes'), 'Ajustes')
  assert.equal(tr('Nada coincide con «{consulta}».', { consulta: 'voz' }), 'Nada coincide con «voz».')
  assert.equal(localeIntl(), 'es-MX')
})

test('en inglés usa el catálogo; sin traducción cae al español, nunca a un hueco', () => {
  fijarIdiomaPrueba('en')
  assert.equal(tr('Ajustes'), traduccionEn('Ajustes'))
  assert.equal(tr('Nada coincide con «{consulta}».', { consulta: 'voz' }).includes('voz'), true)
  assert.equal(tr('Texto que no existe en el catálogo'), 'Texto que no existe en el catálogo')
  assert.equal(localeIntl(), 'en-US')
})

test('trn elige singular o plural y siempre ofrece {n}', () => {
  fijarIdiomaPrueba('es')
  assert.equal(trn(1, 'una tarea', '{n} tareas'), 'una tarea')
  assert.equal(trn(3, 'una tarea', '{n} tareas'), '3 tareas')
})

test('el idioma guardado: ARBRAIN_IDIOMA manda, luego el archivo de la carpeta de configuración, luego español', () => {
  const dir = mkdtempSync(join(tmpdir(), 'idioma-'))
  // Marcador IDIOMA buscado en una carpeta sin él: la prueba no cambia dentro de una copia inglesa (idioma-marcador.test.ts).
  const sinMarcador = { cwd: dir }
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: dir }, sinMarcador), 'es')
  writeFileSync(join(dir, 'idioma.json'), JSON.stringify({ idioma: 'en' }))
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: dir }, sinMarcador), 'en')
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: dir, ARBRAIN_IDIOMA: 'es' }), 'es')
  writeFileSync(join(dir, 'idioma.json'), '﻿{"idioma":"en"}')
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: dir }, sinMarcador), 'en', 'con BOM de Windows')
  writeFileSync(join(dir, 'idioma.json'), 'no es json')
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: dir }, sinMarcador), 'es')
  // Edición cliente sin carpeta explícita: nunca lee la de la instalación original.
  assert.equal(leerIdiomaDisco({ ARBRAIN_EDICION: 'cliente' }, sinMarcador), 'es')
})

test('normalizarIdioma acepta variantes y cae a español', () => {
  for (const v of ['en', 'EN', 'en-US', 'english', 'inglés']) assert.equal(normalizarIdioma(v), 'en', v)
  for (const v of ['es', 'es-MX', '', null, 'fr', 42]) assert.equal(normalizarIdioma(v), 'es', String(v))
})
