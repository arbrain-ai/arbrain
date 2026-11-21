/*
 * Lienzo v17 · el HOST COMPARTIDO de las piezas libres (15 nov 2026). Contrato: docs/builds/lienzo-v17/MOTOR.md.
 *
 * Daniel: «recuerdas lo de no estar limitados a las herramientas disponibles y tener la libertad de los html o codigo?».
 * Un solo documento (un iframe por página, `sandbox="allow-scripts"`, origen opaco, CSP sin red) corre TODAS las piezas
 * de la página. Cada pieza es un `<div data-pieza>` con su CSS acotado (`@scope`) y su script como cuerpo de una función
 * `async (pieza, raiz, marca)`. El lienzo coloca las piezas vivas (posición y escala de pantalla) cuando la cámara
 * descansa; con la cámara en movimiento todas duermen y el lienzo pinta su póster, que este mismo host fotografía.
 *
 *   lienzo → host  fuentes · imagen · tema · pieza · quitar · colocar · dormir · recorrido · paso · foto · medir
 *   host → lienzo  hola · montada · error · colocado · foto · accion · fuera · rueda · gesto · tecla · medida
 *
 * Fuera del lienzo (el banco, docs/builds/lienzo-v17/banco.html) corre igual: `window.PiezasHost.recibir(m)` hace de
 * lienzo y `PiezasHost.alMandar(fn)` escucha lo que el host diría.
 */
