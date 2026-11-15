// Marcador IDIOMA de la copia del alumno en inglés (fase 3 de «Arbrain en inglés», 13 nov 2026): `generar.mjs --idioma en`
// escribe `arbrain/IDIOMA` = en y la app nace en English; Ajustes › Idioma (idioma.json) lo puede volver a Español.
// Precedencia: ARBRAIN_IDIOMA > idioma.json > marcador > español.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RUTAS_MARCADOR_IDIOMA, leerIdiomaDisco, marcadorIdioma } from '../../src/shared/i18n/idioma'

/** Una copia de juguete: `<raiz>/arbrain/IDIOMA` con el texto que se pida. Devuelve la raíz y su `arbrain/`. */
function copia(texto?: string) {
  const raiz = mkdtempSync(join(tmpdir(), 'copia-idioma-'))
  const arbrain = join(raiz, 'arbrain')
  mkdirSync(arbrain, { recursive: true })
  if (texto !== undefined) writeFileSync(join(arbrain, 'IDIOMA'), texto)
  return { raiz, arbrain }
}

const MARCADOR_EN = '# Language of this Arbrain copy.\n# "en": the app starts in English.\nen\n'

test('el marcador se busca como el de EDICION: IDIOMA desde arbrain/ (cwd de Next) y arbrain/IDIOMA desde la raíz', () => {
  assert.deepEqual([...RUTAS_MARCADOR_IDIOMA], ['IDIOMA', 'arbrain/IDIOMA'])
  const { raiz, arbrain } = copia(MARCADOR_EN)
  assert.equal(marcadorIdioma(arbrain), 'en')
  assert.equal(marcadorIdioma(raiz), 'en')
  // Comentarios y líneas vacías se saltan; sin marcador o sin valor, null (decide lo siguiente).
  assert.equal(marcadorIdioma(copia('\n# nada\n\nes\n').arbrain), 'es')
  assert.equal(marcadorIdioma(copia('# solo comentarios\n').arbrain), null)
  assert.equal(marcadorIdioma(copia().arbrain), null)
})

test('precedencia: ARBRAIN_IDIOMA > idioma.json de Ajustes > marcador IDIOMA > español', () => {
  const { arbrain } = copia(MARCADOR_EN)
  const config = mkdtempSync(join(tmpdir(), 'config-idioma-'))
  const deps = { cwd: arbrain }
  // Nada elegido en Ajustes: la copia inglesa nace en English.
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: config }, deps), 'en')
  // La persona eligió Español en Ajustes: gana el archivo.
  writeFileSync(join(config, 'idioma.json'), JSON.stringify({ idioma: 'es' }))
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: config }, deps), 'es')
  // Un idioma.json ilegible cuenta como ausente: decide el marcador.
  writeFileSync(join(config, 'idioma.json'), 'no es json')
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: config }, deps), 'en')
  // La variable manda sobre todo (pruebas, diagnóstico).
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: config, ARBRAIN_IDIOMA: 'es' }, deps), 'es')
  // Edición cliente sin carpeta de configuración (la copia corriendo fuera de la app): el marcador decide.
  assert.equal(leerIdiomaDisco({ ARBRAIN_EDICION: 'cliente' }, deps), 'en')
  // Sin marcador: español, como siempre (la copia española y el repo del autor no lo traen).
  assert.equal(leerIdiomaDisco({ ARBRAIN_EDICION: 'cliente' }, { cwd: copia().arbrain }), 'es')
})

test('fs inyectado: el marcador se lee sin tocar disco (y sin fs, null)', () => {
  const leidas: string[] = []
  const fs = { readFileSync: (ruta: string) => { leidas.push(ruta); if (ruta === '/copia/arbrain/IDIOMA') return 'en\n'; throw new Error('ENOENT') } }
  assert.equal(marcadorIdioma('/copia', fs), 'en')
  assert.deepEqual(leidas, ['/copia/IDIOMA', '/copia/arbrain/IDIOMA'])
  assert.equal(marcadorIdioma('/otra', fs), null)
})

test('app instalada: la web compilada corre fuera de la copia y encuentra el marcador en ARBRAIN_HOME (la raíz de la copia)', () => {
  const { raiz } = copia(MARCADOR_EN)
  const fuera = copia().arbrain // el cwd del standalone: sin marcador
  assert.equal(leerIdiomaDisco({ ARBRAIN_EDICION: 'cliente', ARBRAIN_HOME: raiz }, { cwd: fuera }), 'en')
  // Ajustes sigue mandando sobre el marcador.
  const config = mkdtempSync(join(tmpdir(), 'config-idioma-'))
  writeFileSync(join(config, 'idioma.json'), JSON.stringify({ idioma: 'es' }))
  assert.equal(leerIdiomaDisco({ ARBRAIN_CONFIG_DIR: config, ARBRAIN_HOME: raiz }, { cwd: fuera }), 'es')
  // Un cerebro sin marcador (la copia española, el repo del autor): español.
  assert.equal(leerIdiomaDisco({ ARBRAIN_EDICION: 'cliente', ARBRAIN_HOME: copia().raiz }, { cwd: fuera }), 'es')
})
