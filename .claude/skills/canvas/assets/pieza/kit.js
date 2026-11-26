/*
 * Kit de las PIEZAS VIVAS del Lienzo (base común de cualquier lienzo con capítulos; la usa primero `mapa-vivo`).
 *
 * Una pieza viva es un mecanismo dibujado con código (HTML + SVG + Canvas) que vive dentro del Lienzo: de lejos se ve
 * su póster (una foto fiel) y, al acercarte, despierta y se mueve. Este kit le da a todas la misma tinta, la misma
 * letra, los mismos sellos de estado y el mismo reloj, para que la página entera se lea como un solo dibujo.
 *
 * Una pieza = `export default function montar(raiz, ctx, datos)`; pinta dentro de `raiz` y devuelve lo de `api()`.
 *   ctx.tema    'oscuro' | 'claro'
 *   ctx.ir(d)   abre un destino permitido (lienzo:<capítulo>, doc:<ruta>, panel:<sección>)
 *   ctx.animar  el reloj del Lienzo: solo corre con la pieza despierta
 *   ctx.alPaso  el paso del recorrido (0..pasos); fuera del recorrido, el último
 *   ctx.quieto  (solo en el visor de pruebas) segundos: pinta ESE cuadro y no anima
 *   ctx.imagen(ruta)  la imagen del repo que la ficha declaró en `imagenes` (el Lienzo la entrega sin red); '' si no está
 *   datos.marca { acento, segundo, motivo }: los colores y la figura del negocio; sin ellos, los de la casa
 * Reglas: sin red y sin datos de la app; todo texto que venga de `datos` pasa por `e()`; el póster es el primer cuadro,
 * completo y en reposo (la animación es adorno: nada importante depende de que se mueva).
 */
const NS = 'http://www.w3.org/2000/svg'

