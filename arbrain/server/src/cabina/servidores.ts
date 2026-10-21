/**
 * Servidores (4 oct 2026, Daniel: «mira esto, está apagado. ¿Podemos crear en el panel alguna función para ver
 * ese servidor activo?»). No estaba apagado: el pergamino respondía solo por http y Chrome lo bloqueaba. Y el
 * 3 oct los correos y push de SaaS Factory llevaban UNA SEMANA parados con el servidor «vivo». Este sensor
 * responde lo que a Daniel le importa sin ser técnico: ¿abre lo que usan mis miembros?, ¿mi cerebro corre?,
 * ¿las máquinas aguantan?
 *
 *  · Lo que usan tus miembros: comprobado DESDE AFUERA como lo abriría un miembro (HTTPS, código, tiempo,
 *    certificado), más el mensajero de avisos (fila de pg_net) y los correos de anuncios (registro de envíos).
 *  · Tu cerebro: servicios del Studio con nombre humano; puertos y pids van al detalle plegado.
 *  · Las máquinas: Studio y VPS (por SSH, solo lectura): vivo, disco, memoria.
 *
 * Corre aquí, en el servidor (Studio), cada `cadenciaMin` aunque nadie abra la vista: es el sensor que avisa.
 * La vista lee la última foto cacheada. Si algo de «miembros» está caído 2 revisiones seguidas, aviso a la
 * campana (kind alerta: la única excepción a «telemetría a bitácora»); cuando vuelve, una línea a la bitácora.
 * «Sin dato» nunca es verde. La lista vive en arbrain/server/servidores.json.
 */
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { cpus, loadavg, totalmem, uptime } from 'node:os'
import { dirname, join } from 'node:path'
import { connect as tlsConnect } from 'node:tls'
import { promisify } from 'node:util'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'
import { readEnvFile } from '../env.js'
import { logger } from '../logger.js'

const run = promisify(execFile)

export type Semaforo = 'ok' | 'lento' | 'caido' | 'sin-dato'
export type Grupo = 'miembros' | 'cerebro' | 'maquinas'
export type Tipo = 'web' | 'supabase' | 'mensajero' | 'correos' | 'local' | 'motor' | 'funnel' | 'tunel' | 'studio' | 'vps'

export interface Objetivo { id: string; tipo: Tipo; nombre: string; que: string; url?: string; abrir?: string; esperado?: number[]; lentoMs?: number; credencial?: string; servicio?: string; ssh?: string }
export interface Config { cadenciaMin: number; lentoMs: number; certAvisoDias: number; miembros: Objetivo[]; cerebro: Objetivo[]; maquinas: Objetivo[] }

/** Lo que mide una sonda, sin juicio. El juicio (semáforo y frase) lo pone `evaluar*`. */
export interface Medida { estado: Semaforo; frase: string | null; dato: string | null; ms?: number; detalle: Record<string, string | number | null> }
export interface Fila extends Medida { id: string; grupo: Grupo; nombre: string; que: string; abrir?: string; endpoint: string | null; revisado: string; racha: number; desde: string | null }
/**
 * Dónde vive lo que mide la sonda, SACADO DE SUS DATOS (no del nombre): el host de su url, el de su ssh, o
 * «localhost» si es un servicio launchd / la máquina que corre el vigía (tipo studio). La vista agrupa por máquina
 * con esto (arbrain/src/features/cabina/vistas/servidores-maquinas.ts); aquí solo se expone, sin sondas nuevas.
 */
export function endpointDe(o: Objetivo): string | null {
  const crudo = o.url ?? (o.ssh ? `ssh://${o.ssh}` : null)
  if (crudo) { try { return new URL(crudo).hostname.toLowerCase() } catch { /* url inválida: cae abajo */ } }
  return o.servicio || o.tipo === 'studio' || o.tipo === 'motor' ? 'localhost' : null
}

export interface Foto { revisadoEn: string; cadenciaMin: number; siguienteEn: string; filas: Fila[]; alarmas: { id: string; nombre: string; desde: string; avisado: string }[]; duracionMs: number }

const TIMEOUT_MS = 15_000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36 levy-servidores/1.0'

export function cargarConfig(ruta = process.env.ARBRAIN_SERVIDORES_CONFIG || join(PROJECT_ROOT, 'arbrain', 'server', 'servidores.json')): Config {
  const c = JSON.parse(readFileSync(ruta, 'utf8')) as Partial<Config>
  const ids = new Set<string>()
  for (const o of [...(c.miembros ?? []), ...(c.cerebro ?? []), ...(c.maquinas ?? [])]) {
    if (!o.id || ids.has(o.id)) throw new Error(`servidores.json: id repetido o vacío (${o.id})`)
    ids.add(o.id)
  }
  return { cadenciaMin: c.cadenciaMin ?? 5, lentoMs: c.lentoMs ?? 3000, certAvisoDias: c.certAvisoDias ?? 14, miembros: c.miembros ?? [], cerebro: c.cerebro ?? [], maquinas: c.maquinas ?? [] }
}

// ─── Palabras ──────────────────────────────────────────────────────────────────

