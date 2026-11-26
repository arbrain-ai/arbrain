/*
 * Pieza · Los hilos del vehículo (capítulo «El vehículo»).
 * Mecanismo: el vehículo es lo que lleva al negocio de hoy a su meta, paso por paso. Cada paso lleva un hilo de oro a
 * lo que arregla o llena (una etapa del sistema, una pieza de la oferta): los hilos se cruzan porque el orden en que se
 * arregla no es el orden en que el cliente lo vive. Abajo, lo que cuesta no hacerlo y a dónde se llega.
 * Datos: vehiculo.pasos[{nombre, detalle, estado, quita, recupera, hilos[]}], vehiculo.destinos{titulo, lista[]},
 * vehiculo.costo{mes, noventa, anio, nota}, vehiculo.llegada, vehiculo.rotulos.
 */
import { marco, bucle, api, svgEl, lienzo, paleta, e, sello, estadoDe, trazoDe, pasos, corto, muestra, figura } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 700
const XP = [20, 610], XD = [1010, 1580], Y0 = 46, Y1 = 566

const CSS = `
.hil .cab{position:absolute;top:6px;font:800 13px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--orotinta)}
.hil .cab i{font:italic 600 17px/1 var(--serif);letter-spacing:0;text-transform:none;color:var(--mudo);margin-left:10px}
.hil .ps{position:absolute;left:${XP[0]}px;width:${XP[1] - XP[0]}px;display:flex;gap:16px;align-items:flex-start}
.hil .ps .num{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;flex:none;font:700 22px/1 var(--serif);background:var(--oro);color:#1a1205;margin-top:2px}
.hil .ps.pendiente .num,.hil .ps.idea .num{background:transparent;border:2px dashed var(--tenue);color:var(--mudo)}
.hil .ps.abierto .num{background:var(--orohondo);border:2px dashed var(--oro);color:var(--orotinta)}
.hil .ps .n{font:700 20px/1.14 var(--sans);color:var(--titulo);letter-spacing:-.005em}
.hil .ps .d{font:600 13.5px/1.34 var(--sans);color:var(--cuerpo);margin-top:4px}
.hil .ps .f{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-top:7px}
.hil .ps .g{font:italic 600 16.5px/1 var(--serif);color:var(--orotinta)}
.hil .hoja{position:absolute;left:${XD[0]}px;top:${Y0 - 8}px;width:${XD[1] - XD[0]}px;height:${Y1 - Y0 + 16}px;border-radius:16px;border:1.8px solid color-mix(in srgb,var(--oro) 55%,transparent);background:var(--orohondo)}
.hil .hoja .tt{position:absolute;left:22px;top:14px;right:22px;font:800 13px/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--titulo);padding-bottom:10px;border-bottom:1.5px solid var(--linea2)}
.hil .ds{position:absolute;left:${XD[0] + 22}px;width:${XD[1] - XD[0] - 44}px;border-radius:9px;background:color-mix(in srgb,var(--oro) 14%,transparent);padding:0 14px;display:flex;align-items:center;gap:12px;transition:background-color .5s ease,box-shadow .5s ease}
.hil .ds .v{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:color-mix(in srgb,var(--oro) 30%,transparent);z-index:0}
.hil .ds>span{position:relative;z-index:1}
.hil .ds.medida{background:color-mix(in srgb,var(--oro) 7%,transparent);overflow:hidden}
.hil .ds .n{font:800 12.5px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--titulo);white-space:nowrap}
.hil .ds .q{font:italic 600 15.5px/1.1 var(--serif);color:var(--mudo);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hil .ds.suelto{background:transparent;border:1.4px dashed var(--linea2)}
.hil .ds.suelto .n{color:var(--mudo)}
.hil .ds.luz{background:color-mix(in srgb,var(--oro) 34%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--oro) 60%,transparent)}
.hil .pie{position:absolute;left:${XP[0]}px;right:20px;top:${Y1 + 30}px;height:${H - Y1 - 34}px;display:flex;align-items:stretch;gap:20px}

.hil .costo .bs{overflow:hidden}
.hil .costo{flex:1.62;border:1.6px solid var(--linea2);border-radius:14px;background:var(--papel);padding:13px 20px;display:flex;gap:26px;align-items:center}
.hil .costo .k{font:800 12px/1.3 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--rojo);width:150px;flex:none}
.hil .costo .cf{display:flex;flex-direction:column;gap:4px;flex:none}
.hil .costo .cf b{font:700 28px/1 var(--serif);color:var(--titulo);font-variant-numeric:tabular-nums;white-space:nowrap}
.hil .costo .cf span{font:700 11px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--mudo)}
.hil .costo .cf.sin b{font:italic 600 22px/1.1 var(--serif);color:var(--mudo)}
.hil .costo .bs{flex:1;display:flex;flex-direction:column;gap:9px;min-width:0}
.hil .costo .br{display:flex;align-items:center;gap:12px;white-space:nowrap}
.hil .costo .bb{height:16px;border-radius:4px;background:var(--rojo);flex:none}
.hil .costo .bb.meta{background:var(--orohondo);border:1.6px dashed var(--oro)}
.hil .costo .br b{font:700 21px/1 var(--serif);color:var(--titulo);font-variant-numeric:tabular-nums}
.hil .costo .br span{font:700 10px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--mudo)}
.hil .costo .nota{font:italic 600 15px/1.25 var(--serif);color:var(--mudo);flex:1}
.hil .lleg{flex:1;border:2px dashed var(--oro);border-radius:14px;background:var(--orohondo);padding:13px 20px;display:flex;flex-direction:column;justify-content:center;gap:5px}
.hil .lleg .k{font:800 12px/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--orotinta)}
.hil .lleg .v{font:700 27px/1.08 var(--serif);color:var(--titulo)}
`

