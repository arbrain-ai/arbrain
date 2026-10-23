// Edición cliente (empaquetado, 11 oct 2026): lista blanca, proxy sin Supabase, daemon local fijo, config genérica.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiPermitidaEnCliente, esEdicionCliente, paginaPermitidaEnCliente, seccionPanelPermitida } from '../../src/lib/edicion'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { dirConfigArbrain, raizWorkspace } from '../../src/lib/rutas-instalacion'
import { INSTALACION as GENERICA } from '../../src/config/instalacion.plantilla'
import { INSTALACION as DANIEL } from '../../src/config/instalacion'

const previo = { ...process.env }
afterEach(() => {
  for (const k of ['ARBRAIN_EDICION', 'ARBRAIN_DATA_DIR', 'ARBRAIN_CONFIG_DIR', 'ARBRAIN_HOME', 'BUSINESS_OS_ROOT']) {
    if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]
  }
})

test('sin variable la instalación es la de Daniel; con ARBRAIN_EDICION=cliente, cliente', () => {
  assert.equal(esEdicionCliente({}), false)
  assert.equal(esEdicionCliente({ ARBRAIN_EDICION: 'cliente' }), true)
  assert.equal(esEdicionCliente({ ARBRAIN_EDICION: 'daniel' }), false)
})

test('lista blanca: chat, panel, lienzo y seguridad sí; negocio de Daniel no', () => {
  for (const r of ['/api/storage/upload', '/api/storage/adjunto/chat-1761100000000-a1b2c3.png', '/api/chat/stream', '/api/chat/sessions/abc/messages', '/api/canvas/pages', '/api/manos/interruptor', '/api/cabina/memoria', '/api/primer-arranque', '/api/confirmaciones', '/api/monitoreo/estado']) {
    assert.equal(apiPermitidaEnCliente(r), true, r)
  }
  for (const r of ['/api/finanzas', '/api/analytics/polar', '/api/salud', '/api/equipo', '/api/biblioteca', '/api/canvas-x', '/api/cabina/masterclass', '/api/cabina/negocio', '/api/calendar/events', '/api/openclaw/event', '/api/storage', '/api/storage/otra', '/api/actualizacion']) {
    assert.equal(apiPermitidaEnCliente(r), false, r)
  }
  assert.equal(paginaPermitidaEnCliente('/chat'), true)
  assert.equal(paginaPermitidaEnCliente('/finanzas'), false)
  assert.equal(seccionPanelPermitida('finanzas', true), false)
  assert.equal(seccionPanelPermitida('lienzo', true), true)
  assert.equal(seccionPanelPermitida('finanzas', false), true)
})

test('proxy cliente: sin sesión no entra nadie; complete y el canje del secreto pasan; el negocio es 404', () => {
  assert.deepEqual(decidirCliente('/api/chat/stream', false), { tipo: 'json', status: 401, error: 'Abre Arbrain desde la app.' })
  assert.deepEqual(decidirCliente('/api/chat/stream', true), { tipo: 'pasa' })
  assert.deepEqual(decidirCliente('/api/chat/complete', false), { tipo: 'pasa' })
  assert.deepEqual(decidirCliente('/api/desktop/sesion', false), { tipo: 'pasa' })
  assert.equal(decidirCliente('/api/finanzas', true).tipo, 'json')
  assert.deepEqual(decidirCliente('/chat', false), { tipo: 'redirige', a: '/sin-sesion' })
  assert.deepEqual(decidirCliente('/finanzas', true), { tipo: 'redirige', a: '/chat' })
  assert.deepEqual(decidirCliente('/login', true), { tipo: 'redirige', a: '/chat' })
  assert.deepEqual(decidirCliente('/sin-sesion', false), { tipo: 'pasa' })
  assert.deepEqual(decidirCliente('/manual-dueno/index.html', false), { tipo: 'pasa' })
})

