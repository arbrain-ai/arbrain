'use client'
/**
 * El nervio de Tu negocio (17 nov 2026): la línea por la que fluye la gente, de izquierda a derecha, con una estación por
 * columna del embudo. Es la pieza «El nervio · cómo fluye la gente» del lienzo v18 (`docs/builds/lienzo-v18/piezas/nervio`)
 * hecha componente: aquí sus estaciones caen bajo las columnas VIVAS del panel (se miden, no se suponen).
 *
 *   · de cada llave (Marketing, Venta, Entrega, Finanzas) bajan ramas finas a sus estaciones, como en el lienzo;
 *   · el núcleo de cada estación se llena según cuántas de sus etapas ya tienen número (encendidas / total);
 *   · el cuello lo marca el embudo (anillo rojo punteado y oro), con su etapa y, si hay aire, su frase de `embudo.json`;
 *   · bajo la línea, el terreno de cada tramo: la curva de 30 días de su órgano (la serie del BI de su receta), con su
 *     nombre y su ventana escritos y el último día en oro;
 *   · el lazo punteado de abajo es la arista que vuelve (casos → tu show), con su estado tal cual, y su leyenda adentro;
 *   · la gente: puntos que entran por la izquierda; en el cuello casi todos se escapan y algunos vuelven por el lazo. Es
 *     METÁFORA (no hay cifra en ellos; el número vive en cada órgano). Sin ninguna etapa con número (la copia del alumno
 *     vacía), no fluye nadie: la línea queda punteada y quieta. Con «reducir movimiento», la foto quieta.
 *
 * Solo transform/opacity en el DOM y un canvas para los puntos: 60 fps sin tocar el layout.
 */
import { useEffect, useRef, useState } from 'react'
import { prefiereQuieto } from '@/shared/movimiento'
import { tr } from '@/shared/i18n'
import { altoDelRio, type Estacion } from './recorrido'
import n from './nervio.module.css'

export interface Lazo { texto: string; estado: string; nota?: string | null }
/** El terreno de un tramo: la serie de 30 días de su órgano, entre la estación `desde` y la `hasta`. */
export interface Banda { organo: string; desde: number; hasta: number; serie: number[]; nombre: string; duele: boolean }
/** Las llaves de arriba: de cada una bajan ramas a sus estaciones. */
export interface Rama { desde: number; hasta: number }

