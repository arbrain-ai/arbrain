import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imagenLeida, localImagePath, localImageThumbUrl } from '../src/lib/local-image-path'

test('Read de una imagen absoluta devuelve su ruta', () => {
  assert.equal(imagenLeida('Read', JSON.stringify({ file_path: '/tmp/go2probe/f6.jpg' })), '/tmp/go2probe/f6.jpg')
  assert.equal(imagenLeida('Read', JSON.stringify({ file_path: '/Users/x/Pictures/a.PNG' })), '/Users/x/Pictures/a.PNG')
  assert.equal(imagenLeida('view_image', JSON.stringify({ path: '/Users/x/a.webp' })), '/Users/x/a.webp')
})

test('No es imagen leída: otra herramienta, otra extensión, JSON parcial o ruta relativa', () => {
  assert.equal(imagenLeida('Bash', JSON.stringify({ file_path: '/tmp/a.jpg' })), null)
  assert.equal(imagenLeida('Read', JSON.stringify({ file_path: '/tmp/a.md' })), null)
  assert.equal(imagenLeida('Read', '{"file_path":"/tmp/a.jp'), null)
  assert.equal(imagenLeida('Read', JSON.stringify({ file_path: 'rel/a.jpg' })), null)
  assert.equal(imagenLeida('Read', undefined), null)
})

test('localImagePath acepta /tmp y la miniatura pide w', () => {
  assert.equal(localImagePath('/tmp/a.png'), '/tmp/a.png')
  assert.equal(localImagePath('/brand/x.png'), null)
  assert.equal(localImageThumbUrl('/tmp/a b.png', 84), '/api/local-image?path=%2Ftmp%2Fa%20b.png&w=84')
})
