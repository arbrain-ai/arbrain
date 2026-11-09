/**
 * Cliente mínimo de Postgres (fuentes/pg.ts) contra un servidor falso que habla el protocolo de cable v3 de verdad:
 * SCRAM-SHA-256 verificado del lado servidor (StoredKey/ServerKey), MD5, errores, tiempo límite y sslmode.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { consultarPg, parsearUrlPg, type ResultadoPg } from '../../src/features/bi/fuentes/pg'

// ── El servidor falso ──

const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b }
const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b }
const cs = (s: string) => Buffer.from(`${s}\0`, 'utf8')
const m = (tipo: string, ...partes: Buffer[]) => { const c = Buffer.concat(partes); return Buffer.concat([Buffer.from(tipo, 'latin1'), i32(c.length + 4), c]) }
const auth = (codigo: number, extra: Buffer = Buffer.alloc(0)) => m('R', i32(codigo), extra)
const listo = Buffer.concat([m('S', cs('server_version'), cs('17.0')), m('S', cs('client_encoding'), cs('UTF8')), m('K', i32(42), i32(7)), m('Z', Buffer.from('I'))])
const columnas = (...cols: string[]) => m('T', i16(cols.length), ...cols.map(c => Buffer.concat([cs(c), i32(0), i16(0), i32(25), i16(-1), i32(-1), i16(0)])))
const fila = (...vals: (string | null)[]) => m('D', i16(vals.length), ...vals.map(v => { if (v === null) return i32(-1); const b = Buffer.from(v, 'utf8'); return Buffer.concat([i32(b.length), b]) }))
const hecho = (tag: string) => m('C', cs(tag))
const fallo = (sev: string, codigo: string, texto: string) => m('E', Buffer.from('S'), cs(sev), Buffer.from('V'), cs(sev), Buffer.from('C'), cs(codigo), Buffer.from('M'), cs(texto), Buffer.from([0]))
const aviso = m('N', Buffer.from('S'), cs('NOTICE'), Buffer.from('C'), cs('00000'), Buffer.from('M'), cs('solo un aviso'), Buffer.from([0]))
const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex')
const hmac = (k: Buffer, s: string) => createHmac('sha256', k).update(s).digest()
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()

/** Lee lo que manda el cliente: el arranque (sin tipo) y luego mensajes con tipo. */
class Oido {
  private buf = Buffer.alloc(0)
  private despierta: (() => void) | null = null
  private cerrado = false
  constructor(s: net.Socket) {
    s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.avisa() })
    s.on('close', () => { this.cerrado = true; this.avisa() })
    s.on('error', () => {})
  }
  private avisa() { const d = this.despierta; this.despierta = null; d?.() }
  async bytes(n: number): Promise<Buffer> {
    while (this.buf.length < n) {
      if (this.cerrado) throw new Error('el cliente cerró')
      await new Promise<void>(r => { this.despierta = r })
    }
    const out = this.buf.subarray(0, n); this.buf = this.buf.subarray(n)
    return out
  }
  async arranque() { return this.bytes((await this.bytes(4)).readInt32BE(0) - 4) }
  async mensaje() { const c = await this.bytes(5); return { tipo: String.fromCharCode(c[0]), cuerpo: await this.bytes(c.readInt32BE(1) - 4) } }
}

interface Escenario {
  auth: 'scram' | 'md5' | 'trust'
  password?: string
  /** El servidor firma mal el final de SCRAM (impostor). */
  firmaFalsa?: boolean
  /** Lo que contesta al 'Q'. */
  respuesta?: Buffer
  /** Escribe de 3 en 3 bytes: mensajes partidos entre trozos. */
  goteo?: boolean
  /** Acepta y nunca contesta. */
  mudo?: boolean
}

