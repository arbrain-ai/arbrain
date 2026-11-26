// Extensiones (21 nov 2026, fase 2 del SPEC docs/builds/extensiones-2026-11-20): el lado web del panel aislado. La fuente
// `ext:` tiene su propia puerta y NO afloja la de las islas; la URL firmada abre solo `panel/` de UNA extensión; la CSP es
// la de las vistas (sin red). Las reglas de disco, instalar y quitar se prueban en server/src/extensiones/extensiones.test.ts.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { FORMA_FUENTE, leerMensaje } from '../../src/features/canvas/islas/protocolo'
import { FORMA_FUENTE_EXT, leerMensajePanel, textoDeAccion, urlDeAccion, leerManifiesto } from '../../src/features/extensiones/modelo'
import { alcancePanel, CSP_PANEL, rutaPedida, urlPanel } from '../../src/features/extensiones/crudo'
import { cadaEnPalabras } from '../../src/features/extensiones/ui/tipos'
import { CSP_VISTA } from '../../src/features/chat/lib/html-blindado'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FUENTE = 'ext:$CEREBRO/.claude/memory/extensiones/competencia/embudos.json'

test('extensiones · la fuente ext: no afloja FORMA_FUENTE de las islas', () => {
  assert.equal(FORMA_FUENTE.test(FUENTE), false)
  assert.equal(leerMensaje({ tipo: 'pedir', fuente: FUENTE }), null, 'una isla no puede pedir ext:')
  assert.equal(FORMA_FUENTE_EXT.test(FUENTE), true)
  assert.deepEqual(leerMensajePanel({ tipo: 'pedir', fuente: FUENTE }), { tipo: 'pedir', fuente: FUENTE })
  assert.equal(leerMensajePanel({ tipo: 'pedir', fuente: 'pulso:venta' }), null, 'un panel no pide fuentes de las islas')
  assert.equal(leerMensajePanel({ tipo: 'pedir', fuente: 'ext:/etc/passwd.json' }), null)
  assert.equal(leerMensajePanel({ tipo: 'pedir', fuente: 'ext:$HOME/.ssh/x.json' }), null)
})

test('extensiones · el manifiesto real de Competencia: lo declarado, sus acciones y su tarea', () => {
  const ruta = join(import.meta.dirname, '../../../docs/builds/extensiones-2026-11-20/arbrain-extensiones/extensiones/competencia/arbrain.json')
  const m = leerManifiesto(JSON.parse(readFileSync(ruta, 'utf8')))
  assert.ok(m?.panel)
  assert.equal(m.panel.datos.length, 4)
  assert.equal(textoDeAccion('chat:censar', m), 'Corre el censo de mis competidores.')
  assert.equal(textoDeAccion('chat:borrar-todo', m), null, 'una acción no declarada no manda texto')
  assert.equal(urlDeAccion('url:https://www.nutriologojorge.com/'), 'https://www.nutriologojorge.com/')
  assert.equal(urlDeAccion('url:file:///etc/passwd'), null)
  assert.deepEqual(m.tareas.map(t => [t.id, t.cada, t.necesita]), [['estudio-semanal', '0 20 * * 0', ['youtube_data_api_key']]])
  assert.equal(cadaEnPalabras('0 20 * * 0'), 'los domingos a las 20:00')
  assert.equal(cadaEnPalabras('30 6 * * *'), 'todos los días a las 06:30')
})

test('extensiones · la URL del panel solo abre panel/ de la extensión firmada', () => {
  assert.equal(urlPanel('tok', 'competencia', 'index.html'), '/api/extensiones/crudo/tok/competencia/index.html')
  assert.deepEqual(rutaPedida(alcancePanel('competencia'), ['competencia', 'index.html']), { id: 'competencia', ruta: 'index.html' })
  assert.deepEqual(rutaPedida(alcancePanel('competencia'), ['competencia', 'img', 'logo.png']), { id: 'competencia', ruta: 'img/logo.png' })
  assert.equal(rutaPedida(alcancePanel('competencia'), ['mapa-de-negocio', 'index.html']), null, 'la firma es de UNA extensión')
  assert.equal(rutaPedida(null, ['competencia', 'index.html']), null, 'firma vencida o falsa')
  assert.equal(rutaPedida(alcancePanel('competencia'), ['competencia', '..', 'arbrain.json']), null)
  assert.equal(rutaPedida(alcancePanel('competencia'), ['competencia', '..%2Farbrain.json']), null)
  assert.equal(rutaPedida(alcancePanel('competencia'), ['competencia']), null)
  assert.equal(rutaPedida('/Users/x/Developer', ['competencia', 'index.html']), null, 'un alcance de documento no abre paneles')
  assert.match(CSP_PANEL, /^sandbox allow-scripts; /)
  assert.match(CSP_PANEL, /connect-src 'none'/)
  assert.match(CSP_PANEL, /img-src data: blob:/)
  assert.doesNotMatch(CSP_PANEL, /allow-same-origin/)
})

test('extensiones · next.config pone la CSP del panel después de la general (en la del alumno, la general la pisaba)', () => {
  const cfg = readFileSync(join(import.meta.dirname, '../../next.config.ts'), 'utf8')
  const general = cfg.indexOf("source: '/(.*)'")
  const panel = cfg.indexOf("source: '/api/extensiones/crudo/:ruta*'")
  assert.ok(general > 0 && panel > general, 'la entrada del panel va después de /(.*): «la última gana»')
  assert.match(cfg.slice(panel, panel + 300), /sandbox allow-scripts; \$\{CSP_VISTA\}/)
  assert.equal(CSP_PANEL, `sandbox allow-scripts; ${CSP_VISTA}`)
})
