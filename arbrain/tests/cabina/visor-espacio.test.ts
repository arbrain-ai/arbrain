/**
 * Visor de video, 5 nov 2026 (Daniel con un video de 14 min en la vista «documento»: «el espacio no pone pausa, el cambio
 * de velocidades parpadea mientras corre el video… resuelve!!»). Reproducido en WKWebView real con
 * scripts/qa/arnes-wkwebview/guiones/visor-video.json:
 *  - Espacio con el foco en el visor pausaba el video Y el lector del chat; con el foco fuera, al video no le llegaba.
 *  - Con el video corriendo, React reescribía `option.selected` del <select> de velocidad en cada fotograma.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { escribeEn, quienTomaElEspacio, registrarVisor } from '../../src/features/cabina/vistas/visor/espacio'
import { VELOCIDADES, rotuloVelocidad, siguienteVelocidad, velocidadEnCiclo } from '../../src/features/cabina/documento/medio'

const raiz = path.resolve(__dirname, '../..')
const fuente = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
const ESPACIO = { code: 'Space', key: ' ' }
const libre = { escribe: false, propio: false }

test('Espacio con el video a la vista y el foco fuera de una caja: es del video', () => {
  assert.equal(quienTomaElEspacio(ESPACIO, libre, [{ visible: true, contieneFoco: false, tocado: 1 }]), 0)
  // Con el foco dentro del visor, aunque se haya ido de la vista con el scroll.
  assert.equal(quienTomaElEspacio(ESPACIO, libre, [{ visible: false, contieneFoco: true, tocado: 1 }]), 0)
})

test('Espacio sigue su camino: escribiendo, Ctrl+Espacio (lector), sin video a la vista, o en otro reproductor', () => {
  const uno = [{ visible: true, contieneFoco: false, tocado: 1 }]
  assert.equal(quienTomaElEspacio(ESPACIO, { escribe: true, propio: false }, uno), null)
  assert.equal(quienTomaElEspacio({ ...ESPACIO, ctrlKey: true }, libre, uno), null)
  assert.equal(quienTomaElEspacio({ ...ESPACIO, metaKey: true }, libre, uno), null)
  assert.equal(quienTomaElEspacio({ code: 'KeyK', key: 'k' }, libre, uno), null)
  assert.equal(quienTomaElEspacio(ESPACIO, libre, [{ visible: false, contieneFoco: false, tocado: 1 }]), null)
  assert.equal(quienTomaElEspacio(ESPACIO, libre, []), null)
  assert.equal(quienTomaElEspacio(ESPACIO, { escribe: false, propio: true }, uno), null)
})

test('dos videos: manda el del foco; si no, el último que se tocó a la vista', () => {
  const dos = [{ visible: true, contieneFoco: false, tocado: 5 }, { visible: true, contieneFoco: true, tocado: 1 }]
  assert.equal(quienTomaElEspacio(ESPACIO, libre, dos), 1)
  assert.equal(quienTomaElEspacio(ESPACIO, libre, dos.map(x => ({ ...x, contieneFoco: false }))), 0)
  assert.equal(quienTomaElEspacio(ESPACIO, libre, [{ visible: false, contieneFoco: false, tocado: 9 }, { visible: true, contieneFoco: false, tocado: 1 }]), 1)
})

test('caja de texto: textarea, select, editable e input de texto; el deslizador y los botones no', () => {
  const el = (tagName: string, extra: object = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element
  assert.equal(escribeEn(el('TEXTAREA')), true)
  assert.equal(escribeEn(el('SELECT')), true)
  assert.equal(escribeEn(el('INPUT', { type: 'text' })), true)
  assert.equal(escribeEn(el('INPUT', { type: 'search' })), true)
  assert.equal(escribeEn(el('DIV', { isContentEditable: true })), true)
  assert.equal(escribeEn(el('INPUT', { type: 'range' })), false)
  assert.equal(escribeEn(el('BUTTON')), false)
  assert.equal(escribeEn(el('BODY')), false)
  assert.equal(escribeEn(null), false)
})

test('el oyente va en CAPTURA de window y detiene la tecla: el lector del chat (burbuja) ya no la ve', () => {
  // Un window y un document mínimos: lo justo para correr el oyente de verdad.
  const oyentes: Array<{ tipo: string; fn: (e: KeyboardEvent) => void; captura: boolean }> = []
  const g = globalThis as unknown as Record<string, unknown>
  const antes = { window: g.window, document: g.document }
  const caja = { isConnected: true, closest: () => null, getBoundingClientRect: () => ({ width: 640, height: 360, top: 100, left: 700, bottom: 460, right: 1340 }), contains: () => false }
  g.window = { innerWidth: 1400, innerHeight: 900, addEventListener: (tipo: string, fn: (e: KeyboardEvent) => void, captura?: boolean) => oyentes.push({ tipo, fn, captura: !!captura }), removeEventListener: (_t: string, fn: unknown) => { const i = oyentes.findIndex(o => o.fn === fn); if (i >= 0) oyentes.splice(i, 1) } }
  g.document = { activeElement: { tagName: 'BODY', isContentEditable: false, closest: () => null } }
  try {
    let alternado = 0
    const baja = registrarVisor({ raiz: () => caja as unknown as HTMLElement, alternar: () => { alternado++ }, tocado: 1 })
    assert.equal(oyentes.length, 1)
    assert.equal(oyentes[0].tipo, 'keydown')
    assert.equal(oyentes[0].captura, true, 'en captura: corre antes que el keyHandler del lector (window, burbuja)')
    let detenida = false, prevenida = false
    const evento = (extra: object = {}) => ({ code: 'Space', key: ' ', ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false,
      preventDefault: () => { prevenida = true }, stopImmediatePropagation: () => { detenida = true }, ...extra }) as unknown as KeyboardEvent
    oyentes[0].fn(evento())
    assert.equal(alternado, 1, 'el video se pausa o reanuda')
    assert.ok(detenida && prevenida, 'la tecla no sigue: ni el lector ni el scroll de la página')
    // Ctrl+Espacio es del lector: pasa intacta.
    detenida = false
    oyentes[0].fn(evento({ ctrlKey: true }))
    assert.equal(alternado, 1)
    assert.equal(detenida, false)
    // En la caja de texto se escribe un espacio.
    ;(g.document as { activeElement: unknown }).activeElement = { tagName: 'TEXTAREA', isContentEditable: false, closest: () => null }
    oyentes[0].fn(evento())
    assert.equal(alternado, 1)
    baja()
    assert.equal(oyentes.length, 0, 'sin visores no queda oyente')
  } finally {
    g.window = antes.window; g.document = antes.document
  }
})

test('el lector del chat sigue en la burbuja de window (si pasara a captura, competiría con el visor)', () => {
  const s = fuente('src/features/chat/lib/chat-speech.ts')
  assert.match(s, /window\.addEventListener\('keydown', this\.keyHandler\)/)
})

test('VisorVideo: se registra para el Espacio, ya no lo atiende en su onKeyDown y no deja seguir sus teclas', () => {
  const s = fuente('src/features/cabina/vistas/visor/VisorVideo.tsx')
  assert.match(s, /registrarVisor\(/)
  assert.doesNotMatch(s, /k === ' '/, 'si el onKeyDown también alterna, el Espacio vuelve a pasar dos veces')
  assert.match(s, /if \(hecho\) \{ e\.preventDefault\(\); e\.stopPropagation\(\)/, '← → del visor no mueven también el párrafo del lector')
})

test('velocidad: botón 1x → 1.25x → 1.5x → 1.75x → 2x, sin <select> que el reloj repinte', () => {
  assert.deepEqual([...VELOCIDADES], [1, 1.25, 1.5, 1.75, 2])
  assert.deepEqual([1, 1.25, 1.5, 1.75, 2].map(velocidadEnCiclo), [1.25, 1.5, 1.75, 2, 1])
  assert.equal(siguienteVelocidad(2), 2)
  assert.equal(rotuloVelocidad(1.75), '1.75×')
  for (const f of ['VisorVideo.tsx', 'VisorAudio.tsx']) {
    const s = fuente(`src/features/cabina/vistas/visor/${f}`)
    assert.doesNotMatch(s, /<select/, `${f}: un <select> controlado se reescribe en cada fotograma (parpadeo en WebKit)`)
    assert.match(s, /<BotonVelocidad /)
  }
  const b = fuente('src/features/cabina/vistas/visor/Velocidad.tsx')
  assert.match(b, /memo\(function BotonVelocidad/)
  // La callback debe ser estable o el memo no sirve.
  assert.match(fuente('src/features/cabina/vistas/visor/VisorVideo.tsx'), /const cambiarVelocidad = useCallback\(/)
})
