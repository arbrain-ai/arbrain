// Modo servidor (21 oct 2026; docs/builds/modo-servidor-2026-10-21/REPORTE.md): `npm run servidor` corre la edición
// cliente desde el código, sin Tauri. Aquí lo puro: carpetas por sistema, contraseña, llaves, entorno, unidades de
// arranque automático, el preludio idéntico al de la app y las reglas de la web.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  contrasenaNueva, dirDatosPorDefecto, entornoLimpio, errorDeLlave, estadoLlaves, lineaSecretos, puertoValido, rutasDe, sockMotor,
} from '../../scripts/servidor/rutas.mjs'
import { comandoArranque, rutaUnidad, unidadLaunchd, unidadSystemd, unidadWindows } from '../../scripts/servidor/arranque-auto.mjs'
import { PRELUDIO_WEB } from '../../scripts/servidor/preludio-web.mjs'
import { ACCION_DE_COMANDO, ACCIONES, COMANDOS_SERVIDOR, cookieSesion, crearFreno, esModoServidor, paseValido, urlControl } from '../../src/lib/modo-servidor'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { isDesktopSecret } from '../../src/lib/desktop-auth'

const RAIZ = join(import.meta.dirname, '..', '..')

test('el preludio de la web es el mismo texto que el de la app (secretos.rs)', () => {
  const rust = readFileSync(join(RAIZ, 'src-tauri', 'src', 'secretos.rs'), 'utf8')
  const bloque = rust.match(/pub const PRELUDIO_WEB: &str = concat!\(([\s\S]*?)\n\);/)
  assert.ok(bloque, 'no encontré PRELUDIO_WEB en secretos.rs')
  const partes = [...bloque![1].matchAll(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)].map((m) => JSON.parse(`"${m[1]}"`) as string)
  assert.equal(PRELUDIO_WEB, partes.join(''))
})

test('carpeta de datos por sistema, nunca la de la app ni ~/.config/arbrain', () => {
  assert.equal(dirDatosPorDefecto('darwin', {}, '/Users/alumno'), '/Users/alumno/Library/Application Support/ai.arbrain.servidor')
  assert.equal(dirDatosPorDefecto('linux', {}, '/home/a'), '/home/a/.local/share/ai.arbrain.servidor')
  assert.equal(dirDatosPorDefecto('linux', { XDG_DATA_HOME: '/x' }, '/home/a'), '/x/ai.arbrain.servidor')
  assert.match(dirDatosPorDefecto('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a'), /ai\.arbrain\.servidor$/)
  assert.equal(dirDatosPorDefecto('darwin', { ARBRAIN_SERVIDOR_DATOS: '/tmp/d' }, '/Users/alumno'), '/tmp/d')
})

test('rutas: lo privado vive en la carpeta de configuración del daemon (negada a los agentes)', () => {
  const r = rutasDe('/d', '/tmp')
  assert.equal(r.config, '/d/daemon/config')
  for (const k of ['acceso', 'llaves', 'proceso'] as const) assert.ok(r[k].startsWith('/d/daemon/config/'), k)
  assert.equal(r.web, '/d/web')
  assert.ok(sockMotor('/' + 'x'.repeat(120), '/tmp').startsWith('/tmp/arbrain-'))
})

test('contraseña: 32 caracteres sin ambigüedades en grupos de 4, válida como secreto de escritorio', () => {
  const c = contrasenaNueva()
  assert.match(c, /^([a-hjkmnp-z2-9]{4}-){7}[a-hjkmnp-z2-9]{4}$/)
  assert.notEqual(c, contrasenaNueva())
  assert.ok(isDesktopSecret(c, { ARBRAIN_DESKTOP_SECRET: c }))
})

