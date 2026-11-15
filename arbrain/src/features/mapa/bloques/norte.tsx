'use client'
/**
 * Bloques de MI NORTE (mapa v16, 14 nov 2026).
 *
 *   estrella    el círculo NOVA de adentro hacia afuera: un núcleo (el porqué y el para qué) y sus anillos (Mi juego
 *               infinito, Nicho, Oferta, Vehículo, Atención). Es el corte de una estrella: la luz nace en el centro (oro) y
 *               se enfría hacia afuera (morado); de cerca, cada pocos segundos una onda sale del porqué y enciende cada
 *               anillo al cruzarlo. A la derecha, la lámina: una nota por anillo, unida a él por su hilo.
 *               { nucleo: {rotulo, frase}, anillos: [{id, nombre, inicial?, tono?: 'oro'|'mezcla'|'morado'}],
 *                 notas: [{anillo, partes: [{rotulo, glosa?, fecha?, sello?, frase?, tam?, linea?, chips?, vivo?, boton?}]}] }
 *   ecuacion    la ecuación de valor que se toca: arriba lo que gana, abajo lo que cuesta, y el medidor.
 *               { titulo, arriba: [a, b], abajo: [c, d], pista? }
 *   triangulo   tres vértices que se piden algo entre sí (Kennedy). { ceja, titulo, vertices: [3], frase }
 *   etapas      N etapas que suben, con las que ganan marcadas (Schwartz). { ceja, titulo, subtitulo?, n, marcas: [{etapa, texto, tono}] }
 *   identidad   una identidad que se abre en caminos. { ceja, titulo, identidad, caminos: [] }
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Boton, Ceja, Hueco, SelloDe, Respira, esBoton } from '../piezas'
import { esObj, esTexto, lista, numero, texto, type ComponenteBloque, type PropsBloque } from '../tipos'
import { usePulso } from '../datos'
import type { Organo } from '@/features/negocio/pulso'
import s from '../isla.module.css'
import n from './norte.module.css'

const ORGANOS: readonly Organo[] = ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas']

/** Un número vivo en una línea: «hoy · 12 vistas…». Solo `pulso:<órgano>` (la forma de El pulso). */
function VivoEnLinea({ fuente, prefijo }: { fuente: string; prefijo?: string }) {
  const organo = fuente.replace(/^pulso:/, '') as Organo
  const valido = fuente.startsWith('pulso:') && ORGANOS.includes(organo)
  const p = usePulso(valido ? organo : 'marketing', valido)
  if (!valido) return null
  const cifra = p.estado === 'numero' ? p.cifra : p.estado === 'sin-sensor' ? 'sin sensor' : p.estado === 'leyendo' ? '…' : p.estado === 'oculto' ? '••••' : 'sin dato'
  const unidad = p.estado === 'numero' ? p.unidad : p.estado === 'sin-sensor' ? p.falta : p.estado === 'error' ? p.error : ''
  return <div className={n.vivo} data-estado={p.estado}>
    <Respira apagado={p.estado !== 'numero'} />
    <span className={n.vivoPre}>{prefijo ?? 'hoy'}</span>
    <b data-late={p.estado === 'numero' ? cifra : undefined}>{cifra}</b>
    {unidad ? <span className={n.vivoUnidad}>{unidad}</span> : null}
  </div>
}

// ── NOVA ──
interface Anillo { id: string; nombre: string; inicial?: string; tono?: string }
const esAnillo = (x: unknown): x is Anillo => esObj(x) && esTexto(x.id) && esTexto(x.nombre)
interface Parte { rotulo?: string; glosa?: string; fecha?: string; sello?: unknown; frase?: string; tam?: number; linea?: string; chips?: string[]; vivo?: { fuente: string; prefijo?: string }; boton?: unknown }
interface Nota { anillo: string; partes: Parte[] }
const esNota = (x: unknown): x is Nota => esObj(x) && esTexto(x.anillo) && Array.isArray(x.partes)

const C = 500, R0 = 132, R_FIN = 467          // en el viewBox de 1000
const colorAnillo = (tono: string | undefined, i: number, total: number) =>
  tono === 'oro' ? 'var(--i-oro)' : tono === 'morado' ? 'var(--i-mor)' : `color-mix(in srgb, var(--i-oro) ${Math.round(100 - (i / Math.max(1, total - 1)) * 100)}%, var(--i-mor))`
