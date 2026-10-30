import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aperturaEnChatScript } from '../../src/shared/lib/apertura-en-chat'

/** Corre el script del <head> con un navegador falso y devuelve a dónde mandó (o null) y si ocultó la página. */
function abrir(url: string, { standalone = true, salidaHaceMs = null as number | null } = {}) {
  const u = new URL(url, 'https://arbrain.test')
  let destino: string | null = null
  const style: Record<string, string> = {}
  const store: Record<string, string> = salidaHaceMs == null ? {} : { 'arbrain:salida': String(Date.now() - salidaHaceMs) }
  const window = { matchMedia: () => ({ matches: standalone }), navigator: {} }
  const location = { pathname: u.pathname, search: u.search, hash: u.hash, replace: (d: string) => { destino = d } }
  const sessionStorage = { getItem: (k: string) => store[k] ?? null }
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
