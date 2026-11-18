// El modo coche. Aquí se prueba lo que decide sin pantalla: cuándo hablas y cuándo terminaste (VAD), las palabras para
// enviar y pausar, el filtro de ruido, el colchón de silencio de cada frase, el mini, las paletas del Orbe y la
// respuesta que se dice en voz.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DetectorHabla, SILENCIO_MS, SIN_HABLA_MS, umbralesDesdePiso, type Paso } from '../../src/features/modo-coche/vad'
import { decidir, esRuido } from '../../src/features/modo-coche/palabras'
import { colchonMp3, conColchon, primerCuadroMp3 } from '../../src/features/modo-coche/colchon'
import { partirParaVoz } from '../../src/features/modo-coche/partir-voz'
import { deHex, PALETAS, paletaPropia, siguientePaleta, tonosDe } from '../../src/features/modo-coche/orbe/paletas'
import { NOTA_COCHE, ultimaRespuesta } from '../../src/features/modo-coche/respuesta'
import { acomodar, LADO_MAX, LADO_MIN, MARGEN_MINI, miniInicial } from '../../src/features/modo-coche/mini'

/** Corre el detector con un nivel por cada 50 ms hasta que pida terminar o empezar de nuevo; anota las miradas adelante. */
function correr(d: DetectorHabla, niveles: (t: number) => number, hasta = 15 * 60_000) {
  const miradas: number[] = []
  for (let t = 0; t <= hasta; t += 50) {
    const p: Paso = d.paso(t, niveles(t))
    if (p === 'mirar-adelante') { miradas.push(t); continue }
    if (p !== 'sigue') return { paso: p, t, miradas }
  }
  return { paso: 'sigue' as const, t: hasta, miradas }
}

test('umbrales relativos al piso de ruido, con sus topes', () => {
  assert.deepEqual(umbralesDesdePiso(0), { habla: 0.025, silencio: 0.012 })
  const coche = umbralesDesdePiso(0.03) // un coche en marcha
  assert.ok(Math.abs(coche.habla - 0.09) < 1e-9)
  assert.ok(coche.silencio < coche.habla)
  assert.equal(umbralesDesdePiso(1).habla, 0.2)
})

test('hablas y te callas 3 s: terminaste (con una mirada adelante en la pausa corta)', () => {
  const d = new DetectorHabla(0)
  const r = correr(d, t => (t >= 1000 && t < 3000 ? 0.15 : 0.01))
  assert.equal(r.paso, 'terminaste')
  assert.ok(r.t >= 3000 + SILENCIO_MS && r.t < 3000 + SILENCIO_MS + 200, `terminó a los ${r.t} ms`)
  assert.equal(r.miradas.length, 1)
  assert.ok(r.miradas[0] >= 3900 && r.miradas[0] < 4100, `miró a los ${r.miradas[0]} ms`)
})

test('una pausa de 2,5 s para pensar NO corta el dictado (el silencio que envía es de 3 s)', () => {
  assert.equal(SILENCIO_MS, 3000)
  const d = new DetectorHabla(0)
  const r = correr(d, t => ((t >= 1000 && t < 3000) || (t >= 5500 && t < 7500) ? 0.15 : 0.01))
  assert.equal(r.paso, 'terminaste')
  assert.ok(r.t > 7500 + SILENCIO_MS - 100, `cortó a los ${r.t} ms`)
  assert.equal(r.miradas.length, 2) // una por pausa
})

test('una tos (menos de medio segundo de voz) no se transcribe: la escucha empieza de nuevo', () => {
  const d = new DetectorHabla(0)
  const r = correr(d, t => (t >= 1000 && t < 1300 ? 0.3 : 0.01))
  assert.equal(r.paso, 'empezar-de-nuevo')
  assert.equal(r.miradas.length, 0)
})

test('si empiezas a hablar en cuanto suena el tilín, igual te oye (la calibración no se come tu voz)', () => {
  const d = new DetectorHabla(0)
  const r = correr(d, t => (t < 2500 ? 0.17 : 0.008))
  assert.equal(r.paso, 'terminaste')
})

test('sin tope de 30 s: un dictado de 2 minutos sigue entero', () => {
  const d = new DetectorHabla(0)
  const r = correr(d, t => (t >= 500 && t < 120_000 ? (Math.floor(t / 400) % 3 ? 0.14 : 0.03) : 0.01))
  assert.equal(r.paso, 'terminaste')
  assert.ok(r.t > 120_000)
})

test('sin habla, la escucha empieza de nuevo a los 20 s', () => {
  const d = new DetectorHabla(0)
  const r = correr(d, () => 0.012)
  assert.equal(r.paso, 'empezar-de-nuevo')
  assert.ok(r.t > SIN_HABLA_MS && r.t <= SIN_HABLA_MS + 100)
})

