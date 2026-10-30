import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aperturaEnChatScript } from '../../src/shared/lib/apertura-en-chat'

/** Corre el script del <head> con un navegador falso y devuelve a dónde mandó (o null) y si ocultó la página. */
function abrir(url: string, { standalone = true, salidaHaceMs = null as number | null, aperturaHaceMs = null as number | null } = {}) {
  const u = new URL(url, 'https://arbrain.test')
  let destino: string | null = null
  const style: Record<string, string> = {}
  const store: Record<string, string> = salidaHaceMs == null ? {} : { 'arbrain:salida': String(Date.now() - salidaHaceMs) }
  if (aperturaHaceMs != null) store['arbrain:apertura'] = String(Date.now() - aperturaHaceMs)
  const window = { matchMedia: () => ({ matches: standalone }), navigator: {} }
  const location = { pathname: u.pathname, search: u.search, hash: u.hash, replace: (d: string) => { destino = d } }
  const sessionStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
  const document = { documentElement: { style } }
  new Function('window', 'location', 'sessionStorage', 'document', 'URLSearchParams', aperturaEnChatScript)(
    window, location, sessionStorage, document, URLSearchParams)
  return { destino, oculta: style.visibility === 'hidden' }
}

test('en frío desde una sección, la app instalada va al chat antes de pintar', () => {
  assert.deepEqual(abrir('/calendar?mode=day'), { destino: '/chat', oculta: true })
  assert.deepEqual(abrir('/todotask/hoy'), { destino: '/chat', oculta: true })
  assert.deepEqual(abrir('/lienzo/abc'), { destino: '/chat', oculta: true })
})

test('ya en el chat, deep links y atajos se respetan', () => {
  assert.equal(abrir('/chat').destino, null)
  assert.equal(abrir('/chat?session=x').destino, null)
  assert.equal(abrir('/calendar?session=x').destino, null)
  assert.equal(abrir('/calendar?mode=day&atajo=hoy').destino, null)
})

test('una recarga nuestra (salida de hace <5 s) conserva la ruta; una vieja no', () => {
  assert.equal(abrir('/calendar', { salidaHaceMs: 800 }).destino, null)
  assert.equal(abrir('/calendar', { salidaHaceMs: 60_000 }).destino, '/chat')
})

test('en el navegador normal (no instalada) nunca redirige', () => {
  assert.deepEqual(abrir('/calendar', { standalone: false }), { destino: null, oculta: false })
})

test('el panel del teléfono y el enlace propio de una vista son destinos: no caen al chat (14 oct 2026)', () => {
  assert.equal(abrir('/telefono').destino, null)
  assert.equal(abrir('/telefono?abrir=eyJ2aXN0YSI6InNhbHVkIn0').destino, null)
  assert.equal(abrir('/artefacto?v=eyJ2aXN0YSI6InNhbHVkIn0').destino, null)
})

test('sin bucle: /bienvenida y /sin-sesion se respetan, y un rebote del servidor desde /chat también (30 oct 2026)', () => {
  // El servidor manda aquí cuando el chat todavía no se puede: primer arranque sin terminar o sesión vencida.
  assert.equal(abrir('/bienvenida').destino, null)
  assert.equal(abrir('/sin-sesion?siguiente=%2Fchat').destino, null)
  // Ya mandamos a /chat hace un momento y el servidor nos trajo a otra ruta: no se vuelve a mandar.
  assert.equal(abrir('/onboarding-futuro', { aperturaHaceMs: 900 }).destino, null)
  // Un intento viejo no cuenta: una apertura en frío días después sí va al chat.
  assert.equal(abrir('/calendar', { aperturaHaceMs: 60_000 }).destino, '/chat')
})

test('el bucle /chat → /bienvenida → /chat ya no ocurre de punta a punta', () => {
  const store: Record<string, string> = {}
  const correr = (ruta: string) => {
    let destino: string | null = null
    new Function('window', 'location', 'sessionStorage', 'document', 'URLSearchParams', aperturaEnChatScript)(
      { matchMedia: () => ({ matches: true }), navigator: {} },
      { pathname: ruta, search: '', hash: '', replace: (d: string) => { destino = d } },
      { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } },
      { documentElement: { style: {} } }, URLSearchParams)
    return destino
  }
  assert.equal(correr('/calendar'), '/chat')
  // El servidor rebota /chat a una ruta que no conocemos: la segunda pasada se queda.
  assert.equal(correr('/otra-pantalla-del-servidor'), null)
})
