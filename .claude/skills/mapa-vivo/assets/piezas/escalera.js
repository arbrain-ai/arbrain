/*
 * Pieza · La escalera de valor (capítulo «La oferta»).
 * Mecanismo: la gente entra por abajo, cruza la puerta y casi toda se queda en el escalón ancho (el que se empuja);
 * pocos suben. El ancho de cada escalón es su peso; lo que aún no existe se dibuja punteado y nadie camina sobre él.
 * Datos: oferta.escalera[{nombre, kicker, voz, texto, precio, estado, peso, frente}], oferta.entrada, oferta.botones.
 */
import { marco, bucle, api, svgEl, lienzo, paleta, sujeta, suave, e, sello, estadoDe, trazoDe, pasos, corto, semilla, figura, botones } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 330
const PISO = 326, XA = 250, XB = 1596, TOPE = 30, BASE = 172

const CSS = `
.esc .bl{position:absolute;padding:13px 16px 12px;display:flex;flex-direction:column;gap:5px;overflow:hidden}
.esc .kk{font:800 11px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mudo)}
.esc .nom{font:600 29px/1.02 var(--serif);color:var(--titulo);margin-top:3px}
.esc .frente .nom{font-size:42px;letter-spacing:-.01em}
.esc .voz{font:italic 600 18px/1.15 var(--serif);color:var(--mudo)}
.esc .frente .voz{color:var(--orotinta)} .esc .frente .kk{color:var(--orotinta)}
.esc .tx{font:600 13.5px/1.35 var(--sans);color:var(--cuerpo)}
.esc .fl{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:auto}
.esc .precio{font:800 16px/1 var(--sans);color:var(--titulo);font-variant-numeric:tabular-nums}
.esc .apagado .nom,.esc .apagado .tx{color:var(--mudo)}
.esc .ent{position:absolute;left:0;top:6px;width:${XA - 24}px}
.esc .ent .q{font:italic 600 19px/1.22 var(--serif);color:var(--cuerpo);margin-top:9px}
.esc .ent .botones{margin-top:14px;flex-direction:column;align-items:flex-start}
`

