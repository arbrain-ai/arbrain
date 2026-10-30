// Seguridad del alumno (12 oct 2026; docs/builds/seguridad-alumno-2026-10-12/AUDITORIA.md), parte web: «Pausar todo»,
// «Lo que hizo Levy», carpetas abiertas y tope de gasto. Las rutas existen solo en cliente y solo para la app; reanudar
// y abrir carpeta llevan el secreto de confirmar que pone el servidor; el gasto usa la forma oficial de OpenRouter.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { hostDeLaApp } from '../../src/lib/proxy-cliente'
import { ENLACES_TOPE, ETIQUETA_DECISION, nombreHerramienta, resumenGasto, usd } from '../../src/features/seguridad/lib/seguridad'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('las rutas de seguridad están en la lista blanca de cliente y exigen la app', () => {
  for (const r of ['/api/seguridad/bitacora', '/api/seguridad/pausa', '/api/seguridad/carpetas', '/api/seguridad/gasto']) assert.ok(apiPermitidaEnCliente(r), r)
  for (const r of ['bitacora', 'pausa', 'carpetas', 'gasto']) {
    const f = fuente(`src/app/api/seguridad/${r}/route.ts`)
    assert.match(f, /soloAppCliente\(/, `${r}: exige la cookie de la app`)
  }
  // Mutaciones: con chequeo de origen; reanudar y abrir carpeta, con el secreto de confirmar (nunca pausar ni cerrar).
  const pausa = fuente('src/app/api/seguridad/pausa/route.ts')
  assert.match(pausa, /soloAppCliente\(request, true\)/)
  assert.match(pausa, /confirmar: !body\.pausado/)
  const carpetas = fuente('src/app/api/seguridad/carpetas/route.ts')
  assert.match(carpetas, /soloAppCliente\(request, true\)/)
  assert.match(carpetas, /confirmar: body\.accion === 'abrir'/)
  // La llave nunca pasa por la web: el gasto lo consulta el daemon.
  assert.ok(!/OPENROUTER_API_KEY|openrouter\.ai\/api/.test(fuente('src/app/api/seguridad/gasto/route.ts')))
})

test('tope de gasto: textos con la forma oficial de /api/v1/key y enlaces https a las consolas', () => {
  const base = { usadoHoy: null, usadoSemana: null, usadoMes: 2, reinicio: null, gratis: false }
  assert.match(resumenGasto({ ...base, usado: 3.5, limite: null, restante: null })!.linea, /No tiene límite/)
  assert.equal(resumenGasto({ ...base, usado: 3.5, limite: null, restante: null })!.sinLimite, true)
  const conTope = resumenGasto({ ...base, usado: 9, limite: 10, restante: 2.5, reinicio: 'monthly' })!
  assert.equal(conTope.porcentaje, 75)
  assert.match(conTope.linea, /US\$7\.50 de US\$10\.00 al mes/)
  assert.equal(resumenGasto(null), null)
  assert.equal(usd(0.0123), 'US$0.012')
  for (const u of Object.values(ENLACES_TOPE)) assert.match(u, /^https:\/\/(openrouter\.ai|platform\.claude\.com)\//)
})

test('bitácora: cada decisión tiene etiqueta y los nombres de herramienta son legibles', () => {
  for (const d of ['hecho', 'confirmado', 'rechazado', 'vencido', 'sin_respuesta', 'negado', 'pausado'] as const) assert.ok(ETIQUETA_DECISION[d].texto)
  assert.equal(nombreHerramienta('Bash'), 'Terminal')
  assert.equal(nombreHerramienta('mcp__gmail__send_email'), 'gmail · send email')
})

test('DNS rebinding: la web del alumno solo atiende Host de loopback', () => {
  for (const h of ['127.0.0.1:39320', 'localhost:39320', '[::1]:39320', '127.0.0.1', null]) assert.equal(hostDeLaApp(h), true, String(h))
  for (const h of ['evil.example:39320', 'evil.example', 'rebind.ejemplo.test', 'attacker.localhost.example:1', '']) assert.equal(hostDeLaApp(h), false, String(h))
})

test('la UI monta el freno y la sección, y el panel de llaves muestra el tope (primer arranque y Ajustes)', () => {
  assert.match(fuente('src/app/(main)/dashboard-shell.tsx'), /EDICION_CLIENTE && <FrenoGeneral \/>/)
  assert.match(fuente('src/features/configuracion/components/ModalAjustes.tsx'), /seccion === 'seguridad' && <SeccionSeguridad \/>/)
  assert.match(fuente('src/features/primer-arranque/components/PanelLlaves.tsx'), /<TopeDeGasto/)
  assert.match(fuente('src/features/configuracion/secciones.ts'), /secciones: \['llaves', 'voz', 'telefono', 'seguridad', 'privacidad', 'apariencia'\]/)
})

// 0.2.15: «Quitar también el freno» (23 oct 2026) se retiró; lo reemplaza el nivel «Autónomo» con consentimiento. Lo que
// esas pruebas cuidaban (la web no inventa lo que valida el daemon; aflojar lleva el secreto) sigue en autonomia-0-2-15.test.ts.
test('autónomo: la web no trae frase ni «Sin preguntar»; los nombres de los niveles son los del daemon', async () => {
  const web = await import('../../src/features/seguridad/lib/seguridad')
  const daemon = fuente('server/src/cliente/modo-permisos.ts')
  assert.ok(!('FRASE_SIN_FRENO' in web))
  assert.deepEqual(web.FICHAS_MODO.map(f => f.modo), ['autonomo', 'carpeta', 'preguntar'])
  for (const f of web.FICHAS_MODO) assert.match(daemon, new RegExp(`${f.modo}: '${f.nombre}'`), f.modo)
  assert.match(web.RED_MINIMA, /dinero/i)
})

test('autónomo: la ruta exige la app; aflojar lleva el secreto; retirar y decidir después, no', () => {
  assert.ok(apiPermitidaEnCliente('/api/seguridad/permisos'))
  const r = fuente('src/app/api/seguridad/permisos/route.ts')
  assert.match(r, /soloAppCliente\(request, true\)/)
  assert.match(r, /confirmar: body\.modo !== 'preguntar'/)
  assert.match(r, /retirar: true, via/)
  assert.ok(!/sinFreno/.test(r))
  const ui = fuente('src/features/seguridad/components/Seguridad.tsx')
  assert.match(ui, /ConsentimientoAutonomia/)
  assert.match(ui, /Retirar mi consentimiento/)
})
