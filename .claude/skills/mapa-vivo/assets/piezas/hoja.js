/*
 * Pieza · La oferta en una página (capítulo «La oferta»).
 * Mecanismo: las 11 piezas de la oferta caben en una hoja; una sola floja baja el valor del conjunto. Arriba, la regla
 * de 11 tramos se lee desde lejos: lleno lo firmado, guiones lo abierto, hueco lo que falta. Abajo, cada pieza pesa lo
 * que tiene: la firmada llena su tarjeta, la abierta va en guiones y la que falta se encoge a su nombre. Una luz las lee
 * en orden (de la 1 a la 11).
 * Datos: oferta.hoja[{n, pieza, texto, estado, sello}] (las 11, en orden) y oferta.en_corto.
 */
import { marco, bucle, api, svgEl, e, sello, estadoDe, pasos, corto } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 350
const COLS = 6, GAP = 12, REGLA = 30
const CW = (W - GAP * (COLS - 1)) / COLS, CH = (H - REGLA - GAP) / 2, CORTA = 62
const PIEZAS = ['Avatar', 'Promesa', 'Vehículo', 'Nueva oportunidad', 'Dolores y deseos', 'Urgencia y escasez', 'Diferenciación', 'Bonos', 'Garantía', 'Precio', 'Pitch y gran dominó']

const CSS = `
.hoj .regla{position:absolute;left:0;top:0;width:${W}px;height:16px;display:flex;gap:5px}
.hoj .regla i{flex:1;border-radius:4px;border:1.6px solid var(--linea2);transition:box-shadow .5s ease}
.hoj .regla i.firmado{background:var(--oro);border-color:var(--oro)}
.hoj .regla i.opera{background:var(--mor);border-color:var(--mor)}
.hoj .regla i.abierto{background:var(--orohondo);border:1.6px dashed var(--oro)}
.hoj .regla i.pendiente{border-style:dashed}
.hoj .regla i.idea{border-style:dotted}
.hoj .regla i.luz{box-shadow:0 0 0 3px var(--orohondo)}
.hoj .c{position:absolute;width:${CW}px;height:${CH}px;border-radius:14px;border:1.6px solid var(--linea2);background:var(--papel);
 padding:11px 14px 10px;display:flex;flex-direction:column;gap:5px;overflow:hidden;transition:border-color .5s ease,box-shadow .5s ease}
.hoj .c .h{display:flex;align-items:center;gap:9px}
.hoj .c .num{width:26px;height:26px;border-radius:13px;display:grid;place-items:center;flex:none;font:800 13px/1 var(--sans);background:var(--sup2);color:var(--titulo);border:1.5px solid var(--linea2)}
.hoj .c .p{font:800 12px/1.1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--titulo)}
.hoj .c .t{font:600 13.5px/1.34 var(--sans);color:var(--cuerpo);flex:1;overflow:hidden}
.hoj .c.firmado{border:2.4px solid var(--oro);background:color-mix(in srgb,var(--oro) 12%,var(--papel))}
.hoj .c.firmado .num{background:var(--oro);border-color:var(--oro);color:#1a1205}
.hoj .c.firmado .t{color:var(--titulo)}
.hoj .c.opera{border:2.4px solid var(--mor);background:color-mix(in srgb,var(--mor) 10%,var(--papel))}
.hoj .c.opera .num{background:var(--mor);border-color:var(--mor);color:#fff}
.hoj .c.abierto{border:1.8px dashed color-mix(in srgb,var(--oro) 80%,transparent)}
.hoj .c.abierto .num{border-style:dashed;border-color:var(--oro);color:var(--orotinta)}
.hoj .c.corta{height:${CORTA}px;flex-direction:row;align-items:center;justify-content:space-between;gap:8px;border-style:dashed;
 background:repeating-linear-gradient(135deg,var(--sup) 0 6px,transparent 6px 12px)}
.hoj .c.corta .p{color:var(--mudo)} .hoj .c.corta .num{color:var(--mudo);border-style:dashed}
.hoj .c.corta.idea{border-style:dotted}
.hoj .c.luz{border-color:var(--oro);box-shadow:0 0 0 3px var(--orohondo),0 10px 26px -14px color-mix(in srgb,var(--oro) calc(90% * var(--brillo)),transparent)}
.hoj .res{position:absolute;width:${CW}px;height:${CH}px;padding:8px 6px 6px 16px;display:flex;flex-direction:column;justify-content:center;gap:6px}
.hoj .res .k{font:800 12px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--orotinta)}
.hoj .res .q{font:italic 600 18px/1.2 var(--serif);color:var(--titulo)}
.hoj .res .cta{display:flex;align-items:center;gap:12px;margin-top:2px}
.hoj .res .cta b{font:700 34px/1 var(--serif);color:var(--titulo);font-variant-numeric:tabular-nums}
.hoj .res .cta span{font:600 12.5px/1.3 var(--sans);color:var(--cuerpo)}
`

