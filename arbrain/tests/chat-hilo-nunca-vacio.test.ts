import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cuerpoReporte, hiloVacioALaVista, nadaVisible } from '../src/features/chat/lib/hilo-vigia'
import { HiloSeguro } from '../src/features/chat/components/HiloSeguro'

// 12 oct 2026, Daniel: «ya no me apareció el chat». Con el zoom de la app, un scroll instantáneo por código sobre el hilo
// deja a WKWebView pintando un hueco (lib/desplazar.ts). 5217dc00 pasó por fijarScroll las escrituras de ChatPanel y del
// lector, pero ActualizacionDesktop (restaurar la conversación tras cada despliegue) seguía con `hilo.scrollTop = …`.
// Candado: ningún archivo que toque el hilo del chat le escribe el scroll directo; todo pasa por desplazar.ts.
const RAIZ = join(__dirname, '..', 'src')
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('ningún camino escribe el scroll del hilo del chat fuera de desplazar.ts', () => {
  const tocanHilo = archivos(RAIZ).filter((p) => {
    if (p.endsWith(join('chat', 'lib', 'desplazar.ts')) || p.includes(join('app', 'chat-lab'))) return false
    const s = readFileSync(p, 'utf8')
    return s.includes('data-arbrain-scroll="chat"') || s.includes('messagesContainerRef')
  })
  assert.ok(tocanHilo.some((p) => p.endsWith('ChatPanel.tsx')), 'el candado debe cubrir ChatPanel')
  assert.ok(tocanHilo.some((p) => p.endsWith('ActualizacionDesktop.tsx')), 'el candado debe cubrir la restauración tras desplegar')
  // Variables del hilo en esos archivos (el textarea y su overlay tienen su propio scroll y no cuentan).
  const prohibido = /\b(hilo|hiloEl|el|container|scroller|messagesContainerRef\.current)\s*\.\s*(scrollTop\s*=(?!=)|scrollBy\s*\(|scrollTo\s*\()/g
  const fallas: string[] = []
  for (const p of tocanHilo) {
    const s = sinComentarios(readFileSync(p, 'utf8'))
    for (const m of s.matchAll(prohibido)) fallas.push(`${p.slice(RAIZ.length + 1)}: ${m[0]}`)
  }
  assert.deepEqual(fallas, [], 'usa fijarScroll/deslizarScroll de lib/desplazar.ts')
})

test('el vigía detecta el hilo vacío a la vista', () => {
  const vista = { top: 100, bottom: 600 }
  assert.equal(nadaVisible(vista, []), false) // conversación nueva: nada que reclamar
  assert.equal(nadaVisible(vista, [{ top: -900, bottom: 50 }, { top: 700, bottom: 1200 }]), true) // scroll en un hueco
  assert.equal(nadaVisible(vista, [{ top: 500, bottom: 900 }]), false)
  // Mensajes en la zona pero todos saltados por content-visibility: WebKit no los pinta.
  assert.equal(hiloVacioALaVista(vista, [{ top: 0, bottom: 400, saltado: true }, { top: 400, bottom: 800, saltado: true }]), true)
  assert.equal(hiloVacioALaVista(vista, [{ top: 0, bottom: 400, saltado: true }, { top: 400, bottom: 800 }]), false)
  assert.equal(hiloVacioALaVista(vista, [{ top: 120, bottom: 300 }]), false)
})

test('el reporte a la bitácora es acotado y sin contenido de mensajes', () => {
  const r = cuerpoReporte({ tipo: 'render', mensaje: 'x'.repeat(2000), sesion: 's1', detalle: { pila: 'a' } })
  assert.equal(r.title, 'Chat: no se pudo pintar la conversación')
  assert.ok(r.body.length <= 1000)
  assert.ok(!r.body.includes('x'.repeat(501)), 'el mensaje se recorta a 500')
  assert.match(cuerpoReporte({ tipo: 'vacio', mensaje: 'm' }).title, /vacío/)
})

test('si pintar la conversación lanza, se muestra el aviso con Reintentar en vez de un área negra', () => {
  assert.deepEqual(HiloSeguro.getDerivedStateFromError(new Error('boom')), { error: 'boom' })
  const b = new HiloSeguro({ sessionId: 's1', children: null })
  b.state = { error: 'boom', intento: 0 }
  const html = JSON.stringify(b.render(), (_k, v) => (typeof v === 'function' ? undefined : v))
  assert.match(html, /No pude mostrar esta conversación/)
  assert.match(html, /Reintentar/)
})

// 13 oct 2026, Daniel: hilo en blanco con zoom 1.8 al cambiar de conversación. Causa medida en el arnés WKWebView: el marcador
// de salto de fijarScroll se quedaba en el hilo (absolute, top fijo) y al pasar de una conversación larga a una de 4
// mensajes mantenía el scrollHeight viejo (8 976 px de un contenido de ~1 700): scrollTop == scrollHeight - clientHeight,
// mensajes 12 000 px arriba, y el vigía "curaba" con un fijarScroll que no hacía nada. Candados:
test('fijarScroll no deja el marcador de salto dentro del hilo y limpia restos', async () => {
  const { fijarScroll, limpiarMarcadores } = await import('../src/features/chat/lib/desplazar')
  const g = globalThis as Record<string, unknown>
  const viejo = { document: g.document, getComputedStyle: g.getComputedStyle }
  const hijos: { remove: () => void; style: Record<string, string>; setAttribute: () => void; scrollIntoView: () => void }[] = []
  const nuevoMarcador = () => {
    const m = { style: { cssText: '' } as Record<string, string>, setAttribute() {}, scrollIntoView() {}, remove() { hijos.splice(hijos.indexOf(m), 1) } }
    return m
  }
  const resto = nuevoMarcador()
  hijos.push(resto) // marcador de una versión anterior
  g.document = { documentElement: { style: { zoom: '1.8' } }, createElement: nuevoMarcador }
  g.getComputedStyle = () => ({ position: 'relative' })
  let visto = -1
  const el = {
    scrollHeight: 5000, clientHeight: 500, scrollTop: 0, scrollIntoView() {},
    querySelectorAll: () => ({ forEach: (f: (n: { remove: () => void }) => void) => hijos.slice().forEach(f), length: hijos.length }),
    appendChild(m: (typeof hijos)[number]) {
      hijos.push(m)
      m.scrollIntoView = () => { visto = hijos.length }
    },
  } as unknown as HTMLElement
  try {
    assert.equal(limpiarMarcadores({ ...el, querySelectorAll: el.querySelectorAll } as HTMLElement), 1)
    hijos.push(nuevoMarcador())
    fijarScroll(el, 4500)
    assert.equal(visto, 1, 'el salto se hizo con un único marcador (el resto se limpió)')
    assert.equal(hijos.length, 0, 'tras el salto no queda ningún marcador que infle el scrollHeight')
  } finally {
    g.document = viejo.document
    g.getComputedStyle = viejo.getComputedStyle
  }
})

test('la cura del vigía cambia el estado aunque el scroll ya esté en el fondo y reporta si no curó', async () => {
  const { readFileSync } = await import('node:fs')
  const panel = readFileSync(join(RAIZ, 'features', 'chat', 'components', 'ChatPanel.tsx'), 'utf8')
  const vigia = readFileSync(join(RAIZ, 'features', 'chat', 'lib', 'hilo-vigia.ts'), 'utf8')
  assert.match(vigia, /export function curarHilo[\s\S]*limpiarMarcadores[\s\S]*offsetHeight[\s\S]*scrollIntoView/, 'quita marcadores, fuerza relayout y lleva el último mensaje a la vista')
  assert.match(panel, /medirHilo\(el, contenido\)[\s\S]*curarHilo\(el, contenido\)[\s\S]*despuesDePintar\(\)[\s\S]*curado: !despues\.vacio/, 'mide, cura, espera al pintado y verifica')
  assert.match(cuerpoReporte({ tipo: 'vacio', mensaje: 'm', detalle: { curado: false } }).title, /NO curado/)
  assert.match(cuerpoReporte({ tipo: 'vacio', mensaje: 'm', detalle: { curado: true } }).title, /\(curado\)/)
})
