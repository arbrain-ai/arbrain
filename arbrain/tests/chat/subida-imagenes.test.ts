import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITE_SUBIDA_BYTES, MAX_LADO_IMAGEN, PRESUPUESTO_BYTES, UMBRAL_SIN_TOCAR_BYTES,
  dimensionesDestino, formatoBytes, mensajeFallosSubida, necesitaRecompresion, nombreConTipo, subirImagen, tipoPorBytes,
} from '../../src/features/chat/lib/image-upload.ts'
import { ComposerDrafts } from '../../src/features/chat/lib/composer-drafts.ts'
import { crearPersistenciaBorradores, type Almacen } from '../../src/features/chat/lib/draft-persistence.ts'

const MB = 1024 * 1024
const png = (bytes = 100, nombre = 'captura.png') => new File([new Uint8Array(bytes)], nombre, { type: 'image/png' })

// ── Reducción de dimensiones ────────────────────────────────────────────────────────────────────────────

test('dos monitores (8960×2880) se reducen a 4096 de lado mayor conservando la proporción', () => {
  const d = dimensionesDestino(8960, 2880)
  assert.equal(d.ancho, MAX_LADO_IMAGEN)
  assert.equal(d.alto, Math.round(2880 * 4096 / 8960))
  assert.equal(d.reducida, true)
})

test('una captura de 4264×2880 baja a 4096×2767 y una de 3910×1916 no se toca ni se agranda', () => {
  assert.deepEqual(dimensionesDestino(4264, 2880), { ancho: 4096, alto: 2767, reducida: true })
  assert.deepEqual(dimensionesDestino(3910, 1916), { ancho: 3910, alto: 1916, reducida: false })
  assert.deepEqual(dimensionesDestino(800, 600), { ancho: 800, alto: 600, reducida: false })
})

test('las escalas de respaldo achican más allá del lado máximo, nunca a cero', () => {
  const d = dimensionesDestino(8960, 2880, MAX_LADO_IMAGEN, 0.36)
  assert.equal(d.ancho, Math.round(8960 * (4096 / 8960) * 0.36))
  assert.ok(dimensionesDestino(1, 1, 4096, 0.1).ancho >= 1)
})

test('recomprimir solo cuando hace falta: grande en píxeles, pesada, formato raro o por encima del umbral', () => {
  const ok = { tipo: 'image/png', bytes: 400_000, ancho: 1920, alto: 1080 }
  assert.equal(necesitaRecompresion(ok), false)
  assert.equal(necesitaRecompresion({ ...ok, ancho: 8960, alto: 2880 }), true)
  assert.equal(necesitaRecompresion({ ...ok, bytes: UMBRAL_SIN_TOCAR_BYTES + 1 }), true)
  assert.equal(necesitaRecompresion({ ...ok, bytes: PRESUPUESTO_BYTES + 1 }), true)
  assert.equal(necesitaRecompresion({ ...ok, tipo: 'image/heic' }), true)
})

test('el tipo real sale de los bytes, no del type que pone el portapapeles', () => {
  assert.equal(tipoPorBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(tipoPorBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(tipoPorBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'image/gif')
  assert.equal(tipoPorBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp')
  assert.equal(tipoPorBytes(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), 'image/heic')
  assert.equal(tipoPorBytes(new Uint8Array([1, 2, 3])), null)
})

test('el nombre toma la extensión del formato en que realmente va', () => {
  assert.equal(nombreConTipo('Captura 2026.png', 'image/webp'), 'Captura 2026.webp')
  assert.equal(nombreConTipo('IMG_0001.HEIC', 'image/jpeg'), 'IMG_0001.jpg')
  assert.equal(nombreConTipo('', 'image/png'), 'imagen.png')
})

// ── Subida: reintento automático y mensajes con causa ───────────────────────────────────────────────────────

const respuesta = (estado: number, cuerpo: unknown) => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } })
const sinEspera = async () => {}

test('sube a la primera y devuelve la URL', async () => {
  const llamadas: string[] = []
  const f: typeof fetch = async (url, init) => { llamadas.push(String(url)); assert.ok(init?.body instanceof FormData); return respuesta(200, { url: 'https://x/a.png' }) }
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera })
  assert.deepEqual(r, { ok: true, url: 'https://x/a.png', intentos: 1 })
  assert.deepEqual(llamadas, ['/api/storage/upload'])
})

