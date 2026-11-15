'use client'
/**
 * Bloques de EL PROGRAMA (mapa v16, 14 nov 2026): el tiempo de un programa y lo que cada parte entrega. Genéricos: sirven
 * para el Acompañamiento de Daniel y para el programa de cualquier alumno. HOY sale de la fecha del sistema (o de
 * `"hoy": "AAAA-MM-DD"` en el bloque, para probar). Lo que no trae fecha no se marca; lo que falta se dice.
 *
 *   modulos       N módulos en dos alas que mandan su hilo de oro a la pieza de una hoja que llenan (Supernova). Las piezas
 *                 sin módulo se dicen «sin hilo». HOY = el módulo cuya ventana incluye hoy. De cerca, una gota recorre un
 *                 hilo a la vez en el orden en que se construyen y, al final, una onda sale de la hoja.
 *                 { alas?: [{ceja, glosa?}, {ceja, glosa?}], modulos: [{n, nombre, cuando?, desde?, hasta?, entregable?,
 *                   numero?, piezas: [1..]}], hoja: {titulo, lee?, archivo?, piezas: [texto], nota?: {resalta, texto}},
 *                   pie?: {resalta?, texto}, glosa?, hoy? }
 *   tira-semanas  las semanas de un programa A ESCALA: fases, grupales, uno a uno, meses y HOY en rojo con «día N de M».
 *                 El último día se CALCULA (inicio + dias − 1). { ceja?, glosa?, inicio: 'AAAA-MM-DD' (día 1, lunes de S1),
 *                   dias, semanas: [desde, hasta], fases: [{nombre, desde, hasta, rotulo?, sello?, foco?}],
 *                   grupales?: {dias: ['lun','mie','vie'], semanas: [a, b], extra?: [fechas], leyenda?},
 *                   uno?: {leyenda?, sesiones: [{titulo, cuando?, desde?, hasta?, semana?, abierto?}]}, hoy? }
 *   lecciones     la lupa sobre un tramo: la puerta (un uno a uno con lo que sales) y sus hilos al riel de semanas; cada
 *                 semana con sus lecciones tal cual (o su foco, si es esqueleto) y un cierre.
 *                 { puerta: {ceja?, titulo, cuando?, desde?, hasta?, sello?, sale?, ranuras?, pie?},
 *                   semanas: [{rotulo, desde?, hasta?, sello?, glosa?, foco?, lecciones?: [{dia?, titulo, entregable?,
 *                   numero?, destino?}], cierre?: {ceja?, titulo, cuando?, desde?, hasta?}}], hoy? }
 *   pasos         una cadena corta de pasos con flecha: lo que sale de aquí y a dónde lleva.
 *                 { ceja?, alinear?: 'derecha', pasos: [{titulo, cuando?, desde?, hasta?, sello?, frase?, destino?}], hoy? }
 *   ventana       la ventana de fechas de una fase y su estado hoy (abre el…, hoy · en curso, terminó el…).
 *                 { desde, hasta, texto?, alinear?: 'derecha', hoy? }
 *   portada       una imagen con su pie (la portada del classroom). { src: '/mapa/portadas/…', alt?, pie?, destino? }
 *   numero-vivo   un número de El pulso, leído de su fuente; sin dato dice «sin dato», nunca 0.
 *                 { fuente: 'pulso:<órgano>', ceja?, botones? }
 *   etapa-embudo  una etapa de embudo.json (nombre, qué pasa, qué la mide) y su lazo de vuelta (arista volante).
 *                 { fuente: 'embudo', etapa: 'ht.expansion', ceja?, lazoGlosa?, respaldo?: {nombre, que_pasa, sello?} }
 *
 * Estado = trazo: firmado sólido, abierto y pendiente en rayas, idea en puntos. Movimiento solo de cerca; de lejos la
 * isla es su foto quieta y completa.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Organo } from '@/features/negocio/pulso'
import { Botones, Ceja, Hueco, Respira, Sello, SelloDe, esEstado } from '../piezas'
import { esObj, esTexto, lista, numero, texto, type ComponenteBloque, type PropsBloque } from '../tipos'
import { useEmbudo, usePulso } from '../datos'
import s from '../isla.module.css'
import p from './programa.module.css'

// ── el tiempo ─────────────────────────────────────────────────────────────────────────────────────────────────────

const DIA_MS = 864e5
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW_RECETA: Record<string, number> = { lun: 0, mar: 1, mie: 2, 'mié': 2, jue: 3, vie: 4, sab: 5, 'sáb': 5, dom: 6 }

/** 'AAAA-MM-DD' → número de día (UTC, sin horas); null si no es una fecha real. */
export function diaDe(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [a, m, d] = v.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.getTime() / DIA_MS : null
}
/** «sáb 23 ene» */
export const fmtDia = (n: number) => { const d = new Date(n * DIA_MS); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MES[d.getUTCMonth()]}` }
const diaDelMes = (n: number) => new Date(n * DIA_MS).getUTCDate()
const mesDe = (n: number) => MES[new Date(n * DIA_MS).getUTCMonth()]
const hoyLocal = () => { const a = new Date(); return Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) / DIA_MS }

/** El día de hoy (fecha del sistema) que cambia solo a medianoche; `forzado` = 'AAAA-MM-DD' para probar. */
function useHoy(forzado?: unknown): number {
  const f = diaDe(forzado)
  const [h, setH] = useState(hoyLocal)
  useEffect(() => {
    if (f != null) return
    const t = setInterval(() => { const n = hoyLocal(); setH(x => (x === n ? x : n)) }, 60_000)
    return () => clearInterval(t)
  }, [f])
  return f ?? h
}

type Tiempo = 'antes' | 'hoy' | 'despues' | 'sin'
const tiempoDe = (hoy: number, desde: number | null, hasta: number | null): Tiempo =>
  desde == null ? 'sin' : hoy < desde ? 'antes' : hoy > (hasta ?? desde) ? 'despues' : 'hoy'

// ── medir y vivir ─────────────────────────────────────────────────────────────────────────────────────────────────

const useLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** El tamaño de layout del bloque (no lo afecta la escala del lienzo). `respaldo` = la primera pintura. */
function useTam<T extends HTMLElement>(respaldo: { w: number; h: number }) {
  const ref = useRef<T>(null)
  const [tam, setTam] = useState(respaldo)
  useLayout(() => {
    const el = ref.current
    if (!el) return
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; if (w > 0 && h > 0) setTam(t => (t.w === w && t.h === h ? t : { w, h })) }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, tam] as const
}

/** La vida de un bloque: un reloj (segundos) que solo corre de cerca y sin «reducir movimiento». t = −1: en reposo. */
function useVida(activo: boolean, paso: (t: number) => void) {
  const ref = useRef(paso)
  useEffect(() => { ref.current = paso })
  useEffect(() => {
    if (!activo || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let id = 0
    const t0 = performance.now()
    const tic = (ahora: number) => { ref.current((ahora - t0) / 1000); id = requestAnimationFrame(tic) }
    id = requestAnimationFrame(tic)
    return () => { cancelAnimationFrame(id); ref.current(-1) }
  }, [activo])
}

/** La posición de `el` dentro de `raiz` por offsets (inmune a la escala del lienzo). */
function posEn(el: HTMLElement, raiz: HTMLElement) {
  let x = 0, y = 0, n: HTMLElement | null = el
  while (n && n !== raiz) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const sale = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const curva = (x0: number, y0: number, x1: number, y1: number, k = 0.62) => {
  const dx = (x1 - x0) * k
  return `M ${x0} ${y0} C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1}`
}
const ent = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** Un sello de HOY en rojo (lo único rojo de estas islas, además del cuello). */
function SelloHoy({ children = 'hoy' }: { children?: ReactNode }) {
  return <Sello estado="rojo"><i className={p.punto} aria-hidden />{children}</Sello>
}
/** La «fecha» en versalitas: cuándo pasa algo. */
const Fecha = ({ children, tono }: { children: ReactNode; tono?: 'oro' | 'tenue' }) =>
  <span className={p.fecha} data-tono={tono}>{children}</span>

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// modulos · Supernova: dos alas de módulos abrazan la hoja que llenan
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

interface Mod { n: string; nombre: string; cuando: string; desde: number | null; hasta: number | null; entregable: string; numero: string; piezas: number[] }
function leerModulo(x: unknown, i: number): Mod | null {
  if (!esObj(x) || !esTexto(x.nombre)) return null
  const desde = diaDe(x.desde)
  return {
    n: x.n != null ? String(x.n) : String(i), nombre: x.nombre, cuando: texto(x.cuando), desde, hasta: diaDe(x.hasta) ?? desde,
    entregable: texto(x.entregable), numero: texto(x.numero), piezas: lista(x.piezas, ent).filter(v => v >= 1),
  }
}
const juntar = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

const DISCO = 46
function Modulos({ b, ctx }: PropsBloque) {
  const hoy = useHoy(b.hoy)
  const mods = useMemo(() => (Array.isArray(b.modulos) ? b.modulos.map(leerModulo).filter((m): m is Mod => !!m) : []), [b.modulos])
  const hoja = esObj(b.hoja) ? b.hoja : null
  const piezas = useMemo(() => (hoja ? lista(hoja.piezas, esTexto) : []), [hoja])
  const [ref, { w, h }] = useTam<HTMLDivElement>({ w: 1304, h: numero(b.alto, 980) })
  const [foco, setFoco] = useState<string | null>(null)
  const hilosRef = useRef<(SVGPathElement | null)[]>([])
  const piezaRef = useRef<(HTMLDivElement | null)[]>([])
  const gotaRef = useRef<SVGCircleElement>(null)
  const ondaRef = useRef<SVGCircleElement>(null)
  const encendida = useRef(-1)

  const de = useMemo(() => { const m: Record<number, string> = {}; mods.forEach(x => x.piezas.forEach(q => { if (q <= piezas.length && m[q] == null) m[q] = x.n })); return m }, [mods, piezas.length])
  const sinHilo = piezas.map((t, i) => (de[i + 1] == null ? t.toLowerCase() : null)).filter((t): t is string => !!t)

  // la geometría: todo sale del ancho y del alto del bloque (nada se mide del texto)
  const pie = esObj(b.pie) ? b.pie : null
  const conPie = !!pie || esTexto(b.glosa)
  const M = Math.max(420, h - (conPie ? 104 : 0))
  const HW = Math.round(Math.min(390, Math.max(280, w * 0.276)))
  const G = Math.round(Math.min(170, Math.max(96, w * 0.105)))
  const A = Math.max(220, Math.floor((w - HW - 2 * G) / 2))
  const hojaX = A + G, hojaR = hojaX + HW
  const nIzq = Math.ceil(mods.length / 2), nDer = mods.length - nIzq
  const Y0 = 78, ULTIMO = 158
  const paso = (n: number) => (n > 1 ? Math.min(240, (M - Y0 - ULTIMO) / (n - 1)) : 0)
  const geo = mods.map((m, k) => {
    const izq = k < nIzq, j = izq ? k : k - nIzq
    const top = Y0 + j * paso(izq ? nIzq : nDer)
    return { izq, top, cx: izq ? A - DISCO / 2 : hojaR + G + DISCO / 2, cy: top + DISCO / 2 }
  })
  const FILA0 = 112, NOTA = 72
  const fila = piezas.length ? Math.min(66, (M - FILA0 - NOTA) / piezas.length) : 0
  const yPieza = (q: number) => FILA0 + (q - 1) * fila + 14
  const hilos = mods.flatMap((m, k) => m.piezas.filter(q => q <= piezas.length).map(q => {
    const g = geo[k], x0 = g.izq ? g.cx + DISCO / 2 + 2 : g.cx - DISCO / 2 - 2, x1 = g.izq ? hojaX : hojaR, y1 = yPieza(q)
    return { m: m.n, q, d: curva(x0, g.cy, x1, y1), x1, y1 }
  }))

  // la vida: una gota recorre un hilo a la vez, en el orden en que se construyen; luego la hoja late (la supernova)
  const VIAJE = 1.5, RESPIRO = 0.55, ESPERA = 0.8
  useVida(ctx.modo === 'cerca' && hilos.length > 0, t => {
    const g = gotaRef.current, o = ondaRef.current
    if (!g || !o) return
    const enciende = (i: number) => {
      if (encendida.current === i) return
      const vieja = piezaRef.current[hilos[encendida.current]?.q - 1]
      if (vieja) delete vieja.dataset.destello
      encendida.current = i
      const nueva = i >= 0 ? piezaRef.current[hilos[i].q - 1] : null
      if (nueva) nueva.dataset.destello = ''
    }
    if (t < ESPERA) { g.setAttribute('opacity', '0'); o.setAttribute('opacity', '0'); enciende(-1); return }
    const n = hilos.length, tramo = VIAJE + RESPIRO, ONDA = 3, ciclo = n * tramo + 0.6 + ONDA + 1.4
    const x = (t - ESPERA) % ciclo
    if (x < n * tramo) {
      const i = Math.floor(x / tramo), k = (x - i * tramo) / VIAJE, camino = hilosRef.current[i]
      o.setAttribute('opacity', '0')
      if (k <= 1 && camino) {
        const pt = camino.getPointAtLength(camino.getTotalLength() * suave(k))
        g.setAttribute('cx', String(pt.x)); g.setAttribute('cy', String(pt.y))
        g.setAttribute('opacity', String(Math.min(1, k * 6, (1 - k) * 6 + 0.35)))
      } else g.setAttribute('opacity', '0')
      enciende(k > 0.9 ? i : -1)
      return
    }
    g.setAttribute('opacity', '0'); enciende(-1)
    const y = x - n * tramo - 0.6
    if (y >= 0 && y <= ONDA) {
      const k = y / ONDA
      o.setAttribute('r', String(HW * 0.62 + HW * 1.25 * sale(k)))
      o.setAttribute('opacity', String((1 - k) * 0.42))
      o.setAttribute('stroke-width', String(1 + 2.4 * (1 - k)))
    } else o.setAttribute('opacity', '0')
  })

  if (!mods.length) return <Hueco>modulos: falta «modulos» (cada uno con nombre y las piezas que llena)</Hueco>
  if (!hoja || !piezas.length) return <Hueco>modulos: falta «hoja.piezas» (la página que llenan los módulos)</Hueco>

  const alas = Array.isArray(b.alas) ? b.alas : []
  const cabAla = (i: number) => { const a = esObj(alas[i]) ? alas[i] : null; return a && esTexto(a.ceja) ? <div className={p.alaCab}><Ceja tono="oro">{a.ceja}</Ceja>{esTexto(a.glosa) && <Fecha tono="tenue">{a.glosa}</Fecha>}</div> : null }
  const apagado = (m: string) => (foco != null && foco !== m ? '' : undefined)
  const nota = esObj(hoja.nota) ? hoja.nota : null
  const cxH = hojaX + HW / 2, cyH = M / 2

  const modulo = (m: Mod, k: number) => {
    const g = geo[k], t = tiempoDe(hoy, m.desde, m.hasta)
    return <div key={m.n + k} className={p.modulo} data-lado={g.izq ? 'izq' : 'der'} data-apagado={apagado(m.n)} style={{ top: g.top }}
      onPointerEnter={() => setFoco(m.n)} onPointerLeave={() => setFoco(null)}>
      <span className={p.disco} data-tiempo={t}>{m.n}</span>
      <div className={p.modTexto}>
        <p className={p.modNombre}>{m.nombre}</p>
        {(m.cuando || t === 'hoy') && <div className={p.modCuando}>{m.cuando && <Fecha tono="oro">{m.cuando}</Fecha>}{t === 'hoy' && <span className={p.etiquetaHoy}>hoy</span>}</div>}
        {m.entregable && <p className={p.archivo}>{m.entregable}</p>}
        {m.numero && <p className={p.suNumero}>su número: {m.numero}</p>}
      </div>
    </div>
  }

  return <div ref={ref} className={p.mod}>
    <div className={p.modBrillo} style={{ left: cxH, top: cyH }} aria-hidden />
    <svg className={p.capa} width={w} height={M} aria-hidden>
      <circle cx={cxH} cy={cyH} r={HW * 1.62} className={p.orbita} />
      {[[0, nIzq - 1], [nIzq, mods.length - 1]].map(([a, z]) => (z > a ? <line key={a} x1={geo[a].cx} y1={geo[a].cy} x2={geo[z].cx} y2={geo[z].cy} className={p.via} /> : null))}
      {hilos.map((x, i) => <path key={'h' + i} d={x.d} className={p.hiloHalo} data-apagado={apagado(x.m)} />)}
      {hilos.map((x, i) => <path key={'p' + i} ref={el => { hilosRef.current[i] = el }} d={x.d} className={p.hilo} data-activo={foco === x.m ? '' : undefined} data-apagado={apagado(x.m)} />)}
      <circle ref={ondaRef} cx={cxH} cy={cyH} r={0} className={p.onda} opacity={0} />
    </svg>
    <section className={p.ala} data-lado="izq" style={{ width: A, height: M }}>{cabAla(0)}{mods.slice(0, nIzq).map((m, k) => modulo(m, k))}</section>
    <article className={p.hoja} style={{ left: hojaX, width: HW, height: M }} data-junta={foco === 'junta' ? '' : undefined}>
      <div className={p.hojaCab}><span className={p.hojaTitulo}>{texto(hoja.titulo, 'Mi oferta en una página')}</span></div>
      {(esTexto(hoja.lee) || esTexto(hoja.archivo)) && <div className={p.hojaLee}><span>{texto(hoja.lee)}</span>{esTexto(hoja.archivo) && <span className={p.hojaArchivo}>{hoja.archivo}</span>}</div>}
      <div className={p.hojaRegla} />
      {piezas.map((nom, i) => {
        const m = de[i + 1]
        return <div key={i} ref={el => { piezaRef.current[i] = el }} className={p.pieza} style={{ top: FILA0 + i * fila }}
          data-junta={m == null ? '' : undefined} data-apagado={foco != null && foco !== (m ?? 'junta') ? '' : undefined}
          onPointerEnter={() => setFoco(m ?? 'junta')} onPointerLeave={() => setFoco(null)}>
          <div className={p.piezaFila}><span className={p.piezaN}>{i + 1}</span><span className={p.piezaNom}>{nom}</span>
            {m == null ? <span className={p.piezaSin}>sin hilo</span> : <span className={p.piezaDe}>M{m}</span>}</div>
          <div className={p.renglon}><i /></div>
        </div>
      })}
      {(nota || sinHilo.length > 0) && <p className={p.hojaNota} data-apagado={foco != null && foco !== 'junta' ? '' : undefined}>
        {nota ? <><b>{texto(nota.resalta)}</b> {texto(nota.texto)}</> : <><b>Sin hilo:</b> {juntar(sinHilo)}, se arman al juntar la página.</>}
      </p>}
    </article>
    <section className={p.ala} data-lado="der" style={{ left: hojaR + G, width: A, height: M }}>{cabAla(1)}{mods.slice(nIzq).map((m, k) => modulo(m, k + nIzq))}</section>
    <svg className={p.capa} data-encima width={w} height={M} aria-hidden>
      <defs><filter id={`brillo-${b.id ?? 'modulos'}`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      {hilos.map((x, i) => <circle key={i} cx={x.x1} cy={x.y1} r={4} className={p.marca} data-apagado={apagado(x.m)} />)}
      <circle ref={gotaRef} r={4.6} className={p.gota} opacity={0} filter={`url(#brillo-${b.id ?? 'modulos'})`} />
    </svg>
    {conPie && <div className={p.modPie} style={{ top: M + 30 }}>
      {pie && <p className={p.cruce}>{esTexto(pie.resalta) && <em>{pie.resalta}</em>} {texto(pie.texto)}</p>}
      {esTexto(b.glosa) && <p className={s.glosa} style={{ fontSize: 15.5 }}>{b.glosa}</p>}
    </div>}
  </div>
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// tira · los días de un programa a escala
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const trazoDe = (sello: unknown) => {
  const e = esEstado(sello) ? sello : esObj(sello) && esEstado(sello.estado) ? sello.estado : null
  return e === 'abierto' || e === 'pendiente' ? 'raya' : e === 'idea' ? 'punto' : undefined
}
const textoSello = (sello: unknown) => (esObj(sello) && esTexto(sello.texto) ? sello.texto : esEstado(sello) ? sello : '')

function Tira({ b, ctx }: PropsBloque) {
  const hoy = useHoy(b.hoy)
  const [ref, { w }] = useTam<HTMLDivElement>({ w: 1304, h: 330 })
  const inicio = diaDe(b.inicio)
  const dias = numero(b.dias, 90)
  const sem = lista(b.semanas, ent)
  const sA = sem[0] ?? 0, sZ = sem[1] ?? Math.ceil(dias / 7) + sA
  if (inicio == null) return <Hueco>tira-semanas: falta «inicio» (el día 1, 'AAAA-MM-DD')</Hueco>
  if (sZ < sA) return <Hueco>tira-semanas: «semanas» va de la primera a la última</Hueco>

  const D0 = inicio + 7 * (sA - 1)                 // lunes de la primera semana dibujada
  const ND = 7 * (sZ - sA + 1)
  const PD = w / ND
  const x = (i: number) => i * PD                   // i = días desde D0 (borde izquierdo del día)
  const iHoy = hoy - D0
  const N = hoy - inicio + 1
  const fin = inicio + dias - 1
  const iFin = fin - D0

  const fases = (Array.isArray(b.fases) ? b.fases : []).filter(esObj).filter(f => esTexto(f.nombre) && ent(f.desde) && ent(f.hasta))
  const gr = esObj(b.grupales) ? b.grupales : null
  const grupales: number[] = []
  if (gr) {
    const ds = lista(gr.dias, esTexto).map(d => DOW_RECETA[d.toLowerCase()]).filter(d => d != null)
    const rs = lista(gr.semanas, ent)
    for (let s_ = rs[0] ?? sA; s_ <= (rs[1] ?? sZ); s_++) ds.forEach(d => grupales.push(7 * (s_ - sA) + d))
    lista(gr.extra, esTexto).map(diaDe).forEach(d => { if (d != null) grupales.push(d - D0) })
  }
  const uno = esObj(b.uno) ? b.uno : null
  const sesiones = (uno && Array.isArray(uno.sesiones) ? uno.sesiones : []).filter(esObj).filter(u => esTexto(u.titulo)).map(u => {
    const a = diaDe(u.desde), z = diaDe(u.hasta) ?? a
    const semana = ent(u.semana) ? u.semana : null
    const ia = a != null ? a - D0 : semana != null ? 7 * (semana - sA) : null
    const iz = z != null ? z - D0 + 1 : semana != null ? 7 * (semana - sA) + 7 : null
    return ia == null || iz == null ? null : { titulo: u.titulo as string, cuando: texto(u.cuando), ia, iz, abierto: u.abierto === true }
  }).filter((u): u is NonNullable<typeof u> => !!u)
  const meses: { i: number; m: string }[] = [{ i: 0, m: mesDe(D0) }]
  for (let i = 1; i < ND; i++) if (diaDelMes(D0 + i) === 1) meses.push({ i, m: mesDe(D0 + i) })

  // alturas (px dentro del bloque)
  const YB = 92, YS = 112, YF = 130, FH = 62, YG = YF + FH + 16, YU = YG + 13, YL = YU + 16, YM = YL + 46
  const hayHoy = iHoy >= 0 && iHoy < ND
  const xHoy = x(iHoy + 0.5)

  return <div ref={ref} className={p.tira}>
    <div className={p.tiraCab}>
      <div>{esTexto(b.ceja) && <Ceja tono="oro">{b.ceja}</Ceja>}{esTexto(b.glosa) && <p className={s.glosa} style={{ fontSize: 15, marginTop: 8 }}>{b.glosa}</p>}</div>
      <div className={p.tiraHoy}>
        <span className={p.fecha} data-tono={N >= 1 && N <= dias ? 'rojo' : 'tenue'}>hoy · {fmtDia(hoy)}</span>
        <p className={p.tiraDia} data-late={ctx.modo === 'cerca' ? '' : undefined}>
          {N >= 1 && N <= dias ? <>día <b>{N}</b> de {dias}</> : N < 1 ? <>faltan {1 - N} días para el día 1</> : <>el día {dias} fue el {fmtDia(fin)}</>}
        </p>
      </div>
    </div>
    <svg className={p.capa} width={w} height={YM + 18} aria-hidden>
      {/* día 1 y último día: banderas finas; los meses abajo */}
      {[[inicio - D0, 'izq'], [iFin + 0.5, 'der']].map(([i, lado]) => <line key={String(lado)} x1={x(i as number)} x2={x(i as number)} y1={YB + 4} y2={YF} className={p.tenue} strokeDasharray="2 3" />)}
      <line x1={0} x2={w} y1={YM} y2={YM} className={p.tenue} />
      {meses.map(m => <line key={m.i} x1={x(m.i)} x2={x(m.i)} y1={YM} y2={YM + 14} className={p.tenue} />)}
      {grupales.filter(i => i >= 0 && i < ND).map(i => <circle key={'g' + i} cx={x(i + 0.5)} cy={YG} r={3} className={p.grupal} data-pasada={i <= iHoy ? '' : undefined} />)}
      {sesiones.map((u, k) => <rect key={'u' + k} x={x(u.ia) + 1} y={YU - 4} width={Math.max(6, x(u.iz) - x(u.ia) - 2)} height={8} rx={4} className={p.unoBarra}
        data-abierto={u.abierto ? '' : undefined} data-tiempo={u.ia > iHoy ? 'antes' : 'ya'} />)}
    </svg>
    <span className={p.bandera} style={{ left: x(inicio - D0) + 7, top: YB - 4 }}>día 1 · {fmtDia(inicio)}</span>
    <span className={p.bandera} style={{ right: w - x(iFin + 0.5) + 7, top: YB - 4 }}>día {dias} · {fmtDia(fin)}</span>
    {Array.from({ length: sZ - sA + 1 }, (_, k) => <span key={k} className={p.semana} style={{ left: x(7 * k + 3.5), top: YS }}>S{sA + k}</span>)}
    {fases.map((f, k) => {
      const a = 7 * ((f.desde as number) - sA), z = 7 * ((f.hasta as number) - sA + 1)
      const vivido = Math.max(0, Math.min(1, (iHoy + 1 - a) / (z - a)))
      const est = textoSello(f.sello)
      return <div key={k} className={p.banda} data-foco={f.foco === true ? '' : undefined} data-trazo={vivido < 1 ? trazoDe(f.sello) : undefined}
        style={{ left: x(a) + 2, width: x(z) - x(a) - 4, top: YF, height: FH, '--vivido': `${vivido * 100}%` } as CSSProperties}>
        <span className={p.bandaNom}>{f.nombre as string}</span>
        <span className={p.bandaS}>{texto(f.rotulo, `S${f.desde}–S${f.hasta}`)}{est && <i>{est}</i>}</span>
      </div>
    })}
    {sesiones.map((u, k) => <span key={k} className={p.unoEtq} data-abierto={u.abierto ? '' : undefined} style={{ left: x((u.ia + u.iz) / 2), top: YL }}>
      <b>{u.titulo}</b>{u.cuando && <span>{u.cuando}</span>}</span>)}
    {meses.map(m => <span key={m.i} className={p.mes} style={{ left: x(m.i) + 6, top: YM + 4 }}>{m.m}</span>)}
    {hayHoy && <>
      <span className={p.hoyLinea} style={{ left: xHoy - 1.25, top: YB - 8, height: YU + 8 - YB }} aria-hidden />
      <span className={p.hoyLinea} data-eje style={{ left: xHoy - 1.25, top: YM - 6, height: 12 }} aria-hidden />
      <span className={p.hoyPunto} style={{ left: xHoy - 5, top: YB - 13 }} aria-hidden />
      <span className={p.bandera} data-hoy style={{ left: xHoy + 10, top: YB - 4 }}>hoy</span>
    </>}
    {(gr && esTexto(gr.leyenda)) || (uno && esTexto(uno.leyenda)) ? <div className={p.leyenda} style={{ top: YM + 34 }}>
      {gr && esTexto(gr.leyenda) && <span><i className={p.leyG} />{gr.leyenda}</span>}
      {uno && esTexto(uno.leyenda) && <span><i className={p.leyU} />{uno.leyenda}</span>}
      <span><i className={p.leyH} />hoy</span>
    </div> : null}
  </div>
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// lecciones · la lupa sobre un tramo: la puerta, el riel de semanas y sus lecciones
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

interface Leccion { dia: string; titulo: string; entregable: string; numero: string; destino: string }
const leerLeccion = (x: unknown): Leccion | null => (esObj(x) && esTexto(x.titulo)
  ? { dia: texto(x.dia), titulo: x.titulo, entregable: texto(x.entregable), numero: texto(x.numero), destino: texto(x.destino) } : null)

/** «S5 · lun 23 – dom 29 nov» → la S grande arriba y sus fechas abajo (siempre el mismo alto, para que las columnas
 *  queden parejas aunque las fechas ocupen dos renglones); otro rótulo va tal cual. */
function rotuloSemana(r: string) {
  const m = /^(S\d+)\s*·\s*(.+)$/.exec(r)
  return m ? { n: <span className={p.semN}>{m[1]}</span>, fechas: m[2] } : { n: <span className={p.fecha} data-tono="oro">{r}</span>, fechas: '' }
}

function Lecciones({ b, ctx }: PropsBloque) {
  const hoy = useHoy(b.hoy)
  const [ref, { w, h }] = useTam<HTMLDivElement>({ w: 1304, h: numero(b.alto, 460) })
  const ranRef = useRef<(HTMLSpanElement | null)[]>([])
  const [anclas, setAnclas] = useState<{ x: number; y: number }[]>([])
  const caminoRef = useRef<SVGPathElement>(null)
  const gotaRef = useRef<SVGCircleElement>(null)
  const puerta = esObj(b.puerta) ? b.puerta : null
  const semanas = (Array.isArray(b.semanas) ? b.semanas : []).filter(esObj).filter(x => esTexto(x.rotulo))
  const nRan = puerta ? Math.max(0, Math.min(6, numero(puerta.ranuras, 0))) : 0

  useLayout(() => {
    const raiz = ref.current
    if (!raiz) return
    const xs = ranRef.current.slice(0, nRan).map(el => { if (!el) return null; const q = posEn(el, raiz); return { x: q.x + q.w + 6, y: q.y + q.h / 2 } }).filter((q): q is { x: number; y: number } => !!q)
    setAnclas(v => (v.length === xs.length && v.every((a, i) => a.x === xs[i].x && a.y === xs[i].y) ? v : xs))
  }, [w, h, nRan])

  // columnas: la primera semana (la escrita) es ancha; las demás se reparten lo que queda
  const PW = puerta ? 252 : 0
  const X = puerta ? PW + 72 : 0
  const R = Math.max(200, w - X)
  const pesos = semanas.map((x, i) => (Array.isArray(x.lecciones) && x.lecciones.length ? 2 : i === 0 ? 2 : 1))
  const total = pesos.reduce((a, z) => a + z, 0) || 1
  const cols: { a: number; z: number }[] = []
  pesos.reduce((acc, q) => { const ancho = (R * q) / total; cols.push({ a: acc, z: acc + ancho }); return acc + ancho }, X)
  const RIEL = 10

  const camino = anclas.length && cols.length
    ? `${curva(anclas[Math.floor(anclas.length / 2)].x, anclas[Math.floor(anclas.length / 2)].y, cols[0].a - 9, RIEL, 0.55)} L ${cols[cols.length - 1].z - 4} ${RIEL}`
    : ''
  useVida(ctx.modo === 'cerca' && !!camino, t => {
    const g = gotaRef.current, c = caminoRef.current
    if (!g || !c) return
    if (t < 1) { g.setAttribute('opacity', '0'); return }
    const VIAJE = 5.2, CICLO = VIAJE + 2.6, k = ((t - 1) % CICLO) / VIAJE
    if (k > 1) { g.setAttribute('opacity', '0'); return }
    const pt = c.getPointAtLength(c.getTotalLength() * suave(k))
    g.setAttribute('cx', String(pt.x)); g.setAttribute('cy', String(pt.y))
    g.setAttribute('opacity', String(Math.min(1, k * 10, (1 - k) * 10)))
  })

  if (!semanas.length) return <Hueco>lecciones: falta «semanas» (cada una con su rótulo)</Hueco>
  const pT = puerta ? tiempoDe(hoy, diaDe(puerta.desde), diaDe(puerta.hasta) ?? diaDe(puerta.desde)) : 'sin'

  return <div ref={ref} className={p.lec}>
    <svg className={p.capa} width={w} height={h} aria-hidden>
      {cols.length > 0 && puerta && <path d={`M ${X - 40} ${RIEL} L ${cols[0].a - 9} ${RIEL}`} className={p.tenue} strokeDasharray="2 4" />}
      {anclas.map((a, i) => { const d = curva(a.x, a.y, cols[0].a - 9, RIEL, 0.55); return <g key={i}><path d={d} className={p.hiloHalo} /><path d={d} className={p.hilo} /></g> })}
      {cols.map((c, i) => {
        const x_ = semanas[i], trazo = trazoDe(x_.sello)
        return <path key={i} d={`M ${c.a} ${RIEL} L ${c.z - (i === cols.length - 1 ? 4 : 0)} ${RIEL}`} className={p.riel} data-trazo={i === 0 && !trazo ? undefined : trazo ?? 'raya'} />
      })}
      {camino && <path ref={caminoRef} d={camino} fill="none" stroke="none" />}
      <circle ref={gotaRef} r={4.6} className={p.gota} opacity={0} />
    </svg>
    {cols.map((c, i) => { const t = tiempoDe(hoy, diaDe(semanas[i].desde), diaDe(semanas[i].hasta)); return <span key={i} className={p.nodo} data-primero={i === 0 ? '' : undefined} data-tiempo={t} style={{ left: c.a, top: RIEL }} aria-hidden /> })}

    {puerta && <section className={p.puerta} style={{ width: PW }}>
      <div className={p.puertaCeja}>{esTexto(puerta.ceja) && <Ceja tono="oro">{puerta.ceja}</Ceja>}{pT === 'hoy' && <SelloHoy />}</div>
      <p className={p.puertaTitulo}>{texto(puerta.titulo)}</p>
      {esTexto(puerta.cuando) && <Fecha>{puerta.cuando}</Fecha>}
      {puerta.sello != null && <div style={{ marginTop: 12 }}><SelloDe v={puerta.sello} /></div>}
      {esTexto(puerta.sale) && <p className={p.puertaSale}>{puerta.sale}</p>}
      {nRan > 0 && <div className={p.ranuras}>
        {Array.from({ length: nRan }, (_, k) => <span key={k} ref={el => { ranRef.current[k] = el }} className={p.ranura}>
          <i className={p.ranP} /><i className={p.ranL} /><i className={p.ranD} /></span>)}
      </div>}
      {esTexto(puerta.pie) && <p className={p.puertaPie}>{puerta.pie}</p>}
    </section>}

    {semanas.map((x_, i) => {
      const c = cols[i], t = tiempoDe(hoy, diaDe(x_.desde), diaDe(x_.hasta))
      const lecs = (Array.isArray(x_.lecciones) ? x_.lecciones : []).map(leerLeccion).filter((l): l is Leccion => !!l)
      const cierre = esObj(x_.cierre) ? x_.cierre : null
      const rot = rotuloSemana(x_.rotulo as string)
      const tc = cierre ? tiempoDe(hoy, diaDe(cierre.desde), diaDe(cierre.hasta) ?? diaDe(cierre.desde)) : 'sin'
      return <section key={i} className={p.semanaCol} style={{ left: c.a + (i === 0 ? 22 : 16), top: RIEL + 26, width: c.z - c.a - (i === 0 ? 40 : 30) }}>
        <div className={p.semCab}>{rot.n}{t === 'hoy' && <SelloHoy />}</div>
        <p className={p.semFechas}>{rot.fechas && <span className={p.fecha} data-tono="tenue">{rot.fechas}</span>}</p>
        <div className={p.semEstado}><SelloDe v={x_.sello} />{esTexto(x_.glosa) && <span className={p.semGlosa}>{x_.glosa}</span>}</div>
        <div className={p.semCuerpo}>
          {lecs.map((l, k) => {
            const cuerpo = <>
              {l.dia && <Fecha tono="tenue">{l.dia}</Fecha>}
              <span className={p.lecTitulo}>{l.titulo}</span>
              {l.entregable && <span className={p.lecEnt}>{l.entregable}</span>}
              {l.numero && <span className={p.suNumero}>su número: {l.numero}</span>}
            </>
            return l.destino
              ? <button key={k} type="button" className={p.leccion} title={l.destino} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ctx.ir(l.destino) }}>{cuerpo}</button>
              : <div key={k} className={p.leccion}>{cuerpo}</div>
          })}
          {esTexto(x_.foco) && <p className={p.semFoco}>{x_.foco}</p>}
          {cierre && <div className={p.cierre}>
            <div className={p.puertaCeja}>{esTexto(cierre.ceja) && <Ceja tono="oro">{cierre.ceja}</Ceja>}{tc === 'hoy' && <SelloHoy />}</div>
            <p className={p.cierreTitulo}>{texto(cierre.titulo)}</p>
            {esTexto(cierre.cuando) && <Fecha>{cierre.cuando}</Fecha>}
          </div>}
        </div>
      </section>
    })}
  </div>
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// pasos · ventana · portada
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function Pasos({ b, ctx }: PropsBloque) {
  const hoy = useHoy(b.hoy)
  const pasos = (Array.isArray(b.pasos) ? b.pasos : []).filter(esObj).filter(x => esTexto(x.titulo))
  if (!pasos.length) return <Hueco>pasos: falta «pasos» (cada uno con su título)</Hueco>
  return <div className={p.pasos} data-alinear={b.alinear === 'derecha' ? 'derecha' : undefined}>
    {esTexto(b.ceja) && <Ceja>{b.ceja}</Ceja>}
    <div className={p.pasosFila}>
      {pasos.map((x, i) => {
        const desde = diaDe(x.desde), t = tiempoDe(hoy, desde, diaDe(x.hasta) ?? desde)
        const destino = texto(x.destino)
        const cuerpo = <>
          <span className={p.pasoCab}><span className={p.pasoTitulo}>{x.titulo as string}</span>{t === 'hoy' && <SelloHoy />}</span>
          <span className={p.pasoMeta}>{esTexto(x.cuando) && <Fecha tono="oro">{x.cuando}</Fecha>}<SelloDe v={x.sello} /></span>
          {esTexto(x.frase) && <span className={p.pasoFrase}>{x.frase}</span>}
        </>
        return <div key={i} className={p.pasoYFlecha}>
          {i > 0 && <svg className={p.flecha} width={52} height={14} viewBox="0 0 52 14" aria-hidden><path d="M 2 7 L 46 7 M 40 2 L 47 7 L 40 12" /></svg>}
          {destino
            ? <button type="button" className={p.paso} data-boton="" title={destino} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ctx.ir(destino) }}>{cuerpo}</button>
            : <div className={p.paso}>{cuerpo}</div>}
        </div>
      })}
    </div>
  </div>
}

