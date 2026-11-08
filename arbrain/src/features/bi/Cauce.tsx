'use client'
/**
 * Business Intelligence · el cuello (7 nov 2026; Goldratt: el sistema avanza al paso de su etapa más estrecha). Se lee de
 * `embudo.json` (`etapas[].cuello.es`, uno solo). El embudo que lo contiene se dibuja como un cauce: las etapas en orden y,
 * en el cuello, el cauce se estrecha. Lo que corre por dentro no son conteos: es la imagen de la regla (lo que llega se
 * amontona antes del cuello y pasa de uno en uno). Tapas los textos y sigues viendo dónde se atora.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { cuelloDe, fechaCorta, type Embudo, type Etapa } from '@/features/negocio/embudo'
import { prefiereQuieto } from '@/shared/movimiento'
import { useAncho } from './Graficas'
import c from './bi.module.css'

const GOTAS = 22

export function Cauce({ embudo, abrir }: { embudo: Embudo | null; abrir?: () => void }) {
  const cuello = embudo ? cuelloDe(embudo) : null
  const etapas: Etapa[] = cuello && embudo ? embudo.etapas.filter(e => e.embudo === cuello.embudo).sort((a, b) => a.orden - b.orden) : []
  const nombreEmbudo = cuello && embudo ? embudo.embudos?.find(e => e.id === cuello.embudo)?.nombre ?? cuello.embudo : null
  const [ref, W] = useAncho<HTMLDivElement>(480)
  const gotas = useRef<(SVGCircleElement | null)[]>([])
  const H = 104, eje = 50
  const n = etapas.length
  const iCuello = etapas.findIndex(e => e === cuello)
  // Si el cuello es la última etapa, el cauce sigue un tramo después: lo que pasa, pasa de una en una y se va.
  const cola = iCuello === n - 1 ? Math.max(44, W * 0.13) : 14
  const x = (i: number) => (n <= 1 ? W / 2 : 14 + (i * (W - 14 - cola)) / (n - 1))
  const xc = iCuello >= 0 ? x(iCuello) : W / 2
  // Medio ancho del cauce en cada x: 11 px, y en el cuello baja a 2.5 (una gota a la vez).
  const medio = (px: number) => 15 - 12 * Math.exp(-Math.pow((px - xc) / Math.max(20, W * 0.055), 2))

  useEffect(() => {
    if (!cuello || prefiereQuieto()) return
    let raf = 0, t0 = performance.now(), visible = true
    const pos = Array.from({ length: GOTAS }, (_, i) => ({ x: (i / GOTAS) * W, carril: ((i * 7) % 5) / 4 - 0.5 }))
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    if (ref.current) io.observe(ref.current)
    const paso = (t: number) => {
      const dt = Math.min(0.05, (t - t0) / 1000); t0 = t
      if (visible) {
        // Antes del cuello frenan (la fila); en el cuello pasan despacio; después corren.
        pos.sort((a, b) => a.x - b.x)
        for (let i = pos.length - 1; i >= 0; i--) {
          const p = pos[i]
          const d = p.x - xc
          const v = d < -W * 0.18 ? 34 : d < 0 ? 34 * Math.max(0.08, -d / (W * 0.18)) : d < 14 ? 7 : 46
          let nx = p.x + v * dt
          const sig = pos[i + 1]
          if (sig && d < 0 && sig.x - nx < 7 && sig.x < xc + 10) nx = Math.max(p.x, sig.x - 7)
          p.x = nx > W + 6 ? -6 - (i % 3) * 4 : nx
        }
        pos.forEach((p, i) => {
          const el = gotas.current[i]
          if (el) el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(eje + p.carril * 2 * Math.max(0, medio(p.x) - 2.5)).toFixed(1)})`)
        })
      }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => { cancelAnimationFrame(raf); io.disconnect() }
  }, [cuello, W, xc]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!embudo) return null
  if (!cuello) return <section className={c.cuello} data-sin-cuello aria-label="El cuello">
    <p className={c.cuelloCeja}>El cuello</p>
    <p className={c.cuelloFrase}>Tu embudo todavía no marca un cuello de botella. Pídeselo a Levy: «¿cuál es el cuello de mi negocio?».</p>
  </section>

  // El contorno del cauce: arriba y abajo, muestreado.
  const muestras = Array.from({ length: 48 }, (_, k) => (k / 47) * W)
  const arriba = muestras.map((px, k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${(eje - medio(px)).toFixed(1)}`).join(' ')
  const abajo = [...muestras].reverse().map(px => `L${px.toFixed(1)},${(eje + medio(px)).toFixed(1)}`).join(' ')
  // Rótulos en dos filas (pares abajo, nones arriba) para que quepan los seis desde 300 px.
  const visibles = (i: number) => i === 0 || i === iCuello || i === n - 1 || W >= 300
  const ancla = (i: number) => (i === 0 ? 'start' : i === n - 1 && iCuello !== n - 1 ? 'end' : 'middle')
  return <section className={c.cuello} aria-label={`El cuello: ${cuello.nombre}`}>
    <header className={c.cuelloCabeza}>
      <p className={c.cuelloCeja}>El cuello · <span>{nombreEmbudo}</span></p>
      {abrir && <button type="button" className={c.cuelloAbrir} onClick={abrir}>El sistema<ChevronRight size={13} aria-hidden /></button>}
    </header>
    <div ref={ref} className={c.cauce}>
      <svg width={W} height={H} aria-hidden>
        <defs>
          <linearGradient id="cauce-agua" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--bi-corredor)" stopOpacity="0.10" />
            <stop offset={Math.max(0.01, (xc - 30) / W)} stopColor="var(--bi-corredor)" stopOpacity="0.32" />
            <stop offset={Math.min(0.99, xc / W)} stopColor="var(--bi-placer)" stopOpacity="0.55" />
            <stop offset={Math.min(1, (xc + 40) / W)} stopColor="var(--bi-corredor)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--bi-corredor)" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        <path d={`${arriba} ${abajo} Z`} fill="url(#cauce-agua)" className={c.cauceAgua} />
        <path d={arriba} className={c.cauceOrilla} />
        <path d={muestras.map((px, k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${(eje + medio(px)).toFixed(1)}`).join(' ')} className={c.cauceOrilla} />
        {Array.from({ length: GOTAS }, (_, i) => <circle key={i} ref={el => { gotas.current[i] = el }} r={2.6} className={c.gota} transform={`translate(${((i / GOTAS) * W).toFixed(1)} ${eje})`} />)}
        {etapas.map((e, i) => <g key={e.id} className={c.etapa} data-cuello={i === iCuello || undefined} data-opera={e.opera_hoy || undefined}>
          <line x1={x(i)} x2={x(i)} y1={eje - medio(x(i)) - 5} y2={eje + medio(x(i)) + 5} />
          {visibles(i) && <text x={i === 0 ? Math.max(0, x(i) - 6) : x(i)} y={i % 2 ? 13 : H - 6} textAnchor={ancla(i)}>{e.nombre}</text>}
        </g>)}
      </svg>
    </div>
    <p className={c.cuelloFrase}><b style={{ '--c': 'var(--bi-placer)' } as CSSProperties}>{cuello.nombre}.</b> {cuello.cuello.frase}</p>
    {cuello.cuello.evidencia && <p className={c.cuelloEvidencia}>Lo marcó tu embudo · {fechaCorta(cuello.cuello.evidencia.fecha)}</p>}
  </section>
}
