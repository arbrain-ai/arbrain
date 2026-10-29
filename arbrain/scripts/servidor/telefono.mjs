/**
 * Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, nodo N1).
 *
 *   npm run servidor -- telefono encender | apagar | estado | codigo
 *
 * Camino: el teléfono y la computadora de la persona están en SU red privada de Tailscale (su cuenta, gratis en uso
 * personal). `tailscale serve` publica `https://<maquina>.<su-red>.ts.net` SOLO dentro de esa red y lo reenvía a la web
 * de Arbrain en 127.0.0.1:<puerto>. Arbrain sigue escuchando solo en 127.0.0.1: no se abre ningún puerto a internet y
 * nunca se usa `tailscale funnel` (que sí lo publicaría).
 *
 * Lo que cambia en la web, y solo con el teléfono encendido: el supervisor le pasa `ARBRAIN_TELEFONO_HOST` (el nombre
 * `*.ts.net` de esta máquina) y la web acepta ese Host además del de loopback, siempre que llegue con
 * `X-Forwarded-Proto: https` (lo pone `tailscale serve`). Apagado, ese Host recibe 421 como cualquier otro. Se entra
 * con la contraseña de siempre o con un código de un solo uso que da Ajustes en la computadora; la cookie lleva
 * `Secure` bajo HTTPS. Estado persistente: `<config>/telefono.json` (no es secreto).
 *
 * Aquí vive toda la lógica; `servidor.mjs` solo la despacha. Las funciones de interpretación son puras (las prueba
 * tests/servidor/telefono.test.ts) y las que corren `tailscale` reciben el binario por parámetro: en CI y en las
 * pruebas es `tailscale-falso.mjs`, que anota sus argumentos. Variables: `ARBRAIN_TAILSCALE` (ruta del binario, un
 * `.mjs` se corre con este Node) y `ARBRAIN_TAILSCALE_SOCKET` (socket de un tailscaled propio, p. ej. en modo userspace).
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export const PUERTOS_HTTPS = [443, 8443, 10000]
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
export const CODIGO_MS = 10 * 60_000

// ── Estado persistente ──────────────────────────────────────────────────────────────────────────────────────────

export const rutaEstado = (R) => join(R.config, 'telefono.json')

export function leerEstado(R) {
  try {
    const j = JSON.parse(readFileSync(rutaEstado(R), 'utf8'))
    if (j && typeof j === 'object' && j.encendido === true && hostValido(j.host) && PUERTOS_HTTPS.includes(j.puertoHttps)) return j
    return { encendido: false }
  } catch { return { encendido: false } }
}

export function guardarEstado(R, o) {
  const ruta = rutaEstado(R)
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(o, null, 1) + '\n', { mode: 0o600 })
  renameSync(tmp, ruta)
}

/** Nombre MagicDNS de Tailscale: etiquetas DNS en minúsculas que terminan en `.ts.net`. Nada más se acepta. */
export function hostValido(h) {
  return typeof h === 'string' && h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(h)
}

export const urlTelefono = (host, puertoHttps) => `https://${host}${puertoHttps === 443 ? '' : `:${puertoHttps}`}`

/** Lo que el supervisor agrega al entorno de la web: el Host permitido, solo con el teléfono encendido. */
export function entornoWeb(R) {
  const e = leerEstado(R)
  return e.encendido ? { ARBRAIN_TELEFONO_HOST: e.host, ARBRAIN_TELEFONO_PUERTO: String(e.puertoHttps) } : {}
}

// ── Binario de Tailscale ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Dónde está `tailscale` en este sistema (o null). `existe` y `env` son para pruebas.
 * @param {{ env?: Record<string, string | undefined>, plataforma?: string, existe?: (p: string) => boolean, node?: string }} [o]
 */
