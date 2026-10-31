import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSpoken, tramosDeVoz, tramosDesde, PRIMER_TRAMO, ESPERAS_REINTENTO_MS } from '../../src/features/chat/lib/chat-speech'
import { filtrarBloques, markdownHablable, type BloqueLector } from '../../src/features/chat/lib/lector-filtro'
import { SELECTOR_BLOQUES } from '../../src/features/chat/lib/lector-bloques'
import { FallaVoz, VozServidor, esReintentable, formatoDelLector } from '../../src/features/chat/lib/voz-servidor'
import { SONDA_DURACION_S, SONDA_PICO_S, sondaOpusExacta, bytesSondaOpus } from '../../src/features/chat/lib/sonda-opus'
import { cabeEnElMinuto, lineaRegistroLector } from '../../src/features/chat/lib/lector-registro'

// 31 oct 2026, Daniel: «que el lector sea preciso con cada palabra y todo funcione smooth; que no pare hasta que sea así».
// Diagnóstico: docs/builds/tts-saltos-2026-10-31/DIAGNOSTICO.md. Cada test de aquí falla con el código del 30 oct.

const palabras = (s: string) => [...s.matchAll(/\S+/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }))

// ─── Ninguna regla se come texto ─────────────────────────────────────────────────────────────────────────────────
test('una fecha dd/mm/aaaa se dice como fecha, no «una ruta»', () => {
  assert.match(buildSpoken('Firmado el 31/10/2026 en Morelia.').spoken, /el\s+31 de octubre de 2026\s+en Morelia/)
  assert.match(buildSpoken('Pago el 1/2/26.').spoken, /1 de febrero del 26/)
  assert.match(buildSpoken('Allá es 10/31/2026.').spoken, /31 de octubre de 2026/) // la forma de EE. UU.
  assert.doesNotMatch(buildSpoken('el 31/10/2026').spoken, /ruta/)
})

test('palabras entre barras se leen; las rutas de verdad siguen siendo «una ruta»', () => {
  const { spoken } = buildSpoken('Clases lunes/miércoles/viernes y LT/HT/cohorte.')
  for (const w of ['lunes', 'miércoles', 'viernes', 'LT', 'HT', 'cohorte']) assert.match(spoken, new RegExp(w))
  assert.doesNotMatch(spoken, /ruta/)
  assert.match(buildSpoken('Abre arbrain/server/scripts/auto-deploy.sh ya.').spoken, /una ruta/)
  assert.match(buildSpoken('Está en /Users/usuario/notas ahora.').spoken, /una ruta/)
  assert.match(buildSpoken('Está en src/features/chat-speech hoy.').spoken, /una ruta/)
})

test('el mapa hablado → visible cubre la fecha entera (el resaltado no se corre después de ella)', () => {
  const t = 'El 31/10/2026 cerramos.'
  const { spoken, map } = buildSpoken(t)
  const i = spoken.indexOf('cerramos')
  assert.equal(t.slice(map[i], map[i] + 'cerramos'.length), 'cerramos')
})

test('«**Enlaces:**», su lista y luego «**Siguiente paso:** …»: el siguiente paso SÍ se oye', () => {
  const b: BloqueLector[] = [
    { texto: 'Te dejo lo que encontré sobre el tema.' },
    { texto: 'Enlaces:', etiqueta: true },
    { texto: 'Documentación de Next', enLista: true, conEnlace: true, sinEnlaces: '' },
    { texto: 'Guía de Supabase', enLista: true, conEnlace: true, sinEnlaces: '' },
    { texto: 'Siguiente paso: revisa el panel y dime qué ves.', etiqueta: true },
    { texto: 'Ojo: mañana a las 12 es la grupal.', enLista: true, etiqueta: true },
  ]
  assert.deepEqual(filtrarBloques(b).map((i) => b[i].texto), [
    'Te dejo lo que encontré sobre el tema.',
    'Siguiente paso: revisa el panel y dime qué ves.',
    'Ojo: mañana a las 12 es la grupal.',
  ])
})

