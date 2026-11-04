/**
 * Tu Levy en el teléfono, sin Tailscale (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md).
 *
 *   npm run servidor -- conectar encender [--relay <url>] [--invitacion <x>] [--unir <código>] | apagar | estado
 *
 * Camino: este Arbrain abre una conexión de SALIDA (WebSocket por 443) al relay de Arbrain y recibe una dirección fija,
 * `https://<handle>.<base>`. El relay le pasa por ahí cada petición de un teléfono CON SESIÓN y este módulo se la entrega
 * a su web en 127.0.0.1:<puerto>. La persona no instala nada: ni Tailscale ni puertos abiertos. Para entrar, el
 * teléfono escanea el QR de Ajustes › Teléfono (un secreto de un solo uso y 10 minutos que vive solo en la memoria de
 * este supervisor) o escribe el código de 8 letras de siempre (`telefono.mjs › crearCodigos`). Si vale, este Arbrain le
 * da al relay un boleto de un solo uso para su propia entrada (`/api/desktop/entrar?pase=`): la web sigue poniendo su
 * cookie y exigiendo su sesión, como con Tailscale.
 *
 * Lo que cambia en la web, solo encendido: el supervisor le pasa `ARBRAIN_CONECTAR_HOST` y la web acepta ese Host
 * (siempre con `X-Forwarded-Proto: https`, que pone este módulo) además del loopback (features/telefono/host-telefono.ts).
 * Estado: `<config>/conectar.json` (0600: guarda la credencial de la máquina; la carpeta está negada a los agentes).
 *
 * Variables: `ARBRAIN_CONECTAR_RELAY` (relay por omisión; el prototipo no trae uno fijo). Las funciones reciben
 * `WebSocket` y `fetch` por parámetro para las pruebas (tests/servidor/conectar.test.ts).
 */
import http from 'node:http'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DIR_PETICION, DIR_RESPUESTA, METODOS, RUTA_TUNEL, SILENCIO_MS, VERSION_PROTOCOLO, baseValida, cabecerasHaciaLaWeb, etiquetaAgente, handleValido,
  hostDe, leerMarco, marcoDatos, pares, rutaValida, secretoNuevo, secretoValido,
} from './conectar-protocolo.mjs'

export const QR_MS = 10 * 60_000
const sha = (s) => createHash('sha256').update(String(s)).digest('hex')

// ── Estado persistente ──────────────────────────────────────────────────────────────────────────────────────────

export const rutaEstado = (R) => join(R.config, 'conectar.json')

/** `https://<base>` (o `http://127.0.0.1|localhost:<p>` solo para pruebas en esta máquina). Devuelve la URL normalizada o null. */
export function relayValido(u) {
  try {
    const x = new URL(String(u))
    if (x.username || x.password || (x.pathname !== '/' && x.pathname !== '') || x.search || x.hash) return null
    const local = /^(127\.0\.0\.1|localhost)$/.test(x.hostname)
    if (x.protocol === 'https:' && baseValida(x.hostname)) return `https://${x.host}`
    if (x.protocol === 'http:' && local) return `http://${x.host}`
    return null
  } catch { return null }
}

export function leerEstado(R) {
  try {
    const j = JSON.parse(readFileSync(rutaEstado(R), 'utf8'))
    if (!j || typeof j !== 'object') return { encendido: false }
    const inscrita = relayValido(j.relay) && handleValido(j.handle) && secretoValido(j.credencial) && baseValida(j.base)
    return inscrita ? { ...j, encendido: j.encendido === true, inscrita: true } : { encendido: false, relay: relayValido(j.relay) ?? undefined }
  } catch { return { encendido: false } }
}

export function guardarEstado(R, o) {
  const ruta = rutaEstado(R)
  const tmp = `${ruta}.${process.pid}.tmp`
  const { inscrita: _i, ...limpio } = o
  writeFileSync(tmp, JSON.stringify(limpio, null, 1) + '\n', { mode: 0o600 })
  renameSync(tmp, ruta)
}

export const hostPublico = (e) => (e.inscrita ? hostDe(e.handle, e.base) : null)
export const urlPublica = (e) => (e.inscrita ? `https://${hostDe(e.handle, e.base)}` : null)

