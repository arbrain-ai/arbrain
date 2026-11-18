import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esAltGr, esMac, etiquetaTecla, modPrincipal, textoConAtajos } from '../../src/shared/navigation/teclas-plataforma'
import { ATAJOS_SHELL, filtrarAtajos } from '../../src/shared/navigation/atajos'
import { accionDeTecla } from '../../src/features/cabina/panel/pantalla-completa'

const tecla = (o: Partial<{ code: string; key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>) =>
  ({ code: '', key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })

test('esMac: Mac e iPad sí; Windows, Linux y Android no; sin navegador se queda como Mac', () => {
  assert.equal(esMac({ platform: 'MacIntel' }), true)
  assert.equal(esMac({ userAgentData: { platform: 'macOS' } }), true)
  assert.equal(esMac({ platform: 'iPad' }), true)
  assert.equal(esMac({ platform: 'Win32' }), false)
  assert.equal(esMac({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), false, 'userAgentData manda')
  assert.equal(esMac({ platform: 'Linux x86_64' }), false)
  assert.equal(esMac({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), false)
  assert.equal(esMac({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' }), true)
  assert.equal(esMac(undefined), true)
  assert.equal(esMac(), true, 'en Node (sin ventana) se pinta como hasta hoy')
})

test('etiquetaTecla: en Windows ⌘ ⌥ ⇧ son Ctrl, Alt y Shift; en Mac nada cambia', () => {
  assert.equal(etiquetaTecla('⌘', false), 'Ctrl')
  assert.equal(etiquetaTecla('⌥', false), 'Alt')
  assert.equal(etiquetaTecla('⇧', false), 'Shift')
  assert.equal(etiquetaTecla('⌘+D', false), 'Ctrl+D')
  assert.equal(etiquetaTecla('⌥1', false), 'Alt+1')
  assert.equal(etiquetaTecla('⌘Shift+Z', false), 'Ctrl+Shift+Z')
  assert.equal(etiquetaTecla('⌘B', false), 'Ctrl+B')
  assert.equal(etiquetaTecla('B', false), 'B')
  assert.equal(etiquetaTecla('Ctrl', false), 'Ctrl')
  for (const t of ['⌘', '⌘+D', '⌥1', '⌘Shift+Z']) assert.equal(etiquetaTecla(t, true), t)
  assert.equal(textoConAtajos('Esconder a Levy (⌘J · Esc)', false), 'Esconder a Levy (Ctrl+J · Esc)')
  assert.equal(textoConAtajos('devolverlas al panel (⌘⌥B)', false), 'devolverlas al panel (Ctrl+Alt+B)')
})

test('ninguna etiqueta de la lista del shell conserva un símbolo de Mac en Windows', () => {
  for (const g of ATAJOS_SHELL) for (const a of g.atajos) for (const t of a.teclas) {
    assert.doesNotMatch(etiquetaTecla(t, false), /[⌘⌥⇧⌃]/, `${a.accion}: ${t}`)
  }
})

test('buscar «ctrl shift b» en Windows encuentra la barra de conversaciones (⌘⇧B)', () => {
  const tiene = (mac: boolean) => filtrarAtajos(ATAJOS_SHELL, 'ctrl shift b', mac).some(g => g.atajos.some(a => a.teclas.join('') === '⌘⇧B'))
  assert.equal(tiene(false), true)
  assert.equal(tiene(true), false)
})

test('modPrincipal: ⌘ sola en Mac, Ctrl sola fuera de Mac', () => {
  assert.equal(modPrincipal({ metaKey: true, ctrlKey: false }, true), true)
  assert.equal(modPrincipal({ metaKey: false, ctrlKey: true }, true), false)
  assert.equal(modPrincipal({ metaKey: false, ctrlKey: true }, false), true)
  assert.equal(modPrincipal({ metaKey: true, ctrlKey: false }, false), false, 'la tecla Windows es del sistema')
  assert.equal(modPrincipal({ metaKey: true, ctrlKey: true }, false), false)
})

test('AltGr (Ctrl+Alt en Windows) no es atajo; en Mac nunca hay AltGr (⌘⌥B sigue funcionando)', () => {
  assert.equal(esAltGr({ getModifierState: (k: string) => k === 'AltGraph' }, false), true)
  assert.equal(esAltGr({ getModifierState: () => false }, false), false)
  assert.equal(esAltGr({}, false), false)
  assert.equal(esAltGr({ getModifierState: (k: string) => k === 'AltGraph' }, true), false, 'Option en WebKit')
})

test('fuera de Mac, Ctrl+B no se come la negrita de una pizarra en una pestaña del panel', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src/shared/hooks/useGlobalShortcuts.ts'), 'utf8')
  assert.match(src, /function focoEnPizarra\(\)/)
  assert.match(src, /e\.code === 'KeyB' && conMod && !e\.altKey && \(mac \|\| e\.shiftKey \|\| !\(isInputFocused\(\) \|\| pathname === '\/lienzo' \|\| focoEnPizarra\(\)\)\)/)
  assert.match(src, /!esAltGr\(e, mac\)/)
})

test('pantalla completa en Windows: Ctrl+. y Ctrl+J; en Mac siguen ⌘. y ⌘J', () => {
  const fuera = { enfoque: false, focoEnLevy: false }, dentro = { enfoque: true, focoEnLevy: false }
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', ctrlKey: true }), fuera, false), 'alternar')
  assert.equal(accionDeTecla(tecla({ code: 'KeyJ', key: 'j', ctrlKey: true }), dentro, false), 'levy')
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', metaKey: true }), fuera, false), null)
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', ctrlKey: true }), fuera, true), null)
  assert.equal(accionDeTecla(tecla({ code: 'Period', key: '.', metaKey: true }), fuera, true), 'alternar')
})