test('carpetas: en cliente sin ARBRAIN_CONFIG_DIR ni ARBRAIN_HOME falla claro; nunca ~/.config/arbrain', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  delete process.env.ARBRAIN_DATA_DIR; delete process.env.ARBRAIN_CONFIG_DIR; delete process.env.ARBRAIN_HOME
  assert.throws(() => dirConfigArbrain(), /ARBRAIN_CONFIG_DIR/)
  assert.throws(() => raizWorkspace('/repo/de/daniel'), /ARBRAIN_HOME/)
  process.env.ARBRAIN_DATA_DIR = '/tmp/datos-alumno/web'
  assert.throws(() => dirConfigArbrain(), /ARBRAIN_CONFIG_DIR/)
  process.env.ARBRAIN_CONFIG_DIR = '/tmp/datos-alumno/daemon/config'
  process.env.ARBRAIN_HOME = '/tmp/cerebro-alumno'
  process.env.BUSINESS_OS_ROOT = '/no/se/usa'
  assert.equal(dirConfigArbrain(), '/tmp/datos-alumno/daemon/config')
  assert.equal(raizWorkspace('/repo/de/daniel'), '/tmp/cerebro-alumno')
  delete process.env.ARBRAIN_EDICION
  delete process.env.ARBRAIN_DATA_DIR
  delete process.env.ARBRAIN_CONFIG_DIR
  assert.match(dirConfigArbrain(), /\.config[\\/]arbrain$/)
  assert.equal(raizWorkspace('/repo/de/daniel'), '/no/se/usa')
})

/** Los valores que identifican a la persona de una instalación: correos, rutas, URLs, ids, hosts y proyectos. */
function identificadores(config: unknown): string[] {
  const out: string[] = []
  const recorrer = (v: unknown) => {
    if (typeof v === 'string') { if (/@|^\/|^https?:|^[0-9a-f]{8}-[0-9a-f-]{27}$|\.ts\.net|^[a-z]{20}$/.test(v)) out.push(v) }
    else if (Array.isArray(v)) v.forEach(recorrer)
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (/@/.test(k)) out.push(k); recorrer(x) })
  }
  recorrer(config)
  return [...new Set(out)]
}

test('config por instalación: la plantilla del alumno tiene la misma forma y ninguno de los datos de la instalación', () => {
  assert.deepEqual(Object.keys(GENERICA).sort(), Object.keys(DANIEL).sort())
  const propios = identificadores(DANIEL).filter((v) => !identificadores(GENERICA).includes(v))
  const texto = readFileSync(join(__dirname, '../../src/config/instalacion.plantilla.ts'), 'utf8')
  for (const v of propios) assert.ok(!texto.includes(v), 'la plantilla no debe traer datos de la instalación')
})

test('A12: en src/ los datos de la instalación solo viven en config/instalacion.ts', async () => {
  const { readdirSync, statSync } = await import('node:fs')
  const raiz = join(__dirname, '../..')
  const propios = identificadores(DANIEL).filter((v) => !identificadores(GENERICA).includes(v))
  const archivos: string[] = [join(raiz, 'next.config.ts')]
  const andar = (d: string) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) andar(r); else if (/\.(ts|tsx|css|js|mjs|md)$/.test(n)) archivos.push(r) } }
  andar(join(raiz, 'src'))
  const fuera: string[] = []
  for (const a of archivos) {
    if (a.endsWith(join('src', 'config', 'instalacion.ts'))) continue
    const t = readFileSync(a, 'utf8')
    if (propios.some((v) => t.includes(v))) fuera.push(a.slice(raiz.length + 1))
  }
  assert.deepEqual(fuera, [])
})

test('I8: el diálogo muestra solo pendientes vigentes, la más vieja primero', async () => {
  const { ordenarPendientes } = await import('../../src/features/permisos/components/ConfirmacionesHumanas')
  const base = { categoria: 'publicar' as const, origen: 'agente' as const, resumen: 'git push' }
  const lista = [
    { ...base, id: 'cf_b', estado: 'pendiente' as const, creada: 20, expira: 10_000 },
    { ...base, id: 'cf_a', estado: 'pendiente' as const, creada: 10, expira: 10_000 },
    { ...base, id: 'cf_v', estado: 'pendiente' as const, creada: 5, expira: 50 },
    { ...base, id: 'cf_r', estado: 'rechazada' as const, creada: 1, expira: 10_000 },
  ]
  assert.deepEqual(ordenarPendientes(lista, 100).map((c) => c.id), ['cf_a', 'cf_b'])
})

test('llaves: el formato distingue API key y OpenRouter, rechaza el token de suscripción y nunca acepta espacios', async () => {
  const { validarLlave, limpiarLlave } = await import('../../src/features/primer-arranque/lib/llaves')
  const api = 'sk-ant-api03-' + 'a'.repeat(80)
  const oat = 'sk-ant-oat01-' + 'b'.repeat(80)
  const or = 'sk-or-v1-' + 'c'.repeat(64)
  assert.deepEqual(validarLlave(api, 'claude'), { ok: true, nombre: 'ANTHROPIC_API_KEY' })
  // 12 oct 2026: Arbrain nunca acepta un token de la suscripción de claude.ai, en ningún campo.
  for (const campo of ['claude', 'openrouter'] as const) {
    const v = validarLlave(`  "${oat}"\n`, campo)
    assert.equal(v.ok, false)
    assert.match((v as { error: string }).error, /no lo usa/)
  }
  assert.deepEqual(validarLlave(or, 'openrouter'), { ok: true, nombre: 'OPENROUTER_API_KEY' })
  assert.equal(validarLlave(or, 'claude').ok, false)
  assert.equal(validarLlave(api, 'openrouter').ok, false)
  assert.equal(validarLlave('sk-ant-api03-abc def', 'claude').ok, false)
  assert.equal(validarLlave('hola', 'claude').ok, false)
  assert.equal(limpiarLlave(` '${api}' `), api)
})

