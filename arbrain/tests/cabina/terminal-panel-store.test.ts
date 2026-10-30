import { test } from 'node:test'
import { strict as assert } from 'node:assert'

// localStorage mínimo para el store (corre en Node).
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) }, removeItem: k => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0,
}

test('terminal inferior: pestañas, activa y reconciliación con el motor', async () => {
  const { useTerminalPanel: st, ALTO_MIN } = await import('../../src/shared/stores/terminal-panel-store')
  const t = st.getState()
  t.hidratar()
  assert.equal(st.getState().abierto, false)
  st.getState().agregar(10); st.getState().agregar(11); st.getState().agregar(11)
  assert.deepEqual(st.getState().pestanas.map(p => p.id), [10, 11])
  assert.equal(st.getState().activa, 11)
  assert.equal(st.getState().abierto, true)
  st.getState().quitar(11)
  assert.equal(st.getState().activa, 10)
  st.getState().agregar(12)
  st.getState().reconciliar([12])
  assert.deepEqual(st.getState().pestanas.map(p => p.id), [12])
  assert.equal(st.getState().activa, 12)
  st.getState().setAlto(10)
  assert.equal(st.getState().alto, ALTO_MIN)
  st.getState().quitar(12)
  assert.equal(st.getState().abierto, false, 'sin pestañas el panel se cierra')
  assert.equal(JSON.parse(mem.get('arbrain:terminal-panel:v1')!).pestanas.length, 0)
})
