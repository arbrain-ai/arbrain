/**
 * Business Intelligence · fuente Postgres: un cliente mínimo del protocolo de cable v3, sin dependencias (solo `node:*`).
 *
 * Viaja a la edición del alumno: su base (Supabase, Neon, la suya) se lee sin instalar `pg`. Solo consulta SIMPLE (mensaje
 * 'Q'): el llamador manda su transacción de solo lectura entera y aquí se devuelve una tabla de texto por sentencia que trae
 * filas. Nada de tipos: todo llega como texto (NULL = null), igual que en psql; el llamador sabe qué columna es número o fecha.
 *
 * Seguridad: la contraseña nunca entra a un mensaje de error, ni la URL completa. SSL con semántica de libpq `require` (cifra,
 * no verifica el certificado): es lo que usan Supabase y la mayoría de los proveedores con su URL por defecto.
 */
import net from 'node:net'
import tls from 'node:tls'
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

export interface ConexionPg { host: string; port: number; user: string; password: string | null; database: string; ssl: 'disable' | 'prefer' | 'require' }
export interface ResultadoPg { columnas: string[]; filas: (string | null)[][] }

const SSL: Record<string, ConexionPg['ssl']> = { disable: 'disable', allow: 'prefer', prefer: 'prefer', require: 'require', 'verify-ca': 'require', 'verify-full': 'require' }

const decodifica = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

