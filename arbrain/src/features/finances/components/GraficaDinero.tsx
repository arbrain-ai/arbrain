'use client'
/**
 * «Entró y salió» (v3.1, 8 oct 2026). Tres lecturas del mismo dinero, un toggle; verde = entró, rojo = salió:
 *  · Por mes (default): barras por mes. Un total de mes está en su casa; el mes al que le falta un estado de cuenta o que
 *    sigue en curso se dibuja como piso (rayado, «al menos»).
 *  · Por día: SOLO lo que tiene fecha real (las ventas de Polar de cada día, y los gastos con fecha cuando existan). Los
 *    totales de mes (estados de cuenta, ajustes de renovaciones) NO se dibujan como un día: una línea dice cuánto llega así.
 *  · Acumulado: las dos curvas sumadas. Aquí un total de mes sí sube como escalón en su fecha de corte (así es el acumulado
 *    real) y lleva su marca (círculo hueco); el listón entre curvas es verde si va ganando lo que entra y rojo si lo que sale.
 * SVG propio: se mide su ancho real, se dibuja una vez, se lee con ratón, dedo o flechas, y con «reducir movimiento» llega quieto.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import type { Aggregate } from '../types/finances'
import { acumulado, corto, fechaCorta, nombreCuenta, pesos, suma, type DiaGrafica, type MesGrafica } from '../lib/modelo'
import { nombreMes } from '../lib/granularidad'
import { etiquetaDia } from '@/features/cabina/model'
import { Segmentado } from './Segmentado'
import g from './grafica.module.css'

export type ModoGrafica = 'dia' | 'mes' | 'acum'
const MODOS: { id: ModoGrafica; label: string; ayuda: string }[] = [
  { id: 'mes', label: 'Por mes', ayuda: 'Los totales de cada mes' },
  { id: 'dia', label: 'Por día', ayuda: 'Lo que entró y salió cada día' },
  { id: 'acum', label: 'Acumulado', ayuda: 'Sumando día con día' },
]

interface Props {
  dias: DiaGrafica[]
  meses: MesGrafica[]
  modo: ModoGrafica
  onModo: (m: ModoGrafica) => void
  /** Clave que cambia con el rango: vuelve a dibujar. */
  clave: string
  palabraRango: string
  /** Hasta cuándo se conocen todos los gastos (estado de cuenta más atrasado). */
  gastosHasta: string | null
  cuentaAtrasada: string | null
  /** Antes de esta fecha el registro diario de Polar solo veía ventas nuevas. */
  exactoDesde: string
  hoy: string
  vacio: boolean
}

const MARGEN = { izq: 40, der: 10, arr: 32, aba: 24 }

/** Escala ajustada al dato: hasta 5 tramos con paso «bonito» y un margen del 6%, sin el aire vacío de redondear a la siguiente potencia. */
function escala(max: number) {
  const m = Math.max(max * 1.06, 1), crudo = m / 5, k = 10 ** Math.floor(Math.log10(crudo)), r = crudo / k
  const paso = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(v => v >= r) ?? 10) * k
  const top = Math.ceil(m / paso - 1e-9) * paso
  return { paso, top, ticks: Array.from({ length: Math.round(top / paso) + 1 }, (_, i) => i * paso) }
}

