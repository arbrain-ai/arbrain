/**
 * Lado servidor de «Notificaciones» en Ajustes (12 oct 2026): alta, estado, baja y prueba de la suscripción push del
 * dispositivo. Sin red ni base: las rutas /api/notifications/{subscribe,prueba} le pasan el usuario de la SESIÓN y un
 * almacén; las pruebas le pasan fakes (tests/notificaciones).
 *
 * Regla de oro: el destinatario SIEMPRE sale de la sesión. Cualquier `userId` que mande el cliente se ignora.
 */

export interface SuscripcionValida { endpoint: string; p256dh: string; auth: string }
export interface FilaSuscripcion extends SuscripcionValida { id: string }

/** Una fila por intento en `push_log` (mismo sensor que /api/notifications/send). */
export interface IntentoPush {
  job_id: string
  status: 'accepted' | 'failed' | 'no_subs' | 'vapid_missing'
  status_code?: number | null
  error?: string | null
  endpoint_tail?: string | null
  title: string
}

export interface AlmacenPush {
  /** Upsert por endpoint: el dispositivo queda a nombre de quien tiene la sesión (otro usuario que entre en el mismo teléfono se lo queda). */
  guardar(userId: string, s: SuscripcionValida): Promise<void>
  borrar(userId: string, endpoint: string): Promise<void>
  deUsuario(userId: string): Promise<FilaSuscripcion[]>
  borrarIds(userId: string, ids: string[]): Promise<void>
  registrar(intentos: IntentoPush[]): Promise<void>
}

export interface Respuesta { status: number; json: Record<string, unknown>; headers?: Record<string, string> }

/** Valida el JSON de `PushSubscription.toJSON()`; null si no sirve. */
export function validarSuscripcion(sub: unknown): SuscripcionValida | null {
  if (!sub || typeof sub !== 'object') return null
  const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return null
  if (s.endpoint.length > 2048) return null
  const p256dh = s.keys?.p256dh
  const auth = s.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) return null
  if (p256dh.length > 256 || auth.length > 128) return null
  return { endpoint: s.endpoint, p256dh, auth }
}