export default function montar(raiz, ctx, D) {
  const O = D.oferta || {}
  const dadas = O.hoja || []
  const hoja = PIEZAS.map((nombre, i) => {
    const x = dadas.find((q) => Number(q.n) === i + 1) || dadas[i] || {}
    return { n: i + 1, pieza: x.pieza || nombre, texto: x.texto || '', estado: x.texto ? estadoDe(x.estado) : (estadoDe(x.estado) === 'idea' ? 'idea' : 'pendiente'), sello: x.sello }
  })
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'hoj', css: CSS, marca: D.marca })
  // la regla: las 11, de un vistazo y desde lejos
  const regla = document.createElement('div'); regla.className = 'regla'
  regla.innerHTML = hoja.map((x) => `<i class="${x.estado}"></i>`).join('')
  div.appendChild(regla)
  const tramos = [...regla.children]
  const celdas = hoja.map((x, i) => {
    const col = i % COLS, fil = Math.floor(i / COLS)
    const corta = !x.texto
    const d = document.createElement('div'); d.className = `c ${x.estado} ${corta ? 'corta' : ''}`
    d.style.left = `${col * (CW + GAP)}px`; d.style.top = `${REGLA + fil * (CH + GAP)}px`
    d.dataset.desde = i < COLS ? 1 : 2
    d.innerHTML = corta
      ? `<div class="h"><span class="num">${x.n}</span><span class="p">${e(x.pieza)}</span></div>${sello(x.estado, x.sello || (x.estado === 'idea' ? 'idea' : 'falta'))}`
      : `<div class="h"><span class="num">${x.n}</span><span class="p">${e(x.pieza)}</span></div><div class="t">${e(corto(x.texto, 112))}</div><div>${sello(x.estado, x.sello)}</div>`
    div.appendChild(d)
    return d
  })
  // la celda 12: cuántas piezas están firmadas (el anillo) y la oferta en corto
  const firmes = hoja.filter((x) => x.estado === 'firmado' || x.estado === 'opera').length
  const res = document.createElement('div'); res.className = 'res'; res.dataset.desde = 2
  res.style.left = `${5 * (CW + GAP)}px`; res.style.top = `${REGLA + CH + GAP}px`
  res.innerHTML = `<div class="k">${e(O.hoja_rotulo || 'Una hoja, 11 piezas')}</div>
    <div class="cta"><svg width="58" height="58" viewBox="0 0 58 58"></svg><div><b>${firmes}</b> <span>de 11<br>firmadas</span></div></div>
    <div class="q">${e(corto(O.en_corto || 'Una sola pieza floja baja el valor de todas.', 70))}</div>`
  div.appendChild(res)
  const anillo = res.querySelector('svg'), R = 23, L = 2 * Math.PI * R
  svgEl('circle', { cx: 29, cy: 29, r: R, fill: 'none', stroke: 'var(--linea2)', 'stroke-width': 6 }, anillo)
  svgEl('circle', { cx: 29, cy: 29, r: R, fill: 'none', stroke: 'var(--oro)', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': `${(L * firmes / 11).toFixed(1)} ${L.toFixed(1)}`, transform: 'rotate(-90 29 29)' }, anillo)

  // la luz que lee la hoja, de la 1 a la 11
  const paso = pasos(div, ctx, 2)
  let ultima = -2
  const reloj = bucle(ctx, (t) => {
    const k = t < 0 || paso() < 2 ? -1 : Math.floor(t / 1.15) % 13
    if (k === ultima) return
    ultima = k
    celdas.forEach((c, i) => c.classList.toggle('luz', i === k))
    tramos.forEach((c, i) => c.classList.toggle('luz', i === k))
  })
  return api(div, reloj)
}
