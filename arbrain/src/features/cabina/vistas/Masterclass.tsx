'use client'
/**
 * Masterclass (7 oct 2026). Daniel: «dame el diseño, los colores y esto similar a como lo hemos bajado a tierra acá»
 * (la vista Salud). Fuente única: docs/business-os/lanzamiento-ht-15-oct/masterclass/masterclass-17-oct.json en el
 * repo del Studio, leída por el agent-server (`POST /cabina {que:'masterclass'}`) y releída cada 4 s: cuando Levy
 * edita el archivo, la vista se repinta sola.
 *
 * En 3 segundos: cuánto falta para el sábado 17 a las 12:00 y cuántos de los 10 bloques están listos; en grande, el
 * gran dominó; la línea de las 2 horas con cada bloque a escala y el color de su parte de Brunson. Debajo, cada bloque
 * con su minuto, qué, estado y lo que falta (al tocarlo se despliega su contenido), y a un lado la epifanía, la promesa
 * firmada y las decisiones abiertas. Sin anillos ni puntajes: solo lo que el archivo dice.
 * Movimiento: el lenguaje común. Entra escalonado, las cifras cuentan una vez, la línea se llena, lo listo y lo
 * firmado se palomean; solo late el ahora cuando la masterclass está en vivo. Un solo componente: pestaña del «+»,
 * sección /masterclass y `mostrar {vista:"masterclass"}` en el chat. Modelo puro: features/masterclass/modelo.ts.
 */
import { useMemo, useRef, useState } from 'react'
import { ChevronDown, MessageCircle, RefreshCw } from 'lucide-react'
import { mov, escalon, Cifra, Palomita } from '@/shared/movimiento'
import { useFuente, releer } from '../datos'
import { useAhora } from '../useAhora'
import { hace } from '@/features/salud/modelo'
import {
  avance, diaDe, horaDe, minutosPorParte, momento, normalizar, parteDe, URL_MASTERCLASS,
  type Bloque, type EstadoBloque, type EstadoPieza, type LecturaMasterclass, type Masterclass, type Momento,
} from '@/features/masterclass/modelo'
import l from '../luz.module.css'
import c from './masterclass.module.css'

export { URL_MASTERCLASS }
const RELECTURA_MS = 4000
const entero = (n: number) => String(Math.round(n))
const NOMBRE_ESTADO: Record<EstadoBloque | EstadoPieza, string> = { vacio: 'Vacío', borrador: 'Borrador', listo: 'Listo', 'por-firmar': 'Por firmar', firmado: 'Firmado' }

function Tarjeta({ ceja, extra, i, children, className }: { ceja: React.ReactNode; extra?: React.ReactNode; i: number; children: React.ReactNode; className?: string }) {
  return <section className={`${c.tarjeta} ${mov.entra}${className ? ` ${className}` : ''}`} style={escalon(i)}>
    <header className={c.ceja}><span>{ceja}</span>{extra}</header>
    {children}
  </section>
}

function Cargando() { return <div className={c.cargando} aria-label="Leyendo la masterclass"><span /><span /><span /><span /></div> }

/** El estado de una pieza. Lo terminado (listo, firmado) se palomea al llegar. */
function Estado({ e, prefijo }: { e: EstadoBloque | EstadoPieza; prefijo?: string }) {
  const hecho = e === 'listo' || e === 'firmado'
  return <span className={c.estado} data-estado={e} data-hecha={hecho || undefined}>
    {hecho && <Palomita className={c.palomita} />}{prefijo ? `${prefijo} · ` : ''}{NOMBRE_ESTADO[e]}
  </span>
}

/** Un texto que puede tener párrafos (doble salto) y saltos de línea. */
function Texto({ t, className }: { t: string; className?: string }) {
  return <div className={className}>{t.split(/\n{2,}/).map((p, k) => <p key={k}>{p}</p>)}</div>
}

