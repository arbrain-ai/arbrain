/** Enlaces a la propia app: se abren dentro de Arbrain aunque el puerto cambie; los demás siguen afuera. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { RUTAS_APP, rutaInterna, videoDeEvento } from '../../src/features/planning/enlace-interno'

const STUDIO = 'http://127.0.0.1:3300/calendar?mode=day'

test('mismo origen: interno, con su búsqueda', () => {
  assert.equal(rutaInterna('http://127.0.0.1:3300/youtube?ver=abcdefghijk', STUDIO), '/youtube?ver=abcdefghijk')
})

test('el puerto cambió entre arranques (3300 ↔ 3218, o se escribió desde localhost:3000): sigue siendo interno', () => {
  assert.equal(rutaInterna('http://localhost:3000/youtube?ver=abcdefghijk', STUDIO), '/youtube?ver=abcdefghijk')
  assert.equal(rutaInterna('http://127.0.0.1:3300/youtube?ver=abcdefghijk', 'http://127.0.0.1:3218/calendar'), '/youtube?ver=abcdefghijk')
})

test('lo de afuera sigue afuera: Meet, YouTube, otro servicio local que no es ruta de la app, otro host', () => {
  assert.equal(rutaInterna('https://meet.google.com/abc-defg-hij', STUDIO), null)
  assert.equal(rutaInterna('https://www.youtube.com/watch?v=abcdefghijk', STUDIO), null)
  assert.equal(rutaInterna('http://127.0.0.1:8099/peliculas/a.mp4', STUDIO), null)
  assert.equal(rutaInterna('http://evil.example/youtube?ver=abcdefghijk', STUDIO), null)
  assert.equal(rutaInterna('javascript:alert(1)', STUDIO), null)
})

test('el video de un evento de «ver después» sale de su descripción', () => {
  const e = { description: 'Ver después, desde Contenido · AI Engineer.\nhttp://localhost:3000/youtube?ver=abcdefghijk', location: '' }
  assert.equal(videoDeEvento(e, STUDIO), '/youtube?ver=abcdefghijk')
  assert.equal(videoDeEvento({ description: 'Llamada https://meet.google.com/x' }, STUDIO), null)
})

test('la lista de rutas de la app no se desfasa de src/app/(main)', () => {
  const dir = path.join(process.cwd(), 'src', 'app', '(main)')
  const reales = readdirSync(dir).filter(n => statSync(path.join(dir, n)).isDirectory()).sort()
  assert.deepEqual([...RUTAS_APP].sort(), reales)
})
