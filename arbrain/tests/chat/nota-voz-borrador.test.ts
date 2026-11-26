import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLAVE_ENVIAR_AL_DETENER, guardarEnviarAlDetener, leerEnviarAlDetener, unirAlBorrador } from '../../src/features/chat/lib/nota-voz-borrador'

const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }
const fuente = (ruta: string) => readFileSync(join(__dirname, '..', '..', ruta), 'utf8')

test('por defecto la nota de voz NO se envía al detenerla', () => {
  assert.equal(leerEnviarAlDetener(memoria()), false)
  assert.equal(leerEnviarAlDetener(null), false)
})

test('el ajuste se guarda y se lee', () => {
  const s = memoria()
  guardarEnviarAlDetener(true, s)
  assert.equal(s.getItem(CLAVE_ENVIAR_AL_DETENER), '1')
  assert.equal(leerEnviarAlDetener(s), true)
  guardarEnviarAlDetener(false, s)
  assert.equal(leerEnviarAlDetener(s), false)
})

test('lo dictado se suma al borrador sin borrar lo escrito', () => {
  assert.equal(unirAlBorrador('', 'hola'), 'hola')
  assert.equal(unirAlBorrador('   ', ' hola '), 'hola')
  assert.equal(unirAlBorrador('ya escribí esto  \n', 'y esto lo dicté'), 'ya escribí esto\n\ny esto lo dicté')
  assert.equal(unirAlBorrador('primera nota\n\nsegunda', 'tercera'), 'primera nota\n\nsegunda\n\ntercera')
  assert.equal(unirAlBorrador('texto', '   '), 'texto')
})

test('prendida: el chat deja la nota en la caja salvo que el ajuste diga enviarla; Ajustes › Voz trae el interruptor', () => {
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /const notaBorrador = useMejora\('nota-borrador'\)/)
  assert.match(chat, /onVoiceNote=\{recibirNotaVoz\}/)
  assert.match(chat, /if \(!enviaVoz\) \{ notaVozABorradorRef\.current\(texto\); return \}/)
  const voz = fuente('src/features/primer-arranque/components/PanelVoz.tsx')
  assert.equal(voz.match(/\{notaBorrador && <EnviarNotaAlDetener \/>\}/g)?.length, 3, 'con llavero, sin app (teléfono) y sin llavero')
})

test('apagada: la nota se envía al detenerla y Ajustes › Voz no trae el interruptor, como antes', () => {
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /const enviaVoz = !notaBorrador \|\| enviarVozAlDetener/)
  assert.match(chat, /soloTexto=\{EDICION_CLIENTE \|\| !enviaVoz\}/)
  assert.match(chat, /enviaAlDetener=\{enviaVoz\}/)
  const voz = fuente('src/features/primer-arranque/components/PanelVoz.tsx')
  assert.equal(voz.match(/<EnviarNotaAlDetener \/>/g)?.length, 3, 'las tres apariciones van condicionadas')
  assert.match(fuente('src/features/chat/components/ConsejoPanel.tsx'), /enviaAlDetener=\{!notaBorrador\}/)
})