// ── Cuánto falta y el avance ──
function Cuenta({ t, m }: { t: Momento; m: Masterclass }) {
  if (t.fase === 'sin-fecha') return <p className={c.cuenta}><small>Sin fecha en el archivo</small></p>
  if (t.fase === 'despues') return <p className={c.cuenta}><strong>Terminó</strong><small>{diaDe(m.evento.fecha, { weekday: 'long', day: 'numeric' })}</small></p>
  if (t.fase === 'en-vivo') return <p className={c.cuenta} data-vivo>
    <span className={c.enVivo}><i className={mov.late} aria-hidden />En vivo</span>
    <strong><Cifra valor={Math.floor(t.minuto)} clave="mc-minuto" formato={entero} /><small> de {m.evento.duracionMin} min</small></strong>
    <small>{t.bloque ? `Bloque ${t.bloque.n} · ${t.bloque.titulo}` : 'Entre bloques'}</small>
  </p>
  const unidades: [number, string][] = t.dias ? [[t.dias, 'd'], [t.horas, 'h'], [t.minutos, 'min']] : [[t.horas, 'h'], [t.minutos, 'min']]
  return <p className={c.cuenta} aria-label={`Faltan ${unidades.map(([v, u]) => `${v} ${u}`).join(' ')}`}>
    <small>Faltan</small>
    <strong>{unidades.map(([v, u], k) => <span key={u}>{k === 0 ? <Cifra valor={v} clave={`mc-falta-${u}`} formato={entero} /> : v}<small>{u}</small></span>)}</strong>
    <small>para el {diaDe(m.evento.fecha, { weekday: 'long', day: 'numeric' })} a las {horaDe(m.evento.fecha, 0)}</small>
  </p>
}

function Heroe({ m, t }: { m: Masterclass; t: Momento }) {
  const a = avance(m.bloques)
  return <header className={c.heroe}>
    <div className={`${c.heroeTop} ${mov.entra}`} style={escalon(0)}>
      <p className={l.ceja}>Masterclass · <b>{diaDe(m.evento.fecha, { weekday: 'short', day: 'numeric', month: 'short' })?.replace(/\./g, '') ?? 'sin fecha'}</b> · {horaDe(m.evento.fecha, 0)}{m.evento.lugar ? ` · ${m.evento.lugar}` : ''}</p>
    </div>
    <div className={c.heroeCuerpo}>
      <h3 className={`${c.titulo} ${l.serif} ${mov.entra}`} style={escalon(1)}>{m.evento.titulo}</h3>
      <div className={`${mov.entra}`} style={escalon(2)}><Cuenta t={t} m={m} /></div>
    </div>
    <div className={`${c.avance} ${mov.entra}`} style={escalon(3)}>
      <p className={c.avanceCifra}><b><Cifra valor={a.listo} clave="mc-listos" formato={entero} /></b><span>de {a.total} bloques listos</span></p>
      <div className={c.tiras} role="img" aria-label={`${a.listo} listos, ${a.borrador} en borrador, ${a.vacio} vacíos`}>
        {m.bloques.map((b, k) => <span key={b.n} data-estado={b.estado} className={b.estado === 'listo' ? mov.llena : undefined} style={escalon(4 + k)} />)}
      </div>
      <p className={c.avanceResto}>{[a.borrador && `${a.borrador} en borrador`, a.vacio && `${a.vacio} ${a.vacio === 1 ? 'vacío' : 'vacíos'}`].filter(Boolean).join(' · ') || 'Todo listo'}</p>
    </div>
  </header>
}

// ── El gran dominó ──
function Desplegable({ abierto, children, id }: { abierto: boolean; children: React.ReactNode; id: string }) {
  return <div id={id} className={c.desplegable} data-abierta={abierto || undefined} aria-hidden={!abierto}><div>{children}</div></div>
}

