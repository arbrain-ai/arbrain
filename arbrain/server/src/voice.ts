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

/** Audio del lector y CUÁNDO suena cada palabra en ese mismo audio: `[desde, largo, ms]` (rango UTF-16 del texto). */
export interface AudioLector { audio: Buffer; tipo: 'audio/wav'; tempo: number; marcas: Array<[number, number, number]> }

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
 * muestra N del archivo es la muestra N que suena.
 */
export async function synthesizeLector(text: string, tempo: number): Promise<AudioLector> {
  const aplicado = Math.min(TEMPO_MAX, Math.max(1, Number.isFinite(tempo) ? tempo : 1))
  const crudas: Array<{ desde: number; largo: number; muestra: number }> = []
  const { body, sampleRate } = await warmSpeech().stream(text, 1, AbortSignal.timeout(20_000), (m) => crudas.push(m))
  const partes: Buffer[] = []
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    partes.push(Buffer.from(value))
  }
  const pcm = Buffer.concat(partes)
  if (!pcm.length) throw new Error('La voz no produjo audio.')
  const salida = Math.abs(aplicado - 1) > 0.01 ? await atempo(pcm, sampleRate, aplicado) : pcm
  return { audio: wavPcm16(salida, sampleRate), tipo: 'audio/wav', tempo: aplicado, marcas: marcasEnMs(crudas, sampleRate, aplicado) }
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
