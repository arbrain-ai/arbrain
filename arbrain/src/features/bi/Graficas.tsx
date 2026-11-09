'use client'
/**
 * Business Intelligence · las gráficas (7 nov 2026). SVG propio, sin librería: el corredor de lo normal es la pieza central
 * y ninguna librería lo dibuja como lo pensamos. Cada gráfica se dibuja «como se explica» la primera vez que llega su dato
 * (corredor → línea → el punto que importa → la marca de Levy) y nunca otra vez en cada relectura.
 * Las curvas son monótonas (Fritsch–Carlson): suaves sin inventar picos que no existen entre dos días.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cifraDe, type Consulta } from './catalogo'
import { diaYMes, type Lectura, type PuntoLeido, type Tono } from './modelo'
import g from './graficas.module.css'

/** El ancho real del contenedor: el texto del SVG se queda a su tamaño (nada de viewBox que lo encoja en el teléfono). */
export function useAncho<T extends HTMLElement>(inicial = 480) {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(inicial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setAncho(Math.round(el.getBoundingClientRect().width) || inicial)
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setAncho(w) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [inicial])
  return [ref, ancho] as const
}

type P = [number, number]
/** Camino monótono por puntos ordenados en x. */
export function monotono(pts: P[]): string {
  const n = pts.length
  if (!n) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1)) }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]))
  t.push(m[n - 2])
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`
  }
  return d
}
const f = (n: number) => Math.round(n * 10) / 10

/** Tramos continuos (sin huecos) de una lista con nulos. */
function tramos<T>(xs: T[], vale: (x: T) => boolean): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  for (const x of xs) { if (vale(x)) cur.push(x); else if (cur.length) { out.push(cur); cur = [] } }
  if (cur.length) out.push(cur)
  return out
}

/** Escala «bonita» del eje: redondea el tope para que la etiqueta se lea. */
function tope(max: number) {
  if (max <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(max))), r = max / e
  return (r <= 1 ? 1 : r <= 1.2 ? 1.2 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 4 ? 4 : r <= 5 ? 5 : r <= 6 ? 6 : r <= 8 ? 8 : 10) * e
}

const colorTono = (t: Tono | undefined) => (t === 'dolor' ? 'var(--bi-dolor)' : t === 'placer' ? 'var(--bi-placer)' : 'var(--bi-atencion)')

function Marca({ x, y, texto, ancho, arriba, tono }: { x: number; y: number; texto: string; ancho: number; arriba: number; tono?: Tono }) {
  const ancla = x > ancho * 0.72 ? 'end' : x < ancho * 0.28 ? 'start' : 'middle'
  return <g className={g.marca} style={{ '--marca': tono ? colorTono(tono) : 'var(--bi-tinta-marca)' } as CSSProperties}>
    <line x1={x} x2={x} y1={arriba + 6} y2={y - 7} className={g.guia} />
    <text x={ancla === 'end' ? x + 4 : ancla === 'start' ? x - 4 : x} y={arriba} textAnchor={ancla} className={g.marcaTexto}>{texto}</text>
  </g>
}

/** La serie con su corredor de lo normal. */
export function SerieCorredor({ c, lectura, dibuja, alto = 168 }: { c: Consulta; lectura: Lectura; dibuja: boolean; alto?: number }) {
  const [ref, W] = useAncho<HTMLDivElement>()
  const pts = lectura.puntos ?? []
  const H = alto, izq = 2, der = 2, arriba = 36, abajo = 22
  const vals = pts.flatMap(p => [p.valor, p.corredor?.lo, p.corredor?.hi]).filter((v): v is number => typeof v === 'number')
  // Un nivel (suscripciones, MRR, ticket promedio) se lee mejor desde su rango; lo que se cuenta, desde cero.
  const cero = !(c.unidad === 'suscripciones' || c.id === 'mrr' || c.id === 'ticket-promedio')
  let lo = cero ? 0 : Math.min(...vals), hi = Math.max(...vals, 1)
  if (!cero) { const pad = (hi - lo) * 0.18 || hi * 0.02; lo -= pad; hi += pad } else hi = tope(hi * 1.08)
  const x = (i: number) => izq + (pts.length <= 1 ? (W - izq - der) / 2 : (i * (W - izq - der)) / (pts.length - 1))
  const y = (v: number) => arriba + (1 - (v - lo) / (hi - lo || 1)) * (H - arriba - abajo)
  const conCor = tramos(pts.map((p, i) => ({ p, i })), e => !!e.p.corredor)
  const linea = tramos(pts.map((p, i) => ({ p, i })), e => e.p.valor !== null)
  const ult = [...pts.keys()].reverse().find(i => pts[i].valor !== null)
  const an = lectura.anotacion
  const tono = lectura.senal?.tono
  return <div ref={ref} className={`${g.lienzo} ${dibuja ? g.dibuja : ''}`} data-tono={tono}>
    <svg width={W} height={H} role="img" aria-label={`${c.nombre}: ${lectura.frase}`}>
      <defs>
        <linearGradient id={`cor-${c.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--bi-corredor)" stopOpacity="0.30" />
          <stop offset="0.5" stopColor="var(--bi-corredor)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--bi-corredor)" stopOpacity="0.30" />
        </linearGradient>
      </defs>
      {/* La rejilla: solo la base y el tope, en tinta tenue. */}
      <line x1={0} x2={W} y1={y(lo)} y2={y(lo)} className={g.base} />
      <line x1={0} x2={W} y1={y(hi)} y2={y(hi)} className={g.tope} />
      <text x={0} y={arriba - 4} className={g.eje}>{cifraDe(hi, c)}</text>
      {!cero && <text x={0} y={H - abajo - 4} className={g.eje}>{cifraDe(lo, c)}</text>}
      {conCor.map((t, k) => {
        const altoP: P[] = t.map(e => [x(e.i), y(e.p.corredor!.hi)] as P), bajoP: P[] = t.map(e => [x(e.i), y(e.p.corredor!.lo)] as P).reverse()
        const d = `${monotono(altoP)} L${monotono(bajoP).slice(1)} Z`
        return <g key={k} className={g.corredor}>
          <path d={d} fill={`url(#cor-${c.id})`} />
          <path d={monotono(altoP)} className={g.borde} />
          <path d={monotono(t.map(e => [x(e.i), y(e.p.corredor!.lo)] as P))} className={g.borde} />
        </g>
      })}
      {linea.map((t, k) => <path key={k} d={monotono(t.map(e => [x(e.i), y(e.p.valor as number)] as P))} className={g.linea} pathLength={1} />)}
      {pts.map((p, i) => p.valor === null ? <line key={`h${i}`} x1={x(i)} x2={x(i)} y1={H - abajo - 3} y2={H - abajo + 3} className={g.hueco} /> : null)}
      {pts.map((p, i) => p.lado && i !== ult ? <circle key={`o${i}`} cx={x(i)} cy={y(p.valor as number)} r={p.exceso >= 0.5 ? 3.2 : 2.4} className={g.fuera} data-fuerte={p.exceso >= 0.5 || undefined} /> : null)}
      {ult !== undefined && <g className={g.ahora} data-estado={lectura.estado} style={{ '--x': `${x(ult)}px`, '--y': `${y(pts[ult].valor as number)}px` } as CSSProperties}>
        <circle cx={x(ult)} cy={y(pts[ult].valor as number)} r={9} className={g.halo} />
        <circle cx={x(ult)} cy={y(pts[ult].valor as number)} r={4} className={g.punto} />
      </g>}
      {an && pts[an.indice]?.valor !== null && pts[an.indice] && <Marca x={x(an.indice)} y={y(pts[an.indice].valor as number)} texto={an.texto} ancho={W} arriba={13} tono={lectura.estado === 'fuera' ? tono : undefined} />}
      {pts.length > 1 && <>
        <text x={x(0)} y={H - 5} className={g.eje}>{diaYMes(pts[0].fecha)}</text>
        <text x={x(pts.length - 1)} y={H - 5} textAnchor="end" className={g.eje}>{diaYMes(pts[pts.length - 1].fecha)}</text>
      </>}
    </svg>
  </div>
}

