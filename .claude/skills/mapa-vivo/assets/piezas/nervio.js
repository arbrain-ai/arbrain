/*
 * Pieza · El sistema nervioso del negocio (capítulo «El sistema nervioso»).
 * Mecanismo: el negocio PIENSA (el timonel: meta menos realidad, y de ahí el empuje), SIENTE (cuatro órganos, cada uno
 * con su pregunta y su número) y SE MUEVE (la gente entra y cruza las seis etapas). La información sube; las
 * correcciones bajan. En el cuello casi todo se escapa: ahí se empuja.
 * Datos: sistema.etapas[6], sistema.cuello, sistema.organos, sistema.timonel, sistema.lazo, sistema.unidad.
 * Lo que no opera hoy y lo que está «por medir» se dibuja punteado y lo dice; nunca se pinta como dato.
 */
import { marco, bucle, api, svgEl, svgTexto, lienzo, paleta, sujeta, e, sello, estadoDe, pasos, corto, muestra, semilla, figura, botones } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 700
const X0 = 250, DX = 196
const X = [0, 1, 2, 3, 4, 5].map((i) => X0 + 76 + i * DX)        // el centro de cada etapa
const YN = 452                                                    // el nervio
const YT = [16, 138], YO = [182, 346]                             // timonel y órganos (arriba, abajo)
const XF = X[5] + 96, XI = X0 - 26
const ORGANOS = [
  { nombre: 'Marketing', pregunta: '¿llega gente?', etapas: ['Adquisición', 'Nutrición'] },
  { nombre: 'Venta', pregunta: '¿compra?', etapas: ['Conversión'] },
  { nombre: 'Entrega', pregunta: '¿queda bien servida?', etapas: ['Bienvenida', 'Entrega'] },
  { nombre: 'Finanzas', pregunta: '¿queda dinero?', etapas: ['Expansión'] },
]

