// Archivos que Levy genera, abiertos y descargados desde el chat (29 oct 2026, T6 de docs/builds/mejoras-cohorte-2026-10-29).
// Rutas del chat → enlace firmado; la ruta que sirve, en edición cliente sobre un cerebro temporal (nunca el real).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rutaArchivoLocal, rutaEntregableEnCodigo, urlDescarga, nombreArchivo } from '../../src/lib/archivos-chat'
import {
  cabecerasArchivo, disposicion, ErrorArchivo, firmarArchivo, resolverArchivoChat, urlArchivoFirmado, verificarArchivo, VIGENCIA_MS,
} from '../../src/lib/archivos-chat-server'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { GET as servir } from '../../src/app/api/chat/archivo/f/[token]/[nombre]/route'

const RAIZ = join(__dirname, '..', '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

// ── Conversión de rutas (cliente, puro) ──

test('rutaArchivoLocal: absoluta, ~/, file://, relativa al cerebro y Windows se convierten', () => {
  assert.equal(rutaArchivoLocal('/Users/fulano/Arbrain/entregas/propuesta.pdf'), '/Users/fulano/Arbrain/entregas/propuesta.pdf')
  assert.equal(rutaArchivoLocal('/home/fulano/Arbrain/x.csv'), '/home/fulano/Arbrain/x.csv')
  assert.equal(rutaArchivoLocal('~/Arbrain/entregas/propuesta.pdf'), '~/Arbrain/entregas/propuesta.pdf')
  assert.equal(rutaArchivoLocal('file:///Users/fulano/Arbrain/Mi%20propuesta.pdf'), '/Users/fulano/Arbrain/Mi propuesta.pdf')
  assert.equal(rutaArchivoLocal('file:///C:/Users/fulano/Arbrain/x.pdf'), 'C:/Users/fulano/Arbrain/x.pdf')
  assert.equal(rutaArchivoLocal('entregas/propuesta.pdf'), 'entregas/propuesta.pdf')
  assert.equal(rutaArchivoLocal('./entregas/propuesta.pdf'), 'entregas/propuesta.pdf')
  assert.equal(rutaArchivoLocal('entregas/Mi%20propuesta.docx'), 'entregas/Mi propuesta.docx')
  assert.equal(rutaArchivoLocal('C:\\Users\\fulano\\Arbrain\\x.pdf'), 'C:\\Users\\fulano\\Arbrain\\x.pdf')
})

test('rutaArchivoLocal: URLs normales, anclas, rutas de la app y palabras sueltas NO se tocan', () => {
  for (const h of ['https://ejemplo.org/guia.pdf', 'http://ejemplo.com/a.png', 'mailto:yo@x.com', '#seccion', '?q=1', '//cdn.x/y.js',
    '/chat', '/api/version', '/brand/logo.png', 'javascript:alert(1)', 'obsidian://open?x', 'entregas', '', undefined, null]) {
    assert.equal(rutaArchivoLocal(h as string), null, String(h))
  }
})

test('rutaEntregableEnCodigo: en código en línea solo los entregables (pdf, docx, csv, html…), no el código ni las memorias', () => {
  assert.equal(rutaEntregableEnCodigo('~/Arbrain/entregas/propuesta.pdf'), '~/Arbrain/entregas/propuesta.pdf')
  assert.equal(rutaEntregableEnCodigo('/Users/fulano/Arbrain/clientes/ventas.csv'), '/Users/fulano/Arbrain/clientes/ventas.csv')
  assert.equal(rutaEntregableEnCodigo('entregas/reporte.html'), 'entregas/reporte.html')
  assert.equal(rutaEntregableEnCodigo('arbrain/server/src/server.ts'), null)
  assert.equal(rutaEntregableEnCodigo('.claude/memory/MEMORY.md'), null)
  assert.equal(rutaEntregableEnCodigo('npm run build'), null)
  assert.equal(rutaEntregableEnCodigo('https://x.com/a.pdf'), null)
})

test('nombre y descarga', () => {
  assert.equal(nombreArchivo('/a/b/propuesta.pdf'), 'propuesta.pdf')
  assert.equal(nombreArchivo('C:\\a\\b\\hoja.xlsx'), 'hoja.xlsx')
  assert.equal(urlDescarga('/api/chat/archivo/f/t/x.pdf'), '/api/chat/archivo/f/t/x.pdf?descargar=1')
})

test('el chat usa la conversión: enlaces, código en línea y urlTransform que no borra file:// ni C:\\', () => {
  const md = leer('src/features/chat/components/MarkdownMessage.tsx')
  assert.match(md, /urlTransform=\{urlTransformChat\}/)
  assert.match(md, /a: Enlace,/)
  assert.match(md, /rutaEntregableEnCodigo\(raw\)/)
  const enlace = leer('src/features/chat/components/EnlaceArchivo.tsx')
  assert.match(enlace, /Descargar/)
  assert.match(enlace, /abrirEnNavegador/, 'en la app de escritorio abre en el navegador del sistema')
})

// ── Edición cliente: lista blanca y proxy ──

test('cliente: firmar pide sesión; servir pasa sin cookie (la firma es la sesión de ese archivo)', () => {
  assert.equal(apiPermitidaEnCliente('/api/chat/archivo'), true)
  assert.equal(apiPermitidaEnCliente('/api/chat/archivo/f/tok/x.pdf'), true)
  assert.deepEqual(decidirCliente('/api/chat/archivo', false, false), { tipo: 'json', status: 401, error: 'Abre Arbrain desde la app.' })
  assert.deepEqual(decidirCliente('/api/chat/archivo', true, false), { tipo: 'pasa' })
  assert.deepEqual(decidirCliente('/api/chat/archivo/f/tok/x.pdf', false, false), { tipo: 'pasa' })
  // El nombre termina en .png: el matcher del proxy lo vuelve a incluir para que aplique la regla de Host.
  assert.match(leer('src/proxy.ts'), /'\/api\/chat\/archivo\/:path\*'/)
})

// ── Servidor sobre un cerebro temporal ──

let base: string, ws: string, fuera: string, abierta: string, config: string, datos: string
const antes: Record<string, string | undefined> = {}
const VARS = ['ARBRAIN_EDICION', 'ARBRAIN_HOME', 'ARBRAIN_CONFIG_DIR', 'ARBRAIN_DATA_DIR']

before(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'archivos-chat-')))
  ws = join(base, 'Arbrain'); fuera = join(base, 'fuera'); abierta = join(base, 'Proyecto'); config = join(base, 'datos', 'config'); datos = join(ws, 'datos-app')
  for (const d of [join(ws, 'entregas'), join(ws, '.git'), join(ws, '.ssh'), join(ws, '.claude', 'artefactos'), fuera, abierta, config, datos]) mkdirSync(d, { recursive: true })
  writeFileSync(join(ws, 'entregas', 'propuesta.pdf'), '%PDF-1.4 hola')
  writeFileSync(join(ws, 'entregas', 'reporte.html'), '<script>alert(1)</script><h1>Hola</h1>')
  writeFileSync(join(ws, 'entregas', 'ventas.csv'), 'a,b\n1,2\n')
  writeFileSync(join(ws, 'entregas', 'contrato.docx'), 'PK')
  writeFileSync(join(ws, 'entregas', 'Cotización Año.pdf'), '%PDF')
  writeFileSync(join(ws, '.claude', 'artefactos', 'tabla.csv'), 'x')
  writeFileSync(join(ws, '.env'), 'OPENAI=sk-xxx')
  writeFileSync(join(ws, 'entregas', 'id_rsa'), 'llave')
  writeFileSync(join(ws, 'entregas', 'credenciales.txt'), 'clave')
  writeFileSync(join(ws, '.git', 'config'), '[core]')
  writeFileSync(join(ws, '.ssh', 'known_hosts'), 'x')
  writeFileSync(join(datos, 'chat.db'), 'x')
  writeFileSync(join(fuera, 'secreto.pdf'), '%PDF')
  writeFileSync(join(abierta, 'plan.pdf'), '%PDF abierta')
  symlinkSync(join(fuera, 'secreto.pdf'), join(ws, 'entregas', 'atajo.pdf'))
  writeFileSync(join(config, 'carpetas-abiertas.json'), JSON.stringify({ carpetas: [{ ruta: abierta, abierta: 1 }] }))
  for (const v of VARS) antes[v] = process.env[v]
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_HOME = ws
  process.env.ARBRAIN_CONFIG_DIR = config
  process.env.ARBRAIN_DATA_DIR = datos
})