test('la barrita: avanza mientras callas y se vacía al volver a hablar', () => {
  const d = new DetectorHabla(0)
  for (let t = 0; t <= 2000; t += 50) d.paso(t, t >= 400 ? 0.15 : 0.01)
  for (let t = 2050; t <= 3550; t += 50) d.paso(t, 0.01)
  const a = d.avanceSilencio(3550) // 1,5 s de los 3 s
  assert.ok(a > 0.45 && a < 0.55, `avance ${a}`)
  d.paso(3600, 0.15)
  assert.equal(d.avanceSilencio(3600), 0)
})

// ── Las palabras ───────────────────────────────────────────────────────────────────────────────────────────────────

test('enviar ya: la palabra al final, después de una pausa, se quita', () => {
  assert.deepEqual(decidir('Revisa el correo de Laura y respóndele, dale.', false), { accion: 'enviar', texto: 'Revisa el correo de Laura y respóndele' })
  assert.deepEqual(decidir('Agenda el gimnasio a las siete. Cambio.', false), { accion: 'enviar', texto: 'Agenda el gimnasio a las siete.' })
  assert.deepEqual(decidir('¿Qué tengo mañana? Te toca a ti.', false), { accion: 'enviar', texto: '¿Qué tengo mañana?' })
  assert.deepEqual(decidir('Ya está todo, terminé.', false), { accion: 'enviar', texto: 'Ya está todo' })
  assert.deepEqual(decidir('Prepara el informe. Adelante.', false), { accion: 'enviar', texto: 'Prepara el informe.' })
})

test('«Dale.» solo, como respuesta, se manda tal cual', () => {
  assert.deepEqual(decidir('Dale.', false), { accion: 'enviar', texto: 'Dale.' })
})

test('«quiero hacer un cambio» es un mensaje, no la palabra de enviar', () => {
  assert.deepEqual(decidir('Quiero hacer un cambio', false), { accion: 'seguir', texto: 'Quiero hacer un cambio' })
  assert.deepEqual(decidir('Quiero hacer un cambio', true), { accion: 'enviar', texto: 'Quiero hacer un cambio' })
})

test('pausar: la palabra sola (o con muletillas) pausa directo', () => {
  for (const t of ['Pausa.', 'Hagamos una pausa.', 'Ahí terminamos.', 'Terminemos.', 'Paremos aquí, para ahí.', 'Paramos.', 'Apaga el modo coche.', 'Bueno, terminamos.', 'Ok, Arbrain, terminamos por hoy.'])
    assert.deepEqual(decidir(t, true), { accion: 'pausar', texto: '' }, t)
})

test('una frase real: lo de antes se manda y luego queda en pausa', () => {
  assert.deepEqual(decidir('Aquí se murió. No volvió a funcionar. Bueno, terminamos.', true),
    { accion: 'enviar-y-pausar', texto: 'Aquí se murió. No volvió a funcionar.' })
  assert.deepEqual(decidir('Revisa el correo de Laura y prepárame el informe. Ahí terminamos.', false),
    { accion: 'enviar-y-pausar', texto: 'Revisa el correo de Laura y prepárame el informe.' })
  assert.deepEqual(decidir('Gracias por todo, hagamos una pausa', true), { accion: 'enviar-y-pausar', texto: 'Gracias por todo' })
})

test('«terminamos» que no va al final o no va suelto es un mensaje', () => {
  for (const t of ['Terminamos el proyecto de Laura esta semana.', 'Ya casi terminamos', 'Paramos el proyecto de Laura hasta el lunes y avísale a Pedro por correo'])
    assert.equal(decidir(t, true).accion, 'enviar', t)
  assert.equal(decidir('Ya casi terminamos', false).accion, 'seguir')
})

test('a media pausa sin palabra, se sigue escuchando', () => {
  assert.equal(decidir('Oye, dime qué tengo mañana en el', false).accion, 'seguir')
})

test('ruido: toses e inventos de Whisper se tiran; lo que dices de verdad, no', () => {
  for (const t of ['Cough, Cough, Cough, Cough.', '[Música]', '(tos)', 'Gracias por ver el video.', '...', 'Mmm', 'Thank you.', 'Subtítulos realizados por la comunidad de Amara.org'])
    assert.equal(esRuido(t), true, t)
  for (const t of ['Gracias, Arbrain.', 'Dime qué tengo mañana.', 'Sí.', 'Dale.'])
    assert.equal(esRuido(t), false, t)
})

// ── El colchón ─────────────────────────────────────────────────────────────────────────────────────────────────────

function wavDe(muestras: number, sr = 24000): ArrayBuffer {
  const b = new ArrayBuffer(44 + muestras * 2), v = new DataView(b)
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  txt(0, 'RIFF'); v.setUint32(4, 36 + muestras * 2, true); txt(8, 'WAVE'); txt(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, muestras * 2, true)
  for (let i = 0; i < muestras; i++) v.setInt16(44 + i * 2, 1000, true)
  return b
}

