'use client'
/**
 * Estrategia › Competidores (15 nov 2026). Daniel: «quiero algo dedicado a esto, tipo una lista, pero ademas miembros en su
 * comunidad, "oferta" que puedas inferir, mensaje, etc… faltan "las nuevas promesas"».
 *
 * Arriba, el campo de juego: un punto por competidor en tres carriles (establecidos, nuevas promesas, anglo) sobre la
 * escala de tamaño (logarítmica) o de velocidad (% de crecimiento en 30 días). Se ve de un golpe quién es grande y quién
 * corre. Debajo, la lista densa: cada fila con su cara, quién es en una línea y su número; en ancho, también su comunidad,
 * su entrada de pago y su cadencia. Tocar una fila (o su punto) abre la ficha: descripción, mensaje textual, comunidad,
 * oferta inferida peldaño por peldaño, mecanismo, sofisticación, cadencia, velocidad, qué hace mejor que tú y sus fuentes.
 *
 * Al cambiar de orden o de filtro las filas se deslizan a su nuevo lugar (FLIP); nada nace en opacidad 0. Lo que el
 * archivo no trae dice «sin dato»; lo inferido lleva su marca. Datos: features/negocio/competidores.ts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { tr, trMarca, trn } from '@/shared/i18n'
import { dominio, fechaHumana, iniciales, type Competidores as CompetidoresT, type FichaCompetidor, type Mercado } from './estrategia'
import {
  canalPrincipal, compacto, conDato, cuentas, entradaDe, filtrar, FILTROS, listaDe, NOMBRE_GRUPO, ordenar, ORDENES, tamanoDe, velocidadDe,
  type Filtro, type Orden,
} from './competidores'
import c from './competidores.module.css'

const ETIQUETA: Record<Filtro, string> = { todos: trMarca('Todos'), establecido: trMarca('Establecidos'), promesa: trMarca('Nuevas promesas'), anglo: trMarca('Anglo') }
const ORDEN: Record<Orden, string> = { tamano: trMarca('Tamaño'), velocidad: trMarca('Velocidad') }
const CARRILES = ['establecido', 'promesa', 'anglo'] as const

const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.abs(n) >= 10 ? Math.round(n) : n.toFixed(1)}%`

export function Competidores({ m, ref_ }: { m: Mercado; ref_: string | null }) {
  const datos = useMemo(() => listaDe(m), [m])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<Orden>('tamano')
  const [abierta, setAbierta] = useState<string | null>(null)
  const lista = useRef<HTMLOListElement>(null)
  const xs = useMemo(() => (datos ? ordenar(filtrar(datos.lista, filtro), orden) : []), [datos, filtro, orden])
  const n = useMemo(() => (datos ? cuentas(datos.lista) : null), [datos])
  const maxTam = useMemo(() => Math.max(1, ...xs.map(f => tamanoDe(f) ?? 0)), [xs])
  useFlip(lista, [filtro, orden, abierta])

  if (!datos || !n) return <p className={c.vacio}>{tr('Tu investigación no trae competidores todavía.')}</p>
  const primerSinDato = xs.findIndex(f => !conDato(f, orden))
  const elegir = (id: string, bajar = false) => {
    setAbierta(a => (a === id && !bajar ? null : id))
    if (bajar) requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
  }

  return <section className={c.raiz} data-testid="competidores" aria-label={tr('Competidores')}>
    <header className={c.cabeza}>
      <p className={c.conteo}>
        <b>{n.todos}</b>
        <span>{[
          n.establecido && trn(n.establecido, '{n} establecido', '{n} establecidos'),
          n.promesa && trn(n.promesa, '{n} nueva promesa', '{n} nuevas promesas'),
          n.anglo && trn(n.anglo, '{n} en inglés', '{n} en inglés'),
        ].filter(Boolean).join(' · ')}</span>
      </p>
      <p className={c.corte}>{tr('Corte {fecha}', { fecha: fechaHumana(datos.fecha, ref_) })}</p>
    </header>

    <Campo xs={xs} orden={orden} filtro={filtro} abierta={abierta} tu={datos.tu} elegir={id => elegir(id, true)} />

    <div className={c.controles}>
      <div className={c.filtros} role="tablist" aria-label={tr('Filtrar competidores')}>
        {FILTROS.filter(f => f === 'todos' || n[f] > 0).map(f => <button key={f} type="button" role="tab" aria-selected={filtro === f} data-grupo={f} onClick={() => setFiltro(f)}>
          {f !== 'todos' && <i aria-hidden />}{tr(ETIQUETA[f])}<small>{n[f]}</small>
        </button>)}
      </div>
      <div className={c.orden} role="radiogroup" aria-label={tr('Ordenar por')}>
        {ORDENES.map(o => <button key={o} type="button" role="radio" aria-checked={orden === o} onClick={() => setOrden(o)}>{tr(ORDEN[o])}</button>)}
      </div>
    </div>

    <div className={c.encabezados} aria-hidden>
      <span /><span>{tr('Quién')}</span><span>{tr('Comunidad')}</span><span>{tr('Entrada')}</span><span>{tr('Cadencia')}</span>
      <span>{orden === 'tamano' ? tr('Audiencia') : tr('30 días')}</span><span />
    </div>
    <ol ref={lista} className={c.lista}>
      {xs.map((f, i) => <li key={f.id} data-id={f.id} data-abierta={abierta === f.id || undefined} data-grupo={f.grupo} style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }}>
        {i === primerSinDato && i > 0 && <p className={c.separador}>{orden === 'tamano' ? tr('Sin dato de audiencia') : tr('Sin % de crecimiento medido · por tamaño')}</p>}
        <Fila f={f} i={i} orden={orden} maxTam={maxTam} todos={filtro === 'todos'} abierta={abierta === f.id} tocar={() => elegir(f.id)} />
        {abierta === f.id && <Ficha f={f} ref_={ref_} />}
      </li>)}
    </ol>

    <footer className={c.pie}>
      {datos.desde === 'contra' && <p>{tr('Armada desde «Contra quién»: sin mensaje, mecanismo ni cadencia hasta que llegue el censo.')}</p>}
      {datos.metodo && <p>{datos.metodo}</p>}
      <p>{datos.fuente} · {fechaHumana(datos.fecha, ref_)}</p>
      {datos.limites.length > 0 && <details>
        <summary>{tr('Límites del censo')} <small>{datos.limites.length}</small></summary>
        <ul>{datos.limites.map(x => <li key={x}>{x}</li>)}</ul>
      </details>}
    </footer>
  </section>
}

/**
 * Las filas se deslizan a su lugar nuevo (FLIP): antes de pintar se mide dónde estaba cada una y se anima desde ahí.
 * Mide contra la lista (offsetTop), no contra la ventana: un scroll entre dos cuadros no la mueve.
 */
