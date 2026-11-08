import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Module from 'node:module'
import { encodeTextAttachments } from '../../src/features/chat/lib/text-attachments'
import type { NotaInyectada } from '../../src/features/chat/lib/inyecciones'

// 5 nov 2026, Daniel: «no me gusta que la ui de estos mensajes en cola sean así más pequeños… si es tan smooth no debería
// cambiar el tamaño del mensaje». Contrato: lo que el dueño escribe a mitad de turno se pinta con LA MISMA burbuja que un
// mensaje normal (mismas clases, mismo contenido renderizado, misma alineación); el estado vive fuera, en el pie.

const TEXTO = 'Oye, antes de seguir: normaliza las fechas a día/mes/año.\n\nLuego sigue con el resumen.'
const ADJUNTO = encodeTextAttachments('Usa esta lista (https://ejemplo.com/proveedores):', [{ name: 'proveedores.txt', content: 'Proveedor 1\n'.repeat(400) }])

// Los CSS modules del chat no existen en node: cada clase es su propio nombre. Se registran antes de cargar el panel real.
;(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions['.css'] = (m) => {
  m.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : String(k)) })
}
const panel = import('../../src/features/chat/components/ChatPanel')
const notas = import('../../src/features/chat/components/MensajeUsuario')

/** La burbuja del dueño: el elemento `data-burbuja-usuario` con todo lo que lleva dentro. */
function burbuja(html: string): string {
  const i = html.indexOf('<div data-burbuja-usuario')
  assert.ok(i >= 0, `sin burbuja del dueño en: ${html.slice(0, 300)}`)
  let prof = 0, j = i
  const re = /<\/?div\b[^>]*>/g
  re.lastIndex = i
  for (let m = re.exec(html); m; m = re.exec(html)) {
    prof += m[0].startsWith('</') ? -1 : 1
    if (prof === 0) { j = m.index + m[0].length; break }
  }
  return html.slice(i, j)
}
const normal = async (content: string) => renderToStaticMarkup(createElement((await panel).MessageBubble, { msg: { id: 'u', role: 'user', content, timestamp: new Date(0) } }))
const nota = async (texto: string, estado: NotaInyectada['estado'] = 'leido') => renderToStaticMarkup(createElement((await notas).NotasInyectadas, { notas: [{ id: 'n', texto, estado, at: 0 }] }))

test('el mensaje a mitad de turno usa exactamente la burbuja de un mensaje normal', async () => {
  for (const texto of [TEXTO, ADJUNTO]) assert.equal(burbuja(await nota(texto)), burbuja(await normal(texto)))
})

test('la burbuja no cambia al pasar de enviando a entrando, en fila o leído; el estado va fuera de ella', async () => {
  const leido = burbuja(await nota(TEXTO, 'leido'))
  for (const estado of ['enviando', 'entrando', 'en_fila'] as const) {
    const html = await nota(TEXTO, estado)
    assert.equal(burbuja(html), leido)
    assert.ok(!burbuja(html).includes('…'), `el estado «${estado}» quedó dentro de la burbuja`)
    assert.match(html, /role="status"/)
  }
})

test('la nota va a la derecha como el mensaje normal, con su propio grupo de hover y fuera de la lectura en voz', async () => {
  const html = await nota(TEXTO)
  assert.match(html, /class="group\/usuario flex flex-col items-end/)
  assert.match(html, /data-tts-exclude/)
  assert.match(await normal(TEXTO), /class="group\/usuario flex flex-col items-end/)
})
