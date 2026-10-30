import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VozServidor, posicionAudible } from '../../src/features/chat/lib/voz-servidor'
import { silenciosDe, tiemposDePalabras, tiemposDelAudio } from '../../src/features/chat/lib/tiempos-estimados'
import { leerMarcas, palabraEn, tiemposDeMarcas, type MarcaPalabra } from '../../src/features/chat/lib/marcas-voz'
import { indiceDeVelocidad, tramosDeVoz } from '../../src/features/chat/lib/chat-speech'

function palabras(s: string) {
  return [...s.matchAll(/\S+/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }))
}

test('los tiempos reparten la duración real por caracteres, crecientes y dentro del audio', () => {
  const s = 'Hola Daniel, esta es una prueba de velocidad.'
  const w = palabras(s)
  const t = tiemposDePalabras(s, w, 4)
  assert.equal(t.length, w.length)
  assert.ok(t[0] > 0 && t[0] < 0.1)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1])
  assert.ok(t[t.length - 1] < 4)
  // Duplicar la duración duplica (casi) cada marca: escala con el audio, no con una velocidad supuesta.
  const t2 = tiemposDePalabras(s, w, 8)
  assert.ok(Math.abs(t2[5] - 2 * t[5]) < 0.1)
})

test('la coma y el punto dejan aire: la palabra que sigue arranca más tarde que sin puntuación', () => {
  const con = 'uno, dos tres'
  const sin = 'uno  dos tres'
  const a = tiemposDePalabras(con, palabras(con), 3)
  const b = tiemposDePalabras(sin, palabras(sin), 3)
  assert.ok(a[1] > b[1])
})

// PCM sintético: voz = tono con cierres de oclusiva de 15 ms cada 0.12 s; silencio = ceros. `partes` alterna voz y
// silencio empezando por silencio: [silencio, voz, silencio, voz, ...] en segundos.
function pcmDe(partes: number[], sr = 8000): Float32Array {
  const total = Math.round(partes.reduce((a, b) => a + b, 0) * sr)
  const out = new Float32Array(total)
  let i = 0
  partes.forEach((dur, k) => {
    const n = Math.round(dur * sr)
    if (k % 2 === 1) for (let j = 0; j < n; j++) {
      const t = j / sr
      out[i + j] = t % 0.12 > 0.105 ? 0 : 0.3 * Math.sin(2 * Math.PI * 180 * t)
    }
    i += n
  })
  return out
}

test('silenciosDe ve las pausas y los bordes, no los cierres cortos dentro de la voz', () => {
  const sil = silenciosDe(pcmDe([0.1, 0.8, 0.25, 1.0, 0.1]), 8000)
  assert.equal(sil.length, 3)
  assert.ok(Math.abs(sil[0][1] - 0.1) < 0.011)
  assert.ok(Math.abs(sil[1][0] - 0.9) < 0.011 && Math.abs(sil[1][1] - 1.15) < 0.011)
  assert.ok(Math.abs(sil[2][0] - 2.15) < 0.011)
})

test('tiemposDelAudio ancla cada frase al fin de su pausa real aunque la pausa dure el doble de lo supuesto', () => {
  // Bug del 23 oct: el reparto a ciegas supone ~6 caracteres por punto; si la voz calla más (o menos), todo lo que sigue
  // se corre y el resaltado va palabras detrás (o delante) del audio.
  const s = 'Primero lo medimos todo. Luego corregimos la causa, y al final lo probamos.'
  const w = palabras(s)
  const partes = [0.12, 1.4, 0.7, 1.1, 0.45, 0.9, 0.1]
  const pcm = pcmDe(partes)
  const t = tiemposDelAudio(s, w, pcm, 8000)
  const luego = w.findIndex((x) => s.slice(x.from, x.to) === 'Luego')
  const y = w.findIndex((x) => s.slice(x.from, x.to) === 'y')
  assert.ok(Math.abs(t[0] - 0.12) < 0.011, `primera palabra en ${t[0]}`)
  assert.ok(Math.abs(t[luego] - (0.12 + 1.4 + 0.7)) < 0.011, `«Luego» en ${t[luego]}`)
  assert.ok(Math.abs(t[y] - (0.12 + 1.4 + 0.7 + 1.1 + 0.45)) < 0.011, `«y» en ${t[y]}`)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1])
  // El reparto a ciegas falla aquí por más de dos décimas: es lo que se corrige.
  const ciego = tiemposDePalabras(s, w, pcm.length / 8000)
  assert.ok(Math.abs(ciego[luego] - (0.12 + 1.4 + 0.7)) > 0.2)
})