test('si la red falla una vez, reintenta solo y sube', async () => {
  let n = 0, esperado = 0
  const f: typeof fetch = async () => { if (++n === 1) throw new TypeError('Load failed'); return respuesta(200, { url: 'https://x/b.png' }) }
  const r = await subirImagen(png(), { fetchFn: f, esperar: async ms => { esperado = ms } })
  assert.equal(r.ok, true)
  assert.equal(r.intentos, 2)
  assert.ok(esperado > 0, 'hay una pausa antes del reintento')
})

test('el cuerpo cortado en el camino (el fallo real del 2 oct) se reintenta y, si persiste, explica qué hacer', async () => {
  let n = 0
  const f: typeof fetch = async () => { n++; return respuesta(400, { code: 'cuerpo_incompleto', error: 'La imagen llegó incompleta al servidor' }) }
  const r = await subirImagen(png(4 * MB, 'Captura de pantalla.png'), { fetchFn: f, esperar: sinEspera })
  assert.equal(n, 2)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.fallo.motivo, /cortó/)
  assert.match(r.fallo.motivo, /pegar o adjuntar/)
  assert.doesNotMatch(r.fallo.motivo, /^no se pudo/i)
})

test('un 400 pelado (el servidor HTTP cortó un envío a medias, sin pasar por nuestra ruta) también se trata como cuerpo cortado', async () => {
  let n = 0
  const f: typeof fetch = async () => { n++; return new Response('', { status: 400 }) }
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera })
  assert.equal(n, 2)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.fallo.motivo, /cortó/)
})

test('lo que reintentar no arregla no se reintenta: sesión vencida, formato, tamaño', async () => {
  for (const [estado, cuerpo, esperado] of [
    [401, { code: 'no_autorizado', error: 'Unauthorized' }, /sesión expiró/],
    [400, { code: 'tipo_invalido', error: 'Invalid file type' }, /PNG, JPG, WebP, GIF/],
    [413, { code: 'demasiado_grande', error: 'x' }, /hasta 10 MB/],
  ] as const) {
    let n = 0
    const f: typeof fetch = async () => { n++; return respuesta(estado, cuerpo) }
    const r = await subirImagen(png(12 * MB), { fetchFn: f, esperar: sinEspera })
    assert.equal(n, 1, `estado ${estado} no se reintenta`)
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.fallo.motivo, esperado)
  }
})

test('servidor reiniciando (502/503) se reintenta y el mensaje habla de reinicio, no de «no se pudo»', async () => {
  let n = 0
  const f: typeof fetch = async () => { n++; return respuesta(503, 'Service Unavailable') }
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera })
  assert.equal(n, 2)
  if (!r.ok) assert.match(r.fallo.motivo, /reinicio|deploy/)
})

test('500 incluye el código y el detalle del servidor para poder diagnosticar', async () => {
  const f: typeof fetch = async () => respuesta(500, { code: 'almacenamiento', error: 'bucket lleno' })
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera, intentos: 1 })
  assert.equal(r.ok, false)
  if (!r.ok) { assert.match(r.fallo.motivo, /500/); assert.match(r.fallo.motivo, /bucket lleno/) }
})

test('una subida que no termina se corta por tiempo y se dice', async () => {
  const f: typeof fetch = (_u, init) => new Promise((_ok, mal) => { init?.signal?.addEventListener('abort', () => mal(new DOMException('aborted', 'AbortError'))) })
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera, timeoutMs: 20, intentos: 1 })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.fallo.motivo, /tardó más de lo permitido/)
})

test('un 200 sin URL no cuenta como subida', async () => {
  const f: typeof fetch = async () => respuesta(200, {})
  const r = await subirImagen(png(), { fetchFn: f, esperar: sinEspera, intentos: 1 })
  assert.equal(r.ok, false)
})

test('el aviso nombra la imagen, su peso y la causa; nunca un «no se pudo» pelado', () => {
  const f = { nombre: 'Captura.png', bytes: 3 * MB, motivo: 'se cortó en el camino. Vuelve a pegar la imagen.', reintentable: true }
  const uno = mensajeFallosSubida([f], 1, 0)
  assert.match(uno, /«Captura\.png» \(3\.0 MB\)/)
  assert.match(uno, /se cortó/)
  assert.match(uno, /volvió a la caja/)
  const dos = mensajeFallosSubida([f, { ...f, nombre: 'Otra.png' }], 2, 0)
  assert.match(dos, /ninguno de los 2/)
  assert.equal((dos.match(/se cortó/g) ?? []).length, 1, 'la misma causa se dice una vez')
  const mixto = mensajeFallosSubida([f], 2, 1)
  assert.match(mixto, /Subieron 1 de 2/)
  assert.match(mixto, /no se mandó nada/)
})