const CSS = `
.ner .banda{position:absolute;left:0;width:200px;font:900 27px/1 var(--sans);letter-spacing:.06em;color:var(--mortinta)}
.ner .banda small{display:block;font:italic 600 16px/1.2 var(--serif);letter-spacing:0;color:var(--mudo);margin-top:7px;text-transform:none}
.ner .banda.mueve{color:var(--titulo)}
.ner .timon{position:absolute;left:${X0 + 180}px;top:${YT[0]}px;width:${DX * 6 - 360}px;height:${YT[1] - YT[0]}px;border:2px solid var(--mor);border-radius:16px;
 background:var(--morhondo);display:grid;grid-template-columns:1fr 26px 1fr 26px 1.25fr;align-items:center;padding:12px 20px 12px;gap:8px}
.ner .timon .tt{position:absolute;left:20px;top:-11px;background:var(--hondo);padding:0 10px;font:800 12px/1.6 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mortinta);border-radius:8px}
.ner .timon .c{border:1.5px solid var(--linea2);border-radius:12px;padding:9px 14px;background:var(--papel);min-height:82px;display:flex;flex-direction:column;justify-content:center}
.ner .timon .c .k{font:800 11px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--mudo)}
.ner .timon .c .v{font:700 25px/1.08 var(--serif);color:var(--titulo);margin-top:7px;font-variant-numeric:tabular-nums}
.ner .timon .c.emp{border:2px dashed var(--oro);background:var(--papel)}
.ner .timon .c.emp .k{color:var(--orotinta)} .ner .timon .c.emp .v{font-size:22px}
.ner .timon .op{font:700 28px/1 var(--serif);color:var(--mudo);text-align:center}
.ner .org{position:absolute;top:${YO[0]}px;height:${YO[1] - YO[0]}px;border:2px solid var(--mor);border-radius:14px;background:var(--papel);padding:11px 15px;overflow:hidden}
.ner .org .n{font:800 15px/1 var(--sans);color:var(--titulo);display:flex;align-items:center;gap:8px}
.ner .org .n i{width:11px;height:11px;border-radius:6px;background:var(--mor);flex:none}
.ner .org .q{font:italic 600 18px/1.1 var(--serif);color:var(--mortinta);margin:5px 0 7px}
.ner .org .m{font:600 12.5px/1.3 var(--sans);color:var(--cuerpo);min-height:32px}
.ner .org .v{font:800 19px/1.1 var(--sans);color:var(--titulo);font-variant-numeric:tabular-nums;margin:3px 0 6px}
.ner .org.sin{border-style:dashed;border-color:var(--linea2)}
.ner .org.sin .v{font:italic 600 17px/1.1 var(--serif);color:var(--mudo)}
.ner .et{position:absolute;top:${YN + 44}px;width:${DX - 12}px;margin-left:${-(DX - 12) / 2}px;text-align:center}
.ner .et .n{font:800 12.5px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--titulo)}
.ner .et .q{font:600 13.5px/1.32 var(--sans);color:var(--cuerpo);margin-top:8px;min-height:72px}
.ner .et .w{font:italic 600 15px/1.1 var(--serif);color:var(--mudo);margin-top:6px}
.ner .et .h{margin:8px auto 0;display:inline-flex;align-items:center;gap:6px;font:800 11px/1 var(--sans);letter-spacing:.08em;color:var(--orotinta);
 padding:4px 9px;border-radius:9px;background:repeating-linear-gradient(135deg,var(--orohondo) 0 5px,transparent 5px 9px);border:1px solid color-mix(in srgb,var(--oro) 45%,transparent)}
.ner .et.cuello .n{color:var(--rojo)}
.ner .et.apagada .n{color:var(--rojo)}
.ner .et.apagada .q{color:var(--mudo)}
.ner .et.apagada .sello{color:var(--rojo)}
.ner .ley{position:absolute;left:${XF + 40}px;top:${YO[0] + 4}px;display:flex;flex-direction:column;gap:10px;font:600 13px var(--sans);color:var(--cuerpo)}
.ner .ley span{display:flex;align-items:center;gap:10px}
.ner .ley i{display:inline-block;width:11px;height:11px;border-radius:6px;flex:none}
.ner .ir{position:absolute;left:${XF + 40}px;top:${YT[0] + 4}px}
.ner .ir .botones{flex-direction:column;align-items:flex-start}
.ner .cu{position:absolute;width:300px;text-align:left}
.ner .cu .k{font:800 12px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--rojo)}
.ner .cu .v{font:700 24px/1.05 var(--serif);color:var(--titulo);margin-top:5px}
.ner .lz{position:absolute;left:${X[0]}px;width:${X[5] - X[0]}px;top:${H - 44}px;text-align:center}
.ner .lz .k{font:800 11.5px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--orotinta)}
.ner .lz .t{font:italic 600 17px/1.2 var(--serif);color:var(--titulo);margin-top:5px}
`

