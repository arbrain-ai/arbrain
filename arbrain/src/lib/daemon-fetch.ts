/**
 * Plazo hasta las CABECERAS para los proxies de streaming al daemon (7 oct 2026, chat colgado).
 *
 * WebKit abre como máximo 6 conexiones HTTP/1.1 por origen. Un daemon que acepta la conexión y nunca
 * responde dejaba la petición del navegador colgada para siempre; con 6 así la app entera quedó «Sin
 * conexión con el Studio» y el mensaje de Daniel atorado en su cola. Un stream ya ABIERTO puede durar lo
 * que dure el turno (por eso no sirve un AbortSignal.timeout fijo); lo que no puede pasar es esperar sin
 * cabeceras. Este fetch aborta si no llegan en `plazoMs`, sigue respetando el cierre del navegador y, una
 * vez abiertas, deja correr el cuerpo sin límite.
 */
export class DaemonSinRespuesta extends Error {
  constructor(readonly plazoMs: number) { super(`El daemon no respondió en ${Math.round(plazoMs / 1000)} s.`); this.name = 'TimeoutError' }
}

export async function fetchConPlazoDeCabeceras(url: string, init: RequestInit & { signal?: AbortSignal | null }, plazoMs: number): Promise<Response> {
  const ac = new AbortController()
  const externo = init.signal ?? undefined
  const seguirExterno = () => ac.abort(externo?.reason)
  if (externo?.aborted) seguirExterno()
  else externo?.addEventListener('abort', seguirExterno, { once: true })
  let vencio = false
  const timer = setTimeout(() => { vencio = true; ac.abort(new DaemonSinRespuesta(plazoMs)) }, plazoMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (error) {
    // Vencer el plazo es un TimeoutError (504/«no hay turno vivo»), no un cierre del navegador (499).
    if (vencio) throw new DaemonSinRespuesta(plazoMs)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Cuerpo JSON corto del daemon (respuestas que no son stream) con su propio plazo: tampoco puede colgarse. */
export async function textoConPlazo(response: Response, plazoMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      response.text(),
      new Promise<string>((_, reject) => { timer = setTimeout(() => { void response.body?.cancel().catch(() => {}); reject(new DaemonSinRespuesta(plazoMs)) }, plazoMs) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Plazos elegidos: /chat/stream resuelve la selección del modelo antes de aceptar (puede tardar unos
 *  segundos en frío); /chat/live solo lee el journal. */
export const PLAZO_STREAM_MS = 30_000
export const PLAZO_LIVE_MS = 10_000
