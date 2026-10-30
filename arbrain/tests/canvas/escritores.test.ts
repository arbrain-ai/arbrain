import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { guardarSinPisar, hayCambioQueGuardar, type RespuestaGuardado } from '../../src/features/canvas/state/nube'
import { Autosave } from '../../src/features/canvas/state/autosave'
import { conInteraccion } from '../../src/features/canvas/model/vista-embed'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const el = (id: string, x = 0, updatedAt = 1, extra: Record<string, unknown> = {}): CanvasElement => ({
  id, type: 'shape', x, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, createdAt: 1, updatedAt, ...extra,
} as unknown as CanvasElement)
const emb = (id: string, interactive = false) => el(id, 0, 1, { type: 'embed', url: 'doc:a.html', interactive })

/** Un servidor de mentira con la misma regla que la ruta PUT: base distinta = 409. */
function servidor(inicial: CanvasElement[], version: number) {
  const s = { elements: inicial, version, escrituras: 0, lecturas: 0 }
  const guardar = async (els: CanvasElement[], base: number): Promise<RespuestaGuardado> => {
    if (base !== s.version) return { ok: false, conflicto: true, version: s.version }
    s.escrituras++; s.elements = els; s.version++
    return { ok: true, version: s.version }
  }
  const traer = async () => { s.lecturas++; return { elements: s.elements, version: s.version } }
  return { s, guardar, traer }
}

test('409: sin choque se guarda tal cual, una sola escritura', async () => {
  const { s, guardar, traer } = servidor([el('a')], 3)
  const r = await guardarSinPisar({ base: [el('a')], elements: [el('a'), el('web', 0, 9)], baseVersion: 3, guardar, traer })
  assert.equal(r.ok, true)
  assert.equal(s.version, 4); assert.equal(s.escrituras, 1); assert.equal(s.lecturas, 0)
})

test('409: sfmap guardó en medio → se trae, se fusiona y se reintenta UNA vez; nadie pisa a nadie', async () => {
  const base = [el('a'), el('b')]
  // sfmap ya escribió (v4): movió b y agregó s.
  const { s, guardar, traer } = servidor([el('a'), el('b', 50, 5), el('s', 0, 5)], 4)
  // La web guarda sobre v3 lo suyo: movió a y creó w.
  const r = await guardarSinPisar({ base, elements: [el('a', 20, 6), el('b'), el('w', 0, 6)], baseVersion: 3, guardar, traer })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.ok(r.remoto, 'devuelve lo remoto para fusionarlo en pantalla')
  const x = Object.fromEntries(s.elements.map(e => [e.id, e.x]))
  assert.deepEqual(x, { a: 20, b: 50, s: 0, w: 0 })   // lo de los dos lados quedó escrito
  assert.equal(s.version, 5); assert.equal(s.escrituras, 1); assert.equal(s.lecturas, 1)
})

test('409: si vuelve a chocar se rinde sin bucle (2 intentos, 1 lectura) y devuelve lo remoto', async () => {
  const { s, traer } = servidor([el('a')], 7)
  let intentos = 0
  const siempreChoca = async (): Promise<RespuestaGuardado> => { intentos++; return { ok: false, conflicto: true, version: s.version + intentos } }
  const r = await guardarSinPisar({ base: [el('a')], elements: [el('a', 1, 9)], baseVersion: 6, guardar: siempreChoca, traer })
  assert.equal(r.ok, false)
  assert.equal(intentos, 2); assert.equal(s.lecturas, 1)
  if (!r.ok) assert.equal(r.remoto.version, 7)
})

test('tras un choque doble lo pendiente pasa a ser la fusión sin adelantar el reintento', async () => {
  const guardados: CanvasElement[][] = []
  const a = new Autosave('p', async ({ elements }) => { guardados.push(elements); return { ok: true, version: 1 } }, { debounceMs: 30 })
  const cam = { x: 0, y: 0, zoom: 1 }
  a.reemplazar([el('fusion')], cam)
  assert.equal(a.isClean(), false)
  await new Promise(r => setTimeout(r, 80))
  assert.deepEqual(guardados.map(g => g.map(e => e.id)), [['fusion']])
  a.dispose()
})

test('mirar, seleccionar o activar un embed no pide guardar (la versión no sube)', () => {
  const cam = { x: 0, y: 0, zoom: 1 }
  const doc = [el('a'), emb('e')]
  // mirar: el mismo arreglo y la misma cámara
  assert.equal(hayCambioQueGuardar({ prev: doc, elements: doc, camaraGuardada: cam, camera: { ...cam } }), false)
  // seleccionar: onDragEnd re-rutea y devuelve copias con lo mismo
  assert.equal(hayCambioQueGuardar({ prev: doc, elements: doc.map(e => ({ ...e })), camaraGuardada: cam, camera: cam }), false)
  // activar el embed: es vista; el documento no cambia y lo pintado no se guarda
  const activos = new Set(['e'])
  const pintado = conInteraccion(doc, activos)
  assert.equal(pintado.find(e => e.id === 'e')!.type === 'embed' && (pintado.find(e => e.id === 'e') as { interactive: boolean }).interactive, true)
  assert.equal((doc[1] as { interactive: boolean }).interactive, false)   // no muta el documento
  assert.equal(hayCambioQueGuardar({ prev: doc, elements: doc, camaraGuardada: cam, camera: cam }), false)
  // sin nada activo, lo pintado es EL MISMO arreglo
  assert.equal(conInteraccion(doc, new Set()), doc)
  // una edición real sí pide guardar; mover la cámara también
  assert.equal(hayCambioQueGuardar({ prev: doc, elements: [el('a', 5, 2), doc[1]], camaraGuardada: cam, camera: cam }), true)
  assert.equal(hayCambioQueGuardar({ prev: doc, elements: doc, camaraGuardada: cam, camera: { ...cam, x: 10 } }), true)
})

test('un interactive viejo guardado en la página se ignora al pintar y no se reescribe', () => {
  const viejo = [emb('e', true)]
  const pintado = conInteraccion(viejo, new Set())
  assert.equal((pintado[0] as { interactive: boolean }).interactive, false)
  assert.equal((viejo[0] as { interactive: boolean }).interactive, true)
})
