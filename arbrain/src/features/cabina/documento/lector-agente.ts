/**
 * EL AGENTE DEL LECTOR (7 oct 2026): la parte del «Escuchar» de las pestañas del panel que toca el DOM del documento.
 *
 * La voz y su motor (chat-speech.ts) viven en la app; el texto a leer vive en otro sitio: el markdown pintado en la
 * misma página o, en un .html, un iframe de origen opaco al que la app no puede asomarse. Este agente es el pedazo
 * que sabe recorrer UN documento: extrae sus bloques (extraer), pinta la palabra que suena (pintar), trae el párrafo
 * a la vista (ver) y avisa de un toque (alToque). Es la misma función en los dos sitios:
 *
 *  · .md / .txt: se llama directo sobre el contenedor (lector-documento.ts).
 *  · .html: se SERIALIZA (`toString`) dentro de SCRIPT_LECTOR, que el servidor inyecta en el HTML al servirlo, junto al
 *    del tema (tema-html.ts). El archivo no sabe nada: «fuera del archivo, no un script en cada HTML».
 *
 * POR ESO esta función es JS autocontenido: sin imports, sin constantes de módulo, sin sintaxis que un compilador
 * reescriba con ayudantes (async/await, spread, ?.). Todo lo que usa está dentro.
 *
 * LAS LECCIONES DEL MOTOR, aplicadas aquí:
 *  · Documentos largos: la extracción corre por trozos de 160 candidatos con un respiro de `setTimeout` entre uno y
 *    otro; un pergamino de 100 KB no congela ni la app ni el iframe (que comparte hilo con la voz).
 *  · Scroll con moderación: solo se mueve si el párrafo sale de la zona cómoda (15–85 %) del contenedor que
 *    DESPLAZA (el panel, no la ventana), y 'auto' en saltos largos. Un scroll continuo despierta a todo observador.
 *  · Un solo Highlight persistente por ventana (clear+add), nunca uno por palabra.
 *  · Offsets contra `textContent` del bloque: son los mismos que ve el motor en su espejo.
 *
 * Qué NO se lee: menús, pies de lámina y leyendas, código, botones y campos, lo oculto (display:none, <details>
 * cerrado, aria-hidden) y los bloques que son casi todo `<code>`. Los pies REPETIDOS los quita lector-seleccion.ts,
 * que ve el documento entero. Si la página no usa <p>/<li>/<h*> (todo son <div>), se leen las hojas de texto.
 */
export interface AgenteLector {
  /** Prepara el documento para tocarlo (cursor, escuchador de toques). */
  activar(): void
  /** Recorre el documento y entrega sus bloques; las posiciones son los índices de pintar/ver/alToque. */
  extraer(listo: (bloques: Array<{ t: string; tabla: boolean; enc: boolean }>) => void): void
  pintar(bloque: number, desde: number, hasta: number): void
  limpiar(): void
  ver(bloque: number): void
  /** Suelta todo: resaltado, cursor y escuchador. */
  cerrar(): void
}