const KIT_CSS = `
.pv{position:relative;overflow:hidden;font:500 16px/1.4 var(--sans);color:var(--cuerpo);background:transparent;
 -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
 --serif:var(--ab-serif,"Cormorant Garamond","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);
 --sans:var(--ab-sans,Inter,Montserrat,"Avenir Next","Helvetica Neue",-apple-system,system-ui,sans-serif);
 --titulo:#ecedef;--cuerpo:#c9cad1;--mudo:#a1a1aa;--tenue:#6b7080;--linea:#2c2e37;--linea2:#454856;
 --sup:rgba(255,255,255,.035);--sup2:rgba(255,255,255,.06);--hondo:#0c0d12;--papel:#15161c;
 --mor:#8C27F1;--oro:#F08A00;--rojo:#E5484D;--brillo:1;
 --morluz:color-mix(in srgb,var(--mor) 62%,#fff);--mortinta:color-mix(in srgb,var(--mor) 70%,#fff);
 --morhondo:color-mix(in srgb,var(--mor) 16%,transparent);
 --oroluz:color-mix(in srgb,var(--oro) 72%,#fff);--orotinta:color-mix(in srgb,var(--oro) 86%,#fff);
 --orohondo:color-mix(in srgb,var(--oro) 13%,transparent)}
.pv[data-tema=claro]{--titulo:#16161a;--cuerpo:#3f3f49;--mudo:#5c5c68;--tenue:#9a98a2;--linea:#e4e1da;--linea2:#cfcac0;
 --sup:rgba(20,16,10,.03);--sup2:rgba(20,16,10,.055);--hondo:#fbf9f4;--papel:#fffdf8;--rojo:#D92D20;--brillo:.35;
 --morluz:var(--mor);--mortinta:color-mix(in srgb,var(--mor) 88%,#000);--morhondo:color-mix(in srgb,var(--mor) 8%,transparent);
 --oroluz:color-mix(in srgb,var(--oro) 94%,#000);--orotinta:color-mix(in srgb,var(--oro) 74%,#000);
 --orohondo:color-mix(in srgb,var(--oro) 10%,transparent)}
.pv *{box-sizing:border-box}
.pv svg{display:block;overflow:visible}
.pv .ceja{font:800 13px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mudo)}
.pv .ceja.oro{color:var(--orotinta)} .pv .ceja.mor{color:var(--mortinta)}
.pv .serif{font-family:var(--serif)}
.pv .sello{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 10px;border-radius:11px;white-space:nowrap;
 font:800 10.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;border:1.5px solid currentColor;color:var(--mudo)}
.pv .sello::before{content:"";width:6px;height:6px;border-radius:3px;background:currentColor}
.pv .sello.firmado{color:var(--orotinta);background:var(--orohondo)}
.pv .sello.opera{color:var(--mortinta);background:var(--morhondo)}
.pv .sello.abierto{border-style:dashed;color:var(--orotinta)}
.pv .sello.abierto::before{background:transparent;box-shadow:inset 0 0 0 1.5px currentColor}
.pv .sello.pendiente{border-style:dashed;color:var(--mudo)}
.pv .sello.pendiente::before{background:transparent;box-shadow:inset 0 0 0 1.5px currentColor}
.pv .sello.idea{border-style:dotted;color:var(--tenue)}
.pv .sello.idea::before{display:none}
.pv .botones{display:flex;flex-wrap:wrap;gap:10px}
.pv .boton{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:9px;height:38px;padding:0 16px 0 5px;
 border-radius:19px;background:var(--sup2);color:var(--titulo);border:1px solid var(--linea2);
 font:700 13.5px/1 var(--sans);white-space:nowrap;
 transition:transform .18s cubic-bezier(.2,.8,.2,1),border-color .18s,box-shadow .18s,background-color .18s}
.pv .boton .ico{width:28px;height:28px;border-radius:14px;display:grid;place-items:center;background:var(--mor);color:#fff;flex:none;font:800 13px/1 var(--sans)}
.pv .boton.oro .ico{background:var(--oro);color:#1a1205}
.pv .boton:hover{transform:translateY(-1px);border-color:var(--morluz);box-shadow:0 8px 22px -10px color-mix(in srgb,var(--mor) calc(80% * var(--brillo)),transparent)}
.pv .boton.oro:hover{border-color:var(--oroluz);box-shadow:0 8px 22px -10px color-mix(in srgb,var(--oro) calc(80% * var(--brillo)),transparent)}
.pv .boton:active{transform:translateY(1px) scale(.97)}
.pv .pv-img{position:absolute;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}
.pv .pv-img.foto{border-radius:14px;box-shadow:0 18px 40px -26px rgba(20,12,40,.55)}
.pv .pv-img.foto img{border-radius:14px}
.pv[data-tema=oscuro] .pv-img.foto img{filter:brightness(.8) saturate(.92) contrast(1.04)}
.pv[data-tema=oscuro] .pv-img.foto{box-shadow:0 0 0 3px color-mix(in srgb,var(--oro) 30%,transparent),0 30px 60px -30px #000}
.pv .pv-img.falta{display:grid;place-items:center;border:1.5px dashed var(--linea2);border-radius:14px}
.pv .pv-img.falta img{visibility:hidden;position:absolute}
.pv .pv-img.falta::after{content:attr(data-rotulo);color:var(--mudo);font:700 13px/1.3 var(--sans);letter-spacing:.06em;text-align:center;padding:12px}
.pv .espera{opacity:0;transition:opacity .5s ease}
.pv .espera.ya{opacity:1}
@media (prefers-reduced-motion:reduce){.pv *{animation:none!important;transition:none!important}}
.pv[data-quieto] *{transition:none!important}
`