/** El mes en curso contra la sombra del mes pasado, acumulados día a día. */
export function Acumulado({ c, lectura, dibuja, alto = 168 }: { c: Pick<Consulta, 'unidad' | 'moneda'>; lectura: Lectura; dibuja: boolean; alto?: number }) {
  const [ref, W] = useAncho<HTMLDivElement>()
  const m = lectura.meses
  if (!m) return null
  const H = alto, arriba = 36, abajo = 22, dias = 31
  const max = tope(Math.max(...m.este.filter((v): v is number => v !== null), ...m.anterior.filter((v): v is number => v !== null), 1) * 1.05)
  const x = (d: number) => 2 + ((d - 1) * (W - 4)) / (dias - 1)
  const y = (v: number) => arriba + (1 - v / max) * (H - arriba - abajo)
  const ant: P[] = m.anterior.map((v, i) => [x(i + 1), y(v ?? 0)])
  const est: P[] = m.este.flatMap((v, i) => (v === null ? [] : [[x(i + 1), y(v)] as P]))
  const ult = est[est.length - 1]
  const area = est.length ? `${monotono(est)} L${f(ult[0])},${f(y(0))} L${f(est[0][0])},${f(y(0))} Z` : ''
  return <div ref={ref} className={`${g.lienzo} ${dibuja ? g.dibuja : ''}`}>
    <svg width={W} height={H} role="img" aria-label={lectura.frase}>
      <defs>
        <linearGradient id="acum-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--bi-placer)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--bi-placer)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className={g.base} />
      <line x1={0} x2={W} y1={y(max)} y2={y(max)} className={g.tope} />
      <text x={0} y={arriba - 4} className={g.eje}>{cifraDe(max, c)}</text>
      <path d={monotono(ant)} className={g.sombra} />
      {area && <path d={area} fill="url(#acum-area)" className={g.corredor} />}
      {est.length > 1 && <path d={monotono(est)} className={`${g.linea} ${g.oro}`} pathLength={1} />}
      {ult && <g className={g.ahora} data-estado="calma"><circle cx={ult[0]} cy={ult[1]} r={9} className={g.halo} /><circle cx={ult[0]} cy={ult[1]} r={4} className={`${g.punto} ${g.puntoOro}`} /></g>}
      {ult && lectura.anotacion && <Marca x={ult[0]} y={ult[1]} texto={lectura.anotacion.texto} ancho={W} arriba={13} />}
      <text x={x(1)} y={H - 5} className={g.eje}>1</text>
      <text x={x(15)} y={H - 5} textAnchor="middle" className={g.eje}>15</text>
      <text x={x(31)} y={H - 5} textAnchor="end" className={g.eje}>31</text>
    </svg>
    <p className={g.leyenda}><i className={g.llave} data-oro />{m.etiquetaEste}<i className={g.llave} data-sombra />{m.etiquetaAnterior}, a la misma altura del mes</p>
  </div>
}