const seg = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const rapido = (ms: number) => ms < 100 ? 'al instante' : `en ${seg(ms)}`
const gb = (bytes: number) => `${Math.round(bytes / 1e9)} GB`
export function haceTexto(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return 'sin registro'
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

/** Un error de red en una frase que entiende cualquiera. `codigo` es el `cause.code` de Node. */
export function fraseDeError(codigo: string | undefined, mensaje = ''): string {
  const c = codigo ?? ''
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return 'La dirección no existe en internet (DNS): nadie puede abrirla.'
  if (c === 'ECONNREFUSED') return 'El servidor rechaza la conexión: está apagado o ese servicio se cayó.'
  if (c === 'ECONNRESET' || c === 'UND_ERR_SOCKET') return 'El servidor cortó la conexión a medias.'
  if (c === 'TIMEOUT' || c === 'UND_ERR_CONNECT_TIMEOUT' || c === 'ETIMEDOUT' || c === 'UND_ERR_HEADERS_TIMEOUT') return `No respondió en ${TIMEOUT_MS / 1000} s: está colgado o saturado.`
  if (c === 'CERT_HAS_EXPIRED') return 'El certificado de seguridad venció: el navegador muestra «no es seguro».'
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(c + mensaje)) return 'El certificado de seguridad no es válido para esta dirección: el navegador la bloquea.'
  if (c === 'EHOSTUNREACH' || c === 'ENETUNREACH') return 'No hay ruta hasta el servidor (red caída).'
  return `No se pudo abrir (${c || mensaje.slice(0, 60) || 'error desconocido'}).`
}

export function fraseDeCodigo(status: number): string {
  if (status >= 500) return `Abre, pero falla por dentro (error ${status}): el servidor está vivo y la app no.`
  if (status === 404) return 'El servidor está vivo pero esa página no existe (404).'
  if (status === 401 || status === 403) return `Pide permiso (${status}): un miembro no podría entrar.`
  return `Responde con un código inesperado (${status}).`
}

// ─── Evaluación pura (testeable) ──────────────────────────────────────────────

export interface Sondeo { ok: boolean; status?: number; ms?: number; codigo?: string; mensaje?: string; urlFinal?: string }
export interface Certificado { venceEn?: string; dias?: number; valido: boolean; error?: string }

const esperadoOk = (status: number, esperado?: number[]) => esperado?.length ? esperado.includes(status) : status >= 200 && status < 300

/** El juicio de un sitio web: código, tiempo, certificado y el caso «solo por http» (4 oct). */
export function evaluarWeb(o: Pick<Objetivo, 'url' | 'esperado' | 'lentoMs'>, https: Sondeo, cert: Certificado | null, soloHttp: Sondeo | null, cfg: Pick<Config, 'lentoMs' | 'certAvisoDias'>): Medida {
  const detalle: Medida['detalle'] = { url: o.url ?? null, codigo: https.status ?? null, ms: https.ms ?? null, final: https.urlFinal && https.urlFinal !== o.url ? https.urlFinal : null, certificado: cert?.venceEn ?? null, error: https.ok ? null : (https.codigo ?? https.mensaje ?? null) }
  if (!https.ok) {
    if (soloHttp?.ok && soloHttp.status != null && soloHttp.status < 400) return { estado: 'caido', frase: 'Responde solo por http (sin candado): Chrome lo bloquea con «no puede proporcionar una conexión segura».', dato: null, detalle: { ...detalle, http: soloHttp.status } }
    return { estado: 'caido', frase: fraseDeError(https.codigo, https.mensaje), dato: null, detalle }
  }
  if (!esperadoOk(https.status!, o.esperado)) return { estado: 'caido', frase: fraseDeCodigo(https.status!), dato: null, ms: https.ms, detalle }
  const tope = o.lentoMs ?? cfg.lentoMs
  const certTxt = cert?.dias != null ? ` · certificado ${cert.dias} días` : ''
  if (cert && !cert.valido) return { estado: 'caido', frase: 'El certificado de seguridad no es válido: el navegador muestra «no es seguro».', dato: null, ms: https.ms, detalle }
  if (cert?.dias != null && cert.dias < 0) return { estado: 'caido', frase: 'El certificado de seguridad venció: el navegador muestra «no es seguro».', dato: null, ms: https.ms, detalle }
  if (cert?.dias != null && cert.dias < cfg.certAvisoDias) return { estado: 'lento', frase: `Abre, pero el certificado vence en ${cert.dias} ${cert.dias === 1 ? 'día' : 'días'}: si no se renueva, el navegador lo bloqueará.`, dato: `Abre en ${seg(https.ms!)}${certTxt}`, ms: https.ms, detalle }
  if (https.ms! > tope) return { estado: 'lento', frase: `Abre, pero tarda ${seg(https.ms!)} (lo normal es menos de ${seg(tope)}).`, dato: null, ms: https.ms, detalle }
  return { estado: 'ok', frase: null, dato: `Abre en ${seg(https.ms!)}${certTxt}`, ms: https.ms, detalle }
}

export interface Fila_pgnet { n: number; ultima: string | null; ok6h: number; total6h: number }
/** El mensajero de avisos de SFC (3 oct: 10,933 avisos atorados una semana con el servidor «vivo»). */
export function evaluarMensajero(m: Fila_pgnet, ahora = Date.now()): Medida {
  const detalle = { 'en fila': m.n, 'último despacho': m.ultima, 'entregados 6 h': `${m.ok6h}/${m.total6h}` }
  const ultima = m.ultima ? `último despacho ${haceTexto(m.ultima, ahora)}` : 'sin despachos registrados'
  if (m.n > 50) return { estado: 'caido', frase: `Hay ${m.n.toLocaleString('es-MX')} avisos (correos y push) esperando y nadie los despacha: el mensajero está parado. ${ultima[0].toUpperCase()}${ultima.slice(1)}.`, dato: null, detalle }
  if (m.total6h >= 4 && m.ok6h / m.total6h < 0.5) return { estado: 'lento', frase: `Despacha, pero ${m.total6h - m.ok6h} de ${m.total6h} avisos de las últimas 6 h fallaron al entregarse.`, dato: null, detalle }
  if (m.n > 10) return { estado: 'lento', frase: `Hay ${m.n} avisos en la fila: va atrasado.`, dato: null, detalle }
  return { estado: 'ok', frase: null, dato: `Fila vacía${m.n ? ` (${m.n})` : ''} · ${ultima}${m.total6h ? ` · ${m.ok6h}/${m.total6h} entregados en 6 h` : ''}`, detalle }
}