test('WAV: 200 ms de silencio adentro, la voz intacta después', () => {
  const salida = conColchon(wavDe(2400), 'audio/wav', 200)
  const v = new DataView(salida)
  assert.equal(salida.byteLength, 44 + 2400 * 2 + 4800 * 2)
  assert.equal(v.getUint32(40, true), (2400 + 4800) * 2)
  assert.equal(v.getInt16(44, true), 0)
  assert.equal(v.getInt16(44 + 4800 * 2, true), 1000)
})

/** Un MP3 falso: etiqueta ID3 y cuadros MPEG-1 Layer III, 128 kbps, 44,1 kHz, mono (417 bytes sin relleno). */
function mp3De(cuadros: number, conId3 = true): Uint8Array {
  const id3 = conId3 ? [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5] : []
  const cabecera = [0xff, 0xfa, 0x90, 0xc4] // CRC presente y sin relleno: el colchón debe quitar el CRC
  const out = new Uint8Array(id3.length + cuadros * 417)
  out.set(id3, 0)
  for (let k = 0; k < cuadros; k++) { out.set(cabecera, id3.length + k * 417); out.fill(0x55, id3.length + k * 417 + 4, id3.length + (k + 1) * 417) }
  return out
}

test('MP3: encuentra el primer cuadro después de la etiqueta ID3', () => {
  const c = primerCuadroMp3(mp3De(3).buffer as ArrayBuffer)
  assert.ok(c)
  assert.equal(c.inicio, 15)
  assert.equal(c.largo, 417)
  assert.equal(c.frecuencia, 44100)
})

test('MP3: antepone cuadros mudos (cabecera del original, sin CRC, el resto en ceros)', () => {
  const original = mp3De(3)
  const salida = new Uint8Array(colchonMp3(original.buffer as ArrayBuffer, 200))
  const cuantos = Math.ceil(0.2 * 44100 / 1152) // 8 cuadros ≈ 209 ms
  assert.equal(salida.length, original.length + cuantos * 417)
  assert.deepEqual([...salida.subarray(0, 15)], [...original.subarray(0, 15)]) // la ID3, igual
  assert.deepEqual([...salida.subarray(15, 19)], [0xff, 0xfb, 0x90, 0xc4]) // sin CRC
  assert.ok(salida.subarray(19, 15 + 417).every(x => x === 0))
  assert.deepEqual([...salida.subarray(15 + cuantos * 417)], [...original.subarray(15)]) // la voz, intacta
})

test('lo que no se entiende vuelve intacto', () => {
  const basura = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer
  assert.equal(colchonMp3(basura, 200), basura)
  assert.equal(conColchon(basura, 'audio/ogg', 200), basura)
  assert.equal(conColchon(basura, 'audio/wav', 200), basura)
})

// ── La voz en pedazos (una frase de 980 letras tardaba casi un minuto en empezar) ───────────────────────────────────────

test('una frase corta no se parte', () => {
  assert.deepEqual(partirParaVoz('Claro, Ana. Mañana tienes la junta a las diez.'), ['Claro, Ana. Mañana tienes la junta a las diez.'])
})

test('una frase larga: primer pedazo corto, los demás medianos, nada se pierde y nada se repite', () => {
  const o = 'Ana, ya terminé la búsqueda de Marta y te dejé el resumen en el chat. '
  const texto = (o + 'Encontré tres cosas importantes sobre su perfil profesional, sus proyectos recientes y su experiencia con clientes. ').repeat(6) + 'Lo único que necesito de ti es saber si le escribo hoy o mañana.'
  const p = partirParaVoz(texto)
  assert.ok(p.length >= 4, `${p.length} pedazos`)
  assert.ok(p[0].length <= 160, `primero de ${p[0].length}`)
  for (const x of p.slice(1)) assert.ok(x.length <= 320, `pedazo de ${x.length}`)
  assert.equal(p.join(' '), texto.replace(/\s+/g, ' ').trim())
})

test('una oración larguísima sin puntos se corta en comas o palabras, sin perder nada', () => {
  const texto = Array.from({ length: 60 }, (_, i) => `punto ${i}`).join(', ')
  const p = partirParaVoz(texto)
  assert.ok(p.every(x => x.length <= 320) && p[0].length <= 160)
  assert.equal(p.join(' ').replace(/\s+/g, ' '), texto)
})

// ── «termina» pausa, el mini en el escritorio ──

