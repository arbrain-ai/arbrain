/**
 * Marcas exactas para LemonFox (29 oct 2026): alinear lo que Groq transcribió con el texto pedido y anclar al audio.
 * Audio sintético: cada palabra es una ráfaga de ruido y cada pausa un silencio de duración conocida, así la verdad del
 * test es exacta. Nada sale a la red: transportes falsos y llaves de prueba.
 */
import { describe, it, expect } from 'vitest'
import { a16k, clave, enPalabras, inicios, leerWav, marcasLemonfox, tiemposDeGroq, tokens, transcribirConTiempos, wav, type PalabraGroq } from './marcas-groq.js'
import { hablarLemonfox } from './voz.js'

const SR = 24_000

/** PCM con una ráfaga por palabra: `[duración de voz, silencio después]` en segundos; arranca con 30 ms de silencio. */
function audio(tramos: Array<[number, number]>, inicio = 0.03): { pcm: Float32Array; s16: Int16Array; inicios: number[] } {
  let semilla = 7
  const ruido = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647 - 0.5 }
  const total = inicio + tramos.reduce((a, [v, s]) => a + v + s, 0) + 0.03
  const pcm = new Float32Array(Math.round(total * SR))
  const out: number[] = []
  let t = inicio
  for (const [v, s] of tramos) {
    out.push(t)
    for (let i = Math.round(t * SR); i < Math.round((t + v) * SR); i++) pcm[i] = 0.5 * ruido()
    t += v + s
  }
  return { pcm, s16: Int16Array.from(pcm, (x) => Math.round(x * 32767)), inicios: out }
}

describe('qué cuenta como la misma palabra', () => {
  it('números en palabras: «80/20», «80-20» y «ochenta veinte» suenan igual; «12:00» casa con «doce»', () => {
    expect(clave('80/20')).toBe(clave('80-20'))
    expect(clave('80/20')).toBe(clave('ochenta veinte'))
    expect(clave('12:00')).toContain(clave('doce'))
    expect(enPalabras(21)).toBe('veintiuno')
    expect(enPalabras(256)).toBe('doscientos cincuenta y seis')
    expect(enPalabras(2026)).toBe('dos mil veintiseis')
    expect(enPalabras(100)).toBe('cien')
  })
  it('sin acentos ni puntuación, y las grafías que suenan igual unidas', () => {
    expect(clave('«Sí,')).toBe(clave('si'))
    expect(clave('vemos')).toBe(clave('bemos'))
    expect(clave('quieres')).toBe(clave('kieres'))
    expect(clave('hizo')).toBe(clave('iso'))
    expect(clave('—')).toBe('')
    expect(clave('¿Dudas')).toBe(clave('dudas'))
  })
})

describe('alinear el texto con lo que escribió Groq', () => {
  it('palabras que Groq escribe distinto, parte o une: cada una del texto toma el inicio de su primera letra', () => {
    const texto = 'Abre SaaS Factory en OneDrive el 21 oct, sin prisa.'
    const g: PalabraGroq[] = [
      { word: 'Abre', start: 0, end: 0.3 }, { word: 'SAS', start: 0.3, end: 0.6 }, { word: 'Factory', start: 0.6, end: 1 },
      { word: 'en', start: 1, end: 1.1 }, { word: 'One', start: 1.1, end: 1.3 }, { word: 'Drive', start: 1.3, end: 1.6 },
      { word: 'el', start: 1.6, end: 1.7 }, { word: 'veintiuno', start: 1.7, end: 2.2 }, { word: 'oct,', start: 2.2, end: 2.6 },
      { word: 'sin', start: 2.9, end: 3.1 }, { word: 'prisa.', start: 3.1, end: 3.6 },
    ]
    const t = tiemposDeGroq(texto, g).map((x) => x?.inicio)
    expect(t).toEqual([0, 0.3, 0.6, 1, 1.1, 1.6, 1.7, 2.2, 2.9, 3.1])
  })
  it('lo que no suena («—») queda sin tiempo; una palabra que Groq no escribió también', () => {
    const texto = 'Nada de eso — exige constancia'
    const g: PalabraGroq[] = [{ word: 'Nada', start: 0, end: 0.3 }, { word: 'de', start: 0.3, end: 0.4 }, { word: 'eso,', start: 0.4, end: 0.7 }, { word: 'constancia.', start: 1, end: 1.6 }]
    const t = tiemposDeGroq(texto, g)
    expect(t[3]).toBeNull() // «—»
    expect(t[4]).toBeNull() // «exige»: Groq se la comió
    expect(t[5]?.inicio).toBe(1)
  })
})

