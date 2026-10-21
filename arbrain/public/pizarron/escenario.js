/*
 * El escenario del pizarrón (7 oct 2026) · la superficie donde Levy enseña.
 *
 * Corre aislado (iframe sandbox="allow-scripts", origen opaco): el código que fabrica Levy vive aquí y no alcanza la
 * sesión de Arbrain. No decide tiempos: la vista del panel (arbrain/src/features/pizarron/) lleva el reloj de la voz y
 * le manda cada acotación en la palabra exacta. Este archivo pinta, anima y escucha los gestos del alumno.
 *
 * Capas, de abajo arriba: papel (con grano) → territorio (#mundo, transformado por la cámara: elementos, hilos, tinta
 * de Levy, lápiz del alumno, notas escritas) → velo (el tiempo se detiene) → pregunta → Halo (el cursor de Levy, en
 * pantalla) → subtítulo.
 *
 * Contrato de mensajes (todos con pz:1): ver PROTOCOLO.md en esta carpeta.
 */
(() => {
  'use strict'

  // ───────────────────────── utilidades ─────────────────────────
  const $ = (s) => document.querySelector(s)
  const NS = 'http://www.w3.org/2000/svg'
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const facil = {
    lineal: (t) => t,
    suave: (t) => t * t * (3 - 2 * t),
    sale: (t) => 1 - Math.pow(1 - t, 3),
    entra: (t) => t * t * t,
    entraSale: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    rebote: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
  }
  /** Azar con semilla (mulberry32): lo que dibuja Levy se repite igual en cada reproducción. */
  function azar(semilla) {
    let a = (typeof semilla === 'string' ? [...semilla].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703) : semilla >>> 0) || 1
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const css = (n) => getComputedStyle(document.body).getPropertyValue(n).trim()

  // ───────────────────────── reloj ─────────────────────────
  // En vivo, el reloj es el de la página. Para exportar video, el padre lo avanza cuadro a cuadro (reloj virtual).
  const R = { virtual: false, t: 0 }
  const ahora = () => (R.virtual ? R.t : performance.now() / 1000)

  // ───────────────────────── estado ─────────────────────────
  const E = {
    elementos: new Map(), // id → elemento
    grupos: [], // cajas de cada paso, en orden
    biblioteca: new Map(), // id de objeto → { codigo, ficha, montar: Promise }
    imagenes: new Map(), // id → { url, ancho, alto }
    tintas: [], // trazos de Levy { id, nodo, ref }
    lapiz: new Map(), // trazos del alumno id → { puntos, nodo, en }
    hilos: [],
    animaciones: new Set(),
    pausa: false,
    congelado: null,
    lapizActivo: false,
    luz: 'papel',
  }
  const vista = $('#vista'), mundo = $('#mundo'), capaEl = $('#capa-elementos'), capaTinta = $('#capa-tinta'), capaLapiz = $('#capa-lapiz')
  const capaHilos = $('#capa-hilos'), capaNotas = $('#capa-notas'), halo = $('#halo'), sub = $('#subtitulo'), preg = $('#pregunta')

  const enviar = (tipo, datos) => parent.postMessage({ pz: 1, tipo, ...(datos || {}) }, '*')
  const avisar = (donde, e) => { const mensaje = e instanceof Error ? `${e.name}: ${e.message}` : String(e); console.error('[pizarrón]', donde, e); enviar('error', { donde, mensaje }) }

  // ───────────────────────── animaciones ─────────────────────────
  /** Una animación con duración (s): cada(t01) en cada cuadro; fin() al terminar. Devuelve una promesa. */
  function animar(dur, cada, { facilidad = facil.suave, fin } = {}) {
    return new Promise((listo) => {
      const a = { t0: ahora(), dur: Math.max(0.001, dur), cada, facilidad, fin: () => { fin && fin(); listo() } }
      E.animaciones.add(a)
      if (dur <= 0.001) { cada(1); E.animaciones.delete(a); a.fin() }
    })
  }

  // ───────────────────────── cámara ─────────────────────────
  const C = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1, rapidez: 4.2, ultimoRaster: 1 }
  function tamVista() { return { w: vista.clientWidth || 800, h: vista.clientHeight || 600 } }
  function aPantalla(p) { const { w, h } = tamVista(); return { x: (p.x - C.x) * C.z + w / 2, y: (p.y - C.y) * C.z + h / 2 } }
  function aMundo(sx, sy) { const { w, h } = tamVista(); return { x: (sx - w / 2) / C.z + C.x, y: (sy - h / 2) / C.z + C.y } }
  function aplicarCamara() {
    const { w, h } = tamVista()
    mundo.style.transform = `translate(${w / 2 - C.x * C.z}px, ${h / 2 - C.y * C.z}px) scale(${C.z})`
    if (Math.abs(C.z / C.ultimoRaster - 1) > 0.12) { C.ultimoRaster = C.z; reRasterizar() }
  }
  /** Lleva la cámara a una caja del mundo para que se lea a lo ancho del panel. */
  function encuadrar(caja, { margen = 56, zMax = 1.35, inmediato = false, rapidez = 4.2 } = {}) {
    const { w, h } = tamVista()
    const util = h - 120 // banda reservada abajo: subtítulo y controles
    const z = clamp(Math.min((w - margen * 2) / Math.max(caja.w, 1), (util - margen * 2) / Math.max(caja.h, 1)), 0.18, zMax)
    C.tx = caja.x + caja.w / 2; C.ty = caja.y + caja.h / 2 + 48 / z; C.tz = z; C.rapidez = rapidez
    if (inmediato) { C.x = C.tx; C.y = C.ty; C.z = C.tz; aplicarCamara() }
  }
  function cajaTodo() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const el of E.elementos.values()) { if (el.oculto) continue; x1 = Math.min(x1, el.x); y1 = Math.min(y1, el.y); x2 = Math.max(x2, el.x + el.w); y2 = Math.max(y2, el.y + el.h) }
    for (const t of E.lapiz.values()) for (const p of t.puntos) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]) }
    if (!isFinite(x1)) return { x: -300, y: -200, w: 600, h: 400 }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }
  let rasterPend = 0
  function reRasterizar() { clearTimeout(rasterPend); rasterPend = setTimeout(() => { for (const el of E.elementos.values()) if (el.inst) el.inst.redimensionar() }, R.virtual ? 0 : 140) }

  // ───────────────────────── el Halo ─────────────────────────
  // Vive en pantalla (no escala con la cámara). Su viaje es de mano humana: arco leve, arranque y frenado suaves,
  // duración por la ley de Fitts. Mientras la tinta corre, su punta es la pluma.
  const H = { x: -40, y: -40, mundo: null, viaje: null, sigue: null, visto: 0, semilla: 7 }
  function haloA(p, { dur } = {}) {
    H.sigue = null
    const desde = { x: H.x, y: H.y }, hasta = aPantalla(p)
    H.mundo = p
    if (!halo.classList.contains('vivo')) { H.x = hasta.x + 60; H.y = hasta.y + 40; desde.x = H.x; desde.y = H.y; halo.classList.add('vivo') }
    const d = Math.hypot(hasta.x - desde.x, hasta.y - desde.y)
    const T = dur ?? clamp(0.16 + 0.11 * Math.log2(1 + d / 24), 0.22, 0.9)
    const r = azar(H.semilla++)
    const curva = (r() - 0.5) * 0.35 * d
    const nx = -(hasta.y - desde.y) / (d || 1), ny = (hasta.x - desde.x) / (d || 1)
    H.viaje = { desde, hasta: p, t0: ahora(), T, nx, ny, curva }
    H.visto = ahora()
    halo.classList.remove('respira')
    return animar(T, () => {})
  }
  function haloPulso() { halo.classList.remove('pulso'); void halo.offsetWidth; halo.classList.add('pulso') }
  function pasoHalo() {
    if (H.sigue) { const s = aPantalla(H.sigue()); H.x = s.x; H.y = s.y; H.visto = ahora() }
    else if (H.viaje) {
      const v = H.viaje, k = clamp((ahora() - v.t0) / v.T, 0, 1), e = facil.entraSale(k)
      const fin = aPantalla(v.hasta)
      const b = Math.sin(Math.PI * k) * v.curva
      H.x = lerp(v.desde.x, fin.x, e) + v.nx * b; H.y = lerp(v.desde.y, fin.y, e) + v.ny * b
      if (k >= 1) H.viaje = null
    } else if (H.mundo) { const s = aPantalla(H.mundo); H.x = s.x; H.y = s.y }
    halo.style.transform = `translate(${H.x}px, ${H.y}px)`
    if (halo.classList.contains('vivo') && !H.viaje && !H.sigue && ahora() - H.visto > 2.5) halo.classList.add('respira')
  }

  // ───────────────────────── trazo a mano ─────────────────────────
  /** Contorno de un trazo con grosor de pluma (se afina en las puntas, respira un poco). puntos: [[x,y],...] */
  function contorno(puntos, ancho, semilla = 1) {
    const n = puntos.length
    if (n < 2) { const p = puntos[0] || [0, 0]; const r = ancho / 2; return `M${p[0] - r},${p[1]}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0` }
    const rnd = azar(semilla), izq = [], der = []
    let largo = 0; const acum = [0]
    for (let i = 1; i < n; i++) { largo += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]); acum.push(largo) }
    const fase = rnd() * 6
    for (let i = 0; i < n; i++) {
      const a = puntos[Math.max(0, i - 1)], b = puntos[Math.min(n - 1, i + 1)]
      let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d
      const s = largo ? acum[i] / largo : 0
      const punta = Math.min(1, Math.min(acum[i], largo - acum[i]) / Math.max(8, ancho * 3.2))
      const w = (ancho / 2) * (0.35 + 0.65 * Math.sqrt(punta)) * (0.9 + 0.12 * Math.sin(fase + s * 9))
      izq.push([puntos[i][0] - dy * w, puntos[i][1] + dx * w]); der.push([puntos[i][0] + dy * w, puntos[i][1] - dx * w])
    }
    const pts = izq.concat(der.reverse())
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length]
      d += `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`
    }
    return d + 'Z'
  }
  function largoDe(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l }
  function tramo(pts, k) {
    if (k >= 1) return pts
    const total = largoDe(pts) * k; let l = 0; const out = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (l + s >= total) { const t = (total - l) / (s || 1); out.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]); return out }
      l += s; out.push(pts[i])
    }
    return out
  }
  /** Dibuja un trazo de tinta de Levy con la pluma del Halo. */
  function entintar(pts, { clase = 'trazo', ancho, semilla = 3, ref, dur, instantaneo, conHalo = true } = {}) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('class', clase)
    capaTinta.appendChild(p)
    const grueso = ancho ?? 4.2 / Math.sqrt(Math.max(C.z, 0.35))
    const t = { id: `t${E.tintas.length + 1}`, nodo: p, ref }
    E.tintas.push(t)
    if (instantaneo) { p.setAttribute('d', contorno(pts, grueso, semilla)); return Promise.resolve() }
    const T = dur ?? clamp(largoDe(pts) / 780, 0.32, 1.25)
    let ultimo = pts[0]
    if (conHalo) { H.viaje = null; H.sigue = () => ({ x: ultimo[0], y: ultimo[1] }); halo.classList.add('vivo', 'dibuja') }
    return animar(T, (k) => { const parte = tramo(pts, k); ultimo = parte[parte.length - 1]; p.setAttribute('d', contorno(parte, grueso, semilla)) },
      { facilidad: facil.entraSale, fin: () => { if (conHalo) { H.sigue = null; H.mundo = { x: ultimo[0], y: ultimo[1] }; H.visto = ahora(); halo.classList.remove('dibuja') } } })
  }
  function elipseA(c, rx, ry, semilla) {
    const r = azar(semilla), pts = [], a0 = -Math.PI * (0.62 + r() * 0.2), giro = Math.PI * 2 + 0.38 + r() * 0.2, fase = r() * 6
    for (let i = 0; i <= 72; i++) {
      const s = i / 72, a = a0 + giro * s, enc = 1 - 0.06 * s, w = 1 + 0.035 * Math.sin(3 * a + fase)
      pts.push([c.x + Math.cos(a) * rx * enc * w, c.y + Math.sin(a) * ry * enc * w])
    }
    return pts
  }
  function subrayadoA(caja, semilla) {
    const r = azar(semilla), pts = [], y = caja.y + caja.h + 6, x1 = caja.x - 4, x2 = caja.x + caja.w + 6
    for (let i = 0; i <= 28; i++) { const s = i / 28; pts.push([lerp(x1, x2, s), y + Math.sin(s * Math.PI) * -3 + (r() - 0.5) * 1.6]) }
    return pts
  }
  function flechaA(a, b, semilla) {
    const r = azar(semilla), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d
    const recorte = Math.min(18, d * 0.18)
    const p0 = { x: a.x + ux * recorte, y: a.y + uy * recorte }, p1 = { x: b.x - ux * recorte, y: b.y - uy * recorte }
    const dobla = (r() < 0.5 ? -1 : 1) * d * 0.16
    const c = { x: (p0.x + p1.x) / 2 - uy * dobla, y: (p0.y + p1.y) / 2 + ux * dobla }
    const cuerpo = []
    for (let i = 0; i <= 40; i++) { const t = i / 40; cuerpo.push([(1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x, (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y]) }
    const ang = Math.atan2(p1.y - c.y, p1.x - c.x), L = Math.min(18, d * 0.25)
    const ala = (s) => [[p1.x, p1.y], [p1.x - Math.cos(ang + s * 0.5) * L, p1.y - Math.sin(ang + s * 0.5) * L]]
    return { cuerpo, alas: [ala(1), ala(-1)], medio: { x: (p0.x + 2 * c.x + p1.x) / 4, y: (p0.y + 2 * c.y + p1.y) / 4 } }
  }

  // ───────────────────────── referencias («curva.punto») ─────────────────────────
  function caja(el) { return { x: el.x, y: el.y, w: el.w, h: el.h } }
  /** Resuelve «id» o «id.ancla» a un punto del mundo y la caja que lo envuelve. */
  function resolver(ref) {
    if (!ref) return null
    const s = String(ref); const i = s.indexOf('.')
    const id = i < 0 ? s : s.slice(0, i), ancla = i < 0 ? null : s.slice(i + 1)
    const el = E.elementos.get(id)
    if (!el) { avisar('referencia', `No existe el elemento «${id}» en el pizarrón.`); return null }
    el.nodo.classList.remove('fondo')
    const b = caja(el)
    const generico = { centro: [0.5, 0.5], arriba: [0.5, 0], abajo: [0.5, 1], izquierda: [0, 0.5], derecha: [1, 0.5], inicio: [0, 0.5], fin: [1, 0.5] }
    if (!ancla) return { el, punto: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, caja: b, esElemento: true }
    if (el.inst && el.inst.anclas.has(ancla)) {
      try {
        const q = el.inst.anclas.get(ancla)()
        const p = { x: el.x + q.x, y: el.y + q.y }
        const r = q.r ?? 22
        return { el, punto: p, caja: { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }, esElemento: false }
      } catch (e) { avisar(`ancla ${ref}`, e) }
    }
    if (el.tipo === 'texto' && ancla && el.palabras) {
      const span = el.palabras.get(ancla.toLowerCase())
      if (span) { const r = cajaLocal(span, el); return { el, punto: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, caja: r, esElemento: false } }
    }
    const g = generico[ancla]
    if (g) return { el, punto: { x: b.x + b.w * g[0], y: b.y + b.h * g[1] }, caja: b, esElemento: true }
    avisar('referencia', `«${id}» no tiene el ancla «${ancla}».`)
    return { el, punto: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, caja: b, esElemento: true }
  }
  /** Caja de un nodo dentro de un elemento, en coordenadas del mundo (sin la cámara). */
  function cajaLocal(nodo, el) {
    let x = 0, y = 0, n = nodo
    while (n && n !== el.nodo) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent }
    return { x: el.x + x, y: el.y + y, w: nodo.offsetWidth, h: nodo.offsetHeight }
  }

  // ───────────────────────── texto que se escribe ─────────────────────────
  /** Notación mínima: x^2, x^{n-1}, a_1, *énfasis en oro*. Devuelve HTML con cada carácter en su span. */
  function marcarTexto(texto) {
    let html = '', i = 0, enOro = false
    const ch = (c) => `<span class="c">${esc(c)}</span>`
    const grupo = (j) => { if (texto[j] === '{') { const k = texto.indexOf('}', j); if (k > j) return [texto.slice(j + 1, k), k + 1] } return [texto[j] ?? '', j + 1] }
    while (i < texto.length) {
      const c = texto[i]
      if (c === '^' || c === '_') { const [g, j] = grupo(i + 1); html += `<${c === '^' ? 'sup' : 'sub'}>${[...g].map(ch).join('')}</${c === '^' ? 'sup' : 'sub'}>`; i = j; continue }
      if (c === '*') { html += enOro ? '</em>' : '<em class="oro">'; enOro = !enOro; i++; continue }
      if (c === ' ' || c === '\n') { html += c === '\n' ? '<br>' : '<span class="c v"> </span>'; i++; continue }
      html += ch(c); i++
    }
    if (enOro) html += '</em>'
    return html
  }
  /** Envuelve palabras para poder anclar en ellas («titulo.velocidad»). */
  function indexarPalabras(el) {
    el.palabras = new Map()
    const cs = [...el.nodo.querySelectorAll('.c')]
    let palabra = '', primeros = []
    const cerrar = () => {
      if (palabra && primeros.length) {
        const span = document.createElement('span'); span.style.display = 'inline'
        primeros[0].before(span); for (const s of primeros) span.appendChild(s)
        const clave = palabra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '')
        if (clave && !el.palabras.has(clave)) el.palabras.set(clave, span)
        const conAcento = palabra.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
        if (conAcento && !el.palabras.has(conAcento)) el.palabras.set(conAcento, span)
      }
      palabra = ''; primeros = []
    }
    for (const s of cs) {
      const t = s.textContent
      if (t === ' ' || s.parentElement?.tagName === 'SUP' || s.parentElement?.tagName === 'SUB') { if (t === ' ') cerrar(); continue }
      if (s.parentElement !== el.nodo && s.parentElement?.tagName !== 'EM') { cerrar(); continue }
      palabra += t; primeros.push(s)
    }
    cerrar()
  }
  function escribirSpans(nodo, dur, { fresca = true } = {}) {
    const cs = [...nodo.querySelectorAll('.c:not(.v)')]
    if (!cs.length) return Promise.resolve()
    const paso = dur / cs.length
    return animar(dur, (k) => {
      const n = Math.floor(k * cs.length + 0.0001)
      for (let i = 0; i < n && i < cs.length; i++) if (!cs[i].classList.contains('v')) {
        cs[i].classList.add('v'); if (fresca) { cs[i].classList.add('fresca'); const s = cs[i]; setTimeout(() => s.classList.remove('fresca'), 650) }
      }
    }, { facilidad: facil.lineal, fin: () => { for (const s of cs) s.classList.add('v') } }).then(() => void paso)
  }

  // ───────────────────────── objetos vivos ─────────────────────────
  async function cargarObjeto(id) {
    const b = E.biblioteca.get(id)
    if (!b) throw new Error(`El objeto «${id}» no está en la biblioteca del pizarrón.`)
    if (!b.montar) {
      b.montar = (async () => {
        const fuente = /\bexport\s+default\b/.test(b.codigo) ? b.codigo : `export default ${b.codigo}`
        const url = URL.createObjectURL(new Blob([fuente + `\n//# sourceURL=pizarron/${id}.js`], { type: 'text/javascript' }))
        try { const m = await import(url); if (typeof m.default !== 'function') throw new Error(`«${id}» debe exportar por defecto una función montar(pz).`); return m.default }
        finally { URL.revokeObjectURL(url) }
      })()
    }
    return b.montar
  }

  /** Crea la instancia viva de un objeto: su lienzo, sus parámetros, sus asas y el API `pz` que recibe su código. */
  function instanciar(el, def) {
    const raiz = document.createElement('div'); raiz.className = 'raiz'
    const lienzo = document.createElement('canvas'), asas = document.createElement('canvas')
    asas.style.pointerEvents = 'none'
    el.nodo.append(lienzo, raiz, asas)
    const ctx = lienzo.getContext('2d'), actx = asas.getContext('2d')
    const inst = {
      params: new Map(), anclas: new Map(), metodos: new Map(), dibujos: [], cadas: [], escuchas: new Map(), asas: [],
      mundo: null, sucio: true, roto: false, tocado: false, t0: ahora(), escala: 1, emitidos: new Map(),
    }
    const color = new Proxy({}, { get: (_, k) => ({ tinta: css('--tinta'), morado: css('--morado'), oro: css('--oro'), oroTinta: css('--oro-tinta'), grafito: css('--grafito'), papel: css('--papel'), texto: css('--texto'), suave: css('--suave'), tenue: css('--tenue'), hilo: css('--hilo') })[k] })
    const fuente = { serif: getComputedStyle(document.documentElement).getPropertyValue('--serif') || 'Georgia, serif', sans: getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'system-ui, sans-serif' }
    inst.redimensionar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), k = clamp(C.z * dpr, 0.5, 3.2)
      inst.escala = k
      for (const [c, x] of [[lienzo, ctx], [asas, actx]]) {
        c.width = Math.max(1, Math.round(el.w * k)); c.height = Math.max(1, Math.round(el.h * k))
        c.style.width = el.w + 'px'; c.style.height = el.h + 'px'
        x.setTransform(k, 0, 0, k, 0, 0)
      }
      inst.sucio = true
    }
    const emitirCambio = (nombre, valor, origen) => {
      for (const f of inst.escuchas.get(nombre) || []) try { f(valor) } catch (e) { avisar(`${el.id}.alCambiar(${nombre})`, e) }
      for (const h of E.hilos) if (h.de.el === el.id && h.de.param === nombre) propagar(h, valor)
      if (origen === 'alumno') enviar('gesto', { gesto: { tipo: 'param', el: el.id, param: nombre, valor } })
      inst.sucio = true
    }
    const pz = {
      ancho: el.w, alto: el.h, raiz, color, fuente, facil, azar, clamp, lerp,
      get t() { return ahora() - inst.t0 },
      lienzo: () => ctx,
      dibujar(fn) { inst.dibujos.push(fn); inst.sucio = true },
      cada(fn) { inst.cadas.push(fn) },
      redibujar() { inst.sucio = true },
      param(nombre, inicial, op = {}) {
        if (!inst.params.has(nombre)) inst.params.set(nombre, { valor: def.params && nombre in def.params ? def.params[nombre] : inicial, op })
        const p = inst.params.get(nombre)
        return {
          get valor() { return p.valor },
          set valor(v) { pz.poner(nombre, v) },
          poner: (v, dur) => pz.poner(nombre, v, dur),
        }
      },
      valor: (nombre) => inst.params.get(nombre)?.valor,
      poner(nombre, v, dur = 0, origen = 'levy') {
        const p = inst.params.get(nombre)
        if (!p) { avisar(`${el.id}.poner`, `«${el.id}» no tiene el parámetro «${nombre}».`); return Promise.resolve() }
        const { min, max } = p.op
        const meta = typeof v === 'number' ? clamp(v, min ?? -Infinity, max ?? Infinity) : v
        if (typeof meta === 'number' && typeof p.valor === 'number' && dur > 0) {
          const de = p.valor
          return animar(dur, (k) => { p.valor = lerp(de, meta, k); emitirCambio(nombre, p.valor, null) }, { facilidad: facil.entraSale })
        }
        p.valor = meta; emitirCambio(nombre, meta, origen); return Promise.resolve()
      },
      alCambiar(nombre, fn) { if (!inst.escuchas.has(nombre)) inst.escuchas.set(nombre, []); inst.escuchas.get(nombre).push(fn) },
      ancla(nombre, fn) { inst.anclas.set(nombre, fn) },
      metodo(nombre, fn) { inst.metodos.set(nombre, fn) },
      // Un objeto que emite en cada cuadro inundaba el registro (7 oct): el mismo evento con los mismos datos no se repite, y
      // de un mismo evento sale a lo más uno cada 250 ms (el último gana).
      emitir(evento, datos) {
        const firma = JSON.stringify(datos ?? null), ult = inst.emitidos.get(evento), t = ahora()
        if (ult && ult.firma === firma) return
        if (ult && t - ult.t < 0.25) { clearTimeout(ult.pend); ult.pend = setTimeout(() => pz.emitir(evento, datos), 260); return }
        inst.emitidos.set(evento, { firma, t })
        enviar('gesto', { gesto: { tipo: 'evento', el: el.id, evento, datos: datos ?? null } })
      },
      mundo(sistema) { inst.mundo = sistema },
      /** Un asa que el alumno arrastra, atada a un parámetro: su lugar sale del valor y el valor del lugar. */
      asa(nombre, { lugar, valorDe, radio = 18, etiqueta } = {}) {
        if (!inst.params.has(nombre)) throw new Error(`asa(«${nombre}»): declara antes pz.param(«${nombre}», …).`)
        inst.asas.push({ nombre, lugar, valorDe, radio, etiqueta })
        if (!inst.anclas.has(nombre)) inst.anclas.set(nombre, () => { const q = lugar(inst.params.get(nombre).valor); return { x: q.x, y: q.y, r: radio + 6 } })
      },
      ejes: (op) => sistemaEjes(op, pz),
      texto(c, s, x, y, op = {}) {
        const tam = op.tam ?? 16
        c.save(); c.fillStyle = op.color ?? color.texto
        c.font = `${op.italica ? 'italic ' : ''}${op.peso ?? (op.serif ? 500 : 560)} ${tam}px ${op.serif ? fuente.serif : fuente.sans}`
        c.textAlign = op.alinear ?? 'left'; c.textBaseline = op.base ?? 'alphabetic'
        c.fillText(s, x, y); c.restore()
      },
      /** Un trazo con pulso de pluma sobre el lienzo (para que lo del objeto se vea de la misma mano). */
      trazo(c, puntos, op = {}) {
        c.save(); c.fillStyle = op.color ?? color.tinta
        c.fill(new Path2D(contorno(puntos, op.ancho ?? 3, op.semilla ?? 5))); c.restore()
      },
      animar: (dur, cada, op) => animar(dur, cada, op),
    }
    // Pointer: asas primero; si no, el gesto llega al código del objeto (o mueve la cámara).
    let arrastre = null
    const local = (ev) => { const r = el.nodo.getBoundingClientRect(); return { x: (ev.clientX - r.left) / C.z, y: (ev.clientY - r.top) / C.z } }
    const asaEn = (q) => {
      let mejor = null, dmin = Infinity
      for (const a of inst.asas) { const p = a.lugar(inst.params.get(a.nombre).valor); const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < a.radio + 10 / C.z && d < dmin) { dmin = d; mejor = a } }
      return mejor
    }
    el.nodo.addEventListener('pointerdown', (ev) => {
      el.nodo.classList.remove('fondo') // tocarlo lo trae al frente
      if (E.lapizActivo || E.congelado) return
      const q = local(ev), a = asaEn(q)
      if (!a) return
      ev.stopPropagation(); el.nodo.setPointerCapture(ev.pointerId); arrastre = a; inst.tocado = true; inst.activa = a.nombre; el.nodo.style.cursor = 'grabbing'
    })
    el.nodo.addEventListener('pointermove', (ev) => {
      const q = local(ev)
      if (arrastre) { try { pz.poner(arrastre.nombre, arrastre.valorDe(q.x, q.y), 0, 'alumno') } catch (e) { avisar(`${el.id}.asa`, e) } return }
      if (!E.lapizActivo && !E.congelado) el.nodo.style.cursor = asaEn(q) ? 'grab' : ''
    })
    const soltar = () => { if (arrastre) { pz.emitir('solto', { param: arrastre.nombre, valor: inst.params.get(arrastre.nombre).valor }) } arrastre = null; inst.activa = null; el.nodo.style.cursor = '' }
    el.nodo.addEventListener('pointerup', soltar); el.nodo.addEventListener('pointercancel', soltar)

    inst.dibujarAsas = () => {
      actx.clearRect(0, 0, el.w, el.h)
      const t = ahora()
      for (const a of inst.asas) {
        let p; try { p = a.lugar(inst.params.get(a.nombre).valor) } catch { continue }
        const activa = inst.activa === a.nombre
        if (!inst.tocado && !E.congelado) { // invitación a tocar: un anillo que respira hasta el primer toque
          const k = (t * 0.9) % 1
          actx.beginPath(); actx.arc(p.x, p.y, 12 + k * 20, 0, Math.PI * 2)
          actx.strokeStyle = color.oro; actx.globalAlpha = 0.55 * (1 - k); actx.lineWidth = 2; actx.stroke(); actx.globalAlpha = 1
        }
        actx.beginPath(); actx.arc(p.x, p.y, activa ? 11 : 9, 0, Math.PI * 2)
        actx.fillStyle = color.papel; actx.fill(); actx.lineWidth = 2.6; actx.strokeStyle = color.oroTinta; actx.stroke()
        actx.beginPath(); actx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); actx.fillStyle = color.oroTinta; actx.fill()
        if (a.etiqueta) pz.texto(actx, typeof a.etiqueta === 'function' ? a.etiqueta(inst.params.get(a.nombre).valor) : a.etiqueta, p.x + 14, p.y - 12, { tam: 14, color: color.oroTinta, serif: true, italica: true })
      }
    }
    inst.cuadro = (dt) => {
      if (inst.roto) return
      try {
        if (!E.pausa && !E.congelado) for (const f of inst.cadas) { f(dt, ahora() - inst.t0); inst.sucio = true }
        if (inst.sucio) { ctx.save(); ctx.setTransform(inst.escala, 0, 0, inst.escala, 0, 0); ctx.clearRect(0, 0, el.w, el.h); for (const f of inst.dibujos) { ctx.save(); f(ctx, ahora() - inst.t0); ctx.restore() } ctx.restore(); inst.sucio = false }
        if (inst.asas.length) inst.dibujarAsas()
      } catch (e) { romper(e) }
    }
    const romper = (e) => {
      inst.roto = true
      const f = document.createElement('div'); f.className = 'fallo'; f.textContent = `Este objeto se rompió: ${e && e.message ? e.message : e}. Levy ya lo sabe.`
      el.nodo.appendChild(f); avisar(`objeto ${el.id} (${def.objeto})`, e)
    }
    inst.romper = romper
    inst.pz = pz
    inst.redimensionar()
    return inst
  }

  /** Un sistema de coordenadas matemático dentro del objeto: el alumno y Levy hablan en sus unidades, no en pixeles. */
  function sistemaEjes(op = {}, pz) {
    const m = op.margen ?? 34
    const caja = { x: m + (op.margenIzq ?? 8), y: m * 0.6, w: pz.ancho - m * 2 - (op.margenIzq ?? 8), h: pz.alto - m * 1.6 }
    const [u0, u1] = op.x ?? [-1, 1], [v0, v1] = op.y ?? [-1, 1]
    const s = {
      caja, u0, u1, v0, v1,
      x: (u) => caja.x + ((u - u0) / (u1 - u0)) * caja.w,
      y: (v) => caja.y + caja.h - ((v - v0) / (v1 - v0)) * caja.h,
      u: (x) => u0 + ((x - caja.x) / caja.w) * (u1 - u0),
      v: (y) => v0 + ((caja.y + caja.h - y) / caja.h) * (v1 - v0),
      dibujar(c, o = {}) {
        const col = pz.color
        c.save(); c.lineWidth = 1
        if (o.rejilla !== false) {
          c.strokeStyle = col.tenue; c.globalAlpha = 0.38
          const pu = paso(u1 - u0), pv = paso(v1 - v0)
          for (let u = Math.ceil(u0 / pu) * pu; u <= u1 + 1e-9; u += pu) { c.beginPath(); c.moveTo(s.x(u), caja.y); c.lineTo(s.x(u), caja.y + caja.h); c.stroke() }
          for (let v = Math.ceil(v0 / pv) * pv; v <= v1 + 1e-9; v += pv) { c.beginPath(); c.moveTo(caja.x, s.y(v)); c.lineTo(caja.x + caja.w, s.y(v)); c.stroke() }
          c.globalAlpha = 1
        }
        c.strokeStyle = col.suave; c.lineWidth = 1.4
        const y0 = clamp(s.y(0), caja.y, caja.y + caja.h), x0 = clamp(s.x(0), caja.x, caja.x + caja.w)
        c.beginPath(); c.moveTo(caja.x, y0); c.lineTo(caja.x + caja.w, y0); c.stroke()
        c.beginPath(); c.moveTo(x0, caja.y); c.lineTo(x0, caja.y + caja.h); c.stroke()
        if (o.numeros !== false) {
          const pu = paso(u1 - u0), pv = paso(v1 - v0)
          for (let u = Math.ceil(u0 / pu) * pu; u <= u1 + 1e-9; u += pu) if (Math.abs(u) > 1e-9) pz.texto(c, fmt(u), s.x(u), y0 + 16, { tam: 12, color: col.suave, alinear: 'center' })
          for (let v = Math.ceil(v0 / pv) * pv; v <= v1 + 1e-9; v += pv) if (Math.abs(v) > 1e-9) pz.texto(c, fmt(v), x0 - 7, s.y(v) + 4, { tam: 12, color: col.suave, alinear: 'right' })
        }
        if (o.x) pz.texto(c, o.x, caja.x + caja.w, y0 - 8, { tam: 16, color: col.suave, alinear: 'right', serif: true, italica: true })
        if (o.y) pz.texto(c, o.y, x0 + 8, caja.y + 14, { tam: 16, color: col.suave, serif: true, italica: true })
        c.restore()
      },
      curva(c, f, o = {}) {
        const desde = o.desde ?? u0, hasta = o.hasta ?? u1, n = o.muestras ?? 240, pts = []
        for (let i = 0; i <= n; i++) {
          const u = lerp(desde, hasta, i / n); let v
          try { v = f(u) } catch { v = NaN }
          if (!isFinite(v)) { if (pts.length > 1) pz.trazo(c, pts, { color: o.color, ancho: o.ancho ?? 3.2, semilla: o.semilla }); pts.length = 0; continue }
          pts.push([s.x(u), clamp(s.y(v), caja.y - 400, caja.y + caja.h + 400)])
        }
        c.save(); c.beginPath(); c.rect(caja.x - 2, caja.y - 2, caja.w + 4, caja.h + 4); c.clip()
        if (pts.length > 1) pz.trazo(c, pts, { color: o.color, ancho: o.ancho ?? 3.2, semilla: o.semilla })
        c.restore()
      },
      recta(c, a, b, o = {}) {
        c.save(); c.beginPath(); c.rect(caja.x, caja.y, caja.w, caja.h); c.clip()
        c.strokeStyle = o.color ?? pz.color.tinta; c.lineWidth = o.ancho ?? 2; c.lineCap = 'round'
        if (o.punteada) c.setLineDash([6, 7])
        c.beginPath(); c.moveTo(s.x(a[0]), s.y(a[1])); c.lineTo(s.x(b[0]), s.y(b[1])); c.stroke(); c.restore()
      },
      punto(c, u, v, o = {}) {
        c.save(); c.beginPath(); c.arc(s.x(u), s.y(v), o.radio ?? 5, 0, Math.PI * 2)
        c.fillStyle = o.color ?? pz.color.tinta; c.fill(); c.restore()
      },
    }
    pz.mundo(s)
    return s
  }
  function paso(rango) { const bruto = rango / 8, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p }
  function fmt(v) { return Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : String(+v.toFixed(2)) }

  function propagar(h, valor) {
    const destino = E.elementos.get(h.a.el)
    if (!destino || !destino.inst) return
    let v = valor
    try { if (h.f) v = h.f(valor) } catch (e) { avisar(`hilo ${h.id}`, e); return }
    const p = destino.inst.params.get(h.a.param); if (!p) return
    p.valor = v
    for (const f of destino.inst.escuchas.get(h.a.param) || []) try { f(v) } catch (e) { avisar(`${destino.id}.alCambiar`, e) }
    destino.inst.sucio = true
  }

  // ───────────────────────── elementos y territorio ─────────────────────────
  const HUECO = 120, HUECO_V = 30, FILA = 2700
  function grupoActual() { return E.grupos[E.grupos.length - 1] }
  function ubicar(el, def, grupo) {
    if (def.lugar && typeof def.lugar === 'object') { el.x = +def.lugar.x || 0; el.y = +def.lugar.y || 0; return }
    if (def.junto && E.elementos.has(def.junto)) {
      const o = E.elementos.get(def.junto), lado = def.lado || 'derecha', g = 56
      if (lado === 'derecha') { el.x = o.x + o.w + g; el.y = o.y + (o.h - el.h) / 2 }
      else if (lado === 'izquierda') { el.x = o.x - g - el.w; el.y = o.y + (o.h - el.h) / 2 }
      else if (lado === 'arriba') { el.x = o.x + (o.w - el.w) / 2; el.y = o.y - g - el.h }
      else { el.x = o.x + (o.w - el.w) / 2; el.y = o.y + o.h + g }
      return
    }
    if (grupo.elementos.length) { // apilados en columna dentro del paso
      const prev = grupo.elementos[grupo.elementos.length - 1]
      el.x = grupo.x; el.y = prev.y + prev.h + HUECO_V; return
    }
    const ant = E.grupos.filter((g) => g !== grupo && g.elementos.length).pop()
    if (!ant) { el.x = 0; el.y = 0 }
    else if (def.lugar === 'abajo') { el.x = ant.x; el.y = ant.y2 + HUECO }
    else if (def.lugar === 'arriba') { el.x = ant.x; el.y = ant.y - HUECO - el.h }
    else if (def.lugar === 'izquierda') { el.x = ant.x - HUECO - el.w; el.y = ant.y }
    else if (ant.x2 + HUECO + el.w > FILA) { const abajo = Math.max(...E.grupos.map((g) => g.y2 ?? 0)); el.x = 0; el.y = abajo + HUECO * 1.4 }
    else { el.x = ant.x2 + HUECO; el.y = ant.y }
    grupo.x = el.x; grupo.y = el.y
  }
  /** Nada se encima: si el lugar está ocupado, el elemento se corre (hacia su lado, o hacia abajo) hasta quedar libre. */
  function libre(el, def) {
    const choca = () => { for (const o of E.elementos.values()) { if (o === el || o.oculto && false) continue; if (el.x < o.x + o.w + 40 && el.x + el.w + 40 > o.x && el.y < o.y + o.h + 32 && el.y + el.h + 32 > o.y) return o } return null }
    const lado = def.junto ? (def.lado || 'derecha') : def.lugar && typeof def.lugar === 'string' ? def.lugar : 'abajo'
    for (let i = 0; i < 60; i++) {
      const o = choca(); if (!o) return
      if (lado === 'derecha') el.x = o.x + o.w + 48
      else if (lado === 'izquierda') el.x = o.x - el.w - 48
      else if (lado === 'arriba') el.y = o.y - el.h - 40
      else el.y = o.y + o.h + 40
    }
  }
  function crecerGrupo(grupo, el) {
    if (!grupo.elementos.length) { grupo.x = el.x; grupo.y = el.y; grupo.x2 = el.x + el.w; grupo.y2 = el.y + el.h }
    else { grupo.x = Math.min(grupo.x, el.x); grupo.y = Math.min(grupo.y, el.y); grupo.x2 = Math.max(grupo.x2, el.x + el.w); grupo.y2 = Math.max(grupo.y2, el.y + el.h) }
    grupo.elementos.push(el)
  }

  async function crearElemento(def, grupo, instantaneo) {
    if (!def || !def.id) return
    if (E.elementos.has(def.id)) quitarElemento(def.id, true)
    const nodo = document.createElement('div')
    nodo.className = `el el-${def.tipo}` + (instantaneo ? '' : ' naciendo')
    nodo.dataset.id = def.id
    const el = { id: def.id, tipo: def.tipo, nodo, x: 0, y: 0, w: 10, h: 10, def, oculto: !!def.oculto, inst: null }
    if (def.oculto) nodo.classList.add('oculto')
    capaEl.appendChild(nodo)
    if (def.tipo === 'texto') {
      nodo.classList.add(def.estilo || 'grande')
      nodo.innerHTML = marcarTexto(def.texto || '')
      if (def.ancho) nodo.style.maxWidth = def.ancho + 'px'
      // Al partirse en líneas la caja queda del ancho máximo: se ciñe al texto real (el subrayado y el encuadre lo agradecen).
      const rango = document.createRange(); rango.selectNodeContents(nodo)
      const izq = nodo.getBoundingClientRect().left, der = Math.max(...[...rango.getClientRects()].map((r) => r.right))
      if (isFinite(der) && der > izq) nodo.style.width = Math.ceil((der - izq) / C.z) + 2 + 'px'
      el.w = nodo.offsetWidth; el.h = nodo.offsetHeight
      indexarPalabras(el)
    } else if (def.tipo === 'imagen') {
      const im = E.imagenes.get(def.imagen) || {}
      const w = def.ancho || 520, h = im.ancho && im.alto ? (w * im.alto) / im.ancho : w * 0.5625
      const img = document.createElement('img'); img.alt = def.pie || ''; img.draggable = false
      if (im.url) img.src = im.url
      img.onerror = () => avisar(`imagen ${def.id}`, `No cargó la imagen «${def.imagen}».`)
      nodo.style.width = w + 'px'; nodo.appendChild(img)
      if (def.pie) { const p = document.createElement('div'); p.className = 'pie'; p.textContent = def.pie; nodo.appendChild(p) }
      el.w = w; el.h = h + (def.pie ? 32 : 0)
    } else if (def.tipo === 'objeto') {
      el.w = def.ancho || 560; el.h = def.alto || 360
      nodo.style.width = el.w + 'px'; nodo.style.height = el.h + 'px'
      if (def.titulo) { const t = document.createElement('div'); t.className = 'titulo-objeto'; t.textContent = def.titulo; nodo.appendChild(t) }
    } else if (def.tipo === 'hilo') {
      nodo.remove()
      const [ae, ap] = String(def.de || '').split('.'), [be, bp] = String(def.a || '').split('.')
      let f = null
      if (def.f) { try { f = new Function('x', `"use strict"; return (${def.f})`) } catch (e) { avisar(`hilo ${def.id}`, e) } }
      const h = { id: def.id, de: { el: ae, param: ap }, a: { el: be, param: bp }, f, nodo: document.createElementNS(NS, 'path'), puntas: [document.createElementNS(NS, 'circle'), document.createElementNS(NS, 'circle')], visible: !def.oculto }
      for (const p of h.puntas) { p.setAttribute('r', '4'); capaHilos.appendChild(p) }
      capaHilos.appendChild(h.nodo); E.hilos.push(h)
      const origen = E.elementos.get(ae); if (origen && origen.inst && origen.inst.params.has(ap)) propagar(h, origen.inst.params.get(ap).valor)
      return
    }
    ubicar(el, def, grupo)
    if (!(def.lugar && typeof def.lugar === 'object')) libre(el, def)
    nodo.style.left = el.x + 'px'; nodo.style.top = el.y + 'px'
    crecerGrupo(grupo, el)
    E.elementos.set(el.id, el)
    if (def.tipo === 'objeto') {
      try {
        const montar = await cargarObjeto(def.objeto)
        const inst = instanciar(el, def)
        el.inst = inst
        const r = montar(inst.pz)
        if (r && typeof r === 'object') for (const [k, f] of Object.entries(r)) if (typeof f === 'function') inst.metodos.set(k, f)
        enviar('declarado', { el: el.id, objeto: def.objeto, params: [...inst.params.keys()], anclas: [...inst.anclas.keys()], metodos: [...inst.metodos.keys()] })
        for (const h of E.hilos) if (h.de.el === el.id && inst.params.has(h.de.param)) propagar(h, inst.params.get(h.de.param).valor)
      } catch (e) {
        const f = document.createElement('div'); f.className = 'fallo'; f.textContent = `No pude montar «${def.objeto}»: ${e && e.message ? e.message : e}`
        nodo.appendChild(f); avisar(`montar ${el.id} (${def.objeto})`, e)
      }
    }
    if (!instantaneo) {
      requestAnimationFrame(() => nodo.classList.remove('naciendo'))
      if (def.tipo === 'texto' && !def.oculto) escribirSpans(nodo, clamp((def.texto || '').length * 0.032, 0.5, 1.8))
    }
    if (def.tipo === 'texto' && (instantaneo || def.oculto)) { if (instantaneo && !def.oculto) for (const s of nodo.querySelectorAll('.c')) s.classList.add('v') }
  }
  function quitarElemento(id, ya) {
    const el = E.elementos.get(id)
    if (el) { E.elementos.delete(id); if (ya) el.nodo.remove(); else { el.nodo.style.opacity = '0'; setTimeout(() => el.nodo.remove(), 700) } return }
    const i = E.hilos.findIndex((h) => h.id === id)
    if (i >= 0) { const h = E.hilos[i]; h.nodo.remove(); h.puntas.forEach((p) => p.remove()); E.hilos.splice(i, 1) }
  }
  function dibujarHilos() {
    for (const h of E.hilos) {
      const a = E.elementos.get(h.de.el), b = E.elementos.get(h.a.el)
      if (!a || !b || !h.visible) { h.nodo.setAttribute('d', ''); h.puntas.forEach((p) => p.setAttribute('r', '0')); continue }
      const pa = puntoParam(a, h.de.param), pb = puntoParam(b, h.a.param)
      const caida = Math.min(160, Math.hypot(pb.x - pa.x, pb.y - pa.y) * 0.22)
      const cx = (pa.x + pb.x) / 2, cy = Math.max(pa.y, pb.y) + caida
      h.nodo.setAttribute('d', `M${pa.x},${pa.y} Q${cx},${cy} ${pb.x},${pb.y}`)
      h.puntas[0].setAttribute('cx', pa.x); h.puntas[0].setAttribute('cy', pa.y); h.puntas[0].setAttribute('r', '4')
      h.puntas[1].setAttribute('cx', pb.x); h.puntas[1].setAttribute('cy', pb.y); h.puntas[1].setAttribute('r', '4')
    }
  }
  function puntoParam(el, param) {
    if (el.inst && el.inst.anclas.has(param)) { try { const q = el.inst.anclas.get(param)(); return { x: el.x + q.x, y: el.y + q.y } } catch { /* cae al borde */ } }
    return { x: el.x + el.w / 2, y: el.y + el.h }
  }

  // ───────────────────────── marcas (la mano rápida) ─────────────────────────
  let semillaMarca = 11
  async function marca(m, { instantaneo = false } = {}) {
    const v = m.verbo, a = m.args || [], o = m.opts || {}
    const col = o.color === 'oro' ? ' oro' : ''
    try {
      switch (v) {
        case 'mira': {
          const r = resolver(a[0]); if (!r) return
          const z = o.zoom ? +o.zoom : null
          if (r.esElemento) encuadrar(r.caja, { zMax: z ?? 1.35, inmediato: instantaneo })
          else { const k = z ?? clamp(C.z * 1.6, 0.6, 2.6); const { w, h } = tamVista(); encuadrar({ x: r.punto.x - w / 2 / k, y: r.punto.y - h / 2 / k, w: w / k, h: (h - 70) / k }, { zMax: k, margen: 0, inmediato: instantaneo }) }
          return
        }
        case 'todo': for (const el of E.elementos.values()) el.nodo.classList.remove('fondo'); encuadrar(cajaTodo(), { inmediato: instantaneo, zMax: 1.1, rapidez: 2.6 }); return
        case 'acerca': { const k = +(a[0] || 1.6); C.tz = clamp(C.tz * k, 0.18, 4); return }
        case 'senala': case 'señala': case 'apunta': { const r = resolver(a[0]); if (!r) return; if (instantaneo) { H.mundo = r.punto; return } await haloA(r.punto); haloPulso(); return }
        case 'encierra': {
          const r = resolver(a[0]); if (!r) return
          const b = r.caja, pad = r.esElemento ? 14 : 4
          const pts = elipseA({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, b.w / 2 + pad + 6, b.h / 2 + pad, semillaMarca++)
          await entintar(pts, { clase: 'trazo' + col, ref: r.el.id, instantaneo, semilla: semillaMarca }); return
        }
        case 'subraya': {
          const r = resolver(a[0]); if (!r) return
          await entintar(subrayadoA(r.caja, semillaMarca++), { clase: 'trazo' + col, ref: r.el.id, instantaneo }); return
        }
        case 'flecha': {
          const r1 = resolver(a[0]), r2 = resolver(a[1]); if (!r1 || !r2) return
          const f = flechaA(r1.punto, r2.punto, semillaMarca++)
          await entintar(f.cuerpo, { clase: 'trazo' + col, ref: r2.el.id, instantaneo })
          for (const ala of f.alas) await entintar(ala, { clase: 'trazo' + col, ref: r2.el.id, instantaneo, dur: 0.12 })
          if (m.texto) await nota(m.texto, { x: f.medio.x, y: f.medio.y - 14 }, { lado: 'centro', clase: col, instantaneo })
          return
        }
        case 'escribe': {
          const r = o.en ? resolver(o.en) : null
          const lado = o.lado || 'derecha'
          let p
          if (r) { const b = r.caja; p = lado === 'arriba' ? { x: b.x + b.w / 2, y: b.y - 16 } : lado === 'abajo' ? { x: b.x + b.w / 2, y: b.y + b.h + 30 } : lado === 'izquierda' ? { x: b.x - 14, y: b.y + b.h / 2 } : { x: b.x + b.w + 14, y: b.y + b.h / 2 } }
          else { const g = cajaTodo(); p = { x: g.x, y: g.y + g.h + 40 } }
          await nota(m.texto || a.join(' '), p, { lado, clase: col, instantaneo, dur: o.dur ? +o.dur : undefined }); return
        }
        case 'muestra': {
          for (const id of a) {
            const el = E.elementos.get(id)
            if (el) { el.oculto = false; el.nodo.classList.remove('oculto'); if (el.tipo === 'texto') { if (instantaneo) el.nodo.querySelectorAll('.c').forEach((s) => s.classList.add('v')); else escribirSpans(el.nodo, clamp((el.def.texto || '').length * 0.032, 0.4, 1.6)) } continue }
            const h = E.hilos.find((x) => x.id === id); if (h) h.visible = true
          }
          return
        }
        case 'oculta': for (const id of a) { const el = E.elementos.get(id); if (el) { el.oculto = true; el.nodo.classList.add('oculto') } const h = E.hilos.find((x) => x.id === id); if (h) h.visible = false } return
        case 'pon': {
          const dur = instantaneo ? 0 : o.dur != null ? +o.dur : 0.9
          const promesas = []
          for (const [k, val] of Object.entries(o)) {
            if (!k.includes('.')) continue
            const [id, param] = k.split('.'), el = E.elementos.get(id)
            if (!el || !el.inst) { avisar('pon', `«${id}» no es un objeto vivo.`); continue }
            const num = Number(val), valor = val === 'true' ? true : val === 'false' ? false : Number.isFinite(num) && String(val).trim() !== '' ? num : val
            promesas.push(el.inst.pz.poner(param, valor, dur))
          }
          await Promise.all(promesas); return
        }
        case 'llama': {
          const [id, metodo] = String(a[0] || '').split('.'), el = E.elementos.get(id)
          if (!el || !el.inst) { avisar('llama', `«${id}» no es un objeto vivo.`); return }
          const f = el.inst.metodos.get(metodo); if (!f) { avisar('llama', `«${id}» no tiene el método «${metodo}».`); return }
          const args = a.slice(1).map((x) => (Number.isFinite(Number(x)) ? Number(x) : x))
          try { await f(...args, { instantaneo }) } catch (e) { avisar(`${id}.${metodo}`, e) }
          return
        }
        case 'luz': ponerLuz(a[0] === 'noche' ? 'noche' : 'papel'); return
        case 'borra': {
          const id = a[0]
          for (const t of [...E.tintas]) if (!id || t.ref === id) { t.nodo.classList.add('borrando'); setTimeout(() => t.nodo.remove(), 650); E.tintas.splice(E.tintas.indexOf(t), 1) }
          for (const n of [...capaNotas.children]) if (!id || n.dataset.ref === id) { n.style.transition = 'opacity .6s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 650) }
          return
        }
        case 'pausa': case 'espera': return // los resuelve el reloj del padre
        default: avisar('marca', `No conozco la acotación «${v}».`)
      }
    } catch (e) { avisar(`[[${v} ${a.join(' ')}]]`, e) }
  }
  function nota(texto, p, { lado = 'derecha', clase = '', instantaneo, dur } = {}) {
    const n = document.createElement('div')
    n.className = 'nota-tinta' + clase
    n.innerHTML = marcarTexto(String(texto))
    capaNotas.appendChild(n)
    const w = n.offsetWidth, h = n.offsetHeight
    const x = lado === 'izquierda' ? p.x - w : lado === 'derecha' ? p.x : p.x - w / 2
    let y = lado === 'arriba' ? p.y - h : lado === 'abajo' ? p.y : p.y - h / 2
    // Una nota no pisa a otra nota viva ni a un texto del territorio: se corre hacia abajo hasta quedar libre.
    let yy = y
    const ocupados = () => [...capaNotas.children].filter((o) => o !== n && !o.classList.contains('dormida')).map((o) => ({ x: o.offsetLeft, y: o.offsetTop, w: o.offsetWidth, h: o.offsetHeight }))
      .concat([...E.elementos.values()].filter((e) => e.tipo === 'texto' && !e.oculto).map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h })))
    for (let k = 0; k < 12; k++) { const c = ocupados().find((o) => x < o.x + o.w && x + w > o.x && yy < o.y + o.h + 4 && yy + h + 4 > o.y); if (!c) break; yy = c.y + c.h + 8 }
    y = yy
    n.style.left = x + 'px'; n.style.top = y + 'px'
    // Si la nota cae fuera de cuadro, la cámara se abre lo justo para incluirla.
    if (!instantaneo) {
      const { w: vw, h: vh } = tamVista(), z = C.tz
      const v = { x: C.tx - vw / 2 / z, y: C.ty - (vh / 2) / z, w: vw / z, h: (vh - 70) / z }
      if (x < v.x || y < v.y || x + w > v.x + v.w || y + h > v.y + v.h) {
        const x1 = Math.min(v.x, x - 20), y1 = Math.min(v.y, y - 20), x2 = Math.max(v.x + v.w, x + w + 20), y2 = Math.max(v.y + v.h, y + h + 20)
        encuadrar({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, { margen: 10, zMax: z })
      }
    }
    if (instantaneo) { n.querySelectorAll('.c').forEach((s) => s.classList.add('v')); return Promise.resolve() }
    const cs = [...n.querySelectorAll('.c')]
    const T = dur ?? clamp(cs.length * 0.045, 0.35, 2.4)
    H.viaje = null; halo.classList.add('vivo', 'dibuja')
    let i = 0
    H.sigue = () => { const s = cs[Math.min(i, cs.length - 1)]; return s ? { x: x + s.offsetLeft + s.offsetWidth, y: y + s.offsetTop + s.offsetHeight * 0.8 } : { x, y } }
    return animar(T, (k) => { i = Math.floor(k * cs.length); for (let j = 0; j < i; j++) cs[j].classList.add('v') },
      { facilidad: facil.lineal, fin: () => { cs.forEach((s) => s.classList.add('v')); H.sigue = null; H.mundo = { x: x + w, y: y + h * 0.8 }; halo.classList.remove('dibuja'); H.visto = ahora() } })
  }
  function ponerLuz(l) { E.luz = l; document.body.dataset.luz = l; for (const el of E.elementos.values()) if (el.inst) el.inst.sucio = true }

  // ───────────────────────── lápiz del alumno ─────────────────────────
  let trazoVivo = null, nTrazo = 0
  function empezarTrazo(ev) {
    const p = aMundo(ev.clientX, ev.clientY)
    const path = document.createElementNS(NS, 'path'); capaLapiz.appendChild(path)
    const enEl = E.congelado?.en ? E.elementos.get(E.congelado.en) : null
    trazoVivo = { id: `l${Date.now().toString(36)}${(nTrazo++).toString(36)}`, puntos: [[p.x, p.y]], nodo: path, en: E.congelado?.en || null, pred: E.congelado?.pasoId || null, origen: enEl ? [enEl.x, enEl.y] : null }
    vista.setPointerCapture(ev.pointerId)
  }
  function seguirTrazo(ev) {
    if (!trazoVivo) return
    const eventos = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]
    for (const e of eventos) { const p = aMundo(e.clientX, e.clientY); const u = trazoVivo.puntos[trazoVivo.puntos.length - 1]; if (Math.hypot(p.x - u[0], p.y - u[1]) > 1.5 / C.z) trazoVivo.puntos.push([p.x, p.y]) }
    trazoVivo.nodo.setAttribute('d', contorno(trazoVivo.puntos, 3.2 / Math.sqrt(C.z), 9))
  }
  function terminarTrazo() {
    if (!trazoVivo) return
    const t = trazoVivo; trazoVivo = null
    if (t.puntos.length < 2) t.puntos.push([t.puntos[0][0] + 0.5, t.puntos[0][1] + 0.5])
    t.nodo.setAttribute('d', contorno(t.puntos, 3.2 / Math.sqrt(C.z), 9))
    E.lapiz.set(t.id, t)
    const puntos = t.puntos.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])
    enviar('gesto', { gesto: { tipo: 'trazo', id: t.id, puntos, en: t.en, pred: t.pred, origen: t.origen } })
  }
  function restaurarTrazos(trazos) {
    for (const t of trazos || []) {
      if (E.lapiz.has(t.id)) continue
      const path = document.createElementNS(NS, 'path'); capaLapiz.appendChild(path)
      // El lápiz sobre un objeto viaja con el objeto: si el territorio se acomodó distinto, se corre lo mismo.
      const el = t.en && t.origen ? E.elementos.get(t.en) : null
      const dx = el ? el.x - t.origen[0] : 0, dy = el ? el.y - t.origen[1] : 0
      const puntos = dx || dy ? t.puntos.map((q) => [q[0] + dx, q[1] + dy]) : t.puntos
      path.setAttribute('d', contorno(puntos, 3.2, 9)); if (t.tinta) path.classList.add('tinta')
      E.lapiz.set(t.id, { ...t, puntos, nodo: path })
    }
  }

  // ───────────────────────── cámara a mano y lápiz ─────────────────────────
  let pan = null
  const punteros = new Map()
  vista.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('#pregunta') || ev.target.closest('.alfiler')) return
    if (E.lapizActivo || (E.congelado && E.congelado.modo === 'dibuja')) { empezarTrazo(ev); return }
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (punteros.size === 2) { const [p1, p2] = [...punteros.values()]; pan = { pinza: Math.hypot(p1.x - p2.x, p1.y - p2.y), z: C.z, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 }; return }
    pan = { x: ev.clientX, y: ev.clientY, cx: C.x, cy: C.y }
    vista.classList.add('arrastrando'); vista.setPointerCapture(ev.pointerId)
  })
  vista.addEventListener('pointermove', (ev) => {
    if (trazoVivo) { seguirTrazo(ev); return }
    if (!pan) return
    if (punteros.has(ev.pointerId)) punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (pan.pinza && punteros.size === 2) {
      const [p1, p2] = [...punteros.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      zoomEn(pan.cx, pan.cy, clamp(pan.z * (d / pan.pinza), 0.15, 5) / C.z); return
    }
    C.x = C.tx = pan.cx - (ev.clientX - pan.x) / C.z; C.y = C.ty = pan.cy - (ev.clientY - pan.y) / C.z; C.tz = C.z
    aplicarCamara()
  })
  const finPuntero = (ev) => { punteros.delete(ev.pointerId); if (trazoVivo) { terminarTrazo(); return } if (punteros.size < 2) { pan = null; vista.classList.remove('arrastrando') } }
  vista.addEventListener('pointerup', finPuntero); vista.addEventListener('pointercancel', finPuntero)
  function zoomEn(sx, sy, factor) {
    const antes = aMundo(sx, sy)
    C.z = C.tz = clamp(C.z * factor, 0.15, 5)
    const despues = aMundo(sx, sy)
    C.x = C.tx = C.x + (antes.x - despues.x); C.y = C.ty = C.y + (antes.y - despues.y)
    aplicarCamara()
  }
  vista.addEventListener('wheel', (ev) => {
    ev.preventDefault()
    if (ev.ctrlKey || ev.metaKey) zoomEn(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.01))
    else { C.x = C.tx = C.x + ev.deltaX / C.z; C.y = C.ty = C.y + ev.deltaY / C.z; aplicarCamara() }
  }, { passive: false })

  // ───────────────────────── el tiempo se detiene (predicción) ─────────────────────────
  let alfiler = null
  function congelar(q) {
    descongelar(true)
    const r = q.en ? resolver(q.en) : null
    E.congelado = { pasoId: q.pasoId, modo: q.modo || 'palabras', en: r ? r.el.id : null }
    document.body.classList.add('congelado')
    for (const el of E.elementos.values()) if (!r || el.id !== r.el.id) el.nodo.classList.add('apagado')
    for (const t of E.tintas) t.nodo.style.opacity = '.25'
    // El objeto queda abajo de la pregunta: se encuadra con aire arriba para que la pregunta no lo tape.
    if (r) { const b = caja(r.el), { h } = tamVista(), z = clamp(Math.min((tamVista().w - 80) / b.w, (h - 260) / b.h), 0.18, 1.3); encuadrar({ x: b.x, y: b.y - 170 / z, w: b.w, h: b.h + 170 / z }, { zMax: z, margen: 30 }) }
    const pista = { arrastra: 'Arrastra el alfiler adonde crees que va', dibuja: 'Dibuja con el dedo o el ratón lo que esperas ver', numero: 'Escribe tu número', palabras: 'Dilo con tus palabras', toca: 'Toca donde crees' }[E.congelado.modo] || ''
    const conCampo = E.congelado.modo === 'numero' || E.congelado.modo === 'palabras'
    preg.innerHTML = `<div class="q">${marcarTexto(q.pregunta || '¿Qué crees que pasa?')}</div><div class="linea"></div><div class="pista">${esc(q.pista || pista)}</div>` +
      `<div class="responder">${conCampo ? `<input ${E.congelado.modo === 'numero' ? 'inputmode="decimal"' : ''} placeholder="${E.congelado.modo === 'numero' ? 'tu número' : 'tu idea, en corto'}" autocomplete="off">` : ''}<button type="button">Listo</button></div>`
    preg.hidden = false
    escribirSpans(preg.querySelector('.q'), clamp((q.pregunta || '').length * 0.03, 0.4, 1.6), { fresca: false })
    // Sin <form>: el iframe aislado no tiene allow-forms (un submit se bloquea). Clic o Enter.
    preg.querySelector('.responder button').addEventListener('click', () => responder())
    preg.querySelector('.responder input')?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); responder() } })
    if (conCampo) setTimeout(() => preg.querySelector('input')?.focus(), 300)
    if (E.congelado.modo === 'arrastra' && r) {
      alfiler = document.createElement('div'); alfiler.className = 'alfiler'
      const p0 = r.esElemento ? { x: r.caja.x + r.caja.w * 0.5, y: r.caja.y + r.caja.h * 0.5 } : r.punto
      alfiler.mundo = { x: p0.x, y: p0.y }
      vista.appendChild(alfiler)
      let arr = false
      alfiler.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); arr = true; alfiler.setPointerCapture(ev.pointerId) })
      alfiler.addEventListener('pointermove', (ev) => { if (arr) { alfiler.mundo = aMundo(ev.clientX, ev.clientY); alfiler.movido = true } })
      alfiler.addEventListener('pointerup', () => { arr = false })
    }
  }
  function responder() {
    const q = E.congelado; if (!q) return
    const el = q.en ? E.elementos.get(q.en) : null
    const s = el && el.inst && el.inst.mundo
    const res = { pasoId: q.pasoId, modo: q.modo }
    if (q.modo === 'arrastra' && alfiler) {
      const p = alfiler.mundo, lx = el ? p.x - el.x : p.x, ly = el ? p.y - el.y : p.y
      res.valor = { x: +lx.toFixed(1), y: +ly.toFixed(1), ...(s ? { u: +s.u(lx).toFixed(3), v: +s.v(ly).toFixed(3) } : {}) }
      // El fantasma de la predicción se queda en el papel.
      const pts = elipseA({ x: p.x, y: p.y }, 9, 9, 99)
      entintar(pts, { clase: 'fantasma', ref: el?.id, instantaneo: true })
      nota('tu predicción', { x: p.x + 14, y: p.y - 16 }, { lado: 'derecha', instantaneo: true }).then(() => { const n = capaNotas.lastElementChild; if (n) { n.style.color = 'var(--grafito)'; n.style.fontSize = '16px'; n.dataset.ref = el?.id || '' } })
    } else if (q.modo === 'dibuja') {
      const trazos = [...E.lapiz.values()].filter((t) => t.pred === q.pasoId)
      res.valor = { trazos: trazos.map((t) => t.id), muestras: s && el ? muestrear(trazos, el, s) : undefined }
    } else {
      const v = preg.querySelector('input')?.value?.trim() ?? ''
      if (!v) { preg.querySelector('input')?.focus(); return }
      res.valor = q.modo === 'numero' ? (Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : v) : v
    }
    res.png = el ? fotoElemento(el) : null
    enviar('respuesta', res)
    descongelar()
  }
  function muestrear(trazos, el, s) {
    const out = []
    for (const t of trazos) for (let i = 0; i < t.puntos.length; i += Math.max(1, Math.floor(t.puntos.length / 24))) {
      const lx = t.puntos[i][0] - el.x, ly = t.puntos[i][1] - el.y
      out.push([+s.u(lx).toFixed(3), +s.v(ly).toFixed(3)])
    }
    return out.slice(0, 120)
  }
  /** Foto del objeto con el lápiz encima: lo que Levy ve de lo que hiciste. */
  function fotoElemento(el) {
    try {
      const k = 1.5, c = document.createElement('canvas'); c.width = Math.round(el.w * k); c.height = Math.round(el.h * k)
      const x = c.getContext('2d')
      x.fillStyle = css('--papel'); x.fillRect(0, 0, c.width, c.height)
      const lien = el.nodo.querySelector('canvas'); if (lien) x.drawImage(lien, 0, 0, c.width, c.height)
      x.setTransform(k, 0, 0, k, -el.x * k, -el.y * k); x.fillStyle = css('--grafito')
      for (const t of E.lapiz.values()) x.fill(new Path2D(t.nodo.getAttribute('d') || ''))
      for (const t of E.tintas) if (t.ref === el.id) { x.fillStyle = css('--tinta'); x.fill(new Path2D(t.nodo.getAttribute('d') || '')) }
      return c.toDataURL('image/png')
    } catch (e) { avisar('foto', e); return null }
  }
  function descongelar(silencioso) {
    if (!E.congelado && silencioso) return
    E.congelado = null
    document.body.classList.remove('congelado')
    for (const el of E.elementos.values()) el.nodo.classList.remove('apagado')
    for (const t of E.tintas) t.nodo.style.opacity = ''
    preg.hidden = true; preg.innerHTML = ''
    if (alfiler) { alfiler.remove(); alfiler = null }
  }

  // ───────────────────────── subtítulo ─────────────────────────
  function subtitulo(texto, hasta) {
    if (!texto) { sub.classList.remove('vivo'); return }
    const dicho = texto.slice(0, hasta), resto = texto.slice(hasta)
    sub.innerHTML = `<b>${esc(dicho)}</b>${esc(resto)}`
    sub.classList.add('vivo')
  }

  // ───────────────────────── cuadro ─────────────────────────
  let ultimo = ahora()
  function cuadro() {
    const t = ahora(), dt = Math.min(0.1, Math.max(0, t - ultimo)); ultimo = t
    for (const a of [...E.animaciones]) {
      const k = clamp((t - a.t0) / a.dur, 0, 1)
      try { a.cada(a.facilidad(k)) } catch (e) { avisar('animación', e) }
      if (k >= 1) { E.animaciones.delete(a); a.fin() }
    }
    // Cámara: se acerca a su meta con un resorte crítico (llega sin rebote).
    const f = 1 - Math.exp(-C.rapidez * dt)
    if (Math.abs(C.tx - C.x) > 0.05 || Math.abs(C.ty - C.y) > 0.05 || Math.abs(C.tz / C.z - 1) > 0.0005) {
      C.x = lerp(C.x, C.tx, f); C.y = lerp(C.y, C.ty, f); C.z = Math.exp(lerp(Math.log(C.z), Math.log(C.tz), f)); aplicarCamara()
    }
    for (const el of E.elementos.values()) if (el.inst) el.inst.cuadro(dt)
    dibujarHilos()
    if (alfiler) { const s = aPantalla(alfiler.mundo); alfiler.style.transform = `translate(${s.x}px, ${s.y}px)` }
    pasoHalo()
  }
  function bucle() { if (!R.virtual) cuadro(); requestAnimationFrame(bucle) }
  requestAnimationFrame(bucle)
  new ResizeObserver(() => aplicarCamara()).observe(vista)

  // ───────────────────────── mensajes del padre ─────────────────────────
  async function aplicarPaso(paso, instantaneo) {
    // La tinta envejece con los pasos (no se borra): la del paso anterior queda en voz baja y la de antes casi se va.
    // Así lo que se dice ahora manda y el pizarrón no se llena de óvalos huérfanos (gap que nombró el crítico ciego).
    for (const n of [...E.tintas.map((t) => t.nodo), ...capaNotas.children]) {
      const edad = (+n.dataset.edad || 0) + 1; n.dataset.edad = String(edad)
      n.classList.toggle('quieta', edad === 1); n.classList.toggle('dormida', edad >= 2)
    }
    const grupo = { id: paso.id, elementos: [] }
    E.grupos.push(grupo)
    // Foco: si el paso trae elementos nuevos, lo de antes pasa a segundo plano (vuelve en cuanto Levy lo nombra).
    if ((paso.pon || []).some((d) => d.tipo !== 'hilo')) for (const el of E.elementos.values()) el.nodo.classList.add('fondo')
    for (const id of paso.quita || []) quitarElemento(id)
    for (const def of paso.pon || []) await crearElemento(def, grupo, instantaneo)
    if (grupo.elementos.length && paso.camara !== false) encuadrar({ x: grupo.x, y: grupo.y, w: grupo.x2 - grupo.x, h: grupo.y2 - grupo.y }, { inmediato: instantaneo, zMax: 1.2 })
    if (paso.luz) ponerLuz(paso.luz)
  }
  function reiniciar() {
    for (const el of E.elementos.values()) el.nodo.remove()
    E.elementos.clear(); E.grupos = []; E.tintas = []; E.lapiz.clear(); E.animaciones.clear()
    for (const h of E.hilos) { h.nodo.remove(); h.puntas.forEach((p) => p.remove()) } E.hilos = []
    capaTinta.innerHTML = ''; capaLapiz.innerHTML = ''; capaNotas.innerHTML = ''
    descongelar(true); subtitulo(null); halo.classList.remove('vivo'); semillaMarca = 11; H.semilla = 7
  }
  let cola = Promise.resolve()
  window.addEventListener('message', (ev) => {
    if (ev.source !== parent) return
    const m = ev.data
    if (!m || m.pz !== 1) return
    // Todo lo que cambia el territorio va en fila: un paso termina de montarse antes de la marca que lo toca.
    const tarea = async () => {
      switch (m.tipo) {
        case 'iniciar':
          if (m.luz) ponerLuz(m.luz)
          document.body.classList.toggle('sin-subtitulos', m.subtitulos === false)
          if (m.virtual) { R.virtual = true; R.t = m.t0 || 0; ultimo = R.t }
          return
        case 'objeto': { const b = E.biblioteca.get(m.id); if (!b || b.codigo !== m.codigo) E.biblioteca.set(m.id, { codigo: m.codigo, ficha: m.ficha || null }); return }
        case 'imagen': E.imagenes.set(m.id, { url: m.url, ancho: m.ancho, alto: m.alto }); return
        case 'paso': await aplicarPaso(m.paso, !!m.instantaneo); return
        case 'marca': await marca(m.marca, { instantaneo: !!m.instantaneo }); return
        case 'congelar': congelar(m); return
        case 'descongelar': descongelar(); return
        case 'lapiz': E.lapizActivo = !!m.activo; document.body.classList.toggle('lapiz', E.lapizActivo); return
        case 'trazos': restaurarTrazos(m.trazos); return
        case 'gesto': {
          const g = m.gesto
          if (g && g.tipo === 'param') { const el = E.elementos.get(g.el); if (el && el.inst) el.inst.pz.poner(g.param, g.valor, 0, 'reproduccion') }
          if (g && g.tipo === 'trazo') restaurarTrazos([g])
          return
        }
        case 'entintar': for (const t of E.lapiz.values()) { t.nodo.classList.add('tinta'); t.tinta = true } return
        case 'camara': if (m.accion === 'todo') { for (const el of E.elementos.values()) el.nodo.classList.remove('fondo') } if (m.accion === 'todo') encuadrar(cajaTodo(), { zMax: 1.1, rapidez: 2.2, inmediato: !!m.instantaneo }); return
        case 'subtitulo': subtitulo(m.texto, m.hasta ?? 0); return
        case 'reiniciar': reiniciar(); return
        case 'pausa': E.pausa = !!m.activa; return
        case 'reloj': R.t = m.t; cuadro(); enviar('cuadro', { t: m.t }); return
        case 'subtitulos': document.body.classList.toggle('sin-subtitulos', !m.activos); return
      }
    }
    // Las marcas no esperan a otras marcas (dos acotaciones seguidas corren a la vez); los pasos sí.
    if (m.tipo === 'marca' || m.tipo === 'subtitulo' || m.tipo === 'reloj' || m.tipo === 'lapiz') { cola.then(tarea).catch((e) => avisar(m.tipo, e)); return }
    cola = cola.then(tarea).catch((e) => avisar(m.tipo, e))
  })
  window.addEventListener('error', (e) => avisar('escenario', e.error || e.message))
  window.addEventListener('unhandledrejection', (e) => avisar('escenario', e.reason))
  // Para las pruebas y la exportación a video: dónde cae en pantalla una referencia y qué hay en el territorio.
  window.__pizarron = {
    enPantalla: (ref) => { const r = resolver(ref); return r ? aPantalla(r.punto) : null },
    elementos: () => [...E.elementos.values()].map((e) => ({ id: e.id, tipo: e.tipo, x: e.x, y: e.y, w: e.w, h: e.h, roto: !!(e.inst && e.inst.roto) })),
    camara: () => ({ x: C.x, y: C.y, z: C.z }), tintas: () => E.tintas.length, lapiz: () => E.lapiz.size, congelado: () => E.congelado,
  }
  aplicarCamara()
  enviar('listo')
})()