export function crearAgenteLector(
  raiz: Element,
  ventana: Window,
  alToque: (bloque: number, offset: number) => void,
): AgenteLector {
  var SEL = 'p,li,h1,h2,h3,h4,h5,h6,blockquote'
  var HOJAS = 'div,article,section,dd,dt,td,summary'
  var FUERA =
    'nav,aside,footer,figcaption,pre,button,select,option,textarea,input,script,style,noscript,svg,canvas,template,iframe,' +
    '[aria-hidden="true"],[hidden],[role="navigation"],[role="contentinfo"],[role="button"],[contenteditable="true"],[data-no-leer]'
  // Clases que por su nombre son chrome del documento: «pie», «pie-leyenda», «footer», «menu», «indice»…
  // Por token entero o con guion: «pieza» no es «pie».
  var CLASE_FUERA = /^(pie|pie[-_].*|footer.*|foot|nav|nav[-_].*|navbar|menu|menu[-_].*|indice|toc|breadcrumbs?|leyenda.*|legend.*|sidebar.*|skip.*)$/i
  var NOMBRE_HL = 'arbrain-lector'
  var CSS_ID = 'arbrain-lector-css'

  var bloques: Array<{ el: Element; t: string; tabla: boolean; enc: boolean }> = []
  var indice = new Map<Element, number>()
  var activo = false
  var docs: Document[] = []
  var resaltados = new Map<Window, Highlight>()
  var cacheFuera = new Map<Node, boolean>()

  function esFuera(el: Element): boolean {
    // Solo cuenta lo que está DENTRO del contenedor leído: el panel que lo aloja puede ser un <aside> o llevar <nav>.
    var f = el.closest(FUERA)
    if (f && f !== raiz && (f.ownerDocument !== raiz.ownerDocument || raiz.contains(f))) return true
    // Por clase, subiendo hasta la raíz del documento; cada ancestro se juzga una sola vez.
    var cadena: Element[] = []
    var n: Element | null = el
    var r = false
    while (n && n !== raiz.parentElement) {
      var c = cacheFuera.get(n)
      if (c !== undefined) {
        r = c
        break
      }
      cadena.push(n)
      var cl = n.getAttribute('class')
      if (cl) {
        var tokens = cl.split(/\s+/)
        for (var i = 0; i < tokens.length; i++) {
          if (tokens[i] && CLASE_FUERA.test(tokens[i])) {
            r = true
            break
          }
        }
      }
      if (r) break
      n = n.parentElement
    }
    for (var k = 0; k < cadena.length; k++) cacheFuera.set(cadena[k], r)
    return r
  }

  function casiTodoCodigo(el: Element, t: string): boolean {
    var cods = el.querySelectorAll('code,kbd,samp')
    if (!cods.length) return false
    var n = 0
    for (var i = 0; i < cods.length; i++) n += (cods[i].textContent || '').length
    return n > 0.6 * t.length
  }

  /** Candidatos en orden de documento; los iframes que se dejan abrir (srcdoc, mismo origen) se leen en su sitio. */
  function candidatos(r: Element, selector: string, acc: Element[], prof: number) {
    var l = r.querySelectorAll(selector + ',iframe')
    for (var k = 0; k < l.length; k++) {
      var e = l[k]
      if (e.tagName === 'IFRAME') {
        if (prof >= 3) continue
        try {
          var d = (e as HTMLIFrameElement).contentDocument
          if (d && d.documentElement) {
            if (docs.indexOf(d) < 0) docs.push(d)
            candidatos(d.documentElement, selector, acc, prof + 1)
          }
        } catch (x) {
          /* de otro origen: no se puede leer */
        }
      } else acc.push(e)
    }
  }

  function recorrer(selector: string, esHoja: (el: Element) => boolean, minimo: number, fin: (out: typeof bloques) => void) {
    var acc: Element[] = []
    candidatos(raiz, selector, acc, 0)
    var out: typeof bloques = []
    var i = 0
    function trozo() {
      var tope = Math.min(acc.length, i + 160)
      for (; i < tope; i++) {
        var el = acc[i]
        if (!esHoja(el)) continue
        var t = el.textContent || ''
        if (!/\S/.test(t) || t.replace(/\s+/g, '').length < minimo) continue
        if (esFuera(el)) continue
        if (!el.getClientRects().length) continue
        if (casiTodoCodigo(el, t)) continue
        out.push({ el: el, t: t, tabla: !!el.closest('table'), enc: /^H[1-6]$/.test(el.tagName) })
      }
      if (i < acc.length) ventana.setTimeout(trozo, 0)
      else fin(out)
    }
    trozo()
  }

  function extraer(listo: (b: Array<{ t: string; tabla: boolean; enc: boolean }>) => void) {
    cacheFuera = new Map()
    docs = [raiz.ownerDocument as Document]
    var entregar = function (out: typeof bloques) {
      bloques = out
      indice = new Map()
      for (var i = 0; i < out.length; i++) indice.set(out[i].el, i)
      escucharDocs()
      listo(out.map(function (b) { return { t: b.t, tabla: b.tabla, enc: b.enc } }))
    }
    recorrer(SEL, function (el) { return !el.querySelector(SEL) }, 1, function (out) {
      if (out.length >= 3) return entregar(out)
      // Página sin párrafos (todo <div>): se leen las hojas de texto.
      recorrer(HOJAS, function (el) { return !el.querySelector(SEL + ',' + HOJAS + ',table,ul,ol') }, 25, function (hojas) {
        entregar(hojas.length > out.length ? hojas : out)
      })
    })
  }

  // ── Resaltado ──
  function ventanaDe(el: Element): Window {
    return (el.ownerDocument as Document).defaultView || ventana
  }
  function resaltadoDe(win: Window): Highlight | null {
    var H = (win as unknown as { Highlight?: new () => Highlight }).Highlight
    var css = (win as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
    var reg = css && css.highlights
    if (!H || !reg) return null
    var hl = resaltados.get(win)
    if (!hl) {
      hl = new H()
      reg.set(NOMBRE_HL, hl)
      resaltados.set(win, hl)
    }
    var d = win.document
    if (!d.getElementById(CSS_ID)) {
      var st = d.createElement('style')
      st.id = CSS_ID
      st.textContent =
        '::highlight(' + NOMBRE_HL + '){background:rgba(255,145,1,.65);color:#1a1208}' +
        '[data-arbrain-lee] :is(p,li,h1,h2,h3,h4,h5,h6,blockquote){cursor:pointer}'
      ;(d.head || d.documentElement).appendChild(st)
    }
    return hl
  }

  function pintar(i: number, desde: number, hasta: number) {
    var b = bloques[i]
    if (!b || !b.el.isConnected) return
    var hl = resaltadoDe(ventanaDe(b.el))
    if (!hl) return
    try {
      var d = b.el.ownerDocument as Document
      var walker = d.createTreeWalker(b.el, 4 /* SHOW_TEXT */)
      var nodo: Node | null
      var off = 0
      var rango = d.createRange()
      var s = false
      var e = false
      while ((nodo = walker.nextNode())) {
        var len = (nodo.textContent || '').length
        if (!s && off + len > desde) {
          rango.setStart(nodo, desde - off)
          s = true
        }
        if (s && off + len >= hasta) {
          rango.setEnd(nodo, Math.min(hasta - off, len))
          e = true
          break
        }
        off += len
      }
      if (s && e) {
        // Los de otras ventanas (iframes anidados) se apagan: hay UNA palabra viva.
        resaltados.forEach(function (h) { h.clear() })
        hl.add(rango)
      }
    } catch (x) {
      /* cosmético */
    }
  }

  function limpiar() {
    resaltados.forEach(function (h) { h.clear() })
  }

  // ── Scroll ──
  /** El ancestro que de verdad desplaza (en el panel es la pestaña, no la ventana). */
  function desplazador(el: Element): Element | null {
    var n = el.parentElement
    while (n && n !== (el.ownerDocument as Document).documentElement) {
      var o = ventanaDe(n).getComputedStyle(n).overflowY
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
      n = n.parentElement
    }
    return null
  }

  function ver(i: number) {
    var b = bloques[i]
    if (!b || !b.el.isConnected) return
    var r = b.el.getBoundingClientRect()
    var c = desplazador(b.el)
    var arriba = 0
    var alto = ventanaDe(b.el).innerHeight
    if (c) {
      var cr = c.getBoundingClientRect()
      arriba = cr.top
      alto = cr.height
    }
    var top = r.top - arriba
    var bottom = r.bottom - arriba
    if (top >= alto * 0.15 && bottom <= alto * 0.85) return
    var lejos = bottom < 0 || top > alto || Math.abs(top - alto / 2) > alto
    b.el.scrollIntoView({ behavior: lejos ? 'auto' : 'smooth', block: 'center' })
  }

  // ── Toques: tocar un párrafo salta ahí, desde la palabra bajo el dedo ──
  function offsetEn(el: Element, x: number, y: number): number {
    var d = el.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    }
    var nodo: Node | null = null
    var dentro = 0
    if (d.caretRangeFromPoint) {
      var rg = d.caretRangeFromPoint(x, y)
      if (rg) {
        nodo = rg.startContainer
        dentro = rg.startOffset
      }
    } else if (d.caretPositionFromPoint) {
      var cp = d.caretPositionFromPoint(x, y)
      if (cp) {
        nodo = cp.offsetNode
        dentro = cp.offset
      }
    }
    if (!nodo || nodo.nodeType !== 3 || !el.contains(nodo)) return 0
    var walker = d.createTreeWalker(el, 4)
    var off = 0
    var n: Node | null
    while ((n = walker.nextNode())) {
      if (n === nodo) return off + dentro
      off += (n.textContent || '').length
    }
    return 0
  }

  function alClic(ev: Event) {
    if (!activo) return
    var e = ev as MouseEvent
    var t = e.target as Element | null
    if (!t || !t.closest) return
    var sel = ventanaDe(t).getSelection && ventanaDe(t).getSelection()
    if (sel && sel.type === 'Range' && String(sel).trim()) return // está seleccionando para copiar
    // Lo interactivo del documento (un enlace, un control) sigue siendo suyo.
    if (t.closest('a,button,input,select,textarea,summary,label,[role="button"],[onclick]')) return
    var n: Element | null = t
    while (n) {
      var i = indice.get(n)
      if (i !== undefined) {
        alToque(i, offsetEn(n, e.clientX, e.clientY))
        return
      }
      n = n.parentElement
    }
  }

  var escuchados: Document[] = []
  function escucharDocs() {
    if (!activo) return
    for (var i = 0; i < docs.length; i++) {
      if (escuchados.indexOf(docs[i]) < 0) {
        docs[i].addEventListener('click', alClic)
        escuchados.push(docs[i])
      }
    }
  }

  function activar() {
    activo = true
    raiz.setAttribute('data-arbrain-lee', '')
    escucharDocs()
  }

  function cerrar() {
    activo = false
    raiz.removeAttribute('data-arbrain-lee')
    for (var i = 0; i < escuchados.length; i++) escuchados[i].removeEventListener('click', alClic)
    escuchados = []
    limpiar()
    resaltados.forEach(function (_h, win) {
      try {
        var css = (win as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
        if (css && css.highlights) css.highlights.delete(NOMBRE_HL)
      } catch (x) {
        /* ventana ya cerrada */
      }
    })
    resaltados = new Map()
    bloques = []
    indice = new Map()
  }

  // Los toques del documento principal se escuchan desde ya (extraer registra los de iframes anidados).
  docs = [raiz.ownerDocument as Document]

  return { activar: activar, extraer: extraer, pintar: pintar, limpiar: limpiar, ver: ver, cerrar: cerrar }
}

/**
 * Lo que se inyecta en cada .html servido: el agente y el pegamento de mensajes con la app.
 *  app → documento: `arbrain-lector-pedir {id}` · `-pintar {i,desde,hasta}` · `-ver {i}` · `-limpiar` · `-cerrar`
 *  documento → app: `arbrain-lector-bloques {id,bloques}` · `arbrain-lector-toque {i,offset}` · `arbrain-lector-ancla {der}`
 * Solo escucha mensajes de su ventana padre.
 */
export const SCRIPT_LECTOR =
  '<script>(function(){var crear=' +
  crearAgenteLector.toString() +
  ';var ag=crear(document.documentElement,window,function(i,o){parent.postMessage({tipo:"arbrain-lector-toque",i:i,offset:o},"*")});' +
  'addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(!d||typeof d.tipo!=="string"||d.tipo.indexOf("arbrain-lector-")!==0)return;' +
  'if(d.tipo==="arbrain-lector-pedir"){ag.activar();ag.extraer(function(l){parent.postMessage({tipo:"arbrain-lector-bloques",id:d.id,bloques:l},"*")})}' +
  'else if(d.tipo==="arbrain-lector-pintar")ag.pintar(d.i,d.desde,d.hasta);' +
  'else if(d.tipo==="arbrain-lector-ver")ag.ver(d.i);' +
  'else if(d.tipo==="arbrain-lector-limpiar")ag.limpiar();' +
  'else if(d.tipo==="arbrain-lector-cerrar")ag.cerrar()});' +
  // Ancla de la píldora «Escuchar» de la app: cuánto espacio deja a la derecha el botón «tema» del documento (0 si no tiene).
  'var U=-1;function A(){var b=document.querySelector("#tema-btn,.tema,[data-tema-btn]");var r=b&&b.getBoundingClientRect();var v=r&&r.width?Math.round(innerWidth-r.left+8):0;if(v!==U){U=v;parent.postMessage({tipo:"arbrain-lector-ancla",der:v},"*")}}' +
  'addEventListener("load",function(){A();setTimeout(A,500)});addEventListener("resize",A);' +
  'addEventListener("message",function(e){if(e.source===parent&&e.data&&(e.data.tipo==="arbrain-zoom"||e.data.tipo==="arbrain-tema"))setTimeout(A,60)})})()</script>'