export default function montar(raiz, ctx, D) {
  const O = D.oferta || {}
  const esc = (O.escalera || []).slice(0, 5)
  const motivo = (D.marca || {}).motivo || 'punto'
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'esc', css: CSS, marca: D.marca })
  const svg = svgEl('svg', { width: W, height: H }, div)
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0 })
  const defs = svgEl('defs', {}, svg)
  const grad = (id, color, a) => { const g = svgEl('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, defs); svgEl('stop', { offset: 0, 'stop-color': color, 'stop-opacity': a }, g); svgEl('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }, g) }
  grad('es-oro', 'var(--oro)', .22); grad('es-mor', 'var(--mor)', .18); grad('es-gris', 'var(--tenue)', .1)

  // geometría: el ancho de cada escalón es su peso; cada uno más alto que el anterior
  const n = Math.max(1, esc.length), hueco = 18
  const pesos = esc.map((x) => Math.max(.6, Number(x.peso) || 1))
  const suma = pesos.reduce((a, b) => a + b, 0) || 1
  const util = XB - XA - hueco * (n - 1)
  let x = XA
  const iF = Math.max(0, esc.findIndex((s) => s.frente))
  const E = esc.map((s, i) => {
    const w = Math.max(190, util * pesos[i] / suma), k = estadoDe(s.estado)
    const y = n === 1 ? TOPE + 60 : BASE - (BASE - TOPE) * i / (n - 1)
    const vivo = k === 'firmado' || k === 'opera' || k === 'abierto'
    const r = { s, i, x0: x, x1: Math.min(XB, x + w), y, k, vivo, frente: i === iF, color: i === iF ? 'var(--oro)' : vivo ? 'var(--mor)' : 'var(--tenue)' }
    x += w + hueco
    return r
  })
  if (E.length) E[E.length - 1].x1 = XB
  const huellas = E.map((r) => {
    const relleno = r.frente ? 'url(#es-oro)' : r.vivo ? 'url(#es-mor)' : 'url(#es-gris)'
    svgEl('rect', { x: r.x0, y: r.y, width: r.x1 - r.x0, height: PISO - r.y, fill: relleno }, svg)
    svgEl('rect', { x: r.x0 + .75, y: r.y + .75, width: r.x1 - r.x0 - 1.5, height: PISO - r.y - 1.5, fill: 'none', stroke: r.color, 'stroke-opacity': .6, 'stroke-width': 1.6, 'stroke-dasharray': trazoDe(r.k) }, svg)
    return svgEl('rect', { x: r.x0, y: r.y - 2, width: r.x1 - r.x0, height: r.frente ? 5 : 3.5, rx: 2, fill: r.color, 'fill-opacity': r.vivo ? 1 : .55 }, svg)
  })
  svgEl('rect', { x: 0, y: PISO, width: W, height: 2, fill: 'var(--linea2)' }, svg)
  E.forEach((r) => {
    const s = r.s, d = document.createElement('div')
    const ancho = r.x1 - r.x0, largo = ancho > 420
    d.className = `bl ${r.frente ? 'frente' : ''} ${r.vivo ? '' : 'apagado'}`
    Object.assign(d.style, { left: `${r.x0}px`, top: `${r.y + 4}px`, width: `${ancho}px`, height: `${PISO - r.y - 4}px` })
    d.innerHTML = `<div class="kk">${e(s.kicker || `Escalón ${r.i + 1}`)}</div><div class="nom">${e(corto(s.nombre, largo ? 40 : 24))}</div>
      ${s.voz ? `<div class="voz">${e(corto(s.voz, largo ? 90 : 46))}</div>` : ''}
      ${s.texto && PISO - r.y > 190 ? `<div class="tx">${e(corto(s.texto, largo ? 170 : 80))}</div>` : ''}
      <div class="fl">${s.precio ? `<span class="precio">${e(s.precio)}</span>` : ''}${sello(s.estado, s.sello)}</div>`
    div.appendChild(d)
  })
  const ent = document.createElement('div'); ent.className = 'ent'
  ent.innerHTML = `<div class="ceja oro">${e(O.entrada_rotulo || 'De dónde llegan')}</div><div class="q">${e(corto(O.entrada || 'casi todos se quedan en el escalón ancho; pocos suben', 110))}</div>`
  if ((O.botones || []).length) ent.appendChild(botones(ctx, O.botones))
  div.appendChild(ent)

  // ── la gente (canvas): camina por las huellas y salta de escalón; nadie pisa lo que aún no existe ──
  const { g } = lienzo(div, W, H, 3)
  let p = paleta(div)
  const rnd = semilla(11)
  const gente = []
  const tope = E.reduce((m, r, i) => (r.vivo ? i : m), -1)        // el último escalón que existe
  const metaDe = () => {
    if (tope < 0) return -1
    let r = rnd() * E.slice(0, tope + 1).reduce((a, q) => a + (q.frente ? 3.2 : 1) * (q.x1 - q.x0), 0)
    for (let i = 0; i <= tope; i++) { r -= (E[i].frente ? 3.2 : 1) * (E[i].x1 - E[i].x0); if (r <= 0) return i }
    return tope
  }
  const nacer = () => gente.push({ e: -1, x: -8, v: 28 + rnd() * 24, meta: metaDe(), salto: 0, y0: 0, dir: 1, a: 1, vida: 0, giro: rnd() * 6 })
  const yDe = (i) => (i < 0 ? PISO : E[i].y)
  let acum = 0
  const paso = pasos(div, ctx, 1)
  const simular = (dt) => {
    acum += dt * 1.7
    while (acum > 1) { nacer(); acum -= 1 }
    for (const q of gente) {
      q.vida += dt; q.giro += dt
      if (q.salto > 0) { q.salto = Math.max(0, q.salto - dt * 2.6); continue }
      if (q.meta < 0) { q.x += q.v * dt; if (q.x > XA - 30) q.a -= dt; continue }
      if (q.e === -1) { q.x += q.v * dt; if (q.x >= E[0].x0 + 6) { q.y0 = PISO; q.e = 0; q.salto = 1 } continue }
      const r = E[q.e]
      if (q.e < q.meta) { q.x += q.v * dt; if (q.x >= r.x1 - 4) { q.y0 = r.y; q.e += 1; q.salto = 1; q.x = E[q.e].x0 + 8 } }
      else {
        q.x += q.v * .35 * q.dir * dt
        if (q.x > r.x1 - 26) q.dir = -1; if (q.x < r.x0 + 26) q.dir = 1
        if (q.vida > 24) q.a -= dt * .25
      }
    }
    for (let i = gente.length - 1; i >= 0; i--) if (gente[i].a <= 0) gente.splice(i, 1)
  }
  const pintar = () => {
    g.clearRect(0, 0, W, H)
    if (paso() < 1) return
    for (const q of gente) {
      let y = yDe(q.e) - 6
      if (q.salto > 0) { const s = suave(1 - q.salto), yA = q.y0 - 6; y = yA + (y - yA) * s - Math.sin(s * Math.PI) * 26 }
      const col = q.e < 0 ? p.mudo : E[q.e].frente ? p.oroluz : p.morluz
      figura(g, motivo, q.x, y, 3.6, col, sujeta(q.a), p.claro, q.giro)
    }
  }
  for (let k = 0; k < 40 * 30; k++) simular(1 / 30)             // arranque en caliente: el póster ya trae gente en su escalón
  const reloj = bucle(ctx, (t, dt) => {
    if (t >= 0 && typeof ctx.quieto !== 'number') simular(dt)
    pintar()
    const lat = t < 0 ? .5 : .5 + .5 * Math.sin(t * 2)
    if (huellas[iF]) huellas[iF].setAttribute('fill-opacity', (.75 + lat * .25).toFixed(2))
  })
  return api(div, reloj, { tema: () => { p = paleta(div) } })
}
