/**
 * Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1): qué Host acepta la web
 * además del de loopback. Puro (sin node:*): lo usan el proxy, rutas y pruebas.
 *
 * `npm run servidor -- telefono encender` (scripts/servidor/telefono.mjs) publica la web con `tailscale serve` en
 * `https://<maquina>.<red>.ts.net`, SOLO dentro de la red privada de Tailscale de la persona. Tailscale reenvía a
 * 127.0.0.1:<puerto> conservando el Host y poniendo `X-Forwarded-Proto: https`. El supervisor le pasa a la web
 * `ARBRAIN_TELEFONO_HOST` (y `ARBRAIN_TELEFONO_PUERTO`) solo mientras el teléfono está encendido; sin esas variables,
 * fuera del modo servidor o en la instalación original, nada de esto acepta nada.
 *
 * Sin Tailscale (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md): `npm run servidor -- conectar encender`
 * (scripts/servidor/conectar.mjs) abre un túnel de salida al relay de Arbrain y la máquina queda en
 * `https://<handle>.<relay>`. El túnel le entrega cada petición a la web con ese Host y `X-Forwarded-Proto: https`; el
 * supervisor le pasa `ARBRAIN_CONECTAR_HOST` solo encendido. Para la web es «el teléfono» igual que el de Tailscale:
 * mismo candado (su sesión), misma cookie Secure. El relay pone el suyo antes: sin su sesión, ni llega aquí.
 */
import { esEdicionCliente } from '@/lib/edicion'
import { esModoServidor } from '@/lib/modo-servidor'

type Env = Record<string, string | undefined>

/** Nombre MagicDNS: etiquetas DNS en minúsculas terminadas en `.ts.net` (misma regla que telefono.mjs › hostValido). */
export function hostTelefonoValido(h: string | null | undefined): h is string {
  return typeof h === 'string' && h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(h)
}

/** Nombre DNS del relay: `<12 letras base32>.<dominio>` en minúsculas (misma regla que conectar-protocolo.mjs). */
export function hostConectarValido(h: string | null | undefined): h is string {
  return typeof h === 'string' && h.length <= 253 && /^[a-z2-7]{12}\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(h)
}

/** El Host público del túnel al relay si está encendido (o null). */
export function hostConectar(env: Env = process.env): string | null {
  if (!esEdicionCliente(env) || !esModoServidor(env)) return null
  const h = (env.ARBRAIN_CONECTAR_HOST ?? '').trim().toLowerCase()
  return hostConectarValido(h) ? h : null
}

/** El Host del teléfono si está encendido (o null). */
export function hostTelefono(env: Env = process.env): string | null {
  if (!esEdicionCliente(env) || !esModoServidor(env)) return null
  const h = (env.ARBRAIN_TELEFONO_HOST ?? '').trim().toLowerCase()
  return hostTelefonoValido(h) ? h : null
}

/** ¿Este encabezado Host es el del teléfono encendido? Acepta `host` y `host:<puerto HTTPS publicado>`. */
export function esHostTelefono(host: string | null | undefined, env: Env = process.env): boolean {
  if (!host) return false
  const h = host.trim().toLowerCase()
  const relay = hostConectar(env)
  if (relay && h === relay) return true
  const propio = hostTelefono(env)
  if (!propio) return false
  if (h === propio) return true
  const puerto = (env.ARBRAIN_TELEFONO_PUERTO ?? '443').trim()
  return h === `${propio}:${/^\d{1,5}$/.test(puerto) ? puerto : '443'}`
}

/**
 * ¿La petición llegó por el teléfono? Host del teléfono Y `X-Forwarded-Proto: https` (lo pone `tailscale serve`, o el
 * túnel del relay; una petición local en claro con ese Host no cuenta).
 */
export function llegaPorTelefono(host: string | null | undefined, protoReenviado: string | null | undefined, env: Env = process.env): boolean {
  return esHostTelefono(host, env) && (protoReenviado ?? '').split(',')[0]!.trim().toLowerCase() === 'https'
}
