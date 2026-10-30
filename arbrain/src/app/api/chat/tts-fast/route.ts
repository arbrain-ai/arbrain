import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'

/**
 * Carril TTS RÁPIDO para Command Center Live (latencia = prioridad #1).
 *
 * LemonFox (/api/chat/tts) entrega ~1.6s por oración — piso demasiado alto para voz fluida.
 * ElevenLabs Flash v2.5 (multilingüe, optimize_streaming_latency) entrega ~400-700ms.
 * El loop de voz usa este endpoint primero y cae a LemonFox si falla / no está configurado.
 */

const EL_KEY = process.env.ELEVENLABS_API_KEY
const EL_VOICE = process.env.COMMAND_TTS_VOICE || process.env.ELEVENLABS_VOICE_DANIEL || ''
const EL_MODEL = process.env.COMMAND_TTS_MODEL || 'eleven_flash_v2_5'

function clean(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, 'código')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[panel:[a-z0-9_-]+\]/gi, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)
  if (!(await hasRole(user.id, 'owner', 'admin'))) return json({ error: 'Forbidden' }, 403)
  if (!EL_KEY || !EL_VOICE) return json({ error: 'Fast TTS not configured' }, 503)

  let text = ''
  try { text = ((await req.json()) as { text?: string }).text ?? '' } catch { return json({ error: 'Invalid JSON' }, 400) }
  const t = clean(text)
  if (!t) return json({ error: 'text required' }, 400)

  let res: Response
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: t,
          model_id: EL_MODEL,
          voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        }),
        signal: req.signal,
      },
    )
  } catch {
    return json({ error: 'ElevenLabs unreachable' }, 503)
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    return json({ error: `ElevenLabs ${res.status}: ${body.slice(0, 160)}` }, res.status || 502)
  }

  // Passthrough del stream mp3 (el cliente acumula arrayBuffer y decodifica)
  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } })
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