describe('el audio manda donde es inequívoco', () => {
  // «Hola, Mengano. ¿Seguimos con el plan?» con pausas reales tras «Hola,» (0.18 s) y «Mengano.» (0.42 s).
  const texto = 'Hola, Mengano. ¿Seguimos con el plan?'
  const a = audio([[0.3, 0.18], [0.45, 0.42], [0.5, 0.01], [0.2, 0.01], [0.12, 0.01], [0.3, 0]])

  it('arranque de la voz y palabra tras cada pausa, aunque whisper se adelante o se atrase', () => {
    // Whisper como lo hace: la primera en 0.00, la de tras la pausa larga 0.3 s ANTES (se come el silencio) y la de tras
    // la coma 0.12 s DESPUÉS; dentro de la frase, ±30 ms.
    const g: PalabraGroq[] = [
      { word: 'Hola,', start: 0, end: 0.45 }, { word: 'Mengano.', start: a.inicios[1] + 0.12, end: a.inicios[2] - 0.3 },
      { word: '¿Seguimos', start: a.inicios[2] - 0.3, end: a.inicios[3] }, { word: 'con', start: a.inicios[3] + 0.03, end: a.inicios[4] },
      { word: 'el', start: a.inicios[4] - 0.02, end: a.inicios[5] }, { word: 'plan?', start: a.inicios[5] + 0.01, end: a.inicios[5] + 0.3 },
    ]
    const t = inicios(texto, g, a.pcm, SR)!
    expect(Math.abs(t[0]! - a.inicios[0])).toBeLessThan(0.006)
    expect(Math.abs(t[1]! - a.inicios[1])).toBeLessThan(0.006)
    expect(Math.abs(t[2]! - a.inicios[2])).toBeLessThan(0.006)
    expect(t[3]).toBeCloseTo(a.inicios[3] + 0.03, 6)
    expect(t[4]).toBeCloseTo(a.inicios[4] - 0.02, 6)
    for (let k = 1; k < t.length; k++) expect(t[k]!).toBeGreaterThanOrEqual(t[k - 1]!)
  })

  it('el cierre de una «t» dentro de una palabra no se queda con la frontera de la pausa de verdad', () => {
    // «puntos.» lleva un hueco de 45 ms a media palabra (la «t»); la pausa real (0.3 s) viene después.
    const tx = 'valide esos puntos. Si la app'
    const b = audio([[0.4, 0.01], [0.3, 0.01], [0.2, 0.045], [0.2, 0.3], [0.15, 0.01], [0.1, 0.01], [0.25, 0]])
    // tokens: valide, esos, pun|tos., Si, la, app → la ráfaga 3 es «tos.»
    const g: PalabraGroq[] = [
      { word: 'valide', start: 0, end: b.inicios[1] }, { word: 'esos', start: b.inicios[1], end: b.inicios[2] },
      { word: 'puntos.', start: b.inicios[2], end: b.inicios[4] }, { word: 'Si', start: b.inicios[4] + 0.14, end: b.inicios[5] },
      { word: 'la', start: b.inicios[5], end: b.inicios[6] }, { word: 'app', start: b.inicios[6], end: b.inicios[6] + 0.25 },
    ]
    const t = inicios(tx, g, b.pcm, SR)!
    expect(Math.abs(t[3]! - b.inicios[4])).toBeLessThan(0.006) // «Si» arranca al acabar la pausa, no en la «t»
    expect(t[2]).toBeCloseTo(b.inicios[2], 6)
  })

  it('LemonFox calla 40 ms tras un punto y la «k» de «escucho» calla 45 ms: ancla la pausa, no el cierre', () => {
    // Medido en un audio real de LemonFox (29 oct): «Sí, te escucho. Dime…». La coma no tiene pausa; «escucho» lleva su «k».
    const tx = 'Sí, te escucho. Dime qué'
    const b = audio([[0.14, 0.005], [0.12, 0.005], [0.13, 0.045], [0.5, 0.04], [0.3, 0.01], [0.2, 0]])
    // ráfagas: Sí · te · es|cucho · Dime · qué
    const g: PalabraGroq[] = [
      { word: 'Si', start: 0, end: 0.14 }, { word: 'te', start: b.inicios[1] - 0.02, end: b.inicios[2] }, { word: 'escucho,', start: b.inicios[2], end: b.inicios[4] + 0.15 },
      { word: 'dime', start: b.inicios[4] + 0.15, end: b.inicios[5] }, { word: 'qué', start: b.inicios[5], end: b.inicios[5] + 0.2 },
    ]
    const t = inicios(tx, g, b.pcm, SR)!
    expect(t[1]).toBeCloseTo(b.inicios[1] - 0.02, 6) // «te»: sin pausa propia, manda whisper
    expect(Math.abs(t[3]! - b.inicios[4])).toBeLessThan(0.006) // «Dime»: al acabar los 40 ms tras el punto
  })

  it('whisper empalma palabras («cuenta,» 8.34–8.96 y «no» desde 8.44): la pausa larga de la coma gana al cierre de la «t»', () => {
    const tx = 'de la cuenta, no algo'
    const b = audio([[0.14, 0.005], [0.12, 0.005], [0.2, 0.04], [0.15, 0.2], [0.18, 0.005], [0.2, 0]])
    // ráfagas: de · la · cuen|ta, · no · algo
    const g: PalabraGroq[] = [
      { word: 'de', start: 0, end: b.inicios[1] }, { word: 'la', start: b.inicios[1], end: b.inicios[2] },
      { word: 'cuenta,', start: b.inicios[2], end: b.inicios[4] - 0.02 }, { word: 'no', start: b.inicios[2] + 0.1, end: b.inicios[5] },
      { word: 'algo', start: b.inicios[5], end: b.inicios[5] + 0.2 },
    ]
    const t = inicios(tx, g, b.pcm, SR)!
    expect(Math.abs(t[3]! - b.inicios[4])).toBeLessThan(0.006)
  })

  it('si whisper oyó otra cosa (alucinación a 3x), null: mejor el respaldo que marcas falsas', () => {
    expect(inicios(texto, [{ word: '¡Suscríbete', start: 0, end: 0.5 }, { word: 'al', start: 0.5, end: 0.6 }, { word: 'canal!', start: 0.6, end: 1 }], a.pcm, SR)).toBeNull()
    expect(inicios(texto, [], a.pcm, SR)).toBeNull()
    expect(inicios(texto, [{ word: 'Hola', start: 0, end: 0.3 }], new Float32Array(SR), SR)).toBeNull()
  })

  it('la tabla tiene la forma de X-Marcas: [desde, largo, ms] en UTF-16, sin las que no suenan', () => {
    const tx = 'Sí — claro, mañana.'
    const b = audio([[0.2, 0.25], [0.3, 0.2], [0.4, 0]])
    const g: PalabraGroq[] = [{ word: 'Sí,', start: 0, end: 0.4 }, { word: 'claro,', start: 0.4, end: 0.9 }, { word: 'mañana.', start: 0.95, end: 1.5 }]
    const m = marcasLemonfox(tx, g, b.pcm, SR)!
    expect(m.map(([d, l]) => tx.slice(d, d + l))).toEqual(['Sí', 'claro,', 'mañana.'])
    expect(m.every(([, , ms]) => Number.isFinite(ms) && ms >= 0)).toBe(true)
    expect(Math.abs(m[1][2] - b.inicios[1] * 1000)).toBeLessThan(6)
    expect(Math.abs(m[2][2] - b.inicios[2] * 1000)).toBeLessThan(6)
    expect(tokens(tx).length).toBe(4)
  })
})

