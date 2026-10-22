import type { NextRequest } from 'next/server'
import { CORREO_LOCAL_CLIENTE, esEdicionCliente } from '@/lib/edicion'
import { instalacion } from '@/config'
import { esModoServidor } from '@/lib/modo-servidor'
import { hmacSha256Hex } from '@/lib/sha256-puro'

export const LOCAL_DESKTOP_USER_ID = '00000000-0000-4000-8000-000000000001'
/** Correo de la persona dueña de esta instalación. En la edición cliente, uno genérico: nunca el de Daniel. */
export const LOCAL_DESKTOP_EMAIL = esEdicionCliente() ? CORREO_LOCAL_CLIENTE : instalacion().correoDueno

export function isLocalHostname(hostname: string | null | undefined) {
  if (!hostname) return false
  const normalized = hostname
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function hostnameFromHostHeader(host: string | null) {
  if (!host) return null
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']'))
  return host.split(':')[0] ?? null
}

function hostnameFromRequest(request: Request | NextRequest) {
  if ('nextUrl' in request) return request.nextUrl.hostname
  try {
    return new URL(request.url).hostname
  } catch {
    return hostnameFromHostHeader(request.headers.get('host'))
  }
}

/**
 * Edición para clientes (seguridad, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09/AUDITORIA.md, I5).
 * La app de escritorio la fija al lanzar su servidor (`ARBRAIN_EDICION=cliente`). En la instalación de Daniel no existe.
 */
export function isClientEdition(env: Record<string, string | undefined> = process.env) {
  return esEdicionCliente(env)
}

/** Cookie HttpOnly que la app recibe en su primera carga (`/api/desktop/sesion`) a cambio del secreto por instalación. */
export const DESKTOP_SESSION_COOKIE = 'arbrain_escritorio'

/** Comparación en tiempo constante (sin node:crypto: el proxy también la usa). */
export function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** ¿Este valor es el secreto por instalación que la app le pasó a su servidor? Sin secreto configurado: nunca. */
export function isDesktopSecret(value: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  const secret = env.ARBRAIN_DESKTOP_SECRET ?? ''
  return secret.length >= 32 && typeof value === 'string' && sameSecret(value, secret)
}

/**
 * Modo servidor (seguridad noche 21→22 oct 2026, M2 del reporte v0.2.1): antes la cookie ERA la contraseña, en claro, por
 * 30 días y sin forma de cerrar las sesiones. Ahora es un token derivado: `s1.` + HMAC-SHA256(contraseña,
 * «arbrain-sesion-servidor:<generación>»). Leer la cookie ya no da la contraseña; cambiar la contraseña o subir la
 * generación (`npm run servidor -- cerrar-sesiones`) cierra todas las sesiones abiertas. La app de escritorio no cambia:
 * su cookie sigue siendo el secreto por apertura, sin Max-Age.
 */
let derivada: { clave: string; token: string } | null = null
export function tokenSesionServidor(env: Record<string, string | undefined> = process.env): string | null {
  const secreto = env.ARBRAIN_DESKTOP_SECRET ?? ''
  if (secreto.length < 32) return null
  const generacion = /^\d{1,9}$/.test((env.ARBRAIN_SESION_GENERACION ?? '').trim()) ? (env.ARBRAIN_SESION_GENERACION ?? '').trim() : '0'
  const clave = `${generacion}\0${secreto}`
  if (derivada?.clave !== clave) derivada = { clave, token: `s1.${hmacSha256Hex(secreto, `arbrain-sesion-servidor:${generacion}`)}` }
  return derivada.token
}

/** ¿Este valor de cookie abre sesión? Modo servidor: el token derivado. App de escritorio: el secreto por apertura. */
export function esCookieDeSesion(value: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!esModoServidor(env)) return isDesktopSecret(value, env)
  const token = tokenSesionServidor(env)
  return !!token && typeof value === 'string' && sameSecret(value, token)
}

export function cookieFromHeader(header: string | null | undefined, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

function desktopCookie(request: Request | NextRequest) {
  if ('cookies' in request && typeof request.cookies?.get === 'function') return request.cookies.get(DESKTOP_SESSION_COOKIE)?.value
  return cookieFromHeader(request.headers.get('cookie'), DESKTOP_SESSION_COOKIE)
}

/**
 * ¿La petición viene de la app de escritorio? El `Host` lo controla quien manda la petición: en la edición cliente
 * además se exige la cookie con el secreto por instalación. En la instalación de Daniel el criterio no cambia.
 */
export function isDesktopAuthBypassRequest(request: Request | NextRequest) {
  if (process.env.MISSION_CONTROL_DESKTOP_EMBED !== '1' || !isLocalHostname(hostnameFromRequest(request))) return false
  if (!isClientEdition()) return true
  return esCookieDeSesion(desktopCookie(request))
}

export function isLocalDesktopUserId(userId: string | null | undefined) {
  return userId === LOCAL_DESKTOP_USER_ID
}