test('tras las fuentes, un párrafo de prosa reabre la lectura; las referencias sueltas siguen calladas', () => {
  const b: BloqueLector[] = [
    { texto: 'Fuentes:' },
    { texto: 'Polar — https://polar.sh' },
    { texto: 'Supabase: ventas por mes' },
    { texto: 'Si quieres, mañana te armo el plan de la semana con eso.' },
  ]
  assert.deepEqual(filtrarBloques(b).map((i) => b[i].texto), ['Si quieres, mañana te armo el plan de la semana con eso.'])
})

test('la voz del servidor (markdown crudo) aplica la misma regla de fuentes', () => {
  const md = ['Listo.', '', '**Enlaces:**', '', '- [Next](https://nextjs.org)', '- [Polar](https://polar.sh)', '',
    '**Siguiente paso:** pruébalo en el teléfono.'].join('\n')
  const out = markdownHablable(md)
  assert.match(out, /Siguiente paso:\*\* pruébalo en el teléfono\./)
  assert.doesNotMatch(out, /Next|Polar|Enlaces/)
})

test('una línea «Fuentes: Polar, Supabase» con enlaces (en el DOM ya sin URL) es la línea de fuentes', () => {
  const b: BloqueLector[] = [{ texto: 'Hecho.' }, { texto: 'Fuentes: Polar, Supabase', conEnlace: true, sinEnlaces: 'Fuentes:  ,  ' }]
  assert.deepEqual(filtrarBloques(b), [0])
})

test('h5, h6, dt, dd, summary y figcaption se leen', () => {
  const sel = SELECTOR_BLOQUES.split(',')
  for (const t of ['h5', 'h6', 'dt', 'dd', 'summary', 'figcaption']) assert.ok(sel.includes(t), t)
})

test('«Escuchar» lee una lista larga completa (los 8 puntos)', () => {
  const b: BloqueLector[] = [{ texto: 'Los pasos:' }, ...Array.from({ length: 8 }, (_, i) => ({ texto: `Paso ${i + 1}: hacer la cosa ${i + 1}.`, enLista: true }))]
  assert.equal(filtrarBloques(b).length, 9)
})

// ─── Primer audio rápido ─────────────────────────────────────────────────────────────────────────────────────────
test('el primer tramo corta en el primer fin de frase pasados ~60 caracteres; los demás siguen en ~160', () => {
  const frase = 'Esta frase de prueba tiene unos setenta caracteres para medir el corte. '
  const s = frase.repeat(8).trim()
  const tr = tramosDeVoz(s, palabras(s))
  assert.ok(tr[0].texto.length >= PRIMER_TRAMO && tr[0].texto.length < 80, `primer tramo de ${tr[0].texto.length}`)
  assert.ok(tr[1].texto.length >= 160, `segundo tramo de ${tr[1].texto.length}`)
  // Nada se pierde ni se repite.
  assert.equal(tr[0].desde, 0)
  assert.equal(tr[tr.length - 1].hasta, palabras(s).length)
  for (let i = 1; i < tr.length; i++) assert.equal(tr[i].desde, tr[i - 1].hasta)
  assert.equal(tr.map((t) => t.texto).join(' '), s.replace(/\s+/g, ' '))
})

test('si la primera frase es larga, el primer tramo corta en una coma pasados 100 o a los 200', () => {
  const larga = 'Mira, el ochenta veinte de la cohorte es sencillo y lo vamos a revisar con calma, primero tu cerebro instalado, luego tu oferta, después tu primer cliente y al final la entrega completa del programa sin contratar a nadie. Fin.'
  const tr = tramosDeVoz(larga, palabras(larga))
  assert.ok(tr[0].texto.length >= 100 && tr[0].texto.length <= 205 && /,$/.test(tr[0].texto), tr[0].texto)
  const sinComas = 'palabra '.repeat(60).trim()
  assert.ok(tramosDeVoz(sinComas, palabras(sinComas))[0].texto.length <= 200 + 'palabra'.length + 1)
})

test('un tap a media frase pide un tramo que empieza en la palabra tocada, sin perder ni repetir ninguna', () => {
  const s = 'Esta frase de prueba tiene unos setenta caracteres para medir el corte. '.repeat(6).trim()
  const w = palabras(s)
  const w0 = 23
  const tr = tramosDesde(s, w, w0)
  const t = tr.findIndex((x) => x.desde === w0)
  assert.ok(t > 0, 'hay un tramo que arranca justo en la palabra tocada')
  assert.ok(tr[t].texto.length < 100, `y es corto: ${tr[t].texto.length}`)
  assert.equal(tr[0].desde, 0)
  assert.equal(tr[tr.length - 1].hasta, w.length)
  for (let i = 1; i < tr.length; i++) assert.equal(tr[i].desde, tr[i - 1].hasta)
  for (const x of tr) assert.equal(x.texto, s.slice(w[x.desde].from, w[x.hasta - 1].to).replace(/\s+/g, ' '))
})

