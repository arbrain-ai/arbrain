import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 9 nov 2026: con Opus elegido, la lista de conversaciones del chat escondía las de «Sin filtro». La lista trae todas
// las cuentas, como la barra lateral, y cada fila ajena lleva su rótulo.
const raiz = join(__dirname, '..', '..', 'src', 'features', 'chat')

test('la lista del chat pide las conversaciones de todas las cuentas', () => {
  const hook = readFileSync(join(raiz, 'hooks', 'useChatHistory.ts'), 'utf8')
  const pedido = hook.match(/\/api\/chat\/sessions\?source=mc[^`]*/g) ?? []
  assert.ok(pedido.length > 0, 'no encontré el pedido de la lista')
  for (const p of pedido) assert.ok(!/account=/.test(p), `la lista no debe filtrar por cuenta: ${p}`)
})

test('cada fila de otra cuenta lleva su rótulo', () => {
  const fila = readFileSync(join(raiz, 'components', 'SessionItem.tsx'), 'utf8')
  assert.match(fila, /cuentaReciente\(cuentaDe\(session\)\)/)
  assert.match(fila, /cuenta\.corta/)
})