/** Un paso «bonito» para el eje: 1, 2, 2.5, 5 × 10^k. */
function paso(max: number, tramos = 3) {
  const crudo = Math.max(max, 1) / tramos, k = 10 ** Math.floor(Math.log10(crudo)), r = crudo / k
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * k
}
const dia = (iso: string) => etiquetaDia(iso, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')

export function GraficaDinero({ dias, meses, modo, onModo, clave, palabraRango, gastosHasta, cuentaAtrasada, exactoDesde, hoy, vacio }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [foco, setFoco] = useState<number | null>(null)
  const uid = useId().replace(/:/g, '')
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setW(Math.round(el.getBoundingClientRect().width))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  useEffect(() => setFoco(null), [modo, clave])

  const alto = w < 420 ? 214 : w < 760 ? 244 : 292
  const L = MARGEN.izq, R = w - MARGEN.der, T = MARGEN.arr, B = alto - MARGEN.aba
  const ancho = Math.max(0, R - L), altoPlot = B - T

  const total = useMemo(() => {
    const e = dias.reduce((n, d) => n + d.entro + suma(d.agrEntro), 0), s = dias.reduce((n, d) => n + d.salio + suma(d.agrSalio), 0)
    return { entro: e, salio: s }
  }, [dias])
  const acum = useMemo(() => acumulado(dias), [dias])
  const aggGasto = useMemo(() => dias.reduce((n, d) => n + suma(d.agrSalio), 0), [dias])
  const aggIngreso = useMemo(() => dias.reduce((n, d) => n + suma(d.agrEntro), 0), [dias])

  const n = modo === 'mes' ? meses.length : dias.length
  const x = (i: number) => modo === 'mes' ? L + ((i + 0.5) / n) * ancho : L + (n <= 1 ? 0.5 : i / (n - 1)) * ancho

  // ── Escala ──
  const esc = useMemo(() => {
    if (modo === 'mes') return escala(Math.max(1, ...meses.map(m => Math.max(m.entro, m.salio))))
    if (modo === 'acum') return escala(Math.max(1, ...acum.entro, ...acum.salio))
    return escala(Math.max(300, ...dias.map(d => Math.max(d.entro, d.salio))))
  }, [modo, meses, acum, dias])
  const yMax = esc.top
  const y = (v: number) => B - Math.min(1, Math.max(0, v / yMax)) * altoPlot
  const ticks = esc.ticks

  // ── Caminos ──
  const linea = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const escalonado = (vals: number[]) => vals.map((v, i) => i === 0 ? `M${x(0).toFixed(1)} ${y(v).toFixed(1)}` : `H${x(i).toFixed(1)} V${y(v).toFixed(1)}`).join(' ') + ` H${R}`
  const dEntro = modo === 'dia' ? linea(dias.map(d => d.entro)) : ''
  const hayGastoDia = dias.some(d => d.salio > 0)
  const dSalio = modo === 'dia' && hayGastoDia ? linea(dias.map(d => d.salio)) : ''

  // Listón entre las curvas del acumulado: un rectángulo por día, verde o rojo según quién va arriba.
  const liston = useMemo(() => {
    if (modo !== 'acum' || w === 0) return { gana: '', pierde: '' }
    let gana = '', pierde = ''
    for (let i = 0; i < n; i++) {
      const x0 = x(i), x1 = i === n - 1 ? R : x(i + 1), a = y(acum.entro[i]), b = y(acum.salio[i])
      const r = `M${x0.toFixed(1)} ${Math.min(a, b).toFixed(1)}H${x1.toFixed(1)}V${Math.max(a, b).toFixed(1)}H${x0.toFixed(1)}Z`
      if (acum.entro[i] >= acum.salio[i]) gana += r; else pierde += r
    }
    return { gana, pierde }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, w, n, acum, yMax])

  // ── Lo que se lee ──
  const rangoCompleto = gastosHasta != null && dias.length > 0 && gastosHasta >= dias[dias.length - 1].fecha
  const iGasto = gastosHasta ? dias.findIndex(d => d.fecha > gastosHasta) : -1
  const sinCargar = modo === 'acum' && iGasto > 0 ? x(iGasto) - (n > 1 ? (R - L) / (n - 1) / 2 : 0) : null
  const iExacto = dias.findIndex(d => d.fecha >= exactoDesde)

  function posicion(e: React.PointerEvent | React.MouseEvent) {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    const px = e.clientX - r.left
    const i = modo === 'mes' ? Math.floor(((px - L) / ancho) * n) : Math.round(((px - L) / ancho) * (n - 1))
    setFoco(Math.max(0, Math.min(n - 1, i)))
  }
  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); setFoco(f => Math.max(0, Math.min(n - 1, (f ?? (e.key === 'ArrowLeft' ? n : -1)) + (e.key === 'ArrowLeft' ? -1 : 1))))
    } else if (e.key === 'Escape') setFoco(null)
  }

  const totalMeses = useMemo(() => ({ entro: meses.reduce((n, x) => n + x.entro, 0), salio: meses.reduce((n, x) => n + x.salio, 0) }), [meses])
  const d = foco != null && modo !== 'mes' ? dias[foco] : null
  const m = foco != null && modo === 'mes' ? meses[foco] : null
  const lectura = leer({ modo, d, m, foco, acum, totalDia: { entro: dias.reduce((n, x) => n + x.entro, 0), salio: dias.reduce((n, x) => n + x.salio, 0) }, total: modo === 'mes' ? totalMeses : total, dias, palabraRango, gastosHasta, cuentaAtrasada, rangoCompleto, exactoDesde })

  const etiquetaX = (i: number) => modo === 'mes' ? nombreMes(meses[i].mes, false, true) + (meses[i].mes.endsWith('-01') || i === 0 ? ` ${meses[i].mes.slice(2, 4)}` : '') : fechaCorta(dias[i].fecha)
  const pasoX = modo === 'mes' ? 1 : Math.max(1, Math.ceil(n / Math.max(2, Math.floor(ancho / 62))))
  const ariaResumen = modo === 'mes'
    ? `Entró y salió por mes, ${meses.length} meses.`
    : `Entró ${pesos(total.entro)} y salió ${pesos(total.salio)} en ${palabraRango}.`

  return <section className={`${g.tarjeta} ${mov.entra}`} style={escalon(3)} aria-label="Entró y salió">
    <header className={g.cabeza}>
      <h2 className={g.titulo}>Entró y salió · {modo === 'mes' ? 'por mes' : modo === 'dia' ? 'por día' : 'acumulado'}</h2>
      <Segmentado etiqueta="Cómo ver el dinero" opciones={MODOS.map(o => ({ id: o.id, label: o.label, title: o.ayuda }))} valor={modo} onChange={onModo} />
    </header>
    <ul className={g.leyenda} aria-label="Cómo leer la gráfica">
      <li><i data-t="gana" aria-hidden />Entró</li>
      <li><i data-t="pierde" aria-hidden />Salió</li>
      {modo === 'dia' && !hayGastoDia && <li className={g.leyendaNota}>Salió: todavía no hay gastos con fecha</li>}
      {modo === 'mes' && <li><i data-t="rayado" aria-hidden />Mes incompleto: al menos</li>}
      {modo === 'acum' && <li><i data-t="salto" aria-hidden />Salto: total de un periodo</li>}
    </ul>

    <div ref={caja} className={g.plot} style={{ height: alto }}>
      {vacio ? <p className={g.vacio}>Sin movimientos en este rango todavía. Cuando entren ventas de Polar o se cargue un estado de cuenta, aquí se ve cada uno.</p>
        : w > 0 && <svg width={w} height={alto} viewBox={`0 0 ${w} ${alto}`} role="img" aria-label={ariaResumen}
          tabIndex={0} onKeyDown={teclas} onPointerMove={posicion} onPointerDown={posicion} onPointerLeave={e => { if (e.pointerType !== 'touch') setFoco(null) }} onBlur={() => setFoco(null)}>
          <defs>
            <pattern id={`${uid}-g`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--gana)" fillOpacity="0.10" /><rect width="1.6" height="5" fill="var(--gana)" fillOpacity="0.75" /></pattern>
            <pattern id={`${uid}-p`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--pierde)" fillOpacity="0.10" /><rect width="1.6" height="5" fill="var(--pierde)" fillOpacity="0.75" /></pattern>
            <pattern id={`${uid}-v`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="1" height="6" fill="var(--muted)" fillOpacity="0.28" /></pattern>
            <linearGradient id={`${uid}-ag`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gana)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--gana)" stopOpacity="0" /></linearGradient>
          </defs>

          {/* Rejilla y eje */}
          {ticks.map((t, k) => <g key={k}>
            <line className={g.rejilla} x1={L} x2={R} y1={y(t)} y2={y(t)} data-cero={k === 0 || undefined} />
            <text className={g.tick} x={L - 6} y={y(t) + 3.5} textAnchor="end">{k === 0 ? '$0' : corto(t)}</text>
          </g>)}

          {/* Gastos que todavía no existen aquí: lo que sigue después del último estado de cuenta */}
          {sinCargar != null && <g className={mov.aparece}>
            <rect x={sinCargar} y={T} width={Math.max(0, R - sinCargar)} height={altoPlot} fill={`url(#${uid}-v)`} />
            {R - sinCargar > 92 && <text className={g.nota} x={R - 6} y={T + 12} textAnchor="end">gastos sin cargar</text>}
          </g>}

          <g key={`${modo}-${clave}`}>
            {/* ── Por día ── */}
            {modo === 'dia' && <>
              <path className={g.area} d={`${dEntro} L${x(n - 1).toFixed(1)} ${B} L${x(0).toFixed(1)} ${B} Z`} fill={`url(#${uid}-ag)`} />
              {dSalio && <path className={g.trazo} data-t="pierde" pathLength={1} d={dSalio} />}
              <path className={g.trazo} data-t="gana" pathLength={1} d={dEntro} />
              {n <= 45 && dias.map((p, i) => p.entro > 0 && <circle key={`e${i}`} className={g.punto} data-t="gana" cx={x(i)} cy={y(p.entro)} r={2.3} style={{ animationDelay: `${300 + i * 8}ms` }} />)}
              {iExacto > 0 && <line className={g.parcial} x1={x(0)} x2={x(iExacto)} y1={B + 0.5} y2={B + 0.5} />}
            </>}

            {/* ── Acumulado ── */}
            {modo === 'acum' && <>
              <path className={g.liston} data-t="gana" d={liston.gana} />
              <path className={g.liston} data-t="pierde" d={liston.pierde} />
              <path className={g.trazo} data-t="pierde" pathLength={1} d={escalonado(acum.salio)} />
              <path className={g.trazo} data-t="gana" pathLength={1} d={escalonado(acum.entro)} />
              {dias.map((_, i) => <g key={i}>
                {acum.saltoEntro[i] && <circle className={g.salto} data-t="gana" cx={x(i)} cy={y(acum.entro[i])} r={3.6} />}
                {acum.saltoSalio[i] && <circle className={g.salto} data-t="pierde" cx={x(i)} cy={y(acum.salio[i])} r={3.6} />}
              </g>)}
            </>}

            {/* ── Por mes ── */}
            {modo === 'mes' && meses.map((mm, i) => {
              const slot = ancho / n, bw = Math.min(26, slot * 0.34), cx = x(i)
              const hE = B - y(mm.entro), hS = B - y(mm.salio)
              return <g key={mm.mes} className={g.mes} style={{ animationDelay: `${i * 50}ms` }} data-foco={foco === i || undefined}>
                {mm.sinDatos ? <text className={g.nota} x={cx} y={B - 8} textAnchor="middle">sin datos</text> : <>
                  <rect className={g.barra} x={cx - bw - 1.5} y={y(mm.entro)} width={bw} height={Math.max(0, hE)} rx={3} data-t="gana" fill={mm.enCurso && hE > 14 ? `url(#${uid}-g)` : undefined} data-piso={(mm.enCurso && hE > 14) || undefined} />
                  <rect className={g.barra} x={cx + 1.5} y={y(mm.salio)} width={bw} height={Math.max(0, hS)} rx={3} data-t="pierde" fill={mm.gastoParcial && hS > 14 ? `url(#${uid}-p)` : undefined} data-piso={(mm.gastoParcial && hS > 14) || undefined} />
                </>}
              </g>
            })}

            {/* Hoy, el único dato vivo: pulso dorado al final de la línea */}
            {modo === 'dia' && dias.length > 0 && dias[n - 1].fecha === hoy && <circle className={g.hoy} cx={x(n - 1)} cy={B} r={3.4} />}
          </g>

          {/* Eje X */}
          {Array.from({ length: n }, (_, i) => i).filter(i => (n - 1 - i) % pasoX === 0).map(i =>
            <text key={i} className={g.tick} x={x(i)} y={alto - 6} textAnchor={modo === 'mes' ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{etiquetaX(i)}</text>)}

          {/* Guía del puntero */}
          {foco != null && <g className={g.guia} pointerEvents="none">
            {modo === 'mes' ? <rect x={L + (foco / n) * ancho} y={T} width={ancho / n} height={altoPlot} className={g.fondoMes} />
              : <line x1={x(foco)} x2={x(foco)} y1={T} y2={B} />}
            {modo === 'dia' && dias[foco] && dias[foco].entro > 0 && <circle cx={x(foco)} cy={y(dias[foco].entro)} r={4} data-t="gana" />}
            {modo === 'dia' && dias[foco] && dias[foco].salio > 0 && <circle cx={x(foco)} cy={y(dias[foco].salio)} r={4} data-t="pierde" />}
            {modo === 'acum' && <><circle cx={x(foco)} cy={y(acum.entro[foco])} r={4} data-t="gana" /><circle cx={x(foco)} cy={y(acum.salio[foco])} r={4} data-t="pierde" /></>}
          </g>}
        </svg>}
    </div>

    {modo === 'dia' && !vacio && (aggGasto > 0 || aggIngreso > 0) && <p className={g.sugiere}>
      {aggGasto > 0 && <>{pesos(aggGasto)} del gasto llega como total de mes</>}{aggGasto > 0 && aggIngreso > 0 && ' y '}{aggIngreso > 0 && <>{pesos(aggIngreso)} de lo cobrado, como ajuste del mes</>}: no se pone en un día, está en <button onClick={() => onModo('mes')}>Por mes</button>.
    </p>}
    <div className={g.lectura} aria-live="polite" data-foco={foco != null || undefined}>
      <p className={g.cuando}>{lectura.cuando}</p>
      {!lectura.soloNota && <dl className={g.cifras}>
        <div data-t="gana"><dt>{lectura.entroEtiqueta}</dt><dd><Cifra valor={lectura.entro} clave={`graf-e-${modo}-${clave}`} formato={n => pesos(Math.round(n))} /></dd></div>
        <div data-t="pierde"><dt>{lectura.salioEtiqueta}</dt><dd>{!(lectura.salioTexto && lectura.salio === 0) ? <>{lectura.salioPiso && <small>al menos </small>}<Cifra valor={lectura.salio} clave={`graf-s-${modo}-${clave}`} formato={n => pesos(Math.round(n))} /></> : <small>{lectura.salioTexto}</small>}</dd></div>
        {lectura.quedo != null && <div data-t={lectura.quedo >= 0 ? 'gana' : 'pierde'} data-quedo><dt>{lectura.salioPiso && lectura.quedoEtiqueta === 'Quedó' ? 'Quedó, como máximo' : lectura.quedoEtiqueta}</dt><dd>{lectura.quedo >= 0 ? '+' : '−'}{pesos(Math.abs(lectura.quedo))}</dd></div>}
      </dl>}
      {lectura.nota && <p className={g.nota2}>{lectura.nota}</p>}
    </div>
  </section>
}

