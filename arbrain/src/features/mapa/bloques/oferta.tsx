'use client'
/**
 * Bloques de LA OFERTA (mapa v16, 14 nov 2026). Genéricos: sirven para la oferta de Daniel y para la de cada alumno.
 * Estado = trazo (firmado sólido · abierto y pendiente en rayas · idea en puntos); oro = lo firmado y el número, morado =
 * el concepto. De lejos todo se ve completo y quieto; de cerca la isla vive UNA cosa a la vez en un ciclo de 28 s (cada
 * bloque dice en `vida.desde` en qué segundo le toca; `"vida": false` lo deja quieto).
 *
 *   leyenda-estados  { ceja?, items: [{ estado, texto, sello? }], nota? }                       cómo leer el trazo
 *   escalera-valor   { ceja?, glosa?, origen?: { ceja, glosa, en?, hacia? }, gente?: [{ en, n }], sube?, piso?: { izq, der },
 *                      escalones: [{ id, kicker?, nombre, estado?, tono?: 'morado'|'oro'|'gris', peso?, foco?,
 *                        renombre?: { texto, sello?, glosa? }, voz?, sello?, filas?: [{ rotulo?, sello?, texto?, cita? }],
 *                        precio?: { texto, sello? }, nota?: { rotulo?, sello?, texto? } }], vida? }
 *                      los escalones suben con el precio y su ANCHO (peso) dice dónde va el empuje; la gente llega por
 *                      la ruta de `origen` y se suma arriba del escalón ancho.
 *   piezas-oferta    { ceja?, glosa?, columnas?: 1|2, corte?, anchos?: [n, n], tono?, vida?,
 *                      items: [{ n, nombre, sello?, glosa?, partes?: [{ texto | cita | nota, rotulo? }], bloque? }] }
 *                      las N piezas de una oferta ensartadas en un nervio; `bloque` incrusta otro bloque (bonos, garantía…).
 *                      En `texto`, **así** se marca una cifra en oro.
 *   bonos            { ceja?, glosa?, items: [{ objecion, bono }], vida? }        cada bono contra la objeción que tacha
 *   garantia         { ceja?, glosa?, dias, pasos?: [{ dia, rotulo, texto }], cada?: { desde, hasta, cada, texto },
 *                      final?: { ceja, texto }, vida? }                            la garantía dibujada sobre sus días
 *   domino           { n?, nombre?, sello?, ceja?, frase: string | string[], pitch?: { ceja?, texto, sello? }, botones?, vida? }
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Botones, Ceja, Hueco, Sello, SelloDe, esEstado, type Estado } from '../piezas'
import { esObj, esTexto, lista, numero, texto, type ComponenteBloque, type PropsBloque } from '../tipos'
import { BLOQUES_BASE } from './base'
import s from '../isla.module.css'
import o from './oferta.module.css'

// ── comunes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
type Tono = 'morado' | 'oro' | 'gris'
const tonoDe = (v: unknown, r: Tono = 'gris'): Tono => (v === 'morado' || v === 'oro' || v === 'gris' ? v : r)
const tonoSello = (t: Tono) => (t === 'gris' ? undefined : t)
/** El estado (trazo) de un sello escrito en la receta: `"abierto"` o `{ "estado": "abierto", "texto": "…" }`. */
const estadoDe = (v: unknown): Estado | undefined => (esEstado(v) ? v : esObj(v) && esEstado(v.estado) ? v.estado : undefined)
const CICLO = 28
/** En qué segundo del ciclo vive el bloque; `null` = quieto. */
const vidaDe = (v: unknown, r: number): number | null => (v === false ? null : esObj(v) ? numero(v.desde, r) : r)
const seg = (x: number) => `${x.toFixed(2)}s`