/** postgres://usuario:contraseña@host:puerto/base?sslmode=… → la conexión. Los errores nunca repiten la contraseña. */
export function parsearUrlPg(url: string): ConexionPg {
  const t = (url ?? '').trim()
  if (!/^postgres(?:ql)?:\/\//i.test(t)) throw new Error('La URL de Postgres debe empezar con postgres:// o postgresql://.')
  let u: URL
  try { u = new URL(t) } catch { throw new Error('La URL de Postgres no se entiende: revisa que sea postgres://usuario:contraseña@host:puerto/base (los caracteres raros de la contraseña van con %).') }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host) throw new Error('La URL de Postgres no trae host.')
  const user = decodifica(u.username)
  if (!user) throw new Error('La URL de Postgres no trae usuario (postgres://usuario:contraseña@host/base).')
  const port = u.port ? Number(u.port) : 5432
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto de la URL de Postgres no es válido.')
  const base = decodifica(u.pathname.replace(/^\//, ''))
  const modo = (u.searchParams.get('sslmode') ?? 'prefer').trim().toLowerCase()
  const ssl = SSL[modo]
  if (!ssl) throw new Error(`sslmode «${modo}» no existe; usa disable, prefer, require, verify-ca o verify-full.`)
  return { host, port, user, password: u.password ? decodifica(u.password) : null, database: base || user, ssl }
}

// ── El cable: mensajes de Postgres con un búfer acumulador ──

/** Un mensaje del servidor: su tipo de una letra y su cuerpo (sin el largo). */
interface Mensaje { tipo: string; cuerpo: Buffer }

/** Lee del socket sin perder bytes: mensajes partidos entre trozos o varios en un trozo. Solo concatena cuando ya llegó lo que falta. */
class Cable {
  private trozos: Buffer[] = []
  private total = 0
  private cabecera: { tipo: string; largo: number } | null = null
  private despierta: (() => void) | null = null
  private fallo: Error | null = null
  private soltar: (() => void) | null = null

  conecta(s: net.Socket) {
    const datos = (d: Buffer) => { this.trozos.push(d); this.total += d.length; this.avisa() }
    const error = (e: Error) => this.falla(e)
    const cierre = () => this.falla(new Error('Postgres cerró la conexión antes de terminar.'))
    s.on('data', datos); s.on('error', error); s.on('close', cierre)
    this.soltar = () => { s.off('data', datos); s.off('close', cierre) } // el 'error' se queda: un socket sin oyente tumba el proceso
  }
  /** Suelta el socket crudo para subirlo a TLS. */
  desconecta() { this.soltar?.(); this.soltar = null }
  get pendientes() { return this.total }

  falla(e: Error) { if (!this.fallo) this.fallo = e; this.avisa() }
  get error() { return this.fallo }
  private avisa() { const d = this.despierta; this.despierta = null; d?.() }

  private toma(n: number): Buffer | null {
    if (this.total < n) return null
    if (n === 0) return Buffer.alloc(0)
    if (this.trozos[0].length < n) this.trozos = [Buffer.concat(this.trozos, this.total)]
    const t = this.trozos[0], out = t.subarray(0, n)
    if (t.length === n) this.trozos.shift(); else this.trozos[0] = t.subarray(n)
    this.total -= n
    return out
  }

  private async espera() {
    if (this.fallo) throw this.fallo
    await new Promise<void>(r => { this.despierta = r })
    if (this.fallo) throw this.fallo
  }

  async bytes(n: number): Promise<Buffer> {
    for (;;) { const b = this.toma(n); if (b) return b; await this.espera() }
  }

  async mensaje(): Promise<Mensaje> {
    for (;;) {
      if (!this.cabecera) {
        const c = this.toma(5)
        if (c) {
          const largo = c.readInt32BE(1)
          if (largo < 4 || largo > 0x40000000) throw new Error('Postgres mandó un mensaje que no se entiende (¿de verdad es un Postgres en ese puerto?).')
          this.cabecera = { tipo: String.fromCharCode(c[0]), largo: largo - 4 }
        }
      }
      if (this.cabecera) {
        const cuerpo = this.toma(this.cabecera.largo)
        if (cuerpo) { const m = { tipo: this.cabecera.tipo, cuerpo }; this.cabecera = null; return m }
      }
      await this.espera()
    }
  }
}

// ── Mensajes del cliente ──

const cstr = (s: string) => Buffer.from(`${s}\0`, 'utf8')
function msg(tipo: string, ...partes: Buffer[]): Buffer {
  const cuerpo = Buffer.concat(partes)
  const cab = Buffer.alloc(5)
  cab.write(tipo, 0, 'latin1'); cab.writeInt32BE(cuerpo.length + 4, 1)
  return Buffer.concat([cab, cuerpo])
}
const int32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b }

function inicio(c: ConexionPg): Buffer {
  const params = { user: c.user, database: c.database, application_name: 'arbrain-bi', client_encoding: 'UTF8' }
  const cuerpo = Buffer.concat([int32(196608), ...Object.entries(params).map(([k, v]) => Buffer.concat([cstr(k), cstr(v)])), Buffer.from([0])])
  return Buffer.concat([int32(cuerpo.length + 4), cuerpo])
}

/** Campos de ErrorResponse / NoticeResponse: (código de una letra, texto) hasta un 0. */
function campos(b: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < b.length && b[i] !== 0) {
    const k = String.fromCharCode(b[i]), fin = b.indexOf(0, i + 1)
    if (fin < 0) break
    out[k] = b.toString('utf8', i + 1, fin)
    i = fin + 1
  }
  return out
}
const errorPg = (b: Buffer) => { const f = campos(b); return new Error(`Postgres: ${f.M ?? 'error sin mensaje'} (${f.C ?? '?'})`) }

// ── Autenticación ──

const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex')
const hmac = (k: Buffer, s: string | Buffer) => createHmac('sha256', k).update(s).digest()
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()

/**
 * SASLprep ligero (RFC 4013) como lo hace Postgres: espacios raros a espacio, lo «mapeado a nada» fuera y NFKC. Si trae algo
 * prohibido, Postgres usa la contraseña cruda, y aquí también. No revisa puntos sin asignar ni bidi (contraseñas exóticas).
 */