test('«termina» suelta al final pausa; «terminé» sigue enviando', () => {
  for (const t of ['Termina.', 'Bueno, termina.', 'Termina el modo coche.', 'Apaga el Orbe.'])
    assert.deepEqual(decidir(t, true), { accion: 'pausar', texto: '' }, t)
  assert.deepEqual(decidir('Mándale el informe a Lau. Termina.', true), { accion: 'enviar-y-pausar', texto: 'Mándale el informe a Lau.' })
  assert.equal(decidir('Avísame cuando el proceso termina', true).accion, 'enviar')
  assert.deepEqual(decidir('Revisa el correo de Laura. Terminé.', true), { accion: 'enviar', texto: 'Revisa el correo de Laura.' })
})

test('el mini siempre queda dentro de la ventana y con un tamaño que se lee', () => {
  assert.deepEqual(acomodar({ x: 5000, y: -40, lado: 180 }, 1200, 800), { x: 1200 - 180 - MARGEN_MINI, y: MARGEN_MINI, lado: 180 })
  assert.equal(acomodar({ x: 10, y: 10, lado: 20 }, 1200, 800).lado, LADO_MIN)
  assert.equal(acomodar({ x: 10, y: 10, lado: 2000 }, 1200, 800).lado, LADO_MAX)
  assert.equal(acomodar({ x: 0, y: 0, lado: 300 }, 260, 200).lado, 200 - 2 * MARGEN_MINI, 'una ventana chiquita achica el mini')
  const d = miniInicial(1440, 900)
  assert.ok(d.x + d.lado <= 1440 && d.y + d.lado <= 900 && d.lado >= LADO_MIN)
})

test('frases reales: «terminamos el modo voz» pausa; la pausa le gana a un «dale» después', () => {
  assert.deepEqual(decidir('Bien, listo. Sí, puedes mandarlo a la papelera y dale, terminamos el modo voz.', true),
    { accion: 'enviar-y-pausar', texto: 'Bien, listo. Sí, puedes mandarlo a la papelera y dale' })
  assert.deepEqual(decidir('Déjame saber si entendiste bien. Ya está. Terminamos. Dale.', false),
    { accion: 'enviar-y-pausar', texto: 'Déjame saber si entendiste bien. Ya está.' })
  for (const t of ['Terminamos el modo voz.', 'Apaga el Orbe.', 'Cierra el modo coche.', 'Bueno, terminamos modo voz.', 'Terminamos. Cambio.'])
    assert.deepEqual(decidir(t, true), { accion: 'pausar', texto: '' }, t)
  assert.equal(decidir('Ya casi terminamos, dale', true).accion, 'enviar', '«terminamos» que no va suelto sigue siendo mensaje')
  assert.equal(decidir('Cambia el modo de voz de la voz a uno más lento. Dale.', true).accion, 'enviar')
})

test('paletas del Orbe: tres a escoger, colores propios y nunca se queda sin paleta', () => {
  assert.deepEqual(PALETAS.map(p => p.id), ['grafito', 'esmeralda', 'violeta'])
  assert.deepEqual(deHex('#10B981'), [16, 185, 129])
  assert.equal(deHex('verde'), null)
  const t = tonosDe([200, 100, 0])
  assert.ok(t[0][0] > t[1][0] && t[2][0] < t[1][0], 'claro, medio y hondo')
  assert.equal(paletaPropia('#123456', 'nada'), null)
  assert.equal(paletaPropia('#123456', '#abcdef')?.id, 'propia')
  assert.equal(siguientePaleta('grafito'), 'esmeralda')
  assert.equal(siguientePaleta('violeta'), 'grafito', 'da la vuelta')
})

test('la respuesta que se dice en voz: la última del agente, con su id', () => {
  const m = [
    { id: 'a1', role: 'assistant' as const, content: 'Hola' },
    { id: 'u1', role: 'user' as const, content: '¿Qué tengo hoy?' },
    { id: 'a2', role: 'assistant' as const, content: 'Tienes dos juntas.' },
    { id: 'u2', role: 'user' as const, content: 'Gracias' },
  ]
  assert.deepEqual(ultimaRespuesta(m), { id: 'a2', texto: 'Tienes dos juntas.' })
  assert.equal(ultimaRespuesta([{ id: 'u', role: 'user', content: 'x' }]), null)
})

test('la nota del coche pide una respuesta para el oído y no lleva nombres de nadie', () => {
  assert.match(NOTA_COCHE, /^\[Modo coche\]/)
  assert.match(NOTA_COCHE, /voz alta/)
})

test('lo que se dice en voz va sin markdown: ni negritas, ni enlaces, ni tablas', async () => {
  const { textoHablable } = await import('../../src/features/modo-coche/voz-coche')
  const t = textoHablable('Tienes **dos juntas** y _una_ llamada. Mira [la agenda](https://x.y).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nListo.')
  assert.ok(!/\*|_|\[|\]|\||https/.test(t), t)
  assert.match(t, /Tienes dos juntas y una llamada\. Mira la agenda\./)
})
