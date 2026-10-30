/**
 * CANDADO (2 oct 2026, Daniel, quinta vez que lo pide): en la barra de conversaciones, al montar la app
 * (reconstruir o recargar, web y escritorio) los grupos por fecha (Hoy, Ayer, Hace 2 días y anteriores)
 * nacen CERRADOS; solo «Fijadas» va abierta. Si esta prueba falla, NO la ajustes: devuelve el default.
 * Causa raíz y evidencia: docs/builds/sidebar-grupos-cerrados-2026-10-02/ESTADO.md
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useRecientesStore } from '../../src/features/chat/stores/recientes-store'
import { diaAbierto, filasVisibles } from '../../src/features/chat/lib/recientes-plegado'
import { agruparPorDia } from '../../src/features/chat/lib/recientes-lista'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const SRC = join(__dirname, '../../src/features/chat')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const AHORA = new Date(2026, 9, 2, 9, 54).getTime()
const ses = (diasAtras: number, id: string): ChatSession => {
  const iso = new Date(2026, 9, 2 - diasAtras, 8).toISOString()
  return { id, title: id, is_favorite: false, profile_id: null, created_at: iso, updated_at: iso, last_message_at: iso }
}

test('el store recién montado no trae ningún grupo por fecha abierto', () => {
  const { abiertos } = useRecientesStore.getInitialState()
  assert.deepEqual(abiertos, {}, 'abiertos debe nacer vacío: cualquier entrada abre un grupo al cargar')
  const grupos = agruparPorDia([ses(0, 'a'), ses(1, 'b'), ses(2, 'c'), ses(6, 'd')], AHORA)
  assert.ok(grupos.length >= 3)
  for (const g of grupos) {
    assert.equal(diaAbierto(abiertos, g.clave), false, `«${g.etiqueta}» nació abierto`)
    assert.deepEqual(filasVisibles(g, false), [], `«${g.etiqueta}» pinta filas estando cerrado`)
  }
})

test('lo abierto a mano no sobrevive a recargar: el store no se persiste', () => {
  assert.equal((useRecientesStore as unknown as { persist?: unknown }).persist, undefined, 'recientes-store no puede usar persist()')
  const store = leer('stores/recientes-store.ts')
  assert.doesNotMatch(store, /\bpersist\s*\(|localStorage|sessionStorage/, 'recientes-store no puede persistir los grupos abiertos')
  assert.doesNotMatch(leer('lib/recientes-plegado.ts'), /localStorage|sessionStorage/)
})

test('RecientesNav decide abierto/cerrado solo con el store (sin default local que los abra)', () => {
  const nav = leer('components/RecientesNav.tsx')
  assert.match(nav, /const abierto = diaAbierto\(abiertos, g\.clave\)/, 'el estado del grupo debe salir de diaAbierto(abiertos, …)')
  assert.doesNotMatch(nav, /!plegados\[/, 'regresó el default viejo «abierto salvo que se pliegue» (98d1a061)')
  // sessionStorage sí guarda la conversación activa (mc_activeChatSessionId); nunca los grupos.
  assert.doesNotMatch(nav, /(local|session)Storage\.setItem\([^)]*(plegad|abiert|grupo|dia)/i, 'la barra no puede recordar grupos entre recargas')
})

test('cerrado es cerrado: la conversación activa no se asoma bajo un día plegado (Daniel, 4 oct 2026)', () => {
  const nav = leer('components/RecientesNav.tsx')
  assert.match(nav, /filasVisibles\(g, abierto\)/, 'RecientesNav no puede pasar la conversación activa a filasVisibles')
  const [hoy] = agruparPorDia([ses(0, 'activa'), ses(0, 'otra')], AHORA)
  assert.deepEqual(filasVisibles(hoy, false), [])
})
