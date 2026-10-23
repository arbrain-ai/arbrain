/**
 * Voz de la edición cliente (21 oct 2026, carril VOZ; Daniel: «puedes pintar una interfaz de usuario para que el
 * usuario utilice la llave de Groq»).
 *
 * El alumno pega su llave gratuita de Groq en Ajustes › Voz; la app la guarda en el llavero del sistema y se la entrega
 * al daemon por stdin, como las demás (cofre.ts). Aquí se decide con qué se transcribe y se prueba la llave.
 *   - Edición cliente: SOLO la llave del cofre. Nunca el `.env` del cerebro (lo puede escribir un agente) ni el entorno.
 *   - Instalación de Daniel: lo de siempre, Groq y LemonFox desde su `.env`.
 */
import { speechProviders, type SpeechProvider } from '../live/transcribe.js'
import { llaveVoz } from './cofre.js'

export function proveedoresVoz(cliente: boolean, envArchivo: () => Record<string, string | undefined>, llave: string | undefined = llaveVoz()): SpeechProvider[] {
  if (cliente) return speechProviders({ GROQ_API_KEY: llave })
  return speechProviders(envArchivo())
}

export interface PruebaVoz { ok: boolean; ms?: number; code?: string; error?: string }

const MODELOS = 'https://api.groq.com/openai/v1/models'

/**
 * «Probar» de Ajustes › Voz: lista los modelos de Groq con la llave (gratis, no gasta cuota de audio). Nunca devuelve
 * la llave ni el cuerpo crudo del proveedor.
 */
export async function probarLlaveVoz(llave: string | undefined, transport: typeof fetch = fetch): Promise<PruebaVoz> {
  if (!llave?.trim()) return { ok: false, code: 'falta_llave', error: 'Tu Arbrain todavía no ve la llave de Groq.' }
  const t0 = Date.now()
  try {
    const r = await transport(MODELOS, { headers: { Authorization: `Bearer ${llave.trim()}` }, signal: AbortSignal.timeout(10_000) })
    await r.body?.cancel().catch(() => {})
    if (r.ok) return { ok: true, ms: Date.now() - t0 }
    if (r.status === 401 || r.status === 403) return { ok: false, code: 'llave_invalida', error: 'Groq no reconoce esa llave.' }
    if (r.status === 429) return { ok: false, code: 'saturado', error: 'Groq está ocupado. Tu llave está bien; prueba en un minuto.' }
    return { ok: false, code: 'error', error: `Groq respondió ${r.status}.` }
  } catch (e) {
    const nombre = (e as Error)?.name
    return nombre === 'TimeoutError' || nombre === 'AbortError'
      ? { ok: false, code: 'tiempo', error: 'Groq tardó demasiado en responder.' }
      : { ok: false, code: 'sin_red', error: 'No hay conexión con Groq.' }
  }
}

/**
 * Leer las respuestas en voz alta en la edición cliente (v0.2.10; grupal del 23 oct: «la voz por defecto en Windows es
 * fea»). Con la llave de LemonFox del alumno, `/tts` devuelve MP3 de LemonFox ya a la velocidad del lector (`speed` de
 * LemonFox; el lector suena a 1x de su propio buffer, ver voz-servidor.ts). Sin llave, `null`: la web cae a la mejor voz
 * del sistema (chat-speech.ts › currentVoice). Nunca devuelve la llave ni el cuerpo crudo del proveedor.
 */
export const VOZ_LEMONFOX = 'alex'
const SPEECH = 'https://api.lemonfox.ai/v1/audio/speech'

export type HablaLemonfox = { ok: true; audio: Buffer; tempo: number } | { ok: false; status: number; error: string }

export async function hablarLemonfox(texto: string, tempo: number | undefined, llave: string | undefined, transport: typeof fetch = fetch): Promise<HablaLemonfox | null> {
  if (!llave?.trim()) return null
  const velocidad = typeof tempo === 'number' && Number.isFinite(tempo) ? Math.min(3, Math.max(0.5, tempo)) : 1
  try {
    const r = await transport(SPEECH, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texto, voice: VOZ_LEMONFOX, language: 'es', speed: velocidad, response_format: 'mp3' }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!r.ok) {
      await r.body?.cancel().catch(() => {})
      const error = r.status === 401 || r.status === 403 ? 'LemonFox no reconoce tu llave.' : r.status === 402 ? 'Tu cuenta de LemonFox no tiene saldo.' : r.status === 429 ? 'LemonFox está ocupado.' : `LemonFox respondió ${r.status}.`
      return { ok: false, status: r.status === 429 ? 429 : 502, error }
    }
    return { ok: true, audio: Buffer.from(await r.arrayBuffer()), tempo: velocidad }
  } catch (e) {
    const nombre = (e as Error)?.name
    return { ok: false, status: 503, error: nombre === 'TimeoutError' || nombre === 'AbortError' ? 'LemonFox tardó demasiado.' : 'No hay conexión con LemonFox.' }
  }
}
