import { readFileSync, renameSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { warmSpeech } from './live/speech.js'
import { GROQ_API_KEY, KOKORO_TTS_URL, VOZ_TOKEN } from './config.js'
import { logger } from './logger.js'

export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  return {
    stt: Boolean(GROQ_API_KEY),
    tts: true, // TTS local con Kokoro (siempre disponible, no requiere key)
  }
}

/**
 * Transcribe un archivo de audio usando Groq Whisper.
 * Las notas de voz .oga — Groq no acepta .oga, renombrar a .ogg (mismo formato).
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  let actualPath = filePath

  // Renombrar .oga → .ogg (Groq requirement — mismo codec, diferente extensión)
  if (filePath.endsWith('.oga')) {
    actualPath = filePath.replace(/\.oga$/, '.ogg')
    if (!existsSync(actualPath)) {
      renameSync(filePath, actualPath)
    }
  }

  const fileBuffer = readFileSync(actualPath)
  const blob = new Blob([fileBuffer], { type: 'audio/ogg' })

  const formData = new FormData()
  formData.set('file', blob, 'audio.ogg')
  formData.set('model', 'whisper-large-v3')
  formData.set('response_format', 'json')

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Groq STT error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as { text: string }
  logger.debug({ length: data.text.length }, 'audio transcribed')
  return data.text
}

/**
 * Sintetiza texto a voz con Kokoro local (open source, corre en el Mac).
 * Endpoint OpenAI-compatible; voz em_alex (hombre, español). Retorna MP3.
 */