test('llaves: nunca tokens de suscripción; formato por proveedor; el estado solo enmascara', () => {
  assert.match(errorDeLlave('ANTHROPIC_API_KEY', 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz') ?? '', /suscripción/)
  assert.match(errorDeLlave('CLAUDE_CODE_OAUTH_TOKEN', 'x') ?? '', /no permitida/)
  assert.equal(errorDeLlave('OPENROUTER_API_KEY', 'sk-or-v1-abcdefghijklmnopqrstuvwxyz'), null)
  assert.ok(errorDeLlave('OPENROUTER_API_KEY', 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxx'))
  const e = estadoLlaves({ OPENROUTER_API_KEY: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234' })
  assert.equal(e.listo, true)
  assert.equal(e.almacen, 'archivo-local')
  assert.ok(!JSON.stringify(e).includes('abcdefghijklmnopqrstuvwxyz'))
})

test('entorno: llaves, tokens y política nunca se heredan de la terminal (sin importar mayúsculas)', () => {
  const env = entornoLimpio({ PATH: '/bin', anthropic_api_key: 'x', ARBRAIN_SANDBOX: '0', NODE_OPTIONS: '--require x', OPENCLAW_GATEWAY_TOKEN: 't', HOME: '/h' })
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH'])
})

test('línea de secretos: JSON de una línea sin vacíos', () => {
  const l = lineaSecretos({ A: 'x"\ny', B: '', C: undefined as unknown as string })
  assert.equal(l.split('\n').length, 2)
  assert.deepEqual(JSON.parse(l), { A: 'x"\ny' })
})

test('puertos de Daniel reservados', () => {
  for (const p of [3000, 3099, 3218, 3300, 80]) assert.equal(puertoValido(p), false, String(p))
  assert.equal(puertoValido(4310), true)
})

test('arranque automático: unidades por sistema con rutas con espacios', () => {
  const comando = comandoArranque({ node: '/Applications/Node Dir/node', script: '/Users/alumno/Arbrain/arbrain/scripts/servidor.mjs', datos: '/Users/alumno/Library/Application Support/ai.arbrain.servidor' })
  const plist = unidadLaunchd({ comando, path: '/usr/bin:/bin', log: '/x/servidor.log' })
  assert.match(plist, /<string>\/Applications\/Node Dir\/node<\/string>/)
  assert.match(plist, /<string>--sin-navegador<\/string>/)
  assert.match(plist, /<key>Label<\/key>\s*<string>ai\.arbrain\.servidor<\/string>/)
  const unit = unidadSystemd({ comando: ['/n o/node', '/s/servidor.mjs', 'iniciar', '--datos', '/d/100%$'], path: '/usr/bin' })
  assert.match(unit, /ExecStart="\/n o\/node" "\/s\/servidor.mjs" "iniciar" "--datos" "\/d\/100%%\$\$"/)
  assert.match(unit, /Restart=on-failure/)
  const vbs = unidadWindows({ comando: ['C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\a b\\Arbrain\\arbrain\\scripts\\servidor.mjs', 'iniciar'] })
  assert.ok(vbs.includes('sh.Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\Users\\a b\\Arbrain\\arbrain\\scripts\\servidor.mjs"" ""iniciar""", 0, False'), vbs)
  assert.match(rutaUnidad('win32', 'C:\\Users\\a', { APPDATA: 'C:\\R' }), /Startup.Arbrain Servidor\.vbs$/)
  assert.match(rutaUnidad('linux', '/home/a', {}), /\.config\/systemd\/user\/arbrain-servidor\.service$/)
})

test('web: el modo servidor solo existe dentro de la edición cliente', () => {
  assert.equal(esModoServidor({ ARBRAIN_MODO_SERVIDOR: '1' }), false)
  assert.equal(esModoServidor({ ARBRAIN_MODO_SERVIDOR: '1', ARBRAIN_EDICION: 'cliente' }), true)
  assert.equal(esModoServidor({ ARBRAIN_EDICION: 'cliente' }), false)
})

test('web: el control del supervisor solo en 127.0.0.1 literal', () => {
  assert.equal(urlControl({ ARBRAIN_SERVIDOR_CONTROL: 'http://127.0.0.1:5123' }), 'http://127.0.0.1:5123')
  for (const u of ['http://localhost:5123', 'http://127.0.0.1.evil.com:1', 'https://127.0.0.1:1', 'http://127.0.0.1:1/x', '']) {
    assert.equal(urlControl({ ARBRAIN_SERVIDOR_CONTROL: u }), null, u)
  }
})

test('web: pase de 64 hex, cookie de 30 días HttpOnly y SameSite=Strict, freno de intentos', () => {
  assert.ok(paseValido('a'.repeat(64)))
  assert.ok(!paseValido('a'.repeat(63)) && !paseValido('Z'.repeat(64)) && !paseValido(null))
  const c = cookieSesion('arbrain_escritorio', 'abcd-efgh')
  assert.match(c, /HttpOnly; SameSite=Strict; Max-Age=2592000$/)
  const f = crearFreno(3, 1000)
  f.fallo(0); f.fallo(1); assert.equal(f.bloqueado(2), false); f.fallo(2)
  assert.equal(f.bloqueado(3), true)
  assert.equal(f.bloqueado(1500), false)
})

test('web: cada comando de la app tiene su acción en el supervisor', () => {
  for (const c of COMANDOS_SERVIDOR) assert.ok(ACCIONES[ACCION_DE_COMANDO[c]], c)
})

test('proxy: mismas reglas; sin sesión, el modo servidor pide la contraseña en lugar de la app', () => {
  assert.deepEqual(decidirCliente('/api/chat/stream', false, true), { tipo: 'json', status: 401, error: 'Tu sesión venció. Recarga la página y entra con tu contraseña.' })
  assert.deepEqual(decidirCliente('/api/chat/stream', false, false), { tipo: 'json', status: 401, error: 'Abre Arbrain desde la app.' })
  assert.deepEqual(decidirCliente('/api/desktop/entrar', false, true), { tipo: 'pasa' })
  assert.deepEqual(decidirCliente('/api/llaves/servidor/guardar', false, true), { tipo: 'json', status: 401, error: 'Tu sesión venció. Recarga la página y entra con tu contraseña.' })
  assert.deepEqual(decidirCliente('/chat', false, true), { tipo: 'redirige', a: '/sin-sesion' })
  assert.deepEqual(decidirCliente('/api/finanzas', true, true), { tipo: 'json', status: 404, error: 'No disponible en esta edición.' })
})