after(() => {
  for (const v of VARS) { if (antes[v] === undefined) delete process.env[v]; else process.env[v] = antes[v] }
  rmSync(base, { recursive: true, force: true })
})

async function rechaza(ruta: string, status: number, op = {}) {
  await assert.rejects(resolverArchivoChat(ruta, op), (e: unknown) => e instanceof ErrorArchivo && e.status === status, ruta)
}

test('resolver: absoluta, relativa al cerebro, ~/ y carpeta abierta en Ajustes', async () => {
  assert.equal((await resolverArchivoChat(join(ws, 'entregas', 'propuesta.pdf'))).real, join(ws, 'entregas', 'propuesta.pdf'))
  assert.equal((await resolverArchivoChat('entregas/ventas.csv')).nombre, 'ventas.csv')
  assert.equal((await resolverArchivoChat('~/Arbrain/entregas/propuesta.pdf', { home: base })).real, join(ws, 'entregas', 'propuesta.pdf'))
  assert.equal((await resolverArchivoChat(join(abierta, 'plan.pdf'))).real, join(abierta, 'plan.pdf'))
  assert.equal((await resolverArchivoChat('.claude/artefactos/tabla.csv')).nombre, 'tabla.csv', 'los artefactos de Levy viven en .claude')
})

test('resolver: fuera, secretos, .git, .ssh, carpeta de la app, traversal y enlace simbólico hacia fuera → no', async () => {
  await rechaza(join(fuera, 'secreto.pdf'), 403)
  await rechaza('/etc/hosts', 403)
  await rechaza('.env', 403)
  await rechaza('entregas/id_rsa', 403)
  await rechaza('entregas/credenciales.txt', 403)
  await rechaza('.git/config', 403)
  await rechaza('.ssh/known_hosts', 403)
  await rechaza('datos-app/chat.db', 403)
  await rechaza('entregas/../../fuera/secreto.pdf', 400)
  await rechaza(`${ws}/entregas/../.env`, 400)
  await rechaza('entregas/atajo.pdf', 403)
  await rechaza('entregas/no-existe.pdf', 404)
  await rechaza('entregas', 400)
})

