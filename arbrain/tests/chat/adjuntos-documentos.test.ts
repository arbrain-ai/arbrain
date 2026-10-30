import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCEPT_DOCUMENTOS, esDocumentoAceptado, esUrlDeDocumento, mensajePorDefecto, nombreDesdeUrl, nombreSeguro, separarAdjuntos, urlPublicaDeStorage } from '../../src/features/chat/lib/adjuntos.ts'
import { instalacion } from '../../src/config'

const base = 'http://127.0.0.1:8000/storage/v1/object/public/generated-images/'

test('acepta los documentos del 80-20 y rechaza lo que se ejecuta en el navegador', () => {
  for (const n of ['estado.pdf', 'ESTADO.PDF', 'notas.md', 'datos.csv', 'contrato.docx', 'cuentas.xlsx', 'viejo.xls', 'deck.pptx', 'a.txt', 'a.json']) assert.ok(esDocumentoAceptado({ name: n }), n)
  for (const n of ['pagina.html', 'logo.svg', 'script.js', 'foto.png', 'sin-extension']) assert.ok(!esDocumentoAceptado({ name: n }), n)
  assert.match(ACCEPT_DOCUMENTOS, /\.pdf/)
})

test('el nombre se guarda seguro y se recupera legible desde la URL', () => {
  const seguro = nombreSeguro('Estado de cuenta Banco — Septiembre 2026.pdf')
  assert.equal(seguro, 'Estado-de-cuenta-Banco-Septiembre-2026.pdf')
  assert.equal(nombreSeguro('../../etc/passwd.pdf'), 'etc-passwd.pdf')
  assert.equal(nombreDesdeUrl(`${base}chat-1759420000000-ab12-${seguro}`), seguro)
})

test('una lista mezclada se separa en imágenes y documentos, en orden', () => {
  const lista = [`${base}chat-1-ab12.png`, `${base}chat-2-cd34-estado.pdf`, `${base}chat-3-ef56.jpg`].join('\n')
  // El host interno del Storage (127.0.0.1:8000) sale reescrito al Funnel público (6489a36a): visible fuera del Studio.
  const pub = (u: string) => urlPublicaDeStorage(u)
  // Solo si la instalación tiene Storage público propio (config/instalacion.ts); si no, la URL queda igual.
  if (process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL || instalacion().storagePublico) assert.ok(!pub(`${base}x.png`).startsWith('http://127.0.0.1:8000'))
  else assert.equal(pub(`${base}x.png`), `${base}x.png`)
  assert.deepEqual(separarAdjuntos(lista), { imagenes: [pub(`${base}chat-1-ab12.png`), pub(`${base}chat-3-ef56.jpg`)], documentos: [pub(`${base}chat-2-cd34-estado.pdf`)] })
  assert.ok(esUrlDeDocumento(`${base}x.pdf?download=1`))
  assert.deepEqual(separarAdjuntos(undefined), { imagenes: [], documentos: [] })
})

test('el mensaje por defecto nombra lo que se mandó', () => {
  assert.equal(mensajePorDefecto(1, 0), 'Analiza esta imagen')
  assert.equal(mensajePorDefecto(3, 0), 'Analiza estas 3 imágenes')
  assert.equal(mensajePorDefecto(0, 1), 'Analiza este documento')
  assert.equal(mensajePorDefecto(0, 2), 'Analiza estos 2 documentos')
  assert.equal(mensajePorDefecto(1, 1), 'Analiza estos archivos')
})
