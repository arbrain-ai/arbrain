/**
 * La pantalla de error no deja a nadie atrapado (31 oct 2026). Un fundador en Windows, recién en la 0.2.17, quedó en
 * «Esta pantalla tuvo un problema» (TypeError … reading 'id'): «Recargar» e «Ir al inicio» volvían a pintar lo mismo con
 * lo que el navegador guardó de la vista. Ahora los dos botones tiran ese estado y conservan lo que es de la persona.
 * Reporte: docs/builds/soporte-pantalla-id-2026-10-31/REPORTE.md.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { clavesDeVista, destinoTrasLimpiar, limpiarAlmacenes } from '../../src/lib/estado-local'
import { MENSAJE_ERROR, NOTA_LIMPIAR, PaginaError } from '../../src/components/PaginaError'

/** Lo que tenía un alumno real tras usar 0.2.15 → 0.2.17 (copia en /tmp, ver el reporte), más lo que es suyo. */
const GUARDADO: Record<string, string> = {
  mc_lastChatSessionId: 'd28d4a66-5ca2-4d79-9947-19b2811d647a',
  'arbrain.panelDerecho.fijadas': '[{"id":"mano-calendario-inicio","input":{"vista":"calendario","alcance":"dia"}}]',
  'arbrain.panelDerecho.acomodo': '{"orden":["mano-calendario-inicio"],"taller":true}',
  'arbrain:selection:v2:["00000000-0000-4000-8000-000000000001","default",null]': '{"model":"claude-opus-5-5"}',
  'chat:commands:v1:default': '[]',
  'chat:account': 'default',
  // De la persona: se quedan.
  'arbrain:composer:v1:["owner","chat","new"]': '{"text":"lo que estaba escribiendo"}',
  'arbrain:planning:pending:00000000-0000-4000-8000-000000000001': '{"action":"update"}',
  'arbrain:goals:pending:00000000': '{}',
  'arbrain.comentariosEntregable': '[{"id":"c1"}]',
  'mission-control-theme': 'dark',
  'mission-control-theme-hasta': '9999999999999',
  'arbrain-estilo': 'luminorphism',
  'arbrain-hora-forzada': '9',
}

class Almacen {
  constructor(public datos: Record<string, string>) {}
  get length() { return Object.keys(this.datos).length }
  key(i: number) { return Object.keys(this.datos)[i] ?? null }
  removeItem(k: string) { delete this.datos[k] }
  clear() { this.datos = {} }
}

test('se va el estado de la vista (última conversación, panel, selección, comandos); se queda lo de la persona', () => {
  const quitar = new Set(clavesDeVista(Object.keys(GUARDADO)))
  for (const k of ['mc_lastChatSessionId', 'arbrain.panelDerecho.fijadas', 'arbrain.panelDerecho.acomodo', 'chat:commands:v1:default', 'chat:account']) assert.ok(quitar.has(k), k)
  assert.ok([...quitar].some(k => k.startsWith('arbrain:selection:v2:')))
  for (const k of Object.keys(GUARDADO).filter(k => /composer|pending|comentarios|theme|estilo|hora-forzada/.test(k))) assert.ok(!quitar.has(k), `no debe quitar ${k}`)
})

test('limpiarAlmacenes: localStorage queda solo con lo de la persona y sessionStorage vacío', () => {
  const local = new Almacen({ ...GUARDADO })
  const sesion = new Almacen({ mc_activeChatSessionId: 'x', 'arbrain:recarga-por-desfase': 'b1' })
  const quitadas = limpiarAlmacenes(local, sesion)
  assert.equal(quitadas.length, 6)
  assert.equal(local.datos.mc_lastChatSessionId, undefined)
  assert.equal(local.datos['arbrain:composer:v1:["owner","chat","new"]'], '{"text":"lo que estaba escribiendo"}')
  assert.equal(local.datos['arbrain:planning:pending:00000000-0000-4000-8000-000000000001'], '{"action":"update"}')
  assert.equal(sesion.length, 0)
  // Sin almacenamiento (modo privado, webview sin storage) no lanza.
  assert.deepEqual(limpiarAlmacenes(null, null), [])
})

test('Recargar no vuelve a abrir la conversación que falló; Ir al inicio va a /', () => {
  assert.equal(destinoTrasLimpiar('http://127.0.0.1:4310/chat?session=d28d4a66&msg=9#fin', false), '/chat')
  assert.equal(destinoTrasLimpiar('http://127.0.0.1:4310/calendar', false), '/calendar')
  assert.equal(destinoTrasLimpiar('http://127.0.0.1:4310/chat?session=d28d4a66', true), '/')
  assert.equal(destinoTrasLimpiar('no es url', false), '/')
})

test('las dos pantallas de error usan la salida limpia y lo dicen; «no existe» no', () => {
  const APP = join(__dirname, '..', '..', 'src', 'app')
  for (const f of ['error.tsx', 'global-error.tsx']) assert.match(readFileSync(join(APP, f), 'utf8'), /<PaginaError[^>]*\blimpiar\b/, f)
  assert.doesNotMatch(readFileSync(join(APP, 'not-found.tsx'), 'utf8'), /\blimpiar\b/)
  const conLimpieza = renderToStaticMarkup(createElement(PaginaError, { titulo: 'Esta pantalla tuvo un problema', mensaje: MENSAJE_ERROR, codigo: 'TypeError', limpiar: true }))
  assert.ok(conLimpieza.includes(NOTA_LIMPIAR.replace(/«|»/g, '')) || conLimpieza.includes('Recargar limpia'))
  assert.match(conLimpieza, />Recargar</)
  assert.match(conLimpieza, /href="\/"[^>]*>Ir al inicio</)
  const sinLimpieza = renderToStaticMarkup(createElement(PaginaError, { titulo: 'Esta página no existe', mensaje: 'x', sinRecargar: true }))
  assert.doesNotMatch(sinLimpieza, /Recargar limpia/)
})