/** Lo que el supervisor agrega al entorno de la web: el Host público, solo encendido. */
export function entornoWeb(R) {
  const e = leerEstado(R)
  return e.encendido && e.inscrita ? { ARBRAIN_CONECTAR_HOST: hostPublico(e) } : {}
}

/** Qué es esta máquina para la lista de Máquinas. */
export function tipoMaquina(env = process.env, plataforma = process.platform) {
  if (env.ARBRAIN_SERVIDOR_NUBE === '1') return 'servidor'
  return plataforma === 'darwin' ? 'mac' : plataforma === 'win32' ? 'windows' : 'linux'
}
export const nombreMaquina = (h = hostname()) => String(h).replace(/\.(local|lan|home)$/i, '').slice(0, 64) || 'Arbrain'

// ── Secretos del QR (un solo uso, 10 minutos, en memoria) ───────────────────────────────────────────────────────

export function crearEmparejamientos(ahora = () => Date.now()) {
  const vivos = new Map()
  const limpiar = () => { for (const [h, v] of vivos) if (v <= ahora()) vivos.delete(h) }
  return {
    nuevo() {
      limpiar()
      while (vivos.size >= 3) vivos.delete(vivos.keys().next().value)
      const secreto = secretoNuevo()
      vivos.set(sha(secreto), ahora() + QR_MS)
      return { secreto, vence: new Date(ahora() + QR_MS).toISOString() }
    },
    canjear(s) {
      limpiar()
      if (!secretoValido(s)) return false
      const h = sha(s)
      if (!vivos.has(h)) return false
      vivos.delete(h)
      return true
    },
    get cuantos() { limpiar(); return vivos.size },
  }
}

// ── Relay: inscripción y llamadas con la credencial ─────────────────────────────────────────────────────────────

async function pedirJson(fetchImpl, url, { cuerpo = {}, credencial = null, plazo = 10_000 } = {}) {
  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}) },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(plazo),
    })
    const json = await r.json().catch(() => ({}))
    return { status: r.status, json }
  } catch (e) {
    return { status: 0, json: { error: `No pude hablar con el relay (${e?.cause?.code ?? e?.name ?? 'red'}).` } }
  }
}

/** Da de alta esta máquina en el relay. Devuelve el estado a guardar o { error }. */
export async function inscribir({ relay, invitacion = '', unir = '', nombre = nombreMaquina(), tipo = tipoMaquina(), fetchImpl = fetch }) {
  const u = relayValido(relay)
  if (!u) return { error: 'La dirección del relay no es válida (https://…).' }
  const r = await pedirJson(fetchImpl, `${u}/_conectar/inscribir`, { cuerpo: { invitacion, nombre, tipo, ...(unir ? { codigoMaquina: unir } : {}) } })
  if (r.status !== 200) return { error: r.json?.error ?? `El relay respondió ${r.status}.` }
  const j = r.json
  if (!handleValido(j.handle) || !secretoValido(j.credencial) || !baseValida(j.base)) return { error: 'El relay respondió algo que no entiendo.' }
  return { relay: u, handle: j.handle, credencial: j.credencial, base: j.base, cuenta: j.cuenta, nombre, tipo, inscrita: new Date().toISOString() }
}

export function rpc(e, nombre, cuerpo = {}, fetchImpl = fetch, plazo = 8000) {
  return pedirJson(fetchImpl, `${e.relay}/_conectar/api/${nombre}`, { cuerpo, credencial: e.credencial, plazo })
}

// ── El túnel ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Cabeceras en objeto para http.request (Cookie se une con «; », lo demás con «, »). */
function objetoCabeceras(lista) {
  const o = {}
  for (const [k, v] of lista) {
    const n = k.toLowerCase()
    o[n] = o[n] === undefined ? v : `${o[n]}${n === 'cookie' ? '; ' : ', '}${v}`
  }
  return o
}

/**
 * El conector: sostiene el túnel (reconecta con espera creciente hasta 30 s) y atiende lo que manda el relay.
 * ctx: { R, puertoWeb: () => number, registrar, emparejamientos, codigos, pase: () => string, WebSocketImpl?, fetchImpl?, ahora? }
 */
