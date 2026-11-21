/*
 * Pieza · Las ondas del porqué (capítulo «El norte»).
 * Mecanismo: de la luz del porqué salen ondas que encienden sistemas cada vez más grandes (la persona, su negocio, su
 * equipo, sus clientes, su comunidad). Cada sistema es un círculo mayor que el anterior; al final, la meta: la siguiente
 * isla. Debajo, la tierra: lo que no se negocia.
 * Datos: norte.luz, norte.ondas[{nombre, glosa}], norte.tierra, norte.meta{a, unidad, plazo, estado}.
 */
import { marco, bucle, api, svgEl, svgTexto, lienzo, paleta, sujeta, e, sello, estadoDe, trazoDe, pasos, corto } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 330
const SOL = { x: 118, y: 150 }
const SUELO = 268

const CSS = `
.ond .luz{position:absolute;left:0;top:226px;width:236px;text-align:center}
.ond .luz .k{font:800 12px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--orotinta)}
.ond .est{position:absolute;top:22px;width:230px;margin-left:-115px;text-align:center}
.ond .est .n{font:800 13px/1.15 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--titulo)}
.ond .est .g{font:italic 600 17px/1.15 var(--serif);color:var(--mudo);margin-top:5px}
.ond .isla{position:absolute;top:14px;width:224px;text-align:left}
.ond .isla .k{font:800 12px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--orotinta)}
.ond .isla .a{font:700 44px/1 var(--serif);color:var(--titulo);margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ond .isla .a.larga{font:italic 600 21px/1.15 var(--serif);letter-spacing:0}
.ond .isla .u{font:600 15px/1.25 var(--sans);color:var(--cuerpo);margin:4px 0 8px}
.ond .isla .esc{margin-top:13px}
.ond .isla .esc .b{position:relative;height:12px;border-radius:6px;border:1.5px dashed var(--oro);background:var(--orohondo);overflow:hidden}
.ond .isla .esc .b i{position:absolute;left:0;top:0;bottom:0;background:var(--oro);border-radius:5px 0 0 5px}
.ond .isla .esc .r{display:flex;justify-content:space-between;font:700 12px/1 var(--sans);color:var(--cuerpo);margin-top:6px;font-variant-numeric:tabular-nums}
.ond .isla .esc .r em{font:italic 600 15px/1 var(--serif);color:var(--orotinta)}
.ond .tierra{position:absolute;left:236px;top:${SUELO + 14}px;width:1100px;display:flex;gap:14px;align-items:baseline}
.ond .tierra .k{font:800 12px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mudo);flex:none}
.ond .tierra .t{font:italic 600 19px/1.2 var(--serif);color:var(--cuerpo)}
`

