/**
 * Provider-neutral STT. A missing optional Groq key must not disable configured STT.
 *
 * Sin imports a propósito (13 nov 2026): la web reexporta este módulo (src/features/live/server/transcribe.ts) y su
 * webpack no resuelve los `.js` del daemon. El idioma del dictado entra como parámetro y los mensajes van marcados
 * (`trMarca`, local): quien responde a la persona los traduce con `tr(error.clave, error.vars)`.
 */
/** Marca para el catálogo inglés (la lee scripts/i18n/lib.mjs por su nombre); no traduce. */
const trMarca = <T extends string>(texto: T): T => texto
type IdiomaDictado = 'es' | 'en'
export type SpeechProvider = { name: 'groq' | 'lemonfox'; key: string; url: string }
export class TranscriptionError extends Error {
  code: string
  status: number
  provider?: string
  /** El texto en español sin variables (la llave del catálogo) y sus variables: `tr(error.clave, error.vars)`. */
  clave: string
  vars?: Record<string, string | number>
  constructor(code: string, message: string, status = 502, provider?: string, vars?: Record<string, string | number>) {
    super(vars ? message.replace(/\{(\w+)\}/g, (t, k: string) => (k in vars ? String(vars[k]) : t)) : message)
    this.code = code; this.status = status; this.provider = provider; this.clave = message; this.vars = vars
  }
}
export function speechProviders(env: Record<string, string | undefined>): SpeechProvider[] {
  return [
    { name: 'groq' as const, key: env.GROQ_API_KEY ?? '', url: 'https://api.groq.com/openai/v1/audio/transcriptions' },
    { name: 'lemonfox' as const, key: env.LEMONFOX_API_KEY ?? '', url: 'https://api.lemonfox.ai/v1/audio/transcriptions' },
  ].filter(provider => provider.key.trim())
}
export function audioFilename(type: string): string {
  const mime = type.toLowerCase().split(';')[0]
  const ext: Record<string, string> = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' }
  if (!ext[mime]) throw new TranscriptionError('unsupported_audio', trMarca('El formato de la grabación no es compatible.'), 415)
  return `recording.${ext[mime]}`
}
/**
 * Idioma del dictado (13 nov 2026, Ajustes › Idioma): con English, Whisper escucha inglés. Groq usa ISO-639-1; LemonFox,
 * el nombre del idioma.
 */
export function idiomaWhisper(provider: SpeechProvider['name'], idioma: IdiomaDictado): string {
  if (provider === 'lemonfox') return idioma === 'en' ? 'english' : 'spanish'
  return idioma
}
export async function transcribe(audio: Blob, providers: SpeechProvider[], signal: AbortSignal, transport: typeof fetch = fetch, idioma: IdiomaDictado = 'es') {
  if (!audio.size) throw new TranscriptionError('empty_audio', trMarca('La grabación no contiene audio.'), 400)
  if (audio.size > 25 * 1024 * 1024) throw new TranscriptionError('audio_too_large', trMarca('La grabación supera 25 MB. Divide el dictado.'), 413)
  const filename = audioFilename(audio.type)
  if (!providers.length) throw new TranscriptionError('stt_not_configured', trMarca('La transcripción no está configurada en este servidor.'), 503)
  let last: TranscriptionError | undefined
  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted()
      const body = new FormData()
      body.set('file', audio, filename)
      body.set('language', idiomaWhisper(provider.name, idioma))
      body.set('response_format', 'json')
      if (provider.name === 'groq') body.set('model', 'whisper-large-v3-turbo')
      try {
        const response = await transport(provider.url, { method: 'POST', headers: { Authorization: `Bearer ${provider.key}` }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
        if (response.ok) {
          const result = await response.json() as { text?: unknown }
          if (typeof result.text !== 'string') throw new Error('Invalid provider response')
          return { text: result.text.trim(), provider: provider.name }
        }
        last = new TranscriptionError('stt_provider_failed', response.status === 429 ? trMarca('El servicio de transcripción está ocupado. Puedes reintentar la grabación.') : trMarca('El servicio de transcripción respondió {estado}. Puedes reintentar la grabación.'), response.status === 429 ? 429 : 502, provider.name, response.status === 429 ? undefined : { estado: response.status })
        // Never expose raw provider bodies, tokens, or HTML to the client.
        await response.body?.cancel()
        if (response.status === 400 || response.status === 413 || response.status === 415) {
          throw new TranscriptionError('invalid_audio', trMarca('El servicio no pudo leer esta grabación.'), 422, provider.name)
        }
        if (response.status < 500 && response.status !== 429) break
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof TranscriptionError) throw error
        last = new TranscriptionError('stt_unreachable', trMarca('No se pudo conectar con la transcripción. Conservamos el audio para reintentar.'), 503, provider.name)
      }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw last ?? new TranscriptionError('stt_failed', trMarca('No se pudo transcribir la grabación.'))
}