/** Texto de los datos → HTML seguro. Todo lo que no escribiste tú en la pieza pasa por aquí. */
export function e(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
const COLOR_OK = /^#[0-9a-fA-F]{3,8}$/

/** El marco común: div.pv transparente, con tema, tamaño fijo y, si los hay, los colores del negocio. */
export function marco(raiz, ctx, { ancho, alto, clase = '', css = '', marca = null }) {
  const div = document.createElement('div')
  div.className = `pv ${clase}`
  div.dataset.tema = ctx.tema === 'claro' ? 'claro' : 'oscuro'
  div.style.width = `${ancho}px`; div.style.height = `${alto}px`
  if (marca && COLOR_OK.test(marca.acento || '')) div.style.setProperty('--oro', marca.acento)
  if (marca && COLOR_OK.test(marca.segundo || '')) div.style.setProperty('--mor', marca.segundo)
  const s = document.createElement('style'); s.textContent = KIT_CSS + css; div.appendChild(s)
  raiz.appendChild(div)
  div.dataset.quieto = ''                         // el póster es el primer cuadro: sin transiciones a medias en la foto
  setTimeout(() => { delete div.dataset.quieto }, 2500)
  return div
}

/** El instante que se fotografía como póster: cada pieza lo interpreta como «todo encendido, en reposo». */
export const POSTER_T = -1

/** El reloj de la pieza (segundos). Dentro del Lienzo lo marca el host; fuera, rAF; con ctx.quieto, un solo cuadro. */
export function bucle(ctx, pintar) {
  if (typeof ctx.quieto === 'number') { pintar(ctx.quieto, 0); return { parar() {}, pausar() {}, reposo() { pintar(ctx.quieto, 0) } } }
  if (ctx.animar) {
    pintar(POSTER_T, 0)
    let base = null, ultimo = 0, desfase = 0
    const parar = ctx.animar(() => {
      const ahora = performance.now() / 1000
      if (base === null) base = ahora - ultimo
      let t = ahora - base - desfase
      if (t - ultimo > .25) { desfase += t - ultimo - 1 / 60; t = ultimo + 1 / 60 }
      pintar(t, Math.max(0, Math.min(.05, t - ultimo))); ultimo = t
    })
    return { parar() { parar?.() }, pausar() {}, reposo() { pintar(POSTER_T, 0) } }
  }
  pintar(POSTER_T, 0)
  let raf = 0, t0 = performance.now(), pausa = false, tPausa = 0, previo = 0
  const paso = (ahora) => {
    raf = requestAnimationFrame(paso)
    if (pausa || document.hidden) return
    const t = (ahora - t0) / 1000
    pintar(t, Math.min(.05, Math.max(0, t - previo))); previo = t
  }
  raf = requestAnimationFrame(paso)
  return {
    parar() { cancelAnimationFrame(raf) },
    pausar(b) { if (b && !pausa) { pausa = true; tPausa = performance.now() } else if (!b && pausa) { pausa = false; t0 += performance.now() - tPausa } },
    reposo() { pintar(POSTER_T, 0) },
  }
}

/**
 * El recorrido dentro de la pieza: `alPaso(n)` cada vez que cambia el paso. Lo que lleva `data-desde="n"` aparece desde el
 * paso n (con fundido). Fuera del recorrido todo se ve. Devuelve una función que dice el paso actual.
 */
export function pasos(div, ctx, total, alCambiar = null) {
  let actual = total
  const aplicar = (n) => {
    actual = typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(total, n)) : total
    for (const el of div.querySelectorAll('[data-desde]')) {
      el.classList.add('espera'); el.classList.toggle('ya', (parseFloat(el.getAttribute('data-desde')) || 0) <= actual)
    }
    alCambiar?.(actual)
  }
  aplicar(typeof ctx.paso === 'number' ? ctx.paso : total)
  ctx.alPaso?.(aplicar)
  return () => actual
}

/** Los cuatro estados del mapa (más «opera», lo que ya funciona hoy). Lo abierto y lo pendiente nunca se pintan como dato. */
export const ESTADOS = {
  firmado: 'firmado', opera: 'opera', abierto: 'abierto', pendiente: 'pendiente', idea: 'idea',
}
/** `firmada`, `borrador`, `vacía`, `por medir`… → uno de los cinco de arriba. */
export function estadoDe(x) {
  const s = String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if (/^(firmad|decidid|medid|hecho|listo)/.test(s)) return 'firmado'
  if (/^(opera|activo|funciona|vivo)/.test(s)) return 'opera'
  if (/^(abiert|borrador|en curso|por decidir)/.test(s)) return 'abierto'
  if (/^(idea|mas adelante|algun dia)/.test(s)) return 'idea'
  return 'pendiente'
}
const ROTULO = { firmado: 'firmado', opera: 'opera hoy', abierto: 'abierto', pendiente: 'pendiente', idea: 'idea' }
export const sello = (estado, texto) => { const k = estadoDe(estado); return `<span class="sello ${k}">${e(texto || ROTULO[k])}</span>` }
/** El trazo SVG de cada estado: sólido lo firmado, guiones lo abierto y lo pendiente, puntos la idea. */
export const trazoDe = (estado) => ({ firmado: '', opera: '', abierto: '7 6', pendiente: '4 7', idea: '1.5 7' }[estadoDe(estado)])