/** Ranking: barras horizontales con su etiqueta encima (los títulos largos caben en el teléfono). */
export function Barras({ c, lectura, dibuja }: { c: Consulta; lectura: Lectura; dibuja: boolean }) {
  const barras = lectura.barras ?? [], resto = lectura.resto
  const max = Math.max(...barras.map(b => b.valor), resto?.valor ?? 0, 1)
  return <ol className={`${g.barras} ${dibuja ? g.dibuja : ''}`}>
    {barras.map((b, i) => <li key={b.id} data-primera={i === 0 || undefined} style={{ '--i': i, '--w': `${Math.max(1.5, (b.valor / max) * 100)}%` } as CSSProperties}>
      <span className={g.barraEtiqueta} title={b.etiqueta}>{b.etiqueta}</span>
      <span className={g.barraFila}><span className={g.barra} /><b className={g.barraValor}>{cifraDe(b.valor, c)}</b></span>
      {i === 0 && lectura.anotacion && <em className={g.barraMarca}>{lectura.anotacion.texto}</em>}
    </li>)}
    {resto && resto.valor > 0 && <li data-resto style={{ '--i': barras.length, '--w': `${Math.max(1.5, (resto.valor / max) * 100)}%` } as CSSProperties}>
      <span className={g.barraEtiqueta}>{resto.etiqueta}</span>
      <span className={g.barraFila}><span className={g.barra} /><b className={g.barraValor}>{cifraDe(resto.valor, c)}</b></span>
    </li>}
  </ol>
}