function saslprep(p: string): string {
  if (/^[\x20-\x7e]*$/.test(p)) return p
  const mapeada = p.replace(/[   -​  　]/g, ' ').replace(/[­͏᠆᠋-᠍‌‍⁠︀-️﻿]/g, '').normalize('NFKC')
  if (/[\x00-\x1f\x7f-\x9f̀́‎‏‪-‮⁪-⁯⿰-⿻-﷐-﷯￹-�￾￿\ud800-\udfff]/.test(mapeada.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))) return p
  return mapeada
}

const sinContrasena = () => new Error('Postgres pide contraseña y la URL no la trae.')

async function autentica(cable: Cable, enviar: (b: Buffer) => void, c: ConexionPg): Promise<void> {
  let scram: { primeraDesnuda: string; clientNonce: string; firmaServidor?: Buffer } | null = null
  for (;;) {
    const m = await cable.mensaje()
    if (m.tipo === 'E') throw errorPg(m.cuerpo)
    if (m.tipo === 'N' || m.tipo === 'v') continue
    if (m.tipo !== 'R') throw new Error(`Postgres respondió algo inesperado al saludar (mensaje «${m.tipo}»).`)
    const codigo = m.cuerpo.readInt32BE(0)
    if (codigo === 0) {
      if (scram && !scram.firmaServidor) throw new Error('Postgres no completó la verificación SCRAM.')
      return
    }
    if (codigo === 3) {
      if (c.password === null) throw sinContrasena()
      enviar(msg('p', cstr(c.password)))
    } else if (codigo === 5) {
      if (c.password === null) throw sinContrasena()
      const sal = m.cuerpo.subarray(4, 8)
      enviar(msg('p', cstr(`md5${md5(Buffer.concat([Buffer.from(md5(c.password + c.user)), sal]))}`)))
    } else if (codigo === 10) {
      const mecanismos = m.cuerpo.toString('utf8', 4).split('\0').filter(Boolean)
      if (!mecanismos.includes('SCRAM-SHA-256')) {
        if (mecanismos.includes('SCRAM-SHA-256-PLUS')) throw new Error('Postgres solo acepta SCRAM-SHA-256-PLUS (con channel binding), que este cliente no implementa; permite SCRAM-SHA-256 en el servidor.')
        throw new Error(`Postgres pide un método SASL que no sé usar (${mecanismos.join(', ') || 'ninguno'}).`)
      }
      if (c.password === null) throw sinContrasena()
      const clientNonce = randomBytes(18).toString('base64')
      // Postgres ignora el usuario de SCRAM (usa el del arranque): libpq manda «n=» vacío.
      const primeraDesnuda = `n=,r=${clientNonce}`
      const datos = Buffer.from(`n,,${primeraDesnuda}`, 'utf8')
      enviar(msg('p', cstr('SCRAM-SHA-256'), int32(datos.length), datos))
      scram = { primeraDesnuda, clientNonce }
    } else if (codigo === 11) {
      if (!scram || c.password === null) throw new Error('Postgres siguió un SCRAM que no empezó.')
      const primeraServidor = m.cuerpo.toString('utf8', 4)
      const attrs = Object.fromEntries(primeraServidor.split(',').map(p => [p.slice(0, 1), p.slice(2)]))
      const nonce = attrs.r ?? '', iter = Number(attrs.i)
      if (!nonce.startsWith(scram.clientNonce) || nonce.length <= scram.clientNonce.length) throw new Error('Postgres devolvió un nonce SCRAM que no corresponde.')
      if (!attrs.s || !Number.isInteger(iter) || iter < 1) throw new Error('Postgres mandó un desafío SCRAM incompleto.')
      const salada = pbkdf2Sync(saslprep(c.password), Buffer.from(attrs.s, 'base64'), iter, 32, 'sha256')
      const clientKey = hmac(salada, 'Client Key')
      const sinPrueba = `c=biws,r=${nonce}` // biws = base64(«n,,»): sin channel binding
      const authMessage = `${scram.primeraDesnuda},${primeraServidor},${sinPrueba}`
      const firmaCliente = hmac(sha256(clientKey), authMessage)
      const prueba = Buffer.alloc(clientKey.length)
      for (let i = 0; i < prueba.length; i++) prueba[i] = clientKey[i] ^ firmaCliente[i]
      scram.firmaServidor = hmac(hmac(salada, 'Server Key'), authMessage)
      enviar(msg('p', Buffer.from(`${sinPrueba},p=${prueba.toString('base64')}`, 'utf8')))
    } else if (codigo === 12) {
      if (!scram?.firmaServidor) throw new Error('Postgres cerró un SCRAM que no empezó.')
      const final = m.cuerpo.toString('utf8', 4)
      if (final.startsWith('e=')) throw new Error(`Postgres rechazó el SCRAM: ${final.slice(2)}.`)
      const v = /(?:^|,)v=([^,]*)/.exec(final)?.[1]
      const recibida = v ? Buffer.from(v, 'base64') : Buffer.alloc(0)
      // La prueba de que el servidor también conoce la contraseña: si no coincide, no es el Postgres que dice ser.
      if (recibida.length !== scram.firmaServidor.length || !timingSafeEqual(recibida, scram.firmaServidor)) throw new Error('La firma SCRAM del servidor no coincide: no es el Postgres que dice ser. Me desconecto.')
    } else {
      throw new Error(`Postgres pide un método de autenticación que no sé usar (código ${codigo}); usa scram-sha-256, md5 o password.`)
    }
  }
}

