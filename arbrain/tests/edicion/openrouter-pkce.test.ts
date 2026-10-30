// «Conectar con OpenRouter» en un clic (empaquetado v1.1, 12 oct 2026): flujo OAuth PKCE del servidor de la app, su
// regreso por el navegador del sistema, la entrega de la llave una sola vez a la ventana y la regla del proxy.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  CABECERAS_CALLBACK, crearFlujoOpenRouter, desafio, MAX_INTENTOS, OPENROUTER_CANJE, paginaCallback, RUTA_CALLBACK,
  urlCallback, VIGENCIA_MS,
} from '../../src/features/primer-arranque/lib/openrouter-pkce'
import { conectarOpenRouter } from '../../src/features/primer-arranque/lib/llaves'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

const LLAVE = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'
const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

type Llamada = { url: string; init: RequestInit }
function canjeFalso(respuesta: () => Response | Promise<Response>) {
  const llamadas: Llamada[] = []
  const f = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return respuesta() }) as unknown as typeof fetch
  return { f, llamadas }
}
const okConLlave = () => Response.json({ key: LLAVE, user_id: 'u_1' })

function montar(respuesta: () => Response | Promise<Response> = okConLlave) {
  let t = 1_000_000
  const { f, llamadas } = canjeFalso(respuesta)
  const flujo = crearFlujoOpenRouter({ ahora: () => t, fetch: f })
  return { flujo, llamadas, avanzar: (ms: number) => { t += ms } }
}

