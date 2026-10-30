/**
 * «Conectar con OpenRouter» en un clic (empaquetado v1.1, 12 oct 2026; A/B del primer arranque › EL gap).
 * Flujo OAuth PKCE oficial de OpenRouter (openrouter.ai/docs/use-cases/oauth-pkce):
 *   1. La app pide `iniciar`: aquí nacen `state` (un solo uso) y `code_verifier`, que viven SOLO en la memoria de este
 *      proceso de Next, 10 minutos. Sale la URL `https://openrouter.ai/auth?callback_url=…&code_challenge=…&
 *      code_challenge_method=S256&state=…`, que la app abre en el navegador del sistema.
 *   2. OpenRouter vuelve al navegador con `?code=…&state=…` a `http://127.0.0.1:<puerto>/api/llaves/openrouter/callback`.
 *      `callback` valida el `state` (vigente, de un solo uso: el segundo intento se rechaza), canjea el código desde
 *      aquí (`POST https://openrouter.ai/api/v1/auth/keys` con `code`, `code_verifier` y `code_challenge_method`) y
 *      guarda la llave en memoria. La página del navegador nunca ve la llave.
 *   3. La ventana de la app sondea `recoger(state)` (con su sesión) y recibe la llave UNA vez: en ese momento se borra
 *      de aquí. La app la guarda en el llavero con `llave_guardar`.
 * La llave nunca va a logs, a disco ni a una URL: este módulo no escribe nada en consola ni en archivos, y los errores
 * que devuelve son códigos y textos fijos (nunca el cuerpo de la respuesta de OpenRouter).
 *
 * Solo servidor. Fábrica pura con reloj y fetch inyectables para las pruebas; `flujoOpenRouter()` es el único de verdad.
 */
import { createHash, randomBytes } from 'node:crypto'

export const OPENROUTER_AUTH = 'https://openrouter.ai/auth'
export const OPENROUTER_CANJE = 'https://openrouter.ai/api/v1/auth/keys'
export const RUTA_CALLBACK = '/api/llaves/openrouter/callback'
/** Lo que dura un intento (lo mismo que el código de OpenRouter: «expires after 10 minutes»). */
export const VIGENCIA_MS = 10 * 60_000
/** Intentos vigentes a la vez; el más viejo cae si llega otro (nadie llena la memoria pulsando el botón). */
export const MAX_INTENTOS = 8

export type CodigoError = 'denegado' | 'codigo_invalido' | 'vencido' | 'sin_red' | 'respuesta_rara' | 'error'

type Intento =
  | { fase: 'esperando'; verifier: string; expira: number }
  | { fase: 'canjeando'; expira: number }
  | { fase: 'lista'; llave: string; expira: number }
  | { fase: 'error'; code: CodigoError; error: string; expira: number }

export type Recogida =
  | { estado: 'esperando' }
  | { estado: 'lista'; llave: string }
  | { estado: 'error'; code: CodigoError; error: string }
  | { estado: 'vencido' }

export type ResultadoCallback = { ok: true } | { ok: false; code: CodigoError | 'sin_state' | 'state_invalido'; mensaje: string }

const MENSAJES: Record<CodigoError, string> = {
  denegado: 'Cancelaste en OpenRouter o algo falló allá. Vuelve a pulsar «Conectar con OpenRouter» cuando quieras.',
  codigo_invalido: 'OpenRouter no aceptó la autorización (venció o ya se usó). Vuelve a pulsar «Conectar con OpenRouter».',
  vencido: 'Pasaron más de 10 minutos. Vuelve a pulsar «Conectar con OpenRouter».',
  sin_red: 'No pude hablar con OpenRouter. Revisa tu conexión a internet e inténtalo de nuevo.',
  respuesta_rara: 'OpenRouter respondió algo inesperado. Inténtalo de nuevo o usa «Otras formas».',
  error: 'Algo falló al conectar con OpenRouter. Inténtalo de nuevo o usa «Otras formas».',
}
export const mensajeError = (c: CodigoError) => MENSAJES[c]

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** S256 de RFC 7636: BASE64URL(SHA256(verifier)). */
export const desafio = (verifier: string) => b64url(createHash('sha256').update(verifier, 'ascii').digest())

/** Un `state` como lo emite `iniciar`: 43 caracteres base64url (32 bytes). Lo demás ni se busca. */
const FORMA_STATE = /^[A-Za-z0-9_-]{43}$/
const FORMA_LLAVE = /^sk-or-[A-Za-z0-9_-]{20,}$/

