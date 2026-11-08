'use client'
/**
 * «Entró y salió» (6 nov 2026, el espejo). La protagonista de Finanzas, a todo el ancho. Dos vistas del mismo dinero:
 *  · Acumulado (default): verde lo que entró y rojo lo que salió, sumados día con día; mismo trazo y mismo peso, cada línea
 *    con su valor al final. Cada una llega hasta su último movimiento: después no hay dato, no un cero.
 *  · Por día: solo los días con dinero, verde arriba y rojo abajo del eje. Tocar un día muestra sus movimientos: concepto,
 *    cuenta y monto. Al abrir, el último día con dinero ya está elegido.
 * Las rayas de color de las cifras de arriba son su leyenda; aquí la cabeza dice el periodo, una vez. Las etiquetas del eje Y
 * van dentro del área, sobre su línea guía (como Stripe), así la gráfica usa todo el ancho también en el teléfono.
 * SVG propio: se mide su ancho, se lee con ratón, dedo o flechas, y con «reducir movimiento» llega quieto. El cálculo vive
 * en `lib/espejo.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FinanceFx, FinanceMovement } from '../types/finances'
import { corto, montoDe, pesos, type DiaGrafica } from '../lib/modelo'
import { compacto, diaLargo, diasConDinero, fechaConAnio, marcasX, movimientosDelDia, pasoBonito, type SerieAcumulada } from '../lib/espejo'
import { Segmentado } from './Segmentado'
import g from './grafica.module.css'

export type ModoGrafica = 'acum' | 'dia'
const MODOS: { id: ModoGrafica; label: string; title: string }[] = [
  { id: 'acum', label: 'Acumulado', title: 'Sumado día con día' },
  { id: 'dia', label: 'Por día', title: 'Los días que entró y salió dinero' },
]

interface Props {
  dias: DiaGrafica[]
  /** El acumulado ya conciliado con los meses (lo calcula Finanzas: sus cifras y esta gráfica dicen lo mismo). */
  serie: SerieAcumulada
  movements: FinanceMovement[]
  fx: FinanceFx
  modo: ModoGrafica
  onModo: (m: ModoGrafica) => void
  /** Cambia con el rango: vuelve a dibujar y elige otra vez el último día. */
  clave: string
  hoy: string
  /** «4 ene 2024 – 6 nov 2026»: lo que cubren Entró, Salió y la gráfica. */
  periodo: string
}