test('tiemposDelAudio tolera una coma sin pausa y un audio sin silencios', () => {
  const s = 'Hoy sí, mañana también. Después vemos.'
  const w = palabras(s)
  // La voz no calló en la coma: solo hay pausa en el punto.
  const t = tiemposDelAudio(s, w, pcmDe([0.05, 1.6, 0.3, 0.8, 0.05]), 8000)
  assert.ok(Math.abs(t[4] - 1.95) < 0.011, `«Después» en ${t[4]}`)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1])
  // Sin silencios detectables: cae al reparto por caracteres sin romperse.
  const plano = new Float32Array(16000).fill(0.2)
  const t2 = tiemposDelAudio(s, w, plano, 8000)
  assert.equal(t2.length, w.length)
  for (let i = 1; i < t2.length; i++) assert.ok(t2[i] > t2[i - 1] && t2[i] < 2)
})

test('palabraEn devuelve la última palabra que ya empezó (en empate, la última de ellas)', () => {
  const t = [0.05, 0.4, 0.9, 1.5]
  assert.equal(palabraEn(t, 0), 0)
  assert.equal(palabraEn(t, 0.39), 0)
  assert.equal(palabraEn(t, 0.4), 1)
  assert.equal(palabraEn(t, 1.2), 2)
  assert.equal(palabraEn(t, 99), 3)
  assert.equal(palabraEn([], 1), -1)
  assert.equal(palabraEn([0, 0.5, 0.5, 1], 0.6), 2) // «—» sin marca comparte tiempo con la siguiente: se salta
})

test('tramosDeVoz corta en fin de frase pasados ~160 caracteres y cubre todas las palabras sin solaparse', () => {
  const frase = 'Esta es una frase de prueba con suficientes palabras para medir el corte del lector. '
  const s = frase.repeat(6).trim()
  const w = palabras(s)
  const tr = tramosDeVoz(s, w)
  assert.ok(tr.length >= 2)
  assert.equal(tr[0].desde, 0)
  assert.equal(tr[tr.length - 1].hasta, w.length)
  for (let i = 1; i < tr.length; i++) assert.equal(tr[i].desde, tr[i - 1].hasta)
  for (const t of tr) assert.ok(/\.$/.test(t.texto) && t.texto.length <= 330)
})

test('un párrafo corto es un solo tramo con el texto tal cual', () => {
  const s = 'Hola, ¿cómo vas?'
  const tr = tramosDeVoz(s, palabras(s))
  assert.deepEqual(tr, [{ desde: 0, hasta: 3, texto: 'Hola, ¿cómo vas?' }])
})