export interface Correos { pedidos: { titulo: string; creado: string; log: { status: string; sent: number; failed: number; recipients_total: number } | null; broadcast: boolean }[]; ultimo: { creado: string; status: string; sent: number; recipients_total: number } | null }
/** Correos de anuncios: cada anuncio de admin con «enviar por email» debe dejar fila en el registro de envíos. */
export function evaluarCorreos(c: Correos, ahora = Date.now()): Medida {
  const ult = c.ultimo
  const detalle = { 'último envío': ult?.creado ?? null, 'pedidos 72 h': c.pedidos.length }
  const ultimoTxt = ult ? `Último envío ${haceTexto(ult.creado, ahora)}: ${ult.sent} de ${ult.recipients_total} entregados` : 'Sin envíos registrados'
  for (const p of c.pedidos) {
    const min = (ahora - Date.parse(p.creado)) / 60_000
    if (p.log?.status === 'failed') return { estado: 'caido', frase: `El anuncio «${p.titulo}» pidió correo y el proveedor rechazó los ${p.log.recipients_total} envíos.`, dato: null, detalle }
    if (p.log?.status === 'no_recipients') return { estado: 'caido', frase: `El anuncio «${p.titulo}» pidió correo y no encontró a ningún miembro a quien mandarlo.`, dato: null, detalle }
    if (p.log?.status === 'partial') return { estado: 'lento', frase: `El anuncio «${p.titulo}» llegó a medias: ${p.log.sent} salieron y ${p.log.failed} fallaron.`, dato: null, detalle }
    if (!p.log && min >= 10) return { estado: 'caido', frase: `El anuncio «${p.titulo}» pidió correo ${haceTexto(p.creado, ahora)} y no salió ninguno${p.broadcast ? ': el envío se creó pero el mensajero no lo despachó' : ': ni siquiera se creó el envío'}.`, dato: null, detalle }
  }
  return { estado: 'ok', frase: null, dato: ultimoTxt, detalle }
}

/** Disco y memoria en juicio común a las dos máquinas. */
export function evaluarMaquina(m: { discoLibre: number; discoTotal: number; memDisponible: number; memTotal: number; carga: number; nucleos: number; arriba: number }, extra?: { fallas: string[] }): Medida {
  const pctDisco = Math.round((1 - m.discoLibre / m.discoTotal) * 100), pctMem = Math.round((1 - m.memDisponible / m.memTotal) * 100)
  const dias = Math.floor(m.arriba / 86400)
  const detalle = { disco: `${gb(m.discoLibre)} libres de ${gb(m.discoTotal)} (${pctDisco}% usado)`, memoria: `${gb(m.memDisponible)} disponibles de ${gb(m.memTotal)}`, carga: `${m.carga.toFixed(2)} en ${m.nucleos} núcleos`, encendida: `${dias} días`, ...(extra?.fallas.length ? { contenedores: extra.fallas.join(', ') } : {}) }
  const dato = `Disco ${pctDisco}% · memoria ${pctMem}% · encendida hace ${dias} ${dias === 1 ? 'día' : 'días'}`
  if (m.discoLibre < 8e9 || pctDisco >= 95) return { estado: 'caido', frase: `Disco casi lleno: quedan ${gb(m.discoLibre)}. Las bases y las compilaciones empiezan a fallar.`, dato, detalle }
  if (extra?.fallas.length) return { estado: 'lento', frase: `${extra.fallas.length === 1 ? 'Un servicio' : `${extra.fallas.length} servicios`} del servidor no está${extra.fallas.length === 1 ? '' : 'n'} sano${extra.fallas.length === 1 ? '' : 's'}: ${extra.fallas.slice(0, 3).join(', ')}.`, dato, detalle }
  if (pctDisco >= 85) return { estado: 'lento', frase: `El disco va al ${pctDisco}%: quedan ${gb(m.discoLibre)}.`, dato, detalle }
  if (m.memDisponible / m.memTotal < 0.05) return { estado: 'lento', frase: `Memoria casi agotada: quedan ${gb(m.memDisponible)}. Todo va más lento.`, dato, detalle }
  // La carga de macOS cuenta hilos en espera de disco: alta es lo normal con agentes. Solo el extremo cuenta.
  if (m.carga > m.nucleos * 4) return { estado: 'lento', frase: `Trabaja al límite (carga ${m.carga.toFixed(1)} con ${m.nucleos} núcleos): las respuestas tardan.`, dato, detalle }
  return { estado: 'ok', frase: null, dato, detalle }
}