export function crearConector(ctx) {
  const WS = ctx.WebSocketImpl ?? globalThis.WebSocket
  const fetchImpl = ctx.fetchImpl ?? fetch
  const ahora = ctx.ahora ?? (() => Date.now())
  const registrar = ctx.registrar ?? (() => {})
  let ws = null
  let activo = false
  let desde = null
  let ultimoError = null
  let intento = 0
  let reintentoEn = null
  let temporizador = null
  let vigia = null
  let ultimoMensaje = 0
  let revocada = false
  const peticiones = new Map()

  const enviar = (s, m) => { try { s.send(typeof m === 'string' || Buffer.isBuffer(m) ? m : JSON.stringify(m)) } catch { /* se cayó; onclose limpia */ } }
  const cancelarTodo = () => { for (const r of peticiones.values()) { try { r.destroy() } catch { /* */ } } peticiones.clear() }

  function programar(motivo) {
    if (!activo) return
    ultimoError = motivo
    const ms = Math.min(30_000, 1000 * 2 ** Math.min(intento++, 5)) + Math.floor(Math.random() * 400)
    reintentoEn = ahora() + ms
    clearTimeout(temporizador)
    temporizador = setTimeout(() => void conectar(), ms)
    temporizador.unref?.()
  }

  async function conectar() {
    reintentoEn = null
    const e = leerEstado(ctx.R)
    if (!activo || !e.encendido || !e.inscrita) { activo = false; return }
    // Tras varios intentos fallidos se pregunta por la credencial: si el relay ya no conoce esta máquina, no se insiste.
    if (intento >= 3 && intento % 3 === 0) {
      const r = await rpc(e, 'estado', {}, fetchImpl, 5000)
      if (r.status === 401) { revocada = true; activo = false; ultimoError = 'El relay ya no reconoce esta máquina (la quitaron de tu cuenta). Vuelve a encender para darla de alta.'; registrar(`Conectar: ${ultimoError}`); return }
    }
    let s
    try {
      s = new WS(e.relay.replace(/^http/, 'ws') + RUTA_TUNEL, { headers: { Authorization: `Bearer ${e.credencial}`, 'X-Arbrain-Protocolo': String(VERSION_PROTOCOLO) } })
    } catch (err) { return programar(String(err?.message ?? err)) }
    s.binaryType = 'arraybuffer'
    ws = s
    s.onopen = () => {
      intento = 0; revocada = false; desde = ahora(); ultimoError = null; ultimoMensaje = ahora()
      registrar(`Conectar: listo en ${urlPublica(e)} (sin Tailscale; solo entra quien tiene tu QR o tu código).`)
      clearInterval(vigia)
      vigia = setInterval(() => { if (ahora() - ultimoMensaje > SILENCIO_MS) { try { s.close(4001, 'silencio') } catch { /* */ } } }, 5000)
      vigia.unref?.()
    }
    s.onmessage = (ev) => {
      ultimoMensaje = ahora()
      if (typeof ev.data === 'string') alTexto(s, ev.data)
      else alBinario(Buffer.from(ev.data))
    }
    s.onerror = () => { /* llega onclose */ }
    s.onclose = (ev) => {
      if (ws !== s) return
      clearInterval(vigia)
      ws = null; desde = null
      cancelarTodo()
      if (ev.code === 4003) { revocada = true; activo = false; ultimoError = 'Quitaste esta máquina de tu cuenta desde otra. Vuelve a encender para darla de alta.'; registrar(`Conectar: ${ultimoError}`); return }
      programar(ev.code === 1006 || !ev.code ? 'Sin conexión con el relay.' : `El relay cerró la conexión (${ev.reason || ev.code}).`)
    }
  }

  function alTexto(s, texto) {
    let m
    try { m = JSON.parse(texto) } catch { return }
    if (!m || typeof m !== 'object') return
    if (m.t === 'peticion') return peticion(s, m)
    if (m.t === 'fin' && m.dir === DIR_PETICION) { peticiones.get(m.id)?.end(); return }
    if (m.t === 'cancelar') { const r = peticiones.get(m.id); if (r) { peticiones.delete(m.id); r.destroy() } return }
    if (m.t === 'emparejar') {
      const ok = typeof m.secreto === 'string' ? ctx.emparejamientos.canjear(m.secreto) : typeof m.codigo === 'string' ? ctx.codigos.canjear(m.codigo) : false
      enviar(s, { t: 'emparejado', id: m.id, ok, ...(ok ? { pase: ctx.pase() } : {}) })
      registrar(ok ? `Conectar: entró un teléfono (${etiquetaAgente(m.agente)}) con ${m.secreto ? 'el QR' : 'el código'}.` : `Conectar: un intento de entrar con ${m.secreto ? 'un QR' : 'un código'} que no vale.`)
      return
    }
    if (m.t === 'pase') {
      // «Abrir» desde otra máquina de la misma cuenta: el relay responde por la cuenta. Se puede apagar con confiarEnCuenta: false.
      const ok = leerEstado(ctx.R).confiarEnCuenta !== false
      enviar(s, { t: 'emparejado', id: m.id, ok, ...(ok ? { pase: ctx.pase() } : {}) })
      if (ok) registrar('Conectar: entraste desde otra de tus máquinas.')
    }
  }

  function alBinario(b) {
    const f = leerMarco(b)
    if (f && f.dir === DIR_PETICION) peticiones.get(f.id)?.write(f.datos)
  }

  function peticion(s, m) {
    const e = leerEstado(ctx.R)
    const id = m.id
    if (!Number.isInteger(id) || !METODOS.has(m.metodo) || !rutaValida(m.ruta) || !e.inscrita) { enviar(s, { t: 'error', id, estado: 400, mensaje: 'Petición inválida.' }); return }
    let respondida = false
    let req
    try {
      req = http.request({ host: '127.0.0.1', port: ctx.puertoWeb(), method: m.metodo, path: m.ruta, headers: objetoCabeceras(cabecerasHaciaLaWeb(m.cabeceras, hostPublico(e))) })
    } catch {
      enviar(s, { t: 'error', id, estado: 400, mensaje: 'Petición inválida.' }); return
    }
    peticiones.set(id, req)
    req.on('response', (r) => {
      respondida = true
      enviar(s, { t: 'respuesta', id, estado: r.statusCode, cabeceras: pares(r.rawHeaders) })
      r.on('data', (c) => {
        enviar(s, marcoDatos(id, DIR_RESPUESTA, c))
        // Si el túnel se atasca (teléfono lento), se pausa la lectura de la web hasta que baje.
        if (s.bufferedAmount > 4 * 1024 * 1024) {
          r.pause()
          const t = setInterval(() => { if (s.readyState !== 1 || s.bufferedAmount < 1024 * 1024) { clearInterval(t); r.resume() } }, 25)
        }
      })
      r.on('end', () => { peticiones.delete(id); enviar(s, { t: 'fin', id, dir: DIR_RESPUESTA }) })
      r.on('error', () => { peticiones.delete(id); enviar(s, { t: 'error', id, estado: 502, mensaje: 'La respuesta se cortó.' }) })
    })
    req.on('error', () => {
      peticiones.delete(id)
      if (!respondida) enviar(s, { t: 'error', id, estado: 502, mensaje: 'Tu Arbrain no respondió (¿se está reiniciando?).' })
    })
    if (!m.cuerpo) req.end()
  }

  return {
    arrancar() { if (activo) return; activo = true; intento = 0; void conectar() },
    detener() {
      activo = false
      clearTimeout(temporizador); clearInterval(vigia)
      const s = ws; ws = null; desde = null; reintentoEn = null
      try { s?.close(1000, 'apagado') } catch { /* */ }
      cancelarTodo()
    },
    reconectar() { this.detener(); this.arrancar() },
    estado: () => ({ activo, conectado: !!desde, desde, ultimoError, reintentoEn, revocada }),
  }
}