export default function montar(raiz, ctx, D) {
  const V = D.vehiculo || {}
  const R = V.rotulos || {}
  const ps = (V.pasos || []).slice(0, 7)
  const dest = ((V.destinos || {}).lista || []).slice(0, 11).map((x) => (typeof x === 'string' ? { nombre: x } : x))
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'hil', css: CSS, marca: D.marca })
  const svg = svgEl('svg', { width: W, height: H }, div)
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, zIndex: 1, pointerEvents: 'none' })

  const cab = (x, texto, glosa) => { const d = document.createElement('div'); d.className = 'cab'; d.style.left = `${x}px`; d.innerHTML = `${e(texto)}${glosa ? `<i>${e(glosa)}</i>` : ''}`; div.appendChild(d) }
  cab(XP[0], R.pasos || 'Los pasos, en orden', R.pasos_glosa || '')

  // los pasos (izquierda) y los destinos (derecha)
  const np = Math.max(1, ps.length), altoP = (Y1 - Y0) / np
  const yP = ps.map((_, i) => Y0 + altoP * i + Math.min(34, altoP * .28))
  ps.forEach((s, i) => {
    const d = document.createElement('div'); d.className = `ps ${estadoDe(s.estado)}`; d.style.top = `${Y0 + altoP * i + 6}px`; d.dataset.desde = i + 1
    const gana = [s.quita ? `quita ${s.quita}` : '', s.recupera ? `recupera ${s.recupera}` : ''].filter(Boolean).join(' · ')
    d.innerHTML = `<div class="num">${i + 1}</div><div><div class="n">${e(corto(s.nombre, 78))}</div>
      ${s.detalle && altoP > 84 ? `<div class="d">${e(corto(s.detalle, 104))}</div>` : ''}
      <div class="f">${gana ? `<span class="g">${e(gana)}</span>` : ''}${sello(s.estado, s.sello)}</div></div>`
    div.appendChild(d)
  })
  const hoja = document.createElement('div'); hoja.className = 'hoja'
  hoja.innerHTML = `<div class="tt">${e((V.destinos || {}).titulo || 'Lo que arregla')}</div>`
  div.appendChild(hoja)
  const nd = Math.max(1, dest.length), yD0 = Y0 + 44, altoD = (Y1 - yD0) / nd
  const usados = new Set(ps.flatMap((s) => s.hilos || []).map((h) => String(h).toLowerCase()))
  const filas = dest.map((x, i) => {
    const d = document.createElement('div'); const toca = usados.has(String(x.nombre).toLowerCase()) || usados.has(String(i + 1))
    const vol = Number(x.volumen)
    d.className = `ds ${toca ? '' : 'suelto'} ${vol >= 0 && x.volumen != null ? 'medida' : ''}`
    d.style.top = `${yD0 + altoD * i + 3}px`; d.style.height = `${Math.min(52, altoD - 7)}px`
    d.innerHTML = `${vol >= 0 && x.volumen != null ? `<i class="v" style="width:${(100 * Math.min(1, vol)).toFixed(1)}%"></i>` : ''}<span class="n">${i + 1} · ${e(x.nombre)}</span>${x.nota ? `<span class="q">${e(x.nota)}</span>` : ''}`
    div.appendChild(d)
    return { d, y: yD0 + altoD * i + 3 + Math.min(52, altoD - 7) / 2 }
  })
  const iDest = (h) => { const k = String(h).toLowerCase(); const i = dest.findIndex((x) => String(x.nombre).toLowerCase() === k); return i >= 0 ? i : (/^\d+$/.test(k) ? Number(k) - 1 : -1) }

  // los hilos de oro
  const hilos = []
  ps.forEach((s, i) => {
    for (const h of s.hilos || []) {
      const j = iDest(h); if (j < 0 || !filas[j]) continue
      const y0 = yP[i], y1 = filas[j].y
      const d = `M${XP[1] + 14} ${y0.toFixed(1)} C ${XP[1] + 190} ${y0.toFixed(1)}, ${XD[0] - 190} ${y1.toFixed(1)}, ${XD[0] + 12} ${y1.toFixed(1)}`
      const k = estadoDe(s.estado)
      svgEl('path', { d, fill: 'none', stroke: 'var(--oro)', 'stroke-opacity': k === 'pendiente' || k === 'idea' ? .5 : .9, 'stroke-width': (1.8 + 1.7 * (Math.max(1, Math.min(3, Number(s.peso) || 1)) - 1)).toFixed(1), 'stroke-linecap': 'round', 'stroke-dasharray': trazoDe(k), 'data-desde': i + 1 }, svg)
      svgEl('circle', { cx: XD[0] + 12, cy: y1.toFixed(1), r: 5, fill: 'var(--oro)', 'data-desde': i + 1 }, svg)
      svgEl('circle', { cx: XP[1] + 14, cy: y0.toFixed(1), r: 4, fill: 'var(--oro)', 'data-desde': i + 1 }, svg)
      const guia = svgEl('path', { d, fill: 'none', stroke: 'none' }, svg)
      hilos.push({ i, j, pts: muestra(guia, 90) })
    }
  })

  // abajo: lo que cuesta no hacerlo y la llegada
  const C = V.costo || {}
  const cifra = (v, rot) => `<div class="cf ${v ? '' : 'sin'}"><b>${e(v || 'por medir')}</b><span>${e(rot)}</span></div>`
  const pie = document.createElement('div'); pie.className = 'pie'; pie.dataset.desde = np + 1
  // con dos o más cifras comparables, la geometría las compara: barras a escala (lo que se va contra lo que falta)
  const esc = (C.escala || []).filter((x) => x && Number(x.valor) > 0).slice(0, 3)
  const tope = Math.max(1, ...esc.map((x) => Number(x.valor)))
  const barras = esc.length >= 2 ? `<div class="bs">${esc.map((x, i) => `<div class="br"><div class="bb ${i ? 'meta' : ''}" style="width:${(38 * Number(x.valor) / tope).toFixed(1)}%"></div><b>${e(x.texto || x.valor)}</b><span>${e(x.rotulo || '')}</span></div>`).join('')}</div>` : ''
  pie.innerHTML = `<div class="costo"><div class="k">${e(R.costo || 'Lo que cuesta no hacerlo')}</div>${barras || cifra(C.mes, 'al mes')}${cifra(C.noventa, 'en 90 días')}${C.anio && !barras ? cifra(C.anio, 'en un año') : ''}
    ${C.nota && !barras ? `<div class="nota">${e(corto(C.nota, 120))}</div>` : ''}</div>
    <div class="lleg"><div class="k">${e(R.llegada || 'A dónde llega')}</div><div class="v">${e(corto(V.llegada || 'sin dato', 64))}</div></div>`
  div.appendChild(pie)

  // ── la luz que recorre cada hilo (canvas) ──
  const { g } = lienzo(div, W, H, 2)
  let p = paleta(div)
  const motivo = (D.marca || {}).motivo || 'punto'
  const paso = pasos(div, ctx, np + 1)
  let luz = -1
  const reloj = bucle(ctx, (t) => {
    g.clearRect(0, 0, W, H)
    const n = paso()
    let enc = -1
    if (t >= 0) hilos.forEach((h, k) => {
      if (h.i + 1 > n) return
      const s = ((t * .28 + k * .37) % 1.6)
      if (s > 1) return
      const q = h.pts[Math.floor(s * (h.pts.length - 1))]
      figura(g, motivo, q[0], q[1], 4, p.oroluz, 1, p.claro, t * 2)
      if (s > .9) enc = h.j
    })
    if (enc !== luz) { luz = enc; filas.forEach((f, j) => f.d.classList.toggle('luz', j === enc)) }
  })
  return api(div, reloj, { tema: () => { p = paleta(div) } })
}