function Domino({ m, i }: { m: Masterclass; i: number }) {
  const [verFirmado, setVerFirmado] = useState(false)
  const d = m.granDomino
  const texto = d.propuesta || d.firmado
  return <Tarjeta i={i} className={c.domino} ceja={<b>El gran dominó</b>} extra={<Estado e={d.estado} prefijo={d.propuesta ? 'Propuesta' : undefined} />}>
    {texto ? <blockquote className={`${c.dominoTexto} ${l.serif}`}>{texto}</blockquote> : <p className={c.vacioTexto}>Sin texto todavía.</p>}
    {d.explica && <p className={c.nota}>{d.explica}</p>}
    {d.propuesta && d.firmado && <>
      <button className={c.plegar} onClick={() => setVerFirmado(v => !v)} aria-expanded={verFirmado} aria-controls="mc-firmado">
        <ChevronDown size={13} aria-hidden data-abierto={verFirmado || undefined} /> El firmado antes
      </button>
      <Desplegable abierto={verFirmado} id="mc-firmado"><blockquote className={`${c.firmado} ${l.serif}`}>{d.firmado}</blockquote></Desplegable>
    </>}
  </Tarjeta>
}

// ── La línea de las 2 horas ──
function Linea({ m, t, i, onIr }: { m: Masterclass; t: Momento; i: number; onIr: (n: number) => void }) {
  const total = m.evento.duracionMin || 120
  const pct = (min: number) => `${(min / total) * 100}%`
  const marcas = Array.from({ length: Math.floor(total / 30) + 1 }, (_, k) => k * 30)
  const ahora = t.fase === 'en-vivo' ? t.minuto : null
  return <Tarjeta i={i} ceja={<>Las {total % 60 ? `${total} min` : `${total / 60} horas`} · <b>{horaDe(m.evento.fecha, 0)} → {horaDe(m.evento.fecha, total)}</b></>}
    extra={<small className={c.ayuda}><i className={c.leyLleno} aria-hidden /> listo · <i className={c.leyBorrador} aria-hidden /> borrador · <i className={c.leyVacio} aria-hidden /> vacío</small>}>
    <div className={c.linea}>
      {m.bloques.map((b, k) => {
        const p = parteDe(m, b.parte), ancho = (b.hasta - b.desde) / total
        return <button key={b.n} className={`${c.tramo} ${mov.llena}`} data-color={p.color} data-estado={b.estado} data-ahora={t.fase === 'en-vivo' && t.bloque?.n === b.n || undefined}
          style={{ ...escalon(i + k), left: pct(b.desde), width: `calc(${pct(b.hasta - b.desde)} - 2px)` }}
          onClick={() => onIr(b.n)} title={`${b.n}. ${b.titulo} · ${horaDe(m.evento.fecha, b.desde)}–${horaDe(m.evento.fecha, b.hasta)} · ${p.nombre} · ${NOMBRE_ESTADO[b.estado]}`}
          aria-label={`Bloque ${b.n}, ${b.titulo}, minuto ${b.desde} a ${b.hasta}, ${NOMBRE_ESTADO[b.estado]}`}>
          {ancho >= 0.045 && <span>{b.n}</span>}
        </button>
      })}
      {ahora != null && <span className={`${c.ahora} ${mov.late}`} style={{ left: pct(ahora) }} aria-hidden />}
    </div>
    <div className={c.marcas} aria-hidden>{marcas.map(x => <span key={x} style={{ left: pct(x) }}>{horaDe(m.evento.fecha, x)}</span>)}</div>
    <ul className={c.partes}>
      {minutosPorParte(m).map(p => <li key={p.id} data-color={p.color}><i aria-hidden />{p.nombre}<small>{p.minutos} min</small></li>)}
    </ul>
  </Tarjeta>
}