function useFlip(lista: React.RefObject<HTMLOListElement | null>, deps: unknown[]) {
  const antes = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const el = lista.current
    if (!el) return
    const quieto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const ahora = new Map<string, number>()
    el.querySelectorAll<HTMLElement>(':scope > li').forEach(li => {
      const id = li.dataset.id!, y = li.offsetTop
      ahora.set(id, y)
      const prev = antes.current.get(id)
      if (!quieto && prev !== undefined && Math.abs(prev - y) > 1) li.animate?.([{ transform: `translateY(${prev - y}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    })
    antes.current = ahora
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * El campo: un carril por grupo y un punto por competidor. En «Tamaño» el eje es logarítmico (1K, 10K, 100K, 1M: un
 * canal de 5K y uno de 1M caben en la misma línea); en «Velocidad», % de crecimiento en 30 días. Quien no tiene el dato no
 * se pinta en el campo (sí en la lista, al final).
 */
function Campo({ xs, orden, filtro, abierta, tu, elegir }: { xs: FichaCompetidor[]; orden: Orden; filtro: Filtro; abierta: string | null; tu: CompetidoresT['tu']; elegir: (id: string) => void }) {
  // El dibujo mide lo que mide su caja (las letras quedan de 10–11 px en el panel y en pantalla completa, no escaladas).
  const caja = useRef<HTMLElement>(null)
  const [W, setW] = useState(480)
  useEffect(() => {
    const el = caja.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const IZQ = 92, DER = 18, ALTO = 30
  const carriles = CARRILES.filter(g => (filtro === 'todos' || filtro === g) && xs.some(f => f.grupo === g))
  const puntos = xs.map(f => ({ f, v: orden === 'tamano' ? tamanoDe(f) : velocidadDe(f).pct })).filter((p): p is { f: FichaCompetidor; v: number } => p.v !== null && (orden === 'velocidad' || p.v > 0))
  if (!puntos.length || !carriles.length) return <p className={c.campoVacio} ref={caja as React.RefObject<HTMLParagraphElement>}>{orden === 'velocidad' ? tr('Nadie en esta vista trae su velocidad medida.') : tr('Nadie en esta vista trae su audiencia.')}</p>

  // Tamaño: log10. Velocidad: logarítmica simétrica (un canal que pasó de 60 a 2,600 suscriptores marca +3150 % y no debe
  // aplastar a los que crecen 5 a 100 %): 0 %, 10 %, 100 %, 1000 % quedan a la misma distancia.
  const sl = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v))
  const t = (v: number) => (orden === 'tamano' ? Math.log10(v) : sl(v))
  // Tu canal, medido con la misma regla (solo en tamaño: tu velocidad no está en el censo), entra en la escala.
  const tuV = orden === 'tamano' && tu?.seguidores ? tu.seguidores : null
  const vs = [...puntos.map(p => t(p.v)), ...(tuV ? [t(tuV)] : [])]
  const TOP = tuV ? 24 : 14
  const a = orden === 'tamano' ? Math.floor(Math.min(...vs)) : Math.min(0, Math.floor(Math.min(...vs)))
  const b = Math.max(a + 1, Math.ceil(Math.max(...vs)))
  const escala = (v: number) => IZQ + ((t(v) - a) / (b - a)) * (W - IZQ - DER)
  const marcas = orden === 'tamano'
    ? Array.from({ length: b - a + 1 }, (_, k) => ({ x: escala(10 ** (a + k)), t: compacto(10 ** (a + k)) }))
    : Array.from({ length: b - a + 1 }, (_, k) => a + k).map(e => { const v = e === 0 ? 0 : Math.sign(e) * (10 ** Math.abs(e) - 1); return { x: escala(v), t: `${e < 0 ? '−' : ''}${e === 0 ? 0 : compacto(10 ** Math.abs(e))}%` } })
  const H = carriles.length * ALTO + 12 + TOP

  // Enjambre: cada punto busca el hueco libre más cercano a su línea (0, ±6, ±12 px); si todo su carril está lleno ahí,
  // se queda encima del menos tapado. Nunca sale de su carril.
  const OFF = [0, -6, 6, -12, 12]
  const ocupados = new Map<string, { x: number; y: number }[]>()
  const colocados = [...puntos].sort((p, q) => t(p.v) - t(q.v)).map(p => {
    const fila = carriles.indexOf(p.f.grupo as (typeof CARRILES)[number])
    const x = escala(p.v), y0 = TOP + fila * ALTO + ALTO / 2
    const ya = ocupados.get(p.f.grupo) ?? []
    const choque = (y: number) => ya.filter(q => Math.hypot(q.x - x, q.y - y) < 9.5).length
    const off = OFF.find(o => choque(y0 + o) === 0) ?? OFF.reduce((m, o) => (choque(y0 + o) < choque(y0 + m) ? o : m), 0)
    const pos = { x, y: y0 + off }
    ya.push(pos); ocupados.set(p.f.grupo, ya)
    return { ...p, ...pos }
  })
  const sel = colocados.find(p => p.f.id === abierta)

  return <figure className={c.campo} ref={caja}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={orden === 'tamano'
      ? tr('{n} competidores por tamaño de audiencia, en escala logarítmica', { n: puntos.length })
      : tr('{n} competidores por crecimiento en 30 días', { n: puntos.length })}>
      {marcas.map(mk => <g key={mk.t}>
        <line className={c.reja} x1={mk.x} x2={mk.x} y1={TOP - 4} y2={H - 16} />
        <text className={c.marca} x={mk.x} y={H - 3} textAnchor="middle">{mk.t}</text>
      </g>)}
      {orden === 'velocidad' && <line className={c.cero} x1={escala(0)} x2={escala(0)} y1={TOP - 4} y2={H - 16} />}
      {carriles.map((g, i) => <g key={g} data-grupo={g}>
        <line className={c.carril} x1={IZQ - 6} x2={W - DER} y1={TOP + i * ALTO + ALTO / 2} y2={TOP + i * ALTO + ALTO / 2} />
        <text className={c.carrilNombre} x={0} y={TOP + i * ALTO + ALTO / 2 + 4}>{tr(ETIQUETA[g])}</text>
      </g>)}
      {tuV && <g className={c.tu}>
        <line x1={escala(tuV)} x2={escala(tuV)} y1={TOP - 8} y2={H - 16} />
        <text x={escala(tuV)} y={TOP - 12} textAnchor="middle">{tr('Tú · {n}', { n: compacto(tuV) })}</text>
      </g>}
      {colocados.map((p, i) => <g key={p.f.id} className={c.punto} data-grupo={p.f.grupo} data-sel={p.f.id === abierta || undefined}
        style={{ animationDelay: `${Math.min(i, 40) * 14}ms`, transformOrigin: `${p.x}px ${p.y}px` }}
        role="button" tabIndex={0} aria-label={`${p.f.nombre}: ${orden === 'tamano' ? compacto(p.v) : pct(p.v)}`}
        onClick={() => elegir(p.f.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(p.f.id) } }}>
        <title>{`${p.f.nombre} · ${orden === 'tamano' ? compacto(p.v) : pct(p.v)}`}</title>
        <circle className={c.toque} cx={p.x} cy={p.y} r={9} />
        <circle cx={p.x} cy={p.y} r={p.f.id === abierta ? 6.5 : 4.6} />
      </g>)}
      {sel && <text className={c.selNombre} x={Math.min(Math.max(sel.x, IZQ + 40), W - 60)} y={sel.y - 10} textAnchor="middle">{sel.f.nombre}</text>}
    </svg>
    <figcaption>{orden === 'tamano' ? (tuV ? tr('Audiencia mayor de cada uno (canal o comunidad), escala logarítmica; en oro, tu canal. Toca un punto.') : tr('Audiencia mayor de cada uno (canal o comunidad), escala logarítmica. Toca un punto.')) : tr('Crecimiento de seguidores en ~30 días, escala logarítmica. Toca un punto.')}</figcaption>
  </figure>
}

function Cara({ f }: { f: FichaCompetidor }) {
  const [fallo, setFallo] = useState(false)
  return <span className={c.cara} data-grupo={f.grupo} aria-hidden>
    {f.imagen && !fallo ? <img src={f.imagen.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} /> : <span>{iniciales(f.nombre)}</span>}
  </span>
}

function Fila({ f, i, orden, maxTam, todos, abierta, tocar }: { f: FichaCompetidor; i: number; orden: Orden; maxTam: number; todos: boolean; abierta: boolean; tocar: () => void }) {
  const tam = tamanoDe(f), vel = velocidadDe(f), entrada = entradaDe(f)
  // El medidor de tamaño es logarítmico, como el campo: 1K llena poco y 1M casi todo, sin que el chico desaparezca.
  const medida = tam ? Math.max(0.06, Math.log10(Math.max(tam, 10)) / Math.log10(Math.max(maxTam, 100))) : 0
  const principal = orden === 'tamano'
    ? <><b>{tam !== null ? compacto(tam) : '—'}</b><small>{tam !== null ? tr('audiencia') : tr('sin dato')}</small></>
    : vel.pct !== null ? <><b data-sube={vel.pct > 0 || undefined}>{pct(vel.pct)}</b><small>{tr('en 30 días')}</small></>
      : vel.semana !== null ? <><b>+{compacto(vel.semana)}</b><small>{tr('en 7 días')}</small></>
        : <><b>—</b><small>{tr('sin dato')}</small></>
  return <button type="button" className={c.fila} aria-expanded={abierta} onClick={tocar}>
    <span className={c.n}>{String(i + 1).padStart(2, '0')}</span>
    <Cara f={f} />
    <span className={c.quien}>
      <span className={c.nombre}><b>{f.nombre}</b>{f.marca && <small>{f.marca}</small>}{todos && f.grupo === 'promesa' && <em className={c.chispa}>{tr('nueva')}</em>}</span>
      <span className={c.desc}>{f.descripcion ?? tr('Sin descripción en el censo.')}</span>
    </span>
    <span className={c.col}>{f.comunidad ? <><b>{f.comunidad.miembros !== null ? compacto(f.comunidad.miembros) : f.comunidad.valor}</b><small>{f.comunidad.plataforma}{f.comunidad.acceso ? ` · ${tr(f.comunidad.acceso)}` : ''}</small></> : <small>{tr('sin comunidad')}</small>}</span>
    <span className={c.col}>{entrada ? <><b>{entrada.oculto ? tr('oculto') : entrada.precio}</b><small>{tr('entrada de pago')}</small></> : <small>{tr('sin dato')}</small>}</span>
    <span className={c.col}>{f.cadencia?.videos_semana != null ? <><b>{Number(f.cadencia.videos_semana.toFixed(1))}</b><small>{tr('videos/sem')}</small></> : <small>{tr('sin dato')}</small>}</span>
    <span className={c.metrica}>
      {principal}
      {orden === 'tamano' && tam !== null && <i className={c.medidor} aria-hidden><i style={{ transform: `scaleX(${medida})` }} /></i>}
    </span>
    <ChevronDown className={c.flecha} size={15} aria-hidden />
  </button>
}

function Inferido({ si }: { si: boolean }) {
  return si ? <em className={c.inferido}>{tr('inferido')}</em> : null
}

function Dato({ t, children, ancho }: { t: string; children: ReactNode; ancho?: boolean }) {
  return <div className={c.dato} data-ancho={ancho || undefined}><dt>{t}</dt><dd>{children}</dd></div>
}

const sinDato = () => <span className={c.sinDato}>{tr('sin dato')}</span>

function Ficha({ f, ref_ }: { f: FichaCompetidor; ref_: string | null }) {
  const p = canalPrincipal(f)
  return <div className={c.ficha} data-testid="competidor-abierto">
    <p className={c.fichaDesc}>
      <span className={c.grupo} data-grupo={f.grupo}>{tr(NOMBRE_GRUPO[f.grupo])}</span>
      {f.pais && <span className={c.pais}>{f.pais}</span>}
      {f.descripcion ?? tr('Sin descripción en el censo.')}
    </p>

    {f.mensaje ? <blockquote className={c.mensaje}>
      <p>«{f.mensaje.texto.replace(/^«|»$/g, '')}»</p>
      <footer>{f.mensaje.url ? <a href={f.mensaje.url} target="_blank" rel="noreferrer">{f.mensaje.donde ?? dominio(f.mensaje.url)}<ArrowUpRight size={11} aria-hidden /></a> : f.mensaje.donde}{f.mensaje.fecha ? ` · ${fechaHumana(f.mensaje.fecha, ref_)}` : ''}</footer>
    </blockquote> : <p className={c.mensajeFalta}>{tr('Mensaje: sin dato')}</p>}

    <dl className={c.datos}>
      <Dato t={tr('Comunidad')}>{f.comunidad ? <>
        <b>{f.comunidad.valor}</b> · {f.comunidad.plataforma}{f.comunidad.acceso ? ` (${tr(f.comunidad.acceso)})` : ''}
        <small>{f.comunidad.fuente} · {fechaHumana(f.comunidad.fecha, ref_)}</small>
      </> : sinDato()}</Dato>
      <Dato t={tr('Audiencia')}>{f.canales.length ? <ul className={c.canales}>{f.canales.map(x => <li key={`${x.tipo}-${x.valor}`}>
        <span>{x.tipo}</span>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.valor}</a> : <b>{x.valor}</b>}
        {x === p && f.canales.length > 1 && <em className={c.principal}>{tr('principal')}</em>}
        <small>{x.fuente} · {fechaHumana(x.fecha, ref_)}</small>
      </li>)}</ul> : sinDato()}</Dato>
      <Dato t={tr('Mecanismo')}>{f.mecanismo ? <>{f.mecanismo.texto}<Inferido si={f.mecanismo.inferido} /></> : sinDato()}</Dato>
      <Dato t={tr('Sofisticación')}>{f.sofisticacion ? <>
        <span className={c.nivel} aria-label={tr('Nivel {n} de 5', { n: f.sofisticacion.nivel })}>{[1, 2, 3, 4, 5].map(k => <i key={k} data-lleno={k <= f.sofisticacion!.nivel || undefined} />)}<b>{f.sofisticacion.nivel}/5</b></span>
        {f.sofisticacion.por_que}<Inferido si={f.sofisticacion.inferido} />
      </> : sinDato()}</Dato>
      <Dato t={tr('Cadencia')}>{f.cadencia ? <>{f.cadencia.valor}<small>{f.cadencia.fuente} · {fechaHumana(f.cadencia.fecha, ref_)}</small></> : sinDato()}</Dato>
      <Dato t={tr('Velocidad')}>{f.velocidad ? <>{f.velocidad.valor}<Inferido si={f.velocidad.inferido} /><small>{f.velocidad.fuente} · {fechaHumana(f.velocidad.fecha, ref_)}</small></> : sinDato()}</Dato>
      {f.por_que_crece && <Dato t={tr('Por qué crece')} ancho>{f.por_que_crece}</Dato>}
      {f.mejor_que_tu && <Dato t={tr('Lo hace mejor que tú')} ancho>{f.mejor_que_tu}</Dato>}
      {f.cambios && <Dato t={tr('Desde el censo anterior')} ancho>{f.cambios}</Dato>}
    </dl>

    <section className={c.oferta} aria-label={tr('Oferta inferida')}>
      <h5>{tr('Oferta inferida')}<small>{tr('de gratis a lo más caro')}</small></h5>
      {f.oferta.length ? <ol>{f.oferta.map(o => <li key={`${o.nombre}-${o.precio}`} data-gratis={o.forma === 'gratis' || /^(0|gratis)\b/i.test(o.precio) || undefined}>
        <b className={c.precio}>{o.oculto ? tr('oculto') : o.precio}</b>
        <span>{o.url ? <a href={o.url} target="_blank" rel="noreferrer">{o.nombre}</a> : o.nombre}{o.promesa && <small>{o.promesa}</small>}</span>
        <Inferido si={o.inferido} />
      </li>)}</ol> : sinDato()}
    </section>

    {f.fuentes.length > 0 && <p className={c.fuentes}>{tr('Fuentes')}: {f.fuentes.map(x => <a key={x.url} href={x.url} target="_blank" rel="noreferrer">
      {x.que ?? dominio(x.url)}{x.fecha ? ` · ${fechaHumana(x.fecha, ref_)}` : ''}<ArrowUpRight size={10} aria-hidden />
    </a>)}</p>}
  </div>
}