test('firma: vale para ese archivo y vence; alterada o de la vista documento, no', () => {
  const real = join(ws, 'entregas', 'propuesta.pdf')
  const t = firmarArchivo(real, 1_000)
  assert.equal(verificarArchivo(t, 1_000), real)
  assert.equal(verificarArchivo(t, 1_000 + VIGENCIA_MS), null, 'vencida')
  const [cuerpo, firma] = t.split('.')
  const otro = Buffer.from(JSON.stringify({ d: `archivo-chat:${join(fuera, 'secreto.pdf')}`, e: 9e15 })).toString('base64url')
  assert.equal(verificarArchivo(`${otro}.${firma}`), null, 'cuerpo cambiado')
  assert.equal(verificarArchivo(`${cuerpo}.x${firma.slice(1)}`, 1_000), null, 'firma cambiada')
  assert.equal(verificarArchivo(''), null)
})

const pedir = (url: string, init?: RequestInit) => {
  const u = new URL(url, 'http://127.0.0.1:4399')
  const [, , , , , token, nombre] = u.pathname.split('/')
  return servir(new Request(u, init), { params: Promise.resolve({ token, nombre }) })
}

test('servir: PDF se abre (200, application/pdf, inline con nombre)', async () => {
  const r = await pedir(urlArchivoFirmado(join(ws, 'entregas', 'propuesta.pdf')))
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'application/pdf')
  assert.match(r.headers.get('content-disposition') ?? '', /^inline; filename="propuesta\.pdf"/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await r.text(), '%PDF-1.4 hola')
})

test('servir: ?descargar=1 baja el archivo; docx siempre se descarga con su tipo', async () => {
  const r = await pedir(urlDescarga(urlArchivoFirmado(join(ws, 'entregas', 'propuesta.pdf'))))
  assert.match(r.headers.get('content-disposition') ?? '', /^attachment; filename="propuesta\.pdf"/)
  const d = await pedir(urlArchivoFirmado(join(ws, 'entregas', 'contrato.docx')))
  assert.equal(d.status, 200)
  assert.match(d.headers.get('content-type') ?? '', /wordprocessingml/)
  assert.match(d.headers.get('content-disposition') ?? '', /^attachment;/)
})