// ─── VozServidor con Web Audio (23 oct 2026) ─────────────────────────────────
// Node no trae Web Audio: un contexto falso basta para probar la caché por velocidad, X-Tempo y la posición.
async function conWebAudioFalso(fn: (reloj: { t: number }, fuentes: Array<{ rate: number; desde: number }>, ctxs: Array<{ state: string }>) => unknown) {
  const reloj = { t: 10 }
  const ctxs: Array<{ state: string }> = []
  const fuentes: Array<{ rate: number; desde: number }> = []
  class Ctx {
    state = 'running'
    constructor() { ctxs.push(this) }
    suspend() { this.state = 'suspended'; return Promise.resolve() }
    close() { this.state = 'closed'; return Promise.resolve() }
    sampleRate = 48000
    baseLatency = 0
    destination = {}
    get currentTime() { return reloj.t }
    resume() { this.state = 'running'; return Promise.resolve() }
    createBuffer() { return { duration: 0 } }
    decodeAudioData(datos: ArrayBuffer) { return Promise.resolve({ duration: datos.byteLength }) }
    createBufferSource() {
      const f = { buffer: null, playbackRate: { value: 1 }, onended: null, connect() {}, disconnect() {}, stop() {},
        start(_w: number, desde: number) { fuentes.push({ rate: f.playbackRate.value, desde }) } }
      return f
    }
  }
  const g = globalThis as unknown as { window?: unknown }
  const antes = g.window
  g.window = { AudioContext: Ctx }
  try { await fn(reloj, fuentes, ctxs) } finally { g.window = antes }
}

test('la caché distingue velocidad y lee X-Tempo; la petición en vuelo se comparte', async () => {
  await conWebAudioFalso(async () => {
    const pedidas: string[] = []
    const voz = new VozServidor(async (texto, v) => {
      pedidas.push(`${v}|${texto}`)
      return new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/mpeg', 'x-tempo': String(v) } })
    })
    const [a, b] = await Promise.all([voz.cargar('hola', 2), voz.cargar('hola', 2)])
    assert.equal(a, b)
    assert.equal(a.tempo, 2)
    await voz.cargar('hola', 1.5)
    assert.deepEqual(pedidas, ['2|hola', '1.5|hola'])
  })
})

test('el cliente nunca acelera: ritmo 1 aunque el servidor no haya aplicado tempo; la posición son segundos del buffer', async () => {
  await conWebAudioFalso(async (reloj, fuentes) => {
    const voz = new VozServidor(async () => new Response(new Uint8Array(8), { headers: { 'content-type': 'audio/mpeg' } }))
    const viejo = await voz.cargar('x', 2) // servidor que no sabe de tempo: X-Tempo ausente = 1
    assert.equal(viejo.tempo, 1)
    voz.sonar(viejo, 1, () => {})
    assert.deepEqual(fuentes[0], { rate: 1, desde: 1 })
    reloj.t += 1.5
    assert.ok(Math.abs(voz.posicion() - 2.5) < 1e-9)
    voz.parar()
  })
})

test('un fallo no condena la lectura siguiente: reintentar() vuelve al servidor', async () => {
  await conWebAudioFalso(() => {
    const voz = new VozServidor(async () => new Response(null, { status: 502 }))
    assert.equal(voz.disponible, true)
    voz.disponible = false
    voz.reintentar()
    assert.equal(voz.disponible, true)
  })
})

test('las velocidades llegan a 3x y una posición guardada con la escala vieja cae en la vecina rápida', () => {
  assert.equal(indiceDeVelocidad(1), 0)
  assert.equal(indiceDeVelocidad(2), 2)
  assert.equal(indiceDeVelocidad(3), 4)
  assert.equal(indiceDeVelocidad(1.75), 2) // la de Daniel por meses: 2x, no 1.5x
  assert.equal(indiceDeVelocidad(9), 4)
  assert.equal(indiceDeVelocidad(Number.NaN), -1)
})

test('si onended no llega, el vigía termina el tramo una sola vez al pasar su duración', async () => {
  await conWebAudioFalso(async (reloj) => {
    const voz = new VozServidor(async () => new Response(null))
    let fines = 0
    const audio = { buffer: { duration: 0.2 } as AudioBuffer, tempo: 1, marcas: null }
    voz.sonar(audio, 0, () => fines++)
    reloj.t += 0.3 // el contexto avanzó más que el tramo y onended nunca llegó
    await new Promise((ok) => setTimeout(ok, 900))
    assert.equal(fines, 1)
    assert.equal(voz.posicion(), 0)
  })
})