// ── Los bloques ──
function TarjetaBloque({ b, m, i, abierto, onAlternar, enVivo, refEl }: { b: Bloque; m: Masterclass; i: number; abierto: boolean; onAlternar: () => void; enVivo: boolean; refEl: (el: HTMLLIElement | null) => void }) {
  const p = parteDe(m, b.parte)
  const id = `mc-bloque-${b.n}`
  return <li ref={refEl} className={`${c.bloque} ${mov.entra}`} style={escalon(i)} data-color={p.color} data-estado={b.estado} data-abierto={abierto || undefined} data-ahora={enVivo || undefined}>
    <button className={c.bloqueBoton} onClick={onAlternar} aria-expanded={abierto} aria-controls={id}>
      <span className={c.bloqueCabeza}>
        <span className={c.minuto}>{String(b.desde).padStart(2, '0')}–{String(b.hasta).padStart(2, '0')}′</span>
        <span className={c.parte}><i aria-hidden />{p.nombre}</span>
        <Estado e={b.estado} />
      </span>
      <span className={c.bloqueTitulo}><small>{b.n}</small>{b.titulo}</span>
      {b.que && <span className={c.que}>{b.que}</span>}
      {b.falta && b.estado !== 'listo' && <span className={c.falta}><b>Falta</b>{b.falta}</span>}
      <span className={c.verMas}>{abierto ? 'Plegar' : b.contenido ? 'Ver contenido' : 'Abrir'}<ChevronDown size={13} aria-hidden data-abierto={abierto || undefined} /></span>
    </button>
    <Desplegable abierto={abierto} id={id}>
      <div className={c.contenido}>
        <p className={c.contenidoCeja}>Contenido · <span>{horaDe(m.evento.fecha, b.desde)}–{horaDe(m.evento.fecha, b.hasta)} · {b.hasta - b.desde} min</span></p>
        {b.contenido ? <Texto t={b.contenido} className={c.contenidoTexto} /> : <p className={c.vacioTexto}>Sin contenido escrito todavía.</p>}
      </div>
    </Desplegable>
  </li>
}

function Bloques({ m, t, i, abiertos, alternar, refs }: { m: Masterclass; t: Momento; i: number; abiertos: Set<number>; alternar: (n: number) => void; refs: React.MutableRefObject<Map<number, HTMLLIElement>> }) {
  const a = avance(m.bloques)
  return <Tarjeta i={i} className={c.bloquesTarjeta} ceja={<b>Los {a.total} bloques</b>} extra={<small className={c.ayuda}>toca uno para ver su contenido</small>}>
    {m.bloques.length ? <ol className={c.bloques}>
      {m.bloques.map((b, k) => <TarjetaBloque key={b.n} b={b} m={m} i={i + 1 + k} abierto={abiertos.has(b.n)} onAlternar={() => alternar(b.n)}
        enVivo={t.fase === 'en-vivo' && t.bloque?.n === b.n} refEl={el => { if (el) refs.current.set(b.n, el); else refs.current.delete(b.n) }} />)}
    </ol> : <p className={c.vacioTexto}>El archivo todavía no tiene bloques.</p>}
  </Tarjeta>
}

// ── Epifanía, promesa y decisiones ──
function Pieza({ titulo, texto, e, i }: { titulo: string; texto: string; e: EstadoPieza; i: number }) {
  return <Tarjeta i={i} ceja={<b>{titulo}</b>} extra={<Estado e={e} />}>
    {texto ? <blockquote className={`${c.pieza} ${l.serif}`}>{texto}</blockquote> : <p className={c.vacioTexto}>Sin texto todavía.</p>}
  </Tarjeta>
}

function Decisiones({ m, i }: { m: Masterclass; i: number }) {
  const abiertas = m.decisiones.filter(d => d.estado === 'abierta'), cerradas = m.decisiones.filter(d => d.estado !== 'abierta')
  return <Tarjeta i={i} ceja={<><b>Decisiones abiertas</b> · {abiertas.length}</>}>
    {!m.decisiones.length ? <p className={c.vacioTexto}>Ninguna decisión registrada.</p> : <ul className={c.decisiones}>
      {[...abiertas, ...cerradas].map((d, k) => <li key={d.que} className={mov.entra} style={escalon(i + k)} data-estado={d.estado} data-hecha={d.estado === 'cerrada' || undefined}>
        <span className={c.decisionMarca} aria-hidden>{d.estado === 'cerrada' && <Palomita />}</span>
        <span>{d.que}{d.resuelta && <small>{d.resuelta}</small>}</span>
      </li>)}
    </ul>}
  </Tarjeta>
}

function Materiales({ m, i }: { m: Masterclass; i: number }) {
  if (!m.rutas.length) return null
  return <Tarjeta i={i} ceja={<b>Materiales</b>}>
    <dl className={c.rutas}>{m.rutas.map(r => <div key={r.clave}><dt>{r.clave}</dt><dd>{r.ruta}</dd></div>)}</dl>
  </Tarjeta>
}

