// Prueba de humo de la web en edición cliente, sin Supabase y sin la app de escritorio (11 oct 2026).
// Uso: node tests/edicion/humo/humo.mjs <carpeta .next/standalone de un build hecho con ARBRAIN_EDICION=cliente>
// Levanta un daemon falso (contrato mínimo de CONTRATO-DAEMON.md) y el servidor Next en puertos propios, con HOME,
// datos y config temporales; recorre entrada, primer arranque, chat (base local), lienzo, I8 y monitoreo; apaga todo.
// No toca nada de la instalación de Daniel: todo vive en una carpeta temporal que se deja para inspección.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const standalone = resolve(process.argv[2] ?? '.next/standalone')
const raiz = mkdtempSync(join(tmpdir(), 'arbrain-humo-'))
for (const d of ['datos', 'config', 'home', 'cerebro']) mkdirSync(join(raiz, d))
const hex = () => randomBytes(32).toString('hex')
const SECRETO = hex(), TOKEN = hex(), CONF = hex()
const PD = 3400 + Math.floor(Math.random() * 300), PW = PD + 1
const B = `http://127.0.0.1:${PW}`

// Red team OAuth, M1: un proceso ajeno escucha en [::1] en el MISMO puerto que la web (ahí caía `localhost`).
const intruso = createServer((_q, res) => { res.end('SQUAT') })
const conIPv6 = await new Promise(ok => { intruso.once('error', () => ok(false)); intruso.listen(PW, '::1', () => ok(true)) })

const daemon = spawn(process.execPath, [new URL('./daemon-falso.mjs', import.meta.url).pathname], { env: { PUERTO: String(PD), OPENCLAW_GATEWAY_TOKEN: TOKEN, ARBRAIN_TOKEN_CONFIRMAR: CONF }, stdio: 'ignore' })
const web = spawn(process.execPath, ['server.js'], { cwd: standalone, stdio: 'ignore', env: {
  PATH: process.env.PATH, HOME: join(raiz, 'home'), NODE_ENV: 'production', PORT: String(PW), HOSTNAME: '127.0.0.1',
  ARBRAIN_EDICION: 'cliente', MISSION_CONTROL_DESKTOP_EMBED: '1', ARBRAIN_DESKTOP_SECRET: SECRETO,
  ARBRAIN_DATA_DIR: join(raiz, 'datos'), ARBRAIN_CONFIG_DIR: join(raiz, 'config'), ARBRAIN_HOME: join(raiz, 'cerebro'),
  ...(process.env.ARBRAIN_PLATAFORMA_PRUEBA ? { ARBRAIN_PLATAFORMA_PRUEBA: process.env.ARBRAIN_PLATAFORMA_PRUEBA } : {}),
  CLAUDECLAW_URL: `http://127.0.0.1:${PD}`, CLAUDECLAW_URL_PINNED: `http://127.0.0.1:${PD}`, OPENCLAW_GATEWAY_TOKEN: TOKEN, ARBRAIN_TOKEN_CONFIRMAR: CONF,
} })
const apagar = () => { daemon.kill(); web.kill(); intruso.close() }
process.on('exit', apagar)

