import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANTIRREBOTE_MS, FIN_GESTO_MS, deltaEnPx, dentroDeCaja, gestoAtascado, puedeRegistrar, reiniciarAntirrebote, vigilarRueda } from '../../src/features/chat/lib/rueda-vigia'
import { cuerpoReporte } from '../../src/features/chat/lib/hilo-vigia'
import { aceptarRueda, lineaLogRueda } from '../../src/features/chat/lib/rueda-log'

// 19 oct 2026, Daniel: «por alguna razón dejé de poder scrollear desde aquí… puedes mirar?». Sin reproducción, el detector
// mide el atasco real. Estas pruebas fijan cuándo cuenta como atasco, el antirrebote de 30 s y que SOLO observa.

const g = (o: Partial<Parameters<typeof gestoAtascado>[0]>) => ({ deltaY: -200, deltaX: 0, topInicio: 5000, topFin: 5000, max: 9000, scrolls: 0, ...o })

test('atasco: pidió mover, no se movió y no estaba en el borde', () => {
  assert.equal(gestoAtascado(g({})), true)
  assert.equal(gestoAtascado(g({ deltaY: 300 })), true)
})

test('no es atasco: se movió, hubo scroll, está en el borde pedido, delta chico, gesto horizontal o nada que desplazar', () => {
  assert.equal(gestoAtascado(g({ topFin: 4800 })), false)
  assert.equal(gestoAtascado(g({ scrolls: 2 })), false, 'un evento scroll basta (la posición pudo volver)')
  assert.equal(gestoAtascado(g({ topInicio: 0, topFin: 0 })), false, 'ya en el tope y pide subir')
  assert.equal(gestoAtascado(g({ deltaY: 200, topInicio: 9000, topFin: 9000 })), false, 'ya en el fondo y pide bajar')
  assert.equal(gestoAtascado(g({ deltaY: 200, topInicio: 0, topFin: 0 })), true, 'en el tope pidiendo BAJAR sí es atasco')
  assert.equal(gestoAtascado(g({ deltaY: -10 })), false)
  assert.equal(gestoAtascado(g({ deltaX: -400 })), false)
  assert.equal(gestoAtascado(g({ max: 0 })), false)
})

test('antirrebote de 30 s y deltas en px', () => {
  assert.equal(ANTIRREBOTE_MS, 30_000)
  assert.equal(puedeRegistrar(0, 30_000), true)
  assert.equal(puedeRegistrar(10_000, 39_999), false)
  assert.equal(puedeRegistrar(10_000, 40_000), true)
  assert.equal(deltaEnPx(3, 1), 48)
  assert.equal(deltaEnPx(1, 2, 700), 700)
  assert.equal(dentroDeCaja(10, 10, { left: 0, top: 0, right: 20, bottom: 20 }), true)
  assert.equal(dentroDeCaja(30, 10, { left: 0, top: 0, right: 20, bottom: 20 }), false)
})

test('el servidor también limita a uno cada 30 s y la línea del log es JSON acotado', () => {
  const t = 5_000_000_000
  assert.equal(aceptarRueda(t), true)
  assert.equal(aceptarRueda(t + 29_999), false)
  assert.equal(aceptarRueda(t + 30_000), true)
  const l = lineaLogRueda({ sesion: 's1', detalle: { a: 1 } }, new Date('2026-10-19T13:00:00Z'), 'Mac')
  assert.ok(l.endsWith('\n'))
  assert.deepEqual(JSON.parse(l), { en: '2026-10-19T13:00:00.000Z', sesion: 's1', equipo: 'Mac', detalle: { a: 1 } })
  assert.ok(lineaLogRueda({ detalle: { x: 'y'.repeat(20_000) } }, new Date(), '').length < 8200)
})

test('la rueda va a la bitácora con su título, nunca a la campana', () => {
  const { title, body } = cuerpoReporte({ tipo: 'rueda', mensaje: 'la rueda no movió el hilo', sesion: 's', detalle: { x: 'z'.repeat(5000) } })
  assert.equal(title, 'Chat: la rueda no movió el hilo')
  assert.ok(body.length <= 3000)
  const ruta = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'api', 'chat', 'hilo-error', 'route.ts'), 'utf8')
  assert.match(ruta, /entrega: 'bitacora'/)
  assert.doesNotMatch(ruta, /entrega: '(campana|push|telefono)'/)
})

