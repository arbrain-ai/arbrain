/**
 * Saneado del Word renderizado (14 nov 2026, visor de documentos: «el HTML de un docx se sanea»).
 *
 * docx-preview arma el DOM con createElement a partir del XML del .docx; aun así un documento hostil puede traer enlaces
 * `javascript:`, nombres de fuente o estilos con `url(http…)` (una petición a la red al pintarlo: eso filtraría que se abrió) o
 * un `@import`. El cuerpo pasa por DOMPurify en sitio (sin scripts, iframes, formularios ni manejadores `on*`), y el CSS que
 * genera la librería y los `style=""` se limpian aquí: solo sobreviven `url(blob:…)` y `url(data:…)` (imágenes y fuentes que
 * vienen DENTRO del archivo). Los enlaces externos no navegan la app: se abren en el navegador del sistema.
 * `limpiarCss` y `destinoDeEnlace` son puros (tests/visor/sanear-docx.test.ts).
 */

const URL_EXTERNA = /url\(\s*(['"]?)(?!blob:|data:)[^)]*\)/gi

/** CSS sin @import ni url() que salga del archivo. */
export function limpiarCss(css: string): string {
  return css.replace(/@import\b[^;]*;?/gi, '').replace(URL_EXTERNA, 'none').replace(/expression\s*\(/gi, 'x(')
}

/** Qué hacer con un enlace del documento: saltar dentro de él, abrir afuera, o nada. */
export function destinoDeEnlace(href: string | null): { tipo: 'ancla'; id: string } | { tipo: 'externo'; url: string } | null {
  if (!href) return null
  const h = href.trim()
  if (h.startsWith('#')) return h.length > 1 ? { tipo: 'ancla', id: decodeURIComponent(h.slice(1)) } : null
  if (/^(https?:|mailto:)/i.test(h)) return { tipo: 'externo', url: h }
  return null
}

type Purificador = { sanitize(nodo: Node, opciones: Record<string, unknown>): unknown }

/** Limpia en sitio el cuerpo y los <style> de un .docx renderizado. */
export function sanearRenderizado(cuerpo: HTMLElement, estilos: HTMLElement, purificador: Purificador) {
  purificador.sanitize(cuerpo, {
    IN_PLACE: true,
    FORBID_TAGS: ['style', 'script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base', 'audio', 'video', 'foreignObject'],
    FORBID_ATTR: ['srcset', 'action', 'formaction', 'xlink:href'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|#|data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);)/i,
  })
  for (const el of Array.from(cuerpo.querySelectorAll<HTMLElement>('[style]'))) {
    const s = el.getAttribute('style') ?? ''
    if (/url\(|@import|expression/i.test(s)) el.setAttribute('style', limpiarCss(s))
  }
  for (const a of Array.from(cuerpo.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const d = destinoDeEnlace(a.getAttribute('href'))
    if (!d) a.removeAttribute('href')
    else if (d.tipo === 'externo') { a.setAttribute('rel', 'noopener noreferrer'); a.dataset.externo = '' }
  }
  for (const st of Array.from(estilos.querySelectorAll('style'))) st.textContent = limpiarCss(st.textContent ?? '')
  // Lo que no sea <style> en el contenedor de estilos sobra.
  for (const n of Array.from(estilos.childNodes)) if (n.nodeName !== 'STYLE') n.remove()
}
