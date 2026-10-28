// Cola de aprobaciones que vuelve sola (harness-noche 27 oct 2026, ronda 2): qué entra a la cola, en qué hilo se pinta,
// cómo se dice «desde cuándo» y que la tarjeta ya no cuente minutos ni diga que se rechaza sola.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { desdeCuando, enLaCola, resumenCorrida, ultimaLineaUtil, vivasParaLaPersona, type Confirmacion } from '../../src/features/permisos/lib/confirmacion'

const c = (over: Partial<Confirmacion>): Confirmacion => ({ id: 'cf_000000000001', estado: 'pendiente', categoria: 'otra', origen: 'agente', resumen: 'x', creada: 1, expira: Date.now() + 60_000, creadaPor: 'guardia', ...over })

test('la cola: lo que nadie espera, por conversación; lo pendiente con un turno delante no', () => {
  const l = [c({ id: 'a', estado: 'en_cola', conversacion: 'uno' }), c({ id: 'b', estado: 'en_cola', conversacion: 'dos' }), c({ id: 'p', conversacion: 'uno' }), c({ id: 'r', estado: 'corriendo', conversacion: 'uno', enColaDesde: 5 }), c({ id: 's', estado: 'corriendo', conversacion: 'uno' })]
  assert.deepEqual(enLaCola(l).map(x => x.id), ['a', 'b', 'r'])
  assert.deepEqual(enLaCola(l, 'uno').map(x => x.id), ['a', 'r'])
  assert.deepEqual(vivasParaLaPersona(l).map(x => x.id).sort(), ['a', 'b', 'p', 'r', 's'])
})

test('«desde cuándo» explícito, nunca minutos sueltos', () => {
  const ahora = new Date(2026, 9, 27, 18, 30).getTime()
  assert.equal(desdeCuando(new Date(2026, 9, 27, 10, 42).getTime(), ahora), 'desde las 10:42')
  assert.equal(desdeCuando(new Date(2026, 9, 26, 18, 5).getTime(), ahora), 'desde ayer a las 18:05')
  assert.match(desdeCuando(new Date(2026, 9, 24, 9, 0).getTime(), ahora), /^desde el 24 oct/)
})

test('la tarjeta: sin cuenta regresiva, freno sin ámbar ni «Una vez», rechazo escrito y «Siempre» en humano', () => {
  const t = readFileSync(new URL('../../src/features/chat/components/TarjetaComando.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(t, /c\.expira - ahora|segundos \/ 60/)
  assert.match(t, /peligro \? null : \(/)
  assert.match(t, /className=\{s\.consecuencia\}/)
  assert.match(t, /c\.patronFrase/)
  assert.match(t, /void decidir\('no'\)/)
  const m = readFileSync(new URL('../../src/features/permisos/components/ConfirmacionesHumanas.tsx', import.meta.url), 'utf8')
  assert.match(m, /queda en tu cola: nada pasa sin tu clic/)
  assert.match(m, /<Suspense fallback=\{null\}><ContadorCola \/><\/Suspense>/)
  const chat = readFileSync(new URL('../../src/features/chat/components/ChatPanel.tsx', import.meta.url), 'utf8')
  assert.match(chat, /\{EDICION_CLIENTE && <ColaDelHilo conversationId=\{activeSession\?\.id\} \/>\}/)
})

test('ronda 3 · «Córrelo tú» terminado: lo que pasó en una frase, sin contraseñas ni códigos de color', () => {
  assert.equal(ultimaLineaUtil('Password:\n\x1b[32minstaller: The install was successful.\x1b[0m\r\n'), 'installer: The install was successful.')
  assert.equal(ultimaLineaUtil('Password:\n'), null)
  assert.equal(resumenCorrida({ codigo: 0, salida: 'ok listo' }).titulo, 'Listo: terminó bien')
  assert.match(resumenCorrida({ codigo: 0, salida: 'ok listo' }).frase, /«ok listo»/)
  assert.equal(resumenCorrida({ codigo: 1, salida: 'sudo: 3 incorrect password attempts' }).ok, false)
  assert.doesNotMatch(resumenCorrida({ codigo: 1, salida: 'sudo: 3 incorrect password attempts' }).frase, /password/)
  assert.equal(resumenCorrida({}).ok, null)
})

test('ronda 3 · nada se encima: la cola vive en lugares propios y cada decisión es una ficha compacta', () => {
  const t = readFileSync(new URL('../../src/features/permisos/components/ColaDeAprobaciones.tsx', import.meta.url), 'utf8')
  assert.match(t, /\[data-shell-main\]/)
  assert.match(t, /padre\.prepend\(el\)/)
  assert.match(t, /export function FichaCola/)
  // El freno y lo que necesita tus manos no se aprueban desde la ficha: solo se abren.
  assert.match(t, /const rapida = !manos && !peligro && !listo && !corriendo/)
  const css = readFileSync(new URL('../../src/features/permisos/components/cola.module.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /\.pastilla/)
  const tc = readFileSync(new URL('../../src/features/chat/components/TarjetaComando.tsx', import.meta.url), 'utf8')
  assert.match(tc, /fraseManos\(c, equipo\)/)
  assert.match(tc, /descartarTerminada\(c\.id\)/)
})
