/**
 * Levy en vivo (18 nov 2026): la voz y el oído LOCALES de Live, en el Studio (voz-agentes, Qwen3-TTS + Qwen3-ASR).
 * Daniel: «toda voz es local». Con la bandera `levyEnVivo` encendida, /api/live/speech pide aquí la voz y /api/live/oido
 * transcribe aquí; si el servicio no responde se cae a la voz de Apple del host (también local), nunca a la nube.
 *
 * El token de voz-agentes (VOZ_TOKEN) vive en `arbrain/server/.env` del Studio: se lee de ahí si el entorno de la web no
 * lo trae. Solo se manda a una dirección de loopback; una URL remota se ignora (el token no sale de la máquina).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type VozLocal = { url: string; token: string }
export type LocalSpeech = { ok: true; body: ReadableStream<Uint8Array>; voice: string; headersMs: number } | { ok: false; reason: string }

/** Voz de cada agente en vivo: Levy habla con Adam en el chip (la voz de los videos); los otros, con su clon. */
export const VOZ_LOCAL_AGENTE: Record<string, string> = { levy: 'adam-clon', trinity: 'trinity-clon', sensei: 'sensei-clon' }

export function esLoopback(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')
  } catch { return false }
}

/** VOZ_TOKEN de un .env (la primera línea que lo define; sin comillas). */
export function tokenDeEnv(texto: string): string {
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*VOZ_TOKEN\s*=\s*(.*)\s*$/)
    if (m) return m[1].replace(/^["']|["']$/g, '').trim()
  }
  return ''
}

let cache: { valor: VozLocal | null; at: number } | null = null

/** Dónde está la voz local y con qué llave. null = no hay (edición cliente, otra máquina, sin token). */
export function vozLocal(env: Record<string, string | undefined> = process.env, archivos?: string[]): VozLocal | null {
  if (!archivos && cache && Date.now() - cache.at < 60_000) return cache.valor
  const url = (env.VOZ_LOCAL_URL || 'http://127.0.0.1:8880').replace(/\/+$/, '')
  let token = env.VOZ_TOKEN?.trim() || ''
  if (!token) {
    const candidatos = archivos ?? [join(process.cwd(), 'server', '.env'), join(process.cwd(), 'arbrain', 'server', '.env'), join(homedir(), 'Developer', 'artificial-brain', 'arbrain', 'server', '.env')]
    for (const ruta of candidatos) {
      try { if (existsSync(ruta)) { token = tokenDeEnv(readFileSync(ruta, 'utf8')); if (token) break } } catch { /* ilegible: el siguiente */ }
    }
  }
  const valor = env.ARBRAIN_EDICION === 'cliente' || !token || !esLoopback(url) ? null : { url, token }
  if (!archivos) cache = { valor, at: Date.now() }
  return valor
}

/** Una frase en streaming (NDJSON: audio + alineación por carácter, ver voz-agentes/vivo.py). */
export async function speakLocal(o: { text: string; agent: string; signal?: AbortSignal; config?: VozLocal | null; transport?: typeof fetch; tempo?: number }): Promise<LocalSpeech> {
  const config = o.config === undefined ? vozLocal() : o.config
  if (!config) return { ok: false, reason: 'sin_voz_local' }
  const transport = o.transport ?? fetch
  const voice = VOZ_LOCAL_AGENTE[o.agent] ?? VOZ_LOCAL_AGENTE.levy
  const started = performance.now()
  try {
    const r = await transport(`${config.url}/v1/audio/speech/vivo`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: o.text, voice, ...(o.tempo ? { tempo: o.tempo } : {}) }),
      signal: o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    })
    if (!r.ok || !r.body) { await r.body?.cancel().catch(() => {}); return { ok: false, reason: r.status === 503 ? 'voz_local_ocupada' : `voz_local_${r.status}` } }
    return { ok: true, body: r.body, voice: r.headers.get('X-Voice') || voice, headersMs: Math.round(performance.now() - started) }
  } catch {
    if (o.signal?.aborted) return { ok: false, reason: 'cancelado' }
    return { ok: false, reason: 'voz_local_sin_respuesta' }
  }
}

/** Dictado local: WAV → texto. */
export async function transcribeLocal(wav: Blob, o: { signal?: AbortSignal; config?: VozLocal | null; transport?: typeof fetch } = {}): Promise<{ ok: true; text: string; ms: number } | { ok: false; status: number; reason: string }> {
  const config = o.config === undefined ? vozLocal() : o.config
  if (!config) return { ok: false, status: 503, reason: 'sin_voz_local' }
  const transport = o.transport ?? fetch
  try {
    const r = await transport(`${config.url}/v1/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'audio/wav' }, body: wav,
      signal: o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    })
    const cuerpo = await r.json().catch(() => null) as { text?: unknown; ms?: unknown } | null
    if (!r.ok || typeof cuerpo?.text !== 'string') return { ok: false, status: r.status === 503 ? 503 : 502, reason: r.status === 503 ? 'oido_local_ocupado' : 'oido_local_fallo' }
    return { ok: true, text: cuerpo.text.trim(), ms: typeof cuerpo.ms === 'number' ? cuerpo.ms : 0 }
  } catch {
    if (o.signal?.aborted) return { ok: false, status: 499, reason: 'cancelado' }
    return { ok: false, status: 502, reason: 'oido_local_sin_respuesta' }
  }
}