test('iniciar: URL oficial con desafío S256, state de 43 y callback a 127.0.0.1 (no localhost, M1); el verifier no sale', () => {
  const { flujo } = montar()
  const { url, state, expira } = flujo.iniciar(41234)
  const u = new URL(url)
  assert.equal(u.origin + u.pathname, 'https://openrouter.ai/auth')
  assert.equal(u.searchParams.get('callback_url'), `http://127.0.0.1:41234${RUTA_CALLBACK}`)
  assert.ok(!url.includes('localhost'), 'nada resuelve por nombre: [::1] no entra en juego')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.match(u.searchParams.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/)
  assert.equal(u.searchParams.get('state'), state)
  assert.match(state, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(expira, 1_000_000 + VIGENCIA_MS)
  assert.ok(!u.searchParams.has('code_verifier'))
  // Dos intentos nunca comparten state.
  assert.notEqual(flujo.iniciar(41234).state, state)
  assert.throws(() => urlCallback(0)); assert.throws(() => urlCallback(70000))
})

test('desafío: BASE64URL(SHA256(verifier)) del RFC 7636 (vector del apéndice B)', () => {
  assert.equal(desafio('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('callback: canjea desde el servidor con code + verifier correcto, y la llave sale UNA vez', async () => {
  const { flujo, llamadas } = montar()
  const { url, state } = flujo.iniciar(41234)
  assert.deepEqual(flujo.recoger(state), { estado: 'esperando' })
  const r = await flujo.callback({ code: 'codigo-de-or', state })
  assert.deepEqual(r, { ok: true })
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, OPENROUTER_CANJE)
  assert.equal(llamadas[0].init.method, 'POST')
  const cuerpo = JSON.parse(String(llamadas[0].init.body))
  assert.equal(cuerpo.code, 'codigo-de-or')
  assert.equal(cuerpo.code_challenge_method, 'S256')
  const sha = createHash('sha256').update(cuerpo.code_verifier).digest('base64url')
  assert.equal(sha, new URL(url).searchParams.get('code_challenge'), 'el verifier canjeado corresponde al desafío enviado')
  assert.deepEqual(flujo.recoger(state), { estado: 'lista', llave: LLAVE })
  assert.deepEqual(flujo.recoger(state), { estado: 'vencido' }, 'la segunda vez ya no hay llave')
  assert.equal(flujo._vigentes(), 0)
})

test('callback: sin state, con state desconocido o mal formado no canjea nada', async () => {
  const { flujo, llamadas } = montar()
  flujo.iniciar(41234)
  for (const state of [null, '', 'x', 'A'.repeat(43), '../../etc', 'A'.repeat(44)]) {
    const r = await flujo.callback({ code: 'c', state })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, state ? 'state_invalido' : 'sin_state')
  }
  assert.equal(llamadas.length, 0)
})

test('state de un solo uso: el segundo regreso (también en paralelo) se rechaza sin otro canje', async () => {
  const { flujo, llamadas } = montar()
  const { state } = flujo.iniciar(41234)
  const [a, b] = await Promise.all([flujo.callback({ code: 'c1', state }), flujo.callback({ code: 'c2', state })])
  assert.equal([a, b].filter(x => x.ok).length, 1)
  assert.equal(llamadas.length, 1)
  const otra = await flujo.callback({ code: 'c3', state })
  assert.equal(otra.ok, false)
  if (!otra.ok) assert.equal(otra.code, 'state_invalido')
  // Ya recogida, tampoco sirve.
  flujo.recoger(state)
  const tarde = await flujo.callback({ code: 'c4', state })
  assert.equal(tarde.ok, false)
  assert.equal(llamadas.length, 1)
})

test('caducidad: a los 10 minutos el intento muere (sin canje) y una llave no recogida se borra', async () => {
  const a = montar()
  const { state } = a.flujo.iniciar(41234)
  a.avanzar(VIGENCIA_MS)
  const r = await a.flujo.callback({ code: 'c', state })
  assert.equal(r.ok, false)
  assert.equal(a.llamadas.length, 0)
  assert.deepEqual(a.flujo.recoger(state), { estado: 'vencido' })

  const b = montar()
  const s2 = b.flujo.iniciar(41234).state
  b.avanzar(VIGENCIA_MS - 1000)
  assert.deepEqual(await b.flujo.callback({ code: 'c', state: s2 }), { ok: true })
  b.avanzar(1000)
  assert.deepEqual(b.flujo.recoger(s2), { estado: 'vencido' }, 'nadie la recogió: no queda en memoria')
  assert.equal(b.flujo._vigentes(), 0)
})

test('errores: denegado, código inválido, sin red y respuesta rara llegan a la ventana con su código (sin cuerpo)', async () => {
  const casos: Array<[() => Response | Promise<Response>, Record<string, string | null>, string]> = [
    [okConLlave, { error: 'access_denied', code: null }, 'denegado'],
    [() => new Response('{"error":{"message":"Invalid code or code_verifier"}}', { status: 403 }), { code: 'c' }, 'codigo_invalido'],
    [() => { throw new TypeError('fetch failed') }, { code: 'c' }, 'sin_red'],
    [() => Response.json({ key: 'no-es-llave' }), { code: 'c' }, 'respuesta_rara'],
    [() => new Response('boom ' + LLAVE, { status: 500 }), { code: 'c' }, 'error'],
  ]
  for (const [resp, params, esperado] of casos) {
    const { flujo } = montar(resp)
    const { state } = flujo.iniciar(41234)
    const r = await flujo.callback({ ...params, state })
    assert.equal(r.ok, false)
    const g = flujo.recoger(state)
    assert.equal(g.estado, 'error', esperado)
    if (g.estado === 'error') { assert.equal(g.code, esperado); assert.ok(!g.error.includes(LLAVE)) }
    assert.deepEqual(flujo.recoger(state), { estado: 'vencido' })
  }
})

test('B2: regreso sin state (así vuelve OpenRouter en una negativa) cancela el ÚNICO intento esperando, nunca canjea', async () => {
  const { flujo, llamadas } = montar()
  const { state } = flujo.iniciar(41234)
  // Con código y sin state: no se toca nada (OpenRouter no hace eso; un tercero no puede cancelar con un código).
  const conCodigo = await flujo.callback({ code: 'c', state: null })
  assert.equal(conCodigo.ok, false); if (!conCodigo.ok) assert.equal(conCodigo.code, 'sin_state')
  assert.deepEqual(flujo.recoger(state), { estado: 'esperando' })
  // La negativa real: sin state ni código (con o sin `error`).
  const r = await flujo.callback({ error: 'access_denied', state: null })
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.code, 'denegado'); assert.match(r.mensaje, /Cancelaste o algo falló/) }
  const g = flujo.recoger(state)
  assert.equal(g.estado, 'error'); if (g.estado === 'error') assert.equal(g.code, 'denegado')
  assert.equal(llamadas.length, 0)
  assert.match(paginaCallback(r), /Cancelaste o algo falló[^<]*Vuelve a Arbrain/)
})

test('B2: con dos o más intentos esperando, un regreso sin state no cancela ninguno', async () => {
  const { flujo } = montar()
  const a = flujo.iniciar(41234).state, b = flujo.iniciar(41234).state
  const r = await flujo.callback({ state: null })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'sin_state')
  assert.deepEqual(flujo.recoger(a), { estado: 'esperando' })
  assert.deepEqual(flujo.recoger(b), { estado: 'esperando' })
  // Uno ya canjeándose o listo no cuenta como «esperando»: el otro sí se cancela.
  await flujo.callback({ code: 'c', state: a })
  const r2 = await flujo.callback({ state: null })
  if (!r2.ok) assert.equal(r2.code, 'denegado')
  assert.equal(flujo.recoger(a).estado, 'lista')
  const gb = flujo.recoger(b); assert.equal(gb.estado, 'error')
})