/** Alarma (pura): racha de caídas por fila de «miembros»; avisa al llegar a 2 y una sola vez por incidente. */
export interface EstadoAlarma { rachas: Record<string, { racha: number; desde: string | null; avisado: string | null }> }
export function decidirAlarmas(prev: EstadoAlarma, filas: Pick<Fila, 'id' | 'grupo' | 'estado' | 'revisado'>[], umbral = 2): { estado: EstadoAlarma; avisar: string[]; volvieron: string[] } {
  const rachas: EstadoAlarma['rachas'] = {}, avisar: string[] = [], volvieron: string[] = []
  for (const f of filas) {
    const p = prev.rachas[f.id] ?? { racha: 0, desde: null, avisado: null }
    if (f.estado === 'caido') {
      const r = { racha: p.racha + 1, desde: p.desde ?? f.revisado, avisado: p.avisado }
      if (f.grupo === 'miembros' && r.racha >= umbral && !r.avisado) { avisar.push(f.id); r.avisado = f.revisado }
      rachas[f.id] = r
    } else if (f.estado === 'sin-dato') {
      // Sin dato no cuenta como caída ni como recuperación: el incidente sigue abierto tal cual.
      rachas[f.id] = p
    } else {
      if (p.avisado) volvieron.push(f.id)
      rachas[f.id] = { racha: 0, desde: f.estado === 'lento' ? (p.desde ?? f.revisado) : null, avisado: null }
    }
  }
  return { estado: { rachas }, avisar, volvieron }
}

// ─── Sondas (IO) ──────────────────────────────────────────────────────────────

const causa = (e: unknown): { codigo?: string; mensaje: string } => {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { codigo: 'TIMEOUT', mensaje: 'timeout' }
  return { codigo: err?.cause?.code, mensaje: err?.cause?.message ?? err?.message ?? 'error' }
}