function Pie({ x, m, ahora, cargando, onConversar }: { x: LecturaMasterclass; m: Masterclass; ahora: number; cargando: boolean; onConversar: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  async function actualizar() { setOcupado(true); try { await releer(URL_MASTERCLASS) } finally { setOcupado(false) } }
  const editado = x.mtime ?? m.actualizado
  return <footer className={c.pie}>
    <span><code>{(x.ruta ?? 'masterclass-17-oct.json').split('/').pop()}</code>{editado ? ` · editado ${hace(editado, ahora)}` : ''} · se repinta sola al cambiar</span>
    <span className={c.pieAcciones}>
      <button className={l.enlace} onClick={onConversar}><MessageCircle size={12} aria-hidden /> Conversar con Levy</button>
      <button className={l.enlace} onClick={() => void actualizar()} disabled={ocupado || cargando}><RefreshCw size={12} className={ocupado ? 'animate-spin' : undefined} aria-hidden /> Actualizar</button>
    </span>
  </footer>
}

export function VistaMasterclass({ grande }: { grande?: boolean }) {
  const lect = useFuente<LecturaMasterclass>(URL_MASTERCLASS, RELECTURA_MS)
  const x = lect.data
  const ahora = useAhora()
  const m = useMemo(() => (x?.datos ? normalizar(x.datos) : null), [x?.datos])
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set())
  const refs = useRef(new Map<number, HTMLLIElement>())

  const alternar = (n: number) => setAbiertos(s => { const z = new Set(s); if (z.has(n)) z.delete(n); else z.add(n); return z })
  const ir = (n: number) => {
    setAbiertos(s => new Set(s).add(n))
    refs.current.get(n)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
  }

  if (!m) return <div className={c.mc}>{lect.error || x?.error ? <p className={l.aviso}>{lect.error ?? x?.error}</p> : <Cargando />}</div>
  const t = momento(m, ahora)
  const conversar = () => {
    const a = avance(m.bloques), faltan = m.bloques.filter(b => b.estado !== 'listo' && b.falta).map(b => `${b.n}. ${b.titulo}: ${b.falta}`)
    const abiertas = m.decisiones.filter(d => d.estado === 'abierta').map(d => d.que)
    window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: `Hablemos de la masterclass del sábado 17. La vista dice ${a.listo} de ${a.total} bloques listos (${a.borrador} en borrador, ${a.vacio} vacíos).${faltan.length ? ` Lo que falta: ${faltan.join('; ')}.` : ''}${abiertas.length ? ` Decisiones abiertas: ${abiertas.join('; ')}.` : ''} ¿Qué cerramos primero?` } }))
  }

  return <div className={c.mc} data-grande={grande || undefined}>
    {/* Una lectura mala (archivo a medio escribir) no borra la buena: se dice arriba y se sigue pintando la última. */}
    {(lect.error || x?.error) && <p className={l.aviso}>{lect.error ?? x?.error} Se muestra la última lectura buena.</p>}
    <Heroe m={m} t={t} />
    <Domino m={m} i={5} />
    <Linea m={m} t={t} i={6} onIr={ir} />
    <div className={c.rejilla}>
      {/* Ancho: los bloques a la izquierda y lo firmado a la derecha. Angosto: una columna en el orden de lectura. */}
      <div className={c.columnaAncha}><Bloques m={m} t={t} i={8} abiertos={abiertos} alternar={alternar} refs={refs} /></div>
      <div className={c.columna}>
        <Pieza titulo="La epifanía" texto={m.epifania.frase} e={m.epifania.estado} i={9} />
        <Pieza titulo="La promesa" texto={m.promesa.texto} e={m.promesa.estado} i={10} />
        <Decisiones m={m} i={11} />
        <Materiales m={m} i={12} />
      </div>
    </div>
    <Pie x={x!} m={m} ahora={ahora} cargando={lect.cargando} onConversar={conversar} />
  </div>
}
