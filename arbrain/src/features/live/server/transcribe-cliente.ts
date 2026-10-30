/**
 * Dictado en la edición cliente (21 oct 2026, carril VOZ). La web no tiene ninguna llave de voz: la de Groq vive en el
 * llavero y la recibe solo el daemon por stdin. Aquí la grabación se reenvía a SU daemon en loopback y su respuesta
 * vuelve tal cual (incluido `503 stt_not_configured` cuando falta la llave: la pantalla lleva a Ajustes › Voz).
 * Sin respaldo local: en cliente la web nunca transcribe por su cuenta.
 */
export const SIN_LLAVE_VOZ = 'stt_not_configured'

export interface RelevoVoz {
  url: string
  token: string
  transport?: typeof fetch
}

export async function transcribirEnDaemonCliente(audio: Blob, filename: string, signal: AbortSignal, { url, token, transport = fetch }: RelevoVoz): Promise<Response> {
  const nocache = { 'Cache-Control': 'no-store' }
  if (!token) return Response.json({ code: 'sin_daemon', error: 'La app no le pasó a la web la llave de su servidor local. Cierra y abre Arbrain.' }, { status: 503, headers: nocache })
  const form = new FormData()
  form.set('audio', audio, filename)
  try {
    const r = await transport(`${url}/live/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(75_000)]) })
    const cuerpo = await r.json().catch(() => null) as Record<string, unknown> | null
    if (!cuerpo) return Response.json({ code: 'stt_failed', error: 'No se pudo transcribir la grabación.' }, { status: 502, headers: nocache })
    return Response.json(cuerpo, { status: r.status, headers: nocache })
  } catch {
    if (signal.aborted) return new Response(null, { status: 499 })
    return Response.json({ code: 'sin_daemon', error: 'Tu Arbrain local no responde. Si acabas de guardar una llave, espera unos segundos.' }, { status: 502, headers: nocache })
  }
}
