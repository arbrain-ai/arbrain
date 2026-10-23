/**
 * Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1): qué Host acepta la web
 * además del de loopback. Puro (sin node:*): lo usan el proxy, rutas y pruebas.
 *
 * `npm run servidor -- telefono encender` (scripts/servidor/telefono.mjs) publica la web con `tailscale serve` en
 * `https://<maquina>.<red>.ts.net`, SOLO dentro de la red privada de Tailscale de la persona. Tailscale reenvía a
 * 127.0.0.1:<puerto> conservando el Host y poniendo `X-Forwarded-Proto: https`. El supervisor le pasa a la web
 * `ARBRAIN_TELEFONO_HOST` (y `ARBRAIN_TELEFONO_PUERTO`) solo mientras el teléfono está encendido; sin esas variables,
 * fuera del modo servidor o en la instalación original, nada de esto acepta nada.
 */
import { esEdicionCliente } from '@/lib/edicion'
import { esModoServidor } from '@/lib/modo-servidor'

type Env = Record<string, string | undefined>

/** Nombre MagicDNS: etiquetas DNS en minúsculas terminadas en `.ts.net` (misma regla que telefono.mjs › hostValido). */
export function hostTelefonoValido(h: string | null | undefined): h is string {
  return typeof h === 'string' && h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(h)
}

/** El Host del teléfono si está encendido (o null). */
export function hostTelefono(env: Env = process.env): string | null {
  if (!esEdicionCliente(env) || !esModoServidor(env)) return null
  const h = (env.ARBRAIN_TELEFONO_HOST ?? '').trim().toLowerCase()
  return hostTelefonoValido(h) ? h : null
}

/** ¿Este encabezado Host es el del teléfono encendido? Acepta `host` y `host:<puerto HTTPS publicado>`. */
export function esHostTelefono(host: string | null | undefined, env: Env = process.env): boolean {
  const propio = hostTelefono(env)
  if (!propio || !host) return false
  const h = host.trim().toLowerCase()
  if (h === propio) return true
  const puerto = (env.ARBRAIN_TELEFONO_PUERTO ?? '443').trim()
  return h === `${propio}:${/^\d{1,5}$/.test(puerto) ? puerto : '443'}`
}

/**
 * ¿La petición llegó por el teléfono? Host del teléfono Y `X-Forwarded-Proto: https` (lo pone `tailscale serve`; una
 * petición local en claro con ese Host no cuenta).
 */
export function llegaPorTelefono(host: string | null | undefined, protoReenviado: string | null | undefined, env: Env = process.env): boolean {
  return esHostTelefono(host, env) && (protoReenviado ?? '').split(',')[0]!.trim().toLowerCase() === 'https'
}
