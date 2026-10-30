// Botón Play, ronda 4 (harness-noche 27 oct 2026): un solo orden de botones, nombres de archivo enteros, la frase
// cálida antes de pedir la contraseña y la cola que no tapa el mensaje de Levy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fraseManos, piezasLiteral } from '../../src/features/permisos/lib/confirmacion'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')

test('ronda 4: antes de la terminal, qué va a pasar y por qué se pide la contraseña; Levy no la ve', () => {
  const sudo = { literal: 'sudo installer -pkg ~/Downloads/DymoConnect.pkg -target /', frase: 'Con tu contraseña de administrador: instalar el controlador de la impresora (DymoConnect.pkg)', resumen: 'x' }
  assert.equal(fraseManos(sudo, 'Tu Mac'), 'Tu Mac pide tu contraseña para instalar el controlador de la impresora. Escríbela en el recuadro negro de abajo y presiona Enter; Levy no la ve.')
  assert.equal(fraseManos({ ...sudo, frase: undefined }), 'Tu computadora pide tu contraseña. Escríbela en el recuadro negro de abajo y presiona Enter; Levy no la ve.')
  assert.match(fraseManos({ literal: 'gh auth login', resumen: 'x' })!, /^Este programa te pide iniciar sesión\..*Levy no lo ve\.$/)
  assert.equal(fraseManos({ literal: '', resumen: 'x' }), null)
  const tc = leer('../../src/features/chat/components/TarjetaComando.tsx')
  // La frase va antes que la terminal en el código de la tarjeta que corre.
  assert.ok(tc.indexOf('data-calida') > 0 && tc.indexOf('data-calida') < tc.indexOf('s.terminalMarco'), 'la frase cálida va antes de la terminal')
})

test('ronda 4: el literal se parte por argumentos, nunca a media palabra', () => {
  assert.deepEqual(piezasLiteral('rm a/2024-01.pdf  b.pdf'), ['rm', ' ', 'a/2024-01.pdf', '  ', 'b.pdf'])
  assert.equal(piezasLiteral('rm a b').join(''), 'rm a b', 'el texto exacto no cambia')
  const css = leer('../../src/features/chat/components/tarjeta-comando.module.css')
  assert.doesNotMatch(css, /word-break:\s*break-all/)
  assert.match(css, /\.pieza\s*\{/)
})

test('ronda 4: un solo orden de botones en todas las vistas (el sí antes que el No; nada se reacomoda a lo angosto)', () => {
  const tc = leer('../../src/features/chat/components/TarjetaComando.tsx')
  const botones = tc.slice(tc.indexOf('className={s.botones}'), tc.indexOf('className={s.rechazo}'))
  assert.ok(botones.indexOf("alClic('una')") < botones.indexOf("alClic('siempre')"), 'Una vez antes de Permitir siempre')
  assert.ok(botones.lastIndexOf("alClic('una')") < botones.indexOf("alClic('no')"), 'el sí del freno también antes del No')
  assert.ok(botones.indexOf("alClic('siempre')") < botones.indexOf("alClic('no')"), 'Permitir siempre antes del No')
  const css = leer('../../src/features/chat/components/tarjeta-comando.module.css')
  assert.doesNotMatch(css, /\.(botones|principal|secundario|noDominante|consecuencia)[^{}]*\{[^}]*\border:\s*\d/, 'ningún botón cambia de lugar con order')
})

test('ronda 4: la cola del hilo desplaza el hilo de arriba lo que crece, para no tapar el mensaje de Levy', () => {
  const t = leer('../../src/features/permisos/components/ColaDeAprobaciones.tsx')
  assert.match(t, /function useAnclarHilo/)
  assert.match(t, /hilo\.scrollTop \+= crecio/)
  assert.match(t, /<section ref=\{ancla\} className=\{s\.hilo\}/)
})