describe('WAV', () => {
  it('lee el de LemonFox aunque venga en streaming (largo 0xFFFFFFFF) y lo reescribe exacto', () => {
    const s16 = Int16Array.from([0, 1000, -1000, 32767, -32768])
    const limpio = wav(s16, SR)
    const roto = Buffer.from(limpio)
    roto.writeUInt32LE(0xffffffff, 40)
    const l = leerWav(roto)!
    expect(l.sr).toBe(SR)
    expect([...l.s16]).toEqual([...s16])
    expect(wav(l.s16, l.sr).equals(limpio)).toBe(true)
    expect(limpio.readUInt32LE(40)).toBe(10)
  })
  it('estéreo se mezcla a mono; lo que no es WAV de 16 bits, null', () => {
    const h = wav(Int16Array.from([100, 300, -200, -400]), SR)
    h.writeUInt16LE(2, 22) // dos canales: 2 cuadros
    expect([...leerWav(h)!.s16]).toEqual([200, -300])
    expect(leerWav(Buffer.from('ID3 no soy un wav, soy un mp3 ......................................'))).toBeNull()
  })
  it('a 16 kHz para subir a Groq: dos tercios de las muestras', () => {
    expect(a16k(new Float32Array(24_000), 24_000).length).toBe(16_000)
  })
})