const conSigno = (n: number, tipo: 'ingreso' | 'gasto') => `${tipo === 'ingreso' ? '+' : '−'}${pesos(Math.abs(Math.round(n)))}`
const tick = (t: number) => (t === 0 ? '$0' : corto(t))
const fechaTip = (iso: string, hoy: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const semana = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${semana} ${fechaConAnio(iso, hoy)}`
}

/** Una barra con la punta redondeada (la base, contra el eje, queda recta). `y1` es la punta. */
function barra(cx: number, w: number, y0: number, y1: number): string {
  const x0 = cx - w / 2, h = Math.abs(y1 - y0), r = w >= 3 ? Math.min(1.5, w / 2, h) : 0
  const f = (n: number) => n.toFixed(2)
  if (r <= 0) return `M${f(x0)} ${f(y0)}H${f(x0 + w)}V${f(y1)}H${f(x0)}Z`
  const s = y1 < y0 ? 1 : -1 // hacia arriba: la punta está arriba
  return `M${f(x0)} ${f(y0)}V${f(y1 + s * r)}Q${f(x0)} ${f(y1)} ${f(x0 + r)} ${f(y1)}H${f(x0 + w - r)}Q${f(x0 + w)} ${f(y1)} ${f(x0 + w)} ${f(y1 + s * r)}V${f(y0)}Z`
}

export function GraficaDinero({ dias, serie, movements, fx, modo, onModo, clave, hoy, periodo }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [foco, setFoco] = useState<number | null>(null) // índice de día bajo el puntero
  const [elegido, setElegido] = useState<string | null>(null) // día fijado en «Por día» (null = el último con dinero)
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setW(Math.round(el.getBoundingClientRect().width))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  useEffect(() => { setFoco(null); setElegido(null) }, [modo, clave])

  const conDinero = useMemo(() => diasConDinero(dias), [dias])
  const n = dias.length
  const angosto = w < 560
  const acum = modo === 'acum'
  const alto = w < 560 ? 236 : w < 900 ? 280 : 320
  // A la derecha del acumulado, el aire para el valor final de cada línea.
  const L = 1, R = w - (acum ? (angosto ? 60 : 74) : 1), T = 18, B = alto - 26
  const ancho = Math.max(1, R - L), altoPlot = B - T
  const vacio = acum ? serie.finEntro < 0 && serie.finSalio < 0 : conDinero.length === 0

  // ── Escalas ──
  const xA = (i: number) => L + (n <= 1 ? 0.5 : i / (n - 1)) * ancho // acumulado: un punto por día
  const xD = (i: number) => L + ((i + 0.5) / Math.max(1, n)) * ancho // por día: una casilla por día
  const escA = useMemo(() => {
    const max = Math.max(1, ...serie.entro, ...serie.salio) * 1.04
    const paso = pasoBonito(max, angosto ? 3 : 4), top = Math.ceil(max / paso) * paso
    return { top, ticks: Array.from({ length: Math.round(top / paso) + 1 }, (_, k) => k * paso) }
  }, [serie, angosto])
  const escD = useMemo(() => {
    const maxE = Math.max(0, ...conDinero.map(d => d.entro)), maxS = Math.max(0, ...conDinero.map(d => d.salio))
    const paso = pasoBonito(Math.max(1, maxE, maxS), 3)
    const arriba = maxE > 0 ? Math.ceil(maxE / paso) * paso : 0, abajo = maxS > 0 ? Math.ceil(maxS / paso) * paso : 0
    const ticks: number[] = []
    for (let t = -abajo; t <= arriba + 1e-6; t += paso) ticks.push(Math.round(t))
    return { arriba, abajo, ticks }
  }, [conDinero, angosto])
  const yA = (v: number) => B - Math.min(1, Math.max(0, v / escA.top)) * altoPlot
  const kD = altoPlot / Math.max(1, escD.arriba + escD.abajo), y0 = T + escD.arriba * kD
  const yD = (v: number) => y0 - v * kD

  // ── Acumulado: líneas, puntos finales y sus etiquetas ──
  const linea = (vals: number[], fin: number) => {
    let d = ''
    for (let i = 0; i <= fin; i++) {
      // Un tramo plano no necesita cada día: solo sus extremos.
      if (i > 0 && i < fin && vals[i] === vals[i - 1] && vals[i] === vals[i + 1]) continue
      d += `${d ? 'L' : 'M'}${xA(i).toFixed(1)} ${yA(vals[i]).toFixed(1)}`
    }
    return d
  }
  // El valor final va 8 px a la derecha del último punto de su línea; si dos quedan juntos, se separan 18 px.
  const finales = useMemo(() => {
    if (!acum || w === 0) return []
    const out = ([['gana', serie.finEntro, serie.entro], ['pierde', serie.finSalio, serie.salio]] as const)
      .filter(([, fin]) => fin >= 0).map(([t, fin, vals]) => ({ t, fin, valor: vals[fin], y: yA(vals[fin]), ly: yA(vals[fin]) }))
    if (out.length === 2 && Math.abs(xA(out[0].fin) - xA(out[1].fin)) < 72 && Math.abs(out[0].ly - out[1].ly) < 18) {
      const [a, b] = out[0].ly <= out[1].ly ? [out[0], out[1]] : [out[1], out[0]], medio = (a.ly + b.ly) / 2
      a.ly = medio - 9; b.ly = medio + 9
    }
    for (const f of out) f.ly = Math.min(B - 2, Math.max(T + 8, f.ly))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acum, w, serie, escA.top, alto])

  // ── Por día: barras y el día elegido ──
  const bw = Math.min(10, Math.max(1, (ancho / Math.max(1, n)) * 0.64))
  const barras = useMemo(() => {
    if (acum || w === 0) return { gana: '', pierde: '' }
    let gana = '', pierde = ''
    for (const d of conDinero) {
      const cx = xD(d.i)
      if (d.entro > 0) gana += barra(cx, bw, y0 - 0.5, Math.min(y0 - 1.5, yD(d.entro)))
      if (d.salio > 0) pierde += barra(cx, bw, y0 + 0.5, Math.max(y0 + 1.5, yD(-d.salio)))
    }
    return { gana, pierde }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acum, w, conDinero, bw, escD, alto])
  const diaFijo = acum ? null : (elegido ? conDinero.find(d => d.fecha === elegido) : conDinero.at(-1)) ?? null
  const movsDia = useMemo(() => (diaFijo ? movimientosDelDia(movements, diaFijo.fecha, fx) : []), [diaFijo, movements, fx])

  // ── Puntero y teclado ──
  const indice = (e: React.PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect(), px = e.clientX - r.left
    if (acum) return Math.max(0, Math.min(n - 1, Math.round(((px - L) / ancho) * (n - 1))))
    let mejor: number | null = null, dist = Infinity
    for (const d of conDinero) { const dd = Math.abs(xD(d.i) - px); if (dd < dist) { dist = dd; mejor = d.i } }
    return dist <= Math.max(24, ancho / Math.max(1, n)) ? mejor : null
  }
  const mover = (e: React.PointerEvent) => { if (e.pointerType !== 'touch' || acum) setFoco(indice(e)) }
  const tocar = (e: React.PointerEvent) => {
    const i = indice(e)
    if (acum) { setFoco(i); return }
    if (i != null) { setElegido(dias[i].fecha); if (e.pointerType === 'touch') setFoco(null) }
  }
  function teclas(e: React.KeyboardEvent) {
    const izq = e.key === 'ArrowLeft', der = e.key === 'ArrowRight'
    if (e.key === 'Escape') { setFoco(null); return }
    if (!izq && !der && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    if (acum) {
      const paso = (e.shiftKey ? 30 : 1) * (izq ? -1 : 1)
      setFoco(f => (e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, (f ?? (izq ? n : -1)) + paso))))
      return
    }
    if (!conDinero.length) return
    const k = Math.max(0, conDinero.findIndex(d => d.fecha === diaFijo?.fecha))
    const sig = e.key === 'Home' ? 0 : e.key === 'End' ? conDinero.length - 1 : Math.max(0, Math.min(conDinero.length - 1, k + (izq ? -1 : 1)))
    setElegido(conDinero[sig].fecha); setFoco(conDinero[sig].i)
  }

  const marcas = useMemo(() => (w ? marcasX(serie.fechas, ancho) : []), [serie.fechas, ancho, w])
  const xM = (i: number) => (acum ? xA(i) : xD(i))
  const anclaX = (i: number) => (xM(i) > R - 24 ? 'end' : xM(i) < L + 24 ? 'start' : 'middle')
  const ticks = acum ? escA.ticks : escD.ticks
  const yT = (t: number) => (acum ? yA(t) : yD(t))

  // El cartel del puntero: valores primero, etiqueta después.
  const tip = (() => {
    if (foco == null || !dias[foco]) return null
    const fecha = dias[foco].fecha, x = xM(foco)
    if (acum) {
      const e = serie.finEntro >= 0 ? serie.entro[Math.min(foco, serie.finEntro)] : null
      const s = serie.finSalio >= 0 ? serie.salio[Math.min(foco, serie.finSalio)] : null
      return { x, fecha, filas: [['gana', e, 'Entró'], ['pierde', s, 'Salió']] as const, extra: null }
    }
    const d = conDinero.find(c => c.i === foco)
    if (!d) return null
    const cuantos = movimientosDelDia(movements, d.fecha, fx).length
    return { x, fecha, filas: [['gana', d.entro || null, 'Entró'], ['pierde', d.salio || null, 'Salió']] as const, extra: `${cuantos} ${cuantos === 1 ? 'movimiento' : 'movimientos'}` }
  })()
  // En el acumulado las líneas suben hacia la derecha: el cartel va a la izquierda del puntero si cabe, sobre el aire.
  const tipIzq = tip ? (acum ? tip.x - 190 > L : tip.x > w - 200) : false

  const resumen = acum
    ? `Acumulado: entró ${pesos(serie.finEntro >= 0 ? serie.entro[serie.finEntro] : 0)} y salió ${pesos(serie.finSalio >= 0 ? serie.salio[serie.finSalio] : 0)}.`
    : `Por día: ${conDinero.length} días con dinero.`

  return <div className={g.grafica} data-modo={modo}>
    <div className={g.cabeza}>
      <p className={g.periodo}>{periodo}</p>
      <Segmentado etiqueta="Cómo ver el dinero" opciones={MODOS} valor={modo} onChange={onModo} />
    </div>

    <div ref={caja} className={g.plot} style={{ height: alto }}>
      {vacio ? <p className={g.vacio}>Sin movimientos en este rango.</p>
        : w > 0 && <svg width={w} height={alto} viewBox={`0 0 ${w} ${alto}`} role="img" aria-label={resumen} tabIndex={0}
          onKeyDown={teclas} onPointerMove={mover} onPointerDown={tocar} onPointerLeave={() => setFoco(null)} onBlur={() => setFoco(null)}>
          {ticks.map(t => <line key={t} className={g.rejilla} data-cero={t === 0 || undefined} x1={L} x2={R} y1={Math.round(yT(t)) + 0.5} y2={Math.round(yT(t)) + 0.5} />)}
          {marcas.map(m => <text key={m.i} className={g.tick} x={xM(m.i)} y={alto - 7} textAnchor={anclaX(m.i)}>{m.texto}</text>)}
          {!acum && diaFijo && <line className={g.fijoLinea} x1={Math.round(xD(diaFijo.i)) + 0.5} x2={Math.round(xD(diaFijo.i)) + 0.5} y1={T} y2={B} />}

          <g key={`${modo}-${clave}-${w > 0}`}>
            {acum && <>
              <path className={g.trazo} data-t="pierde" pathLength={1} d={linea(serie.salio, serie.finSalio)} />
              <path className={g.trazo} data-t="gana" pathLength={1} d={linea(serie.entro, serie.finEntro)} />
              {finales.map(f => <g key={f.t} className={g.final}>
                <circle className={g.punto} data-t={f.t} cx={xA(f.fin)} cy={f.y} r={4} />
                <text className={g.valorFinal} x={xA(f.fin) + 9} y={f.ly + 4}>{compacto(f.valor)}</text>
              </g>)}
            </>}
            {!acum && <g className={g.barras} data-elegido={diaFijo ? true : undefined}>
              <path data-t="gana" d={barras.gana} />
              <path data-t="pierde" d={barras.pierde} />
            </g>}
          </g>

          {!acum && diaFijo && <g className={g.fijo} pointerEvents="none">
            {diaFijo.entro > 0 && <path data-t="gana" d={barra(xD(diaFijo.i), Math.max(bw, 3), y0 - 0.5, Math.min(y0 - 1.5, yD(diaFijo.entro)))} />}
            {diaFijo.salio > 0 && <path data-t="pierde" d={barra(xD(diaFijo.i), Math.max(bw, 3), y0 + 0.5, Math.max(y0 + 1.5, yD(-diaFijo.salio)))} />}
          </g>}

          {ticks.filter(t => t !== 0).map(t => <text key={t} className={g.tickY} x={L + 2} y={Math.round(yT(t)) - 5}>{tick(t)}</text>)}

          {tip && <g className={g.guia} pointerEvents="none">
            <line x1={Math.round(tip.x) + 0.5} x2={Math.round(tip.x) + 0.5} y1={T} y2={B} />
            {acum && foco != null && foco <= serie.finEntro && <circle data-t="gana" cx={tip.x} cy={yA(serie.entro[foco])} r={4} />}
            {acum && foco != null && foco <= serie.finSalio && <circle data-t="pierde" cx={tip.x} cy={yA(serie.salio[foco])} r={4} />}
          </g>}
        </svg>}
      {tip && <div className={g.tip} style={{ left: tip.x, top: T }} data-izq={tipIzq || undefined} aria-hidden>
        <p className={g.tipFecha}>{fechaTip(tip.fecha, hoy)}</p>
        {tip.filas.map(([t, v, etiqueta]) => <p key={t} className={g.tipFila}><i data-t={t} /><b>{v == null ? '—' : pesos(Math.round(v))}</b><span>{etiqueta}</span></p>)}
        {tip.extra && <p className={g.tipExtra}>{tip.extra}</p>}
      </div>}
    </div>

    {!acum && diaFijo && <div className={g.dia} aria-live="polite" data-fecha={diaFijo.fecha}>
      <div className={g.diaCabeza}>
        <p className={g.diaFecha}>{diaLargo(diaFijo.fecha)}</p>
        <p className={g.diaTotales}>
          {diaFijo.entro > 0 && <span><i data-t="gana" aria-hidden />{conSigno(diaFijo.entro, 'ingreso')}</span>}
          {diaFijo.salio > 0 && <span><i data-t="pierde" aria-hidden />{conSigno(diaFijo.salio, 'gasto')}</span>}
        </p>
      </div>
      <ul className={g.movs}>
        {movsDia.map(m => <li key={m.id}>
          <i data-t={m.tipo === 'ingreso' ? 'gana' : 'pierde'} aria-hidden />
          <span className={g.concepto} title={m.concepto}>{m.concepto}</span>
          <span className={g.cuenta}>{m.cuenta}</span>
          <span className={g.monto}>{conSigno(m.mxn, m.tipo)}{m.original && <small>{montoDe(m.original.monto, m.original.moneda)}</small>}</span>
        </li>)}
      </ul>
    </div>}
  </div>
}
