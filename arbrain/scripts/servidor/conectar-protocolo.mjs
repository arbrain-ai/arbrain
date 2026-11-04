/**
 * Tu Levy en el teléfono sin Tailscale · protocolo del túnel (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md).
 *
 * Lo comparten las dos puntas: el Arbrain de la persona (scripts/servidor/conectar.mjs, dentro del supervisor) y el
 * relay de Arbrain (arbrain/conectar/relay.mjs). El Arbrain abre UNA conexión WebSocket de salida al relay, con su
 * credencial; el relay le manda por ahí cada petición del teléfono y el Arbrain se la pasa a su web en 127.0.0.1.
 * Ningún puerto se abre en la computadora ni en el router.
 *
 * Mensajes de texto (JSON) para lo que es control y cabeceras; marcos binarios para los cuerpos:
 *   relay → Arbrain   {t:'peticion', id, metodo, ruta, cabeceras:[[k,v]…], cuerpo:bool}  + datos dir 0 + {t:'fin', id, dir:0}
 *                     {t:'cancelar', id}            el teléfono cerró antes de terminar
 *                     {t:'emparejar', id, secreto|codigo, agente}   un teléfono quiere entrar (QR o código)
 *                     {t:'pase', id}                «Abrir» desde otra máquina de la misma cuenta
 *                     {t:'latido'}                  cada LATIDO_MS; el Arbrain reconecta si pasan SILENCIO_MS sin nada
 *   Arbrain → relay   {t:'respuesta', id, estado, cabeceras} + datos dir 1 + {t:'fin', id, dir:1}
 *                     {t:'error', id, estado, mensaje}
 *                     {t:'emparejado', id, ok, pase?}   pase = boleto de un solo uso para /api/desktop/entrar
 * Trama binaria: [u32 id][u8 dir][bytes].
 *
 * Inspirado en el diseño de Cloudroom Connect (cloudroom.run, Apache-2.0: un relay que sostiene el túnel saliente de
 * cada máquina y sesiones por teléfono en el borde). Código propio, no copiado. Puro: sin red ni disco.
 */
import { randomBytes } from 'node:crypto'

export const VERSION_PROTOCOLO = 1
export const RUTA_TUNEL = '/_conectar/tunel'
export const PREFIJO_RELAY = '/_conectar/'
/** Cookie del relay: solo de su host (`__Host-`), nunca llega a la web de la persona. */
export const COOKIE_RELAY = '__Host-arbrain_conectar'
export const LATIDO_MS = 15_000
export const SILENCIO_MS = 45_000
/** 30 días, como la sesión de la web. */
export const SESION_MS = 30 * 24 * 60 * 60_000
export const DIR_PETICION = 0
export const DIR_RESPUESTA = 1

// ── Identificadores ─────────────────────────────────────────────────────────────────────────────────────────────

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** Nombre corto de la máquina en el relay: 12 letras base32 (60 bits), p. ej. `k3vq7m2a9xwe`. */
export function handleNuevo(bytes = randomBytes(12)) {
  let s = ''
  for (let i = 0; i < 12; i++) s += B32[bytes[i] & 31]
  return s
}
export const handleValido = (h) => typeof h === 'string' && /^[a-z2-7]{12}$/.test(h)

/** Secreto de 32 bytes en base64url (credencial de máquina, sesión de teléfono, secreto del QR). */
export const secretoNuevo = () => randomBytes(32).toString('base64url')
export const secretoValido = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)

/** Dominio base del relay: nombre DNS en minúsculas con al menos dos etiquetas, o `localhost` (pruebas). */
export function baseValida(b) {
  if (typeof b !== 'string' || b.length > 200) return false
  if (b === 'localhost') return true
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(b)
}

/** Host público de una máquina: `<handle>.<base>`. */
export const hostDe = (handle, base) => `${handle}.${base}`

/** `<handle>.<base>[:puerto]` → handle, o null si el Host no es de una máquina de este relay. */
export function handleDeHost(host, base) {
  if (typeof host !== 'string') return null
  const h = host.trim().toLowerCase().replace(/:\d{1,5}$/, '')
  if (!h.endsWith(`.${base}`)) return null
  const pre = h.slice(0, -(base.length + 1))
  return handleValido(pre) ? pre : null
}