function Ventana({ b }: PropsBloque) {
  const hoy = useHoy(b.hoy)
  const desde = diaDe(b.desde), hasta = diaDe(b.hasta) ?? desde
  if (desde == null || hasta == null) return <Hueco>ventana: falta «desde» (y «hasta»), 'AAAA-MM-DD'</Hueco>
  const t = tiempoDe(hoy, desde, hasta)
  return <div className={p.ventana} data-alinear={b.alinear === 'derecha' ? 'derecha' : undefined}>
    <Fecha tono="tenue">{texto(b.texto, `${fmtDia(desde)} a ${fmtDia(hasta)}`)}</Fecha>
    {t === 'antes' ? <Sello estado="idea">abre el {fmtDia(desde)}</Sello>
      : t === 'hoy' ? <SelloHoy>{hoy === desde ? 'abre hoy' : 'hoy · en curso'}</SelloHoy>
        : <span className={s.sello}>terminó el {fmtDia(hasta)}</span>}
  </div>
}

function Portada({ b, ctx }: PropsBloque) {
  const src = texto(b.src)
  if (!/^\/mapa\/[\w./-]+\.(jpe?g|png|webp)$/i.test(src)) return <Hueco>portada: «src» va como /mapa/portadas/&lt;archivo&gt; (jpg, png o webp)</Hueco>
  const destino = texto(b.destino)
  /* eslint-disable-next-line @next/next/no-img-element */
  const img = <img src={src} alt={texto(b.alt)} className={p.portadaImg} draggable={false} />
  return <figure className={p.portada}>
    {destino ? <button type="button" className={p.portadaBoton} title={destino} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ctx.ir(destino) }}>{img}</button> : img}
    {esTexto(b.pie) && <figcaption className={p.portadaPie}>{b.pie}</figcaption>}
  </figure>
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// numero-vivo · un número de El pulso
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const ORGANOS: readonly Organo[] = ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas']
const organoDe = (f: unknown): Organo | null => {
  const o = typeof f === 'string' && f.startsWith('pulso:') ? f.slice(6) : ''
  return (ORGANOS as readonly string[]).includes(o) ? (o as Organo) : null
}