// ── El texto que acompaña a la gráfica: lo apuntado, o el total del rango ──
interface Lec {
  cuando: string; entro: number; salio: number; quedo: number | null; cifras: boolean
  entroEtiqueta: string; salioEtiqueta: string; quedoEtiqueta: string
  entroTexto?: string; salioTexto?: string; salioPiso?: boolean; nota?: string; soloNota?: boolean
}

function detalleAgregados(xs: Aggregate[]): string {
  return xs.map(a => `${a.label.replace(/^Estado de cuenta · /, 'Estado de cuenta ')}${a.detail ? `: ${a.detail}` : ''}`).join(' · ')
}

function leer(o: {
  modo: ModoGrafica; d: DiaGrafica | null; m: MesGrafica | null; foco: number | null; acum: ReturnType<typeof acumulado>
  total: { entro: number; salio: number }; totalDia: { entro: number; salio: number }; dias: DiaGrafica[]; palabraRango: string; gastosHasta: string | null; cuentaAtrasada: string | null
  rangoCompleto: boolean; exactoDesde: string
}): Lec {
  const base = { entroEtiqueta: 'Entró', salioEtiqueta: 'Salió', quedoEtiqueta: 'Quedó', cifras: true }
  if (o.modo === 'mes' && !o.m) return { ...base, cuando: 'Cada par de barras es un mes', entro: 0, salio: 0, quedo: null, soloNota: true, nota: 'Toca un mes para ver cuánto entró y salió. Las barras rayadas son un piso: falta un estado de cuenta o el mes sigue en curso.' }
  if (o.modo === 'mes' && o.m) {
    const m = o.m
    const notas = [m.enCurso ? 'El mes sigue en curso: lo de Polar llega hasta ayer y los gastos con el estado de cuenta.' : m.gastoParcial ? `Falta el estado de cuenta de ${m.faltan.map(nombreCuenta).join(' y ')}: lo que salió es al menos esto.` : null].filter(Boolean)
    return { ...base, cuando: nombreMes(m.mes, true), entro: m.entro, salio: m.salio, quedo: m.sinDatos ? null : m.entro - m.salio, salioPiso: m.gastoParcial && m.salio > 0, nota: m.sinDatos ? 'Sin datos de este mes.' : (notas[0] as string | undefined) }
  }
  if (o.modo === 'acum' && o.foco != null && o.d) {
    const i = o.foco, e = o.acum.entro[i], s = o.acum.salio[i]
    const agr = [...o.d.agrEntro, ...o.d.agrSalio]
    return { ...base, cuando: `Hasta el ${dia(o.d.fecha)}`, entroEtiqueta: 'Entró en total', salioEtiqueta: 'Salió en total', quedoEtiqueta: 'Diferencia', entro: e, salio: s, quedo: e - s, nota: agr.length ? `Aquí suma un total de periodo: ${detalleAgregados(agr)}` : undefined }
  }
  if (o.modo === 'dia' && o.d) {
    const d = o.d, agr = [...d.agrEntro, ...d.agrSalio]
    const antesDelSync = d.fecha < o.exactoDesde && d.entro >= 0
    const partes: string[] = []
    if (d.usd > 0) partes.push(`Polar: US$${d.usd.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} netos de comisión`)
    if (agr.length) partes.push(`${agr.length === 1 ? 'Este día lleva' : 'Este día lleva'} un total de periodo, no de un solo día: ${detalleAgregados(agr)}`)
    else if (d.salio === 0) partes.push('Gastos de este día: sin registro por día (llegan en el estado de cuenta del mes)')
    if (antesDelSync) partes.push('Antes del 4 oct el registro diario de Polar solo veía ventas nuevas; las renovaciones entran como ajuste del mes')
    return { ...base, cuando: dia(d.fecha), entro: d.entro, salio: d.salio, quedo: null, nota: partes.join('. ') + (partes.length ? '.' : ''), salioTexto: d.salio === 0 ? 'sin registro' : undefined, cifras: true }
  }
  // Sin apuntar. Por día: solo lo que tiene fecha real (los totales de mes no son de un día).
  if (o.modo === 'dia') return { ...base, cuando: `En ${o.palabraRango}, solo lo que tiene fecha`, entro: o.totalDia.entro, salio: o.totalDia.salio, quedo: null, salioTexto: 'sin gastos con fecha', cifras: true,
    nota: 'Pasa el dedo o el cursor por la gráfica para ver cada día.' }
  // Acumulado: el total del rango.
  const piso = !o.rangoCompleto && o.gastosHasta != null
  const nota = piso ? `Los gastos se conocen hasta el ${fechaCorta(o.gastosHasta!)}${o.cuentaAtrasada ? ` (${nombreCuenta(o.cuentaAtrasada)})` : ''}: después de esa fecha la curva roja está quieta porque falta el estado de cuenta, no porque no hayas gastado.` : undefined
  return { ...base, cuando: `En ${o.palabraRango}`, entro: o.total.entro, salio: o.total.salio, quedo: o.total.entro - o.total.salio, salioPiso: piso && o.total.salio > 0, nota }
}
