import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { dentroDeRaiz, esHTML, leerLigaDoc } from '../../src/features/canvas/model/doc'

test('doc: la ruta relativa al repo, con su fragmento, como sfmap', () => {
  assert.deepEqual(leerLigaDoc('doc:docs/mapa.html'), { ruta: 'docs/mapa.html' })
  assert.deepEqual(leerLigaDoc('doc:/docs/./a.md#seccion'), { ruta: 'docs/a.md', fragmento: 'seccion' })
  assert.deepEqual(leerLigaDoc('DOC:docs/con%20espacio.html'), { ruta: 'docs/con espacio.html' })
  assert.equal(esHTML('a/b.HTM'), true)
  assert.equal(esHTML('a/b.md'), false)
})

test('doc: todo intento de salir de la raíz se rechaza', () => {
  for (const mala of [
    'doc:../secreto.md', 'doc:docs/../../etc/passwd', 'doc:docs/%2e%2e/x', 'doc:~/.ssh/id_rsa',
    'doc:file:///etc/passwd', 'doc:a\\..\\b', 'doc:', 'doc:/', 'doc:a//b', 'doc:a/\0b', 'https://x.com', null,
  ]) assert.equal(leerLigaDoc(mala), null, String(mala))
})

test('doc: la comprobación en disco exige quedar DENTRO de la raíz', () => {
  assert.equal(dentroDeRaiz('/r/repo/docs/a.html', '/r/repo'), true)
  assert.equal(dentroDeRaiz('/r/repo', '/r/repo'), false)            // la raíz misma no es un documento
  assert.equal(dentroDeRaiz('/r/repo-gemelo/a.html', '/r/repo'), false) // prefijo engañoso
  assert.equal(dentroDeRaiz('/Users/x/.ssh/id_rsa', '/r/repo/'), false)
})