function NumeroVivo({ b, ctx }: PropsBloque) {
  const organo = organoDe(b.fuente)
  const pu = usePulso(organo ?? 'entrega', !!organo)
  if (!organo) return <Hueco>numero-vivo: «fuente» va como pulso:&lt;órgano&gt; (marketing, venta, comprador, entrega, finanzas o sistemas)</Hueco>
  const hay = pu.estado === 'numero' && !!pu.cifra
  const sinDato = pu.estado === 'leyendo' ? 'leyendo…' : pu.estado === 'oculto' ? 'oculto en directo' : 'sin dato'
  const motivo = pu.estado === 'sin-sensor' ? pu.falta : pu.estado === 'error' ? pu.error : undefined
  return <section className={p.vivo} data-estado={hay ? 'numero' : pu.estado}>
    <div className={p.vivoCab}><Respira tono="oro" apagado={!hay} />{esTexto(b.ceja) && <Ceja tono="oro">{b.ceja}</Ceja>}</div>
    <p className={p.vivoCifra} data-late={hay && ctx.modo === 'cerca' ? '' : undefined} key={hay ? pu.cifra : sinDato}>{hay ? pu.cifra : sinDato}</p>
    {hay && pu.unidad && <p className={p.vivoUnidad}>{pu.unidad}</p>}
    {hay && pu.detalle?.length ? <p className={p.vivoDetalle}>{pu.detalle.join(' · ')}</p> : null}
    {!hay && motivo && <p className={p.vivoDetalle}>{motivo}</p>}
    {pu.fuente && <p className={p.vivoFuente}>{pu.fuente}</p>}
    <Botones v={b.botones} ctx={ctx} style={{ marginTop: 18 }} />
  </section>
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// etapa-embudo · una etapa de embudo.json y su lazo de vuelta
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function EtapaEmbudo({ b }: PropsBloque) {
  const id = texto(b.etapa)
  const { embudo, cargando } = useEmbudo(!!id)
  if (!id) return <Hueco>etapa-embudo: falta «etapa» (el id de embudo.json, p. ej. ht.expansion)</Hueco>
  const et = embudo?.etapas.find(e => e.id === id) ?? null
  const respaldo = esObj(b.respaldo) ? b.respaldo : null
  const nombre = et?.nombre ?? texto(respaldo?.nombre)
  const quePasa = et?.que_pasa ?? texto(respaldo?.que_pasa)
  if (!nombre) return <Hueco>{cargando ? `Leyendo la etapa «${id}» del embudo…` : `La etapa «${id}» no está en embudo.json.`}</Hueco>
  const lazos = embudo?.aristas.filter(a => a.desde === id && a.tipo === 'volante') ?? []
  const nombreDe = (eid: string) => embudo?.etapas.find(e => e.id === eid)?.nombre
  const estadoArista = (e: string) => (e === 'opera' ? <Sello estado="firmado">opera</Sello> : e === 'observada' ? <Sello estado="pendiente">observada</Sello> : <Sello estado="abierto">{e}</Sello>)
  return <section className={p.etapa}>
    <div className={p.puertaCeja}>{esTexto(b.ceja) && <Ceja>{b.ceja}</Ceja>}
      {et ? (et.opera_hoy ? <Sello estado="firmado">opera hoy</Sello> : <Sello estado="abierto">por construir</Sello>) : <SelloDe v={respaldo?.sello} />}</div>
    <h3 className={s.titulo} style={{ fontSize: 46, marginTop: 12 }}>{nombre}</h3>
    {quePasa && <p className={s.cuerpo} style={{ fontSize: 17.5, marginTop: 14, maxWidth: 640 }}>{quePasa}</p>}
    {lazos.map((a, i) => <div key={i} className={p.lazo}>
      <svg width={44} height={44} viewBox="0 0 44 44" className={p.lazoGlifo} data-trazo={a.estado === 'opera' ? undefined : 'raya'} aria-hidden>
        <path d="M 22 6 A 16 16 0 1 1 7.6 15" /><path d="M 3.5 9.5 L 7.6 15.6 L 13.8 12.4" data-punta="" /><text x="22" y="27" textAnchor="middle">R</text>
      </svg>
      <div>
        <p className={p.lazoAccion}>{a.accion ?? `${nombre} → ${nombreDe(a.hacia) ?? a.hacia}`}{esTexto(b.lazoGlosa) && <span> · {b.lazoGlosa}</span>}{estadoArista(a.estado)}</p>
        {a.nota && <p className={p.lazoNota}>{a.nota}</p>}
      </div>
    </div>)}
    {et && <p className={p.mide}><span className={p.fecha} data-tono="tenue">la mide</span> <b>{et.mide.nombre}</b>
      {!et.mide.hay_numero && et.mide.fuente ? <> · {et.mide.fuente}</> : null}</p>}
    <p className={p.vivoFuente} style={{ marginTop: 12 }}>{et ? `embudo.json · etapa ${id}` : `${cargando ? 'leyendo embudo.json' : 'embudo.json no respondió'} · texto de la receta`}</p>
  </section>
}

export const BLOQUES_PROGRAMA: Record<string, ComponenteBloque> = {
  modulos: Modulos, 'tira-semanas': Tira, lecciones: Lecciones, pasos: Pasos, ventana: Ventana, portada: Portada,
  'numero-vivo': NumeroVivo, 'etapa-embudo': EtapaEmbudo,
}