// ── Control del supervisor (la web pregunta y actúa por aquí) ───────────────────────────────────────────────────

function estadoPublico(R, conector) {
  const e = leerEstado(R)
  const c = conector?.estado() ?? { conectado: false }
  const base = { relay: e.relay ?? relayPorOmision() ?? null, inscrita: !!e.inscrita, maquina: { nombre: e.nombre ?? nombreMaquina(), tipo: e.tipo ?? tipoMaquina() } }
  if (!e.inscrita) return { ...base, estado: 'apagado' }
  const estado = !e.encendido ? 'apagado' : c.conectado ? 'listo' : c.revocada ? 'revocada' : 'conectando'
  return {
    ...base, estado, url: urlPublica(e), host: hostPublico(e),
    desde: c.desde ? new Date(c.desde).toISOString() : null,
    ultimoError: e.encendido ? c.ultimoError ?? null : null,
    reintentoEn: c.reintentoEn ? new Date(c.reintentoEn).toISOString() : null,
  }
}

export const relayPorOmision = (env = process.env) => relayValido(env.ARBRAIN_CONECTAR_RELAY ?? '')

/**
 * Rutas `/conectar/*` del control local de servidor.mjs. ctx: { R, conector, emparejamientos, reiniciarWeb, registrar, fetchImpl? }.
 * La web llega con el token del daemon (esWeb) y el CLI con el suyo (esCli). Devuelve [status, json] o null.
 */