// ── Tramas binarias ─────────────────────────────────────────────────────────────────────────────────────────────

export function marcoDatos(id, dir, datos) {
  const d = Buffer.isBuffer(datos) ? datos : Buffer.from(datos)
  const b = Buffer.allocUnsafe(5 + d.length)
  b.writeUInt32BE(id >>> 0, 0)
  b.writeUInt8(dir, 4)
  d.copy(b, 5)
  return b
}

export function leerMarco(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 5) return null
  return { id: b.readUInt32BE(0), dir: b.readUInt8(4), datos: b.subarray(5) }
}

// ── Cabeceras ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Por salto (RFC 9110 §7.6.1) y las que no deben cruzar el túnel. */
const SALTO = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'host', 'expect',
  'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol', 'http2-settings'])

/** Las que pone quien está en medio: el teléfono no puede inventarlas, el Arbrain pone las suyas. */
const DE_INTERMEDIARIO = /^(x-forwarded-|x-real-ip$|forwarded$|cf-|true-client-ip$|x-arbrain-|x-client-ip$|via$)/

/** Quita una cookie de un encabezado `Cookie` (o null si no queda ninguna). */
export function quitarCookie(valor, nombre) {
  if (typeof valor !== 'string') return null
  const resto = valor.split(';').map((p) => p.trim()).filter((p) => p && (p.includes('=') ? p.slice(0, p.indexOf('=')).trim() : p) !== nombre)
  return resto.length ? resto.join('; ') : null
}

/** Pares [k, v] de `rawHeaders` de Node (conserva repetidos, como varios Set-Cookie). */
export function pares(raw) {
  const o = []
  for (let i = 0; i + 1 < raw.length; i += 2) o.push([String(raw[i]), String(raw[i + 1])])
  return o
}

/** Cabeceras del teléfono que el relay manda por el túnel: sin las de salto, sin las de intermediario ni su cookie. */
export function cabecerasDelTelefono(lista) {
  const o = []
  for (const [k, v] of lista) {
    const n = k.toLowerCase()
    if (SALTO.has(n) || DE_INTERMEDIARIO.test(n)) continue
    if (n === 'cookie') { const c = quitarCookie(v, COOKIE_RELAY); if (c) o.push(['cookie', c]); continue }
    o.push([k, v])
  }
  return o
}

/**
 * Lo que el Arbrain le pasa a su web: lo del relay (ya filtrado, se vuelve a filtrar aquí: el Arbrain no confía en el
 * relay para esto) más su propio Host público y `X-Forwarded-Proto: https`, que es lo que la web exige para aceptar
 * ese Host (features/telefono/host-telefono.ts). `X-Arbrain-Conectar: 1` marca que llegó por el túnel.
 */
export function cabecerasHaciaLaWeb(lista, host) {
  const o = cabecerasDelTelefono(Array.isArray(lista) ? lista.filter((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string') : [])
  return [...o, ['host', host], ['x-forwarded-proto', 'https'], ['x-arbrain-conectar', '1']]
}

/** Cabeceras de la web hacia el teléfono: sin las de salto y sin ningún Set-Cookie que toque la cookie del relay. */
export function cabecerasHaciaElTelefono(lista) {
  const o = []
  for (const [k, v] of lista) {
    const n = k.toLowerCase()
    if (SALTO.has(n)) continue
    if (n === 'set-cookie' && v.trim().startsWith(`${COOKIE_RELAY}=`)) continue
    o.push([k, v])
  }
  return o
}

/** Ruta de origen (`/x?y`), sin forma absoluta ni caracteres de control. */
export const rutaValida = (r) => typeof r === 'string' && r.length <= 8192 && r.startsWith('/') && !r.startsWith('//') && !/[\s\u0000-\u001f\u007f]/.test(r)

export const METODOS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/** Etiqueta legible del navegador del teléfono para la lista de sesiones («iPhone · Safari»). */
export function etiquetaAgente(ua) {
  const s = String(ua ?? '')
  const equipo = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Macintosh|Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'Navegador'
  const nav = /EdgA?\//.test(s) ? 'Edge' : /CriOS|Chrome\//.test(s) && !/Edg/.test(s) ? 'Chrome' : /FxiOS|Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : ''
  return nav ? `${equipo} · ${nav}` : equipo
}
