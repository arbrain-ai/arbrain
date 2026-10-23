import { readFileSync, renameSync, existsSync } from 'fs'
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