// ─── Un fallo no cambia la voz ───────────────────────────────────────────────────────────────────────────────────
test('qué se reintenta: red y servidor sí; sin voz de servidor, proveedor o 4xx no', () => {
  for (const s of [0, 408, 429, 500, 502, 503, 504]) assert.ok(esReintentable(s), String(s))
  for (const s of [400, 401, 403, 404]) assert.ok(!esReintentable(s), String(s))
  assert.ok(!esReintentable(503, 'sin_voz_servidor'))
  assert.ok(!esReintentable(500, 'voz_proveedor'))
  assert.ok(esReintentable(503, 'sin_daemon'))
  // Las esperas suman ~3.5 s (lo que tarda un reinicio del daemon) y la primera es corta: un hipo de red no se nota.
  assert.ok(ESPERAS_REINTENTO_MS.reduce((a, b) => a + b, 0) >= 3000 && ESPERAS_REINTENTO_MS[0] <= 300)
})

async function conWebAudioFalso(fn: () => unknown, opus: { exacto: boolean; decodifica: boolean } | null = null) {
  class Ctx {
    state = 'running'; sampleRate = 48000; baseLatency = 0; destination = {}; currentTime = 0
    resume() { return Promise.resolve() } suspend() { return Promise.resolve() } close() { return Promise.resolve() }
    createBuffer() { return { duration: 0 } }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} } }
    decodeAudioData(datos: ArrayBuffer) {
      const u = new Uint8Array(datos)
      // «OggS» = Opus: decodifica solo si el navegador falso lo sabe.
      const esOgg = u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && u[3] === 0x53
      if (esOgg && (!opus || !opus.decodifica)) return Promise.reject(new Error('EncodingError'))
      if (esOgg && u.length > 600) {
        // La sonda: 120 ms con el pico en el ms 60 (o corrido 5 ms si el decodificador no respeta el pre-skip).
        const sr = 48000
        const m = new Float32Array(Math.round(sr * SONDA_DURACION_S))
        m[Math.round(sr * (SONDA_PICO_S + (opus!.exacto ? 0 : 0.005)))] = 0.9
        return Promise.resolve({ duration: SONDA_DURACION_S, sampleRate: sr, getChannelData: () => m })
      }
      return Promise.resolve({ duration: u.length, sampleRate: 48000, getChannelData: () => new Float32Array(8) })
    }
  }
  const g = globalThis as unknown as { window?: unknown; location?: unknown }
  const antes = [g.window, g.location]
  g.window = { AudioContext: Ctx, OfflineAudioContext: Ctx }
  g.location = { hostname: 'servidor.ejemplo.lan' } // el teléfono, desde otra máquina
  try { await fn() } finally { g.window = antes[0]; g.location = antes[1] }
}