test('formatoBytes y el límite del servidor', () => {
  assert.equal(formatoBytes(2.5 * MB), '2.5 MB')
  assert.equal(formatoBytes(512 * 1024), '512 KB')
  assert.equal(LIMITE_SUBIDA_BYTES, 10 * MB)
  assert.ok(PRESUPUESTO_BYTES < LIMITE_SUBIDA_BYTES)
})

// ── Borrador con imágenes ────────────────────────────────────────────────────────────────────────────────────

function almacenEnMemoria(opciones: { fallaAlEscribir?: (k: string, v: unknown) => Error | null } = {}) {
  const datos = new Map<string, unknown>()
  const almacen: Almacen = {
    get: async k => datos.get(k),
    set: async (k, v) => { const e = opciones.fallaAlEscribir?.(k, v); if (e) throw e; datos.set(k, structuredClone(v)) },
    del: async k => { datos.delete(k) },
  }
  return { datos, almacen }
}
const VACIO = { input: '', imageFiles: [] as File[], editingMsgId: null as string | null }
const cuota = () => Object.assign(new Error('The quota has been exceeded'), { name: 'QuotaExceededError' })

test('el borrador guarda el texto y las imágenes por separado: teclear no reescribe los megabytes', async () => {
  const { datos, almacen } = almacenEnMemoria()
  const p = crearPersistenciaBorradores(almacen)
  const grande = png(6 * MB)
  assert.equal(await p.set('d', { ...VACIO, input: 'hola', imageFiles: [grande] }), undefined)
  const escrituras: string[] = []
  const original = almacen.set
  almacen.set = async (k, v) => { escrituras.push(k); return original(k, v) }
  await p.set('d', { ...VACIO, input: 'hola mundo', imageFiles: [grande] })
  assert.deepEqual(escrituras, ['d'], 'solo se reescribe el documento de texto, no la imagen')
  const doc = datos.get('d') as { imageFiles: Array<Record<string, unknown>> }
  assert.equal(doc.imageFiles.length, 1)
  assert.equal(doc.imageFiles[0].name, 'captura.png')
  assert.equal(doc.imageFiles[0].bytes, undefined, 'el documento lleva referencias, no bytes')
})

test('al recargar, el borrador vuelve con su texto y sus imágenes intactas', async () => {
  const { almacen } = almacenEnMemoria()
  const bytes = new Uint8Array(2 * MB).map((_, i) => i % 251)
  const a = new File([bytes], 'uno.png', { type: 'image/png', lastModified: 123 })
  const b = new File([new Uint8Array(1000)], 'dos.webp', { type: 'image/webp' })
  await crearPersistenciaBorradores(almacen).set('d', { ...VACIO, input: 'texto', imageFiles: [a, b] })
  // Proceso nuevo: otra instancia sin memoria de lo escrito.
  const leido = await crearPersistenciaBorradores(almacen).get('d')
  assert.equal(leido.aviso, undefined)
  const v = leido.value as typeof VACIO
  assert.equal(v.input, 'texto')
  assert.deepEqual(v.imageFiles.map(f => [f.name, f.type, f.size]), [['uno.png', 'image/png', 2 * MB], ['dos.webp', 'image/webp', 1000]])
  assert.equal(v.imageFiles[0].lastModified, 123)
  assert.deepEqual(new Uint8Array(await v.imageFiles[0].arrayBuffer()).slice(0, 300), bytes.slice(0, 300))
})

test('si una imagen no cabe, el texto igual se guarda y el aviso dice cuál problema es (cuota)', async () => {
  const { datos, almacen } = almacenEnMemoria({ fallaAlEscribir: k => k.includes('#img#') ? cuota() : null })
  const r = await crearPersistenciaBorradores(almacen).set('d', { ...VACIO, input: 'no pierdas esto', imageFiles: [png(MB)] })
  assert.ok(r && 'aviso' in r)
  assert.match(r.aviso, /texto de tu borrador está guardado/)
  assert.match(r.aviso, /1 imagen no/)
  assert.match(r.aviso, /no tiene espacio/)
  assert.equal((datos.get('d') as typeof VACIO).input, 'no pierdas esto')
  assert.deepEqual((datos.get('d') as typeof VACIO).imageFiles, [])
})

