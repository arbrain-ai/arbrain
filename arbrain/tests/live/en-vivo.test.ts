// Levy en vivo (18 nov 2026): palabras de envío, detector de turno, WAV del oído, puente a la voz local y el reproductor
// con la alineación que se reemplaza (estimada → exacta).
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decidir, esRuido } from '../../src/features/live/en-vivo/palabras.ts'
import { Turno, umbrales, wav16k, FIN_MS, CALIBRA_MS } from '../../src/features/live/en-vivo/turno.ts'
import { esLoopback, tokenDeEnv, vozLocal, speakLocal, transcribeLocal, VOZ_LOCAL_AGENTE } from '../../src/features/live/server/voz-local.ts'

test('palabras: por defecto nada se manda sin tu palabra', () => {
  assert.deepEqual(decidir('Levy, ¿cuál es la clave de una buena oferta?', 'palabra'), { accion: 'esperar', texto: 'Levy, ¿cuál es la clave de una buena oferta?' })
  assert.deepEqual(decidir('¿Cuál es la clave de una oferta? Cambio.', 'palabra'), { accion: 'enviar', texto: '¿Cuál es la clave de una oferta?' })
  assert.deepEqual(decidir('y la garantía, dale', 'palabra', 'Háblame de la oferta.'), { accion: 'enviar', texto: 'Háblame de la oferta. y la garantía' })
  // «quiero hacer un cambio» es mensaje: la palabra es sustantivo
  assert.equal(decidir('Quiero hacer un cambio', 'palabra').accion, 'esperar')
  assert.equal(decidir('Ese cambio', 'palabra').accion, 'esperar')
  assert.equal(decidir('Hay que seguir adelante', 'palabra').accion, 'esperar')
  assert.equal(decidir('Cuando termine', 'palabra').accion, 'esperar')
  // sin coma también cuenta (el reconocedor no siempre la pone; prueba del 18 nov)
  assert.deepEqual(decidir('Levi en una frase que hace que una oferta sea irresistible cambio', 'palabra'), { accion: 'enviar', texto: 'Levi en una frase que hace que una oferta sea irresistible' })
  assert.deepEqual(decidir('Revisa mi oferta dale', 'palabra'), { accion: 'enviar', texto: 'Revisa mi oferta' })
  // «Dale.» solo manda lo que ya esperaba en el cuadro
  assert.deepEqual(decidir('Dale.', 'palabra', 'Revisa mi oferta'), { accion: 'enviar', texto: 'Revisa mi oferta' })
  assert.deepEqual(decidir('Bueno, te toca.', 'palabra', 'Ya te conté'), { accion: 'enviar', texto: 'Ya te conté' })
})

test('palabras: automático manda al callar; pausa y ruido', () => {
  assert.deepEqual(decidir('Dame la clave de la oferta', 'auto'), { accion: 'enviar', texto: 'Dame la clave de la oferta' })
  assert.equal(decidir('Bueno, terminamos.', 'palabra').accion, 'pausar')
  assert.equal(decidir('Pausa.', 'auto').accion, 'pausar')
  assert.equal(decidir('Ya casi terminamos el proyecto', 'palabra').accion, 'esperar')
  for (const r of ['Gracias por ver el video.', '[Música]', '...', 'Mmm', '']) { assert.ok(esRuido(r), r); assert.equal(decidir(r, 'auto').accion, 'ignorar') }
  assert.equal(esRuido('Hola Levy'), false)
})

/** Simula niveles a 20 ms: [nivel, ms] por tramo. */
function correr(t: Turno, tramos: [number, number][], levyHabla = false, desde = 0) {
  const ev: [string, number][] = []
  let now = desde
  for (const [nivel, ms] of tramos) for (let k = 0; k < ms; k += 20) { now += 20; const e = t.sample(nivel, now, levyHabla); if (e !== 'nada') ev.push([e, now]) }
  return { ev, now }
}

test('turno: calibra el piso, abre con la voz y cierra a los 850 ms de silencio', () => {
  const t = new Turno()
  const { ev } = correr(t, [[0.006, CALIBRA_MS + 20], [0.08, 600], [0.004, FIN_MS + 100]])
  assert.deepEqual(ev.map(e => e[0]), ['inicio', 'pausa', 'fin'])
  assert.ok(t.piso > 0.005 && t.piso < 0.007)
  assert.ok(ev[2][1] - t.finDeVoz > FIN_MS && ev[2][1] - t.finDeVoz <= FIN_MS + 40)
})

