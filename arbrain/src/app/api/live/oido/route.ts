import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { transcribeLocal } from '@/features/live/server/voz-local'
export const maxDuration = 60
const MAX_BYTES = 3 * 1024 * 1024
/**
 * Oído LOCAL de Levy en vivo (18 nov 2026, bandera `levyEnVivo`): el WAV de 16 kHz que graba Live → Qwen3-ASR en el Studio.
 * Lo que oye el micrófono no sale de la máquina. Solo transcribe: decidir si se manda al agente es del cliente
 * (con la palabra de Daniel o su Enter; ver features/live/en-vivo/palabras.ts).
 */
export async function POST(request: Request) {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  const tipo = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (tipo !== 'audio/wav' && tipo !== 'audio/x-wav') return Response.json({ error: 'Se espera audio WAV.', code: 'unsupported_audio' }, { status: 415 })
  const largo = Number(request.headers.get('content-length') ?? 0)
  if (largo > MAX_BYTES) return Response.json({ error: 'La grabación es demasiado larga.', code: 'audio_too_large' }, { status: 413 })
  const audio = await request.arrayBuffer()
  if (!audio.byteLength) return Response.json({ error: 'La grabación no contiene audio.', code: 'empty_audio' }, { status: 400 })
  if (audio.byteLength > MAX_BYTES) return Response.json({ error: 'La grabación es demasiado larga.', code: 'audio_too_large' }, { status: 413 })
  const r = await transcribeLocal(new Blob([audio], { type: 'audio/wav' }), { signal: request.signal })
  if (!r.ok) return Response.json({ error: 'El oído local no respondió. Puedes escribir o reintentar.', code: r.reason }, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ text: r.text, ms: r.ms, provider: 'qwen-local' }, { headers: { 'Cache-Control': 'no-store' } })
}