/**
 * `callback_url` en la IP literal de loopback (red team OAuth, M1). Con `localhost` el navegador prueba antes `[::1]`,
 * donde cualquier proceso local podía escuchar en el mismo puerto y quedarse con el `state` (y montar una página falsa).
 * La web solo escucha en 127.0.0.1, así que el regreso va ahí sin resolver nombres (RFC 8252 §7.3). OpenRouter lo
 * acepta: su OpenAPI (`/api/v1/auth/keys/code`, `callback_url`) dice «localhost/127.0.0.1 URLs on any port».
 */
export const HOST_CALLBACK = '127.0.0.1'
export function urlCallback(puerto: number): string {
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('Puerto inválido para el regreso de OpenRouter.')
  return `http://${HOST_CALLBACK}:${puerto}${RUTA_CALLBACK}`
}

/** Texto del regreso sin `state`: así vuelve OpenRouter cuando la persona dice «no» o algo falla allá (su doc). */
export const MENSAJE_SIN_STATE = 'Cancelaste o algo falló en OpenRouter. Vuelve a Arbrain e inténtalo de nuevo.'

export interface OpcionesFlujo { ahora?: () => number; fetch?: typeof fetch; aleatorio?: (n: number) => Buffer; plazoCanjeMs?: number }

export function crearFlujoOpenRouter(op: OpcionesFlujo = {}) {
  const ahora = op.ahora ?? Date.now
  const pedir = op.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const azar = op.aleatorio ?? randomBytes
  const intentos = new Map<string, Intento>()

  const limpiar = () => {
    const t = ahora()
    for (const [s, i] of intentos) if (i.expira <= t) intentos.delete(s)
  }

  /** Nace un intento. Devuelve la URL de OpenRouter (con el `code_challenge`, nunca el verifier) y su `state`. */
  function iniciar(puerto: number): { url: string; state: string; expira: number } {
    limpiar()
    while (intentos.size >= MAX_INTENTOS) intentos.delete(intentos.keys().next().value as string)
    const state = b64url(azar(32))
    const verifier = b64url(azar(48)) // 64 caracteres: dentro de 43-128 (RFC 7636)
    const expira = ahora() + VIGENCIA_MS
    intentos.set(state, { fase: 'esperando', verifier, expira })
    const u = new URL(OPENROUTER_AUTH)
    u.searchParams.set('callback_url', urlCallback(puerto))
    u.searchParams.set('code_challenge', desafio(verifier))
    u.searchParams.set('code_challenge_method', 'S256')
    u.searchParams.set('key_label', 'Arbrain')
    u.searchParams.set('state', state)
    return { url: u.toString(), state, expira }
  }

  /** Lo que llega al navegador del sistema. Sin `state` vigente no canjea nada. */
  async function callback(params: { code?: string | null; state?: string | null; error?: string | null }): Promise<ResultadoCallback> {
    limpiar()
    const state = params.state ?? ''
    if (!state) {
      // Red team OAuth, B2: OpenRouter NO devuelve `state` en una negativa («not returned when the user denies
      // access»). Si el regreso no trae código (negativa o error) y hay exactamente UN intento esperando, ese intento
      // termina como `denegado` y la ventana deja de esperar. Con varios no se toca ninguno; y sin `state` nunca se
      // canjea nada: un tercero, como mucho, cancela.
      if (!params.code) {
        const esperando = [...intentos].filter(([, i]) => i.fase === 'esperando')
        if (esperando.length === 1) {
          const [s, i] = esperando[0]
          intentos.set(s, { fase: 'error', code: 'denegado', error: MENSAJES.denegado, expira: i.expira })
          return { ok: false, code: 'denegado', mensaje: MENSAJE_SIN_STATE }
        }
      }
      return { ok: false, code: 'sin_state', mensaje: MENSAJE_SIN_STATE }
    }
    const intento = FORMA_STATE.test(state) ? intentos.get(state) : undefined
    if (!intento || intento.fase !== 'esperando') {
      return { ok: false, code: 'state_invalido', mensaje: 'Este enlace ya se usó o venció. Vuelve a Arbrain y pulsa «Conectar con OpenRouter».' }
    }
    // Un solo uso: desde aquí el state ya no sirve para otro regreso, pase lo que pase con el canje.
    const { verifier, expira } = intento
    const fallo = (code: CodigoError): ResultadoCallback => {
      intentos.set(state, { fase: 'error', code, error: MENSAJES[code], expira })
      return { ok: false, code, mensaje: MENSAJES[code] }
    }
    intentos.set(state, { fase: 'canjeando', expira })
    const code = params.code ?? ''
    if (params.error || !code) return fallo('denegado')
    if (code.length > 2048 || /\s/.test(code)) return fallo('codigo_invalido')
    let r: Response
    try {
      r = await pedir(OPENROUTER_CANJE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(op.plazoCanjeMs ?? 15_000),
      })
    } catch { return fallo('sin_red') }
    if (r.status === 400 || r.status === 401 || r.status === 403) return fallo('codigo_invalido')
    if (!r.ok) return fallo('error')
    const j = await r.json().catch(() => null) as { key?: unknown } | null
    const llave = typeof j?.key === 'string' ? j.key.trim() : ''
    if (!FORMA_LLAVE.test(llave)) return fallo('respuesta_rara')
    // Si nadie la recoge, se borra con el intento (a los 10 minutos de nacer, como mucho).
    intentos.set(state, { fase: 'lista', llave, expira })
    return { ok: true }
  }

  /** La ventana de la app pregunta. La llave sale UNA vez y en ese mismo instante se borra de aquí. */
  function recoger(state: string): Recogida {
    limpiar()
    const i = FORMA_STATE.test(state) ? intentos.get(state) : undefined
    if (!i) return { estado: 'vencido' }
    if (i.fase === 'esperando' || i.fase === 'canjeando') return { estado: 'esperando' }
    intentos.delete(state)
    if (i.fase === 'lista') return { estado: 'lista', llave: i.llave }
    return { estado: 'error', code: i.code, error: i.error }
  }

  /** «Cancelar» en la app: el intento muere y un regreso tardío ya no canjea nada. */
  function cancelar(state: string): void { intentos.delete(state) }

  return { iniciar, callback, recoger, cancelar, /** solo pruebas */ _vigentes: () => (limpiar(), intentos.size) }
}

