/**
 * Proxy de la edición cliente (empaquetado, 11 oct 2026; docs/builds/empaquetado-2026-10-11/MAPA-WEB.md).
 *
 * Sin Supabase: nunca crea un cliente de Auth. La sesión es la cookie del secreto por instalación que la app de
 * escritorio fija en `/api/desktop/sesion` (AUDITORIA I5).
 *   - API fuera de la lista blanca → 404 (el negocio de Daniel no existe en esta edición).
 *   - API sin sesión → 401, salvo `/api/desktop/*` (canje del secreto), `/api/chat/complete` (Bearer del daemon) y
 *     `/api/llaves/openrouter/callback` (v1.1: el regreso de OpenRouter llega al navegador del sistema, sin la cookie;
 *     solo canjea con un `state` vigente de un solo uso que nació con sesión en `/api/llaves/openrouter/iniciar`).
 *   - El Levy del alumno dibuja en su lienzo con el Bearer del daemon: en `/api/canvas/*` ese Bearer, comparado aquí en
 *     tiempo constante, vale como sesión (sin él, ni `canvas/compile` responde).
 *   - Página sin sesión → `/sin-sesion` («abre Arbrain desde la app»).
 *   - Página fuera de la lista blanca, o de login → `/chat`.
 *   - Archivos estáticos (con extensión) pasan: son los de `public/` del paquete.
 *
 * Modo servidor (`npm run servidor`, 21 oct 2026; docs/builds/modo-servidor-2026-10-21/REPORTE.md): mismas reglas. La
 * sesión es la misma cookie, que se obtiene en `/api/desktop/entrar` (pase de un solo uso del supervisor o la
 * contraseña de la persona) y `/sin-sesion` muestra el formulario de entrada. Sigue solo en loopback (`hostDeLaApp`).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { isDesktopAuthBypassRequest, sameSecret } from '@/lib/desktop-auth'
import { apiPermitidaEnCliente, paginaPermitidaEnCliente } from '@/lib/edicion'
import { esModoServidor } from '@/lib/modo-servidor'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'

// `/api/mi-marca`: colores, logo y nombre del dueño (lib/mi-marca.ts), sin datos; la pantalla de entrada también los lleva.
// `/api/chat/archivo/f`: un archivo del chat por su enlace firmado (T6, 29 oct 2026); la firma es la sesión de ese archivo.
const SIN_SESION_API = ['/api/desktop', '/api/chat/complete', '/api/llaves/openrouter/callback', '/api/mi-marca', '/api/chat/archivo/f']
const NO_DISPONIBLE = 'No disponible en esta edición.'
const NOCACHE = { 'Cache-Control': 'no-store' }

const empieza = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(`${prefijo}/`)

export type DecisionProxy =
  | { tipo: 'pasa' }
  | { tipo: 'json'; status: 401 | 404; error: string }
  | { tipo: 'redirige'; a: string }

/** Regla pura (probada en tests/edicion): qué hacer con una ruta según haya o no sesión de la app. */
export function decidirCliente(ruta: string, conSesion: boolean, modoServidor = esModoServidor()): DecisionProxy {
  if (ruta.startsWith('/api/')) {
    if (!apiPermitidaEnCliente(ruta)) return { tipo: 'json', status: 404, error: NO_DISPONIBLE }
    if (SIN_SESION_API.some((p) => empieza(ruta, p))) return { tipo: 'pasa' }
    if (conSesion) return { tipo: 'pasa' }
    return { tipo: 'json', status: 401, error: modoServidor ? 'Tu sesión venció. Recarga la página y entra con tu contraseña.' : 'Abre Arbrain desde la app.' }
  }
  if (empieza(ruta, '/sin-sesion')) return conSesion ? { tipo: 'redirige', a: '/chat' } : { tipo: 'pasa' }
  // Archivos de public/ (manual, fuentes, caras de Levy): sin datos, pasan.
  if (/\.[a-z0-9]{1,8}$/i.test(ruta)) return { tipo: 'pasa' }
  if (!conSesion) return { tipo: 'redirige', a: '/sin-sesion' }
  if (!paginaPermitidaEnCliente(ruta)) return { tipo: 'redirige', a: '/chat' }
  return { tipo: 'pasa' }
}

const CON_BEARER = ['/api/canvas']

/**
 * ¿Trae el Bearer del daemon o el pase de agente? Solo cuenta en las rutas de CON_BEARER. Contrato v2 (§2.1): los
 * agentes ya no tienen el token del daemon (el CLI los limpia de su entorno); dibujan con `ARBRAIN_PASE_AGENTE`, que la
 * app le da a la web y al daemon por stdin.
 */