test('un archivo que el sistema ya no puede leer no tumba el guardado del texto (el fallo real)', async () => {
  const { datos, almacen } = almacenEnMemoria()
  const muerto = png(1000, 'fantasma.png')
  muerto.arrayBuffer = async () => { throw new DOMException('The object can not be found here.', 'NotFoundError') }
  const r = await crearPersistenciaBorradores(almacen).set('d', { ...VACIO, input: 'sigo aquí', imageFiles: [muerto, png(500, 'viva.png')] })
  assert.ok(r && 'aviso' in r)
  assert.match(r.aviso, /no se pudo leer/)
  const doc = datos.get('d') as { input: string; imageFiles: Array<{ name: string }> }
  assert.equal(doc.input, 'sigo aquí')
  assert.deepEqual(doc.imageFiles.map(i => i.name), ['viva.png'])
})

test('si ni el documento cabe, el error nombra la causa', async () => {
  const llena = almacenEnMemoria({ fallaAlEscribir: () => cuota() })
  await assert.rejects(crearPersistenciaBorradores(llena.almacen).set('d', VACIO), (e: Error) => /no tiene espacio/.test(e.message))
  const rota = almacenEnMemoria({ fallaAlEscribir: () => new Error('boom') })
  await assert.rejects(crearPersistenciaBorradores(rota.almacen).set('d', VACIO), (e: Error) => /no pudo guardarse en este dispositivo/.test(e.message))
})

test('quitar una imagen o vaciar el borrador borra sus bytes del almacén', async () => {
  const { datos, almacen } = almacenEnMemoria()
  const p = crearPersistenciaBorradores(almacen)
  const a = png(100, 'a.png'), b = png(100, 'b.png')
  await p.set('d', { ...VACIO, imageFiles: [a, b] })
  assert.equal([...datos.keys()].filter(k => k.includes('#img#')).length, 2)
  await p.set('d', { ...VACIO, imageFiles: [b] })
  await new Promise(r => setTimeout(r, 5))
  assert.equal([...datos.keys()].filter(k => k.includes('#img#')).length, 1)
  await p.set('d', VACIO)
  await new Promise(r => setTimeout(r, 5))
  assert.equal([...datos.keys()].filter(k => k.includes('#img#')).length, 0)
})

test('envío que falla: la caja se vacía (se borran los bytes) y se devuelve; al recargar, las imágenes siguen ahí', async () => {
  const { datos, almacen } = almacenEnMemoria()
  const antes = new ComposerDrafts(crearPersistenciaBorradores(almacen))
  await antes.load('d', VACIO)
  const a = png(3 * MB, 'a.png'), b = png(2 * MB, 'b.png')
  antes.update('d', VACIO, v => ({ ...v, input: 'texto', imageFiles: [a, b] }))
  antes.update('d', VACIO, () => VACIO) // handleSend vacía la caja al salir
  antes.update('d', VACIO, v => ({ ...v, input: 'texto', imageFiles: [a, b] })) // devolverBorrador tras el fallo
  await antes.idle('d')
  assert.equal([...datos.keys()].filter(k => k.includes('#img#')).length, 2, 'los bytes se reescribieron')
  const despues = new ComposerDrafts(crearPersistenciaBorradores(almacen))
  await despues.load('d', VACIO)
  const e = despues.entry('d', VACIO)
  assert.equal(e.error, '', 'ninguna imagen se perdió')
  assert.deepEqual(e.value.imageFiles.map(f => f.size), [3 * MB, 2 * MB])
})

test('lee los borradores del formato anterior (Files sueltos) y descarta, avisando, los que ya no existen', async () => {
  const { datos, almacen } = almacenEnMemoria()
  const sana = png(300, 'vieja.png')
  datos.set('d', { ...VACIO, input: 'antes', imageFiles: [sana] })
  const l = await crearPersistenciaBorradores(almacen).get('d')
  assert.equal(l.aviso, undefined)
  assert.deepEqual((l.value as typeof VACIO).imageFiles.map(f => f.name), ['vieja.png'])
  const muerta = png(300, 'rota.png'); muerta.arrayBuffer = async () => { throw new DOMException('gone', 'NotFoundError') }
  datos.set('e', { ...VACIO, input: 'texto a salvo', imageFiles: [muerta, sana] })
  const l2 = await crearPersistenciaBorradores(almacen).get('e')
  assert.match(l2.aviso ?? '', /1 imagen de tu borrador ya no estaba disponible/)
  assert.equal((l2.value as typeof VACIO).input, 'texto a salvo')
  assert.equal((l2.value as typeof VACIO).imageFiles.length, 1)
})