export async function synthesizeSpeech(text: string, voice = 'levy', speed = 1.0, tempo?: number): Promise<{ audio: Buffer; tempo: number }> {
  const url = `${KOKORO_TTS_URL}/v1/audio/speech`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(VOZ_TOKEN ? { Authorization: `Bearer ${VOZ_TOKEN}` } : {}) },
    body: JSON.stringify({
      input: text,
      // voz-agentes (services/voz-agentes): levy | sensei | trinity. Kokoro (em_alex) murió con la poda.
      voice,
      language: 'es',
      response_format: 'mp3',
      speed,
      // Lector del chat (23 oct 2026): acelera el audio ya generado sin cambiar el tono (atempo en voz-agentes).
      ...(tempo != null ? { tempo } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`voz-agentes TTS error ${response.status}: ${body}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  logger.debug({ bytes: arrayBuffer.byteLength }, 'speech synthesized (voz-agentes)')
  // Un voz-agentes anterior al 23 oct no conoce `tempo` ni manda X-Tempo: el audio sale a 1x y el lector lo compensa.
  return { audio: Buffer.from(arrayBuffer), tempo: Number(response.headers.get('x-tempo')) || 1 }
}

// Velocidad que la ruta del lector pide a la voz `levy` (306 ppm) para sonar a 1x: 175 ppm.
export const LECTOR_SPEED = 175 / 306
const TEMPO_MAX = 3

/**
 * Formato del audio del lector (31 oct 2026). `wav` para la misma máquina (cero costo de codificar; el peso no importa en
 * localhost). `opus` para el teléfono y cualquier cliente remoto: Ogg Opus a 40 kbps pesa ~11 % del WAV y, medido en el
 * WKWebView de macOS 27 contra el WAV de la misma síntesis (correlación cruzada), decodifica con 0 muestras de corrimiento
 * y la duración exacta (el `pre-skip` y el recorte final de Ogg sí se respetan): las marcas siguen exactas. AAC metía
 * 60–80 ms de relleno al final y MP3 corría 26 ms el arranque; FLAC es exacto pero solo ahorra ~40 %. Ver
 * docs/builds/tts-saltos-2026-10-31/RESULTADO.md.
 */
export type FormatoLector = 'wav' | 'opus'

/** Audio del lector y CUÁNDO suena cada palabra en ese mismo audio: `[desde, largo, ms]` (rango UTF-16 del texto). */
export interface AudioLector {
  audio: Buffer
  tipo: 'audio/wav' | 'audio/ogg'
  tempo: number
  marcas: Array<[number, number, number]>
  /** ms: primer buffer de la voz, síntesis completa y lo que tardó ffmpeg DESPUÉS de la síntesis (Server-Timing). */
  tiempos: { primero: number; sintesis: number; cierre: number }
}

/**
 * Lector del chat con el sintetizador CALIENTE (24 oct 2026: `sayd`, AVSpeechSynthesizer con Juan Enhanced ya cargado,
 * arranca en ~0.2 s contra ~1.2 s de un `say` nuevo) y, desde el 29 oct, con las MARCAS EXACTAS de cada palabra.
 *
 * Daniel (29 oct): «si solo es preciso 95% del tiempo hay desfases que me cortan la concentración». El resaltado ya no
 * se estima: el mismo `write` de AVSpeechSynthesizer que produce el audio entrega la muestra donde empieza cada palabra
 * (sayd.swift). Rate 0.5 = 175 ppm, el 1x del lector; la velocidad la pone `atempo` (sin cambiar el tono), que estira el
 * tiempo de forma lineal: la marca se divide por el tempo (medido contra el audio con scripts/qa/lector-marcas).
 *
 * Sale WAV PCM de 16 bits, no MP3: el MP3 sin cabecera Xing mete un relleno de arranque (~50 ms a 22 kHz) que cada
 * decodificador recorta o no a su manera, y el reloj del cliente quedaría corrido lo que dure ese relleno. En WAV la
 * muestra N del archivo es la muestra N que suena. Desde el 31 oct, para un cliente remoto, Ogg Opus (ver FormatoLector).
 *
 * ffmpeg (atempo y Opus, en UN proceso) arranca con el PRIMER buffer de la voz y se alimenta mientras sintetiza: su
 * arranque (~50 ms) y la codificación quedan dentro de la síntesis en vez de sumarse al final. Si Opus falla, sale WAV.
 */
export async function synthesizeLector(text: string, tempo: number, formato: FormatoLector = 'wav', o: { prioridad?: boolean; signal?: AbortSignal } = {}): Promise<AudioLector> {
  const aplicado = Math.min(TEMPO_MAX, Math.max(1, Number.isFinite(tempo) ? tempo : 1))
  const acelera = Math.abs(aplicado - 1) > 0.01
  const crudas: Array<{ desde: number; largo: number; muestra: number }> = []
  const t0 = performance.now()
  const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
  const { body, sampleRate } = await warmSpeech().stream(text, 1, signal, (m) => crudas.push(m), !!o.prioridad)
  const primero = performance.now() - t0
  const ff = acelera || formato === 'opus' ? ffmpegLector(sampleRate, aplicado, formato) : null
  const partes: Buffer[] = []
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const b = Buffer.from(value)
      partes.push(b)
      ff?.escribir(b)
    }
  } catch (e) {
    ff?.abortar()
    throw e
  }
  const pcm = Buffer.concat(partes)
  if (!pcm.length) { ff?.abortar(); throw new Error('La voz no produjo audio.') }
  const sintesis = performance.now() - t0
  const marcas = marcasEnMs(crudas, sampleRate, aplicado)
  const tiempos = () => ({ primero: Math.round(primero), sintesis: Math.round(sintesis), cierre: Math.round(performance.now() - t0 - sintesis) })
  if (!ff) return { audio: wavPcm16(pcm, sampleRate), tipo: 'audio/wav', tempo: aplicado, marcas, tiempos: tiempos() }
  try {
    const out = await ff.terminar()
    if (formato === 'opus') return { audio: out, tipo: 'audio/ogg', tempo: aplicado, marcas, tiempos: tiempos() }
    return { audio: wavPcm16(out, sampleRate), tipo: 'audio/wav', tempo: aplicado, marcas, tiempos: tiempos() }
  } catch (e) {
    if (formato !== 'opus') throw e
    logger.warn({ reason: String(e).slice(0, 200) }, 'lector: Opus falló, sale WAV')
    const salida = acelera ? await atempo(pcm, sampleRate, aplicado) : pcm
    return { audio: wavPcm16(salida, sampleRate), tipo: 'audio/wav', tempo: aplicado, marcas, tiempos: tiempos() }
  }
}

/** Argumentos de ffmpeg del lector: PCM s16le mono por stdin → [atempo] → PCM s16le o Ogg Opus por stdout. Pura. */
export function argsFfmpegLector(sampleRate: number, tempo: number, formato: FormatoLector): string[] {
  const filtro = Math.abs(tempo - 1) > 0.01 ? ['-filter:a', `atempo=${tempo}`] : []
  // Opus: 24 kHz (lo nativo más cercano a los 22.05 de la voz), 40 kbps y complejidad 0 (codifica ~5x más rápido que la
  // 10 con la misma correlación contra el WAV, 0.995; medido el 31 oct).
  const salida = formato === 'opus'
    ? ['-ar', '24000', '-c:a', 'libopus', '-b:a', '40k', '-compression_level', '0', '-f', 'ogg']
    : ['-f', 's16le', '-ac', '1']
  return ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0', ...filtro, ...salida, 'pipe:1']
}

/** ffmpeg alimentado por partes: `escribir` mientras la voz sintetiza, `terminar` cierra la entrada y entrega la salida. */
function ffmpegLector(sampleRate: number, tempo: number, formato: FormatoLector) {
  const ff = spawn(existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg', argsFfmpegLector(sampleRate, tempo, formato), { stdio: ['pipe', 'pipe', 'pipe'] })
  const out: Buffer[] = []
  let err = ''
  const reloj = setTimeout(() => ff.kill('SIGKILL'), 30_000)
  ff.stdout.on('data', (c: Buffer) => out.push(c))
  ff.stderr.on('data', (c: Buffer) => { err += c.toString() })
  ff.stdin.on('error', () => {})
  const fin = new Promise<Buffer>((ok, mal) => {
    ff.on('error', (e) => { clearTimeout(reloj); mal(e) })
    ff.on('close', (code) => {
      clearTimeout(reloj)
      if (code === 0 && out.length) ok(Buffer.concat(out))
      else mal(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`))
    })
  })
  fin.catch(() => {})
  return {
    escribir(b: Buffer) { if (!ff.stdin.destroyed) ff.stdin.write(b) },
    terminar() { ff.stdin.end(); return fin },
    abortar() { clearTimeout(reloj); ff.kill('SIGKILL') },
  }
}