test('turno: a los 300 ms de pausa mira adelante una sola vez; si sigues hablando vuelve a mirar', () => {
  const t = new Turno()
  const { ev } = correr(t, [[0.006, CALIBRA_MS + 20], [0.08, 600], [0.004, 400], [0.08, 400], [0.004, FIN_MS + 100]])
  assert.deepEqual(ev.map(e => e[0]), ['inicio', 'pausa', 'pausa', 'fin'])
  // la segunda pausa trae otro fin de voz: el adelanto de la primera ya no vale
  assert.ok(ev[2][1] - ev[1][1] > 600)
})

test('turno: una tos no se transcribe; hablar encima de Levy lo calla', () => {
  const t = new Turno()
  assert.deepEqual(correr(t, [[0.005, CALIBRA_MS + 20], [0.1, 120], [0.003, FIN_MS + 100]]).ev.map(e => e[0]), ['inicio', 'descartar'])   // sin voz mínima no mira adelante
  const t2 = new Turno()
  const a = correr(t2, [[0.005, CALIBRA_MS + 20]])
  // el eco de Levy (0.06) no llega al umbral alto; tu voz (0.2) sí
  assert.deepEqual(correr(t2, [[0.06, 600]], true, a.now).ev, [])
  assert.deepEqual(correr(t2, [[0.2, 300]], true, a.now + 600).ev.map(e => e[0]), ['inicio', 'interrumpe'])
  assert.ok(umbrales(0.01, true).habla > umbrales(0.01, false).habla)
})

test('wav16k: cabecera correcta y remuestreo de 48 kHz', () => {
  const x = new Float32Array(4800).fill(0.5)
  const w = wav16k([x.subarray(0, 2400), x.subarray(2400)], 48000)
  const v = new DataView(w.buffer)
  assert.equal(String.fromCharCode(...w.subarray(0, 4)), 'RIFF')
  assert.equal(v.getUint32(24, true), 16000)
  assert.equal(v.getUint32(40, true), 1600 * 2)
  assert.equal(w.length, 44 + 3200)
  assert.equal(v.getInt16(44 + 100, true), Math.trunc(0.5 * 32767))
})

test('voz local: solo loopback, token del .env, nunca en la edición cliente', () => {
  assert.ok(esLoopback('http://127.0.0.1:8880'))
  assert.equal(esLoopback('https://algo.example.com'), false)
  assert.equal(esLoopback('http://192.168.1.4:8880'), false)
  assert.equal(tokenDeEnv('A=1\nVOZ_TOKEN="abc123"\nVOZ_TOKEN=otro'), 'abc123')
  const dir = mkdtempSync(join(tmpdir(), 'voz-local-'))
  const env = join(dir, '.env'); writeFileSync(env, 'VOZ_TOKEN=sintetico\n')
  assert.deepEqual(vozLocal({}, [env]), { url: 'http://127.0.0.1:8880', token: 'sintetico' })
  assert.equal(vozLocal({ VOZ_LOCAL_URL: 'https://fuera.example' }, [env]), null)
  assert.equal(vozLocal({ ARBRAIN_EDICION: 'cliente' }, [env]), null)
  assert.equal(vozLocal({}, [join(dir, 'no-existe')]), null)
})

test('voz local: pide el clon del agente con su llave y devuelve el stream', async () => {
  const llamadas: { url: string; init: RequestInit }[] = []
  const transport = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return new Response('{"audio_base64":""}\n', { headers: { 'X-Voice': 'adam-clon' } }) }) as unknown as typeof fetch
  const r = await speakLocal({ text: 'Hola', agent: 'levy', config: { url: 'http://127.0.0.1:9', token: 't' }, transport })
  assert.equal(r.ok, true)
  assert.equal(llamadas[0].url, 'http://127.0.0.1:9/v1/audio/speech/vivo')
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, 'Bearer t')
  assert.deepEqual(JSON.parse(String(llamadas[0].init.body)), { input: 'Hola', voice: VOZ_LOCAL_AGENTE.levy })
  const ocupado = await speakLocal({ text: 'Hola', agent: 'sensei', config: { url: 'http://127.0.0.1:9', token: 't' }, transport: (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch })
  assert.deepEqual(ocupado, { ok: false, reason: 'voz_local_ocupada' })
  assert.deepEqual(await speakLocal({ text: 'x', agent: 'levy', config: null }), { ok: false, reason: 'sin_voz_local' })
  const oido = await transcribeLocal(new Blob([new Uint8Array(4)]), { config: { url: 'http://127.0.0.1:9', token: 't' }, transport: (async () => Response.json({ text: ' hola levy ', ms: 120 })) as unknown as typeof fetch })
  assert.deepEqual(oido, { ok: true, text: 'hola levy', ms: 120 })
})