test('el vigía no corta un tramo cuyo contexto se detuvo: vuelve a mirar', async () => {
  await conWebAudioFalso(async () => {
    const voz = new VozServidor(async () => new Response(null))
    let fines = 0
    voz.sonar({ buffer: { duration: 0.2 } as AudioBuffer, tempo: 1, marcas: null }, 0, () => fines++)
    await new Promise((ok) => setTimeout(ok, 900)) // reloj del contexto quieto (suspendido)
    assert.equal(fines, 0)
    voz.parar()
  })
})

test('sin fuente, el contexto se suspende (la ventana oculta no deja al audio de WebKit sin muestras) y vuelve al sonar', async () => {
  await conWebAudioFalso(async (_reloj, fuentes, ctxs) => {
    const voz = new VozServidor(async () => new Response(null))
    const audio = { buffer: { duration: 5 } as AudioBuffer, tempo: 1, marcas: null }
    voz.sonar(audio, 0, () => {})
    voz.parar() // pausa
    voz.sonar(audio, 1, () => {}) // reanudar antes del reposo: no se suspende a media lectura
    await new Promise((ok) => setTimeout(ok, 1700))
    assert.equal(ctxs[0].state, 'running')
    voz.parar()
    await new Promise((ok) => setTimeout(ok, 1700))
    assert.equal(ctxs[0].state, 'suspended')
    voz.sonar(audio, 2, () => {})
    assert.equal(ctxs[0].state, 'running')
    assert.equal(fuentes.length, 3)
    voz.parar()
  })
})

// ─── Marcas exactas (29 oct 2026) ─────────────────────────────────────────────
// Con la forma que dan las marcas reales de AVSpeechSynthesizer con Juan (Enhanced), medidas en el Studio el 29 oct:
// «SaaS» lo parte en dos marcas («Saa» y «S»), «—» no tiene marca, la puntuación va pegada a la palabra.
const TEXTO = 'Mira, el 80/20 de 3.000 USD — sin humo. SaaS Factory listo.'
const MARCAS: MarcaPalabra[] = [
  [0, 5, 0], [6, 2, 1346.8], [9, 5, 1555.8], [15, 2, 3692.2], [18, 5, 3854.7], [24, 3, 4400.1],
  [30, 3, 5150], [34, 5, 5698.4], [40, 3, 6500], [43, 1, 7300.3], [45, 7, 7834.4], [53, 6, 8900],
]

test('tiemposDeMarcas: cada palabra en el instante de su marca; sin marca toma la siguiente; dos marcas, la primera', () => {
  const t = tiemposDeMarcas(TEXTO, MARCAS)!
  const ws = [...TEXTO.matchAll(/\S+/g)].map((m) => m[0])
  assert.equal(t.length, ws.length)
  const en = (w: string) => t[ws.indexOf(w)]
  const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
  cerca(en('Mira,'), 0)
  cerca(en('80/20'), 1.5558)
  cerca(en('—'), 5.15) // no se pronuncia: comparte instante con «sin» y el resaltado lo salta
  cerca(en('sin'), 5.15)
  cerca(en('SaaS'), 6.5) // la segunda marca («S», 7.3003 s) cae dentro de la misma palabra y no la mueve
  cerca(en('Factory'), 7.8344)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1])
  // La palabra que suena en cada instante, con el reloj exacto.
  assert.equal(ws[palabraEn(t, 5.2)], 'sin')
  assert.equal(ws[palabraEn(t, 7.4)], 'SaaS')
  assert.equal(ws[palabraEn(t, 99)], 'listo.')
})

