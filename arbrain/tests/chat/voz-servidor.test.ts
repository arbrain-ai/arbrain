import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VozServidor, faltaAcelerar, palabraEn, silenciosDe, tiemposDePalabras, tiemposDelAudio } from '../../src/features/chat/lib/voz-servidor'
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

test('palabraEn devuelve la última palabra que ya empezó', () => {
  const t = [0.05, 0.4, 0.9, 1.5]
  assert.equal(palabraEn(t, 0), 0)
  assert.equal(palabraEn(t, 0.39), 0)
  assert.equal(palabraEn(t, 0.4), 1)
  assert.equal(palabraEn(t, 1.2), 2)
  assert.equal(palabraEn(t, 99), 3)
  assert.equal(palabraEn([], 1), -1)
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
async function conWebAudioFalso(fn: (reloj: { t: number }, fuentes: Array<{ rate: number; desde: number }>) => unknown) {
  const reloj = { t: 10 }
  const fuentes: Array<{ rate: number; desde: number }> = []
  class Ctx {
    state = 'running'
    sampleRate = 48000
    baseLatency = 0
    destination = {}
    get currentTime() { return reloj.t }
    resume() { return Promise.resolve() }
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
  try { await fn(reloj, fuentes) } finally { g.window = antes }
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

test('faltaAcelerar: lo que el servidor no aceleró, nada si ya llegó', () => {
  assert.equal(faltaAcelerar(2, 2), 1)
  assert.equal(faltaAcelerar(2, 1), 2)
  assert.equal(faltaAcelerar(3, 1.5), 2)
  assert.equal(faltaAcelerar(1, 1), 1)
  assert.equal(faltaAcelerar(2, 0), 2)
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
    const audio = { buffer: { duration: 0.2 } as AudioBuffer, tempo: 1 }
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
    voz.sonar({ buffer: { duration: 0.2 } as AudioBuffer, tempo: 1 }, 0, () => fines++)
    await new Promise((ok) => setTimeout(ok, 900)) // reloj del contexto quieto (suspendido)
    assert.equal(fines, 0)
    voz.parar()
  })
})

test('si el servidor no aceleró, el tramo suena en <audio> con preservesPitch a la velocidad que falta, no a 1x', async () => {
  await conWebAudioFalso(async (_reloj, fuentes) => {
    const elementos: Array<Record<string, unknown>> = []
    class AudioFalso {
      src = ''; muted = false; paused = true; currentTime = 0; playbackRate = 1; defaultPlaybackRate = 1; preload = ''
      preservesPitch = false; webkitPreservesPitch = false; onended: (() => void) | null = null
      constructor() { elementos.push(this as unknown as Record<string, unknown>) }
      play() { this.paused = false; return Promise.resolve() }
      pause() { this.paused = true }
      removeAttribute() { this.src = '' }
      load() {}
    }
    const g = globalThis as unknown as { Audio?: unknown }
    const antes = g.Audio
    g.Audio = AudioFalso
    try {
      const voz = new VozServidor(async () => new Response(new Uint8Array(8), { headers: { 'content-type': 'audio/mpeg' } }))
      voz.desbloquear() // dentro del gesto: crea y libera el <audio> (y suena el sample mudo de Web Audio)
      const mudas = fuentes.length
      const viejo = await voz.cargar('x', 2) // X-Tempo ausente: el servidor dejó 1x
      assert.ok(viejo.mp3)
      let fines = 0
      voz.sonar(viejo, 0, () => fines++, 2)
      await new Promise((ok) => setTimeout(ok, 0))
      const el = elementos[0] as unknown as AudioFalso
      assert.equal(el.playbackRate, 2)
      assert.equal(el.preservesPitch, true)
      assert.equal(el.webkitPreservesPitch, true)
      assert.match(el.src, /^blob:.*#t=0\.00$/)
      assert.equal(fuentes.length, mudas) // Web Audio no suena (sería 1x o ardilla)
      assert.equal(voz.corriendo(), true)
      el.onended?.()
      assert.equal(fines, 1)
      // Si el servidor sí aceleró, no hay copia de bytes ni <audio>: Web Audio a ritmo 1.
      const bueno = await new VozServidor(async () => new Response(new Uint8Array(8), { headers: { 'content-type': 'audio/mpeg', 'x-tempo': '2' } })).cargar('x', 2)
      assert.equal(bueno.mp3, undefined)
    } finally {
      g.Audio = antes
    }
  })
})
