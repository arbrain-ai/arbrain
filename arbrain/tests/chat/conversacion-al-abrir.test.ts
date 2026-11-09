import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAVE_ULTIMO_ENLACE, sesionDeEnlaceVigente } from '../../src/features/chat/lib/conversacion-al-abrir'

const almacen = (inicial: Record<string, string> = {}) => {
  const datos = new Map(Object.entries(inicial))
  return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v) } }
}

test('sin enlace no hay nada que abrir y no se anota nada', () => {
  const a = almacen()
  assert.equal(sesionDeEnlaceVigente('', true, a), null)
  assert.equal(a.datos.size, 0)
})

test('un push nuevo manda aunque la app arranque en frío', () => {
  const a = almacen({ [CLAVE_ULTIMO_ENLACE]: '?session=a&msg=1' })
  assert.equal(sesionDeEnlaceVigente('?session=a&msg=2', true, a), 'a')
  assert.equal(a.datos.get(CLAVE_ULTIMO_ENLACE), '?session=a&msg=2')
})

test('reabrir con la URL que restauró el iPhone no le gana a donde te quedaste', () => {
  const a = almacen()
  assert.equal(sesionDeEnlaceVigente('?session=a&msg=1', true, a), 'a')
  assert.equal(sesionDeEnlaceVigente('?session=a&msg=1', true, a), null)
})

test('dentro de la app el mismo enlace siempre manda', () => {
  const a = almacen({ [CLAVE_ULTIMO_ENLACE]: '?session=a' })
  assert.equal(sesionDeEnlaceVigente('?session=a', false, a), 'a')
})

test('sin almacenamiento el enlace sigue funcionando', () => {
  const roto = { getItem: () => { throw new Error('privado') }, setItem: () => { throw new Error('privado') } }
  assert.equal(sesionDeEnlaceVigente('?session=a', true, roto), 'a')
})
