// Mudanza de servidor (11 oct 2026): la app pasó el día en el embebido (3218) y al volver al Studio (3300) cambia de
// origen. Lo que la web decide y lleva consigo, sin perder borradores ni fila.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  OCIO_PARA_MUDAR_MS, claveEquivalente, docVacio, fundirBorrador, fundirFila, idsDeImagenes, leerTraspaso, listoParaMudar, partesClave,
} from '../../src/lib/mudanza-servidor'
import { ComposerDrafts } from '../../src/features/chat/lib/composer-drafts'

const base = { urgente: false, streamLocal: false, turnosServidor: 0, hijosVivos: 0, ocioMs: OCIO_PARA_MUDAR_MS, textoAjeno: false }
const clave = (o: string, s: string, c: string) => `arbrain:composer:v1:${JSON.stringify([o, s, c])}`

test('se muda solo en un momento seguro; con el servidor muerto no hay nada que esperar', () => {
  assert.equal(listoParaMudar(base), true)
  assert.equal(listoParaMudar({ ...base, ocioMs: 1000 }), false)
  assert.equal(listoParaMudar({ ...base, streamLocal: true }), false)
  assert.equal(listoParaMudar({ ...base, turnosServidor: 1 }), false)
  assert.equal(listoParaMudar({ ...base, hijosVivos: 2 }), false)
  assert.equal(listoParaMudar({ ...base, textoAjeno: true }), false)
  assert.equal(listoParaMudar({ ...base, urgente: true, ocioMs: 0, streamLocal: true, textoAjeno: true }), true)
})

test('la clave del borrador se reconoce aunque cambie el dueño entre orígenes', () => {
  const embebido = clave('00000000-0000-4000-8000-000000000001', 'chat:default', 'abc')
  const studio = clave('user-real', 'chat:default', 'abc')
  assert.deepEqual(partesClave(studio), ['user-real', 'chat:default', 'abc'])
  assert.equal(partesClave(studio + '#img#x'), null)
  assert.equal(claveEquivalente(studio, [clave('x', 'chat:default', 'otra'), embebido]), embebido)
  assert.equal(claveEquivalente(studio, [embebido, studio]), studio) // la exacta gana
  assert.equal(claveEquivalente(studio, [clave('x', 'consejo', 'abc')]), null)
})

test('borrador vacío: sin texto ni adjuntos', () => {
  assert.equal(docVacio(undefined), true)
  assert.equal(docVacio({ input: '  ', textFiles: [], imageFiles: [], editingMsgId: null }), true)
  assert.equal(docVacio({ input: 'hola', textFiles: [], imageFiles: [], editingMsgId: null }), false)
  assert.equal(docVacio({ input: '', imageFiles: [{ __archivo: 'a' }] }), false)
})

test('fundir no pierde nada: el texto nuevo arriba, el viejo debajo; ids no se suman', () => {
  const viejo = { input: 'lo de la mañana', imageFiles: [{ __archivo: 'a' }], editingMsgId: 'm1' }
  const nuevo = { input: 'lo de la tarde', imageFiles: [{ __archivo: 'b' }, { __archivo: 'a' }], editingMsgId: 'm2' }
  const f = fundirBorrador(viejo, nuevo)
  assert.equal(f.input, 'lo de la tarde\n\nlo de la mañana')
  assert.deepEqual(f.imageFiles, [{ __archivo: 'b' }, { __archivo: 'a' }])
  assert.equal(f.editingMsgId, 'm2')
  assert.deepEqual(fundirBorrador({ input: '' }, nuevo), nuevo)
  assert.equal(fundirBorrador({ input: 'igual' }, { input: 'igual ' }).input, 'igual ')
  assert.equal(fundirBorrador({ input: 'quedo' }, { input: '' }).input, 'quedo')
})

test('la fila se une sin repetir mensajes', () => {
  const a = [{ id: '1', texto: 'uno' }]
  assert.deepEqual(fundirFila(a, [{ id: '1', texto: 'uno' }, { id: '2', texto: 'dos' }]).map(x => x.id), ['1', '2'])
})

test('el paquete se valida y nunca lanza', () => {
  assert.equal(leerTraspaso(null), null)
  assert.equal(leerTraspaso('{'), null)
  assert.equal(leerTraspaso('{"v":2,"borradores":[],"filas":[]}'), null)
  const t = leerTraspaso(JSON.stringify({ v: 1, ts: 1, borradores: [{ clave: clave('o', 's', 'c'), doc: { input: 'x' } }, { clave: 'basura', doc: {} }], filas: [{ clave: 'arbrain:cola:c', items: [] }] }))
  assert.equal(t?.borradores.length, 1)
  assert.deepEqual(t?.borradores[0].imagenes, [])
  assert.equal(t?.filas.length, 1)
  assert.deepEqual(idsDeImagenes({ input: 'x', imageFiles: [{ __archivo: 'a' }, { name: 'z' }] }), ['a'])
})

test('un borrador que llega después de montar el composer aparece sin que Daniel recargue', async () => {
  const guardado = new Map<string, unknown>()
  const drafts = new ComposerDrafts({
    get: async k => ({ value: guardado.get(k) }),
    set: async (k, v) => { guardado.set(k, v) },
  })
  const vacio = { input: '' }
  const k = clave('user-real', 'chat:default', 'abc')
  await drafts.load(k, vacio)
  assert.equal((drafts.entry(k, vacio).value as { input: string }).input, '')
  guardado.set(k, { input: 'traído del embebido' }) // lo que adoptarTraspaso escribe
  drafts.recargarIntactos()
  await new Promise(r => setTimeout(r, 0))
  assert.equal((drafts.entry(k, vacio).value as { input: string }).input, 'traído del embebido')
  // Lo que Daniel ya tocó en el origen nuevo no se recarga por encima.
  drafts.update(k, vacio, () => ({ input: 'escrito aquí' }))
  guardado.set(k, { input: 'otra cosa' })
  drafts.recargarIntactos()
  await new Promise(r => setTimeout(r, 0))
  assert.equal((drafts.entry(k, vacio).value as { input: string }).input, 'escrito aquí')
})

test('los comandos de la mudanza están registrados y concedidos', () => {
  const tauri = join(resolve(__dirname, '../..'), 'src-tauri')
  const lib = readFileSync(join(tauri, 'src/lib.rs'), 'utf8')
  const acl = readFileSync(join(tauri, 'permissions/local-first.toml'), 'utf8')
  for (const c of ['servidor_mudanza_recibida', 'servidor_mudanza_lista', 'servidor_traspaso_tomar']) {
    assert.ok(lib.includes(`servidor::${c}`), `${c} sin registrar`)
    assert.ok(acl.includes(`"${c}"`), `${c} sin permiso`)
  }
})
