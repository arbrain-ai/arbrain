// Estado de las notificaciones de un dispositivo (Ajustes › Notificaciones, 12 oct 2026) y el toque de un reporte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { base64Url, claveDistinta, detectarPlataforma, estadoPush, mensajeDeError, resumenEstado, type EntornoPush } from '../../src/features/notifications/lib/soportePush'
import { defDe, seccionDeUrl, buscarAjustes } from '../../src/features/configuracion/secciones'

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'
const IPHONE_WHATSAPP = `${IPHONE_17} WhatsApp/2.24`
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const MAC_TAURI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'

const base: EntornoPush = {
  userAgent: IPHONE_17, instalada: true, tieneNotification: true, tieneServiceWorker: true, tienePushManager: true,
  permiso: 'default', suscrito: false, vapidConfigurada: true,
}
const e = (o: Partial<EntornoPush>) => estadoPush({ ...base, ...o })

test('iPhone con Arbrain en la pantalla de inicio: listo → activo; bloqueado si negó el permiso', () => {
  assert.equal(e({}), 'listo')
  assert.equal(e({ permiso: 'granted', suscrito: true }), 'activo')
  assert.equal(e({ permiso: 'granted', suscrito: false }), 'listo', 'permiso sin fila en el servidor no es «activo»')
  assert.equal(e({ permiso: 'denied' }), 'bloqueado')
})

test('iPhone en Safari (sin instalar): guía de instalación, no «no soportado»', () => {
  assert.equal(e({ instalada: false, tienePushManager: false, tieneNotification: false }), 'ios-instalar')
  assert.equal(e({ instalada: false, userAgent: IPHONE_WHATSAPP }), 'navegador-interno')
  assert.equal(e({ userAgent: IPHONE_15 }), 'ios-actualizar')
})

test('iPad que se presenta como Mac se trata como iOS', () => {
  assert.equal(detectarPlataforma(MAC_TAURI, 5).ios, true)
  assert.equal(detectarPlataforma(MAC_TAURI, 0).ios, false)
})

test('Android y computadora no necesitan instalar; la app de escritorio sin PushManager es «no soportado»', () => {
  assert.equal(e({ userAgent: ANDROID, instalada: false }), 'listo')
  assert.equal(e({ userAgent: MAC_TAURI, instalada: false, tienePushManager: false }), 'no-soportado')
})

test('sin clave VAPID pública en el build: «sin configurar» antes que todo', () => {
  assert.equal(e({ vapidConfigurada: false, permiso: 'granted', suscrito: true }), 'sin-configurar')
})

test('cada estado tiene su línea en español, sin submarcas', () => {
  for (const s of ['cargando', 'activo', 'listo', 'ios-instalar', 'navegador-interno', 'bloqueado', 'ios-actualizar', 'no-soportado', 'sin-configurar'] as const) {
    const t = resumenEstado(s)
    assert.ok(t.length > 5, s)
    assert.doesNotMatch(t, /SaaS Factory|Mission Control|OpenClaw|push/i, s)
  }
})

test('clave VAPID vieja: se detecta para reemplazar la suscripción', () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 2])
  const b64 = base64Url(bytes)
  assert.doesNotMatch(b64, /[+/=]/)
  assert.equal(claveDistinta(bytes.buffer, b64), false)
  assert.equal(claveDistinta(bytes.buffer, `${b64}=`), false)
  assert.equal(claveDistinta(bytes.buffer, 'otra'), true)
  assert.equal(claveDistinta(null, b64), false)
})

test('errores del navegador en español', () => {
  assert.match(mensajeDeError(Object.assign(new Error('x'), { name: 'NotAllowedError' })), /permiso de Arbrain/)
  assert.match(mensajeDeError(new Error('Registration failed - push service error')), /servicio de notificaciones/)
  assert.match(mensajeDeError(new Error('El servidor respondió 500')), /servidor respondió/)
  assert.match(mensajeDeError(new Error('boom')), /No se pudo activar/)
})

test('Ajustes: la sección se llama Notificaciones, se encuentra buscando y abre con ?seccion=notificaciones', () => {
  assert.equal(defDe('avisos').nombre, 'Notificaciones')
  assert.equal(seccionDeUrl('notificaciones'), 'avisos')
  assert.equal(seccionDeUrl('avisos'), 'avisos')
  const r = buscarAjustes('activar notif').flatMap((g) => g.secciones.map((s) => s.seccion.id))
  assert.deepEqual(r, ['avisos'])
})

test('Ajustes monta la sección nueva (estado, activar, prueba, apagar y guía de iPhone)', () => {
  assert.match(src('src/features/configuracion/components/Secciones.tsx'), /SeccionNotificaciones as SeccionAvisos/)
  const s = src('src/features/notifications/components/SeccionNotificaciones.tsx')
  for (const t of ['Activar notificaciones', 'Enviarme una prueba', 'Desactivar', 'Compartir', 'Agregar a pantalla de inicio', 'Qué te llega', 'Reportes']) assert.ok(s.includes(t), t)
})