let cookie = ''
const pedir = async (ruta, { metodo = 'GET', cuerpo, cabeceras = {}, conCookie = true } = {}) => {
  const r = await fetch(B + ruta, { method: metodo, redirect: 'manual', headers: { ...(conCookie && cookie ? { cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json', Origin: B } : {}), ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
  return { status: r.status, lugar: r.headers.get('location') ?? '', texto: await r.text(), csp: r.headers.get('content-security-policy') ?? '', h: r.headers }
}
let fallos = 0
const ver = (nombre, ok, detalle = '') => { if (!ok) fallos++; console.log(`${ok ? 'ok ' : 'MAL'} ${nombre}${detalle ? ` · ${detalle}` : ''}`) }

for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/version'); break } catch { await new Promise(r => setTimeout(r, 250)) } }

let r = await pedir('/chat', { conCookie: false }); ver('sin sesión, /chat va a /sin-sesion', r.status === 307 && r.lugar.endsWith('/sin-sesion'))
r = await pedir('/api/chat/sessions?source=mc', { conCookie: false }); ver('sin sesión, la API responde 401', r.status === 401)
r = await pedir('/api/cabina/panel-terminal', { conCookie: false, cabeceras: { Host: 'localhost' } }); ver('Host falsificado no abre la terminal', r.status === 401)
r = await pedir('/api/finanzas'); ver('el negocio del autor no existe (404)', r.status === 404)
r = await pedir(`/api/desktop/sesion?t=${'a'.repeat(64)}&a=/chat`); ver('secreto equivocado: 403', r.status === 403)
r = await pedir(`/api/desktop/sesion?t=${SECRETO}&a=/chat`); ver('canje del secreto deja cookie', r.status === 303 && !!cookie)
r = await pedir('/chat'); ver('sin primer arranque, /chat va a /bienvenida', r.status === 307 && r.lugar.endsWith('/bienvenida'))
r = await pedir('/bienvenida'); ver('bienvenida', r.status === 200 && r.texto.includes('Bienvenido a Arbrain'))
ver('CSP en las páginas', /default-src 'self'/.test(r.csp) && /connect-src 'self' ipc:/.test(r.csp))
r = await pedir('/api/primer-arranque', { metodo: 'POST', cuerpo: { accion: 'completar' } }); ver('no se completa sin aceptar los textos', r.status === 409)
r = await pedir('/api/primer-arranque'); const version = JSON.parse(r.texto).versionTextos
r = await pedir('/api/primer-arranque', { metodo: 'POST', cuerpo: { accion: 'aceptar', version } }); ver('aceptar textos', r.status === 200)
r = await pedir('/api/primer-arranque', { metodo: 'POST', cuerpo: { accion: 'nombre', nombre: 'Fulano' } }); ver('nombre', r.status === 200)
// 0.1.2: computer use existe en macOS y Windows (va al daemon con el secreto, v3 §6.2); en Linux, fijo apagado.
const conCU = ['darwin', 'win32'].includes(process.env.ARBRAIN_PLATAFORMA_PRUEBA || process.platform)
r = await pedir('/api/manos/interruptor')
if (conCU) ver('computer use nace apagado y sin decidir (cada apertura)', JSON.parse(r.texto).encendido === false && JSON.parse(r.texto).decidido === false && JSON.parse(r.texto).disponible === true)
else ver('Linux sin computer use: apagado y no disponible', JSON.parse(r.texto).encendido === false && JSON.parse(r.texto).disponible === false)
r = await pedir('/api/manos/interruptor', { metodo: 'POST', cuerpo: { encendido: true } })
if (conCU) ver('computer use: encender va al daemon con el secreto (v3 §6.2)', r.status === 200 && JSON.parse(r.texto).encendido === true && JSON.parse(r.texto).decidido === true)
else ver('Linux sin computer use: encender es 403', r.status === 403)
r = await pedir('/api/manos/interruptor', { metodo: 'POST', cuerpo: { encendido: true }, cabeceras: { Origin: 'http://evil.example' } }); ver('computer use: otro origen no enciende', r.status === 403)
r = await pedir('/api/manos/interruptor', { metodo: 'POST', cuerpo: { encendido: false } }); ver('computer use: apagar se acepta', r.status === 200 && JSON.parse(r.texto).encendido === false)
ver('computer use: la web no escribe el archivo del interruptor (M1)', !existsSync(join(raiz, 'config/manos/computer-use.json')))
ver('computer use: la respuesta dice si hay sandbox', typeof JSON.parse(r.texto).sandbox?.disponible === 'boolean')
r = await pedir('/api/monitoreo'); ver('monitoreo: vista previa sin enviar', r.status === 200 && JSON.parse(r.texto).consentimiento === null)
r = await pedir('/api/llaves/probar', { metodo: 'POST', cuerpo: {} }); ver('probar llave llega al daemon', JSON.parse(r.texto).code === 'falta_llave')
// v1.1: «Conectar con OpenRouter» (OAuth PKCE). Sin red: el regreso se prueba con la negativa, COMO LA HACE OpenRouter
// (su doc: en una negativa NO devuelve `state`; red team OAuth, B2).
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {}, conCookie: false }); ver('OpenRouter: iniciar sin sesión es 401', r.status === 401)
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {}, cabeceras: { Origin: 'http://evil.example' } }); ver('OpenRouter: otro origen no inicia', r.status === 403)
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {} }); const orI = JSON.parse(r.texto); const orU = new URL(orI.url ?? 'http://x')
const cbUrl = orU.searchParams.get('callback_url') ?? ''
ver('OpenRouter: URL oficial con S256 y regreso a 127.0.0.1 de este puerto (M1)', orU.origin === 'https://openrouter.ai' && orU.pathname === '/auth' && orU.searchParams.get('code_challenge_method') === 'S256' && cbUrl === `http://127.0.0.1:${PW}/api/llaves/openrouter/callback` && orU.searchParams.get('state') === orI.state)
if (conIPv6) {
  const squat = await fetch(`http://[::1]:${PW}/api/llaves/openrouter/callback`).then(x => x.text()).catch(() => '')
  // Con `code` y sin `state`: llega a Arbrain sin cancelar el intento (sin nada, sería una negativa: B2).
  const real = await fetch(`${cbUrl}?code=x`).then(x => x.text()).catch(() => '')
  ver('OpenRouter: con un intruso en [::1] del mismo puerto, el regreso igual llega a Arbrain (M1)', squat === 'SQUAT' && /Arbrain/.test(real) && real !== 'SQUAT')
} else console.log('--  sin IPv6 en este equipo: se salta la prueba del intruso en [::1]')
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orI.state } }); ver('OpenRouter: la ventana espera', JSON.parse(r.texto).estado === 'esperando')
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orI.state }, conCookie: false }); ver('OpenRouter: estado sin sesión es 401', r.status === 401)
r = await pedir('/api/llaves/openrouter/callback?code=x', { conCookie: false }); ver('OpenRouter: regreso con código y sin state, 400 sin canje', r.status === 400 && /Cancelaste o algo falló/.test(r.texto))
ver('OpenRouter: cabeceras estrictas en la respuesta real del regreso (B1)', /default-src 'none'/.test(r.h.get('content-security-policy') ?? '') && /frame-ancestors 'none'/.test(r.h.get('content-security-policy') ?? '') && !/'self'/.test(r.h.get('content-security-policy') ?? '') && r.h.get('referrer-policy') === 'no-referrer' && /no-store/.test(r.h.get('cache-control') ?? '') && r.h.get('x-frame-options') === 'DENY', `${r.h.get('content-security-policy')} | ${r.h.get('referrer-policy')} | ${r.h.get('cache-control')} | ${r.h.get('x-frame-options')}`)
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orI.state } }); ver('OpenRouter: un código sin state no toca el intento', JSON.parse(r.texto).estado === 'esperando')
r = await pedir('/api/llaves/openrouter/callback?error=access_denied', { conCookie: false }); ver('OpenRouter: negativa real (sin state) con UN intento: página humana', r.status === 400 && /Cancelaste o algo falló/.test(r.texto) && /Vuelve a Arbrain/.test(r.texto) && !/sk-or-/.test(r.texto))
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orI.state } }); ver('OpenRouter: tras la negativa, la ventana deja de esperar (denegado, una vez)', JSON.parse(r.texto).code === 'denegado')
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orI.state } }); ver('OpenRouter: después, vencido', r.status === 404)
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {} }); const orA = JSON.parse(r.texto)
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {} }); const orB = JSON.parse(r.texto)
r = await pedir('/api/llaves/openrouter/callback?error=access_denied', { conCookie: false }); ver('OpenRouter: negativa sin state con DOS intentos no cancela ninguno', r.status === 400)
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orA.state } }); const eA = JSON.parse(r.texto).estado
r = await pedir('/api/llaves/openrouter/estado', { metodo: 'POST', cuerpo: { state: orB.state } }); ver('OpenRouter: los dos siguen esperando', eA === 'esperando' && JSON.parse(r.texto).estado === 'esperando')
for (const st of [orA.state, orB.state]) await pedir('/api/llaves/openrouter/cancelar', { metodo: 'POST', cuerpo: { state: st } })
r = await pedir('/api/llaves/openrouter/iniciar', { metodo: 'POST', cuerpo: {} }); const orC = JSON.parse(r.texto)
r = await pedir(`/api/llaves/openrouter/callback?error=access_denied&state=${orC.state}`, { conCookie: false }); ver('OpenRouter: regreso sin cookie con state vigente se atiende', r.status === 400 && /No se conectó/.test(r.texto) && !/sk-or-/.test(r.texto))
r = await pedir(`/api/llaves/openrouter/callback?code=x&state=${orC.state}`, { conCookie: false }); ver('OpenRouter: el state es de un solo uso', r.status === 400 && /ya se usó o venció/.test(r.texto))
r = await pedir('/api/confirmaciones'); const cf = JSON.parse(r.texto).pendientes?.[0]; ver('I8: hay una confirmación pendiente', !!cf)
ver('I8 v3: llega el literal, los avisos, el origen y el estado del sandbox', cf?.literal === 'git push origin main' && cf?.avisos?.length === 1 && cf?.creadaPor === 'guardia' && typeof JSON.parse(r.texto).sandbox?.disponible === 'boolean')
r = await pedir('/api/confirmaciones/resolver', { metodo: 'POST', cuerpo: { id: cf.id, decision: 'permitir' }, cabeceras: { Origin: 'http://evil.example' } }); ver('I8: otro origen no aprueba', r.status === 403)
r = await pedir('/api/confirmaciones/resolver', { metodo: 'POST', cuerpo: { id: cf.id, decision: 'rechazar' } }); ver('I8: el clic resuelve (con el secreto que pone el servidor)', JSON.parse(r.texto).estado === 'rechazada')
r = await pedir('/api/primer-arranque', { metodo: 'POST', cuerpo: { accion: 'completar' } }); const sesion = JSON.parse(r.texto).sesion; ver('completar crea la bienvenida de Levy', !!sesion)
r = await pedir(`/api/chat/sessions/${sesion}/messages?source=mc&limit=50`); ver('el primer mensaje es de Levy y saluda por nombre', JSON.parse(r.texto).messages?.[0]?.content?.startsWith('Hola, Fulano. Soy Levy.'))
r = await pedir('/api/chat/complete', { metodo: 'POST', conCookie: false, cuerpo: { chatSessionId: sesion, turnId: 't-1', userMessage: 'Hola', assistantMessage: 'Hola, Fulano.', terminalStatus: 'completed' }, cabeceras: { Authorization: `Bearer ${TOKEN}` } })
ver('el daemon entrega el turno (base local)', JSON.parse(r.texto).saved === true)
r = await pedir('/api/chat/complete', { metodo: 'POST', conCookie: false, cuerpo: {} }); ver('complete sin token: 401', r.status === 401)
r = await pedir('/api/canvas/pages', { metodo: 'POST', cuerpo: { nombre: 'Mi mapa' } }); ver('lienzo local', JSON.parse(r.texto).ok === true)
r = await pedir('/api/canvas/pages', { conCookie: false, cabeceras: { Authorization: `Bearer ${TOKEN}` } }); ver('Levy dibuja con el Bearer del daemon', JSON.parse(r.texto).paginas?.length === 1)
r = await pedir('/api/canvas/pages', { conCookie: false, cabeceras: { Authorization: `Bearer ${'b'.repeat(64)}` } }); ver('Bearer falso: 401', r.status === 401)
r = await pedir('/finanzas'); ver('página de negocio redirige al chat', r.status === 307 && r.lugar.endsWith('/chat'))
ver('base local 0600', (statSync(join(raiz, 'datos/base/chat_messages.json')).mode & 0o777) === 0o600)
const enHome = readdirSync(join(raiz, 'home'))
ver('nada escrito en el HOME (ni ~/.config/arbrain)', enHome.length === 0, enHome.join(', '))

apagar()
console.log(`\n${fallos ? `${fallos} FALLOS` : 'todo en verde'} · carpeta: ${raiz}`)
process.exit(fallos ? 1 : 0)