test('cancelar y tope de intentos: un regreso tardío ya no canjea; la memoria no crece sin fin', async () => {
  const { flujo, llamadas } = montar()
  const { state } = flujo.iniciar(41234)
  flujo.cancelar(state)
  assert.equal((await flujo.callback({ code: 'c', state })).ok, false)
  assert.equal(llamadas.length, 0)
  const states = Array.from({ length: MAX_INTENTOS + 3 }, () => flujo.iniciar(41234).state)
  assert.equal(flujo._vigentes(), MAX_INTENTOS)
  assert.deepEqual(flujo.recoger(states[0]), { estado: 'vencido' }, 'el más viejo cayó')
  assert.deepEqual(flujo.recoger(states.at(-1)!), { estado: 'esperando' })
})

test('la llave nunca va a logs, a la página del navegador ni a una URL', async () => {
  const visto: string[] = []
  const metodos = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const
  const previos = metodos.map(m => console[m])
  const escribir = process.stdout.write.bind(process.stdout), escribirErr = process.stderr.write.bind(process.stderr)
  for (const m of metodos) console[m] = (...a: unknown[]) => { visto.push(a.map(String).join(' ')) }
  process.stdout.write = ((c: string | Uint8Array, ...r: unknown[]) => { visto.push(String(c)); return (escribir as (...x: unknown[]) => boolean)(c, ...r) }) as typeof process.stdout.write
  process.stderr.write = ((c: string | Uint8Array, ...r: unknown[]) => { visto.push(String(c)); return (escribirErr as (...x: unknown[]) => boolean)(c, ...r) }) as typeof process.stderr.write
  try {
    const { flujo } = montar()
    const { url, state } = flujo.iniciar(41234)
    const r = await flujo.callback({ code: 'c', state })
    const pagina = paginaCallback(r)
    assert.match(pagina, /Listo, vuelve a Arbrain/)
    assert.ok(!pagina.includes(LLAVE) && !pagina.includes('sk-or-'))
    assert.ok(!url.includes(LLAVE))
    assert.equal(flujo.recoger(state).estado, 'lista')
  } finally {
    metodos.forEach((m, i) => { console[m] = previos[i] })
    process.stdout.write = escribir; process.stderr.write = escribirErr
  }
  assert.ok(!visto.some(v => v.includes(LLAVE)), 'nada de lo escrito lleva la llave')
  // Y el código no tiene con qué escribirla: ni consola ni disco en el módulo ni en sus rutas.
  for (const r of ['src/features/primer-arranque/lib/openrouter-pkce.ts', 'src/app/api/llaves/openrouter/callback/route.ts', 'src/app/api/llaves/openrouter/estado/route.ts', 'src/app/api/llaves/openrouter/iniciar/route.ts']) {
    const s = fuente(r)
    assert.ok(!/console\.|writeFile|appendFile|node:fs/.test(s), `${r} no escribe en consola ni disco`)
  }
  assert.equal(CABECERAS_CALLBACK['Cache-Control'], 'no-store')
  assert.equal(CABECERAS_CALLBACK['Referrer-Policy'], 'no-referrer')
  assert.match(CABECERAS_CALLBACK['Content-Security-Policy'], /default-src 'none'/)
  assert.equal(CABECERAS_CALLBACK['X-Frame-Options'], 'DENY')
})

test('página de regreso: escapa el texto y sin state explica qué hacer', () => {
  const p = paginaCallback({ ok: false, code: 'sin_state', mensaje: '<script>x</script>' })
  assert.ok(!p.includes('<script>x'))
  assert.match(p, /No se conectó/)
  assert.ok(!/<script/i.test(paginaCallback({ ok: true })))
})

// ── Ruta de regreso (sin sesión) ────────────────────────────────────────────────────────────────────────────────────