/** El servicio de push dice que esa suscripción ya no existe: se borra. */
export function suscripcionMuerta(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/** Limitador en memoria por usuario: el botón de prueba no es metralleta. Vive por proceso (un solo servidor). */
export function crearLimitador(ventanaMs: number) {
  const ultimo = new Map<string, number>()
  return {
    /** Devuelve los ms que faltan (0 = permitido y queda registrado). */
    intentar(clave: string, ahora = Date.now()): number {
      const previo = ultimo.get(clave)
      if (previo !== undefined && ahora - previo < ventanaMs) return ventanaMs - (ahora - previo)
      ultimo.set(clave, ahora)
      if (ultimo.size > 1000) for (const [k, t] of ultimo) if (ahora - t >= ventanaMs) ultimo.delete(k)
      return 0
    },
  }
}

export const VENTANA_PRUEBA_MS = 30_000

export interface PayloadPush { title: string; body: string; url: string; tag: string; icon: string }

/** La notificación de prueba: solo para quien la pide; al tocarla abre Ajustes › Notificaciones. */
export function payloadPrueba(nombre: string | null | undefined, ahora = new Date()): PayloadPush {
  const quien = (nombre ?? '').trim().split(/\s+/)[0]
  return {
    title: 'Arbrain',
    body: quien ? `${quien}, así te van a llegar tus reportes y avisos.` : 'Así te van a llegar tus reportes y avisos.',
    url: '/settings?seccion=notificaciones',
    // tag único: dos pruebas seguidas no se tapan entre sí
    tag: `prueba-${ahora.getTime()}`,
    icon: '/icon-192.png',
  }
}

const sinSesion = (): Respuesta => ({ status: 401, json: { error: 'Inicia sesión para activar las notificaciones' } })

/** POST /api/notifications/subscribe — registra ESTE dispositivo a nombre del usuario de la sesión. */
export async function altaSuscripcion(usuario: string | null, cuerpo: unknown, almacen: AlmacenPush): Promise<Respuesta> {
  if (!usuario) return sinSesion()
  const sub = validarSuscripcion((cuerpo as { subscription?: unknown } | null)?.subscription)
  if (!sub) return { status: 400, json: { error: 'Suscripción inválida' } }
  await almacen.guardar(usuario, sub)
  return { status: 200, json: { success: true } }
}

/** GET /api/notifications/subscribe?endpoint= — ¿este dispositivo está registrado para mí? y cuántos tengo. */
export async function estadoSuscripcion(usuario: string | null, endpoint: string | null, almacen: AlmacenPush): Promise<Respuesta> {
  if (!usuario) return sinSesion()
  const mias = await almacen.deUsuario(usuario)
  return { status: 200, json: { registrada: !!endpoint && mias.some((s) => s.endpoint === endpoint), dispositivos: mias.length } }
}

/** DELETE /api/notifications/subscribe — da de baja un dispositivo, solo si es mío. */
export async function bajaSuscripcion(usuario: string | null, cuerpo: unknown, almacen: AlmacenPush): Promise<Respuesta> {
  if (!usuario) return sinSesion()
  const endpoint = (cuerpo as { endpoint?: unknown } | null)?.endpoint
  if (typeof endpoint !== 'string' || !endpoint) return { status: 400, json: { error: 'Falta el endpoint' } }
  await almacen.borrar(usuario, endpoint)
  return { status: 200, json: { success: true } }
}

export type Enviar = (s: SuscripcionValida, payload: string) => Promise<void>

/** POST /api/notifications/prueba — una notificación SOLO a los dispositivos de quien la pide, una cada 30 s. */
export async function enviarPrueba(opts: {
  usuario: string | null
  nombre?: string | null
  vapidLista: boolean
  almacen: AlmacenPush
  enviar: Enviar
  limitador: ReturnType<typeof crearLimitador>
  ahora?: Date
}): Promise<Respuesta> {
  const { usuario, almacen, enviar, limitador } = opts
  if (!usuario) return sinSesion()
  const titulo = 'Prueba de notificaciones'
  if (!opts.vapidLista) {
    await almacen.registrar([{ job_id: 'prueba-ajustes', status: 'vapid_missing', error: 'VAPID keys not configured', title: titulo }])
    return { status: 503, json: { error: 'Las notificaciones no están configuradas en este servidor' } }
  }
  const espera = limitador.intentar(usuario, opts.ahora?.getTime())
  if (espera > 0) {
    const s = Math.ceil(espera / 1000)
    return { status: 429, json: { error: `Espera ${s} s antes de otra prueba` }, headers: { 'Retry-After': String(s) } }
  }
  const subs = await almacen.deUsuario(usuario)
  if (subs.length === 0) {
    await almacen.registrar([{ job_id: 'prueba-ajustes', status: 'no_subs', error: 'target has no push subscriptions', title: titulo }])
    return { status: 404, json: { enviadas: 0, dispositivos: 0, error: 'Todavía no activas las notificaciones en ningún dispositivo' } }
  }
  const payload = JSON.stringify(payloadPrueba(opts.nombre, opts.ahora))
  const intentos: IntentoPush[] = []
  const muertas: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await enviar(s, payload)
      intentos.push({ job_id: 'prueba-ajustes', status: 'accepted', endpoint_tail: s.endpoint.slice(-16), title: titulo })
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (suscripcionMuerta(code)) muertas.push(s.id)
      const msg = err instanceof Error ? err.message : String(err)
      intentos.push({ job_id: 'prueba-ajustes', status: 'failed', status_code: code ?? null, error: msg.slice(0, 300), endpoint_tail: s.endpoint.slice(-16), title: titulo })
    }
  }))
  if (muertas.length) await almacen.borrarIds(usuario, muertas)
  await almacen.registrar(intentos)
  const enviadas = intentos.filter((i) => i.status === 'accepted').length
  return {
    status: enviadas > 0 ? 200 : 502,
    json: {
      enviadas,
      fallidas: intentos.length - enviadas,
      dispositivos: subs.length,
      limpiadas: muertas.length,
      ...(enviadas === 0 ? { error: 'El servicio de notificaciones rechazó el envío. Desactiva y vuelve a activar.' } : {}),
    },
  }
}