export async function sondear(url: string, init: RequestInit = {}, timeout = TIMEOUT_MS): Promise<Sondeo & { cuerpo?: string }> {
  const t0 = performance.now()
  try {
    const r = await fetch(url, { redirect: 'follow', ...init, headers: { 'User-Agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeout), cache: 'no-store' })
    const ms = Math.round(performance.now() - t0)
    const cuerpo = init.method === 'HEAD' ? '' : await r.text().catch(() => '')
    return { ok: true, status: r.status, ms, urlFinal: r.url, cuerpo }
  } catch (e) { const c = causa(e); return { ok: false, ms: Math.round(performance.now() - t0), ...c } }
}

export function certificado(host: string, port = 443): Promise<Certificado> {
  return new Promise(res => {
    const s = tlsConnect({ host, port, servername: /^[\d.]+$/.test(host) ? undefined : host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const c = s.getPeerCertificate()
      const valido = s.authorized
      s.end()
      if (!c?.valid_to) return res({ valido, error: 'sin certificado' })
      const vence = new Date(c.valid_to)
      res({ valido, venceEn: vence.toISOString(), dias: Math.floor((vence.getTime() - Date.now()) / 86_400_000), error: valido ? undefined : String(s.authorizationError ?? '') })
    })
    s.on('error', e => res({ valido: false, error: (e as NodeJS.ErrnoException).code ?? e.message }))
    s.on('timeout', () => { s.destroy(); res({ valido: false, error: 'timeout' }) })
  })
}

const TRANSITORIOS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'UND_ERR_SOCKET', 'TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT'])

async function medirWeb(o: Objetivo, cfg: Config): Promise<Medida> {
  const u = new URL(o.url!)
  const https = new URL(u); https.protocol = 'https:'; if (u.protocol === 'http:' && u.port === '80') https.port = ''
  let [s, cert] = await Promise.all([sondear(https.toString()), certificado(https.hostname, Number(https.port) || 443)])
  // Un parpadeo (DNS que no contestó, conexión cortada) no es una caída: se confirma una vez antes de juzgar.
  // 4 oct: labs.*.sslip.io dio ENOTFOUND una sola vez y resolvía de nuevo al segundo.
  if (!s.ok && TRANSITORIOS.has(s.codigo ?? '')) {
    await new Promise(r => setTimeout(r, 1500))
    ;[s, cert] = await Promise.all([sondear(https.toString()), certificado(https.hostname, Number(https.port) || 443)])
  }
  // https falló sin ser DNS: ¿responde por http? Es el caso del 4 oct (Chrome forzó https y el host solo servía http).
  const soloHttp = !s.ok && s.codigo !== 'ENOTFOUND' ? await sondear(Object.assign(new URL(u), { protocol: 'http:' }).toString(), {}, 8000) : null
  const m = evaluarWeb({ ...o, url: https.toString() }, s, s.ok ? cert : null, soloHttp, cfg)
  return u.protocol === 'http:' && m.estado === 'ok' ? { ...m, estado: 'lento', frase: 'Abre por https, pero el enlace guardado es http: compártelo con https para que Chrome no lo bloquee.' } : m
}

let envCache: Record<string, string> | null = null
const credencial = (nombre?: string) => { if (!nombre) return ''; envCache ??= readEnvFile(); return process.env[nombre] ?? envCache[nombre] ?? '' }

async function medirSupabase(o: Objetivo): Promise<Medida> {
  const k = credencial(o.credencial)
  if (!k) return { estado: 'sin-dato', frase: `Falta la credencial ${o.credencial} en el servidor: no se pudo comprobar.`, dato: null, detalle: {} }
  const h = { apikey: k, Authorization: `Bearer ${k}` }
  const [auth, rest] = await Promise.all([sondear(`${o.url}/auth/v1/health`, { headers: { apikey: k } }), sondear(`${o.url}/rest/v1/profiles?select=id&limit=1`, { headers: h })])
  const detalle = { cuentas: auth.status ?? auth.codigo ?? null, base: rest.status ?? rest.codigo ?? null, 'ms cuentas': auth.ms ?? null, 'ms base': rest.ms ?? null }
  if (!auth.ok || auth.status !== 200) return { estado: 'caido', frase: `Los miembros no pueden iniciar sesión: el servicio de cuentas ${auth.ok ? `responde ${auth.status}` : 'no responde'}.`, dato: null, detalle }
  if (!rest.ok || rest.status !== 200) return { estado: 'caido', frase: `La base no responde (${rest.ok ? rest.status : rest.codigo ?? 'sin respuesta'}): el feed y los cursos no cargan.`, dato: null, detalle }
  const ms = Math.max(auth.ms!, rest.ms!)
  if (ms > 3000) return { estado: 'lento', frase: `Inicio de sesión y base responden, pero tardan ${seg(ms)}.`, dato: null, ms, detalle }
  return { estado: 'ok', frase: null, dato: `Inicio de sesión y base responden en ${seg(ms)}`, ms, detalle }
}

async function medirMensajero(o: Objetivo): Promise<Medida> {
  const pat = credencial(o.credencial)
  if (!pat) return { estado: 'sin-dato', frase: `Falta la credencial ${o.credencial} en el servidor: no se pudo medir la fila.`, dato: null, detalle: {} }
  const query = `select (select count(*) from net.http_request_queue)::int n, (select max(created) from net._http_response) ultima,
    (select count(*) filter (where status_code between 200 and 299) from net._http_response where created > now() - interval '6 hours')::int ok6h,
    (select count(*) from net._http_response where created > now() - interval '6 hours')::int total6h`
  const r = await sondear(o.url!, { method: 'POST', headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  if (!r.ok || (r.status !== 200 && r.status !== 201)) return { estado: 'sin-dato', frase: `No pude leer la fila del mensajero (compuerta SQL ${r.ok ? `respondió ${r.status}` : 'sin respuesta'}). No significa que esté bien.`, dato: null, detalle: { compuerta: r.status ?? r.codigo ?? null } }
  const fila = (JSON.parse(r.cuerpo || '[]') as { n: number; ultima: string | null; ok6h: number; total6h: number }[])[0]
  if (!fila) return { estado: 'sin-dato', frase: 'La compuerta respondió vacío: no hay medida.', dato: null, detalle: {} }
  return evaluarMensajero({ n: Number(fila.n), ultima: fila.ultima ? new Date(fila.ultima.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString() : null, ok6h: Number(fila.ok6h), total6h: Number(fila.total6h) })
}

async function medirCorreos(o: Objetivo): Promise<Medida> {
  const k = credencial(o.credencial)
  if (!k) return { estado: 'sin-dato', frase: `Falta la credencial ${o.credencial} en el servidor.`, dato: null, detalle: {} }
  const h = { apikey: k, Authorization: `Bearer ${k}` }
  const get = async <T>(path: string): Promise<T> => { const r = await sondear(`${o.url}/rest/v1/${path}`, { headers: h }); if (!r.ok || r.status !== 200) throw new Error(`REST ${r.status ?? r.codigo}`); return JSON.parse(r.cuerpo || '[]') as T }
  try {
    const desde = encodeURIComponent(new Date(Date.now() - 72 * 3600_000).toISOString())
    const [posts, ultimo] = await Promise.all([
      get<{ id: string; title: string | null; content: string | null; created_at: string; author_id: string }[]>(`posts?select=id,title,content,created_at,author_id&send_email_notification=eq.true&is_draft=eq.false&created_at=gte.${desde}&order=created_at.desc`),
      get<{ created_at: string; status: string; sent: number; recipients_total: number }[]>('admin_email_broadcast_log?select=created_at,status,sent,recipients_total&order=created_at.desc&limit=1'),
    ])
    let pedidos: Correos['pedidos'] = []
    if (posts.length) {
      const autores = [...new Set(posts.map(p => p.author_id))].join(',')
      const [perfiles, logs, bc] = await Promise.all([
        get<{ id: string; role: string }[]>(`profiles?select=id,role&id=in.(${autores})`),
        get<{ post_id: string; status: string; sent: number; failed: number; recipients_total: number }[]>(`admin_email_broadcast_log?select=post_id,status,sent,failed,recipients_total&created_at=gte.${desde}`),
        get<{ data: { post_id?: string } | null }[]>(`notifications?select=data&type=eq.admin_post_email_broadcast&created_at=gte.${desde}`),
      ])
      const admins = new Set(perfiles.filter(p => p.role === 'admin' || p.role === 'owner').map(p => p.id))
      const conBroadcast = new Set(bc.map(b => b.data?.post_id).filter(Boolean))
      pedidos = posts.filter(p => admins.has(p.author_id)).map(p => ({ titulo: limpiar(p.title || p.content), creado: p.created_at, log: logs.find(l => l.post_id === p.id) ?? null, broadcast: conBroadcast.has(p.id) }))
    }
    const u = ultimo[0]
    return evaluarCorreos({ pedidos, ultimo: u ? { creado: u.created_at, status: u.status, sent: u.sent, recipients_total: u.recipients_total } : null })
  } catch (e) {
    return { estado: 'sin-dato', frase: `No pude leer el registro de envíos (${e instanceof Error ? e.message : 'error'}). No significa que esté bien.`, dato: null, detalle: {} }
  }
}
const limpiar = (html: string | null) => { const t = (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > 42 ? `${t.slice(0, 42)}…` : t || 'sin título' }

/** pid de un servicio launchd (al detalle técnico). */
async function pidsLaunchd(): Promise<Map<string, { pid: number | null; codigo: number | null }>> {
  const m = new Map<string, { pid: number | null; codigo: number | null }>()
  try {
    const { stdout } = await run('launchctl', ['list'], { timeout: 8000 })
    for (const l of stdout.split('\n').slice(1)) { const [pid, st, label] = l.split('\t'); if (label) m.set(label, { pid: pid === '-' ? null : Number(pid), codigo: st === '-' ? null : Number(st) }) }
  } catch { /* sin launchctl: el detalle queda sin pid */ }
  return m
}

async function medirLocal(o: Objetivo): Promise<Medida> {
  const r = await sondear(o.url!, {}, 8000)
  const u = new URL(o.url!)
  const detalle = { puerto: Number(u.port) || null, codigo: r.status ?? null, ms: r.ms ?? null }
  if (!r.ok) return { estado: 'caido', frase: r.codigo === 'ECONNREFUSED' ? 'No está corriendo: nadie escucha en su puerto.' : fraseDeError(r.codigo, r.mensaje), dato: null, detalle: { ...detalle, error: r.codigo ?? r.mensaje ?? null } }
  // Vivo = contesta. 401 es la puerta con llave de un servicio sano; 5xx es un servicio enfermo.
  if (r.status! >= 500) return { estado: 'caido', frase: fraseDeCodigo(r.status!), dato: null, ms: r.ms, detalle }
  if (r.ms! > 3000) return { estado: 'lento', frase: `Responde, pero tarda ${seg(r.ms!)}.`, dato: null, ms: r.ms, detalle }
  return { estado: 'ok', frase: null, dato: `Responde ${rapido(r.ms!)}`, ms: r.ms, detalle }
}

async function medirMotor(): Promise<Medida> {
  try {
    const { motor } = await import('../motor/cliente.js')
    const { motor: m, terms } = await motor.info()
    const desde = new Date(m.started_ms).toISOString()
    return { estado: 'ok', frase: null, dato: `${terms.length} ${terms.length === 1 ? 'terminal' : 'terminales'} · encendido ${haceTexto(desde)}`, detalle: { pid: m.pid, relevos: m.relevos, socket: m.sock.replace(/^\/Users\/[^/]+/, '~') } }
  } catch (e) {
    return { estado: 'caido', frase: 'No responde: Levy no puede lanzar agentes ni ver sus terminales.', dato: null, detalle: { error: e instanceof Error ? e.message.slice(0, 80) : 'sin respuesta' } }
  }
}

/** El Funnel abre por dentro de Tailscale; desde internet abierto solo si su nombre existe en el DNS público. */
async function medirFunnel(o: Objetivo): Promise<Medida> {
  const u = new URL(o.url!)
  const [dentro, publico] = await Promise.all([
    sondear(o.url!, {}, 8000),
    sondear(`https://dns.google/resolve?name=${u.hostname}&type=A`, { headers: { accept: 'application/dns-json' } }, 8000),
  ])
  let dns: 'existe' | 'no-existe' | 'sin-dato' = 'sin-dato'
  try { if (publico.ok) { const j = JSON.parse(publico.cuerpo || '{}') as { Status?: number; Answer?: unknown[] }; dns = j.Status === 0 && j.Answer?.length ? 'existe' : j.Status === 3 ? 'no-existe' : 'sin-dato' } } catch { /* sin dato */ }
  const detalle = { url: o.url!, codigo: dentro.status ?? null, ms: dentro.ms ?? null, 'dns público': dns }
  if (!dentro.ok || dentro.status! >= 500) return { estado: 'caido', frase: `No abre ni dentro de Tailscale: ${dentro.ok ? fraseDeCodigo(dentro.status!) : fraseDeError(dentro.codigo, dentro.mensaje)}`, dato: null, detalle }
  if (dns === 'no-existe') return { estado: 'lento', frase: 'Abre solo con Tailscale encendido: desde internet abierto la dirección no existe (DNS público sin registro). Tu teléfono entra si tiene Tailscale.', dato: null, ms: dentro.ms, detalle }
  if (dns === 'sin-dato') return { estado: 'ok', frase: null, dato: `Abre por Tailscale en ${seg(dentro.ms!)} · DNS público sin comprobar`, ms: dentro.ms, detalle }
  return { estado: 'ok', frase: null, dato: `Abre en ${seg(dentro.ms!)}, con y sin Tailscale`, ms: dentro.ms, detalle }
}

async function medirTunel(o: Objetivo): Promise<Medida> {
  const m = await sondear(o.url!, {}, 4000)
  let host = ''
  try { host = (JSON.parse(m.cuerpo || '{}') as { hostname?: string }).hostname ?? '' } catch { /* sin host */ }
  if (!m.ok || !host) return { estado: 'caido', frase: 'El túnel de Cloudflare no está corriendo: la segunda puerta está cerrada (el Funnel sigue siendo la principal).', dato: null, detalle: { metricas: o.url! } }
  const r = await sondear(`https://${host}/health`, {}, 10_000)
  const detalle = { direccion: host, codigo: r.status ?? r.codigo ?? null, ms: r.ms ?? null }
  if (!r.ok || r.status! >= 500) return { estado: 'caido', frase: `El túnel está encendido pero no llega al servidor de Levy (${r.ok ? r.status : r.codigo ?? 'sin respuesta'}).`, dato: null, detalle }
  return { estado: 'ok', frase: null, dato: `Abre desde internet en ${seg(r.ms!)}`, ms: r.ms, detalle }
}

async function medirStudio(): Promise<Medida> {
  try {
    const [{ stdout: df }, { stdout: vm }] = await Promise.all([run('df', ['-k', '/System/Volumes/Data'], { timeout: 5000 }), run('vm_stat', [], { timeout: 5000 })])
    const c = df.trim().split('\n').pop()!.trim().split(/\s+/)
    const total = Number(c[1]) * 1024, libre = Number(c[3]) * 1024
    const pag = Number(/page size of (\d+)/.exec(vm)?.[1] ?? 16384)
    const v = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(vm)?.[1] ?? 0)
    const disponible = (v('Pages free') + v('Pages inactive') + v('Pages speculative') + v('Pages purgeable')) * pag
    return evaluarMaquina({ discoLibre: libre, discoTotal: total, memDisponible: disponible, memTotal: totalmem(), carga: loadavg()[0], nucleos: cpus().length, arriba: uptime() })
  } catch (e) { return { estado: 'sin-dato', frase: `No pude leer disco y memoria (${e instanceof Error ? e.message.slice(0, 60) : 'error'}).`, dato: null, detalle: {} } }
}

/** VPS por SSH, solo lectura: uptime, disco, memoria, carga y contenedores enfermos (unhealthy o reiniciándose;
 *  los «Exited» son trabajos de una vez o laboratorios detenidos a propósito). Nada destructivo. */
export function leerVps(salida: string): { maquina: Parameters<typeof evaluarMaquina>[0]; fallas: string[] } {
  const sec = (n: string) => salida.split(`@@${n}\n`)[1]?.split('@@')[0]?.trim() ?? ''
  const arriba = Number(sec('uptime').split(/\s+/)[0])
  const df = sec('df').split('\n').pop()!.trim().split(/\s+/)
  const mem = sec('free').split('\n').find(l => l.startsWith('Mem:'))!.trim().split(/\s+/)
  const fallas = sec('docker').split('\n').filter(l => /\(unhealthy\)|Restarting/.test(l)).map(l => l.split('\t')[0]).filter(Boolean)
  return { maquina: { arriba, discoTotal: Number(df[1]) * 1024, discoLibre: Number(df[3]) * 1024, memTotal: Number(mem[1]), memDisponible: Number(mem[6]), carga: Number(sec('load').split(/\s+/)[0]), nucleos: Number(sec('nproc')) || 1 }, fallas }
}

async function medirVps(o: Objetivo): Promise<Medida> {
  const cmd = 'echo @@uptime; cat /proc/uptime; echo @@df; df -Pk /; echo @@free; free -b; echo @@load; cat /proc/loadavg; echo @@nproc; nproc; echo @@docker; docker ps -a --format "{{.Names}}\t{{.Status}}"; echo @@fin'
  try {
    const { stdout } = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new', o.ssh!, cmd], { timeout: 20_000, maxBuffer: 1_000_000 })
    const { maquina, fallas } = leerVps(stdout)
    const m = evaluarMaquina(maquina, { fallas })
    return { ...m, detalle: { ...m.detalle, ssh: o.ssh! } }
  } catch (e) {
    const err = e as { code?: string | number; stderr?: string; killed?: boolean }
    const porque = err.killed ? 'no respondió en 20 s' : /timed out|No route|Connection refused/i.test(err.stderr ?? '') ? 'no hay ruta por Tailscale' : 'la conexión falló'
    return { estado: 'sin-dato', frase: `No pude entrar por SSH (${porque}). Mira los sitios de arriba: si abren, el VPS está vivo.`, dato: null, detalle: { ssh: o.ssh!, error: (err.stderr ?? String(err.code ?? '')).trim().slice(0, 100) || null } }
  }
}

async function medir(o: Objetivo, cfg: Config): Promise<Medida> {
  try {
    switch (o.tipo) {
      case 'web': return await medirWeb(o, cfg)
      case 'supabase': return await medirSupabase(o)
      case 'mensajero': return await medirMensajero(o)
      case 'correos': return await medirCorreos(o)
      case 'local': return await medirLocal(o)
      case 'motor': return await medirMotor()
      case 'funnel': return await medirFunnel(o)
      case 'tunel': return await medirTunel(o)
      case 'studio': return await medirStudio()
      case 'vps': return await medirVps(o)
    }
    return { estado: 'sin-dato', frase: `Tipo de comprobación desconocido (${String(o.tipo)}).`, dato: null, detalle: {} }
  } catch (e) {
    return { estado: 'sin-dato', frase: `La comprobación falló por dentro (${e instanceof Error ? e.message.slice(0, 80) : 'error'}). No significa que esté bien.`, dato: null, detalle: {} }
  }
}

// ─── Revisión, caché y alarma ─────────────────────────────────────────────────

const ARCHIVO = () => process.env.ARBRAIN_SERVIDORES_ESTADO || join(STORE_DIR, 'servidores-estado.json')
interface Guardado { foto: Foto | null; alarma: EstadoAlarma }
function leerGuardado(): Guardado { try { return JSON.parse(readFileSync(ARCHIVO(), 'utf8')) as Guardado } catch { return { foto: null, alarma: { rachas: {} } } } }
function guardar(g: Guardado) { try { mkdirSync(dirname(ARCHIVO()), { recursive: true }); writeFileSync(ARCHIVO() + '.tmp', JSON.stringify(g)); renameSync(ARCHIVO() + '.tmp', ARCHIVO()) } catch (e) { logger.warn({ err: e }, 'servidores: no se pudo guardar el estado') } }

export type Avisador = (aviso: { title: string; body: string; kind: 'alerta' | 'sistema'; tag: string }) => Promise<boolean>

/** La campana de Arbrain (política única en arbrain/src/features/avisos). `ARBRAIN_SERVIDORES_AVISO_USUARIO` = pruebas contra QA. */
export const avisarACampana: Avisador = async a => {
  if (process.env.ARBRAIN_SERVIDORES_AVISOS === '0') { logger.info({ aviso: a.title }, 'servidores: aviso apagado por env'); return false }
  const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_URL'])
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_GATEWAY_TOKEN, mc = process.env.MC_URL ?? env.MC_URL ?? 'http://127.0.0.1:3300'
  if (!token) { logger.warn('servidores: sin OPENCLAW_GATEWAY_TOKEN, aviso perdido'); return false }
  const usuario = process.env.ARBRAIN_SERVIDORES_AVISO_USUARIO
  const url = '/panel?vista=' + encodeURIComponent(JSON.stringify({ id: 'aviso-servidores', input: { vista: 'servidores' } }))
  try {
    const r = await fetch(`${mc}/api/notifications/send`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: a.title, body: a.body, url, tag: a.tag, source: 'servidores', kind: a.kind, ...(usuario ? { userId: usuario } : {}) }), signal: AbortSignal.timeout(15_000) })
    return r.ok
  } catch (e) { logger.warn({ err: e }, 'servidores: aviso no entregado'); return false }
}

let enCurso: Promise<Foto> | null = null

/** Una revisión completa: mide todo en paralelo, decide alarmas, avisa y guarda la foto. */
export async function revisar(o: { config?: Config; avisar?: Avisador } = {}): Promise<Foto> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    const cfg = o.config ?? cargarConfig()
    const t0 = Date.now(), revisado = new Date().toISOString()
    const grupos: [Grupo, Objetivo[]][] = [['miembros', cfg.miembros], ['cerebro', cfg.cerebro], ['maquinas', cfg.maquinas]]
    const [medidas, pids] = await Promise.all([Promise.all(grupos.flatMap(([g, os]) => os.map(async x => ({ g, x, m: await medir(x, cfg) })))), pidsLaunchd()])
    const previo = leerGuardado()
    const base = medidas.map(({ g, x, m }) => {
      const svc = x.servicio ? pids.get(x.servicio) : undefined
      const detalle = { ...m.detalle, ...(x.servicio ? { servicio: x.servicio, pid: svc?.pid ?? null } : {}) }
      return { id: x.id, grupo: g, nombre: x.nombre, que: x.que, abrir: x.abrir ?? (x.tipo === 'web' ? x.url : undefined), endpoint: endpointDe(x), revisado, ...m, detalle }
    })
    const { estado, avisar, volvieron } = decidirAlarmas(previo.alarma, base)
    const filas: Fila[] = base.map(f => ({ ...f, racha: estado.rachas[f.id]?.racha ?? 0, desde: estado.rachas[f.id]?.desde ?? null }))
    const avisador = o.avisar ?? avisarACampana
    for (const id of avisar) {
      const f = filas.find(x => x.id === id)!
      const ok = await avisador({ title: `${f.nombre} no abre para tus miembros`, body: `${f.frase ?? 'Caído'} (2 revisiones seguidas, desde ${new Date(f.desde ?? revisado).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}).`, kind: 'alerta', tag: `servidores-${f.id}` })
      if (!ok) estado.rachas[id].avisado = null // reintenta en la siguiente revisión
      logger.warn({ id, entregado: ok }, 'servidores: alarma de miembros')
    }
    for (const id of volvieron) {
      const f = filas.find(x => x.id === id)!
      await avisador({ title: `${f.nombre} volvió`, body: `Vuelve a abrir para tus miembros (${f.dato ?? 'sano'}).`, kind: 'sistema', tag: `servidores-${f.id}` })
    }
    const foto: Foto = {
      revisadoEn: revisado, cadenciaMin: cfg.cadenciaMin, siguienteEn: new Date(t0 + cfg.cadenciaMin * 60_000).toISOString(), filas, duracionMs: Date.now() - t0,
      alarmas: Object.entries(estado.rachas).filter(([, r]) => r.avisado).map(([id, r]) => ({ id, nombre: filas.find(f => f.id === id)?.nombre ?? id, desde: r.desde ?? revisado, avisado: r.avisado! })),
    }
    guardar({ foto, alarma: estado })
    return foto
  })().finally(() => { enCurso = null })
  return enCurso
}

