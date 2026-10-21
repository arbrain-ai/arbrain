import type { NextRequest } from 'next/server'
import { CORREO_LOCAL_CLIENTE, esEdicionCliente } from '@/lib/edicion'
import { instalacion } from '@/config'

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
  return isDesktopSecret(desktopCookie(request))
}

export function isLocalDesktopUserId(userId: string | null | undefined) {
  return userId === LOCAL_DESKTOP_USER_ID
}
