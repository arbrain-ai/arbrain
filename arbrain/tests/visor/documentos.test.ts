// Visor de documentos (14 nov 2026): saneado del Word, enlaces, índice útil de un PDF y los tipos nuevos del panel.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { destinoDeEnlace, limpiarCss } from '../../src/features/cabina/documento/sanear-docx'
import { tipoDocumento } from '../../src/features/cabina/documento/ruta'
import { DESCARGABLES } from '../../src/lib/cabina/descarga-documento'

test('Word: el CSS no puede pedir nada a la red (solo blob: y data: del propio archivo)', () => {
  assert.equal(limpiarCss('@import url("https://x.y/a.css"); p{color:red}'), ' p{color:red}')
  assert.equal(limpiarCss('p{background:url(https://rastreo.ejemplo/pixel.png)}'), 'p{background:none}')
  assert.equal(limpiarCss("p{background:url( 'http://x' )}"), 'p{background:none}')
  assert.equal(limpiarCss('@font-face{src:url(blob:http://127.0.0.1/abc)}'), '@font-face{src:url(blob:http://127.0.0.1/abc)}')
  assert.equal(limpiarCss('i{background:url(data:image/png;base64,AAA)}'), 'i{background:url(data:image/png;base64,AAA)}')
  assert.equal(limpiarCss('font-family:"}body{background:url(//evil)"'), 'font-family:"}body{background:none"')
})

test('Word: los enlaces internos saltan dentro, los de la web salen al navegador y lo demás no navega', () => {
  assert.deepEqual(destinoDeEnlace('#_Toc123'), { tipo: 'ancla', id: '_Toc123' })
  assert.deepEqual(destinoDeEnlace('https://ejemplo.com/guia'), { tipo: 'externo', url: 'https://ejemplo.com/guia' })
  assert.deepEqual(destinoDeEnlace('mailto:a@b.c'), { tipo: 'externo', url: 'mailto:a@b.c' })
  for (const malo of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hola', '#', '', null]) assert.equal(destinoDeEnlace(malo), null, String(malo))
})

test('PDF: un índice de «Page 1, Page 2…», de identificadores o repetido no se enseña como índice', async () => {
  // VisorPdf importa pdf.js solo al abrir; la función es pura y se prueba aislada.
  const { indiceUtil } = await import('../../src/features/cabina/vistas/visor/indice-pdf')
  const paginas = Array.from({ length: 300 }, (_, i) => ({ titulo: `Page ${i + 1}`, pagina: i + 1 }))
  assert.equal(indiceUtil(paginas, 300), false)
  assert.equal(indiceUtil([{ titulo: '00000___db959f653da76789491eb1472759c702', pagina: 1 }, { titulo: '00001___9a826848bb41e9ccbed2640a53f415af', pagina: 2 }], 221), false)
  assert.equal(indiceUtil(Array.from({ length: 5 }, (_, i) => ({ titulo: 'last read', pagina: i + 1 })), 145), false)
  assert.equal(indiceUtil([{ titulo: 'Un solo título', pagina: 1 }], 382), false)
  assert.equal(indiceUtil([{ titulo: 'INTRODUCCIÓN', pagina: 5 }, { titulo: 'EL PODER SUPREMO', pagina: 6 }, { titulo: 'I', pagina: 21 }], 310), true)
})

test('tipos nuevos del panel: Word, Excel y CSV se pintan y se descargan; .doc y .xls viejos, no', () => {
  assert.deepEqual(['a.docx', 'b.XLSX', 'c.xlsm', 'd.csv', 'e.tsv', 'f.doc', 'g.xls'].map(tipoDocumento), ['docx', 'xlsx', 'xlsx', 'csv', 'csv', 'otro', 'otro'])
  for (const t of ['docx', 'xlsx', 'csv'] as const) assert.ok(DESCARGABLES.has(t), t)
})