test('solo observa: escuchas pasivas, sin preventDefault ni escribir el scroll', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src', 'features', 'chat', 'lib', 'rueda-vigia.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(src, /preventDefault\(|stopPropagation\(|stopImmediatePropagation\(/)
  assert.doesNotMatch(src, /scrollTop\s*=(?!=)|scrollTo\(|scrollBy\(|scrollIntoView\(/)
  for (const m of src.matchAll(/addEventListener\(([^)]*)\)/g)) assert.match(m[1], /passive: true/, `escucha no pasiva: ${m[1]}`)
})

// ── El instalador, con una ventana y un hilo falsos ─────────────────────────────────────────────────────────────────
class NodoFalso { contains(o: unknown) { return o === this } }
class ElementoFalso extends NodoFalso {}

function montar() {
  const g0 = globalThis as Record<string, unknown>
  const antes = { window: g0.window, document: g0.document, fetch: g0.fetch, Node: g0.Node, Element: g0.Element, getComputedStyle: g0.getComputedStyle }
  const escuchas: { tipo: string; fn: (e: unknown) => void; captura: boolean }[] = []
  const enviados: { tipo: string; detalle: Record<string, Record<string, unknown>> }[] = []
  const hiloEsc: Record<string, () => void> = {}
  const hilo = Object.assign(new ElementoFalso(), {
    scrollTop: 5000, scrollHeight: 10_000, clientHeight: 800, clientWidth: 600, offsetHeight: 800, isConnected: true,
    tagName: 'DIV', id: '', className: 'absolute inset-0 overflow-y-auto', attributes: [{ name: 'data-arbrain-scroll', value: 'chat' }], dataset: {},
    getBoundingClientRect: () => ({ top: 80, left: 300, right: 900, bottom: 880, width: 600, height: 800 }),
    querySelectorAll: () => [], closest: () => null,
    addEventListener: (t: string, fn: () => void) => { hiloEsc[t] = fn }, removeEventListener: (t: string) => { delete hiloEsc[t] },
  })
  g0.Node = NodoFalso; g0.Element = ElementoFalso
  g0.window = {
    addEventListener: (tipo: string, fn: (e: unknown) => void, o?: { capture?: boolean }) => escuchas.push({ tipo, fn, captura: !!o?.capture }),
    removeEventListener: (tipo: string, fn: unknown) => { const i = escuchas.findIndex((x) => x.tipo === tipo && x.fn === fn); if (i >= 0) escuchas.splice(i, 1) },
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), scrollY: 0, innerWidth: 1600, innerHeight: 1000,
  }
  g0.document = {
    elementFromPoint: () => hilo, querySelectorAll: () => [], documentElement: { style: { zoom: '1.4' } },
    hasFocus: () => true, visibilityState: 'visible', activeElement: null,
  }
  g0.getComputedStyle = () => ({ overflowY: 'auto', pointerEvents: 'auto' })
  g0.fetch = (_u: string, o: { body: string }) => { enviados.push(JSON.parse(o.body)); return Promise.resolve({}) }
  const rueda = (deltaY: number, prevenido = false) => {
    const e = { deltaY, deltaX: 0, deltaMode: 0, ctrlKey: false, metaKey: false, cancelable: true, defaultPrevented: prevenido, target: hilo, clientX: 600, clientY: 400 }
    for (const x of escuchas.filter((x) => x.tipo === 'wheel' && x.captura)) x.fn(e)
    for (const x of escuchas.filter((x) => x.tipo === 'wheel' && !x.captura)) x.fn(e)
  }
  const restaurar = () => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete g0[k]; else g0[k] = v } }
  return { hilo, hiloEsc, escuchas, enviados, rueda, restaurar }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('vigilarRueda: registra el gesto atascado con el estado del chat y del DOM, y luego respeta el antirrebote', async () => {
  reiniciarAntirrebote()
  const m = montar()
  try {
    const quitar = vigilarRueda(() => m.hilo as unknown as HTMLElement, () => ({ cargando: false, alFondo: true }), () => 'sesion-1')
    m.rueda(-60, true); m.rueda(-60)
    await esperar(FIN_GESTO_MS + 80)
    assert.equal(m.enviados.length, 1)
    const r = m.enviados[0] as unknown as { tipo: string; sesion: string; detalle: { gesto: Record<string, number>; chat: Record<string, unknown>; dom: Record<string, unknown> } }
    assert.equal(r.tipo, 'rueda')
    assert.equal(r.sesion, 'sesion-1')
    assert.deepEqual([r.detalle.gesto.deltaY, r.detalle.gesto.eventos, r.detalle.gesto.vistosEnBurbuja, r.detalle.gesto.prevenidos], [-120, 2, 2, 1])
    assert.deepEqual(r.detalle.chat, { cargando: false, alFondo: true })
    assert.equal(r.detalle.dom.scrollTop, 5000)
    assert.equal(r.detalle.dom.zoom, '1.4')
    assert.equal(r.detalle.dom.bajoElPunteroEnHilo, true)
    // Otro atasco dentro de los 30 s: no se registra.
    m.rueda(-200)
    await esperar(FIN_GESTO_MS + 80)
    assert.equal(m.enviados.length, 1)
    quitar()
    assert.equal(m.escuchas.length, 0, 'quitar suelta las escuchas de la ventana')
  } finally { m.restaurar() }
})

test('vigilarRueda: un gesto que sí movió el hilo no registra nada', async () => {
  reiniciarAntirrebote()
  const m = montar()
  try {
    const quitar = vigilarRueda(() => m.hilo as unknown as HTMLElement, () => ({}), () => null)
    m.rueda(-200)
    m.hilo.scrollTop = 4800; m.hiloEsc.scroll?.()
    await esperar(FIN_GESTO_MS + 80)
    assert.equal(m.enviados.length, 0)
    quitar()
  } finally { m.restaurar() }
})

test('ChatPanel instala el detector', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src', 'features', 'chat', 'components', 'ChatPanel.tsx'), 'utf8')
  assert.match(src, /useEffect\(\(\) => vigilarRueda\(/)
})
