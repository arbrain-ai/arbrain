/**
 * El velo del modo directo sobre el DOM (7 nov 2026): una sola capa que tapa nombres, correos, teléfonos, dinero y
 * secretos en TODO lo que la app pinta (chat, textos de herramientas, panel, terminal del Taller, SVG de gráficas),
 * sin tocar los componentes uno por uno. Reglas en ./reglas.ts.
 *
 * Cómo: un MutationObserver reescribe el `nodeValue` de cada nodo de texto nuevo o cambiado. Corre como microtarea,
 * antes del siguiente pintado: lo sensible no llega a verse ni un cuadro. React no lee los nodos de texto de vuelta (los
 * escribe), así que cuando cambia el texto lo pisa con el original y el velo lo vuelve a tapar. Al apagar, cada nodo
 * recupera su original.
 *
 * Lo editable no se reescribe (se guardaría tapado): un campo o un editor con algo sensible se difumina entero
 * (`data-directo-velado`, globals.css). Lo que no es DOM (lienzos en <canvas>, imágenes, PDF, video) queda fuera.
 */
import { enmascarar, type Velo } from './reglas'

const IGNORAR = 'script, style, noscript, textarea, input, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [data-directo-ignorar]'
const CAMPOS = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
const TIPOS_TEXTO = new Set(['text', 'search', 'email', 'tel', 'url', ''])
export const ATRIBUTO_VELADO = 'data-directo-velado'

export interface VeloDom { refrescar: () => void; quitar: () => void; /** Nodos tapados ahora (para pruebas y diagnóstico). */ tapados: () => number }

export function instalarVelo(raiz: HTMLElement, obtener: () => Velo | null): VeloDom {
  const registro = new WeakMap<Text, { original: string; velado: string }>()
  const tocados = new Set<Text>()
  const titulos = new Map<Element, string>()
  const velados = new Set<Element>()
  let observando = true

  const ignorado = (n: Node) => { const el = n.parentElement; return !el || !!el.closest(IGNORAR) }

  function velarTexto(t: Text) {
    const actual = t.nodeValue ?? ''
    const previo = registro.get(t)
    if (previo && previo.velado === actual) return
    if (ignorado(t)) { if (previo) { registro.delete(t); tocados.delete(t) } return }
    const tapado = enmascarar(actual, obtener())
    if (tapado === actual) { if (previo) { registro.delete(t); tocados.delete(t) } return }
    registro.set(t, { original: actual, velado: tapado })
    tocados.add(t)
    t.nodeValue = tapado
  }

  function velarTitulo(el: Element) {
    const actual = el.getAttribute('title')
    if (actual == null || el.closest('[data-directo-ignorar]')) return
    const tapado = enmascarar(actual, obtener())
    if (tapado === actual) return
    if (!titulos.has(el)) titulos.set(el, actual)
    el.setAttribute('title', tapado)
  }

  /** Un campo editable: su contenido no se reescribe; si trae algo sensible, se difumina entero. */
  function revisarCampo(el: Element) {
    if (el.closest('[data-directo-ignorar]')) return
    let valor = ''
    if (el instanceof HTMLInputElement) { if (!TIPOS_TEXTO.has(el.type)) return; valor = el.value }
    else if (el instanceof HTMLTextAreaElement) valor = el.value
    else if (el instanceof HTMLElement && el.isContentEditable) valor = el.textContent ?? ''
    const sensible = !!valor && enmascarar(valor, obtener()) !== valor
    if (sensible && !velados.has(el)) { el.setAttribute(ATRIBUTO_VELADO, ''); velados.add(el) }
    if (!sensible && velados.has(el)) { el.removeAttribute(ATRIBUTO_VELADO); velados.delete(el) }
  }

  function recorrer(nodo: Node) {
    if (nodo.nodeType === Node.TEXT_NODE) { velarTexto(nodo as Text); return }
    if (!(nodo instanceof Element)) return
    if (nodo.matches(CAMPOS)) revisarCampo(nodo)
    if (nodo.hasAttribute('title')) velarTitulo(nodo)
    for (const el of nodo.querySelectorAll(CAMPOS)) revisarCampo(el)
    for (const el of nodo.querySelectorAll('[title]')) velarTitulo(el)
    const w = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT)
    for (let t = w.nextNode(); t; t = w.nextNode()) velarTexto(t as Text)
  }

  const observador = new MutationObserver(cambios => {
    if (!observando) return
    // Los nodos que React ya desmontó no se guardan para siempre.
    if (tocados.size > 4000) for (const t of tocados) if (!t.isConnected) { tocados.delete(t); registro.delete(t) }
    for (const c of cambios) {
      if (c.type === 'characterData') {
        velarTexto(c.target as Text)
        const campo = c.target.parentElement?.closest(CAMPOS)
        if (campo) revisarCampo(campo)
      } else if (c.type === 'attributes') {
        if (c.target instanceof Element) velarTitulo(c.target)
      } else {
        for (const n of c.addedNodes) recorrer(n)
        if (c.target instanceof Element && c.target.closest(CAMPOS)) revisarCampo(c.target.closest(CAMPOS)!)
      }
    }
  })
  const alEscribir = (e: Event) => { const el = e.target; if (el instanceof Element) { const campo = el.closest(CAMPOS); if (campo) revisarCampo(campo) } }

  observador.observe(raiz, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title'] })
  raiz.addEventListener('input', alEscribir, true)
  raiz.addEventListener('change', alEscribir, true)
  recorrer(raiz)

  function restaurar() {
    for (const t of tocados) { const r = registro.get(t); if (r && t.nodeValue === r.velado) t.nodeValue = r.original; registro.delete(t) }
    tocados.clear()
    for (const [el, original] of titulos) if (el.isConnected) el.setAttribute('title', original)
    titulos.clear()
    for (const el of velados) el.removeAttribute(ATRIBUTO_VELADO)
    velados.clear()
  }

  return {
    refrescar: () => {
      // El diccionario cambió: cada nodo vuelve a su original y se tapa con las reglas nuevas.
      observando = false
      restaurar()
      observador.takeRecords()
      observando = true
      recorrer(raiz)
      observador.takeRecords()
    },
    quitar: () => {
      observador.disconnect()
      raiz.removeEventListener('input', alEscribir, true)
      raiz.removeEventListener('change', alEscribir, true)
      restaurar()
    },
    tapados: () => { let n = 0; for (const t of tocados) if (t.isConnected) n++; return n },
  }
}
