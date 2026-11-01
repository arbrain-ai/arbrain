/**
 * Avisos de Levy en el teléfono del alumno (v0.2.18, 31 oct 2026; docs/builds/avisos-telefono-alumno-2026-10-31/REPORTE.md).
 * La parte PURA (sin red ni base; tests/notificaciones/avisos-alumno.test.ts): la usan `/api/notifications/send` y
 * `/api/chat/complete` en la edición cliente.
 *
 * Reglas:
 *   - `send` solo con el token del daemon de ESTA instalación (Bearer exacto, comparado en tiempo constante). Ni la
 *     sesión de la persona ni el pase de los agentes valen: un agente no puede escribirle al teléfono.
 *   - El destinatario es el dueño de la instalación (la única persona de su base local); nada del cuerpo lo cambia.
 *   - Una por evento: el `tag` es su identidad y no suena dos veces en 24 h; y un tope de 6 avisos cada 10 minutos.
 *   - Sin campana: en la edición cliente nada se escribe en `avisos` (esa es la del negocio de la instalación original).
 */
import { sameSecret } from '@/lib/desktop-auth'
import { crearLimitador, entregar, type AlmacenPush, type Enviar, type Respuesta } from './pushServidor'

export type TipoAviso = 'cola' | 'rutina' | 'respuesta' | 'otro'
export interface AvisoAlumno { title: string; body: string; url: string; tag: string; kind: TipoAviso }

const TIPOS: readonly TipoAviso[] = ['cola', 'rutina', 'respuesta', 'otro']