export async function atenderControl({ metodo, ruta, cuerpo, esWeb, esCli }, ctx) {
  if (!esWeb && !esCli) return null
  const R = ctx.R
  const f = ctx.fetchImpl ?? fetch
  const e = leerEstado(R)
  const conRelay = async (nombre, c = {}) => {
    if (!e.inscrita) return [409, { error: 'Primero enciende «Tu Levy en el teléfono».' }]
    const r = await rpc(e, nombre, c, f)
    return [r.status === 0 ? 503 : r.status, r.json]
  }

  if (metodo === 'GET' && ruta === '/conectar/estado') {
    const s = estadoPublico(R, ctx.conector)
    if (s.estado === 'listo') {
      const r = await rpc(e, 'telefonos', {}, f, 4000)
      if (r.status === 200 && Array.isArray(r.json?.telefonos)) s.telefonos = r.json.telefonos
    }
    return [200, s]
  }
  if (metodo === 'POST' && ruta === '/conectar/encender') {
    const antes = JSON.stringify(entornoWeb(R))
    const relay = relayValido(cuerpo?.relay ?? '') ?? e.relay ?? relayPorOmision()
    if (!relay) return [400, { estado: 'sin-relay', error: 'Falta la dirección del relay de Arbrain.' }]
    let nuevo = e
    if (!e.inscrita || e.relay !== relay || e.revocar) {
      const r = await inscribir({ relay, invitacion: String(cuerpo?.invitacion ?? ''), unir: String(cuerpo?.unir ?? ''), fetchImpl: f })
      if (r.error) return [502, { estado: 'error', error: r.error }]
      nuevo = { ...r, encendido: true, desde: new Date().toISOString() }
      ctx.registrar?.(`Conectar: esta máquina quedó dada de alta como ${r.handle} en ${relay}.`)
    } else nuevo = { ...e, encendido: true }
    guardarEstado(R, nuevo)
    ctx.conector?.reconectar()
    const cambia = JSON.stringify(entornoWeb(R)) !== antes
    if (cambia) setTimeout(() => { void ctx.reiniciarWeb?.() }, 300)
    return [200, { ...estadoPublico(R, ctx.conector), reiniciaWeb: cambia }]
  }
  if (metodo === 'POST' && ruta === '/conectar/apagar') {
    const antes = JSON.stringify(entornoWeb(R))
    if (e.inscrita) guardarEstado(R, { ...e, encendido: false })
    ctx.conector?.detener()
    const cambia = JSON.stringify(entornoWeb(R)) !== antes
    if (cambia) setTimeout(() => { void ctx.reiniciarWeb?.() }, 300)
    ctx.registrar?.('Conectar: apagado (la dirección se conserva para cuando lo vuelvas a encender).')
    return [200, { ...estadoPublico(R, ctx.conector), reiniciaWeb: cambia }]
  }
  if (metodo === 'POST' && ruta === '/conectar/qr') {
    if (!e.inscrita || !e.encendido) return [409, { error: 'Enciende «Tu Levy en el teléfono» para ver el QR.' }]
    const q = ctx.emparejamientos.nuevo()
    return [200, { url: `${urlPublica(e)}/_conectar/entrar#p=${q.secreto}`, vence: q.vence }]
  }
  if (metodo === 'POST' && ruta === '/conectar/cerrar-telefonos') return conRelay('cerrar-telefonos')
  if (metodo === 'POST' && ruta === '/conectar/cerrar-telefono') return conRelay('cerrar-telefono', { id: String(cuerpo?.id ?? '') })
  if (metodo === 'GET' && ruta === '/conectar/maquinas') return conRelay('maquinas')
  if (metodo === 'POST' && ruta === '/conectar/codigo-maquina') return conRelay('codigo-maquina')
  if (metodo === 'POST' && ruta === '/conectar/abrir') return conRelay('abrir', { handle: String(cuerpo?.handle ?? '') })
  if (metodo === 'POST' && ruta === '/conectar/quitar') return conRelay('quitar', { handle: String(cuerpo?.handle ?? '') })
  if (metodo === 'POST' && ruta === '/conectar/unir') {
    const r = await conRelay('unir', { codigo: String(cuerpo?.codigo ?? '') })
    if (r[0] === 200 && typeof r[1]?.cuenta === 'string') guardarEstado(R, { ...e, cuenta: r[1].cuenta })
    return r
  }
  return null
}

