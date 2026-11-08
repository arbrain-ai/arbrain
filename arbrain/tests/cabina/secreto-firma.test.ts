// Secreto de firma estable (8 nov 2026, Daniel: «se quedó congelada, le regreso pero no cambia»). El secreto era aleatorio por
// proceso: cada deploy reiniciaba el servidor y los enlaces de video de una página abierta dejaban de valer (403 en cada
// petición nueva). Ahora vive en un archivo de la carpeta de configuración y lo comparten todos los procesos.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ARCHIVO_SECRETO, leerOCrearSecreto, olvidarSecretoResuelto, secretoDeFirma } from '../../src/lib/secreto-firma'
import { firmarArchivo, verificarArchivo } from '../../src/lib/archivos-chat-server'

let dir = ''
const envAntes = { cfg: process.env.ARBRAIN_CONFIG_DIR, doc: process.env.ARBRAIN_DOC_SECRET, ed: process.env.ARBRAIN_EDICION }
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'secreto-')); process.env.ARBRAIN_CONFIG_DIR = dir; delete process.env.ARBRAIN_DOC_SECRET; delete process.env.ARBRAIN_EDICION; olvidarSecretoResuelto() })
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  for (const [k, v] of [['ARBRAIN_CONFIG_DIR', envAntes.cfg], ['ARBRAIN_DOC_SECRET', envAntes.doc], ['ARBRAIN_EDICION', envAntes.ed]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  olvidarSecretoResuelto()
})

test('la primera vez crea el archivo (0600, 64 hex) y las siguientes lo leen igual', () => {
  const a = join(dir, ARCHIVO_SECRETO)
  const uno = leerOCrearSecreto(a), dos = leerOCrearSecreto(a)
  assert.equal(uno.toString(), dos.toString())
  assert.match(readFileSync(a, 'utf8').trim(), /^[0-9a-f]{64}$/)
  assert.equal(statSync(a).mode & 0o777, 0o600)
})

test('un archivo corrupto (vacío o a medias) se reemplaza por uno válido y queda estable', () => {
  const a = join(dir, ARCHIVO_SECRETO)
  writeFileSync(a, 'basura')
  const uno = leerOCrearSecreto(a)
  assert.match(uno.toString(), /^[0-9a-f]{64}$/)
  assert.equal(leerOCrearSecreto(a).toString(), uno.toString())
})

test('un reinicio (proceso nuevo) conserva el secreto: un enlace firmado antes de reiniciar sigue valiendo', () => {
  const enlace = firmarArchivo('/tmp/video.mp4')
  const antes = secretoDeFirma().toString()
  olvidarSecretoResuelto()                       // el proceso muere y nace otro, con la misma carpeta de configuración
  assert.equal(secretoDeFirma().toString(), antes)
  assert.equal(verificarArchivo(enlace), '/tmp/video.mp4')
})

test('dos procesos distintos (relevo azul/verde) comparten el secreto y se validan entre sí', () => {
  const enlaceDelA = firmarArchivo('/tmp/a.mp4')
  olvidarSecretoResuelto()                       // «proceso B»: mismo archivo, resolución propia
  assert.equal(verificarArchivo(enlaceDelA), '/tmp/a.mp4')
})

test('ARBRAIN_DOC_SECRET, si alguien la fija, manda sobre el archivo', () => {
  process.env.ARBRAIN_DOC_SECRET = 'fijado-a-mano'
  assert.equal(secretoDeFirma().toString(), 'fijado-a-mano')
})

test('sin carpeta de configuración escribible cae a un secreto aleatorio por proceso, como antes', () => {
  process.env.ARBRAIN_CONFIG_DIR = join(dir, 'es-un-archivo', 'dentro')
  writeFileSync(join(dir, 'es-un-archivo'), 'x')   // un archivo donde debería haber carpeta: mkdir falla
  const s = secretoDeFirma()
  assert.equal(s.length, 32)
  assert.equal(secretoDeFirma(), s)                // estable dentro del proceso
})
