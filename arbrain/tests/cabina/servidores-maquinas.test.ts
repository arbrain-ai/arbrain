import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { maquinaDe, hostsVps, porMaquina } from '../../src/features/cabina/vistas/servidores-maquinas'
import type { FilaServidor } from '../../src/features/cabina/vistas/servidores-veredicto'

const fila = (id: string, endpoint: string | null, grupo: FilaServidor['grupo'] = 'miembros', estado: FilaServidor['estado'] = 'ok'): FilaServidor =>
  ({ id, grupo, nombre: id, que: '', endpoint, estado, frase: null, dato: null, revisado: '', racha: 0, desde: null, detalle: {} })

const filas = [
  fila('web', 'www.tu-sitio.example'), fila('mensajero', '10.20.30.40'), fila('labs', 'ejemplo.203-0-113-7.sslip.io'), fila('gratuita', 'ejemplo.workers.dev'),
  fila('levy', '127.0.0.1', 'cerebro'), fila('motor', 'localhost', 'cerebro'), fila('funnel', 'estudio.ejemplo.ts.net', 'cerebro', 'lento'),
  fila('studio', 'localhost', 'maquinas'), fila('vps', '10.20.30.40', 'maquinas', 'caido'),
]
test('loopback, launchd y Funnel van al Studio; lo remoto al VPS', () => {
  const v = hostsVps(filas)
  assert.deepEqual([...v], ['10.20.30.40'])
  const m = (id: string) => maquinaDe(filas.find(f => f.id === id)!, v)
  assert.deepEqual(['levy', 'motor', 'funnel', 'studio'].map(m), ['studio', 'studio', 'studio', 'studio'])
  assert.deepEqual(['web', 'mensajero', 'labs', 'gratuita', 'vps'].map(m), ['vps', 'vps', 'vps', 'vps', 'vps'])
})
test('Studio primero, resumen propio y Nube solo si existe', () => {
  const p = porMaquina(filas)
  assert.deepEqual(p.map(x => x.id), ['studio', 'vps'])
  assert.equal(p[0].texto, '1 con problema'); assert.equal(p[1].texto, '1 con problema'); assert.equal(p[1].tono, 'caido')
  assert.equal(porMaquina([...filas, fila('app', 'mi-app.vercel.app')]).at(-1)!.id, 'nube')
})
test('sin endpoint usa detalle.url; sin nada decide el grupo', () => {
  const f = { ...fila('x', null), detalle: { url: 'https://labs.example.com/a' } }
  assert.equal(maquinaDe(f, new Set()), 'vps')
  assert.equal(maquinaDe(fila('y', null, 'cerebro'), new Set()), 'studio')
  assert.equal(maquinaDe(fila('z', null), new Set()), 'vps')
})
