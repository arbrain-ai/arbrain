/**
 * ElevenLabs para Live: PCM 24 kHz en streaming (mismo contrato que la voz de Apple/LemonFox), modelo flash.
 * Medido 4 oct 2026: HTTP streaming caliente 150-270 ms al primer byte; el websocket de input streaming, ya abierto,
 * 143-340 ms desde el envío. Sin ganancia real y el websocket no sobrevive entre invocaciones HTTP, así que se usa HTTP
 * con conexión caliente (warm + latido desde el cliente) y `previous_text` para la continuidad entre frases.
 */
const BASE = 'https://api.elevenlabs.io'
export const FIRST_BYTE_BUDGET_MS = 1500
let blockedUntil = 0
let blockedReason = ''

export const elevenKey = () => process.env.LIVE_ELEVENLABS_API_KEY?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || ''
export const elevenBlocked = () => (Date.now() < blockedUntil ? blockedReason : '')
export function resetElevenBlock() { blockedUntil = 0; blockedReason = '' }
function block(ms: number, reason: string) { blockedUntil = Date.now() + ms; blockedReason = reason }

/** Qué hacer según la respuesta: clave/permiso o saldo agotado = descanso largo; límite de concurrencia o 5xx = corto. */
export function classifyFailure(status: number, body: string): { reason: string; blockMs: number } {
  if (status === 402 || /quota_exceeded|insufficient|credits/i.test(body)) return { reason: 'saldo_agotado', blockMs: 10 * 60_000 }
  if (status === 401 || status === 403) return { reason: 'clave_o_permiso', blockMs: 10 * 60_000 }
  if (status === 429) return { reason: 'limite_concurrencia', blockMs: 3_000 }
  return { reason: `http_${status}`, blockMs: 10_000 }
}

/** Abre (y mantiene) la conexión TLS con ElevenLabs sin gastar caracteres. */
export async function warmEleven(): Promise<{ ok: boolean; ms: number; reason?: string }> {
  const key = elevenKey(), started = performance.now()
  if (!key) return { ok: false, ms: 0, reason: 'sin_clave' }
  try {
    const r = await fetch(`${BASE}/v1/models`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(4000) })
    await r.body?.cancel()
    return { ok: true, ms: Math.round(performance.now() - started) }
  } catch { return { ok: false, ms: Math.round(performance.now() - started), reason: 'sin_red' } }
}

export type ElevenResult = { ok: true; body: ReadableStream<Uint8Array>; firstByteMs: number } | { ok: false; reason: string }

export async function speakEleven(o: { text: string; voiceId: string; previousText?: string; speed?: number; signal?: AbortSignal; budgetMs?: number }): Promise<ElevenResult> {
  const key = elevenKey()
  if (!key) return { ok: false, reason: 'sin_clave' }
  const blocked = elevenBlocked()
  if (blocked) return { ok: false, reason: blocked }
  const started = performance.now(), ctl = new AbortController()
  const onAbort = () => ctl.abort()
  o.signal?.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctl.abort() }, o.budgetMs ?? FIRST_BYTE_BUDGET_MS)
  try {
    const speed = typeof o.speed === 'number' ? Math.min(1.2, Math.max(0.7, o.speed)) : 1
    const response = await fetch(`${BASE}/v1/text-to-speech/${o.voiceId}/stream?output_format=pcm_24000`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: o.text, model_id: process.env.LIVE_ELEVEN_MODEL || 'eleven_flash_v2_5', language_code: 'es',
        ...(o.previousText ? { previous_text: o.previousText.slice(-300) } : {}),
        voice_settings: { stability: 0.5, similarity_boost: 0.8, speed },
      }),
    })
    if (!response.ok || !response.body) {
      const failure = classifyFailure(response.status, await response.text().catch(() => ''))
      block(failure.blockMs, failure.reason)
      return { ok: false, reason: failure.reason }
    }
    const reader = response.body.getReader()
    const first = await reader.read() // el presupuesto de 1.5 s cubre hasta el primer byte de audio, no solo las cabeceras
    clearTimeout(timer)
    if (first.done || !first.value?.length) { block(10_000, 'audio_vacio'); return { ok: false, reason: 'audio_vacio' } }
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(first.value) },
      async pull(c) { try { const r = await reader.read(); r.done ? c.close() : c.enqueue(r.value) } catch (e) { c.error(e) } },
      cancel() { return reader.cancel().catch(() => {}) },
    })
    return { ok: true, body, firstByteMs: Math.round(performance.now() - started) }
  } catch {
    clearTimeout(timer)
    if (o.signal?.aborted) return { ok: false, reason: 'cancelado' }
    if (timedOut) { block(8_000, 'primer_byte_lento'); return { ok: false, reason: 'primer_byte_lento' } }
    block(10_000, 'sin_red'); return { ok: false, reason: 'sin_red' }
  } finally { o.signal?.removeEventListener('abort', onAbort) }
}