/** Texto con cifras marcadas: «se queda en **39 USD**» → la cifra en oro. */
function Rico({ t }: { t: string }) {
  return <>{t.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>
}

function CabSeccion({ ceja, glosa, tono }: { ceja?: unknown; glosa?: unknown; tono?: Tono }) {
  if (!esTexto(ceja) && !esTexto(glosa)) return null
  return <div className={o.cabSec}>
    {esTexto(ceja) && <Ceja tono={tonoSello(tono ?? 'oro')}>{ceja}</Ceja>}
    {esTexto(glosa) && <span className={o.cabGlosa}>{glosa}</span>}
  </div>
}

/** Un sello más chico (para dentro de una placa angosta). */
const Chico = ({ v, tono }: { v: unknown; tono?: 'oro' | 'morado' }) => (v == null ? null : <span className={o.chico}><SelloDe v={v} tono={tono} /></span>)

// ── leyenda-estados ──────────────────────────────────────────────────────────────────────────────────────────────────
interface ItemLeyenda { estado: Estado; texto: string; sello?: string; tono?: string }
const esItemLeyenda = (x: unknown): x is ItemLeyenda => esObj(x) && esEstado(x.estado) && esTexto(x.texto)

function LeyendaEstados({ b: r }: PropsBloque) {
  const items = lista(r.items, esItemLeyenda)
  if (!items.length) return <Hueco>leyenda sin «items»</Hueco>
  return <aside className={o.leyenda}>
    <Ceja>{texto(r.ceja, 'El trazo es el estado')}</Ceja>
    {items.map(it => <div key={it.estado + it.texto} className={o.leyFila}>
      <span className={o.leySello}><Sello estado={it.estado} tono={it.tono === 'oro' || it.tono === 'morado' ? it.tono : undefined}>{it.sello ?? it.estado}</Sello></span>
      <span>{it.texto}</span>
    </div>)}
    {esTexto(r.nota) && <p className={o.leyNota}>{r.nota}</p>}
  </aside>
}

// ── escalera ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface FilaEsc { rotulo?: string; sello?: unknown; texto?: string; cita?: string }
interface Escalon {
  id: string; kicker?: string; nombre: string; estado?: unknown; tono?: unknown; peso?: number; foco?: boolean
  renombre?: { texto?: string; sello?: unknown; glosa?: string }; voz?: string; sello?: unknown
  filas?: unknown; precio?: { texto?: string; sello?: unknown }; nota?: { rotulo?: string; sello?: unknown; texto?: string }
}
const esEscalon = (x: unknown): x is Escalon => esObj(x) && esTexto(x.nombre)
const esFilaEsc = (x: unknown): x is FilaEsc => esObj(x) && (esTexto(x.texto) || esTexto(x.cita) || esTexto(x.rotulo))
interface Grupo { en: string; n: number }
const esGrupo = (x: unknown): x is Grupo => esObj(x) && esTexto(x.en) && typeof x.n === 'number'

const DX = 22, DY = 14                  // el techo: profundidad del alzado
const HUECO_ESC = 36, PAD_B = 22, GAP_ABAJO = 18
type P2 = [number, number]
interface Geo { W: number; H: number; pasos: { x: number; w: number; h: number; top: number }[] }
const frac = (x: number) => x - Math.floor(x)
const f1 = (n: number) => n.toFixed(1)
const pt = (p: P2) => `${f1(p[0])} ${f1(p[1])}`

function Escalera({ b: r, ctx }: PropsBloque) {
  const pasos = lista(r.escalones, esEscalon).map((p, i) => ({ ...p, id: esTexto(p.id) ? p.id : `e${i}` }))
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const escena = useRef<HTMLDivElement>(null)
  const arribas = useRef<(HTMLDivElement | null)[]>([])
  const abajos = useRef<(HTMLDivElement | null)[]>([])
  const [geo, setGeo] = useState<Geo | null>(null)
  const sube = numero(r.sube, 38), cielo = numero(r.cielo, 34), minimo = numero(r.minimo, 200)
  const clave = pasos.map(p => p.id).join('|')

  // los escalones se miden ya pintados: cada uno es tan alto como su texto, y nunca más bajo que el anterior + `sube`
  useLayoutEffect(() => {
    const el = escena.current
    if (!el) return
    const medir = () => {
      const nodos = [...el.querySelectorAll<HTMLElement>(':scope > div > [data-paso]')]
      const W = el.clientWidth
      if (!W || nodos.length !== pasos.length) return
      // un nombre que no cabe en su escalón se encoge (nunca se corta a media palabra)
      for (const h of el.querySelectorAll<HTMLElement>('[data-paso] h3')) {
        h.style.fontSize = ''
        let fs = parseFloat(getComputedStyle(h).fontSize)
        while (fs > 13 && h.scrollWidth > h.clientWidth + 1) { fs -= 1; h.style.fontSize = `${fs}px` }
      }
      let prev = 0
      const hs = nodos.map((_, i) => {
        const a = arribas.current[i]?.offsetHeight ?? 0, b = abajos.current[i]?.offsetHeight ?? 0
        const nat = a + (b ? GAP_ABAJO + b : 0) + PAD_B
        const h = Math.ceil(Math.max(nat, prev ? prev + sube : minimo)); prev = h; return h
      })
      const H = cielo + DY + Math.max(...hs)
      const g: Geo = { W, H, pasos: nodos.map((n, i) => ({ x: n.offsetLeft, w: n.offsetWidth, h: hs[i], top: H - hs[i] })) }
      setGeo(v => (v && JSON.stringify(v) === JSON.stringify(g) ? v : g))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    arribas.current.forEach(n => n && ro.observe(n)); abajos.current.forEach(n => n && ro.observe(n))
    return () => ro.disconnect()
  }, [clave, sube, cielo, minimo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pasos.length) return <Hueco>escalera-valor sin «escalones»</Hueco>
  const idx = (id: unknown, r0: number) => { const i = pasos.findIndex(p => p.id === id); return i < 0 ? r0 : i }
  const origen = esObj(r.origen) ? r.origen : null
  const iFoco = Math.max(0, pasos.findIndex(p => p.foco))
  const iEn = idx(origen?.en, 0), iHacia = idx(origen?.hacia, iFoco)
  const piso = esObj(r.piso) ? r.piso : null
  const desde = vidaDe(r.vida, 0.4)

  // ── el dibujo (cuando ya hay medidas) ──
  let dibujo: ReactNode = null, vida: ReactNode = null, etiqueta: ReactNode = null
  if (geo && geo.pasos.length === pasos.length) {
    const G = geo.H
    const P = geo.pasos
    const techo = (i: number, u: number, v: number): P2 => [P[i].x + u * P[i].w + v * DX, P[i].top - v * DY]
    // la gente: casi toda arriba del escalón ancho; pocos suben (posiciones fijas, sin azar)
    const grupos = lista(r.gente, esGrupo).map((g, k) => ({ i: idx(g.en, -1), n: Math.max(0, Math.min(60, Math.round(g.n))), k })).filter(g => g.i >= 0)
    const gente = grupos.flatMap(g => Array.from({ length: g.n }, (_, j) => {
      const u = g.k ? 0.22 + 0.6 * frac(j * 0.618034 + 0.2) : 0.08 + 0.86 * frac(j * 0.618034 + 0.05)
      const v = 0.22 + 0.56 * frac(j * 0.41421 + (g.k ? 0.62 : 0.31))
      return { g: g.k, i: g.i, p: techo(g.i, u, v) }
    }))
    // la ruta de hoy: del origen al techo del escalón al que llega
    const conOrigen = !!origen && iEn !== iHacia
    const S: P2 = [P[iEn].x + 20, Math.max(18, P[iEn].top - 150)]
    const L = techo(iHacia, 0.035, 0.5)
    const c1: P2 = [S[0] + 70, Math.max(6, S[1] - 96)], c2: P2 = [L[0] - 150, Math.max(4, L[1] - 100)]
    const hoy = `M ${pt(S)} C ${pt(c1)} ${pt(c2)} ${pt(L)}`
    const ang = Math.atan2(L[1] - c2[1], L[0] - c2[0]) * 180 / Math.PI
    // la ruta abierta: por la puerta (baja a su techo, lo cruza y sube entre los dos escalones)
    const enP = techo(iEn, 0.06, 0.5), finP = techo(iEn, 0.9, 0.5), xg = P[iEn].x + P[iEn].w + DX + 7
    const abierta = `M ${f1(S[0])} ${f1(S[1] + 9)} L ${f1(S[0])} ${f1(enP[1] - 22)} Q ${f1(S[0])} ${f1(enP[1])} ${pt(enP)} L ${pt(finP)}`
      + ` Q ${f1(xg)} ${f1(finP[1])} ${f1(xg)} ${f1(finP[1] - 24)} L ${f1(xg)} ${f1(P[iHacia].top + 22)} Q ${f1(xg)} ${f1(L[1])} ${f1(L[0] - 4)} ${f1(L[1] + 2)}`
    // de cada escalón al siguiente, a partir del que recibe: el trazo es el del escalón al que se sube
    const subidas = pasos.slice(iHacia, -1).map((_, k) => {
      const i = iHacia + k, a0 = techo(i, 0.975, 0.5), a1 = techo(i + 1, 0.06, 0.5)
      const e = estadoDe(pasos[i + 1].estado) ?? 'firmado'
      return { i, a0, a1, e, d: `M ${pt(a0)} C ${f1(a0[0] + 18)} ${f1(a0[1] - 46)} ${f1(a1[0] - 22)} ${f1(a1[1] - 46)} ${pt(a1)}` }
    })
    const foco = P[iHacia]
    dibujo = <svg className={o.alzado} width={geo.W} height={G + 8} viewBox={`0 0 ${geo.W} ${G + 8}`} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-suelo`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" className={o.sueloA} /><stop offset=".5" className={o.sueloB} /><stop offset="1" className={o.sueloA} /></linearGradient>
        <radialGradient id={`${uid}-reflejo`} cx=".5" cy=".5" r=".5"><stop offset="0" className={o.reflejoA} /><stop offset="1" className={o.reflejoB} /></radialGradient>
      </defs>
      <ellipse cx={foco.x + foco.w / 2 + 10} cy={G + 2} rx={foco.w * 0.62} ry={22} fill={`url(#${uid}-reflejo)`} />
      <line x1={0} y1={G} x2={geo.W} y2={G} stroke={`url(#${uid}-suelo)`} strokeWidth={1.5} />
      {pasos.map((p, i) => {
        const { x, w, top } = P[i], e = estadoDe(p.estado) ?? 'firmado'
        return <g key={p.id} className={o.cuerpo} data-tono={tonoDe(p.tono)} data-estado={e} data-foco={p.foco ? '' : undefined}>
          <linearGradient id={`${uid}-f${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={o.frA} /><stop offset=".55" className={o.frB} /><stop offset="1" className={o.frC} /></linearGradient>
          <linearGradient id={`${uid}-s${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={o.trA} /><stop offset=".6" className={o.trB} /><stop offset="1" className={o.trC} /></linearGradient>
          <linearGradient id={`${uid}-l${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={o.laA} /><stop offset=".5" className={o.laB} /><stop offset="1" className={o.frC} /></linearGradient>
          <path className={o.lado} fill={`url(#${uid}-l${i})`} d={`M ${f1(x + w)} ${f1(top)} L ${f1(x + w + DX)} ${f1(top - DY)} L ${f1(x + w + DX)} ${f1(G)} L ${f1(x + w)} ${f1(G)} Z`} />
          <rect className={o.frente} x={x} y={top} width={w} height={G - top} fill={`url(#${uid}-f${i})`} stroke={`url(#${uid}-s${i})`} />
          <path className={o.techo} d={`M ${f1(x)} ${f1(top)} L ${f1(x + DX)} ${f1(top - DY)} L ${f1(x + w + DX)} ${f1(top - DY)} L ${f1(x + w)} ${f1(top)} Z`} />
          <line className={o.filo} x1={x} y1={top} x2={x + w} y2={top} />
        </g>
      })}
      {conOrigen && <>
        <path className={o.rutaAbierta} d={abierta} />
        <path className={o.rutaHoy} d={hoy} />
        <path className={o.punta} d={`M ${f1(L[0] + 1)} ${f1(L[1])} l -9 -7 l 2 7 l -2 7 z`} transform={`rotate(${ang.toFixed(1)} ${pt(L)})`} />
        <circle className={o.fuenteV} cx={S[0]} cy={S[1]} r={9} />
        <circle className={o.fuenteN} cx={S[0]} cy={S[1]} r={3.5} />
      </>}
      {subidas.map(sb => <path key={sb.i} className={o.subida} data-estado={sb.e} d={sb.d} />)}
      {gente.map((h, k) => <circle key={k} className={o.persona} cx={f1(h.p[0])} cy={f1(h.p[1])} r={3.3} />)}
    </svg>
    if (conOrigen && esTexto(origen?.ceja)) etiqueta = <div className={o.origen} style={{ left: S[0] + 20, top: S[1] - 9 }}>
      <span className={o.origenK}>{origen.ceja}</span>
      {esTexto(origen.glosa) && <span className={o.origenG}>{origen.glosa}</span>}
    </div>

    // ── de cerca: llegan personas por la ruta de hoy y se suman (una a la vez); una sube al escalón siguiente ──
    const g0 = gente.filter(h => h.g === 0), g1 = gente.filter(h => h.g === 1)
    if (ctx.modo === 'cerca' && desde != null && conOrigen && g0.length) {
      const sub0 = subidas[0]
      const viajes = [0, 1, 2, 3, 4].map(k => {
        const sale = desde + k * 1.2
        const sube1 = k === 2 && g1.length > 0 && !!sub0
        const fin = sube1 ? g1[1 % g1.length].p : g0[[3, 9, 0, 6, 11][k] % g0.length].p
        const d = sube1 ? `${hoy} L ${pt(sub0.a0)} ${sub0.d.replace(/^M [^C]+/, '')} L ${pt(fin)}` : `${hoy} L ${pt(fin)}`
        const dur = sube1 ? 4.4 : 2.4 + 0.9 * ((fin[0] - L[0]) / Math.max(1, foco.w))
        return { k, d, fin, t0: sale / CICLO, t1: Math.min(0.97, (sale + dur) / CICLO) }
      })
      const kt = (xs: number[]) => xs.map(x => Math.min(1, Math.max(0, x)).toFixed(4)).join(';')
      vida = <svg className={`${o.alzado} ${o.vida}`} width={geo.W} height={G + 8} viewBox={`0 0 ${geo.W} ${G + 8}`} aria-hidden>
        {viajes.map(v => {
          const e = 0.25 / CICLO, fx = 0.5 / CICLO, onda = 0.9 / CICLO
          return <g key={v.k}>
            <circle className={o.viajero} r={3.6} opacity={0}>
              <animateMotion dur={`${CICLO}s`} repeatCount="indefinite" path={v.d} calcMode="spline" keyPoints="0;0;1;1"
                keyTimes={kt([0, v.t0, v.t1, 1])} keySplines="0 0 1 1;0.45 0 0.25 1;0 0 1 1" />
              <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values="0;0;1;1;0;0"
                keyTimes={kt([0, v.t0, v.t0 + e, v.t1, v.t1 + fx, 1])} />
            </circle>
            <circle className={o.ondaP} cx={f1(v.fin[0])} cy={f1(v.fin[1])} r={3.3} opacity={0}>
              <animate attributeName="r" dur={`${CICLO}s`} repeatCount="indefinite" values="3.3;3.3;14;14" keyTimes={kt([0, v.t1, v.t1 + onda, 1])} />
              <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values="0;0;0.8;0;0" keyTimes={kt([0, v.t1, v.t1 + 0.0005, v.t1 + onda, 1])} />
            </circle>
          </g>
        })}
      </svg>
    }
  }

  const medido = !!geo && geo.pasos.length === pasos.length
  return <section className={o.escalera} data-tema={ctx.tema}>
    <CabSeccion ceja={r.ceja} glosa={r.glosa} tono="oro" />
    <div ref={escena} className={o.escena} data-medido={medido ? '' : undefined} style={medido ? { height: geo!.H } : undefined}>
      {dibujo}
      <div className={o.pasos}>
        {pasos.map((p, i) => {
          const tono = tonoDe(p.tono), ts = tonoSello(tono), e = estadoDe(p.estado) ?? 'firmado'
          const filas = lista(p.filas, esFilaEsc)
          const ren = esObj(p.renombre) && esTexto(p.renombre.texto) ? p.renombre : null
          const precio = esObj(p.precio) && esTexto(p.precio.texto) ? p.precio : null
          const nota = esObj(p.nota) && (esTexto(p.nota.rotulo) || esTexto(p.nota.texto)) ? p.nota : null
          const conAbajo = !!precio || !!nota
          return <article key={p.id} data-paso={p.id} className={o.paso} data-tono={tono} data-estado={e} data-foco={p.foco ? '' : undefined}
            style={{ flex: `${numero(p.peso, 1)} 1 0`, ...(medido ? { height: geo!.pasos[i].h } : {}) }}>
            <div ref={n => { arribas.current[i] = n }} className={o.arriba}>
              {esTexto(p.kicker) && <p className={o.kicker}>{p.kicker}</p>}
              <h3 className={o.nombre}>{p.nombre}</h3>
              {ren && <div className={o.renombre}><b>{ren.texto}</b><Chico v={ren.sello} />{esTexto(ren.glosa) && <em>{ren.glosa}</em>}</div>}
              {esTexto(p.voz) && <p className={o.voz}>{p.voz}</p>}
              {p.sello != null && <div className={o.selloPaso}><Chico v={p.sello} tono={ts} /></div>}
              {filas.map((f, k) => <div key={k} className={o.filaEsc}>
                {(esTexto(f.rotulo) || f.sello != null) && <div className={o.filaCab}>{esTexto(f.rotulo) && <span className={o.rot}>{f.rotulo}</span>}<Chico v={f.sello} tono={ts} /></div>}
                {esTexto(f.cita) && <p className={o.filaCita}>{f.cita}</p>}
                {esTexto(f.texto) && <p className={o.filaTexto}><Rico t={f.texto} /></p>}
              </div>)}
            </div>
            {conAbajo && <div ref={n => { abajos.current[i] = n }} className={o.abajo}>
              {precio && <div className={o.precio}><b>{precio.texto}</b><Chico v={precio.sello} tono={tono === 'morado' ? undefined : ts} /></div>}
              {nota && <div className={o.nota} data-estado={estadoDe(nota.sello) ?? 'firmado'}>
                <div className={o.filaCab}>{esTexto(nota.rotulo) && <b>{nota.rotulo}</b>}<Chico v={nota.sello} /></div>
                {esTexto(nota.texto) && <p className={o.notaTexto}>{nota.texto}</p>}
              </div>}
            </div>}
          </article>
        })}
      </div>
      {etiqueta}
      {vida}
    </div>
    {piso && (esTexto(piso.izq) || esTexto(piso.der)) && <div className={o.piso}><span>{texto(piso.izq)}</span><span>{texto(piso.der)}</span></div>}
  </section>
}

// ── bonos ────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Bono { objecion: string; bono: string }
const esBono = (x: unknown): x is Bono => esObj(x) && esTexto(x.objecion) && esTexto(x.bono)

function Bonos({ b: r, ctx }: PropsBloque) {
  const items = lista(r.items, esBono)
  if (!items.length) return <Hueco>bonos sin «items»</Hueco>
  const desde = vidaDe(r.vida, 24.1)
  return <section className={o.bonosRaiz} data-vivo={ctx.modo === 'cerca' && desde != null ? '' : undefined}>
    <CabSeccion ceja={r.ceja} glosa={r.glosa} tono="morado" />
    <div className={o.bonos}>
      {items.map((it, i) => {
        const st = { '--retraso': seg((desde ?? 0) + i * 0.4) } as CSSProperties
        return <div key={i} className={o.bonoFila} style={st}>
          <span className={o.obj}>{it.objecion}<i className={o.tacha} aria-hidden /></span>
          <svg className={o.flecha} viewBox="0 0 30 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 6h27M23 1.5 28 6l-5 4.5" /></svg>
          <span className={o.bono}>{it.bono}</span>
        </div>
      })}
    </div>
  </section>
}

// ── garantía ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface PasoG { dia: number; rotulo?: string; texto?: string }
const esPasoG = (x: unknown): x is PasoG => esObj(x) && typeof x.dia === 'number'
const SUAVE = 'cubic-bezier(0.65, 0, 0.35, 1)'

function Garantia({ b: r, ctx }: PropsBloque) {
  const n = Math.max(1, Math.round(numero(r.dias, 90)))
  const pasos = lista(r.pasos, esPasoG).filter(p => p.dia > 0 && p.dia < n).sort((a, b) => a.dia - b.dia)
  const cada = esObj(r.cada) ? r.cada : null
  const cDesde = numero(cada?.desde, 0), cHasta = Math.min(n - 1, numero(cada?.hasta, 0)), cPaso = Math.max(1, numero(cada?.cada, 7))
  const semanas: number[] = []
  if (cada) for (let d = cDesde; d <= cHasta && semanas.length < 60; d += cPaso) if (d > 0) semanas.push(d)
  const final = esObj(r.final) ? r.final : null
  const paradas = [...new Set([...pasos.map(p => p.dia), ...semanas, n])].sort((a, b) => a - b)
  const desde = vidaDe(r.vida, 10)
  const vivo = ctx.modo === 'cerca' && desde != null
  const marco = useRef<HTMLDivElement>(null)
  const clave = paradas.join(',')
  // de cerca se puede tocar: el cursor sobre los días los recorre a mano
  const [manual, setManual] = useState<number | null>(null)
  const recorrer = (e: { clientX: number }) => {
    const m = marco.current
    if (!m) return
    const rc = m.getBoundingClientRect()
    const d = Math.max(0, Math.min(n, ((e.clientX - rc.left) / Math.max(1, rc.width)) * n))
    setManual(d > n * 0.965 ? n : d)
  }

  // de cerca: un andante recorre los días parada por parada; lo recorrido se llena; al llegar, la caja final se enciende
  useEffect(() => {
    const m = marco.current
    if (!vivo || !m) return
    const C = CICLO, P = Math.min(0.8, 10.4 / paradas.length)
    const T = (t: number) => Math.min(1, Math.max(0, t / C))
    const tx = (d: number) => `translateX(${((d / n) * 100).toFixed(3)}%)`
    const clip = (d: number) => `inset(0 ${(100 - (d / n) * 100).toFixed(3)}% 0 0)`
    const kfAnd: Keyframe[] = [{ offset: 0, transform: tx(0) }], kfClip: Keyframe[] = [{ offset: 0, clipPath: clip(0) }]
    let prev = 0, tFin = 0.5
    paradas.forEach((d, i) => {
      const t0 = 0.5 + i * P, t1 = t0 + 0.7 * P
      kfAnd.push({ offset: T(t0), transform: tx(prev), easing: SUAVE }, { offset: T(t1), transform: tx(d) })
      kfClip.push({ offset: T(t0), clipPath: clip(prev), easing: SUAVE }, { offset: T(t1), clipPath: clip(d) })
      prev = d; tFin = t1
    })
    kfAnd.push({ offset: 1, transform: tx(n) }); kfClip.push({ offset: 1, clipPath: clip(n) })
    const luz: Keyframe[] = [{ offset: 0, opacity: 0 }, { offset: T(0.4), opacity: 1 }, { offset: T(tFin + 0.5), opacity: 1 }, { offset: T(tFin + 1.2), opacity: 0 }, { offset: 1, opacity: 0 }]
    const op = { duration: C * 1000, delay: desde! * 1000, iterations: Infinity }
    const q = (sel: string) => m.querySelector<HTMLElement>(sel)
    const anims: Animation[] = []
    const and = q('[data-andante]'), hecho = q('[data-hecho]'), caja = m.parentElement?.querySelector<HTMLElement>('[data-luz-final]')
    if (and) anims.push(and.animate(kfAnd, op), and.animate(luz, op))
    if (hecho) anims.push(hecho.animate(kfClip, op), hecho.animate(luz, op))
    if (caja) anims.push(caja.animate([{ offset: 0, opacity: 0 }, { offset: T(tFin - 0.1), opacity: 0 }, { offset: T(tFin + 0.5), opacity: 1 }, { offset: T(tFin + 1.3), opacity: 1 }, { offset: T(tFin + 2.4), opacity: 0 }, { offset: 1, opacity: 0 }], op))
    // cada parada late cuando el andante llega
    m.querySelectorAll<HTMLElement>('[data-onda]').forEach(el => {
      const i = Number(el.dataset.onda), t1 = 0.5 + i * P + 0.7 * P
      anims.push(el.animate([{ offset: 0, opacity: 0, transform: 'scale(1)' }, { offset: T(t1), opacity: 0, transform: 'scale(1)' },
        { offset: T(t1 + 0.02), opacity: 0.75, transform: 'scale(1)' }, { offset: T(t1 + 0.85), opacity: 0, transform: 'scale(2.8)' }, { offset: 1, opacity: 0, transform: 'scale(2.8)' }], op))
    })
    return () => anims.forEach(a => a.cancel())
  }, [vivo, desde, clave, n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pasos.length && !semanas.length && !final) return <Hueco>garantía sin «pasos», «cada» ni «final»</Hueco>
  const en = (d: number) => ({ '--d': d, '--n': n }) as CSSProperties
  const hecho = <><i className={o.gLinea} data-llena />
    {semanas.filter(d => !pasos.some(p => p.dia === d)).map(d => <span key={d} className={o.nodo} data-tipo="lleno" style={en(d)} />)}</>
  return <section className={o.garantia}>
    <CabSeccion ceja={r.ceja} glosa={r.glosa} tono="morado" />
    <div className={o.g90} data-manual={manual != null ? '' : undefined}>
      <div ref={marco} className={o.marco} data-tocable={vivo ? '' : undefined}
        onPointerMove={vivo ? recorrer : undefined} onPointerLeave={vivo ? () => setManual(null) : undefined}>
        {pasos.length > 0 && <div className={o.gEtiquetas} style={{ '--filas': pasos.length } as CSSProperties}>
          {pasos.map((p, k) => <div key={p.dia} style={{ ...en(p.dia), '--fila': k, '--resto': pasos.length - k } as CSSProperties}>
            <span className={o.gGuia} />
            <span className={o.gEtq}>{esTexto(p.rotulo) && <b>{p.rotulo}</b>}{esTexto(p.rotulo) && esTexto(p.texto) && ' · '}{texto(p.texto)}</span>
          </div>)}
        </div>}
        <div className={o.gVia}>
          <i className={o.gLinea} />
          <span className={o.nodo} data-tipo="cero" style={en(0)} />
          {semanas.filter(d => !pasos.some(p => p.dia === d)).map(d => <span key={d} className={o.nodo} data-tipo="semana" style={en(d)} />)}
          <div data-hecho data-capa-viva className={o.gHecho}>{hecho}</div>
          {manual != null && <div className={o.gHecho} style={{ opacity: 1, clipPath: `inset(0 ${(100 - (manual / n) * 100).toFixed(2)}% 0 0)` }}>{hecho}</div>}
          {pasos.map(p => <span key={p.dia} className={o.nodo} data-tipo="hito" style={en(p.dia)} />)}
          <span className={o.nodo} data-tipo="meta" style={en(n)} />
          {vivo && paradas.map((d, i) => <span key={d} data-onda={i} data-capa-viva className={o.gOnda} data-meta={d === n ? '' : undefined} style={en(d)} />)}
          {vivo && <div data-andante data-capa-viva className={o.andante}><i /></div>}
          {manual != null && <div className={o.andante} style={{ opacity: 1, transform: `translateX(${((manual / n) * 100).toFixed(2)}%)` }}>
            <i /><span className={o.lectura}>{manual >= n ? `día ${n}` : `semana ${Math.floor(manual / 7) + 1}`}</span>
          </div>}
        </div>
        <div className={o.gAbajo}>
          <span className={o.tick}>día 0</span>
          {cada && semanas.length > 1 && <>
            <span className={o.llave} style={{ '--a': semanas[0], '--b': semanas[semanas.length - 1], '--n': n } as CSSProperties} />
            {esTexto(cada.texto) && <span className={o.llaveTexto} style={{ '--a': semanas[0], '--b': semanas[semanas.length - 1], '--n': n } as CSSProperties}>{cada.texto}</span>}
          </>}
        </div>
      </div>
      {final && <div className={o.devuelvo}>
        <i data-luz-final data-capa-viva className={o.devuelvoLuz} aria-hidden />
        {manual === n && <i className={o.devuelvoLuz} style={{ opacity: 1 }} aria-hidden />}
        {esTexto(final.ceja) && <Ceja tono="oro" style={{ fontSize: 11.5 }}>{final.ceja}</Ceja>}
        {esTexto(final.texto) && <p className={s.firma} style={{ fontSize: 22, marginTop: 7 }}>{final.texto}</p>}
      </div>}
    </div>
  </section>
}

// ── piezas ───────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Pieza { n?: number | string; nombre: string; sello?: unknown; glosa?: string; partes?: unknown; bloque?: unknown }
const esPieza = (x: unknown): x is Pieza => esObj(x) && esTexto(x.nombre)
type Parte = { clase: 'texto' | 'cita' | 'nota'; t: string; rotulo?: string }
const leerParte = (x: unknown): Parte | null => {
  if (esTexto(x)) return { clase: x.startsWith('«') ? 'cita' : 'texto', t: x }
  if (!esObj(x)) return null
  const rotulo = esTexto(x.rotulo) ? x.rotulo : undefined
  if (esTexto(x.cita)) return { clase: 'cita', t: x.cita, rotulo }
  if (esTexto(x.nota)) return { clase: 'nota', t: x.nota, rotulo }
  if (esTexto(x.texto)) return { clase: 'texto', t: x.texto, rotulo }
  return null
}

function UnaPieza({ p, i, tono, desde, ctx }: { p: Pieza; i: number; tono: Tono; desde: number | null; ctx: PropsBloque['ctx'] }) {
  const n = p.n ?? i + 1
  const partes = (Array.isArray(p.partes) ? p.partes : []).map(leerParte).filter((x): x is Parte => !!x)
  const inc = esObj(p.bloque) && esTexto(p.bloque.tipo) ? (p.bloque as { tipo: string; [k: string]: unknown }) : null
  const C = inc ? INCRUSTABLES()[inc.tipo] : null
  const orden = typeof n === 'number' ? n - 1 : i
  return <article className={o.pieza} style={{ '--retraso': seg((desde ?? 0) + orden * 0.24) } as CSSProperties}>
    <span className={o.num}>{n}</span>
    <div className={o.cab}>
      <span className={o.nom}>{p.nombre}</span>
      <SelloDe v={p.sello} tono={tonoSello(tono)} />
      {esTexto(p.glosa) && <span className={o.cabGlosa}>{p.glosa}</span>}
    </div>
    {partes.map((x, k) => <div key={k} className={o.parte} data-clase={x.clase}>
      {x.rotulo && x.clase !== 'nota' && <span className={o.rotP}>{x.rotulo}</span>}
      {x.clase === 'cita' ? <p className={o.pCita}>{x.t}</p>
        : x.clase === 'nota' ? <p className={o.pNota}>{x.rotulo && <span className={o.rotP}>{x.rotulo}</span>}<Rico t={x.t} /></p>
        : <p className={o.pTexto}><Rico t={x.t} /></p>}
    </div>)}
    {inc && (C ? <div className={o.incrustado}><C b={{ ...inc, peso: 1 }} ctx={ctx} /></div> : <Hueco>El bloque «{inc.tipo}» no existe en esta versión de Arbrain.</Hueco>)}
  </article>
}

function Piezas({ b: r, ctx }: PropsBloque) {
  const items = lista(r.items, esPieza)
  if (!items.length) return <Hueco>piezas-oferta sin «items»</Hueco>
  const tono = tonoDe(r.tono, 'morado')
  const desde = vidaDe(r.vida, 22.4)
  const nCols = r.columnas === 2 && items.length > 1 ? 2 : 1
  const corte = nCols === 2 ? Math.min(items.length - 1, Math.max(1, Math.round(numero(r.corte, Math.ceil(items.length / 2))))) : items.length
  const cols = nCols === 2 ? [items.slice(0, corte), items.slice(corte)] : [items]
  const anchos = Array.isArray(r.anchos) ? r.anchos.filter((x): x is number => typeof x === 'number' && x > 0) : []
  const plantilla = cols.map((_, k) => `minmax(0, ${anchos[k] ?? 1}fr)`).join(' ')
  return <section className={o.piezas} data-vivo={ctx.modo === 'cerca' && desde != null ? '' : undefined}>
    <CabSeccion ceja={r.ceja} glosa={r.glosa} tono={tono} />
    <div className={o.cols} style={{ gridTemplateColumns: plantilla }}>
      {cols.map((col, k) => <div key={k} className={o.col}>
        {col.map((p, j) => <UnaPieza key={j} p={p} i={(k ? corte : 0) + j} tono={tono} desde={desde} ctx={ctx} />)}
      </div>)}
    </div>
  </section>
}

// ── dominó ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function Domino({ b: r, ctx }: PropsBloque) {
  const lineas = Array.isArray(r.frase) ? r.frase.filter(esTexto) : esTexto(r.frase) ? [r.frase] : []
  if (!lineas.length) return <Hueco>dominó sin «frase»</Hueco>
  const pitch = esObj(r.pitch) && esTexto(r.pitch.texto) ? r.pitch : null
  const desde = vidaDe(r.vida, 25)
  const conNum = r.n != null && (typeof r.n === 'number' || esTexto(r.n))
  return <section className={o.domino} data-num={conNum ? '' : undefined} data-vivo={ctx.modo === 'cerca' && desde != null ? '' : undefined}
    style={{ '--retraso': seg(desde ?? 0) } as CSSProperties}>
    <i className={o.halo} aria-hidden /><i className={o.haloVivo} aria-hidden />
    {conNum && <span className={o.num} data-tono="oro">{String(r.n)}</span>}
    {(esTexto(r.nombre) || r.sello != null || esTexto(r.ceja)) && <div className={o.cab}>
      {esTexto(r.ceja) && <Ceja tono="oro">{r.ceja}</Ceja>}
      {esTexto(r.nombre) && <span className={o.nom}>{r.nombre}</span>}
      <SelloDe v={r.sello} tono="oro" />
    </div>}
    <blockquote className={o.frase} style={{ fontSize: numero(r.tam, 50) }}>
      {lineas.map((l, k) => <span key={k} className={o.linea} data-ultima={k === lineas.length - 1 && lineas.length > 1 ? '' : undefined}>{l}</span>)}
    </blockquote>
    {(pitch || Array.isArray(r.botones)) && <div className={o.cierre}>
      {pitch && <div className={o.pitch}>
        <div className={o.filaCab}><Ceja style={{ fontSize: 12 }}>{texto(pitch.ceja, 'El pitch')}</Ceja><SelloDe v={pitch.sello} tono="oro" /></div>
        <p><Rico t={pitch.texto as string} /></p>
      </div>}
      <Botones v={r.botones} ctx={ctx} style={{ marginLeft: 'auto', flexWrap: 'nowrap' }} />
    </div>}
  </section>
}

export const BLOQUES_OFERTA: Record<string, ComponenteBloque> = {
  'leyenda-estados': LeyendaEstados, 'escalera-valor': Escalera, 'piezas-oferta': Piezas, bonos: Bonos, garantia: Garantia, domino: Domino,
}
/** Lo que una pieza puede llevar dentro (se resuelve al pintar: así no hay ciclo de módulos). */
const INCRUSTABLES = (): Record<string, ComponenteBloque> => ({ ...BLOQUES_BASE, ...BLOQUES_OFERTA })