test('tiemposDeMarcas: marcas desordenadas o en espacios no rompen el orden; sin marcas útiles es null', () => {
  const t = tiemposDeMarcas('uno dos tres', [[8, 4, 900], [0, 3, 0], [3, 5, 400]])!
  assert.deepEqual(t, [0, 0.4, 0.9]) // la de «dos» arranca en el espacio y lo toca
  assert.equal(tiemposDeMarcas('uno dos', []), null)
  assert.equal(tiemposDeMarcas('uno dos', [[20, 2, 5]]), null)
  // Cola sin marca (no debería pasar): se queda en la última, nunca en infinito.
  assert.deepEqual(tiemposDeMarcas('uno dos', [[0, 3, 100]]), [0.1, 0.1])
})

test('leerMarcas solo acepta la tabla de ESTE texto', () => {
  const cab = JSON.stringify({ v: 1, n: 7, m: [[0, 3, 0], [4, 3, 300]] })
  assert.deepEqual(leerMarcas(cab, 'uno dos'), [[0, 3, 0], [4, 3, 300]])
  assert.equal(leerMarcas(cab, 'uno  dos'), null) // otro largo: la tabla no es de este texto
  assert.equal(leerMarcas(null, 'uno dos'), null)
  assert.equal(leerMarcas('{roto', 'uno dos'), null)
  assert.equal(leerMarcas(JSON.stringify({ v: 2, n: 7, m: [[0, 3, 0]] }), 'uno dos'), null)
  assert.equal(leerMarcas(JSON.stringify({ v: 1, n: 7, m: [[0, 3, -1]] }), 'uno dos'), null)
})

test('cargar() trae las marcas de X-Marcas; sin cabecera (LemonFox, agent-server viejo) son null', async () => {
  await conWebAudioFalso(async () => {
    const tabla = JSON.stringify({ v: 1, n: 7, m: [[0, 3, 0], [4, 3, 250.5]] })
    const con = new VozServidor(async () => new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/wav', 'x-tempo': '2', 'x-marcas': tabla } }))
    assert.deepEqual((await con.cargar('uno dos', 2)).marcas, [[0, 3, 0], [4, 3, 250.5]])
    const sin = new VozServidor(async () => new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/mpeg' } }))
    assert.equal((await sin.cargar('uno dos', 2)).marcas, null)
  })
})

test('el reloj descuenta las dos latencias (búfer del contexto + salida) y es negativo antes de llegar a la bocina', () => {
  assert.ok(Math.abs(posicionAudible(10.5, 10, 0.01, 0.149) - 0.341) < 1e-9) // audífonos Bluetooth en WebKit
  assert.ok(Math.abs(posicionAudible(10.5, 10) - 0.5) < 1e-9)
  assert.ok(posicionAudible(10.05, 10, 0.01, 0.149) < 0)
  assert.ok(Math.abs(posicionAudible(10.5, 10, Number.NaN, undefined) - 0.5) < 1e-9)
})

test('reloj congelado: reabrir() suspende y reanuda el MISMO contexto; reabrir(true) lo cierra y el siguiente sonar() abre otro', async () => {
  await conWebAudioFalso(async (reloj, fuentes, ctxs) => {
    const voz = new VozServidor(async () => new Response(null))
    const audio = { buffer: { duration: 5 } as AudioBuffer, tempo: 1, marcas: null }
    voz.sonar(audio, 0, () => {})
    assert.equal(voz.reloj(), 10)
    reloj.t += 0 // WebKit tras cambiar la salida: running y el reloj quieto
    voz.reabrir()
    await new Promise((ok) => setTimeout(ok, 0))
    assert.equal(ctxs.length, 1)
    assert.equal(ctxs[0].state, 'running') // suspendido y reanudado: la misma muestra sigue
    voz.reabrir(true)
    assert.equal(ctxs[0].state, 'closed')
    assert.equal(voz.reloj(), null) // la fuente vieja ya no cuenta
    voz.sonar(audio, 2, () => {})
    assert.equal(ctxs.length, 2)
    assert.deepEqual(fuentes[fuentes.length - 1], { rate: 1, desde: 2 })
    voz.parar()
  })
})
