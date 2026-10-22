/**
 * Modo servidor (21 oct 2026; docs/builds/modo-servidor-2026-10-21/REPORTE.md). La edición cliente corriendo desde el
 * código con `npm run servidor` (`scripts/servidor.mjs`), sin la app de escritorio: el supervisor hace el papel de
 * Tauri y la persona entra por su navegador.
 *
 *   - Servidor: `ARBRAIN_MODO_SERVIDOR=1` (lo fija el supervisor al lanzar Next) y `ARBRAIN_SERVIDOR_CONTROL`
 *     (`http://127.0.0.1:<puerto>`, el control local del supervisor: pases de entrada y llaves).
 *   - Navegador: `NEXT_PUBLIC_ARBRAIN_MODO_SERVIDOR=1`, horneado al compilar con `npm run servidor`. La app de escritorio y
 *     la instalación de Daniel se compilan sin él: para ellas nada cambia.
 *
 * Sesión: la misma cookie de la app (`arbrain_escritorio`). En modo servidor `ARBRAIN_DESKTOP_SECRET` es la contraseña de
 * la persona (persistente en su carpeta de datos) y la cookie, que dura 30 días, lleva un token DERIVADO de ella
 * (`tokenSesionServidor` en desktop-auth.ts, M2 de la noche de seguridad 21→22 oct), nunca la contraseña.
 * Puro (sin node:*): lo importan rutas, la página de entrada y pruebas.
 */
import { esEdicionCliente } from './edicion'

type Env = Record<string, string | undefined>

/** Horneado al construir (referencia literal para que Next la reemplace en el bundle del navegador). */
const HORNEADO = (process.env.NEXT_PUBLIC_ARBRAIN_MODO_SERVIDOR ?? '').trim()

/** ¿Esta web corre en modo servidor? Solo existe dentro de la edición cliente. */
export function esModoServidor(env: Env = process.env): boolean {
  if (!esEdicionCliente(env)) return false
  return HORNEADO === '1' || (env.ARBRAIN_MODO_SERVIDOR ?? '').trim() === '1'
}

/** URL del control del supervisor, solo si es loopback literal (nunca se manda el token a otro lado). */
export function urlControl(env: Env = process.env): string | null {
  const u = (env.ARBRAIN_SERVIDOR_CONTROL ?? '').trim()
  return /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(u) ? u : null
}

export const DURACION_SESION_S = 30 * 24 * 60 * 60

/** Cookie de sesión del modo servidor: HttpOnly, SameSite=Strict, 30 días, solo esta web (host-only). */
export function cookieSesion(nombre: string, valor: string): string {
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACION_SESION_S}`
}

/** Pase de un solo uso que da el supervisor al abrir el navegador: 64 hex. */
export const paseValido = (p: string | null | undefined): p is string => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p)

/**
 * Freno contra adivinar la contraseña (en memoria, por proceso): 10 intentos fallidos por minuto y luego 429 hasta
 * que pase el minuto. Con ~158 bits de contraseña es cinturón y tirantes. `ahora` para pruebas.
 */
export function crearFreno(maximo = 10, ventanaMs = 60_000) {
  let fallos: number[] = []
  return {
    bloqueado(ahora = Date.now()) {
      fallos = fallos.filter((t) => ahora - t < ventanaMs)
      return fallos.length >= maximo
    },
    fallo(ahora = Date.now()) { fallos.push(ahora) },
  }
}

/**
 * ¿Puede este POST de `/api/desktop/entrar` intentar la contraseña? Sin Origin (curl, navegadores viejos) sí; con Origin,
 * solo si su host es el de esta web. `Origin: null` (iframe con sandbox, `data:`, un HTML abierto como archivo) no
 * (v0.2.2, Bajo 1): antes pasaba y cualquier página podía quemar los 10 intentos por minuto y dejar fuera a la persona.
 * El formulario legítimo vive en /sin-sesion, que sirve `Referrer-Policy: strict-origin-when-cross-origin`, así que el
 * navegador manda su Origin real y no `null`.
 */
export function origenDeEntrada(origen: string | null, host: string | null): boolean {
  if (origen === null || origen === '') return true
  if (origen === 'null') return false
  try { return new URL(origen).host === host } catch { return false }
}

/** Comandos de la app de escritorio que el modo servidor atiende por HTTP (puente de features/primer-arranque/lib/llaves.ts). */
export const COMANDOS_SERVIDOR = ['llaves_estado', 'llave_guardar', 'llave_borrar', 'daemon_estado', 'daemon_reiniciar'] as const
export type ComandoServidor = (typeof COMANDOS_SERVIDOR)[number]

/** Ruta del control del supervisor para cada comando (`/api/llaves/servidor/<accion>` la reenvía). */
export const ACCIONES: Record<string, { metodo: 'GET' | 'POST'; control: string }> = {
  estado: { metodo: 'GET', control: '/llaves' },
  guardar: { metodo: 'POST', control: '/llaves/guardar' },
  borrar: { metodo: 'POST', control: '/llaves/borrar' },
  daemon: { metodo: 'GET', control: '/daemon' },
  reiniciar: { metodo: 'POST', control: '/daemon/reiniciar' },
}

export const ACCION_DE_COMANDO: Record<ComandoServidor, string> = {
  llaves_estado: 'estado',
  llave_guardar: 'guardar',
  llave_borrar: 'borrar',
  daemon_estado: 'daemon',
  daemon_reiniciar: 'reiniciar',
}