test('un 500 llega como falla reintentable; un 503 «sin voz de servidor» no', async () => {
  await conWebAudioFalso(async () => {
    const voz = new VozServidor(async () => Response.json({ error: 'x' }, { status: 500 }))
    const e = await voz.cargar('hola', 1).catch((x) => x)
    assert.ok(e instanceof FallaVoz && e.reintentable, String(e))
    const sin = new VozServidor(async () => Response.json({ code: 'sin_voz_servidor' }, { status: 503 }))
    const e2 = await sin.cargar('hola', 1).catch((x) => x)
    assert.ok(e2 instanceof FallaVoz && !e2.reintentable, String(e2))
    // La red caída (fetch rechaza) también se reintenta, y el fallo no se queda en la caché.
    let n = 0
    const red = new VozServidor(async () => { if (n++ === 0) throw new TypeError('Load failed'); return new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/wav' } }) })
    const e3 = await red.cargar('hola', 1).catch((x) => x)
    assert.ok(e3 instanceof FallaVoz && e3.reintentable)
    assert.ok((await red.cargar('hola', 1)).buffer)
  })
})

test('el teléfono pide Opus si la sonda pasa; la misma máquina, WAV', async () => {
  assert.equal(formatoDelLector('localhost', true), 'wav')
  assert.equal(formatoDelLector('127.0.0.1', true), 'wav')
  assert.equal(formatoDelLector('servidor.ejemplo.lan', true), 'opus')
  assert.equal(formatoDelLector('servidor.ejemplo.lan', false), 'wav')
  await conWebAudioFalso(async () => {
    const pedidos: string[] = []
    const voz = new VozServidor(async (_t, _v, formato) => { pedidos.push(formato); return new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/wav' } }) })
    await voz.cargar('hola', 2)
    assert.deepEqual(pedidos, ['opus'])
  }, { exacto: true, decodifica: true })
  await conWebAudioFalso(async () => {
    const pedidos: string[] = []
    const voz = new VozServidor(async (_t, _v, formato) => { pedidos.push(formato); return new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/wav' } }) })
    await voz.cargar('hola', 2)
    assert.deepEqual(pedidos, ['wav']) // el decodificador corre el pico: las marcas no serían exactas
  }, { exacto: false, decodifica: true })
})

test('un Opus que no decodifica se vuelve a pedir en WAV en el mismo tramo, y WAV desde ahí', async () => {
  await conWebAudioFalso(async () => {
    const opus = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3])
    const pedidos: string[] = []
    const voz = new VozServidor(async (_t, _v, formato) => {
      pedidos.push(formato)
      return formato === 'opus'
        ? new Response(opus, { headers: { 'content-type': 'audio/ogg' } })
        : new Response(new Uint8Array(4), { headers: { 'content-type': 'audio/wav' } })
    })
    // La sonda pasa (este navegador dice que sí) pero un tramo real no decodifica: sigue en WAV sin perder el tramo.
    ;(voz as unknown as { opusExacto: boolean }).opusExacto = true
    const a = await voz.cargar('uno', 1)
    assert.ok(a.buffer)
    await voz.cargar('dos', 1)
    assert.deepEqual(pedidos, ['opus', 'wav', 'wav'])
  }, { exacto: true, decodifica: false })
})

test('la sonda Opus: 120 ms con el pico a ±1 ms del ms 60', () => {
  const sr = 48000
  const m = new Float32Array(Math.round(sr * 0.12))
  m[Math.round(sr * 0.0605)] = 0.8
  assert.ok(sondaOpusExacta(m, sr, 0.12))
  const corrido = new Float32Array(m.length)
  corrido[Math.round(sr * 0.0665)] = 0.8 // un pre-skip ignorado (6.5 ms)
  assert.ok(!sondaOpusExacta(corrido, sr, 0.12))
  assert.ok(!sondaOpusExacta(m, sr, 0.19)) // relleno al final
  const b = new Uint8Array(bytesSondaOpus())
  assert.equal(String.fromCharCode(...b.slice(0, 4)), 'OggS')
})

// ─── Bitácora ligera ─────────────────────────────────────────────────────────────────────────────────────────────
test('la bitácora del lector: solo campos conocidos y acotados, nunca el texto; tope por minuto', () => {
  const l = lineaRegistroLector({ tipo: 'primer-audio', ms: 412.37, toque: 'escuchar', motor: 'servidor', velocidad: 2, texto: 'x'.repeat(5000), 'mal campo': 1, anidado: { a: 1 } }, 'iPhone', new Date('2026-10-31T15:00:00Z'))
  const j = JSON.parse(l!)
  assert.equal(j.ms, 412.4)
  assert.equal(j.texto, undefined) // el texto que se lee nunca se guarda
  assert.equal(JSON.parse(lineaRegistroLector({ tipo: 'falla', motivo: 'm'.repeat(900), servidor: true }, '', new Date())!).motivo.length, 200)
  assert.equal(j['mal campo'], undefined)
  assert.equal(j.anidado, undefined)
  assert.equal(lineaRegistroLector({ tipo: 'otro' }, '', new Date()), null)
  const t = Date.now()
  assert.ok(cabeEnElMinuto(Array(39).fill(t), t))
  assert.ok(!cabeEnElMinuto(Array(40).fill(t), t))
  assert.ok(cabeEnElMinuto(Array(40).fill(t - 61_000), t))
})
