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
 * Lector del chat con el sintetizador CALIENTE (24 oct 2026, Daniel: «el TTS + lector amarillo sigue sin funcionar tan
 * smooth»). voz-agentes lanza un `say` nuevo por tramo y cada uno carga Juan (Enhanced) desde cero: 0.95 s fijos aunque
 * el tramo sea «Claro.» (medido: 1.15–1.35 s por tramo en /tts). El `sayd` de la voz en vivo ya tiene la voz cargada
 * (AVSpeechSynthesizer); a rate 0.5 da el mismo audio que `say -r 175` (ver 67a86033), así que el resaltado anclado a
 * los silencios no cambia. Aquí solo se codifica a MP3 con el mismo formato que voz-agentes (CBR 96k, sin Xing ni ID3)
 * y la misma aceleración (atempo, sin cambiar el tono).
 */
export async function synthesizeLector(text: string, tempo: number): Promise<{ audio: Buffer; tempo: number }> {
  const aplicado = Math.min(TEMPO_MAX, Math.max(1, Number.isFinite(tempo) ? tempo : 1))
  const { body, sampleRate } = await warmSpeech().stream(text, 1, AbortSignal.timeout(20_000))
  const partes: Buffer[] = []
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    partes.push(Buffer.from(value))
  }
  const pcm = Buffer.concat(partes)
  if (!pcm.length) throw new Error('La voz no produjo audio.')
  const args = ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0']
  if (Math.abs(aplicado - 1) > 0.01) args.push('-filter:a', `atempo=${aplicado}`)
  args.push('-codec:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1')
  const audio = await new Promise<Buffer>((ok, mal) => {
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
  return { audio, tempo: aplicado }
}