test('una referencia sin bytes (imagen purgada) se avisa y no rompe la carga', async () => {
  const { datos, almacen } = almacenEnMemoria()
  await crearPersistenciaBorradores(almacen).set('d', { ...VACIO, input: 'x', imageFiles: [png(100)] })
  for (const k of [...datos.keys()]) if (k.includes('#img#')) datos.delete(k)
  const l = await crearPersistenciaBorradores(almacen).get('d')
  assert.match(l.aviso ?? '', /ya no estaba disponible/)
  assert.deepEqual((l.value as typeof VACIO).imageFiles, [])
})

test('ComposerDrafts: el aviso de la imagen llega a la caja y el texto no se pierde', async () => {
  const { almacen } = almacenEnMemoria({ fallaAlEscribir: k => k.includes('#img#') ? cuota() : null })
  const drafts = new ComposerDrafts(crearPersistenciaBorradores(almacen))
  await drafts.load('d', VACIO)
  drafts.update('d', VACIO, v => ({ ...v, input: 'hola', imageFiles: [png(200)] }))
  await drafts.idle('d')
  const e = drafts.entry('d', VACIO)
  assert.equal(e.value.input, 'hola')
  assert.match(e.error, /no tiene espacio/)
  drafts.update('d', VACIO, v => ({ ...v, input: 'hola otra vez', imageFiles: [] }))
  await drafts.idle('d')
  assert.equal(drafts.entry('d', VACIO).error, '', 'sin imágenes que no quepan, el aviso se va')
})

test('ComposerDrafts: recargar la ventana devuelve el borrador con sus imágenes', async () => {
  const { almacen } = almacenEnMemoria()
  const antes = new ComposerDrafts(crearPersistenciaBorradores(almacen))
  await antes.load('d', VACIO)
  antes.update('d', VACIO, v => ({ ...v, input: 'con fotos', imageFiles: [png(3 * MB, 'a.png'), png(2 * MB, 'b.png')] }))
  await antes.idle('d')
  const despues = new ComposerDrafts(crearPersistenciaBorradores(almacen))
  await despues.load('d', VACIO)
  const e = despues.entry('d', VACIO)
  assert.equal(e.ready, true)
  assert.equal(e.error, '')
  assert.equal(e.value.input, 'con fotos')
  assert.deepEqual(e.value.imageFiles.map(f => f.size), [3 * MB, 2 * MB])
})

test('perfil de datos móviles: la captura del teléfono se aligera; el escritorio no cambia (11 oct 2026)', async () => {
  const { PERFIL_DATOS_MOVILES } = await import('../../src/features/chat/lib/image-upload.ts')
  const captura = { tipo: 'image/png', bytes: 1_117_190, ancho: 1290, alto: 2796 }
  assert.equal(necesitaRecompresion(captura), false)
  assert.equal(necesitaRecompresion(captura, PERFIL_DATOS_MOVILES), true)
  // Ya ligera y dentro de 2560 px: se sube tal cual también en el teléfono.
  assert.equal(necesitaRecompresion({ tipo: 'image/jpeg', bytes: 200_000, ancho: 1179, alto: 2556 }, PERFIL_DATOS_MOVILES), false)
  // Más de 2560 px de lado: se reduce en el teléfono.
  assert.equal(necesitaRecompresion({ tipo: 'image/jpeg', bytes: 300_000, ancho: 4032, alto: 3024 }, PERFIL_DATOS_MOVILES), true)
  // Un GIF chico no se recomprime (lo congelaría).
  assert.equal(necesitaRecompresion({ tipo: 'image/gif', bytes: 900_000, ancho: 480, alto: 480 }, PERFIL_DATOS_MOVILES), false)
  assert.deepEqual(dimensionesDestino(1290, 2796, PERFIL_DATOS_MOVILES.maxLado), { ancho: 1181, alto: 2560, reducida: true })
})
