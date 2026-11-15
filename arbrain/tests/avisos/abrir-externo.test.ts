import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { abrirEnNavegador, esInterna } from '../../src/lib/navegador'

// 13 nov 2026, 08:09, Daniel en la campana de la app de escritorio: «doy clic en ver … pero no abre nada». La campana
// abría lo de fuera con `window.open`, que el WKWebView de Tauri ignora. Ahora: en escritorio, el opener de Tauri; en el navegador
// y en la PWA del teléfono, `window.open` (dentro del mismo toque, sin await antes: Safari no lo bloquea).
type Ventana = { open: (url: string, destino?: string, rasgos?: string) => null; __TAURI_INTERNALS__?: { invoke: (cmd: string, args: unknown) => Promise<unknown> } }
const conVentana = async (tauri: boolean, fn: (r: { opener: unknown[]; open: unknown[][] }) => Promise<void>) => {
  const r = { opener: [] as unknown[], open: [] as unknown[][] }
  const w: Ventana = { open: (...a) => { r.open.push(a); return null } }
  if (tauri) w.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => { r.opener.push([cmd, args]); return null } }
  const g = globalThis as { window?: unknown }
  const antes = g.window
  g.window = w
  try { await fn(r) } finally { g.window = antes }
}

test('escritorio (Tauri): lo de fuera sale por el opener del sistema, nunca por window.open', async () => {
  await conVentana(true, async (r) => {
    await abrirEnNavegador('https://miplataforma.com/community?post=11111111-1111-4111-8111-111111111111')
    assert.deepEqual(r.opener, [['plugin:opener|open_url', { url: 'https://miplataforma.com/community?post=11111111-1111-4111-8111-111111111111' }]])
    assert.equal(r.open.length, 0)
  })
})

test('navegador y PWA del teléfono: window.open en pestaña nueva, sin opener', async () => {
  await conVentana(false, async (r) => {
    const p = abrirEnNavegador('https://miplataforma.com/decidir/abc')
    // Síncrono dentro del toque: iOS bloquea un window.open que llega después de un await.
    assert.deepEqual(r.open, [['https://miplataforma.com/decidir/abc', '_blank', 'noopener,noreferrer']])
    await p
    assert.equal(r.opener.length, 0)
  })
})

test('qué es de la app y qué es de fuera', () => {
  assert.equal(esInterna('/telefono/decisiones?id=cf_f293bf9d2c33'), true)
  assert.equal(esInterna('https://miplataforma.com/community?post=1'), false)
  assert.equal(esInterna('//miplataforma.com/x'), false)
})

test('la campana abre todo lo de fuera por abrirEnNavegador (ningún window.open directo)', () => {
  const campana = readFileSync(new URL('../../src/features/notifications/components/NotificationBell.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(campana, /window\.open\(/)
  assert.match(campana, /else void abrirEnNavegador\(url\)/)
  // Todos los botones y enlaces de la vista pasan por irA (Abrir, Decidir, Editar, «Ver en …», Para saber, Editar antes de publicar).
  assert.equal((campana.match(/onClick=\{\(\) => irA\(/g) ?? []).length, 3)
})