export default function montar(raiz, ctx, D) {
  const S = D.sistema || {}
  const etapas = (S.etapas || []).slice(0, 6)
  while (etapas.length < 6) etapas.push({ etapa: ['Adquisición', 'Nutrición', 'Conversión', 'Bienvenida', 'Entrega', 'Expansión'][etapas.length], opera_hoy: false, que_pasa: 'sin dato' })
  const iDe = (nombre) => etapas.findIndex((x) => x.etapa === nombre)
  const CU = S.cuello && iDe(S.cuello.etapa) >= 0 ? iDe(S.cuello.etapa) : -1
  const organos = (S.organos && S.organos.length ? S.organos : ORGANOS).slice(0, 4)
  const T = S.timonel || {}
  const motivo = (D.marca || {}).motivo || 'punto'
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'ner', css: CSS, marca: D.marca })
  const svg = svgEl('svg', { width: W, height: H }, div)
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0 })
  const ola = (x) => YN + Math.sin((x - XI) / 118) * 7

  // ── las tres bandas ──
  const banda = (y, palabra, glosa, clase, desde) => {
    const d = document.createElement('div'); d.className = `banda ${clase}`; d.style.top = `${y}px`; d.dataset.desde = desde
    d.innerHTML = `${e(palabra)}<small>${e(glosa)}</small>`; div.appendChild(d)
  }
  banda(YT[0] + 30, 'PIENSA', 'compara la meta con hoy', '', 3)
  banda(YO[0] + 34, 'SIENTE', 'cada órgano, su número', '', 2)
  banda(YN - 20, 'SE MUEVE', `${S.unidad ? `las ${S.unidad}` : 'la gente'} entran y avanzan`, 'mueve', 0)

  // ── SE MUEVE: el nervio, el lazo y los ganglios ──
  // el nervio se INTERRUMPE donde una etapa no existe hoy: el hueco se ve, no se rotula nada más
  const tramo = (xa, xb) => { let d = `M${xa} ${ola(xa).toFixed(1)}`; for (let x = xa + 6; x < xb; x += 6) d += ` L${x} ${ola(x).toFixed(1)}`; return d + ` L${xb} ${ola(xb).toFixed(1)}` }
  const huecos = X.filter((_, i) => etapas[i].opera_hoy === false).map((x) => [x - 64, x + 64])
  // …y ADELGAZA después del cuello, a escala de lo que sí pasa (si se van 23 de 35, queda un tercio del grosor)
  const pasa = CU >= 0 ? 1 - sujeta(Number(S.cuello.fuga ?? .66), .2, .92) : 1
  const grueso = (a, b) => {
    const k = CU >= 0 && a >= X[CU] ? pasa : 1
    svgEl('path', { d: tramo(a, b), fill: 'none', stroke: 'var(--mor)', 'stroke-opacity': .2, 'stroke-width': (14 * k).toFixed(1), 'stroke-linecap': 'round' }, svg)
    svgEl('path', { d: tramo(a, b), fill: 'none', stroke: 'var(--mor)', 'stroke-width': Math.max(1.6, 5 * k).toFixed(1), 'stroke-linecap': 'round' }, svg)
  }
  let xa = XI
  for (const [h0, h1] of [...huecos, [XF, XF]]) {
    if (h0 > xa) {
      if (CU >= 0 && xa < X[CU] && h0 > X[CU]) { grueso(xa, X[CU]); grueso(X[CU], h0) } else grueso(xa, h0)
    }
    if (h1 > h0) svgEl('path', { d: tramo(h0, h1), fill: 'none', stroke: 'var(--rojo)', 'stroke-opacity': .75, 'stroke-width': 2, 'stroke-dasharray': '3 7', 'stroke-linecap': 'round' }, svg)
    xa = h1
  }
  svgTexto(svg, XI, YN - 26, S.entrada || 'de afuera →', { style: 'font:800 11px var(--sans);letter-spacing:.2em;text-transform:uppercase', fill: 'var(--mudo)' })
  const lz = S.lazo || null
  const YL = H - 56
  const dL = `M${XF} ${ola(XF).toFixed(1)} C ${XF + 44} ${ola(XF).toFixed(1)}, ${XF + 44} ${YL}, ${XF - 30} ${YL} L ${XI + 44} ${YL} C ${XI - 14} ${YL}, ${XI - 14} ${YN + 60}, ${XI + 2} ${(ola(XI) + 12).toFixed(1)}`
  if (lz) svgEl('path', { d: dL, fill: 'none', stroke: 'var(--oro)', 'stroke-opacity': .8, 'stroke-width': 2.2, 'stroke-dasharray': estadoDe(lz.estado) === 'opera' || estadoDe(lz.estado) === 'firmado' ? '' : '2 9', 'stroke-linecap': 'round', 'data-desde': 1 }, svg)
  const lazo = svgEl('path', { d: dL, fill: 'none', stroke: 'none' }, svg)
  const gang = X.map((x, i) => {
    const y = ola(x), cu = i === CU, vivo = etapas[i].opera_hoy !== false
    const g = svgEl('g', { transform: `translate(${x} ${y.toFixed(1)})` }, svg)
    const aura = svgEl('circle', { r: cu ? 38 : 26, fill: cu ? 'var(--oro)' : 'var(--mor)', 'fill-opacity': vivo ? .12 : .04 }, g)
    svgEl('circle', { r: vivo ? 19 : 23, fill: 'var(--hondo)', stroke: cu ? 'var(--oro)' : vivo ? 'var(--mor)' : 'var(--rojo)', 'stroke-width': cu ? 4 : 2.8, 'stroke-dasharray': vivo ? '' : '5 6' }, g)
    const nuc = svgEl('circle', { r: 9, fill: cu ? 'var(--oro)' : 'var(--mor)', 'fill-opacity': vivo ? 1 : 0 }, g)
    if (!vivo) svgEl('path', { d: 'M-8 -8 L8 8 M8 -8 L-8 8', stroke: 'var(--rojo)', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g)
    if (cu) svgEl('circle', { r: 29, fill: 'none', stroke: 'var(--rojo)', 'stroke-width': 2.4, 'stroke-dasharray': '4 5', 'data-desde': 1 }, g)
    return { aura, nuc, vivo }
  })
  etapas.forEach((et, i) => {
    const d = document.createElement('div')
    d.className = `et ${i === CU ? 'cuello' : ''} ${et.opera_hoy === false ? 'apagada' : ''}`; d.style.left = `${X[i]}px`
    const quien = (et.quien || []).join(' · ')
    const horas = et.a_mano && et.a_mano.horas_mes ? `<div class="h">${e(et.a_mano.horas_mes)} h al mes a mano</div>` : ''
    d.innerHTML = `<div class="n">${i + 1} · ${e(et.etapa)}</div><div class="q">${e(corto(et.que_pasa || et.nombre || '', 92))}</div>
      ${et.opera_hoy === false ? sello('pendiente', 'no existe hoy') : quien ? `<div class="w">${e(quien)}</div>` : ''}${horas}`
    div.appendChild(d)
  })
  if (CU >= 0) {
    const c = S.cuello, d = document.createElement('div'); d.className = 'cu'; d.dataset.desde = 1
    d.style.left = `${X[CU] + 50}px`; d.style.top = `${YN - 100}px`
    d.innerHTML = `<div class="k">El cuello · se van</div><div class="v">${e(c.se_van || 'casi todas')}</div>`
    div.appendChild(d)
  }
  if (lz) {
    const d = document.createElement('div'); d.className = 'lz'; d.dataset.desde = 1
    d.innerHTML = `<div class="t">${e(corto(lz.texto, 90))} &nbsp;${sello(lz.estado, lz.sello)}</div>`
    div.appendChild(d)
  }

  // ── SIENTE: los órganos, cada uno sobre sus etapas, con su número ──
  const dendritas = [], subidas = []
  const cajas = organos.map((o) => {
    const idx = (o.etapas || []).map(iDe).filter((i) => i >= 0)
    const a = idx.length ? Math.min(...idx) : 0, b = idx.length ? Math.max(...idx) : 0
    return { o, idx, x: X[a] - DX / 2 + 8, w: (b - a + 1) * DX - 16 }
  })
  cajas.forEach(({ o, idx, x, w }) => {
    const num = o.numero || (idx.map((i) => etapas[i].numero).find((q) => q && q.valor != null) || idx.map((i) => etapas[i].numero).find(Boolean)) || {}
    const hay = num.valor != null && num.valor !== ''
    const d = document.createElement('div'); d.className = `org ${hay ? '' : 'sin'}`; d.dataset.desde = 2
    d.style.left = `${x}px`; d.style.width = `${w}px`
    d.innerHTML = `<div class="n"><i></i>${e(o.nombre)}</div><div class="q">${e(o.pregunta || '')}</div>
      <div class="m">${e(corto(num.nombre || 'su número', 44))}</div>
      <div class="v">${hay ? e(num.valor) : 'por medir'}</div>
      ${hay ? sello('firmado', num.medido_en ? `medido ${num.medido_en}` : 'medido') : sello('pendiente', 'por medir')}`
    div.appendChild(d)
    const xm = x + w / 2
    for (const i of idx) {
      const dd = `M${X[i]} ${(ola(X[i]) - 24).toFixed(1)} C ${X[i]} ${YN - 70}, ${xm} ${YO[1] + 54}, ${xm} ${YO[1] + 2}`
      svgEl('path', { d: dd, fill: 'none', stroke: 'var(--mor)', 'stroke-opacity': .4, 'stroke-width': 1.8, 'data-desde': 2 }, svg)
      dendritas.push(svgEl('path', { d: dd, fill: 'none', stroke: 'none' }, svg))
    }
    const xt = sujeta(xm, X0 + 220, X0 + DX * 6 - 220)
    const du = `M${xm} ${YO[0] - 2} C ${xm} ${YO[0] - 26}, ${xt} ${YT[1] + 28}, ${xt} ${YT[1] + 2}`
    svgEl('path', { d: du, fill: 'none', stroke: 'var(--mor)', 'stroke-opacity': .4, 'stroke-width': 1.8, 'data-desde': 3 }, svg)
    subidas.push(svgEl('path', { d: du, fill: 'none', stroke: 'none' }, svg))
  })

  // ── PIENSA: el timonel y la corrección que baja al cuello ──
  const timon = document.createElement('div'); timon.className = 'timon'; timon.dataset.desde = 3
  timon.innerHTML = `<div class="tt">El timonel</div>
    <div class="c"><div class="k">La meta</div><div class="v">${e(T.meta || 'sin dato')}</div></div><div class="op">−</div>
    <div class="c"><div class="k">Hoy</div><div class="v">${e(T.hoy || 'por medir')}</div></div><div class="op">=</div>
    <div class="c emp"><div class="k">El empuje</div><div class="v">${e(corto(T.empuje || 'por decidir', 46))}</div></div>`
  div.appendChild(timon)
  const xe = X0 + DX * 6 - 180 - 130, xc = CU >= 0 ? X[CU] : X[2]
  const xg = xc - DX / 2, yc = ola(xc) - 30
  const dC = `M${xe} ${YT[1] + 2} C ${xe} ${YT[1] + 40}, ${xg} ${YO[0] - 50}, ${xg} ${YO[0]} L ${xg} ${YO[1] + 10} C ${xg} ${YN - 62}, ${xc - 40} ${YN - 66}, ${xc - 16} ${yc.toFixed(1)}`
  svgEl('path', { d: dC, fill: 'none', stroke: 'var(--oro)', 'stroke-width': 2.6, 'stroke-dasharray': '9 7', 'stroke-linecap': 'round', 'data-desde': 3 }, svg)
  svgEl('path', { d: `M${xc - 30} ${(yc - 2).toFixed(1)} L${xc - 15} ${(yc + 1).toFixed(1)} L${xc - 19} ${(yc - 14).toFixed(1)}`, fill: 'none', stroke: 'var(--oro)', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-desde': 3 }, svg)
  const correccion = svgEl('path', { d: dC, fill: 'none', stroke: 'none' }, svg)

  // leyenda y botones
  const ley = document.createElement('div'); ley.className = 'ley'
  ley.innerHTML = `<span data-desde="2"><i style="background:var(--morluz)"></i>la información sube</span><span data-desde="3"><i style="background:var(--oro)"></i>la corrección baja</span><span data-desde="1"><i style="background:var(--mudo)"></i>se van en el cuello</span>`
  div.appendChild(ley)
  if ((S.botones || []).length) { const ir = document.createElement('div'); ir.className = 'ir'; ir.appendChild(botones(ctx, S.botones)); div.appendChild(ir) }

  // ── impulsos (canvas) ──
  const { g } = lienzo(div, W, H, 2)
  let p = paleta(div)
  const ptsD = dendritas.map((d) => muestra(d, 60)), ptsU = subidas.map((d) => muestra(d, 40)), ptsL = muestra(lazo, 240), ptsC = muestra(correccion, 160)
  const rnd = semilla(23)
  const gente = [], chispas = []
  const fugaP = CU >= 0 ? sujeta(Number(S.cuello.fuga ?? .66), .2, .92) : 0
  const nacer = () => gente.push({ x: XI, v: 62 + rnd() * 44, off: (rnd() - .5) * 9, fuga: rnd() < fugaP, f: 0, yv: 0, xv: 0, y: 0, a: 1, s: 0, lazo: rnd() < .35, giro: rnd() * 6 })
  let acG = 0, acS = 0, acC = 0
  const paso = pasos(div, ctx, 3)
  const simular = (dt) => {
    acG += dt * 5.5; while (acG > 1) { nacer(); acG -= 1 }
    if (ptsD.length) { acS += dt * 2; while (acS > 1) { chispas.push({ t: 'd', d: Math.floor(rnd() * ptsD.length), s: 0, v: .7 }); if (ptsU.length && rnd() < .5) chispas.push({ t: 'u', d: Math.floor(rnd() * ptsU.length), s: 0, v: .9 }); acS -= 1 } }
    acC += dt * .34; while (acC > 1) { chispas.push({ t: 'c', d: 0, s: 0, v: .3 }); acC -= 1 }
    for (const q of gente) {
      q.giro += dt * 1.4
      if (q.f === 0) {
        const lento = CU >= 0 && q.x > X[CU] - 70 && q.x < X[CU]
        q.x += q.v * dt * (lento ? .45 : 1)
        if (CU >= 0 && q.fuga && q.x > X[CU] - 4) { q.f = 1; q.y = ola(q.x) + q.off; q.xv = 16 + rnd() * 44; q.yv = -(46 + rnd() * 50) }
        if (q.x >= XF) q.f = lz && q.lazo ? 2 : 3
      } else if (q.f === 1) { q.x += q.xv * dt; q.y += q.yv * dt; q.yv *= 1 - dt * .6; q.a -= dt * .62 }
      else if (q.f === 2) { q.s += dt * .13; if (q.s >= 1) q.a = 0 }
      else q.a -= dt * 1.5
    }
    for (let i = gente.length - 1; i >= 0; i--) if (gente[i].a <= 0) gente.splice(i, 1)
    for (const c of chispas) c.s += dt * c.v
    for (let i = chispas.length - 1; i >= 0; i--) if (chispas[i].s > 1) chispas.splice(i, 1)
  }
  const en = (pts, s) => pts[Math.max(0, Math.min(pts.length - 1, Math.floor(s * (pts.length - 1))))]
  const pintar = () => {
    g.clearRect(0, 0, W, H)
    const n = paso()
    for (const q of gente) {
      if (q.f === 0) figura(g, motivo, q.x, ola(q.x) + q.off * (CU >= 0 && q.x > X[CU] ? .4 : 1), 3.4, CU >= 0 && q.x > X[CU] ? p.oroluz : p.morluz, 1, p.claro, q.giro)
      else if (q.f === 1) { if (n >= 1) figura(g, motivo, q.x, q.y, 3, p.mudo, sujeta(q.a) * .9, p.claro, q.giro) }
      else if (q.f === 2) { if (n >= 1) { const c = en(ptsL, q.s); figura(g, motivo, c[0], c[1], 3.6, p.oro, 1, p.claro, q.giro) } }
      else figura(g, motivo, XF, ola(XF), 3.2, p.oroluz, sujeta(q.a), p.claro, q.giro)
    }
    for (const c of chispas) {
      if (c.t === 'd' && n >= 2) { const q = en(ptsD[c.d], c.s); figura(g, 'punto', q[0], q[1], 2.6, p.morluz, .95, p.claro) }
      else if (c.t === 'u' && n >= 3) { const q = en(ptsU[c.d], c.s); figura(g, 'punto', q[0], q[1], 2.6, p.morluz, .95, p.claro) }
      else if (c.t === 'c' && n >= 3) { const q = en(ptsC, c.s); figura(g, 'punto', q[0], q[1], 4.4, p.oro, 1, p.claro) }
    }
  }
  for (let k = 0; k < 16 * 30; k++) simular(1 / 30)             // arranque en caliente: el póster ya trae el flujo
  const reloj = bucle(ctx, (t, dt) => {
    if (t >= 0 && typeof ctx.quieto !== 'number') simular(dt)
    pintar()
    const lat = t < 0 ? .6 : .5 + .5 * Math.sin(t * 2.4)
    gang.forEach(({ aura, nuc, vivo }, i) => {
      if (!vivo) return
      const pul = t < 0 ? .5 : .5 + .5 * Math.sin(t * 3 - i * .9)
      nuc.setAttribute('r', (8 + pul * 3.2).toFixed(1))
      if (i === CU) aura.setAttribute('fill-opacity', (.1 + lat * .18).toFixed(3))
    })
  })
  return api(div, reloj, { tema: () => { p = paleta(div) } })
}