test('proxy cliente: el Bearer del daemon abre solo el lienzo (el Levy del alumno dibuja), y solo si es el correcto', async () => {
  const { bearerDelDaemon } = await import('../../src/lib/proxy-cliente')
  const token = 'f'.repeat(64)
  assert.equal(bearerDelDaemon('/api/canvas/pages', `Bearer ${token}`, token), true)
  assert.equal(bearerDelDaemon('/api/canvas/compile', `Bearer ${token}`, token), true)
  assert.equal(bearerDelDaemon('/api/canvas/pages', `Bearer ${'e'.repeat(64)}`, token), false)
  assert.equal(bearerDelDaemon('/api/chat/stream', `Bearer ${token}`, token), false)
  assert.equal(bearerDelDaemon('/api/canvas/pages', `Bearer ${token}`, ''), false)
})

test('proxy cliente (contrato v2): el pase de agente también abre el lienzo y nada más; un pase corto no cuenta', async () => {
  const { bearerDelDaemon } = await import('../../src/lib/proxy-cliente')
  const token = 'f'.repeat(64), pase = 'a9'.repeat(32)
  assert.equal(bearerDelDaemon('/api/canvas/pages', `Bearer ${pase}`, token, pase), true)
  assert.equal(bearerDelDaemon('/api/confirmaciones/resolver', `Bearer ${pase}`, token, pase), false)
  assert.equal(bearerDelDaemon('/api/canvas/pages', `Bearer ${pase}`, '', pase), true)
  assert.equal(bearerDelDaemon('/api/canvas/pages', 'Bearer abc', token, 'abc'), false)
})

// ── Marcador de la copia (carril O, red team A3) ──────────────────────────────────────────────────────────────────
// Carril T: esta prueba corre en el repo original (sin `arbrain/EDICION`) y en la copia del alumno (con él). El
// marcador del checkout se lee del disco y la respuesta debe coincidir: original = Daniel; copia = cliente.
test('marcador: el del checkout manda (repo original: Daniel; copia del alumno: cliente)', async () => {
  const { existsSync } = await import('node:fs')
  const { marcadorCliente, aplicarMarcador, valorMarcador } = await import('../../src/lib/edicion')
  const raiz = join(__dirname, '..', '..')
  const archivo = join(raiz, 'EDICION')
  const esCopia = existsSync(archivo) && valorMarcador(readFileSync(archivo, 'utf8')) === 'cliente'
  assert.equal(marcadorCliente(raiz), esCopia)
  const env: Record<string, string | undefined> = {}
  assert.equal(aplicarMarcador(env, raiz), esCopia)
  assert.equal(env.ARBRAIN_EDICION, esCopia ? 'cliente' : undefined)
  assert.equal(esEdicionCliente(env), esCopia)
})

test('marcador: la copia con arbrain/EDICION = cliente nace cliente; la variable explícita manda', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { aplicarMarcador, marcadorCliente, valorMarcador } = await import('../../src/lib/edicion')
  const raiz = mkdtempSync(join(tmpdir(), 'copia-'))
  mkdirSync(join(raiz, 'arbrain'))
  writeFileSync(join(raiz, 'arbrain', 'EDICION'), '# copia del alumno\ncliente\n')
  assert.equal(valorMarcador('# x\n\n Cliente \n'), 'cliente')
  assert.equal(marcadorCliente(raiz), true) // desde la raíz de la copia
  assert.equal(marcadorCliente(join(raiz, 'arbrain')), true) // desde arbrain/ (cwd de Next)
  const env: Record<string, string | undefined> = {}
  assert.equal(aplicarMarcador(env, raiz), true)
  assert.equal(esEdicionCliente(env), true)
  const fuera: Record<string, string | undefined> = { ARBRAIN_EDICION: 'original' }
  assert.equal(aplicarMarcador(fuera, raiz), false)
  assert.equal(esEdicionCliente(fuera), false)
  writeFileSync(join(raiz, 'arbrain', 'EDICION'), 'original\n')
  assert.equal(marcadorCliente(raiz), false)
})