export default function montar(raiz, ctx, D) {
  const N = D.norte || {}
  const ondas = (N.ondas || []).slice(0, 6).map((o) => (typeof o === 'string' ? { nombre: o } : o))
  const meta = N.meta || {}
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'ond', css: CSS, marca: D.marca })
  const svg = svgEl('svg', { width: W, height: H }, div)
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0 })

  // la luz del porqué
  const defs = svgEl('defs', {}, svg)
  const rg = svgEl('radialGradient', { id: 'ond-sol' }, defs)
  svgEl('stop', { offset: 0, 'stop-color': 'var(--oro)', 'stop-opacity': .95 }, rg)
  svgEl('stop', { offset: .32, 'stop-color': 'var(--oro)', 'stop-opacity': .5 }, rg)
  svgEl('stop', { offset: 1, 'stop-color': 'var(--oro)', 'stop-opacity': 0 }, rg)
  const halo = svgEl('circle', { cx: SOL.x, cy: SOL.y, r: 92, fill: 'url(#ond-sol)' }, svg)
  svgEl('circle', { cx: SOL.x, cy: SOL.y, r: 24, fill: 'var(--oro)' }, svg)
  svgTexto(svg, SOL.x, SOL.y + 9, '∞', { 'text-anchor': 'middle', fill: '#1a1205', style: 'font:700 30px var(--serif)' })

  // el eje y las estaciones: cada sistema, un círculo mayor
  const n = Math.max(1, ondas.length)
  const x0 = 320, x1 = 1170
  const X = ondas.map((_, i) => (n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1)))
  const R = ondas.map((_, i) => 13 + i * (n > 1 ? 21 / (n - 1) : 0))
  svgEl('line', { x1: SOL.x + 30, y1: SOL.y, x2: 1310, y2: SOL.y, stroke: 'var(--oro)', 'stroke-opacity': .4, 'stroke-width': 1.5 }, svg)
  const est = ondas.map((o, i) => {
    const g = svgEl('g', { transform: `translate(${X[i]} ${SOL.y})`, 'data-desde': Math.min(1, i) }, svg)
    svgEl('line', { x1: 0, y1: -R[i] - 6, x2: 0, y2: -68, stroke: 'var(--linea2)', 'stroke-width': 1.2 }, g)
    const aura = svgEl('circle', { r: R[i] + 12, fill: 'var(--oro)', 'fill-opacity': .1 }, g)
    svgEl('circle', { r: R[i], fill: 'var(--hondo)', stroke: 'var(--oro)', 'stroke-width': 2.5 }, g)
    const nuc = svgEl('circle', { r: Math.max(4, R[i] * .38), fill: i % 2 ? 'var(--mor)' : 'var(--oro)' }, g)
    const d = document.createElement('div'); d.className = 'est'; d.style.left = `${X[i]}px`; d.dataset.desde = Math.min(1, i)
    d.innerHTML = `<div class="n">${e(o.nombre)}</div>${o.glosa ? `<div class="g">${e(corto(o.glosa, 44))}</div>` : ''}`
    div.appendChild(d)
    return { aura, nuc, x: X[i], r: R[i] }
  })
  // la siguiente isla: la meta
  const xi = 1322
  const isla = svgEl('g', { transform: `translate(${xi} ${SOL.y})`, 'data-desde': 2 }, svg)
  svgEl('circle', { r: 30, fill: 'var(--orohondo)', stroke: 'var(--oro)', 'stroke-width': 2.5, 'stroke-dasharray': trazoDe(meta.estado) }, isla)
  svgEl('path', { d: 'M-7 12 L-7 -14 L11 -7 L-7 0', fill: 'var(--oro)', stroke: 'var(--oro)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, isla)
  // lo que falta, a escala: la barra llena es hoy; el tramo punteado, la distancia a la meta
  const num = (s) => parseFloat(String(s ?? '').replace(/[^0-9.]/g, ''))
  const de = num(meta.de), a = num(meta.a)
  const escala = de > 0 && a > de ? `<div class="esc"><div class="b"><i style="width:${(100 * de / a).toFixed(1)}%"></i></div>
    <div class="r"><span>hoy ${e(meta.de)}</span><em>faltan ${e((a - de).toLocaleString('en-US'))}</em></div></div>` : ''
  const di = document.createElement('div'); di.className = 'isla'; di.style.left = `${xi + 44}px`; di.dataset.desde = 2
  di.innerHTML = `<div class="k">${e(meta.rotulo || 'La siguiente isla')}</div>${meta.a ? `<div class="a">${e(meta.a)}</div>` : `<div class="a larga">${e(corto(meta.texto || 'por definir', 70))}</div>`}
    <div class="u">${e([meta.unidad, meta.plazo ? `en ${meta.plazo}` : ''].filter(Boolean).join(' · '))}</div>${sello(meta.estado, meta.sello)}${escala}`
  div.appendChild(di)

  // la tierra
  svgEl('line', { x1: 24, y1: SUELO, x2: W - 24, y2: SUELO, stroke: 'var(--linea2)', 'stroke-width': 1.5 }, svg)
  const luz = document.createElement('div'); luz.className = 'luz'
  luz.innerHTML = `<div class="k">${e(N.luz || 'El porqué')}</div>`
  div.appendChild(luz)
  if (N.tierra) {
    const t = document.createElement('div'); t.className = 'tierra'
    t.innerHTML = `<span class="k">La tierra</span><span class="t">${e(corto(N.tierra, 150))}</span>`
    div.appendChild(t)
  }

  // ── las ondas (canvas): frentes que salen de la luz y encienden cada sistema al pasar ──
  const { g } = lienzo(div, W, H, 2)
  let p = paleta(div)
  const VEL = 150, CADA = 2.6, ALCANCE = 1320
  const paso = pasos(div, ctx, 2)
  const pintar = (t) => {
    g.clearRect(0, 0, W, H)
    const reposo = t < 0
    const tt = reposo ? 7.7 : t
    const frentes = []
    for (let k = 0; k < 6; k++) {
      const r = ((tt + k * CADA) % (CADA * 6)) * VEL
      if (r > 40 && r < ALCANCE) frentes.push(r)
    }
    g.save(); g.beginPath(); g.rect(0, 0, W, SUELO - 2); g.clip()
    for (const r of frentes) {
      const a = sujeta(1 - r / ALCANCE) * (p.claro ? .5 : .42)
      g.strokeStyle = p.oro; g.globalAlpha = a; g.lineWidth = 2
      g.beginPath(); g.arc(SOL.x, SOL.y, r, -.5, .5); g.stroke()
    }
    g.restore(); g.globalAlpha = 1
    const lat = reposo ? .6 : .5 + .5 * Math.sin(tt * 1.6)
    halo.setAttribute('r', (86 + lat * 12).toFixed(1))
    est.forEach((s, i) => {
      const d = s.x - SOL.x
      const toca = frentes.reduce((m, r) => Math.max(m, sujeta(1 - Math.abs(r - d) / 70)), 0)
      const k = reposo ? .55 : toca
      s.aura.setAttribute('fill-opacity', (.08 + k * .3).toFixed(3))
      s.aura.setAttribute('r', (s.r + 10 + k * 10).toFixed(1))
      s.nuc.setAttribute('r', (Math.max(4, s.r * .38) + k * 2.5).toFixed(1))
    })
  }
  const reloj = bucle(ctx, (t) => { if (paso() >= 1 || t < 0) pintar(t); else g.clearRect(0, 0, W, H) })
  return api(div, reloj, { tema: () => { p = paleta(div) } })
}
