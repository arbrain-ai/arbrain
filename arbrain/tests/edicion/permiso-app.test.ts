// Permiso por app (1 nov 2026, opción 1 firmada por Daniel): la tarjeta «Siempre / Solo esta conversación / No», qué
// hace el teclado (Escape = no; una tecla suelta nunca aprueba) y qué viaja al daemon con el clic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { campoAjeno, cuerpoResolverApp, decisionPorTecla, esDecisionApp, frasePara, ID_PEDIDO_APP } from '../../src/features/permisos/lib/permiso-app'

const leer = (r: string) => readFileSync(new URL(`../../src/${r}`, import.meta.url), 'utf8')

test('Escape es «No»; ninguna otra tecla decide nada (Enter y Espacio no aprueban)', () => {
  assert.equal(decisionPorTecla({ key: 'Escape', enCampoAjeno: false }), 'no')
  for (const key of ['Enter', ' ', 'a', 'Tab', 's', 'y']) assert.equal(decisionPorTecla({ key, enCampoAjeno: false }), null, key)
})

test('el Escape de otro campo (el chat) no le niega nada a Levy; mantener Escape apretado tampoco repite', () => {
  assert.equal(decisionPorTecla({ key: 'Escape', enCampoAjeno: true }), null)
  assert.equal(decisionPorTecla({ key: 'Escape', enCampoAjeno: false, repetida: true }), null)
})

test('campo ajeno: un input, textarea o editable fuera de la tarjeta; dentro de la tarjeta no', () => {
  const tarjeta = { contains: (x: unknown) => x === dentro }
  const dentro = { tagName: 'BUTTON' }
  assert.equal(campoAjeno({ tagName: 'TEXTAREA' } as never, tarjeta as never), true)
  assert.equal(campoAjeno({ tagName: 'DIV', isContentEditable: true } as never, tarjeta as never), true)
  assert.equal(campoAjeno({ tagName: 'BODY' } as never, tarjeta as never), false)
  assert.equal(campoAjeno(dentro as never, tarjeta as never), false)
  assert.equal(campoAjeno(null, null), false)
})

test('el clic manda solo el id y la decisión (ni la app, ni el para qué, ni la conversación)', () => {
  assert.deepEqual(cuerpoResolverApp('pa_0123456789ab', 'conversacion'), { id: 'pa_0123456789ab', decision: 'conversacion' })
  for (const d of ['siempre', 'conversacion', 'no']) assert.equal(esDecisionApp(d), true)
  for (const d of ['permitir', 'una', '', null, 'SIEMPRE']) assert.equal(esDecisionApp(d), false)
  assert.equal(ID_PEDIDO_APP.test('pa_0123456789ab'), true)
  assert.equal(ID_PEDIDO_APP.test('cf_0123456789ab'), false)
  assert.equal(frasePara({ para: '' }), 'Levy no dijo para qué.')
})

test('la ruta de la web valida y reenvía al daemon con el secreto de confirmar; nada más', () => {
  const ruta = leer('app/api/manos/apps/resolver/route.ts')
  assert.match(ruta, /soloAppCliente\(request, true\)/)
  assert.match(ruta, /alDaemon\('\/manos\/apps\/resolver', \{ method: 'POST', confirmar: true/)
  assert.match(ruta, /JSON\.stringify\(\{ id: body\.id, decision: body\.decision \}\)/)
})

test('la tarjeta: tres botones, el sí solo con clic real, Escape = No, y va primero en el hilo', () => {
  const t = leer('features/permisos/components/TarjetaPermisoApp.tsx')
  for (const b of ['Solo esta conversación', 'Siempre', 'No']) assert.match(t, new RegExp(`\\} ${b}\\n`))
  assert.match(t, /if \(d !== 'no' && !esClicHumano\(/)
  assert.match(t, /decisionPorTecla\(\{ key: e\.key, repetida: e\.repeat/)
  assert.match(t, /disabled=\{!armado \|\| !!ocupado\} onClick=\{alClic\('siempre'\)\}/)
  const turno = leer('features/chat/components/TarjetaComando.tsx')
  assert.match(turno, /apps\.map\(\(p, i\) => <TarjetaPermisoApp key=\{p\.id\} p=\{p\} escape=\{i === 0\} \/>\)/)
})

test('Ajustes › Computer use lista las apps en «Siempre» y las deja quitar (edición cliente)', () => {
  const cu = leer('features/permisos/components/ComputerUse.tsx')
  assert.match(cu, /\{estado\.edicion === 'cliente' && <AppsSiempre \/>\}/)
  assert.match(cu, /fetch\('\/api\/manos\/apps', \{ method: 'POST'/)
  const ruta = leer('app/api/manos/apps/route.ts')
  assert.match(ruta, /alDaemon\('\/manos\/apps\/quitar'/)
})

test('el sondeo de confirmaciones trae también las tarjetas de apps', () => {
  assert.match(leer('app/api/confirmaciones/route.ts'), /apps: Array\.isArray\(j\?\.apps\) \? j\.apps : \[\]/)
  assert.match(leer('features/permisos/lib/pendientes.ts'), /filter\(p => p && p\.estado === 'pendiente'/)
})