test('la guardia de re-suscripción respeta «Desactivar» (antes lo re-activaba en el siguiente foreground)', () => {
  const s = src('src/components/PWARegister.tsx')
  assert.match(s, /if \(apagadoAMano\(\)\) return/)
  assert.match(s, /registrarEnServidor\(/)
})

/** Corre sw.js en un sandbox y simula el toque de una notificación. */
type Ventana = { url: string; frameType?: string; focused?: boolean; sinNavigate?: boolean }
function tocarNotificacion(url: string, ventanas: Ventana[]) {
  const oyentes: Record<string, (ev: unknown) => void> = {}
  const hechos: string[] = []
  const clientes = ventanas.map((v) => {
    const c = {
      ...v,
      // iOS: navigate puede rechazar (ventana no controlada) o no navegar; el SW cae a `abrir-url`.
      navigate: (u: string) => { hechos.push(`navigate ${v.url} -> ${u}`); return v.sinNavigate ? Promise.reject(new TypeError('no')) : Promise.resolve(c) },
      postMessage: (m: { type: string; sessionId?: string; url?: string }) => { hechos.push(`message ${m.type} ${m.sessionId ?? m.url}`) },
      focus: () => { hechos.push(`focus ${v.url}`); return Promise.resolve(c) },
    }
    return c
  })
  const self = {
    location: { origin: 'https://arbrain.test' },
    addEventListener: (t: string, f: (ev: unknown) => void) => { oyentes[t] = f },
    clients: { matchAll: () => Promise.resolve(clientes), openWindow: (u: string) => { hechos.push(`open ${u}`); return Promise.resolve() } },
    registration: {},
  }
  vm.runInNewContext(src('public/sw.js'), { self, caches: {}, fetch: () => Promise.reject(new Error('sin red')), URL, Headers, Response, console, setTimeout })
  let espera: Promise<unknown> = Promise.resolve()
  oyentes.notificationclick({ notification: { data: { url }, close: () => hechos.push('close') }, waitUntil: (p: Promise<unknown>) => { espera = p } })
  return espera.then(() => hechos)
}

// Que el reporte matutino de la instalación original mande este deep link lo prueba
// server/scripts/analytics/test_reportes_matutinos.py (ese script no viaja a la copia del alumno).
test('push con deep link a un hilo: el toque abre ese hilo (app cerrada → abre /chat?session=; abierta → navega y avisa al chat)', async () => {
  const url = '/chat?session=1234-reportes'
  assert.deepEqual(await tocarNotificacion(url, []), ['close', `open ${url}`])
  assert.deepEqual(await tocarNotificacion(url, [{ url: 'https://arbrain.test/calendar' }]), [
    'close', `message notificacion-tocada ${url}`, 'message open-chat-session 1234-reportes',
    'focus https://arbrain.test/calendar', `navigate https://arbrain.test/calendar -> ${url}`,
  ])
  // La apertura en frío de la PWA respeta el deep link (no lo cambia por /chat a secas).
  assert.match(src('src/shared/lib/apertura-en-chat.ts'), /q\.has\('session'\)\) return/)
})

// 18 oct 2026 (Daniel: «me llegó la noti pero no a la conversación»).
test('toque con la app abierta en otro chat: avisa y cambia de conversación sin recargar', async () => {
  const url = '/chat?session=b-otra&msg=m1'
  assert.deepEqual(await tocarNotificacion(url, [{ url: 'https://arbrain.test/chat?session=a-actual' }]), [
    'close', `message notificacion-tocada ${url}`, 'message open-chat-session b-otra', 'focus https://arbrain.test/chat?session=a-actual',
  ])
})

test('toque: nunca navega un iframe; elige la ventana de primer nivel (la enfocada primero)', async () => {
  const url = '/chat?session=b-otra'
  const hechos = await tocarNotificacion(url, [
    { url: 'https://arbrain.test/embebido/escenario.html', frameType: 'nested', focused: true },
    { url: 'https://otro.test/chat', frameType: 'top-level' },
    { url: 'https://arbrain.test/calendar', frameType: 'top-level' },
    { url: 'https://arbrain.test/chat', frameType: 'top-level', focused: true },
  ])
  assert.deepEqual(hechos, ['close', `message notificacion-tocada ${url}`, 'message open-chat-session b-otra', 'focus https://arbrain.test/chat'])
})

test('toque: si iOS no deja navegar la ventana, le pide a la página que vaya ella (abrir-url)', async () => {
  const url = '/chat?session=b-otra'
  const hechos = await tocarNotificacion(url, [{ url: 'https://arbrain.test/telefono', sinNavigate: true }])
  assert.deepEqual(hechos.slice(-2), [`navigate https://arbrain.test/telefono -> ${url}`, `message abrir-url b-otra`])
})

test('toque de un aviso que no es de chat: navega a su ruta', async () => {
  assert.deepEqual(await tocarNotificacion('/telefono?abrir=xyz', [{ url: 'https://arbrain.test/chat' }]), [
    'close', 'message notificacion-tocada /telefono?abrir=xyz', 'focus https://arbrain.test/chat', 'navigate https://arbrain.test/chat -> /telefono?abrir=xyz',
  ])
})