export type FlujoOpenRouter = ReturnType<typeof crearFlujoOpenRouter>

const LLAVE_GLOBAL = Symbol.for('arbrain.openrouter.pkce')
/**
 * El flujo del proceso. En `globalThis`: cada ruta de Next es su propio bundle y el intento que nace en `iniciar`
 * tiene que verse en `callback` y en `estado`. Vive solo en memoria: reiniciar la web borra todo intento.
 */
export function flujoOpenRouter(): FlujoOpenRouter {
  const g = globalThis as unknown as Record<symbol, FlujoOpenRouter | undefined>
  return (g[LLAVE_GLOBAL] ??= crearFlujoOpenRouter())
}

/** Página que ve el navegador del sistema al volver. Sin la llave, sin scripts, sin recursos externos. */
export function paginaCallback(r: ResultadoCallback): string {
  const titulo = r.ok ? 'Listo, vuelve a Arbrain' : 'No se conectó'
  const texto = r.ok ? 'Tu cuenta de OpenRouter quedó conectada. Ya puedes cerrar esta pestaña y volver a la app.' : r.mensaje
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Arbrain · ${esc(titulo)}</title>
<style>html,body{margin:0;height:100%;background:#0a0a0f;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center}main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 10px}p{margin:0;color:#b4b4bd;font-size:15px;line-height:1.5}.s{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;font-size:26px;background:${r.ok ? 'rgba(52,211,153,.15);color:#34d399' : 'rgba(251,191,36,.15);color:#fbbf24'}}</style></head>
<body><main><div class="s" aria-hidden="true">${r.ok ? '&#10003;' : '!'}</div><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></main></body></html>`
}

/**
 * Cabeceras del regreso: no se guarda, no se enmarca, no filtra la URL (con el código) a nadie.
 * Red team OAuth, B1: `next.config.ts` pone las suyas a toda ruta y, en la respuesta real, ganaban sobre las de la
 * ruta. Por eso las estrictas se repiten allí en una regla posterior (`CABECERAS_CALLBACK_CONFIG`, la última gana) y
 * el humo las comprueba en la respuesta viva.
 */
export const CSP_CALLBACK = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
export const CABECERAS_CALLBACK: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': CSP_CALLBACK,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}
