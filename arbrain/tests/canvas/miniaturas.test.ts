import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { sinMiniatura } from '../../src/features/canvas/state/miniaturas'

const p = (id: string, elementos: number, miniatura: string | null) => ({ id, elementos, miniatura })

test('backfill: solo lienzos con algo que dibujar y sin miniatura, sin repetir lo intentado', () => {
  const ps = [p('a', 3, null), p('b', 0, null), p('c', 9, 'https://x/c.webp'), p('d', 2, null)]
  assert.deepEqual(sinMiniatura(ps, new Set()).map(x => x.id), ['a', 'd'])
  assert.deepEqual(sinMiniatura(ps, new Set(['a'])).map(x => x.id), ['d'])
})