// ── Orden de la terminal ────────────────────────────────────────────────────────────────────────────────────────

function imprimir(r) {
  const linea = (s) => console.log(`[arbrain] ${s}`)
  if (r.estado === 'listo') linea(`Tu Levy en el teléfono: LISTO · ${r.url}`)
  else if (r.estado === 'conectando') linea(`Tu Levy en el teléfono: conectando con el relay · ${r.url}${r.ultimoError ? ` (${r.ultimoError})` : ''}`)
  else if (r.estado === 'apagado') linea('Tu Levy en el teléfono: APAGADO.')
  else linea(`Tu Levy en el teléfono: ${r.error ?? r.ultimoError ?? r.estado}`)
  if (r.url && r.estado !== 'apagado') linea('En tu computadora: Ajustes › Teléfono › escanea el QR con tu celular. Sin ese QR o tu código, la dirección responde 401.')
  console.log(`CONECTAR_${String(r.estado ?? 'error').toUpperCase().replace(/-/g, '_')}${r.url && r.estado !== 'apagado' ? ` ${r.url}` : ''}`)
}

/** `npm run servidor -- conectar <sub>`. ctx: { R, sub, vivo, pedir, banderas: (n) => string|undefined }. */
export async function orden(ctx) {
  const sub = ctx.sub ?? 'estado'
  if (!['encender', 'apagar', 'estado'].includes(sub)) {
    console.error('[arbrain] Uso: npm run servidor -- conectar encender [--relay <url>] [--invitacion <x>] [--unir <código>] | apagar | estado')
    process.exitCode = 2
    return
  }
  const cuerpo = sub === 'encender' ? { relay: ctx.banderas('--relay'), invitacion: ctx.banderas('--invitacion'), unir: ctx.banderas('--unir') } : undefined
  const ya = await ctx.vivo()
  if (ya) {
    const metodo = sub === 'estado' ? 'GET' : 'POST'
    const r = await ctx.pedir(ya.puertoControl, `/conectar/${sub}`, { metodo, token: ya.tokenCli, cuerpo, plazo: 30_000 })
    if (r.json && (r.json.estado || r.json.error)) { imprimir(r.json); return }
    if (r.status !== 404) { console.log(`[arbrain] El servidor no respondió a «conectar ${sub}» (${r.status}).`); console.log('CONECTAR_ERROR'); return }
  }
  // Sin servidor corriendo (o uno anterior sin esta orden): se guarda aquí y se aplica al arrancar.
  const e = leerEstado(ctx.R)
  if (sub === 'estado') { imprimir({ ...estadoPublico(ctx.R, null), estado: e.encendido ? 'conectando' : 'apagado' }); return }
  if (sub === 'apagar') { if (e.inscrita) guardarEstado(ctx.R, { ...e, encendido: false }); imprimir({ estado: 'apagado' }); return }
  const [status, j] = await atenderControl({ metodo: 'POST', ruta: '/conectar/encender', cuerpo, esCli: true }, { R: ctx.R })
  imprimir(status === 200 ? { ...j, estado: 'conectando' } : j)
  if (status === 200) console.log('[arbrain] Arbrain no está corriendo: se conecta cuando arranque.')
}