async function servidor(e: Escenario) {
  const visto = { ssl: 0, arranque: {} as Record<string, string>, sql: [] as string[], scram: false, mecanismo: '', adios: false }
  let adios: () => void = () => {}
  const despedida = new Promise<void>(r => { adios = r })
  const sockets = new Set<net.Socket>()
  const srv = net.createServer(s => { sockets.add(s); if (!e.mudo) atender(s).catch(() => s.destroy()) })

  async function atender(s: net.Socket) {
    const o = new Oido(s)
    const enviar = async (b: Buffer) => {
      if (!e.goteo) { s.write(b); return }
      for (let i = 0; i < b.length; i += 3) { s.write(b.subarray(i, i + 3)); await new Promise(r => setImmediate(r)) }
    }
    let a = await o.arranque()
    if (a.readInt32BE(0) === 80877103) { visto.ssl++; s.write('N'); a = await o.arranque() }
    assert.equal(a.readInt32BE(0), 196608, 'protocolo 3.0')
    const pares = a.toString('utf8', 4).split('\0')
    for (let i = 0; i + 1 < pares.length && pares[i]; i += 2) visto.arranque[pares[i]] = pares[i + 1]
    const user = visto.arranque.user
    const password = e.password ?? ''

    if (e.auth === 'md5') {
      const sal = randomBytes(4)
      await enviar(auth(5, sal))
      const p = await o.mensaje()
      const esperado = `md5${md5(Buffer.concat([Buffer.from(md5(password + user)), sal]))}`
      if (p.tipo !== 'p' || p.cuerpo.toString('utf8', 0, p.cuerpo.length - 1) !== esperado) {
        await enviar(fallo('FATAL', '28P01', `password authentication failed for user "${user}"`)); s.end(); return
      }
    } else if (e.auth === 'scram') {
      // Lo que guarda Postgres: sal, iteraciones, StoredKey y ServerKey (nunca la contraseña).
      const sal = randomBytes(16), iter = 4096
      const salada = pbkdf2Sync(password, sal, iter, 32, 'sha256')
      const storedKey = sha256(hmac(salada, 'Client Key')), serverKey = hmac(salada, 'Server Key')
      await enviar(auth(10, Buffer.concat([cs('SCRAM-SHA-256-PLUS'), cs('SCRAM-SHA-256'), Buffer.from([0])])))
      const ini = await o.mensaje()
      assert.equal(ini.tipo, 'p')
      const fin = ini.cuerpo.indexOf(0)
      visto.mecanismo = ini.cuerpo.toString('utf8', 0, fin)
      const largo = ini.cuerpo.readInt32BE(fin + 1)
      const primera = ini.cuerpo.toString('utf8', fin + 5, fin + 5 + largo)
      assert.ok(primera.startsWith('n,,'), 'gs2 sin channel binding')
      const primeraDesnuda = primera.slice(3)
      const nonceCliente = /(?:^|,)r=([^,]+)/.exec(primeraDesnuda)![1]
      const nonce = nonceCliente + randomBytes(12).toString('base64')
      const primeraServidor = `r=${nonce},s=${sal.toString('base64')},i=${iter}`
      await enviar(auth(11, Buffer.from(primeraServidor)))
      const ultima = (await o.mensaje()).cuerpo.toString('utf8')
      const corte = ultima.lastIndexOf(',p=')
      const sinPrueba = ultima.slice(0, corte), prueba = Buffer.from(ultima.slice(corte + 3), 'base64')
      assert.equal(sinPrueba, `c=biws,r=${nonce}`)
      const authMessage = `${primeraDesnuda},${primeraServidor},${sinPrueba}`
      const firmaCliente = hmac(storedKey, authMessage)
      const clientKey = Buffer.from(prueba.map((b, i) => b ^ firmaCliente[i]))
      if (prueba.length !== 32 || !sha256(clientKey).equals(storedKey)) {
        await enviar(fallo('FATAL', '28P01', `password authentication failed for user "${user}"`)); s.end(); return
      }
      visto.scram = true
      const firma = e.firmaFalsa ? randomBytes(32) : hmac(serverKey, authMessage)
      await enviar(auth(12, Buffer.from(`v=${firma.toString('base64')}`)))
    }
    await enviar(Buffer.concat([auth(0), listo]))
    const q = await o.mensaje()
    assert.equal(q.tipo, 'Q')
    visto.sql.push(q.cuerpo.toString('utf8', 0, q.cuerpo.length - 1))
    await enviar(e.respuesta ?? Buffer.concat([hecho('SELECT 0'), m('Z', Buffer.from('I'))]))
    const x = await o.mensaje()
    if (x.tipo === 'X') { visto.adios = true; adios() }
    s.end()
  }

  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
  const port = (srv.address() as net.AddressInfo).port
  return {
    port, visto, despedida,
    cerrar: () => new Promise<void>(r => { for (const s of sockets) s.destroy(); srv.close(() => r()) }),
  }
}