const previoEdicion = process.env.ARBRAIN_EDICION
afterEach(() => { if (previoEdicion === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previoEdicion })

test('ruta de regreso: en cliente, sin state vigente responde 400 sin canjear; en la de Daniel no existe', async () => {
  const { GET } = await import('../../src/app/api/llaves/openrouter/callback/route')
  process.env.ARBRAIN_EDICION = 'cliente'
  const r = await GET(new Request(`http://localhost:41234${RUTA_CALLBACK}?code=abc`))
  assert.equal(r.status, 400)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.match(await r.text(), /Cancelaste o algo falló/)
  const r2 = await GET(new Request(`http://localhost:41234${RUTA_CALLBACK}?code=abc&state=${'B'.repeat(43)}`))
  assert.equal(r2.status, 400)
  process.env.ARBRAIN_EDICION = 'original'
  const r3 = await GET(new Request(`http://localhost:41234${RUTA_CALLBACK}?code=abc`))
  assert.ok(r3.status === 404 || r3.status === 400, 'Daniel: o no existe, o sin state no hace nada')
})

test('proxy: solo el regreso pasa sin la cookie de la app; iniciar, estado y cancelar exigen sesión', () => {
  assert.ok(apiPermitidaEnCliente(RUTA_CALLBACK))
  assert.deepEqual(decidirCliente(RUTA_CALLBACK, false), { tipo: 'pasa' })
  for (const r of ['/api/llaves/openrouter/iniciar', '/api/llaves/openrouter/estado', '/api/llaves/openrouter/cancelar', '/api/llaves/probar', '/api/llaves/salud']) {
    assert.deepEqual(decidirCliente(r, false), { tipo: 'json', status: 401, error: 'Abre Arbrain desde la app.' }, r)
    assert.deepEqual(decidirCliente(r, true), { tipo: 'pasa' }, r)
  }
  // Las rutas con sesión pasan por soloAppCliente con chequeo de origen (mutación).
  for (const r of ['iniciar', 'estado', 'cancelar']) assert.match(fuente(`src/app/api/llaves/openrouter/${r}/route.ts`), /soloAppCliente\(request, true\)/)
})

// ── Lado de la ventana ──────────────────────────────────────────────────────────────────────────────────────────────

function webFalsa(respuestasEstado: Array<Record<string, unknown>>) {
  const pedidos: Array<{ ruta: string; cuerpo: unknown }> = []
  let i = 0
  const f = async (ruta: string, init?: RequestInit) => {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : null
    pedidos.push({ ruta, cuerpo })
    if (ruta.endsWith('/iniciar')) return Response.json({ url: 'https://openrouter.ai/auth?state=S', state: 'S', expira: 0 })
    if (ruta.endsWith('/estado')) return Response.json(respuestasEstado[Math.min(i++, respuestasEstado.length - 1)])
    return Response.json({ ok: true })
  }
  return { f, pedidos }
}

test('ventana: abre el navegador, sondea con el state en el cuerpo y recibe la llave', async () => {
  const { f, pedidos } = webFalsa([{ estado: 'esperando' }, { estado: 'esperando' }, { estado: 'lista', llave: LLAVE }])
  const abiertas: string[] = []
  const r = await conectarOpenRouter({ abrir: async (u) => { abiertas.push(u) }, fetch: f, dormir: async () => {} })
  assert.deepEqual(r, { ok: true, llave: LLAVE })
  assert.deepEqual(abiertas, ['https://openrouter.ai/auth?state=S'])
  const sondeos = pedidos.filter(p => p.ruta === '/api/llaves/openrouter/estado')
  assert.equal(sondeos.length, 3)
  assert.ok(sondeos.every(p => (p.cuerpo as { state: string }).state === 'S'))
  assert.ok(pedidos.every(p => !p.ruta.includes('?')), 'nada viaja en la URL')
})

test('ventana: cancelar avisa al servidor; error y vencido llegan con su mensaje', async () => {
  const c = new AbortController()
  const a = webFalsa([{ estado: 'esperando' }])
  const r = await conectarOpenRouter({ abrir: async () => { c.abort() }, senal: c.signal, fetch: a.f, dormir: async () => {} })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'cancelado')
  await new Promise(res => setImmediate(res))
  assert.ok(a.pedidos.some(p => p.ruta === '/api/llaves/openrouter/cancelar' && (p.cuerpo as { state: string }).state === 'S'))

  const b = webFalsa([{ estado: 'error', code: 'denegado', error: 'No autorizaste.' }])
  assert.deepEqual(await conectarOpenRouter({ abrir: async () => {}, fetch: b.f, dormir: async () => {} }), { ok: false, code: 'denegado', error: 'No autorizaste.' })
  const v = webFalsa([{ estado: 'vencido' }])
  const rv = await conectarOpenRouter({ abrir: async () => {}, fetch: v.f, dormir: async () => {} })
  assert.equal(rv.ok, false); if (!rv.ok) assert.equal(rv.code, 'vencido')
})

test('UI: «Conectar con OpenRouter» es el botón principal y pegar llaves queda en «Otras formas» plegado', () => {
  const p = fuente('src/features/primer-arranque/components/PanelLlaves.tsx')
  assert.match(p, /Conectar con OpenRouter/)
  assert.match(p, /<details[^>]*>\s*<summary[\s\S]*Otras formas de conectar/)
  assert.ok(!/<details[^>]*\bopen\b/.test(p), '«Otras formas» nace plegado')
  assert.match(p, /code === 'sin_saldo'\) return <PasoRecarga/)
  assert.match(p, /RECARGAR\[cobra\]/)
  assert.match(p, /llaveGuardar\('OPENROUTER_API_KEY', r\.llave\)/)
  // Sin recursos de OpenRouter en la ventana: solo el opener del sistema.
  assert.ok(!/<(img|iframe|script)[^>]+openrouter/i.test(p))
})