describe('Groq y la voz de LemonFox con marcas', () => {
  const LF = 'lf_prueba_0123456789abcdef'
  const GROQ = 'gsk_' + 'q'.repeat(40)
  const texto = 'Hola, Mengano. ¿Seguimos con el plan?'
  const a = audio([[0.3, 0.18], [0.45, 0.42], [0.5, 0.01], [0.2, 0.01], [0.12, 0.01], [0.3, 0]])
  const palabras = [
    { word: 'Hola,', start: 0, end: 0.45 }, { word: 'Mengano.', start: 0.5, end: 1.1 }, { word: '¿Seguimos', start: 1.05, end: 1.6 },
    { word: 'con', start: a.inicios[3], end: a.inicios[4] }, { word: 'el', start: a.inicios[4], end: a.inicios[5] }, { word: 'plan?', start: a.inicios[5], end: a.inicios[5] + 0.3 },
  ]

  function transporte(groq: () => Response) {
    const pedidos: Array<{ url: string; init: RequestInit }> = []
    const t = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init })
      if (url.includes('lemonfox')) {
        const w = Buffer.from(wav(a.s16, SR)); w.writeUInt32LE(0xffffffff, 40) // como llega en streaming
        return new Response(new Uint8Array(w), { status: 200, headers: { 'content-type': 'audio/wav' } })
      }
      return groq()
    }) as unknown as typeof fetch
    return { t, pedidos }
  }

  it('el lector con llave de Groq: LemonFox en WAV, Groq con tiempos por palabra, y el WAV limpio con sus marcas', async () => {
    const { t, pedidos } = transporte(() => Response.json({ text: texto, words: palabras }))
    const r = await hablarLemonfox(texto, 1.5, LF, t, { marcas: true, llaveGroq: GROQ })
    expect(r).toMatchObject({ ok: true, tipo: 'audio/wav', tempo: 1.5 })
    if (!r || !r.ok) throw new Error('sin audio')
    expect(r.audio.readUInt32LE(40)).toBe(a.s16.length * 2)
    expect(JSON.parse(String(pedidos[0].init.body))).toMatchObject({ response_format: 'wav', speed: 1.5 })
    const fd = pedidos[1].init.body as FormData
    expect(pedidos[1].url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(fd.get('model')).toBe('whisper-large-v3')
    expect(fd.getAll('timestamp_granularities[]')).toEqual(['word'])
    expect(fd.get('response_format')).toBe('verbose_json')
    expect((pedidos[1].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${GROQ}`)
    expect(r.marcas!.length).toBe(6)
    expect(Math.abs(r.marcas![2][2] - a.inicios[2] * 1000)).toBeLessThan(6)
    expect(r.sinMarcas).toBeUndefined()
  })

  it('Groq ocupado o caído: el mismo WAV sin marcas (el lector usa su respaldo), sin llaves ni cuerpo del proveedor', async () => {
    for (const [resp, motivo] of [[() => new Response('{"error":"secreto del proveedor"}', { status: 429 }), 'groq_saturado'], [() => new Response('x', { status: 500 }), 'groq_error']] as const) {
      const r = await hablarLemonfox(texto, 1, LF, transporte(resp).t, { marcas: true, llaveGroq: GROQ })
      expect(r).toMatchObject({ ok: true, tipo: 'audio/wav', marcas: null, sinMarcas: motivo })
      expect(JSON.stringify(r)).not.toContain(GROQ)
      expect(JSON.stringify(r)).not.toContain('secreto')
    }
    const caida = await transcribirConTiempos(wav(a.s16, SR), GROQ, (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)
    expect(caida).toEqual({ error: 'groq_sin_red' })
  })

  it('sin llave de Groq: el MP3 de siempre, y la cabecera que le cuenta al alumno cómo tener el resaltado exacto', async () => {
    const { t, pedidos } = transporte(() => { throw new Error('no debe llamar a Groq') })
    const r = await hablarLemonfox(texto, 1, LF, t, { marcas: true })
    expect(r).toMatchObject({ ok: true, tipo: 'audio/mpeg', marcas: null, sinMarcas: 'sin_llave_groq' })
    expect(JSON.parse(String(pedidos[0].init.body))).toMatchObject({ response_format: 'mp3' })
    expect(pedidos.length).toBe(1)
    // Fuera del lector (un «Escuchar» suelto) no se pide nada de esto ni se avisa.
    const suelto = await hablarLemonfox(texto, 1, LF, t, { llaveGroq: GROQ })
    expect(suelto).toMatchObject({ ok: true, tipo: 'audio/mpeg', marcas: null })
    expect(suelto && suelto.ok && suelto.sinMarcas).toBeUndefined()
  })
})