test('reproductor: con la bandera pide la voz local y la alineación exacta reemplaza a la estimada', async () => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', { value: { location: { search: '?levyEnVivo=1' }, localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } }, configurable: true })
  class Ctx { currentTime = 0; outputLatency = 0; destination = {}; async resume() {} async close() {}
    createAnalyser() { return { fftSize: 256, connect() {}, getByteTimeDomainData(d: Uint8Array) { d.fill(128) } } }
    createBuffer(_c: number, n: number, r: number) { return { duration: n / r, copyToChannel() {} } }
    createBufferSource() { return { buffer: null, onended: null, connect() {}, disconnect() {}, stop() {}, start() {} } } }
  Object.defineProperty(globalThis, 'AudioContext', { value: Ctx, configurable: true })
  const { LivePcmPlayer } = await import('../../src/features/live/voice/player.ts')
  const al = (fin: number) => ({ characters: ['h', 'o', 'l', 'a'], character_start_times_seconds: [0, 0.1, 0.2, 0.3], character_end_times_seconds: [0.1, 0.2, 0.3, fin] })
  const pcm = Buffer.from(new Uint8Array(4800)).toString('base64')
  let cuerpo: Record<string, unknown> = {}
  let ctl: ReadableStreamDefaultController<Uint8Array> | undefined
  const enc = new TextEncoder()
  const transport = (async (_u: string, init: RequestInit) => { cuerpo = JSON.parse(String(init.body)); return new Response(new ReadableStream({ start(c) { ctl = c } }), { headers: { 'X-Sample-Rate': '24000', 'X-Voice-Alignment': 'chars', 'X-Voice-Provider': 'qwen-local' } }) }) as unknown as typeof fetch
  const player = new LivePcmPlayer(transport)
  await player.resume(); player.begin()
  try {
    player.enqueue('hola', 1.75); player.finish()
    await new Promise(r => setTimeout(r, 20))
    assert.equal(cuerpo.local, true); assert.equal(cuerpo.alineacion, true)
    ctl!.enqueue(enc.encode(JSON.stringify({ alignment: al(0.4), reemplaza: true, exacta: false }) + '\n' + JSON.stringify({ audio_base64: pcm }) + '\n'))
    await new Promise(r => setTimeout(r, 20))
    ;(player as unknown as { context: { currentTime: number } }).context.currentTime = 0.03
    const track = player.position!.track!
    assert.equal(track.alineacion!.rev, 1); assert.equal(track.alineacion!.ends.at(-1), 0.4)
    ctl!.enqueue(enc.encode(JSON.stringify({ alignment: al(0.35), reemplaza: true, exacta: true }) + '\n'))
    await new Promise(r => setTimeout(r, 20))
    assert.equal(track.alineacion!.rev, 2); assert.equal(track.alineacion!.ends.at(-1), 0.35); assert.equal(track.alineacion!.chars.length, 4)
    ctl!.close()
  } finally { player.dispose() }
})

test('reproductor: con voz local pide las frases de una en una (una sola GPU, en orden)', async () => {
  const { LivePcmPlayer } = await import('../../src/features/live/voice/player.ts')
  const pedidos: string[] = []
  const cierres: (() => void)[] = []
  const transport = (async (_u: string, init: RequestInit) => {
    pedidos.push(JSON.parse(String(init.body)).text)
    return new Response(new ReadableStream({ start(c) { cierres.push(() => c.close()) } }), { headers: { 'X-Sample-Rate': '24000' } })
  }) as unknown as typeof fetch
  const player = new LivePcmPlayer(transport)
  await player.resume(); player.begin()
  try {
    player.enqueue('Primera.', 1); player.enqueue('Segunda.', 1); player.finish()
    await new Promise(r => setTimeout(r, 20))
    assert.deepEqual(pedidos, ['Primera.'])
    cierres[0](); await new Promise(r => setTimeout(r, 20))
    assert.deepEqual(pedidos, ['Primera.', 'Segunda.'])
    cierres[1]()
  } finally { player.dispose() }
})