(function () {
  'use strict'
  if (window.PiezasHost) return
  var padre = window.parent
  var embebido = padre && padre !== window
  var oyentes = []
  function mandar(m, transferir) {
    for (var i = 0; i < oyentes.length; i++) { try { oyentes[i](m) } catch (e) { /* un oyente roto no tumba al host */ } }
    if (embebido) padre.postMessage(m, '*', transferir || [])
  }

  var piezas = Object.create(null)
  var tema = 'oscuro'
  var recorrido = false
  var imagenes = Object.create(null)   // ruta → { url, blob, data: Promise<dataURL> | null }
  var fuentesPoster = ''                // @font-face con data: para la foto (una imagen SVG no ve las FontFace del documento)
  var kitCss = ''

  function kit() {
    if (kitCss) return kitCss
    var st = document.querySelector('style[data-kit]')
    kitCss = st ? st.textContent : ''
    return kitCss
  }

  // ── marca: colores del tema actual, imágenes declaradas ──
  var sonda = null
  var marca = {
    get color() {
      if (!sonda) {
        sonda = document.createElement('div')
        sonda.setAttribute('data-pieza', '__sonda')
        sonda.style.cssText = 'visibility:hidden;width:0;height:0'
        document.body.appendChild(sonda)
      }
      sonda.setAttribute('data-tema', tema)
      var cs = getComputedStyle(sonda)
      var v = function (n) { return cs.getPropertyValue('--ab-' + n).trim() }
      return { oro: v('oro'), oroClaro: v('oro-claro'), oroOscuro: v('oro-oscuro'), morado: v('morado'), moradoSuave: v('morado-suave'),
        fondo: v('fondo'), tinta: v('tinta'), texto: v('texto'), texto2: v('texto-2'), tenue: v('tenue'), ok: v('ok'), mal: v('mal') }
    },
    imagen: function (ruta) { var im = imagenes[String(ruta).replace(/^doc:/, '')]; return im ? im.url : '' },
    get tema() { return tema },
  }

  function dataDeBlob(blob) {
    return new Promise(function (ok, no) { var f = new FileReader(); f.onload = function () { ok(f.result) }; f.onerror = no; f.readAsDataURL(blob) })
  }
  function llenarImagenes(raiz) {
    var lista = raiz.querySelectorAll('img[data-imagen]')
    for (var i = 0; i < lista.length; i++) {
      var url = marca.imagen(lista[i].getAttribute('data-imagen'))
      if (url && lista[i].getAttribute('src') !== url) lista[i].setAttribute('src', url)
    }
  }

  // ── vida y animación: un solo rAF para todas las piezas despiertas ──
  var corriendo = false
  var medicion = null
  function hayQueAnimar() {
    for (var id in piezas) if (piezas[id].despierta && piezas[id].animar.length) return true
    return !!medicion
  }
  function arrancar() {
    if (corriendo || !hayQueAnimar()) return
    corriendo = true
    requestAnimationFrame(cuadro)
  }
  /**
   * El compás: WebKit corre a 30 fps el requestAnimationFrame de un iframe de otro origen con el que el usuario no ha
   * interactuado (medido: 29 fps antes de un clic, 60 después). Por eso el lienzo manda un `tic` por cuadro mientras hay
   * piezas vivas, y el host avanza con lo que llegue primero: su rAF o el tic (nunca dos veces en el mismo cuadro).
   */
  var ultimoPaso = 0
  // El ritmo: cuántos cuadros dio el host en el último segundo con piezas vivas animando. El lienzo lo usa para su
  // presupuesto de vivas (si no llega a ~56, duerme a la más chica).
  var ritmo = { t0: 0, n: 0 }
  function paso(t) {
    if (t - ultimoPaso < 9) return
    var dt = Math.min(100, t - (ultimoPaso || t - 16.7))
    ultimoPaso = t
    if (!ritmo.t0 || dt > 90) { ritmo.t0 = t; ritmo.n = 0 }
    ritmo.n++
    if (t - ritmo.t0 >= 1000) {
      var vivas = 0
      for (var v in piezas) if (piezas[v].despierta && piezas[v].animar.length) vivas++
      if (vivas) mandar({ tipo: 'ritmo', fps: Math.round(ritmo.n * 1000 / (t - ritmo.t0)), vivas: vivas })
      ritmo.t0 = t; ritmo.n = 0
    }
    if (medicion) {
      medicion.deltas.push(dt)
      if (t - medicion.t0 >= medicion.ms) terminarMedicion()
    }
    var c0 = performance.now()
    for (var id in piezas) {
      var p = piezas[id]
      if (!p.despierta) continue
      var a0 = performance.now()
      for (var i = 0; i < p.animar.length; i++) {
        try { p.animar[i](t - p.t0, dt) } catch (e) { mostrarError(p, e); p.animar.splice(i--, 1) }
      }
      if (medicion) medicion.porPieza[id] = (medicion.porPieza[id] || 0) + performance.now() - a0
    }
    if (medicion) medicion.js.push(performance.now() - c0)
  }
  function cuadro() {
    paso(performance.now())
    if (hayQueAnimar()) requestAnimationFrame(cuadro); else corriendo = false
  }
  function pct(a, q) {
    if (!a.length) return null
    var o = a.slice().sort(function (x, y) { return x - y })
    return Math.round(o[Math.min(o.length - 1, Math.floor(q * o.length))] * 100) / 100
  }
  function terminarMedicion() {
    var m = medicion
    medicion = null
    var d = m.deltas.slice(2).sort(function (a, b) { return a - b })
    var suma = d.reduce(function (a, b) { return a + b }, 0)
    var p95 = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : null
    var vivas = 0
    for (var id in piezas) if (piezas[id].despierta) vivas++
    mandar({ tipo: 'medida', pedido: m.pedido, cuadros: d.length, fps: d.length ? Math.round(10000 / (suma / d.length)) / 10 : null,
      p95: p95 != null ? Math.round(p95 * 10) / 10 : null, lentos: d.filter(function (x) { return x > 20 }).length, vivas: vivas,
      // Lo que cuesta el JS de las piezas por cuadro (ms): si esto pasa de ~8, la pieza pide demasiado al hilo.
      jsP50: pct(m.js, 0.5), jsP95: pct(m.js, 0.95),
      porPiezaMsCuadro: Object.keys(m.porPieza).reduce(function (o, k) { o[k] = Math.round(m.porPieza[k] / Math.max(1, m.js.length) * 100) / 100; return o }, {}) })
  }

  function avisar(lista, arg) {
    for (var i = 0; i < lista.length; i++) { try { lista[i](arg) } catch (e) { console.error(e) } }
  }
  function despertar(p, si) {
    if (p.despierta === si) return
    p.despierta = si
    if (si) { p.raiz.removeAttribute('data-dormida'); p.raiz.style.visibility = 'visible'; avisar(p.alDespertar) }
    else { p.raiz.setAttribute('data-dormida', ''); p.raiz.style.visibility = 'hidden'; avisar(p.alDormir) }
  }

  // ── el recorrido: pasos internos ──
  function aplicarPaso(p) {
    var paso = recorrido ? p.paso : p.ficha.pasos
    var lista = p.raiz.querySelectorAll('[data-paso]')
    for (var i = 0; i < lista.length; i++) {
      var n = parseInt(lista[i].getAttribute('data-paso'), 10)
      lista[i].classList.toggle('ab-espera', isFinite(n) && n > paso)
    }
    if (p.pasoAvisado !== paso) { p.pasoAvisado = paso; avisar(p.alPaso, paso) }
  }

  // ── montar una pieza ──
  function mostrarError(p, e) {
    var msg = String((e && (e.stack || e.message)) || e).split('\n').slice(0, 4).join('\n')
    var caja = p.raiz.querySelector(':scope > .ab-error')
    if (!caja) { caja = document.createElement('div'); caja.className = 'ab-error'; caja.setAttribute('data-sin-foto', ''); p.raiz.appendChild(caja) }
    caja.textContent = 'Error en la pieza «' + p.ficha.titulo + '»: ' + msg
    mandar({ tipo: 'error', id: p.id, version: p.version, mensaje: msg.slice(0, 600) })
  }
  function desmontar(p) {
    if (!p) return
    p.vivo = false
    avisar(p.alDormir)
    if (p.raiz && p.raiz.parentNode) p.raiz.parentNode.removeChild(p.raiz)
    if (p.estilo && p.estilo.parentNode) p.estilo.parentNode.removeChild(p.estilo)
  }
  function crearApi(p) {
    var api = {
      animar: function (fn) {
        if (typeof fn !== 'function') return function () {}
        p.animar.push(fn); arrancar()
        return function () { var i = p.animar.indexOf(fn); if (i >= 0) p.animar.splice(i, 1) }
      },
      ir: function (destino) { if (typeof destino === 'string' && destino) mandar({ tipo: 'accion', id: p.id, destino: destino }) },
      alTema: function (fn) { if (typeof fn === 'function') p.alTema.push(fn) },
      alDespertar: function (fn) { if (typeof fn === 'function') p.alDespertar.push(fn) },
      alDormir: function (fn) { if (typeof fn === 'function') p.alDormir.push(fn) },
      alPaso: function (fn) { if (typeof fn === 'function') { p.alPaso.push(fn); try { fn(recorrido ? p.paso : p.ficha.pasos) } catch (e) { mostrarError(p, e) } } },
      listo: function () { if (p.resolverListo) p.resolverListo() },
      lienzo: function (ancho, alto, tipo) {
        var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
        var c = document.createElement('canvas')
        c.width = Math.round(ancho * dpr); c.height = Math.round(alto * dpr)
        c.style.width = ancho + 'px'; c.style.height = alto + 'px'
        var ctx
        if (tipo === 'webgl' || tipo === 'webgl2') ctx = c.getContext(tipo, { preserveDrawingBuffer: true, premultipliedAlpha: true, antialias: true })
        else { ctx = c.getContext('2d'); ctx.scale(dpr, dpr) }
        return { canvas: c, ctx: ctx, dpr: dpr }
      },
    }
    Object.defineProperty(api, 'tema', { get: function () { return tema } })
    Object.defineProperty(api, 'despierta', { get: function () { return p.despierta } })
    Object.defineProperty(api, 'paso', { get: function () { return recorrido ? p.paso : p.ficha.pasos } })
    Object.defineProperty(api, 'pasos', { get: function () { return p.ficha.pasos } })
    Object.defineProperty(api, 'id', { get: function () { return p.id } })
    return Object.freeze(api)
  }
  function montar(m) {
    var t0 = performance.now()
    var vieja = piezas[m.id]
    var colocada = vieja && vieja.colocada
    desmontar(vieja)
    var p = {
      id: m.id, version: m.version, ficha: m.ficha, css: m.css || '', vivo: true, despierta: false, colocada: null,
      animar: [], alTema: [], alDespertar: [], alDormir: [], alPaso: [], t0: performance.now(),
      paso: vieja ? Math.min(vieja.paso, m.ficha.pasos) : m.ficha.pasos, pasoAvisado: null,
    }
    piezas[m.id] = p
    p.estilo = document.createElement('style')
    p.estilo.setAttribute('data-de', m.id)
    p.estilo.textContent = p.css
    document.head.appendChild(p.estilo)
    var raiz = document.createElement('div')
    raiz.setAttribute('data-pieza', m.id)
    raiz.setAttribute('data-tema', tema)
    raiz.setAttribute('data-fondo', m.ficha.fondo)
    raiz.setAttribute('data-dormida', '')
    raiz.style.width = m.ficha.ancho + 'px'
    raiz.style.height = m.ficha.alto + 'px'
    raiz.style.visibility = 'hidden'
    raiz.innerHTML = m.html || ''
    p.raiz = raiz
    document.body.appendChild(raiz)
    llenarImagenes(raiz)
    aplicarPaso(p)
    var listoManual = new Promise(function (ok) { p.resolverListo = ok })
    var api = crearApi(p)
    var corrida = correr(p, api, raiz, m.js || '')
    var tope = new Promise(function (ok) { setTimeout(ok, 4000) })
    p.listo = Promise.race([
      corrida.then(function () { return m.ficha.listo === 'manual' ? listoManual : null }),
      tope,
    ]).then(function () { return document.fonts && document.fonts.ready }).then(dosCuadros)
    // Rehecha estando viva: va a su caja, pero no se despierta (no se ve) hasta que su script terminó: sin marco vacío.
    if (colocada) {
      p.colocada = colocada
      raiz.style.transform = 'translate(' + colocada.x + 'px,' + colocada.y + 'px) scale(' + colocada.escala + ')'
      p.listo.then(function () { if (piezas[m.id] === p && p.colocada) despertar(p, true) })
    }
    dosCuadros().then(function () {
      mandar({ tipo: 'montada', id: m.id, version: m.version, ms: Math.round(performance.now() - t0) })
    })
    if (m.errores && m.errores.length) console.warn('[pieza ' + m.id + '] ' + m.errores.join(' · '))
  }
  /**
   * El script de la pieza corre como un `<script>` en línea (sin eval: la CSP heredada de la app no lo admite en la
   * edición cliente), envuelto en una función `async (pieza, raiz, marca)`: sus variables son suyas. Un error de sintaxis
   * no llega a llamar a `__piezaCorrer`: se detecta y se dice en la pieza.
   */
  var corriendoAhora = null
  window.__piezaCorrer = function (fn) {
    var c = corriendoAhora
    if (!c) return
    c.llamada = true
    try { c.promesa = Promise.resolve(fn(c.api, c.raiz, marca)) } catch (e) { c.promesa = Promise.reject(e) }
  }
  function correr(p, api, raiz, js) {
    var c = { api: api, raiz: raiz, llamada: false, promesa: null, error: null }
    corriendoAhora = c
    var oir = function (ev) { c.error = ev.error || ev.message; ev.preventDefault && ev.preventDefault() }
    window.addEventListener('error', oir)
    var sc = document.createElement('script')
    sc.textContent = 'window.__piezaCorrer(async function (pieza, raiz, marca) {\n' + js + '\n})\n//# sourceURL=pieza-' + p.id + '.js'
    document.head.appendChild(sc)
    document.head.removeChild(sc)
    window.removeEventListener('error', oir)
    corriendoAhora = null
    if (!c.llamada) { mostrarError(p, c.error || 'el script de la pieza no corrió (¿error de sintaxis?)'); return Promise.resolve() }
    return c.promesa.catch(function (e) { mostrarError(p, e) })
  }
  /**
   * Dos cuadros… o 60 ms, lo que llegue antes: el navegador CONGELA requestAnimationFrame en un iframe oculto de otro
   * origen (este host, dormido, lo está), y montar, fotografiar y colocar no pueden esperar a que alguien lo muestre.
   */
  function dosCuadros() {
    return new Promise(function (ok) {
      var hecho = false
      var fin = function () { if (!hecho) { hecho = true; ok() } }
      requestAnimationFrame(function () { requestAnimationFrame(fin) })
      setTimeout(fin, 60)
    })
  }
  function colocar(p, c) {
    p.colocada = c
    p.raiz.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px) scale(' + c.escala + ')'
    despertar(p, true)
  }

  // ── la foto: la pieza de AHORA como imagen (SVG foreignObject → canvas → ImageBitmap) ──
  var NO_PROPS = { offset: 1, easing: 1, composite: 1, computedOffset: 1 }
  function foto(p, opciones) {
    var t0 = performance.now()
    var escala = opciones.escala || 1
    var paso = typeof opciones.paso === 'number' ? opciones.paso : null
    var W = p.ficha.ancho, H = p.ficha.alto
    return p.listo.then(function () {
      var raiz = p.raiz
      var origen = [raiz].concat(Array.prototype.slice.call(raiz.querySelectorAll('*')))
      var clon = raiz.cloneNode(true)
      var copia = [clon].concat(Array.prototype.slice.call(clon.querySelectorAll('*')))
      var indice = new Map()
      for (var n = 0; n < origen.length; n++) indice.set(origen[n], n)
      if (document.getAnimations) {
        var anims = document.getAnimations()
        for (var a = 0; a < anims.length; a++) {
          var ef = anims[a].effect, obj = ef && ef.target
          if (!obj || ef.pseudoElement) continue
          var idx = indice.get(obj)
          if (idx === undefined) continue
          var cs = getComputedStyle(obj), props = Object.create(null)
          var kfs = ef.getKeyframes ? ef.getKeyframes() : []
          for (var k = 0; k < kfs.length; k++) for (var q0 in kfs[k]) if (!NO_PROPS[q0]) props[q0] = 1
          if (anims[a].transitionProperty) props[anims[a].transitionProperty] = 1
          for (var q in props) {
            var nombre = q.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase() })
            var v = cs.getPropertyValue(nombre)
            if (v) copia[idx].style.setProperty(nombre, v, 'important')
          }
        }
      }
      for (var i = 0; i < origen.length; i++) {
        var o = origen[i], c = copia[i]
        if (!c) continue
        if (o.tagName === 'CANVAS') {
          // El <canvas> no pinta dentro de una imagen SVG: viaja como <img> con la caja que le daban sus selectores.
          try {
            var img = document.createElement('img')
            img.src = o.toDataURL()
            var cs0 = getComputedStyle(o)
            var CAJA = ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'transform', 'transform-origin', 'z-index',
              'opacity', 'margin', 'display', 'mix-blend-mode', 'filter', 'border-radius', 'pointer-events']
            for (var z = 0; z < CAJA.length; z++) img.style.setProperty(CAJA[z], cs0.getPropertyValue(CAJA[z]))
            if (typeof o.className === 'string' && o.className) img.className = o.className
            if (c.parentNode) c.parentNode.replaceChild(img, c)
          } catch (e) { /* lienzo manchado: queda vacío en la foto */ }
        } else if (o.tagName === 'INPUT' || o.tagName === 'TEXTAREA') c.setAttribute('value', o.value)
      }
      var quitar = clon.querySelectorAll('script, noscript, [data-sin-foto], [data-isla-sin-foto]')
      for (var j = 0; j < quitar.length; j++) if (quitar[j].parentNode) quitar[j].parentNode.removeChild(quitar[j])
      // El paso pedido (o el final): sin valores a media transición del fundido.
      var pasoFoto = paso != null ? paso : p.ficha.pasos
      var ps = clon.querySelectorAll('[data-paso]')
      for (var s = 0; s < ps.length; s++) {
        var np = parseInt(ps[s].getAttribute('data-paso'), 10)
        ps[s].classList.toggle('ab-espera', isFinite(np) && np > pasoFoto)
        ps[s].style.removeProperty('opacity'); ps[s].style.removeProperty('transform')
      }
      clon.removeAttribute('data-dormida')
      clon.style.transform = 'none'
      clon.style.visibility = 'visible'
      // Las imágenes de marca (blob:) viajan como data: (una imagen SVG no carga nada de fuera).
      var tareas = []
      for (var ruta in imagenes) {
        (function (im) {
          if (!im.data) im.data = dataDeBlob(im.blob)
          tareas.push(im.data.then(function (d) { return [im.url, d] }, function () { return [im.url, ''] }))
        })(imagenes[ruta])
      }
      return Promise.all(tareas).then(function (pares) {
        var envoltura = document.createElement('div')
        envoltura.setAttribute('style', 'position:relative;width:' + W + 'px;height:' + H + 'px;overflow:hidden')
        var st = document.createElement('style')
        st.textContent = fuentesPoster + '\n' + kit() + '\n' + p.css +
          '\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
        envoltura.appendChild(st)
        envoltura.appendChild(clon)
        var xml = new XMLSerializer().serializeToString(envoltura)
        for (var r = 0; r < pares.length; r++) if (pares[r][1]) xml = xml.split(pares[r][0]).join(pares[r][1])
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
          '<foreignObject x="0" y="0" width="100%" height="100%">' + xml + '</foreignObject></svg>'
        var im = new Image()
        im.decoding = 'sync'
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
        // WebKit carga las imágenes ANIDADAS de una imagen SVG (el <canvas> y las capas de marca) después de su decode: una
        // primera pintura las despierta y la segunda, un momento después, ya las trae.
        var anidadas = /<img\b/i.test(xml)
        var cv = document.createElement('canvas')
        cv.width = Math.round(W * escala); cv.height = Math.round(H * escala)
        var cx = cv.getContext('2d')
        var pintarFoto = function () { cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height) }
        var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms) }) }
        return (im.decode ? im.decode() : new Promise(function (ok, no) { im.onload = ok; im.onerror = no }))
          .then(function () { return espera(0) })
          .then(function () { if (anidadas) { pintarFoto(); return espera(140) } })
          .then(function () {
            pintarFoto()
            return createImageBitmap(cv).then(function (bmp) { return { bitmap: bmp, ms: performance.now() - t0 } })
          })
      })
    })
  }

  // ── lo que llega del lienzo ──
  function recibir(m) {
    if (!m || typeof m !== 'object') return
    var p
    switch (m.tipo) {
      case 'fuentes': {
        var reglas = []
        var lista = Array.isArray(m.lista) ? m.lista : []
        for (var i = 0; i < lista.length; i++) {
          var f = lista[i]
          if (!f || !f.buffer) continue
          try {
            var ff = new FontFace(f.familia, f.buffer, { style: f.estilo || 'normal', weight: f.peso || '100 900', display: 'block' })
            document.fonts.add(ff); ff.load()
          } catch (e) { console.warn('[host] fuente', f.familia, e) }
          if (f.data) reglas.push('@font-face{font-family:"' + f.familia + '";font-style:' + (f.estilo || 'normal') + ';font-weight:' + (f.peso || '100 900') + ';src:url(' + f.data + ') format("woff2")}')
        }
        fuentesPoster = reglas.join('\n')
        return
      }
      case 'imagen': {
        if (typeof m.ruta !== 'string' || !m.blob) return
        var vieja = imagenes[m.ruta]
        if (vieja) URL.revokeObjectURL(vieja.url)
        imagenes[m.ruta] = { url: URL.createObjectURL(m.blob), blob: m.blob, data: null }
        for (var id in piezas) llenarImagenes(piezas[id].raiz)
        return
      }
      case 'tema': {
        if (m.modo !== 'claro' && m.modo !== 'oscuro') return
        if (m.modo === tema) return
        tema = m.modo
        for (var id2 in piezas) { piezas[id2].raiz.setAttribute('data-tema', tema); avisar(piezas[id2].alTema, tema) }
        return
      }
      case 'pieza':
        if (typeof m.id !== 'string' || !m.ficha) return
        montar(m)
        return
      case 'quitar':
        desmontar(piezas[m.id]); delete piezas[m.id]
        return
      case 'colocar': {
        var vivas = Object.create(null)
        var l = Array.isArray(m.vivas) ? m.vivas : []
        for (var k = 0; k < l.length; k++) vivas[l[k].id] = l[k]
        for (var id3 in piezas) {
          p = piezas[id3]
          if (vivas[id3]) colocar(p, vivas[id3])
          else { p.colocada = null; despertar(p, false) }
        }
        ritmo.t0 = 0
        arrancar()
        void document.body.offsetWidth   // el estilo nuevo ya está maquetado cuando el lienzo muestre el host
        // «colocado» solo cuando cada viva terminó de montarse, con la MEDIDA real de su raíz: el lienzo comprueba que cae a
        // menos de 1 px de su caja con la cámara de ahora antes de quitar el póster (piezas/confirmadas.ts).
        var esperar = []
        for (var k2 = 0; k2 < l.length; k2++) if (piezas[l[k2].id] && piezas[l[k2].id].listo) esperar.push(piezas[l[k2].id].listo)
        Promise.all(esperar).then(dosCuadros).then(function () {
          var medidas = []
          for (var k3 = 0; k3 < l.length; k3++) {
            var q = piezas[l[k3].id]
            if (!q || q.colocada !== l[k3]) continue
            var b = q.raiz.getBoundingClientRect()
            medidas.push({ id: q.id, x: Math.round(b.left * 100) / 100, y: Math.round(b.top * 100) / 100, ancho: Math.round(b.width * 100) / 100 })
          }
          mandar({ tipo: 'colocado', pedido: m.pedido, medidas: medidas, ancho: vista().ancho })
        })
        return
      }
      case 'dormir':
        for (var id4 in piezas) { piezas[id4].colocada = null; despertar(piezas[id4], false) }
        return
      case 'recorrido':
        recorrido = !!m.activo
        for (var id5 in piezas) { if (!recorrido) piezas[id5].paso = piezas[id5].ficha.pasos; aplicarPaso(piezas[id5]) }
        return
      case 'paso':
        p = piezas[m.id]
        if (!p || typeof m.paso !== 'number') return
        p.paso = Math.max(0, Math.min(p.ficha.pasos, Math.round(m.paso)))
        aplicarPaso(p)
        return
      case 'foto':
        p = piezas[m.id]
        if (!p) { mandar({ tipo: 'foto', id: m.id, pedido: m.pedido, bitmap: null, error: 'no existe' }); return }
        var version = p.version
        foto(p, { escala: m.escala, paso: m.paso }).then(function (r) {
          mandar({ tipo: 'foto', id: m.id, pedido: m.pedido, version: version, paso: typeof m.paso === 'number' ? m.paso : null,
            bitmap: r.bitmap, ancho: r.bitmap.width, alto: r.bitmap.height, ms: Math.round(r.ms) }, [r.bitmap])
        }, function (e) {
          mandar({ tipo: 'foto', id: m.id, pedido: m.pedido, version: version, bitmap: null, error: String((e && e.message) || e) })
        })
        return
      case 'tic':
        if (hayQueAnimar()) paso(performance.now())
        return
      case 'medir':
        medicion = { pedido: m.pedido, ms: Math.max(200, Math.min(20000, m.ms || 3000)), t0: performance.now(), deltas: [], js: [], porPieza: {} }
        arrancar()
        return
    }
  }
  if (embebido) window.addEventListener('message', function (e) { if (e.source === padre) recibir(e.data) })

  // ── botones ──
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-ir]') : null
    if (!el) return
    var raiz = el.closest('[data-pieza]')
    e.preventDefault()
    el.classList.add('ab-yendo')
    setTimeout(function () { el.classList.remove('ab-yendo') }, 420)
    mandar({ tipo: 'accion', id: raiz ? raiz.getAttribute('data-pieza') : null, destino: el.getAttribute('data-ir') })
  }, true)

  // ── el puntero: fuera de una pieza viva, el lienzo vuelve a tomarlo ──
  function sobrePieza(t) {
    var r = t && t.closest ? t.closest('[data-pieza]') : null
    return !!(r && piezas[r.getAttribute('data-pieza')] && piezas[r.getAttribute('data-pieza')].despierta)
  }
  window.addEventListener('pointermove', function (e) { if (!sobrePieza(e.target)) mandar({ tipo: 'fuera' }) }, true)
  document.addEventListener('pointerleave', function () { mandar({ tipo: 'fuera' }) })

  // ── la rueda y el pellizco mueven la cámara del lienzo (salvo un contenedor con data-scroll que aún se desplaza) ──
  function puedeDesplazar(el, dy, dx) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (!n.hasAttribute || !(n.hasAttribute('data-scroll') || n.hasAttribute('data-isla-scroll'))) continue
      var cs = getComputedStyle(n)
      if (dy && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) {
        if ((dy < 0 && n.scrollTop > 0) || (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return true
      }
      if (dx && /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth) {
        if ((dx < 0 && n.scrollLeft > 0) || (dx > 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1)) return true
      }
    }
    return false
  }
  if (embebido) {
    window.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey) && puedeDesplazar(e.target, e.deltaY, e.deltaX)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      mandar({ tipo: 'rueda', x: e.clientX, y: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, wheelDeltaY: typeof e.wheelDeltaY === 'number' ? e.wheelDeltaY : undefined })
    }, { capture: true, passive: false })
    var gesto = function (fase) {
      return function (e) {
        e.preventDefault()
        mandar({ tipo: 'gesto', fase: fase, escala: typeof e.scale === 'number' ? e.scale : 1, x: e.clientX || 0, y: e.clientY || 0 })
      }
    }
    window.addEventListener('gesturestart', gesto('ini'), { passive: false })
    window.addEventListener('gesturechange', gesto('mov'), { passive: false })
    window.addEventListener('gestureend', gesto('fin'), { passive: false })
    // Las teclas del lienzo (capítulos, recorrido, Esc) siguen funcionando después de tocar una pieza.
    window.addEventListener('keydown', function (e) {
      var t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Escape| |PageUp|PageDown|[1-9pP])$/.test(e.key)) return
      e.preventDefault()
      mandar({ tipo: 'tecla', key: e.key, code: e.code, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey })
    }, true)
  }

  window.PiezasHost = {
    recibir: recibir,
    alMandar: function (fn) { oyentes.push(fn) },
    piezas: piezas,
  }
  // Su vista en SUS px: bajo el zoom de interfaz de la app (`zoom` en <html>, ⌘+), WebKit escala también el contenido del
  // iframe y sus px ya no son los del lienzo. El lienzo calibra con esto (piezas/confirmadas.ts › escalaDelHost).
  var vista = function () { var r = document.documentElement.getBoundingClientRect(); return { ancho: r.width || window.innerWidth, alto: r.height || window.innerHeight } }   // fraccional
  window.addEventListener('resize', function () { var v = vista(); mandar({ tipo: 'vista', ancho: v.ancho, alto: v.alto }) })
  var v0 = vista()
  mandar({ tipo: 'hola', v: 1, ancho: v0.ancho, alto: v0.alto })
})()