const SQL = "BEGIN READ ONLY; SET LOCAL statement_timeout = '15s'; SELECT dia, ventas FROM v; SELECT cliente FROM c; COMMIT;"
const dentroDe = (p: Promise<void>, ms = 2000) => Promise.race([p, new Promise<void>((_, mal) => setTimeout(() => mal(new Error('sin Terminate')), ms).unref())])

// ── Las pruebas ──

test('SCRAM-SHA-256 completo (prueba verificada por el servidor) y dos sentencias con filas, NULL y acentos', async () => {
  const grande = 'ñ'.repeat(100_000) // 200 KB en UTF-8: el DataRow llega en varios trozos y se corta a media letra
  const srv = await servidor({
    auth: 'scram', password: 'contraseña segura 1',
    respuesta: Buffer.concat([
      hecho('BEGIN'), hecho('SET'),
      columnas('dia', 'ventas'), fila('2026-11-01', '1500.50'), fila('2026-11-02', null), hecho('SELECT 2'),
      aviso,
      columnas('cliente', 'nota'), fila('Cliente Ñandú', 'pagó €'), fila('Pan & Café 😀', ''), fila(grande, null), hecho('SELECT 3'),
      hecho('COMMIT'), m('Z', Buffer.from('I')),
    ]),
  })
  try {
    const url = `postgres://bi:${encodeURIComponent('contraseña segura 1')}@127.0.0.1:${srv.port}/negocio`
    const r = await consultarPg(url, SQL)
    const esperado: ResultadoPg[] = [
      { columnas: ['dia', 'ventas'], filas: [['2026-11-01', '1500.50'], ['2026-11-02', null]] },
      { columnas: ['cliente', 'nota'], filas: [['Cliente Ñandú', 'pagó €'], ['Pan & Café 😀', ''], [grande, null]] },
    ]
    assert.deepEqual(r, esperado)
    assert.equal(srv.visto.scram, true)
    assert.equal(srv.visto.mecanismo, 'SCRAM-SHA-256', 'elige SCRAM sin PLUS aunque el servidor ofrezca ambos')
    assert.equal(srv.visto.ssl, 1, 'prefer pide SSL y sigue en claro con «N»')
    assert.deepEqual(srv.visto.arranque, { user: 'bi', database: 'negocio', application_name: 'arbrain-bi', client_encoding: 'UTF8' })
    assert.deepEqual(srv.visto.sql, [SQL])
    await dentroDe(srv.despedida)
    assert.equal(srv.visto.adios, true, 'manda Terminate')
  } finally { await srv.cerrar() }
})

test('MD5 con sslmode=disable y respuestas que llegan de 3 en 3 bytes', async () => {
  const srv = await servidor({
    auth: 'md5', password: 'p@ss:word', goteo: true,
    respuesta: Buffer.concat([columnas('n', 'texto'), fila('1', 'acción'), fila(null, 'niño'), hecho('SELECT 2'), m('Z', Buffer.from('I'))]),
  })
  try {
    const r = await consultarPg(`postgresql://ana:p%40ss%3Aword@127.0.0.1:${srv.port}?sslmode=disable`, 'SELECT 1')
    assert.deepEqual(r, [{ columnas: ['n', 'texto'], filas: [['1', 'acción'], [null, 'niño']] }])
    assert.equal(srv.visto.ssl, 0, 'disable no manda SSLRequest')
    assert.equal(srv.visto.arranque.database, 'ana', 'la base por defecto es el usuario')
  } finally { await srv.cerrar() }
})

test('ErrorResponse → «Postgres: <mensaje> (<SQLSTATE>)»', async () => {
  const srv = await servidor({ auth: 'trust', respuesta: Buffer.concat([hecho('BEGIN'), fallo('ERROR', '42P01', 'relation "ventas" does not exist'), m('Z', Buffer.from('E'))]) })
  try {
    await assert.rejects(consultarPg(`postgres://bi@127.0.0.1:${srv.port}/x`, 'BEGIN READ ONLY; SELECT * FROM ventas; COMMIT;'), { message: 'Postgres: relation "ventas" does not exist (42P01)' })
  } finally { await srv.cerrar() }
})