const tintaAnillo = (tono: string | undefined) => (tono === 'oro' ? 'var(--i-oro-tinta)' : 'var(--i-mor-tinta)')

function Nova({ b: r, ctx }: PropsBloque) {
  const anillos = lista(r.anillos, esAnillo)
  const notas = lista(r.notas, esNota)
  const nucleo = esObj(r.nucleo) ? r.nucleo : {}
  const caja = useRef<HTMLDivElement>(null)
  const estrella = useRef<HTMLDivElement>(null)
  const lamina = useRef<HTMLDivElement>(null)
  const [hilos, setHilos] = useState<{ id: string; d: string; px: number; py: number }[]>([])
  const [foco, setFoco] = useState<string | null>(null)
  // los radios: el núcleo y luego un anillo por cada uno, repartidos hasta el borde
  const radios = useMemo(() => {
    const paso = (R_FIN - R0) / Math.max(1, anillos.length)
    const m = new Map<string, { r0: number; r1: number; rm: number }>([['nucleo', { r0: 0, r1: R0, rm: R0 }]])
    anillos.forEach((a, i) => { const r0 = R0 + i * paso, r1 = r0 + paso; m.set(a.id, { r0, r1, rm: (r0 + r1) / 2 }) })
    return m
  }, [anillos])

  // los hilos: del punto del anillo que mira a su nota, hasta la nota (se miden en la isla ya pintada)
  useLayoutEffect(() => {
    const cj = caja.current, es = estrella.current, lm = lamina.current
    if (!cj || !es || !lm) return
    const medir = () => {
      const D = Math.min(es.offsetWidth, es.offsetHeight)         // diámetro de la estrella en px (el SVG es cuadrado)
      const k = D / 1000, oy = (es.offsetHeight - D) / 2
      const cx = C * k, cy = oy + C * k
      const out: typeof hilos = []
      for (const nota of lm.querySelectorAll<HTMLElement>('article[data-anillo]')) {
        const id = nota.dataset.anillo!, rr = radios.get(id); if (!rr) continue
        const xN = lm.offsetLeft - es.offsetLeft - 10, yN = lm.offsetTop + nota.offsetTop - es.offsetTop + 13
        let ang = Math.atan2(yN - cy, xN - cx)
        if (Math.abs(ang) < 0.26) ang = (yN >= cy ? 1 : -1) * 0.26          // el eje es de N O V A: ningún hilo nace sobre él
        const rad = (id === 'nucleo' ? rr.r1 : rr.rm) * k
        const px = cx + rad * Math.cos(ang), py = cy + rad * Math.sin(ang)
        const mx = px + (xN - px) * 0.55
        out.push({ id, px, py, d: `M ${px.toFixed(1)} ${py.toFixed(1)} C ${mx.toFixed(1)} ${(py + (yN - py) * 0.15).toFixed(1)}, ${mx.toFixed(1)} ${yN.toFixed(1)}, ${xN.toFixed(1)} ${yN.toFixed(1)}` })
      }
      setHilos(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
    }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(cj); ro.observe(es); ro.observe(lm)
    return () => ro.disconnect()
  }, [radios, notas.length])

  if (!anillos.length) return <Hueco>nova sin «anillos»</Hueco>
  // la onda tarda 3.2 s en salir del núcleo al borde (ease-out cúbica): cuándo cruza cada anillo
  const cruce = (rm: number) => 3.2 * (1 - Math.cbrt(1 - (rm - R0) / (R_FIN - R0)))
  const colorDe = (id: string) => { const i = anillos.findIndex(a => a.id === id); return i < 0 ? 'var(--i-oro)' : colorAnillo(anillos[i].tono, i, anillos.length) }
  return <div ref={caja} className={n.nova} data-foco={foco ?? undefined}>
    <div ref={estrella} className={n.estrella} onMouseLeave={() => setFoco(null)}>
      <svg viewBox="0 0 1000 1000" className={n.svg} aria-label={texto(r.titulo, 'El círculo NOVA')}>
        <defs>
          <radialGradient id="nova-nucleo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6e6" /><stop offset="38%" stopColor="var(--i-oro)" /><stop offset="100%" stopColor="var(--i-oro)" stopOpacity="0" />
          </radialGradient>
          <filter id="nova-halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18" /></filter>
          {anillos.map(a => { const rr = radios.get(a.id)!; const ra = rr.rm - 5
            return <path key={a.id} id={`nova-arco-${a.id}`} d={`M ${C + ra * Math.sin(-70 * Math.PI / 180)} ${C - ra * Math.cos(-70 * Math.PI / 180)} A ${ra} ${ra} 0 0 1 ${C + ra * Math.sin(70 * Math.PI / 180)} ${C - ra * Math.cos(70 * Math.PI / 180)}`} fill="none" /> })}
        </defs>
        {[...anillos].reverse().map(a => { const i = anillos.indexOf(a), rr = radios.get(a.id)!, col = colorAnillo(a.tono, i, anillos.length)
          return <g key={a.id} className={n.banda} data-anillo={a.id} data-apagado={foco && foco !== a.id ? '' : undefined} onMouseEnter={() => setFoco(a.id)}>
            <path d={`M ${C - rr.r1} ${C} A ${rr.r1} ${rr.r1} 0 1 0 ${C + rr.r1} ${C} A ${rr.r1} ${rr.r1} 0 1 0 ${C - rr.r1} ${C} M ${C - rr.r0} ${C} A ${rr.r0} ${rr.r0} 0 1 1 ${C + rr.r0} ${C} A ${rr.r0} ${rr.r0} 0 1 1 ${C - rr.r0} ${C} Z`}
              fillRule="evenodd" fill={col} className={n.velo} style={{ '--velo': 0.07 + (anillos.length - i) * 0.016 } as CSSProperties} />
            <circle cx={C} cy={C} r={rr.r1} fill="none" stroke={col} className={n.filo} />
            <text className={n.rotulo} fill={i < 1 ? 'var(--i-oro-tinta)' : 'var(--i-mor-tinta)'}><textPath href={`#nova-arco-${a.id}`} startOffset="50%" textAnchor="middle">{a.nombre}</textPath></text>
          </g> })}
        {/* el núcleo: el porqué y el para qué en su propia luz */}
        <g className={n.banda} data-anillo="nucleo" data-apagado={foco && foco !== 'nucleo' ? '' : undefined} onMouseEnter={() => setFoco('nucleo')}>
          <circle cx={C} cy={C} r={R0 + 40} fill="url(#nova-nucleo)" filter="url(#nova-halo)" className={n.halo} />
          <circle cx={C} cy={C} r={R0} className={n.nucleo} />
          <circle cx={C} cy={C} r={R0} fill="none" stroke="var(--i-oro)" className={n.filo} />
          <text x={C} y={C - 46} textAnchor="middle" className={n.rotulo} style={{ fontSize: 12, letterSpacing: '0.32em' }} fill="var(--i-oro-tinta)">{texto(nucleo.rotulo)}</text>
          {texto(nucleo.frase).split('\n').map((l, k, t) => <text key={k} x={C} y={C - 4 + k * 36 - (t.length - 3) * 18} textAnchor="middle" className={n.paraque}>{l}</text>)}
        </g>
        {/* el eje: del porqué al mundo, donde se leen las iniciales */}
        <line x1={C + R0} y1={C} x2={C + R_FIN} y2={C} className={n.eje} />
        {anillos.map(a => a.inicial ? <text key={a.id} x={C + radios.get(a.id)!.rm} y={C} className={n.inicial} data-tono={a.tono}
          style={{ '--cruce': `${cruce(radios.get(a.id)!.rm) + 3}s` } as CSSProperties}>{a.inicial}</text> : null)}
        {/* partículas: pocas, lentas; cada anillo gira a su ritmo (más lento hacia afuera) */}
        {anillos.map((a, i) => { const rr = radios.get(a.id)!, nP = 3 + i
          return <g key={a.id} className={n.orbita} style={{ '--vuelta': `${Math.round(40 * Math.pow(rr.rm / 150, 1.5))}s`, '--dir': i % 2 ? 'normal' : 'reverse' } as CSSProperties}>
            {Array.from({ length: nP }, (_, k) => { const ang = ((k / nP) * 360 + i * 37) * Math.PI / 180, rp = rr.r0 + (rr.r1 - rr.r0) * (0.3 + 0.4 * ((k * 7 + i * 3) % 5) / 4)
              return <circle key={k} cx={C + rp * Math.cos(ang)} cy={C + rp * Math.sin(ang)} r={i < 2 ? 2.6 : 2.1} fill={colorAnillo(a.tono, i, anillos.length)} className={n.particula} /> })}
          </g> })}
        {/* la onda: sale del porqué cada 8 s y cruza los anillos */}
        <circle cx={C} cy={C} r={R_FIN} className={n.onda} />
      </svg>
      <svg className={n.hilos} aria-hidden>
        {hilos.map(h => <g key={h.id} data-anillo={h.id} className={n.hiloG} data-apagado={foco && foco !== h.id ? '' : undefined}>
          <path d={h.d} fill="none" stroke={colorDe(h.id)} className={n.hilo} />
          <circle cx={h.px} cy={h.py} r={5.5} fill="var(--i-placa-abajo)" stroke={colorDe(h.id)} strokeWidth={2.5} />
        </g>)}
      </svg>
    </div>
    <div ref={lamina} className={n.lamina}>
      {notas.map(nota => <article key={nota.anillo} className={n.nota} data-anillo={nota.anillo} data-apagado={foco && foco !== nota.anillo ? '' : undefined} onMouseEnter={() => setFoco(nota.anillo)} onMouseLeave={() => setFoco(null)}
        style={{ '--c': nota.anillo === 'nucleo' ? 'var(--i-oro-tinta)' : tintaAnillo(anillos.find(a => a.id === nota.anillo)?.tono) } as CSSProperties}>
        {nota.partes.map((p, k) => <div key={k} className={n.parte}>
          {(p.rotulo || p.fecha || p.sello) ? <div className={n.cab}>
            {p.rotulo ? <span className={n.rot}>{p.rotulo}</span> : null}
            {p.glosa ? <span className={n.gl}>{p.glosa}</span> : null}
            <SelloDe v={p.sello} tono="morado" />
            {p.fecha ? <span className={n.fecha}>{p.fecha}</span> : null}
          </div> : null}
          {p.frase ? <p className={s.firma} style={{ fontSize: numero(p.tam, 22) }}>{p.frase}</p> : null}
          {p.chips?.length ? <div className={n.chips}>{p.chips.map(c => <span key={c} className={n.chip}>{c}</span>)}</div> : null}
          {p.linea ? <p className={n.linea}>{p.linea}</p> : null}
          {p.vivo && esTexto(p.vivo.fuente) ? <VivoEnLinea fuente={p.vivo.fuente} prefijo={p.vivo.prefijo} /> : null}
          {esBoton(p.boton) ? <div style={{ marginTop: 10 }}><Boton b={p.boton} ctx={ctx} /></div> : null}
        </div>)}
      </article>)}
    </div>
  </div>
}

// ── La ecuación de valor que se toca ──
function Ecuacion({ b: r }: PropsBloque) {
  const arriba = lista(r.arriba, esTexto).slice(0, 2), abajo = lista(r.abajo, esTexto).slice(0, 2)
  const [v, setV] = useState<number[]>([7, 6, 5, 5])
  if (arriba.length < 2 || abajo.length < 2) return <Hueco>ecuacion: «arriba» y «abajo» llevan dos factores cada uno</Hueco>
  const valor = (v[0] * v[1]) / (v[2] * v[3])
  const ancho = Math.min(100, Math.max(3, Math.log(valor * 10) / Math.log(1000) * 100))
  const factor = (nombre: string, k: number, bajo?: boolean) => <label key={nombre} className={n.factor} data-bajo={bajo ? '' : undefined}>
    <span>{nombre}<i>{v[k]}</i></span>
    <input type="range" min={1} max={10} value={v[k]} onChange={e => setV(x => x.map((y, j) => (j === k ? +e.target.value : y)))} onPointerDown={e => e.stopPropagation()} />
  </label>
  return <div className={n.ecuacion}>
    <p className={n.ecTitulo}>{texto(r.titulo, 'Valor, todo percibido =')}</p>
    <div className={n.fraccion}>
      <div className={n.factores}>{arriba.map((f, k) => factor(f, k))}</div>
      <div className={n.raya} />
      <div className={n.factores}>{abajo.map((f, k) => factor(f, k + 2, true))}</div>
    </div>
    <div className={n.medidor}><span className={s.ceja} data-tono="oro">valor</span><span className={n.barra}><i style={{ width: `${ancho}%` }} /></span><b>{valor >= 10 ? valor.toFixed(0) : valor.toFixed(1)}×</b></div>
    {esTexto(r.pista) && <p className={s.glosa} style={{ fontSize: 14 }}>{r.pista}</p>}
  </div>
}

// ── Kennedy: el triángulo ──
function Triangulo({ b: r, ctx }: PropsBloque) {
  const vs = lista(r.vertices, esTexto).slice(0, 3)
  if (vs.length < 3) return <Hueco>triangulo: tres «vertices»</Hueco>
  const V = [[190, 26], [36, 214], [344, 214]]
  return <section className={n.principio}>
    {esTexto(r.ceja) && <Ceja tono="oro">{r.ceja}</Ceja>}
    {esTexto(r.titulo) && <h3 className={n.prTitulo}>{r.titulo}</h3>}
    <svg viewBox="0 0 380 260" className={n.tri}>
      <path id="tri-camino" d={`M${V[0]} L${V[1]} L${V[2]} Z`} fill="none" stroke="var(--i-mor)" strokeWidth={2.5} strokeLinejoin="round" opacity={0.85} />
      {V.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={15} fill="var(--i-mor)" />
        <text x={i === 0 ? x + 26 : x} y={i === 0 ? y + 5 : y + 44} textAnchor={i === 0 ? 'start' : 'middle'} className={n.vertice}>{vs[i].toUpperCase()}</text></g>)}
      {ctx.modo === 'cerca'
        ? <circle r={6} className={n.senal}><animateMotion dur="6s" repeatCount="indefinite" path={`M${V[0]} L${V[1]} L${V[2]} Z`} /></circle>
        : <circle r={6} cx={150} cy={79} className={n.senal} />}
    </svg>
    {esTexto(r.frase) && <p className={n.pide}>{r.frase}</p>}
  </section>
}