/** Lo que pide la vista: la última foto si está fresca; si no (o `ahora`), una revisión nueva. Nunca martilla:
 *  `ahora` respeta un mínimo de 30 s entre revisiones. */
export async function servidores(o: { ahora?: boolean } = {}): Promise<Foto> {
  const g = leerGuardado()
  const cfg = cargarConfig()
  const edad = g.foto ? Date.now() - Date.parse(g.foto.revisadoEn) : Infinity
  if (g.foto && (o.ahora ? edad < 30_000 : edad < (cfg.cadenciaMin + 1) * 60_000)) return g.foto
  return revisar({ config: cfg })
}

let vigia: ReturnType<typeof setInterval> | null = null
/** El sensor del servidor: revisa cada `cadenciaMin` aunque nadie mire. `ARBRAIN_SERVIDORES=0` lo apaga. */
export function arrancarVigia(): void {
  if (vigia || process.env.ARBRAIN_SERVIDORES === '0') return
  let cfg: Config
  try { cfg = cargarConfig() } catch (e) { logger.error({ err: e }, 'servidores: config ilegible, vigía apagado'); return }
  const pasada = () => void revisar().then(f => logger.info({ caidos: f.filas.filter(x => x.estado === 'caido').map(x => x.id), ms: f.duracionMs }, 'servidores: revisión'), e => logger.warn({ err: e }, 'servidores: revisión fallida'))
  setTimeout(pasada, 20_000).unref()
  vigia = setInterval(pasada, cfg.cadenciaMin * 60_000)
  vigia.unref()
}