/** Una línea para la pantalla bloqueada: sin saltos, recortada con «…». */
export function lineaAviso(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Solo rutas de la propia web (`/chat?…`); una dirección de fuera, `//otro` o con `\` cae a `/chat`. */
export function rutaPropia(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.includes('\\') || url.length > 300) return '/chat'
  return /^[\x21-\x7e]+$/.test(url) ? url : '/chat'
}

/** El cuerpo que manda el daemon (`server/src/cliente/avisos-telefono.ts`), validado y acotado. null si no sirve. */
export function validarAviso(cuerpo: unknown): AvisoAlumno | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const c = cuerpo as Record<string, unknown>
  const title = typeof c.title === 'string' ? lineaAviso(c.title, 90) : ''
  const tag = typeof c.tag === 'string' ? c.tag : ''
  if (!title || !/^[A-Za-z0-9:_.-]{1,140}$/.test(tag)) return null
  const body = typeof c.body === 'string' ? lineaAviso(c.body, 240) : ''
  const kind = TIPOS.includes(c.kind as TipoAviso) ? c.kind as TipoAviso : 'otro'
  return { title, body, url: rutaPropia(c.url), tag, kind }
}

/** ¿`Authorization` es exactamente `Bearer <token del daemon>`? Un token corto o ausente nunca vale. */
export function bearerDelDaemon(autorizacion: string | null | undefined, token: string | null | undefined): boolean {
  if (!token || token.length < 32 || !autorizacion?.startsWith('Bearer ')) return false
  return sameSecret(autorizacion.slice(7).trim(), token)
}

/** Tope deslizante: como mucho `max` avisos por `ventanaMs`. */
export function crearTope(max: number, ventanaMs: number) {
  let marcas: number[] = []
  return {
    permitir(ahora = Date.now()): boolean {
      marcas = marcas.filter((t) => ahora - t < ventanaMs)
      if (marcas.length >= max) return false
      marcas.push(ahora)
      return true
    },
  }
}

export const TOPE_AVISOS = 6
export const VENTANA_TOPE_MS = 10 * 60_000
export const VENTANA_REPETIDO_MS = 24 * 60 * 60_000

type Estado = { repetidos: ReturnType<typeof crearLimitador>; tope: ReturnType<typeof crearTope> }
/**
 * Uno por proceso de la web, compartido entre rutas: Next empaqueta cada ruta por separado y un estado de módulo
 * dejaría a `/send` y a `/chat/complete` con topes distintos.
 */
export function estadoAvisos(): Estado {
  const g = globalThis as typeof globalThis & { __arbrainAvisosAlumno?: Estado }
  return (g.__arbrainAvisosAlumno ??= { repetidos: crearLimitador(VENTANA_REPETIDO_MS), tope: crearTope(TOPE_AVISOS, VENTANA_TOPE_MS) })
}

export interface DepsAviso {
  /** El dueño de la instalación (la sesión local), nunca uno que venga del cuerpo. */
  usuario: string
  almacen: AlmacenPush
  enviar: Enviar
  vapidLista: boolean
  estado?: Estado
  ahora?: number
}

/** Entrega un aviso ya autorizado a los dispositivos del dueño. Nunca lanza por un dispositivo caído. */
export async function entregarAvisoAlumno(aviso: AvisoAlumno, deps: DepsAviso): Promise<Respuesta> {
  const { usuario, almacen, enviar } = deps
  const estado = deps.estado ?? estadoAvisos()
  const jobId = `aviso:${aviso.kind}`
  if (!deps.vapidLista) {
    await almacen.registrar([{ job_id: jobId, status: 'vapid_missing', error: 'VAPID keys not configured', title: aviso.title }])
    return { status: 503, json: { sent: 0, motivo: 'sin_configurar' } }
  }
  if (estado.repetidos.intentar(aviso.tag, deps.ahora) > 0) return { status: 200, json: { sent: 0, motivo: 'repetido' } }
  if (!estado.tope.permitir(deps.ahora)) {
    await almacen.registrar([{ job_id: jobId, status: 'failed', error: 'tope de avisos (6 cada 10 min)', title: aviso.title }])
    return { status: 429, json: { sent: 0, motivo: 'tope' } }
  }
  const subs = await almacen.deUsuario(usuario)
  if (subs.length === 0) {
    await almacen.registrar([{ job_id: jobId, status: 'no_subs', error: 'target has no push subscriptions', title: aviso.title }])
    return { status: 200, json: { sent: 0, motivo: 'sin_dispositivos' } }
  }
  const payload = JSON.stringify({ title: aviso.title, body: aviso.body, url: aviso.url, tag: aviso.tag, icon: '/icon-192.png' })
  const r = await entregar({ usuario, subs, payload, jobId, titulo: aviso.title, almacen, enviar })
  return { status: 200, json: { sent: r.enviadas, fallidas: r.fallidas, limpiadas: r.limpiadas } }
}

/** POST /api/notifications/send en la edición cliente: solo el daemon (su token), un aviso validado, al dueño. */
export async function rutaSendAlumno(opts: DepsAviso & { autorizacion: string | null; token: string | null | undefined; cuerpo: unknown }): Promise<Respuesta> {
  if (!bearerDelDaemon(opts.autorizacion, opts.token)) return { status: 401, json: { error: 'Unauthorized' } }
  const aviso = validarAviso(opts.cuerpo)
  if (!aviso) return { status: 400, json: { error: 'Aviso inválido' } }
  return entregarAvisoAlumno(aviso, opts)
}

// ── 3. Una respuesta larga terminó con la app cerrada (/api/chat/complete) ───────────────────────────────────────

/** Desde cuánto una respuesta es «larga»: la persona ya se fue a otra cosa. */
export const UMBRAL_RESPUESTA_LARGA_MS = 60_000

/**
 * ¿Avisar al teléfono que terminó este turno? Solo si nadie lo está viendo (el cliente no hizo ACK: la app está cerrada o
 * en segundo plano), duró al menos un minuto y no lo detuvo la persona. Sin `turnId` o sin duración medible, no.
 */
export function debeAvisarRespuesta(p: {
  turnId?: string | null; clientAcked?: boolean; startedAt?: number | null; durationMs?: unknown
  terminalStatus?: string | null; ahora?: number
}): boolean {
  if (!p.turnId || p.clientAcked === true || p.terminalStatus === 'interrupted') return false
  const ahora = p.ahora ?? Date.now()
  const duracion = typeof p.startedAt === 'number' && p.startedAt > 0 ? ahora - p.startedAt
    : typeof p.durationMs === 'number' && Number.isFinite(p.durationMs) ? p.durationMs : null
  return duracion !== null && duracion >= UMBRAL_RESPUESTA_LARGA_MS
}

/** El principio de la respuesta sin Markdown: lo que se lee en la pantalla bloqueada. */
export function vistaPrevia(texto: string, max = 140): string {
  const limpio = texto
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(\S[\s\S]*?\S|\S)\1/g, '$2')
    .replace(/\|/g, ' ')
  return lineaAviso(limpio, max)
}

export function avisoRespuestaLarga(p: { sessionId?: string | null; turnId: string; assistantMessage?: string | null; terminalStatus?: string | null }): AvisoAlumno {
  const url = p.sessionId && /^[A-Za-z0-9:_-]{1,128}$/.test(p.sessionId) ? `/chat?session=${encodeURIComponent(p.sessionId)}` : '/chat'
  const tag = `respuesta-${p.turnId.replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 120) || 'turno'}`
  if (p.terminalStatus === 'failed') {
    return { title: 'Tu respuesta se detuvo', body: 'Levy no pudo terminar. Abre la conversación para ver qué pasó y pedírselo de nuevo.', url, tag, kind: 'respuesta' }
  }
  return { title: 'Levy terminó tu respuesta', body: vistaPrevia(p.assistantMessage ?? '') || 'Ya está lista en tu conversación.', url, tag, kind: 'respuesta' }
}