/** Marcas en milisegundos del audio ENTREGADO (ya acelerado), en orden y sin repetir. Pura, para el test. */
export function marcasEnMs(crudas: Array<{ desde: number; largo: number; muestra: number }>, sampleRate: number, tempo: number): Array<[number, number, number]> {
  if (!(sampleRate > 0) || !(tempo > 0)) return []
  return [...crudas]
    .sort((a, b) => a.muestra - b.muestra || a.desde - b.desde)
    .map((m): [number, number, number] => [m.desde, m.largo, Math.round((m.muestra / sampleRate / tempo) * 10_000) / 10])
}

/** Cabecera WAV (PCM 16 bits mono) con los tamaños exactos. */
export function wavPcm16(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/** `atempo` de ffmpeg sobre PCM crudo (s16le mono): mismo tono, `tempo` veces más rápido. */
function atempo(pcm: Buffer, sampleRate: number, tempo: number): Promise<Buffer> {
  const args = ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0', '-filter:a', `atempo=${tempo}`, '-f', 's16le', '-ac', '1', 'pipe:1']
  return new Promise<Buffer>((ok, mal) => {
    const ff = spawn(existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    let err = ''
    const reloj = setTimeout(() => ff.kill('SIGKILL'), 30_000)
    ff.stdout.on('data', (c: Buffer) => out.push(c))
    ff.stderr.on('data', (c: Buffer) => { err += c.toString() })
    ff.on('error', (e) => { clearTimeout(reloj); mal(e) })
    ff.on('close', (code) => {
      clearTimeout(reloj)
      if (code === 0 && out.length) ok(Buffer.concat(out))
      else mal(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`))
    })
    ff.stdin.on('error', () => {})
    ff.stdin.end(pcm)
  })
}
