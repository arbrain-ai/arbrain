import test from 'node:test'
import assert from 'node:assert/strict'
import { resizeComposer } from '../../src/features/chat/lib/composer-size'

// 31 oct 2026, Daniel: «cuando estoy escribiendo en la parte de hasta abajo con el teclado, cada tecla como que hace
// parpadear la pantalla, como que sube y baja». La medición colapsaba la caja real a 0 px en cada tecla; en WebKit eso
// agrandaba el hilo un instante, le recortaba el scroll al fondo y el hilo bajaba y subía (73–242 px por tecla, medido
// con scripts/qa/test-composer-teclear-browser.mjs). Contrato: la caja real solo recibe su alto final, y solo si cambió.

const LINEA = 24, PADDING = 8
type Escritura = [string, string]
function caja(valor: string) {
  const escrituras: Escritura[] = []
  const estilo: Record<string, string> = {}
  const style = new Proxy(estilo, { set(o, k: string, v) { escrituras.push([k, String(v)]); o[k] = String(v); return true } })
  const padre = { hijos: [] as unknown[] }
  const el = {
    value: valor, className: 'chat-input-scroll', rows: 1, style, parentNode: padre,
    get previousSibling() { return null }, get nextSibling() { return padre.hijos[padre.hijos.indexOf(el) + 1] ?? null },
    after(n: { parentNode: unknown; previousSibling: unknown }) { padre.hijos.splice(padre.hijos.indexOf(el) + 1, 0, n); n.parentNode = padre; n.previousSibling = el },
  }
  padre.hijos.push(el)
  return { el, escrituras, padre }
}
function gemeloFalso() {
  const style: Record<string, string> & { cssText?: string } = {}
  const g = {
    value: '', className: '', rows: 0, tabIndex: 0, readOnly: false, dataset: {} as Record<string, string>, style, parentNode: null as unknown, previousSibling: null as unknown,
    atributos: {} as Record<string, string>, setAttribute(k: string, v: string) { g.atributos[k] = v },
    // Alto de contenido: un renglón por línea (el gemelo mide; la caja real nunca se colapsa).
    get scrollHeight() { return g.value.split('\n').length * LINEA + PADDING },
  }
  return g
}
let creados: ReturnType<typeof gemeloFalso>[] = []
Object.assign(globalThis, {
  window: { innerHeight: 900, innerWidth: 1280 },
  document: { createElement: () => { const g = gemeloFalso(); creados.push(g); return g } },
  getComputedStyle: () => ({ fontSize: '16px', lineHeight: `${LINEA}px`, paddingTop: '4px', paddingBottom: '4px', width: '612px' }),
})

test('la caja real nunca se colapsa para medir: solo recibe su alto final', () => {
  creados = []
  const { el, escrituras } = caja('uno\ndos\ntres\ncuatro')
  resizeComposer(el as unknown as HTMLTextAreaElement)
  const altos = escrituras.filter(([k]) => k === 'height').map(([, v]) => v)
  assert.deepEqual(altos, [`${4 * LINEA + PADDING}px`], 'un solo cambio de alto, sin 0px ni auto intermedio')
  assert.equal(el.style.overflowY, 'hidden')
})

test('una tecla que no cambia de renglón no toca el estilo de la caja', () => {
  creados = []
  const { el, escrituras } = caja('uno\ndos\ntres\ncuatro: ')
  resizeComposer(el as unknown as HTMLTextAreaElement)
  escrituras.length = 0
  for (const letra of 'Okey sistemas') { el.value += letra; resizeComposer(el as unknown as HTMLTextAreaElement) }
  assert.deepEqual(escrituras, [], 'cero escrituras de estilo mientras el texto sigue en el mismo renglón')
})

test('el gemelo es uno solo por caja, invisible, de alto 0, fuera del flujo y junto a la caja', () => {
  creados = []
  const { el, padre } = caja('hola')
  for (let i = 0; i < 5; i++) resizeComposer(el as unknown as HTMLTextAreaElement)
  assert.equal(creados.length, 1, 'se reutiliza, no se crea por tecla')
  const [g] = creados
  assert.equal(padre.hijos[padre.hijos.indexOf(el) + 1], g)
  assert.equal(g.atributos['aria-hidden'], 'true')
  assert.equal(g.tabIndex, -1)
  assert.equal(g.className, el.className, 'misma clase: mismos estilos de texto')
  for (const [k, v] of Object.entries({ position: 'absolute', height: '0', minHeight: '0', visibility: 'hidden', overflow: 'hidden', width: '612px' })) assert.equal(g.style[k], v, k)
})

test('pasando el tope, la caja se queda en el tope y scrollea por dentro', () => {
  creados = []
  const { el } = caja(Array.from({ length: 20 }, (_, i) => `renglón ${i}`).join('\n'))
  resizeComposer(el as unknown as HTMLTextAreaElement)
  assert.equal(el.style.height, `${8 * LINEA + PADDING}px`)
  assert.equal(el.style.overflowY, 'auto')
  el.value = 'corto'
  resizeComposer(el as unknown as HTMLTextAreaElement)
  assert.equal(el.style.height, '34px', 'vacío o una línea = mínimo de una línea')
  assert.equal(el.style.overflowY, 'hidden')
})