export function bearerDelDaemon(ruta: string, autorizacion: string | null, token = process.env.OPENCLAW_GATEWAY_TOKEN ?? '', pase = process.env.ARBRAIN_PASE_AGENTE ?? ''): boolean {
  if (!CON_BEARER.some((p) => empieza(ruta, p)) || !autorizacion?.startsWith('Bearer ')) return false
  const dado = autorizacion.slice(7).trim()
  return [token, pase].some((t) => t.length >= 32 && sameSecret(dado, t))
}

/**
 * Seguridad del alumno (12 oct 2026), punto 6: DNS rebinding. La web del alumno solo escucha en 127.0.0.1 y solo atiende
 * peticiones cuyo `Host` es loopback (`127.0.0.1`, `localhost`, `[::1]`, con cualquier puerto). Una página de internet
 * cuyo dominio pasa a resolver a 127.0.0.1 manda su propio nombre en `Host` y recibe 421 antes de llegar a ninguna
 * ruta (ni a las que no piden sesión: el canje del secreto, el regreso de OpenRouter, `chat/complete`). Pura.
 */
export function hostDeLaApp(host: string | null): boolean {
  if (host === null) return true
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i.test(host.trim())
}

const SIN_EFECTO = ['GET', 'HEAD', 'OPTIONS']

/**
 * Seguridad v0.2.2 (A2 de docs/builds/seguridad-v021-2026-10-21/REPORTE.md): CSRF entre puertos de 127.0.0.1. La cookie
 * es SameSite=Strict, pero los puertos no separan sitios: una página en `127.0.0.1:8000` era «el mismo sitio» que la web
 * en `127.0.0.1:4399` y su POST `text/plain` (sin preflight) llegaba con la cookie. Toda escritura de `/api/` sin Bearer
 * exige que `Origin`, si viene, sea exactamente `protocolo//host` (también rechaza `null`) y que `Sec-Fetch-Site`, si
 * viene, sea `same-origin` o `none`. Un Bearer no lo puede poner otra página sin preflight, y los procesos locales
 * (daemon, supervisor) no mandan Origin ni Sec-Fetch-Site. Pura (probada en tests/servidor/origen-escritura.test.ts).
 */
export function escrituraDeOtroOrigen(metodo: string, ruta: string, cab: {
  origin: string | null; secFetchSite: string | null; authorization: string | null; host: string | null
}, protocolo: string): boolean {
  if (!ruta.startsWith('/api/') || SIN_EFECTO.includes(metodo.toUpperCase())) return false
  if (cab.authorization?.startsWith('Bearer ')) return false
  const esperado = `${protocolo}//${cab.host ?? ''}`
  if (cab.origin !== null && cab.origin !== esperado) return true
  if (cab.secFetchSite !== null && cab.secFetchSite !== 'same-origin' && cab.secFetchSite !== 'none') return true
  return false
}

/**
 * Solo en modo servidor: ahí la cookie vive en el navegador de todos los días de la persona, donde corren otras páginas
 * locales. En la app de escritorio la cookie vive en el almacén propio del webview de Tauri (las ventanas cargan
 * `WebviewUrl::External(http://127.0.0.1:<puerto>/…)`, lib.rs `create_main_window` y ventanas.rs), al que ninguna página
 * del navegador llega; su Origin ya sería el mismo, pero sin probarla con `desktop:install` no se le cambia nada.
 */
export function proxyCliente(request: NextRequest) {
  // Teléfono (23 oct 2026): además del loopback, el Host *.ts.net de esta máquina, solo encendido y solo por HTTPS de
  // `tailscale serve` (features/telefono/host-telefono.ts). Apagado, ese Host recibe 421 como cualquier otro.
  const telefono = llegaPorTelefono(request.headers.get('host'), request.headers.get('x-forwarded-proto'))
  if (!telefono && !hostDeLaApp(request.headers.get('host'))) return NextResponse.json({ error: 'Host no permitido.' }, { status: 421, headers: NOCACHE })
  const ruta = request.nextUrl.pathname
  if (esModoServidor() && escrituraDeOtroOrigen(request.method, ruta, {
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    authorization: request.headers.get('authorization'),
    host: request.headers.get('host'),
  }, telefono ? 'https:' : request.nextUrl.protocol)) return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 403, headers: NOCACHE })
  const conSesion = isDesktopAuthBypassRequest(request) || bearerDelDaemon(ruta, request.headers.get('authorization'))
  const decision = decidirCliente(ruta, conSesion)
  if (decision.tipo === 'pasa') return NextResponse.next({ request })
  if (decision.tipo === 'json') return NextResponse.json({ error: decision.error }, { status: decision.status, headers: NOCACHE })
  const url = new URL(decision.a, request.url)
  return NextResponse.redirect(url)
}
