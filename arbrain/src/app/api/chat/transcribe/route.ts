import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { speechProviders, transcribe, TranscriptionError, audioFilename } from '@/features/live/server/transcribe'
import { transcribirEnDaemonCliente } from '@/features/live/server/transcribe-cliente'
import { esEdicionCliente } from '@/lib/edicion'
import { urlDaemonCliente } from '@/lib/claudeclaw'
import { tokenDaemon } from '@/lib/daemon-local'
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { dirLogs } from '@/features/chat/lib/rueda-log'
import { lineaDictado } from '@/features/chat/lib/voz-sistema'
import { idiomaActual, tr } from '@/shared/i18n'

// Cuánto pesa cada dictado (12 nov 2026, datos móviles del teléfono): `dictado.jsonl` junto a `lector.jsonl`. Telemetría
// para Levy, nunca la campana; nunca frena ni rompe la transcripción.
const TOPE_LOG = 2 * 1024 * 1024
function registrarDictado(form: FormData, audio: Blob, equipo: string) {
  void (async () => {
    const dir = dirLogs()
    await mkdir(dir, { recursive: true })
    const archivo = path.join(dir, 'dictado.jsonl')
    if ((await stat(archivo).then((s) => s.size).catch(() => 0)) > TOPE_LOG) await rename(archivo, `${archivo}.1`).catch(() => {})
    const campo = (k: string) => form.get(k)?.toString()
    await appendFile(archivo, lineaDictado({ bytes: audio.size, tipo: audio.type, segundos: campo('segundos'), bps_pedido: campo('bps_pedido'), bps_real: campo('bps_real'), ligero: campo('ligero') }, equipo, new Date()), { mode: 0o600 })
  })().catch(() => {})
}

export const maxDuration = 120

export async function POST(request: Request) {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  try {
    const form = await request.formData()
    const audio = form.get('audio')
    if (!(audio instanceof Blob)) return Response.json({ code: 'missing_audio', error: tr('Falta la grabación.') }, { status: 400 })
    const filename = audioFilename(audio.type)
    if (!audio.size || audio.size > 25 * 1024 * 1024) throw new TranscriptionError('invalid_audio_size', tr('La grabación está vacía o supera 25 MB.'), 413)
    registrarDictado(form, audio, request.headers.get('user-agent') ?? '')
    // Edición cliente (21 oct 2026): la llave de Groq del alumno vive solo en su daemon; ahí se transcribe.
    if (esEdicionCliente()) return await transcribirEnDaemonCliente(audio, filename, request.signal, { url: urlDaemonCliente(), token: tokenDaemon() })
    try {
      const relay = new FormData(); relay.set('audio', audio, filename)
      const upstream = await fetch(`${await getClaudeclawUrl()}/live/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, body: relay, signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) })
      if (upstream.ok) return Response.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } })
      if ([400,413,415,422].includes(upstream.status)) return Response.json(await upstream.json(), { status: upstream.status })
      await upstream.body?.cancel()
    } catch { if (request.signal.aborted) return new Response(null, { status: 499 }) }
    const result = await transcribe(audio, speechProviders(process.env), request.signal, fetch, idiomaActual())
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    if (error instanceof TranscriptionError) return Response.json({ code: error.code, error: tr(error.clave, error.vars), provider: error.provider }, { status: error.status })
    return Response.json({ code: 'invalid_request', error: tr('No se pudo leer la grabación enviada.') }, { status: 400 })
  }
}