// ── La consulta ──

function filaDe(b: Buffer): (string | null)[] {
  const n = b.readInt16BE(0), fila: (string | null)[] = new Array(n)
  let i = 2
  for (let k = 0; k < n; k++) {
    const largo = b.readInt32BE(i); i += 4
    if (largo < 0) { fila[k] = null; continue }
    fila[k] = b.toString('utf8', i, i + largo); i += largo
  }
  return fila
}

function columnasDe(b: Buffer): string[] {
  const n = b.readInt16BE(0), out: string[] = []
  let i = 2
  for (let k = 0; k < n; k++) {
    const fin = b.indexOf(0, i)
    out.push(b.toString('utf8', i, fin))
    i = fin + 1 + 18 // oid de tabla (4), columna (2), oid de tipo (4), largo (2), typmod (4), formato (2)
  }
  return out
}

async function corre(cable: Cable, enviar: (b: Buffer) => void, sql: string): Promise<ResultadoPg[]> {
  if (sql.includes('\0')) throw new Error('La consulta trae un carácter nulo.')
  enviar(msg('Q', cstr(sql)))
  const resultados: ResultadoPg[] = []
  let actual: ResultadoPg | null = null
  for (;;) {
    const m = await cable.mensaje()
    switch (m.tipo) {
      case 'T': actual = { columnas: columnasDe(m.cuerpo), filas: [] }; resultados.push(actual); break
      case 'D': actual?.filas.push(filaDe(m.cuerpo)); break
      case 'E': throw errorPg(m.cuerpo)
      case 'Z': return resultados
      // Un COPY FROM STDIN esperaría datos para siempre: se cancela y Postgres responde con su error.
      case 'G': enviar(msg('f', cstr('arbrain-bi no manda datos de COPY.'))); break
      case 'C': case 'I': case 'n': case 'N': case 'S': case 'K': case 't': case 'A': case 'H': case 'd': case 'c': break
      default: break
    }
  }
}

// ── La conexión completa ──

const lugar = (c: ConexionPg) => `${net.isIPv6(c.host) ? `[${c.host}]` : c.host}:${c.port}`
const RAZONES: Record<string, string> = {
  ECONNREFUSED: 'nadie escucha en ese puerto',
  ENOTFOUND: 'ese host no existe',
  EAI_AGAIN: 'no se pudo resolver el host (¿hay internet?)',
  ETIMEDOUT: 'no contestó a tiempo',
  EHOSTUNREACH: 'el host no es alcanzable',
  ENETUNREACH: 'la red no es alcanzable',
  ECONNRESET: 'el servidor cortó la conexión',
}
const razon = (e: NodeJS.ErrnoException) => (e.code && RAZONES[e.code]) || e.message