test('servir: HTML con CSP sandbox (sus scripts no corren en el origen de la app); CSV como texto', async () => {
  const h = await pedir(urlArchivoFirmado(join(ws, 'entregas', 'reporte.html')))
  assert.equal(h.status, 200)
  assert.match(h.headers.get('content-type') ?? '', /^text\/html/)
  const csp = h.headers.get('content-security-policy') ?? ''
  assert.match(csp, /^sandbox/)
  assert.doesNotMatch(csp, /allow-same-origin/)
  const c = await pedir(urlArchivoFirmado(join(ws, 'entregas', 'ventas.csv')))
  assert.match(c.headers.get('content-type') ?? '', /^text\/plain/)
  assert.match(c.headers.get('content-disposition') ?? '', /^inline;/)
})

test('servir: acentos en el nombre con filename* UTF-8; nombre en la URL distinto al firmado → 404', async () => {
  const url = urlArchivoFirmado(join(ws, 'entregas', 'Cotización Año.pdf'))
  const r = await pedir(url)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-disposition') ?? '', /filename="Cotizacion Ano\.pdf"; filename\*=UTF-8''Cotizaci%C3%B3n%20A%C3%B1o\.pdf/)
  const otro = url.replace(/\/[^/]+$/, '/estilos.css')
  assert.equal((await pedir(otro)).status, 404)
  assert.equal(disposicion('a"b\r\n.pdf', true), `attachment; filename="a_b__.pdf"; filename*=UTF-8''a_b__.pdf`)
})

test('servir: token vencido o inventado → 403; secreto o fuera aunque venga firmado → 403', async () => {
  const real = join(ws, 'entregas', 'propuesta.pdf')
  const vencido = `/api/chat/archivo/f/${firmarArchivo(real, Date.now() - VIGENCIA_MS - 1)}/propuesta.pdf`
  assert.equal((await pedir(vencido)).status, 403)
  assert.equal((await pedir('/api/chat/archivo/f/abc.def/propuesta.pdf')).status, 403)
  // Firmas que el endpoint de firma nunca daría (comprueba la segunda validación al servir).
  assert.equal((await pedir(urlArchivoFirmado(join(ws, '.env')))).status, 403)
  assert.equal((await pedir(urlArchivoFirmado(join(fuera, 'secreto.pdf')))).status, 403)
  assert.equal((await pedir(urlArchivoFirmado(join(ws, 'datos-app', 'chat.db')))).status, 403)
})

test('servir: Range para video y audio en el teléfono', async () => {
  const r = await pedir(urlArchivoFirmado(join(ws, 'entregas', 'propuesta.pdf')), { headers: { range: 'bytes=0-3' } })
  assert.equal(r.status, 206)
  assert.equal(r.headers.get('content-range'), 'bytes 0-3/13')
  assert.equal(await r.text(), '%PDF')
})

test('cabeceras: qué se ve y qué se descarga', () => {
  assert.equal(cabecerasArchivo('a.pdf', false).ver, true)
  assert.equal(cabecerasArchivo('a.pdf', false).csp, null, 'Chrome no pinta un PDF con sandbox')
  assert.equal(cabecerasArchivo('a.svg', false).csp?.startsWith('sandbox'), true)
  assert.equal(cabecerasArchivo('a.xlsx', false).ver, false)
  assert.equal(cabecerasArchivo('a.raro', false).tipo, 'application/octet-stream')
})

test('instalación de Daniel: fuera de su lista (por ejemplo /etc) tampoco se sirve', async () => {
  await rechaza('/etc/hosts', 403, { env: { ARBRAIN_EDICION: 'original', BUSINESS_OS_ROOT: ws }, home: base })
  const r = await resolverArchivoChat('entregas/propuesta.pdf', { env: { ARBRAIN_EDICION: 'original', BUSINESS_OS_ROOT: ws }, home: base })
  assert.equal(r.nombre, 'propuesta.pdf')
})