export function binarioTailscale({ env = process.env, plataforma = process.platform, existe = existsSync, node = process.execPath } = {}) {
  const socket = (env.ARBRAIN_TAILSCALE_SOCKET ?? '').trim()
  const pre = socket ? [`--socket=${socket}`] : []
  const explicito = (env.ARBRAIN_TAILSCALE ?? '').trim()
  if (explicito) {
    if (/\.m?js$/i.test(explicito)) return existe(explicito) ? { cmd: node, pre: [explicito, ...pre] } : null
    return existe(explicito) ? { cmd: explicito, pre } : null
  }
  const nombre = plataforma === 'win32' ? 'tailscale.exe' : 'tailscale'
  const clave = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const sep = plataforma === 'win32' ? ';' : plataforma === process.platform ? delimiter : ':'
  const enPath = String(env[clave] ?? '').split(sep).filter(Boolean).map((d) => join(d, nombre))
  const conocidos = plataforma === 'darwin'
    ? ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale']
    : plataforma === 'win32'
      ? [join(env.ProgramFiles || env.PROGRAMFILES || 'C:\\Program Files', 'Tailscale', 'tailscale.exe')]
      : ['/usr/bin/tailscale', '/usr/sbin/tailscale', '/usr/local/bin/tailscale']
  const cmd = [...enPath, ...conocidos].find((p) => existe(p))
  return cmd ? { cmd, pre } : null
}

/**
 * Corre `tailscale <args>` sin shell, con plazo. `alLinea(texto)` puede devolver true para cortarlo (por ejemplo al ver
 * el enlace para activar HTTPS: `tailscale serve` se queda esperando a que la persona lo active).
 */