/** Proporción: una sola barra partida; el trozo más grande en oro. */
export function Proporcion({ c, lectura, dibuja }: { c: Consulta; lectura: Lectura; dibuja: boolean }) {
  const barras = [...(lectura.barras ?? []), ...(lectura.resto?.valor ? [lectura.resto] : [])]
  const total = barras.reduce((s, b) => s + b.valor, 0) || 1
  return <div className={`${g.proporcion} ${dibuja ? g.dibuja : ''}`}>
    <div className={g.tira} role="img" aria-label={lectura.frase}>
      {barras.map((b, i) => <span key={b.id} data-i={i} style={{ '--w': `${(b.valor / total) * 100}%`, '--i': i } as CSSProperties} />)}
    </div>
    <ul className={g.partes}>
      {barras.map((b, i) => <li key={b.id} data-i={i}><i aria-hidden /><span>{b.etiqueta}</span><b>{Math.round((b.valor / total) * 100)} %</b><small>{cifraDe(b.valor, c)}</small></li>)}
    </ul>
  </div>
}

/** El embudo: cada paso con su gente, y entre pasos cuánto pasa; el paso más estrecho se marca. */
export function Embudo({ c, lectura, dibuja }: { c: Consulta; lectura: Lectura; dibuja: boolean }) {
  const pasos = lectura.pasos ?? []
  const primero = pasos[0]?.valor || 1
  const peor = lectura.anotacion?.indice
  return <ol className={`${g.embudo} ${dibuja ? g.dibuja : ''}`}>
    {pasos.map((p, i) => <li key={p.etiqueta} style={{ '--i': i, '--w': `${Math.max(1.2, Math.sqrt(p.valor / primero) * 100)}%` } as CSSProperties} data-peor={i === peor || undefined}>
      {i > 0 && <span className={g.paso} data-peor={i === peor || undefined}>{p.paso === null ? '—' : `pasa ${Math.round(p.paso * 100)} %`}{i === peor ? ' · aquí se cae' : ''}</span>}
      <span className={g.embudoFila}>
        <span className={g.embudoEtiqueta}>{p.etiqueta}</span>
        <span className={g.embudoCarril}><span className={g.embudoBarra} /></span>
        <b className={g.embudoValor}>{cifraDe(p.valor, c)}</b>
      </span>
    </li>)}
    <li className={g.escala} aria-hidden>Ancho en raíz cuadrada: los pasos chicos se siguen viendo.</li>
  </ol>
}

/** El boceto mientras Levy piensa: una línea que se dibuja sola y se borra, sin datos. */
export function Boceto() {
  return <svg className={g.boceto} viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden>
    <path d="M4,70 C40,64 60,40 92,46 C124,52 140,30 170,26 C200,22 220,48 250,38 C270,31 284,22 296,18" pathLength={1} />
  </svg>
}

/** Una lectura pequeña que no se repite: ¿ya se dibujó esta gráfica en esta sesión? */
const dibujadas = new Set<string>()
export function usePrimeraVez(clave: string, listo: boolean) {
  const [dibuja, setDibuja] = useState(() => listo && !dibujadas.has(clave))
  useEffect(() => {
    if (!listo) return
    if (dibujadas.has(clave)) return
    dibujadas.add(clave)
    setDibuja(true)
    const t = setTimeout(() => setDibuja(false), 2600)
    return () => clearTimeout(t)
  }, [clave, listo])
  return dibuja
}

export type { PuntoLeido }
