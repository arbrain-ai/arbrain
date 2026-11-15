// Voz en inglés (13 nov 2026): con English en Ajustes, el lector elige una voz inglesa del sistema (también en Apple,
// donde en español se deja la del sistema) y su `lang` de respaldo es el inglés de la persona o en-US; lo que dice en
// lugar de una ruta o un archivo también va en inglés.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buildSpoken, mejorVozIngles } from '../../src/features/chat/lib/chat-speech'
import { idiomaDeRespaldo, idiomaPreferidoIngles } from '../../src/features/chat/lib/voz-sistema'
import { fijarIdiomaPrueba } from '../../src/shared/i18n/tr'

afterEach(() => fijarIdiomaPrueba(null))

const v = (name: string, lang: string, extra: Partial<{ localService: boolean; default: boolean }> = {}) => ({ name, lang, ...extra })

test('mejorVozIngles: calidad primero, luego la región de la persona, nunca una voz novedad ni una española', () => {
  const voces = [v('Juan (Enhanced)', 'es-MX'), v('Grandpa', 'en-US'), v('Daniel', 'en-GB'), v('Samantha', 'en-US'), v('Ava (Premium)', 'en-US'), v('Google UK English Male', 'en-GB')]
  assert.equal(mejorVozIngles(voces)?.name, 'Ava (Premium)')
  assert.equal(mejorVozIngles(voces.filter((x) => !/Premium/.test(x.name)))?.name, 'Google UK English Male')
  assert.equal(mejorVozIngles([v('Samantha', 'en-US'), v('Daniel', 'en-GB')], 'en-GB')?.name, 'Daniel')
  assert.equal(mejorVozIngles([v('Juan', 'es-MX'), v('Grandma', 'en-US')]), null)
})

test('idioma de respaldo: inglés de la persona o en-US cuando la app está en inglés; español como siempre si no', () => {
  assert.equal(idiomaPreferidoIngles(['es-MX', 'en-GB']), 'en-GB')
  assert.equal(idiomaDeRespaldo(['es-MX'], true, true), 'en-US')
  assert.equal(idiomaDeRespaldo(['en-GB', 'es-MX'], false, true), 'en-GB')
  assert.equal(idiomaDeRespaldo(['es-419'], true, false), 'es-MX')
})

test('lo que se dice en lugar de una ruta o un archivo sigue al idioma', () => {
  fijarIdiomaPrueba('es')
  assert.match(buildSpoken('Abre /Users/usuario/notas/plan.md ya').spoken, /una ruta/)
  fijarIdiomaPrueba('en')
  assert.match(buildSpoken('Open /Users/usuario/notas/plan.md now').spoken, /a path/)
  assert.match(buildSpoken('Due 10/31/2026').spoken, /October 31, 2026/)
})