export function correrTailscale(bin, args, { plazo = 20_000, alLinea } = {}) {
  return new Promise((ok) => {
    let salida = ''
    let cortado = false
    let hijo
    try { hijo = spawn(bin.cmd, [...bin.pre, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) } catch (e) {
      ok({ codigo: -1, salida: String(e?.message ?? e), cortado: false }); return
    }
    const fin = setTimeout(() => { cortado = true; try { hijo.kill() } catch { /* */ } }, plazo)
    const leer = (c) => {
      salida += c
      if (alLinea && !cortado && alLinea(salida)) { cortado = true; try { hijo.kill() } catch { /* */ } }
    }
    hijo.stdout.setEncoding('utf8'); hijo.stderr.setEncoding('utf8')
    hijo.stdout.on('data', leer); hijo.stderr.on('data', leer)
    hijo.on('error', (e) => { clearTimeout(fin); ok({ codigo: -1, salida: salida + String(e?.message ?? e), cortado }) })
    hijo.on('close', (codigo) => { clearTimeout(fin); ok({ codigo: codigo ?? -1, salida, cortado }) })
  })
}

// ── Interpretación (puro) ───────────────────────────────────────────────────────────────────────────────────────

const RE_ENLACE = /https:\/\/login\.tailscale\.com\/[^\s"']+/

/**
 * `tailscale status --json` → { estado, host, https, enlace }.
 *   listo          conectado, con nombre *.ts.net
 *   falta-sesion   NeedsLogin / NoState (nunca inició sesión o la sesión venció)
 *   apagado        Stopped (Tailscale instalado pero desconectado)
 *   arrancando     Starting
 *   sin-magicdns   conectado pero sin nombre *.ts.net (MagicDNS apagado en su red)
 */
export function interpretarStatus(texto) {
  let j
  try { j = typeof texto === 'string' ? JSON.parse(texto) : texto } catch { return { estado: 'ilegible' } }
  if (!j || typeof j !== 'object') return { estado: 'ilegible' }
  const b = String(j.BackendState ?? '')
  const enlace = typeof j.AuthURL === 'string' && RE_ENLACE.test(j.AuthURL) ? j.AuthURL : null
  if (b === 'NeedsLogin' || b === 'NoState' || b === 'NeedsMachineAuth') return { estado: b === 'NeedsMachineAuth' ? 'falta-aprobacion' : 'falta-sesion', enlace }
  if (b === 'Stopped') return { estado: 'apagado' }
  if (b === 'Starting') return { estado: 'arrancando' }
  if (b !== 'Running') return { estado: 'ilegible' }
  const host = String(j.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase()
  if (!hostValido(host)) return { estado: 'sin-magicdns' }
  const certs = Array.isArray(j.CertDomains) ? j.CertDomains.map((d) => String(d).toLowerCase()) : []
  const capHttps = !!(j.Self?.CapMap && Object.hasOwn(j.Self.CapMap, 'https')) || (Array.isArray(j.Self?.Capabilities) && j.Self.Capabilities.includes('https'))
  return { estado: 'listo', host, https: certs.includes(host) || capHttps, cuenta: j.CurrentTailnet?.Name ?? null }
}

/** `tailscale serve status --json` → [{ puerto, ruta, proxy }] de los manejadores web de este host. */
export function manejadoresServe(texto, host) {
  let j
  try { j = typeof texto === 'string' ? (texto.trim() ? JSON.parse(texto) : {}) : texto } catch { return null }
  const web = j?.Web && typeof j.Web === 'object' ? j.Web : {}
  const o = []
  for (const [hp, v] of Object.entries(web)) {
    const m = /^(.+):(\d+)$/.exec(hp)
    if (!m || m[1].toLowerCase() !== host) continue
    for (const [ruta, h] of Object.entries(v?.Handlers ?? {})) o.push({ puerto: Number(m[2]), ruta, proxy: typeof h?.Proxy === 'string' ? h.Proxy : null })
  }
  return o
}

/** ¿Algún manejador de la raíz manda a ESTA web? Devuelve su puerto HTTPS o null. */
export function puertoNuestro(manejadores, puertoWeb) {
  const nuestro = new Set([`http://127.0.0.1:${puertoWeb}`, `127.0.0.1:${puertoWeb}`, `http://localhost:${puertoWeb}`])
  return manejadores.find((h) => h.ruta === '/' && nuestro.has(String(h.proxy).replace(/\/$/, '')))?.puerto ?? null
}

/** Primer puerto HTTPS cuya raíz está libre (no pisamos lo que la persona ya publica con Tailscale). */
export function puertoLibreHttps(manejadores) {
  return PUERTOS_HTTPS.find((p) => !manejadores.some((h) => h.puerto === p && h.ruta === '/')) ?? null
}

/** Clasifica un fallo de `tailscale serve`: enlace para activar HTTPS, permiso de Linux o error genérico. */
export function fallaServe(salida) {
  const enlace = RE_ENLACE.exec(salida)?.[0] ?? null
  if (enlace) return { estado: 'falta-https', enlace }
  if (/access denied|permission denied|operator|requires root|use 'sudo/i.test(salida)) return { estado: 'falta-permiso' }
  if (/funnel/i.test(salida) && /not allowed|denied/i.test(salida)) return { estado: 'falta-permiso' }
  return { estado: 'error', detalle: salida.trim().split('\n').slice(-3).join(' ').slice(0, 300) }
}

// ── Códigos de un solo uso para entrar desde el teléfono ────────────────────────────────────────────────────────

export function codigoNuevo() {
  const tope = 256 - (256 % ALFABETO.length)
  let s = ''
  while (s.length < 8) for (const b of randomBytes(16)) { if (b < tope && s.length < 8) s += ALFABETO[b % ALFABETO.length] }
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Forma canónica de lo que escribió la persona (mayúsculas, espacios, sin guion) o null si no parece un código. */
export function normalizarCodigo(t) {
  const s = String(t ?? '').toLowerCase().replace(/[\s-]/g, '')
  return /^[a-hjkmnp-z2-9]{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : null
}

/** Hasta 3 códigos vivos, 10 minutos, un solo uso. En memoria del supervisor: reiniciar los invalida. */
export function crearCodigos(ahora = () => Date.now()) {
  const vivos = new Map()
  const limpiar = () => { for (const [c, v] of vivos) if (v <= ahora()) vivos.delete(c) }
  return {
    nuevo() {
      limpiar()
      while (vivos.size >= 3) vivos.delete(vivos.keys().next().value)
      const c = codigoNuevo()
      vivos.set(c, ahora() + CODIGO_MS)
      return { codigo: c, vence: new Date(ahora() + CODIGO_MS).toISOString() }
    },
    canjear(t) {
      limpiar()
      const c = normalizarCodigo(t)
      if (!c || !vivos.has(c)) return false
      vivos.delete(c)
      return true
    },
    get cuantos() { limpiar(); return vivos.size },
  }
}

// ── Acciones ────────────────────────────────────────────────────────────────────────────────────────────────────

const PASOS = {
  'falta-tailscale': 'Instala Tailscale (gratis) en esta computadora y en tu teléfono: https://tailscale.com/download',
  'falta-sesion': 'Inicia sesión en Tailscale en esta computadora (con la misma cuenta que usarás en tu teléfono).',
  'falta-aprobacion': 'Tu red de Tailscale pide aprobar esta máquina: apruébala en https://login.tailscale.com/admin/machines',
  apagado: 'Tailscale está desconectado: ábrelo y pulsa «Connect» (o corre `tailscale up`).',
  arrancando: 'Tailscale está arrancando; vuelve a intentarlo en unos segundos.',
  'sin-magicdns': 'Activa MagicDNS en tu red de Tailscale: https://login.tailscale.com/admin/dns',
  'falta-https': 'Activa los certificados HTTPS de tu red de Tailscale con el enlace (un clic) y vuelve a encenderlo.',
  'falta-permiso': 'En Linux, dale permiso a tu usuario una sola vez: sudo tailscale set --operator=$USER',
  ilegible: 'Tailscale respondió algo que no entiendo; revisa que esté actualizado.',
  error: 'Tailscale no aceptó la orden; el detalle está arriba.',
}

export const pasoDe = (estado) => PASOS[estado] ?? null

async function leerTailscale(bin) {
  const r = await correrTailscale(bin, ['status', '--json'], { plazo: 10_000 })
  // Sin sesión, algunas versiones salen con código distinto de 0 pero igual imprimen el JSON.
  const ini = r.salida.indexOf('{')
  if (ini < 0) {
    if (/not running|failed to connect|connection refused|no such file|is tailscaled running/i.test(r.salida)) return { estado: 'apagado', detalle: 'tailscaled no responde' }
    return { estado: 'ilegible', detalle: r.salida.trim().slice(0, 200) }
  }
  return interpretarStatus(r.salida.slice(ini))
}

async function leerServe(bin, host) {
  const r = await correrTailscale(bin, ['serve', 'status', '--json'], { plazo: 10_000 })
  const ini = r.salida.indexOf('{')
  return manejadoresServe(ini < 0 ? '{}' : r.salida.slice(ini), host) ?? []
}

/**
 * `tailscale serve --bg --https=<p> http://127.0.0.1:<web>`: publica SOLO dentro de la red privada. Se corta al ver el
 * enlace para activar HTTPS (la orden se quedaría esperando). `--yes` evita preguntas; versiones viejas no lo conocen.
 */
async function publicar(bin, p, puertoWeb) {
  const args = ['serve', '--bg', '--yes', `--https=${p}`, `http://127.0.0.1:${puertoWeb}`]
  const op = { plazo: 45_000, alLinea: (s) => RE_ENLACE.test(s) }
  const r = await correrTailscale(bin, args, op)
  if (r.codigo !== 0 && /flag provided but not defined: -yes/.test(r.salida)) return correrTailscale(bin, args.filter((a) => a !== '--yes'), op)
  return r
}

/** Si la sesión falta, pide a Tailscale el enlace para iniciarla (sin esperar a que la persona entre). */
async function enlaceDeSesion(bin) {
  const r = await correrTailscale(bin, ['login', '--timeout=60s'], { plazo: 25_000, alLinea: (s) => RE_ENLACE.test(s) })
  const enlace = RE_ENLACE.exec(r.salida)?.[0] ?? null
  if (enlace) return { enlace }
  return fallaServe(r.salida).estado === 'falta-permiso' ? { permiso: true } : {}
}

/**
 * Estado completo: { estado, url?, host?, puertoHttps?, paso?, enlace?, guardado }.
 * `estado` final: encendido | apagado | falta-tailscale | falta-sesion | apagado-tailscale | … (ver PASOS).
 */
export async function estado({ R, puertoWeb, bin = binarioTailscale() }) {
  const guardado = leerEstado(R)
  if (!bin) return { estado: 'falta-tailscale', paso: pasoDe('falta-tailscale'), guardado }
  const ts = await leerTailscale(bin)
  if (ts.estado !== 'listo') return { estado: ts.estado === 'apagado' ? 'apagado-tailscale' : ts.estado, paso: pasoDe(ts.estado), enlace: ts.enlace ?? null, guardado }
  const man = await leerServe(bin, ts.host)
  const p = puertoNuestro(man, puertoWeb)
  if (guardado.encendido && p && guardado.host === ts.host) return { estado: 'encendido', host: ts.host, puertoHttps: p, url: urlTelefono(ts.host, p), guardado }
  if (guardado.encendido) return { estado: 'desfasado', host: ts.host, paso: 'El teléfono estaba encendido pero Tailscale ya no apunta a esta web (cambió el puerto o el nombre). Vuelve a encenderlo.', guardado }
  return { estado: 'apagado', host: ts.host, https: ts.https, guardado }
}

/** Enciende: revisa Tailscale, publica la web SOLO en la red privada (`serve`, nunca `funnel`) y guarda el estado. */
export async function encender({ R, puertoWeb, bin = binarioTailscale(), registrar = (_mensaje) => {} }) {
  if (!bin) return { estado: 'falta-tailscale', paso: pasoDe('falta-tailscale') }
  const ts = await leerTailscale(bin)
  if (ts.estado === 'falta-sesion') {
    const s = ts.enlace ? { enlace: ts.enlace } : await enlaceDeSesion(bin)
    if (s.permiso) return { estado: 'falta-permiso', paso: 'En Linux, inicia sesión una sola vez con: sudo tailscale up --operator=$USER' }
    return { estado: 'falta-sesion', enlace: s.enlace ?? null, paso: pasoDe('falta-sesion') }
  }
  if (ts.estado !== 'listo') return { estado: ts.estado === 'apagado' ? 'apagado-tailscale' : ts.estado, paso: pasoDe(ts.estado), detalle: ts.detalle }
  const man = await leerServe(bin, ts.host)
  let p = puertoNuestro(man, puertoWeb)
  if (!p) {
    p = puertoLibreHttps(man)
    if (!p) return { estado: 'error', paso: `Los puertos ${PUERTOS_HTTPS.join(', ')} de tu Tailscale ya publican otra cosa; libera uno con \`tailscale serve status\`.` }
    const r = await publicar(bin, p, puertoWeb)
    if (r.codigo !== 0 || r.cortado) {
      const f = fallaServe(r.salida)
      return { ...f, paso: pasoDe(f.estado) }
    }
    const despues = puertoNuestro(await leerServe(bin, ts.host), puertoWeb)
    if (despues !== p) return { estado: 'error', paso: 'Tailscale aceptó la orden pero no quedó publicado; revisa `tailscale serve status`.', detalle: r.salida.trim().slice(0, 300) }
    registrar(`Teléfono: Tailscale publica ${urlTelefono(ts.host, p)} → 127.0.0.1:${puertoWeb} (solo tu red privada).`)
  }
  guardarEstado(R, { encendido: true, host: ts.host, puertoHttps: p, puertoWeb, desde: new Date().toISOString() })
  return { estado: 'encendido', host: ts.host, puertoHttps: p, url: urlTelefono(ts.host, p) }
}

/** Apaga: quita SOLO la publicación que apunta a esta web y marca el teléfono apagado (la web vuelve a rechazar ese Host). */
export async function apagar({ R, puertoWeb, bin = binarioTailscale(), registrar = (_mensaje) => {} }) {
  const antes = leerEstado(R)
  guardarEstado(R, { encendido: false, apagado: new Date().toISOString(), ...(antes.host ? { hostAnterior: antes.host } : {}) })
  if (!bin) return { estado: 'apagado' }
  const ts = await leerTailscale(bin)
  if (ts.estado !== 'listo') return { estado: 'apagado', nota: 'Tailscale no está conectado; no había nada publicado que quitar.' }
  const man = await leerServe(bin, ts.host)
  const puertos = new Set([puertoNuestro(man, puertoWeb), antes.encendido && antes.puertoWeb !== puertoWeb ? puertoNuestro(man, antes.puertoWeb) : null].filter(Boolean))
  for (const p of puertos) {
    let r = await correrTailscale(bin, ['serve', '--yes', `--https=${p}`, 'off'], { plazo: 20_000 })
    if (r.codigo !== 0 && /flag provided but not defined: -yes/.test(r.salida)) r = await correrTailscale(bin, ['serve', `--https=${p}`, 'off'], { plazo: 20_000 })
    if (r.codigo !== 0) return { estado: 'apagado', nota: `No pude quitar la publicación de Tailscale en el puerto ${p}: ${r.salida.trim().slice(0, 200)}` }
    registrar(`Teléfono: Tailscale dejó de publicar el puerto ${p}.`)
  }
  return { estado: 'apagado' }
}

/**
 * Al arrancar el supervisor con el teléfono encendido: que Tailscale siga apuntando a ESTA web. Tras encender la
 * computadora, Tailscale y Arbrain arrancan a la vez y Tailscale puede tardar en conectarse (Windows: al iniciar
 * sesión): se le espera hasta `intentos × pausaMs` (3 min por omisión) en vez de rendirse al primer intento. Si la
 * publicación no apunta a esta web (cambió el puerto o se perdió), se vuelve a publicar en el mismo puerto HTTPS si
 * está libre, o en el primero libre (sin pisar lo que la persona publique). Devuelve null (nada que hacer), true o false.
 */
export async function alArrancar({ R, puertoWeb, bin = binarioTailscale(), registrar = (_mensaje) => {}, intentos = 18, pausaMs = 10_000, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const e = leerEstado(R)
  if (!e.encendido || !bin) return null
  let ts = await leerTailscale(bin)
  for (let i = 1; i < intentos && ts.estado !== 'listo'; i++) {
    await dormir(pausaMs)
    ts = await leerTailscale(bin)
  }
  if (ts.estado !== 'listo') { registrar(`Teléfono: Tailscale no se conectó (${ts.estado}); el teléfono vuelve cuando lo conectes y pulses «Encender».`); return false }
  if (ts.host !== e.host) { registrar(`Teléfono: esta máquina ahora se llama ${ts.host} en Tailscale (antes ${e.host}); vuelve a encenderlo.`); return false }
  const man = await leerServe(bin, ts.host)
  if (puertoNuestro(man, puertoWeb)) {
    if (e.puertoWeb !== puertoWeb) guardarEstado(R, { ...e, puertoWeb })
    return null
  }
  const viejo = puertoNuestro(man, e.puertoWeb)
  const ocupado = (p) => man.some((h) => h.puerto === p && h.ruta === '/')
  const p = viejo ?? (ocupado(e.puertoHttps) ? puertoLibreHttps(man) : e.puertoHttps)
  if (!p) { registrar('Teléfono: los puertos HTTPS de tu Tailscale publican otra cosa; vuelve a encenderlo.'); return false }
  registrar(`Teléfono: Tailscale no apuntaba a esta web (127.0.0.1:${puertoWeb}); lo vuelvo a publicar en ${urlTelefono(ts.host, p)}.`)
  const r = await publicar(bin, p, puertoWeb)
  if (r.codigo !== 0 || r.cortado) { registrar(`Teléfono: Tailscale no aceptó volver a publicar: ${r.salida.trim().slice(0, 200)}`); return false }
  guardarEstado(R, { ...e, puertoWeb, puertoHttps: p })
  return true
}

// ── Control del supervisor (la web pregunta y actúa por aquí) ───────────────────────────────────────────────────

/**
 * Rutas `/telefono/*` del control local de servidor.mjs. `ctx`: { R, puertoWeb, reiniciarWeb, registrar, codigos,
 * asegurarArranque? }. La web llega con el token del daemon (esWeb) y el CLI con el suyo (esCli). Devuelve [status, json] o null.
 */
export async function atenderControl({ metodo, ruta, cuerpo, esWeb, esCli }, ctx) {
  const base = { R: ctx.R, puertoWeb: ctx.puertoWeb(), registrar: ctx.registrar, bin: ctx.bin ?? binarioTailscale() }
  if (metodo === 'GET' && ruta === '/telefono/estado') return [200, { ...(await estado(base)), codigosVivos: ctx.codigos.cuantos }]
  if (metodo === 'POST' && (ruta === '/telefono/encender' || ruta === '/telefono/apagar')) {
    const antes = JSON.stringify(entornoWeb(ctx.R))
    const r = ruta === '/telefono/encender' ? await encender(base) : await apagar(base)
    // Encendido = tiene que sobrevivir a un reinicio de la computadora (servidor.mjs › asegurarArranque).
    if (r.estado === 'encendido' && ctx.asegurarArranque) r.arranque = ctx.asegurarArranque()
    const cambia = JSON.stringify(entornoWeb(ctx.R)) !== antes
    // La web se relanza con el Host nuevo (o sin él). Se responde antes: quien pidió esto es, a veces, la propia web.
    if (cambia) setTimeout(() => { void ctx.reiniciarWeb() }, 300)
    return [200, { ...r, reiniciaWeb: cambia }]
  }
  if (metodo === 'POST' && ruta === '/telefono/codigo' && (esWeb || esCli)) return [200, ctx.codigos.nuevo()]
  if (metodo === 'POST' && ruta === '/telefono/codigo/canjear' && esWeb) return [200, { ok: ctx.codigos.canjear(cuerpo?.codigo) }]
  return null
}

// ── Orden de la terminal ────────────────────────────────────────────────────────────────────────────────────────

function imprimir(r, { cuenta } = {}) {
  const linea = (s) => console.log(`[arbrain] ${s}`)
  if (r.estado === 'encendido') {
    linea(`Tu cerebro en el teléfono: ENCENDIDO · ${r.url}`)
    linea('Solo responde dentro de tu red de Tailscale (tu teléfono con la misma cuenta). Nada queda abierto a internet.')
    linea('En tu teléfono: abre esa dirección, entra con un código de Ajustes › Tu cerebro en el teléfono (o tu contraseña) y agrégala a tu pantalla de inicio.')
  } else if (r.estado === 'apagado') {
    linea('Tu cerebro en el teléfono: APAGADO.' + (r.nota ? ` ${r.nota}` : ''))
  } else {
    linea(`Tu cerebro en el teléfono: falta un paso (${r.estado}).`)
    if (r.paso) linea(r.paso)
    if (r.enlace) linea(`Enlace: ${r.enlace}`)
    if (r.detalle) linea(`Detalle: ${r.detalle}`)
  }
  if (r.arranque?.nuevo) linea('Activé el arranque automático: Arbrain vuelve solo cuando reinicies la computadora, y tu teléfono con él.')
  else if (r.arranque && !r.arranque.activo) linea('Ojo: el arranque automático está apagado; si reinicias, el teléfono se queda sin Arbrain. Actívalo: npm run servidor -- arranque-automatico activar')
  if (cuenta) linea(cuenta)
  // Última línea para quien lo lee por guion (TELEFONO.md): estado y, si hay, la dirección o el enlace.
  console.log(`TELEFONO_${r.estado.toUpperCase().replace(/-/g, '_')}${r.url ? ` ${r.url}` : r.enlace ? ` ${r.enlace}` : ''}`)
}

/**
 * `npm run servidor -- telefono <sub>`. `ctx`: { R, sub, vivo, pedir, puertoGuardado, asegurarArranque? }. Si el
 * supervisor corre, la orden pasa por su control (así reinicia la web); si no, se hace aquí y la web lo toma al arrancar.
 */
export async function orden(ctx) {
  const sub = ctx.sub ?? 'estado'
  if (!['encender', 'apagar', 'estado', 'codigo'].includes(sub)) {
    console.error('[arbrain] Uso: npm run servidor -- telefono encender | apagar | estado | codigo')
    process.exitCode = 2
    return
  }
  const ya = await ctx.vivo()
  if (sub === 'codigo') {
    if (!ya) { console.log('[arbrain] Arbrain no está corriendo: arráncalo y vuelve a pedir el código.'); console.log('TELEFONO_SIN_SERVIDOR'); return }
    const r = await ctx.pedir(ya.puertoControl, '/telefono/codigo', { metodo: 'POST', token: ya.tokenCli, cuerpo: {} })
    if (r.status !== 200 || !r.json?.codigo) { console.log('TELEFONO_ERROR'); return }
    console.log(`[arbrain] Código para entrar desde tu teléfono (un solo uso, 10 minutos): ${r.json.codigo}`)
    console.log(`TELEFONO_CODIGO ${r.json.codigo}`)
    return
  }
  if (ya) {
    const metodo = sub === 'estado' ? 'GET' : 'POST'
    const r = await ctx.pedir(ya.puertoControl, `/telefono/${sub}`, { metodo, token: ya.tokenCli, cuerpo: metodo === 'POST' ? {} : undefined, plazo: 90_000 })
    if (r.status === 200 && r.json?.estado) { imprimir(r.json); return }
    if (r.status !== 404) { console.log(`[arbrain] El servidor no respondió a «telefono ${sub}» (${r.status}).`); console.log('TELEFONO_ERROR'); return }
    // 404: un supervisor de una versión anterior (sin teléfono) sigue corriendo. Se hace aquí y se pide reiniciarlo.
  }
  const puertoWeb = ya?.puertoWeb ?? ctx.puertoGuardado()
  if (!puertoWeb) { console.log('[arbrain] Arranca Arbrain una vez (npm run servidor) antes de encender el teléfono.'); console.log('TELEFONO_SIN_SERVIDOR'); return }
  const base = { R: ctx.R, puertoWeb, registrar: (m) => console.log(`[arbrain] ${m}`) }
  const r = sub === 'encender' ? await encender(base) : sub === 'apagar' ? await apagar(base) : await estado(base)
  if (sub === 'encender' && r.estado === 'encendido' && ctx.asegurarArranque) r.arranque = ctx.asegurarArranque()
  imprimir(r, { cuenta: ya && sub !== 'estado' ? 'Reinicia Arbrain para aplicarlo: npm run servidor -- detener && npm run servidor' : !ya && sub === 'encender' ? 'Arbrain no está corriendo: se aplica cuando arranque.' : undefined })
}