/** Botón con destino. icono: una letra o glifo corto. */
export function boton(ctx, { texto, destino, icono = '→', tono = '' }) {
  const b = document.createElement('button')
  b.type = 'button'; b.className = `boton ${tono}`
  b.dataset.destino = destino
  b.innerHTML = `<span class="ico">${e(icono)}</span><span>${e(texto)}</span>`
  b.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.ir?.(destino) })
  return b
}
export function botones(ctx, lista) {
  const d = document.createElement('div'); d.className = 'botones'
  for (const x of lista || []) if (x && x.texto && x.destino) d.appendChild(boton(ctx, x))
  return d
}

export function semilla(n = 7) { let s = n >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
export const suave = (x) => x * x * (3 - 2 * x)
export const sujeta = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
export const mezcla = (a, b, k) => a + (b - a) * k

/** Canvas con devicePixelRatio, del tamaño de su caja; no toma el puntero. */
export function lienzo(div, ancho, alto, z = 1) {
  const c = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = Math.round(ancho * dpr); c.height = Math.round(alto * dpr)
  Object.assign(c.style, { position: 'absolute', left: 0, top: 0, width: `${ancho}px`, height: `${alto}px`, zIndex: z, pointerEvents: 'none' })
  div.appendChild(c)
  const g = c.getContext('2d'); g.scale(dpr, dpr)
  return { c, g }
}

/** Colores vivos del tema actual, ya resueltos (el canvas no lee variables CSS). */
export function paleta(div) {
  const sonda = document.createElement('i'); sonda.style.display = 'none'; div.appendChild(sonda)
  const v = (n) => { sonda.style.color = ''; sonda.style.color = `var(${n})`; return getComputedStyle(sonda).color || '#888' }
  const p = { oro: v('--oro'), oroluz: v('--oroluz'), mor: v('--mor'), morluz: v('--morluz'), titulo: v('--titulo'),
    cuerpo: v('--cuerpo'), mudo: v('--mudo'), tenue: v('--tenue'), linea: v('--linea'), linea2: v('--linea2'), rojo: v('--rojo'),
    claro: div.dataset.tema === 'claro' }
  sonda.remove()
  return p
}

/**
 * La figura de la gente que fluye por el negocio. `motivo` sale del mundo del cliente: 'punto' (por defecto), 'tuerca'
 * (hexágono con hueco), 'gota', 'hoja', 'rombo', 'cuadro', 'estrella'. Con halo en oscuro.
 */
export function figura(g, motivo, x, y, r, color, alfa = 1, claro = false, giro = 0) {
  if (alfa <= 0) return
  g.globalAlpha = alfa
  if (!claro) { g.fillStyle = color; g.globalAlpha = alfa * .22; g.beginPath(); g.arc(x, y, r * 2.6, 0, 7); g.fill(); g.globalAlpha = alfa }
  g.fillStyle = color
  const poli = (n, rot, k = 1) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + giro + i * 2 * Math.PI / n, rr = r * k; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr) } g.closePath() }
  if (motivo === 'tuerca') {
    poli(6, 0, 1.25); g.fill()
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r * .5, 0, 7); g.fill()
    g.globalCompositeOperation = 'source-over'
  } else if (motivo === 'rombo') { poli(4, 0, 1.3); g.fill() }
  else if (motivo === 'cuadro') { poli(4, Math.PI / 4, 1.3); g.fill() }
  else if (motivo === 'estrella') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = giro - Math.PI / 2 + i * Math.PI / 5, rr = r * (i % 2 ? .6 : 1.45); g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr) } g.closePath(); g.fill() }
  else if (motivo === 'gota') { g.beginPath(); g.moveTo(x, y - r * 1.6); g.quadraticCurveTo(x + r * 1.3, y + r * .1, x, y + r * 1.1); g.quadraticCurveTo(x - r * 1.3, y + r * .1, x, y - r * 1.6); g.fill() }
  else if (motivo === 'hoja') { g.beginPath(); g.ellipse(x, y, r * 1.5, r * .8, giro + .6, 0, 7); g.fill() }
  else { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
  g.globalAlpha = 1
}