export function Nervio({ xs, estaciones, lazo, cuello, alto, llena, bandas = [], ramas = [], nota, abierta = null, senales = [] }: {
  /** Centro de cada estación, en px desde la izquierda del nervio (las columnas medidas). */
  xs: number[]; estaciones: Estacion[]; lazo: Lazo | null; cuello: { columna: number; texto: string; frase?: string | null } | null
  /** Alto del nervio en px (o el mínimo, si `llena`). */
  alto: number
  /** Toma el alto de su fila (el aire que sobra en la portada es del río). */
  llena?: boolean
  bandas?: Banda[]; ramas?: Rama[]
  /** Sin embudo dibujado: la frase que va bajo el hilo quieto (un texto de la app, nunca un dato). */
  nota?: string
  /** Fase 2: la estación cuya ficha está abierta (se enciende en el río). */
  abierta?: number | null
  /** Por estación: si alguna de sus rutinas falló o corre ahora (de las mismas lecturas del Taller). */
  senales?: ('falla' | 'corre' | null)[]
}) {
  const caja = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(0)
  const [altoFila, setAltoFila] = useState(0)
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => { setAncho(el.clientWidth); setAltoFila(el.clientHeight) }
    const ro = new ResizeObserver(medir); ro.observe(el); medir()
    return () => ro.disconnect()
  }, [])

  // El alto es el de su fila (17 nov 2026): con zoom 1.2 la fila quedaba más baja que el mínimo y el lazo bajaba sobre los
  // nombres de las estaciones. Misma cuenta que el recorrido (`altoDelRio`).
  const W = ancho, H = llena ? altoDelRio(altoFila, alto) : alto
  const conTerreno = bandas.length > 0
  const y = Math.round(H * (lazo || conTerreno ? 0.3 : 0.5))
  const yl = H - 8
  const x0 = 4, xf = Math.max(x0 + 10, W - 18)
  const ola = (x: number) => y + Math.sin((x - x0) / 150) * 3
  const listo = W > 0 && xs.length === 6
  // ¿Fluye alguien? Solo si alguna etapa ya tiene número (nada se enciende sin dato).
  const hayGente = estaciones.some(s => s.encendidas > 0)
  const amplio = H >= 120

  // La gente: un pequeño mundo determinista (semilla fija) que avanza; en el cuello, la mayoría se va.
  useEffect(() => {
    const cv = lienzo.current
    if (!cv || !listo) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
    const g = cv.getContext('2d'); if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    if (!hayGente) return
    const css = getComputedStyle(cv)
    const morado = css.getPropertyValue('--n-morado').trim() || '#8C27F1', oro = css.getPropertyValue('--n-oro').trim() || '#ff9101', mudo = css.getPropertyValue('--n-mudo').trim() || '#a1a1aa'
    const claro = !document.documentElement.classList.contains('dark')
    const cu = cuello ? xs[cuello.columna] : null
    let semilla = 23
    const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
    type P = { x: number; v: number; off: number; fuga: boolean; f: 0 | 1 | 2; y: number; xv: number; yv: number; a: number; lazo: boolean; s: number }
    const gente: P[] = []
    const nacer = (x = x0): P => ({ x, v: 60 + rnd() * 50, off: (rnd() - 0.5) * 7, fuga: cu !== null && rnd() < 0.8, f: 0, y: 0, xv: 0, yv: 0, a: 1, lazo: !!lazo && rnd() < 0.3, s: 0 })
    let acum = 0
    const paso = (dt: number) => {
      acum += dt * 6; while (acum > 1) { gente.push(nacer()); acum -= 1 }
      for (const q of gente) {
        if (q.f === 0) {
          q.x += q.v * dt * (cu !== null && q.x > cu - 60 && q.x < cu ? 0.5 : 1)
          if (q.fuga && cu !== null && q.x > cu - 4) { q.f = 1; q.y = ola(q.x) + q.off; q.xv = 20 + rnd() * 40; q.yv = -(30 + rnd() * 40) }
          if (q.x >= xf) { q.f = 2; if (!q.lazo) q.a = 0 }
        } else if (q.f === 1) { q.x += q.xv * dt; q.y += q.yv * dt; q.yv *= 1 - dt * 0.5; q.a -= dt * 0.9 }
        else { q.s += dt * 0.12; if (q.s >= 1) q.a = 0 }
      }
      for (let i = gente.length - 1; i >= 0; i--) if (gente[i].a <= 0) gente.splice(i, 1)
    }
    // Lazo: de la expansión baja, cruza por debajo hacia la izquierda y sube al inicio.
    const enLazo = (s: number): [number, number] => {
      const largo = (yl - y) + (xf - x0) + (yl - y)
      let d = s * largo
      if (d < yl - y) return [xf, y + d]
      d -= yl - y
      if (d < xf - x0) return [xf - d, yl]
      d -= xf - x0
      return [x0, yl - d]
    }
    const punto = (x: number, yy: number, col: string, r: number, a: number) => {
      g.globalAlpha = a
      if (!claro) { g.fillStyle = col; g.globalAlpha = a * 0.22; g.beginPath(); g.arc(x, yy, r * 2.6, 0, 7); g.fill(); g.globalAlpha = a }
      g.fillStyle = col; g.beginPath(); g.arc(x, yy, r, 0, 7); g.fill()
    }
    // Morado la gente que avanza, gris la que se va en el cuello, oro la que vuelve por el lazo (los casos).
    const pintar = () => {
      g.clearRect(0, 0, W, H)
      for (const q of gente) {
        if (q.f === 0) punto(q.x, ola(q.x) + q.off * (cu !== null && q.x < cu ? 1 : 0.4), morado, 2.5, 0.95)
        else if (q.f === 1) punto(q.x, q.y, mudo, 2.1, Math.max(0, q.a) * 0.85)
        else if (q.lazo) { const [lx, ly] = enLazo(q.s); punto(lx, ly, oro, 2.8, 0.95) }
      }
      g.globalAlpha = 1
    }
    for (let k = 0; k < 16 * 30; k++) paso(1 / 30)
    pintar()
    if (prefiereQuieto()) return
    let raf = 0, antes = performance.now()
    const bucle = (t: number) => {
      const dt = Math.min(0.05, (t - antes) / 1000); antes = t
      if (document.visibilityState === 'visible') { paso(dt); pintar() }
      raf = requestAnimationFrame(bucle)
    }
    raf = requestAnimationFrame(bucle)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, W, H, xs.join(','), cuello?.columna, !!lazo, hayGente])

  let d = `M${x0} ${ola(x0).toFixed(1)}`
  for (let x = x0 + 8; x <= xf; x += 8) d += ` L${x} ${ola(x).toFixed(1)}`
  const dLazo = `M${xf} ${ola(xf).toFixed(1)} L${xf} ${yl - 14} Q ${xf} ${yl} ${xf - 14} ${yl} L ${x0 + 14} ${yl} Q ${x0} ${yl} ${x0} ${yl - 14} L ${x0} ${ola(x0).toFixed(1)}`
  // El terreno vive entre la línea y el lazo.
  const tTop = y + 16, tBot = yl - 18
  const fin = (h: number) => (h + 1 < xs.length ? xs[h + 1] - 22 : xf - 6)
  // La leyenda del lazo va adentro, en el hueco más ancho entre dos estaciones (nunca sobre una).
  const hueco = xs.length === 6 ? xs.slice(0, 5).map((x, i) => [x, xs[i + 1]] as const).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a)) : [x0, xf] as const
  const fraseCorta = cuello?.frase ? cuello.frase.split(/[:.]/)[0].trim() : null

  return <div ref={caja} className={n.nervio} style={llena ? undefined : { height: H }} data-llena={llena || undefined} data-quieto={!hayGente || undefined} aria-hidden>
    {listo && <svg className={n.svg} viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {/* Las ramas: de cada llave a sus estaciones (como las dendritas de «El nervio»). */}
      {ramas.map(rm => { const xm = (xs[rm.desde] + xs[rm.hasta]) / 2 + 30
        return Array.from({ length: rm.hasta - rm.desde + 1 }, (_, k) => rm.desde + k).map(i =>
          <path key={`${rm.desde}-${i}`} className={n.rama} d={`M${xm.toFixed(1)} 0 C ${xm.toFixed(1)} ${(y * 0.55).toFixed(1)}, ${xs[i].toFixed(1)} ${(y * 0.25).toFixed(1)}, ${xs[i].toFixed(1)} ${(ola(xs[i]) - 15).toFixed(1)}`} />) })}
      {/* El terreno: la curva de 30 días de cada tramo, bajo su línea. */}
      {tBot - tTop >= 14 && bandas.map(b => {
        const xi = xs[b.desde] - 2, xfB = fin(b.hasta), w = Math.max(10, xfB - xi), h = tBot - tTop
        const lo = Math.min(...b.serie), hi = Math.max(...b.serie), sp = hi - lo || 1
        const X = (k: number) => xi + (k / (b.serie.length - 1)) * w
        const Y = (v: number) => tBot - ((v - lo) / sp) * (h - 14)
        const linea = `M${b.serie.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}`
        const u = b.serie.length - 1
        return <g key={b.organo} className={n.banda} data-curva={b.serie.length} data-organo={b.organo} data-duele={b.duele || undefined}>
          <path className={n.bandaArea} d={`${linea}L${(xi + w).toFixed(1)},${tBot}L${xi.toFixed(1)},${tBot}Z`} />
          <path className={n.bandaTrazo} d={linea} />
          <circle className={n.bandaHoy} cx={X(u)} cy={Y(b.serie[u])} r={3.5} />
          <text className={n.bandaNombre} x={xs[b.desde] + (cuello?.columna === b.desde ? 32 : 25)} y={tTop + 9}>{tr('{nombre} · 30 días', { nombre: b.nombre })}</text>
        </g>
      })}
      <path d={d} className={n.halo} data-quieto={!hayGente || undefined} />
      <path d={d} className={n.linea} data-quieto={!hayGente || undefined} />
      {lazo && <path d={dLazo} className={n.lazo} data-por-construir={/construir/i.test(lazo.estado) || undefined} />}
      {lazo && <text x={(hueco[0] + hueco[1]) / 2} y={yl - 10} textAnchor="middle" className={n.lazoTexto}>{`${lazo.texto} · ${lazo.estado}`}</text>}
      {hayGente && amplio && <text x={(xs[0] ?? x0) + 30} y={y - 14} className={n.entra}>{tr('la gente de afuera →')}</text>}
      {!hayGente && nota && H >= 90 && <text x={((xs[0] ?? x0) + (xs[xs.length - 1] ?? xf)) / 2} y={y + 44} textAnchor="middle" className={n.nota}>{nota}</text>}
      {xs.map((x, i) => {
        const s = estaciones[i], es = cuello?.columna === i, f = s.etapas.length ? s.encendidas / s.etapas.length : 0
        return <g key={s.columna} transform={`translate(${x.toFixed(1)} ${ola(x).toFixed(1)})`} className={n.estacion} data-cuello={es || undefined} data-apagada={s.encendidas === 0 || undefined} data-abierta={abierta === i || undefined} style={{ ['--k' as string]: i }}>
          <circle r={es ? 26 : 19} className={n.aura} />
          <circle r={13} className={n.anillo} />
          <circle r={2.5 + 5.5 * f} className={n.nucleo} />
          {es && <circle r={21} className={n.cuelloAnillo} />}
          {senales[i] === 'falla' && <circle cx={es ? 22 : 13} cy={es ? -22 : -13} r={5} className={n.falla}><title>{tr('Una rutina de esta estación falló en su última corrida')}</title></circle>}
          {senales[i] === 'corre' && <circle r={16} className={n.corre} />}
        </g>
      })}
      {/* Con aire, el cuello lleva su etapa y su frase del embudo; apretado, solo «el cuello» (la frase de arriba la dice). */}
      {cuello && (amplio
        ? <text x={xs[cuello.columna] + 32} y={y - 34} className={n.cuelloTexto}>{tr('el cuello')}<tspan x={xs[cuello.columna] + 32} dy={14} className={n.cuelloFrase}>{fraseCorta ?? cuello.texto}</tspan></text>
        : <text x={xs[cuello.columna] + 30} y={y - 13} className={n.cuelloTexto}>{tr('el cuello')}</text>)}
    </svg>}
    <canvas ref={lienzo} className={n.gente} style={{ width: W, height: H }} />
  </div>
}
