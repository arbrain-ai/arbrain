import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { cuerpoPrimerMensaje, esLaMisma, filaConversacion, leerPedido } from '../../src/features/cabina/conversacion-nueva'
import { atenderConversacion, SABE, type Entorno } from '../../src/features/cabina/panel/conversacion-nueva'
import { decidirCliente } from '../../src/lib/proxy-cliente'

const ID = '11111111-2222-4333-8444-555555555555'
const TURNO = '99999999-8888-4777-8666-555555555555'
const base = { id: ID, turnId: TURNO, ownerId: 'perfil-1', account: 'default', title: ' Estilo  Fulano × Arbrain ', message: ' Toma el relevo ' }

test('ruta: valida lo que manda el agent-server', () => {
  const p = leerPedido(base)
  assert.ok(!('error' in p))
  assert.equal(p.title, 'Estilo Fulano × Arbrain')
  assert.equal(p.message, 'Toma el relevo')
  for (const malo of [{ ...base, id: 'x' }, { ...base, turnId: '' }, { ...base, ownerId: '' }, { ...base, title: '' }, { ...base, title: 'x'.repeat(81) }, { ...base, message: '' }, { ...base, message: '/compact' }, null]) {
    assert.ok('error' in leerPedido(malo), JSON.stringify(malo))
  }
})

test('ruta: la fila es del dueño de origen, en su cuenta, ya fijada y arriba', () => {
  const p = leerPedido(base) as Exclude<ReturnType<typeof leerPedido>, { error: string }>
  assert.deepEqual(filaConversacion(p, 'default'), { id: ID, title: 'Estilo Fulano × Arbrain', profile_id: 'perfil-1', account: null, is_favorite: true, pinned_position: null })
  assert.equal(filaConversacion(p, 'bro').account, 'bro')
  // Un reintento con el mismo id vale; un id ocupado por otro dueño o cuenta, no.
  assert.equal(esLaMisma({ profile_id: 'perfil-1', account: null }, p, 'default'), true)
  assert.equal(esLaMisma({ profile_id: 'otro', account: null }, p, 'default'), false)
  assert.equal(esLaMisma({ profile_id: 'perfil-1', account: 'bro' }, p, 'default'), false)
})

test('ruta: el primer mensaje va a /chat/stream como uno escrito, aceptado y con turno estable', () => {
  const p = leerPedido(base) as Exclude<ReturnType<typeof leerPedido>, { error: string }>
  assert.deepEqual(cuerpoPrimerMensaje(p, 'default'), { message: 'Toma el relevo', ownerId: 'perfil-1', account: 'default', chatSessionId: ID, turnId: TURNO, verifiedConversation: true, acceptOnly: true, source: 'desktop' })
})

test('edición cliente: la ruta existe y la llama el daemon sin cookie (la ruta compara su Bearer)', () => {
  assert.deepEqual(decidirCliente('/api/cabina/conversacion', false), { tipo: 'pasa' })
})

function entorno(fijadasTras: number, abiertaTras: number | null) {
  const eventos: Array<[string, unknown]> = []
  let t = 0
  const e: Entorno = {
    emitir: (ev, d) => { eventos.push([ev, d]) },
    fijadas: () => (t >= fijadasTras ? [ID] : []),
    activa: () => (abiertaTras !== null && t >= abiertaTras ? `sdk:${ID}` : null),
    esperar: async (ms) => { t += ms },
  }
  return { e, eventos }
}

test('app: pide releer Fijadas y acusa solo cuando la ve ahí', async () => {
  assert.deepEqual([...SABE], ['conversacion'])
  const { e, eventos } = entorno(400, null)
  const r = await atenderConversacion({ id: ID, titulo: 'Estilo Fulano', abrir: false }, e)
  assert.deepEqual(eventos, [['openclaw:session-pinned', { id: ID, fijada: true }]])
  assert.equal(r.ok, true)
  assert.match(r.detalle, /ya aparece en Fijadas/)
  const lenta = await atenderConversacion({ id: ID, titulo: 'Estilo Fulano', abrir: false }, entorno(99_999, null).e, 600)
  assert.equal(lenta.ok, false)
  assert.match(lenta.detalle, /aún no aparece/)
})

test('app: con abrir, la abre y lo confirma; si el chat no está a la vista, lo dice', async () => {
  const { e, eventos } = entorno(0, 200)
  const r = await atenderConversacion({ id: ID, titulo: 'T', abrir: true }, e)
  assert.deepEqual(eventos.map(([ev]) => ev), ['openclaw:session-pinned', 'openclaw:open-session'])
  assert.equal(r.ok, true)
  assert.match(r.detalle, /quedó abierta/)
  const sinChat = await atenderConversacion({ id: ID, titulo: 'T', abrir: true }, entorno(0, null).e, 400)
  assert.equal(sinChat.ok, false)
  assert.match(sinChat.detalle, /no se abrió/)
  assert.equal((await atenderConversacion(undefined, e)).ok, false)
})