/** Un elemento SVG con atributos. */
export function svgEl(tag, attrs = {}, padre = null) {
  const el = document.createElementNS(NS, tag)
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== '') el.setAttribute(k, attrs[k])
  if (padre) padre.appendChild(el)
  return el
}
/** Texto SVG (va por textContent: seguro con datos). */
export function svgTexto(padre, x, y, texto, attrs = {}) {
  const t = svgEl('text', { x, y, ...attrs }, padre); t.textContent = String(texto ?? ''); return t
}
/** Puntos a lo largo de un trazo SVG (para que algo lo recorra). */
export function muestra(path, n = 120) {
  const L = path.getTotalLength?.() || 0, out = []
  for (let s = 0; s <= n; s++) { const q = L ? path.getPointAtLength(s / n * L) : { x: 0, y: 0 }; out.push([q.x, q.y]) }
  return out
}
/** Corta un texto a `n` caracteres en una palabra, con «…». */
export function corto(s, n) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const c = t.slice(0, n).replace(/[\s,;:·—–-]+\S*$/u, '')
  return (c.length >= n * .5 ? c : t.slice(0, n)).replace(/[\s,;:·.]+$/u, '') + '…'
}

/**
 * Una imagen del repo dentro de la pieza. `img` es lo que da `lienzo_vivo.imagen_de(ruta)`: `{ruta, ancho, alto}` (o solo
 * la ruta, con `alto` explícito). La ficha la declara (`armar_pieza(..., imagenes=[…])`) y el Lienzo la entrega antes de
 * montar: viaja con la cámara, sale en el póster y aparece con el recorrido (`desde`). Nunca se deforma: `ancho` manda y
 * el alto sale de su proporción. Fuera del Lienzo (visor) se ve un hueco rotulado, jamás un hueco mudo.
 */
export function imagen(div, ctx, img, { x = 0, y = 0, ancho = 400, alto = null, clase = '', desde = null, alt = '' } = {}) {
  const ruta = typeof img === 'string' ? img : img?.ruta
  const h = alto ?? (img?.ancho && img?.alto ? ancho * img.alto / img.ancho : ancho * 9 / 16)
  const caja = document.createElement('div')
  caja.className = `pv-img ${clase}`
  Object.assign(caja.style, { left: `${x}px`, top: `${y}px`, width: `${ancho}px`, height: `${h}px` })
  const im = document.createElement('img')
  // `data-imagen`: si la imagen llega después de montar, el host del Lienzo le pone su `src` solo
  im.setAttribute('data-imagen', String(ruta || '')); im.alt = alt; im.draggable = false; im.decoding = 'sync'
  Object.assign(im.style, { display: 'block', width: '100%', height: '100%', objectFit: 'contain' })
  const url = (ruta && ctx.imagen?.(ruta)) || ''
  if (url) im.src = url
  else { caja.classList.add('falta'); caja.dataset.rotulo = `imagen · ${corto(String(ruta || '').split('/').pop(), 40)}` }
  im.addEventListener('load', () => caja.classList.remove('falta'))
  caja.appendChild(im)
  if (desde !== null && desde !== undefined) caja.setAttribute('data-desde', String(desde))
  div.appendChild(caja)
  return caja
}

/** Un logo REAL (el archivo de la marca, nunca dibujado por un modelo): mismo trato que `imagen`, medido por su alto. */
export function logo(div, ctx, img, { x = 0, y = 0, alto = 48, clase = '', desde = null, alt = '' } = {}) {
  const ancho = img?.ancho && img?.alto ? alto * img.ancho / img.alto : alto
  return imagen(div, ctx, img, { x, y, ancho, alto, clase: `logo ${clase}`, desde, alt })
}

/** API común que devuelve cada pieza. */
export function api(div, reloj, extra = {}) {
  return {
    destruir() { reloj.parar(); div.remove(); extra.destruir?.() },
    // al cambiar de tema el host rehace el póster: se pinta el cuadro de reposo para que la foto salga completa
    tema(t) { div.dataset.tema = t === 'claro' ? 'claro' : 'oscuro'; extra.tema?.(t); reloj.reposo?.() },
    pausar(b) { reloj.pausar(b) },
  }
}