test('contraseña equivocada en SCRAM: el error es de Postgres y no trae la contraseña', async () => {
  const srv = await servidor({ auth: 'scram', password: 'la-correcta-123' })
  try {
    const err = await consultarPg(`postgres://bi:equivocada-456@127.0.0.1:${srv.port}/x`, 'SELECT 1').then(() => null, (e: Error) => e)
    assert.ok(err, 'debía fallar')
    assert.equal(err.message, 'Postgres: password authentication failed for user "bi" (28P01)')
    assert.ok(!err.message.includes('equivocada-456') && !err.message.includes('la-correcta-123'))
  } finally { await srv.cerrar() }
})

test('SCRAM con firma del servidor falsa: se rechaza aunque el servidor diga que sí', async () => {
  const srv = await servidor({ auth: 'scram', password: 'secreto-789', firmaFalsa: true })
  try {
    await assert.rejects(consultarPg(`postgres://bi:secreto-789@127.0.0.1:${srv.port}/x`, 'SELECT 1'), (e: Error) => /firma SCRAM del servidor no coincide/.test(e.message) && !e.message.includes('secreto-789'))
    assert.deepEqual(srv.visto.sql, [], 'no llegó a consultar')
  } finally { await srv.cerrar() }
})

test('servidor que nunca responde: error de tiempo en palabras', async () => {
  const srv = await servidor({ auth: 'trust', mudo: true })
  try {
    const t0 = Date.now()
    await assert.rejects(consultarPg(`postgres://bi:secreto@127.0.0.1:${srv.port}/x`, 'SELECT 1', { timeoutMs: 300 }), { message: 'Postgres no respondió en 0.3 s.' })
    assert.ok(Date.now() - t0 < 2000)
  } finally { await srv.cerrar() }
})

test('sslmode=require con un servidor sin SSL: falla antes de mandar usuario', async () => {
  const srv = await servidor({ auth: 'trust' })
  try {
    await assert.rejects(consultarPg(`postgres://bi:secreto@127.0.0.1:${srv.port}/x?sslmode=require`, 'SELECT 1'), /no acepta SSL y la URL pide sslmode=require/)
    assert.equal(srv.visto.ssl, 1)
    assert.deepEqual(srv.visto.arranque, {}, 'no mandó el StartupMessage en claro')
  } finally { await srv.cerrar() }
})

test('puerto sin nadie: «No se pudo conectar a host:puerto» en palabras', async () => {
  const srv = await servidor({ auth: 'trust' })
  const port = srv.port
  await srv.cerrar()
  await assert.rejects(consultarPg(`postgres://bi:secreto@127.0.0.1:${port}/x`, 'SELECT 1', { timeoutMs: 3000 }), { message: `No se pudo conectar a 127.0.0.1:${port}: nadie escucha en ese puerto.` })
})

test('parsearUrlPg: percent-encoding, puerto, sslmode y valores por defecto', () => {
  assert.deepEqual(parsearUrlPg('postgresql://usu%40rio:p%40ss%3Aw%2Frd%23@db.ejemplo.com:6543/mi%20base?sslmode=require'), {
    host: 'db.ejemplo.com', port: 6543, user: 'usu@rio', password: 'p@ss:w/rd#', database: 'mi base', ssl: 'require',
  })
  assert.deepEqual(parsearUrlPg('postgres://bi@localhost'), { host: 'localhost', port: 5432, user: 'bi', password: null, database: 'bi', ssl: 'prefer' })
  assert.equal(parsearUrlPg('postgres://u:p@h/d?sslmode=verify-full').ssl, 'require')
  assert.equal(parsearUrlPg('postgres://u:p@h/d?sslmode=verify-ca').ssl, 'require')
  assert.equal(parsearUrlPg('postgres://u:p@h/d?sslmode=disable').ssl, 'disable')
  assert.equal(parsearUrlPg('postgres://u:p@h/d?sslmode=prefer&connect_timeout=5').ssl, 'prefer')
  assert.equal(parsearUrlPg('postgres://u:p@[::1]:5433/d').host, '::1')
  // Los errores se dicen en palabras y nunca repiten la contraseña.
  const sin = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => re.test(e.message) && !e.message.includes('secreto'))
  sin(() => parsearUrlPg('mysql://u:secreto@h/d'), /postgres:\/\/ o postgresql:\/\//)
  sin(() => parsearUrlPg('postgres://u:secreto@h/d?sslmode=loco'), /sslmode «loco»/)
  sin(() => parsearUrlPg('postgres://:secreto@h/d'), /no trae usuario/)
  sin(() => parsearUrlPg('postgres://u:secreto@h:99999/d'), /no se entiende|puerto/)
})