/**
 * Abre, autentica, corre `sql` por consulta simple y cierra. Devuelve una tabla por cada sentencia que trajo filas (las que
 * mandaron RowDescription), en orden. Un error de Postgres rechaza con «Postgres: <mensaje> (<SQLSTATE>)».
 */
export async function consultarPg(url: string, sql: string, op: { timeoutMs?: number } = {}): Promise<ResultadoPg[]> {
  const c = parsearUrlPg(url)
  const ms = op.timeoutMs ?? 20_000
  const cable = new Cable()
  let conectado = false
  let socket: net.Socket = net.connect({ host: c.host, port: c.port })
  // El error de conexión se dice en palabras; va primero para ganarle al mensaje crudo de Node.
  socket.prependOnceListener('error', (e: NodeJS.ErrnoException) => { if (!conectado) cable.falla(new Error(`No se pudo conectar a ${lugar(c)}: ${razon(e)}.`)) })
  socket.once('connect', () => { conectado = true })
  socket.setNoDelay(true)
  cable.conecta(socket)
  const enviar = (b: Buffer) => { socket.write(b) }
  /** Despedida limpia (Terminate) y, si el servidor no cierra, se corta igual. */
  const cierra = () => {
    if (socket.destroyed) return
    try { socket.end(msg('X')) } catch { /* ya cerrado */ }
    const s = socket
    setTimeout(() => s.destroy(), 1000).unref()
  }
  const reloj = setTimeout(() => {
    cable.falla(new Error(`Postgres no respondió en ${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s.`))
    socket.destroy()
  }, ms)
  try {
    if (c.ssl !== 'disable') {
      enviar(Buffer.concat([int32(8), int32(80877103)]))
      const r = String.fromCharCode((await cable.bytes(1))[0])
      if (r === 'S') {
        // Bytes en claro detrás de la «S» serían inyección antes del cifrado (CVE-2021-23222): se corta.
        if (cable.pendientes > 0) throw new Error('Postgres mandó datos sin cifrar antes de TLS; me desconecto.')
        cable.desconecta()
        const seguro = tls.connect({ socket, servername: net.isIP(c.host) ? undefined : c.host, rejectUnauthorized: false })
        socket = seguro
        cable.conecta(seguro)
        await new Promise<void>((ok, mal) => {
          seguro.once('secureConnect', () => ok())
          seguro.once('error', e => mal(new Error(`Falló el cifrado TLS con ${lugar(c)}: ${e.message}`)))
          seguro.once('close', () => mal(cable.error ?? new Error(`${lugar(c)} cerró la conexión durante TLS.`)))
        })
      } else if (r === 'N') {
        if (c.ssl === 'require') throw new Error(`${lugar(c)} no acepta SSL y la URL pide sslmode=require; usa sslmode=prefer solo si confías en la red.`)
      } else {
        throw new Error(`${lugar(c)} no respondió como Postgres al pedir SSL.`)
      }
    }

    enviar(inicio(c))
    await autentica(cable, enviar, c)
    // Tras autenticar: parámetros, llave de cancelación y «listo para consultas».
    for (;;) {
      const m = await cable.mensaje()
      if (m.tipo === 'E') throw errorPg(m.cuerpo)
      if (m.tipo === 'Z') break
    }
    const resultados = await corre(cable, enviar, sql)
    cierra()
    return resultados
  } catch (e) {
    cierra()
    // Si ya venció el tiempo, ese es el error que cuenta (lo demás es su eco).
    const final = cable.error && /no respondió en/.test(cable.error.message) ? cable.error : e
    const m = final instanceof Error ? final.message : String(final)
    // Defensa final: si un mensaje externo trae la contraseña tal cual, se tapa.
    throw new Error(c.password && c.password.length >= 4 ? m.split(c.password).join('•••') : m)
  } finally {
    clearTimeout(reloj)
  }
}