// ── Schwartz: las etapas ──
interface Marca { etapa: number; texto: string; tono?: 'oro' | 'morado' }
const esMarca = (x: unknown): x is Marca => esObj(x) && typeof x.etapa === 'number' && esTexto(x.texto)
function Etapas({ b: r }: PropsBloque) {
  const total = Math.max(2, Math.min(9, numero(r.n, 5)))
  const marcas = lista(r.marcas, esMarca)
  return <section className={n.principio}>
    {esTexto(r.ceja) && <Ceja tono="oro">{r.ceja}</Ceja>}
    {esTexto(r.titulo) && <h3 className={n.prTitulo}>{r.titulo}</h3>}
    {esTexto(r.subtitulo) && <p className={s.ceja} style={{ marginTop: 16 }}>{r.subtitulo}</p>}
    <div className={n.barras}>
      {Array.from({ length: total }, (_, i) => { const m = marcas.find(x => x.etapa === i + 1)
        return <div key={i} className={n.col}>
          <div className={n.b} data-tono={m?.tono} style={{ height: `${24 + (i / (total - 1)) * 72}%`, '--i': i } as CSSProperties}><span>{i + 1}</span></div>
          <p className={n.gana} data-tono={m?.tono}>{m?.texto ?? ''}</p>
        </div> })}
    </div>
  </section>
}

// ── El avatar como identidad ──
function Identidad({ b: r }: PropsBloque) {
  const caminos = lista(r.caminos, esTexto)
  return <section className={n.principio}>
    {esTexto(r.ceja) && <Ceja tono="oro">{r.ceja}</Ceja>}
    {esTexto(r.titulo) && <h3 className={n.prTitulo}>{r.titulo}</h3>}
    {esTexto(r.identidad) && <div className={n.idCaja}>{r.identidad}</div>}
    <div className={n.caminos}>
      <svg className={n.ramas} viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden>
        {caminos.map((_, k) => { const cx = caminos.length === 1 ? 200 : 66 + (k * 268) / (caminos.length - 1)
          return <path key={k} d={`M200 0 C200 34, ${cx} 26, ${cx} 64`} fill="none" stroke="var(--i-mor)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" /> })}
      </svg>
      {caminos.map(c => <span key={c} className={n.camino}>{c}</span>)}
    </div>
  </section>
}

export const BLOQUES_NORTE: Record<string, ComponenteBloque> = {
  estrella: Nova, ecuacion: Ecuacion, triangulo: Triangulo, etapas: Etapas, identidad: Identidad,
}
