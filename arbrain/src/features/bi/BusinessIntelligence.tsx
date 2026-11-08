'use client'
/**
 * Business Intelligence (7 nov 2026). Daniel: «no solo mostrar datos, explicar lo que ves. Sino actuar» · «me encanta la
 * señal de alarma de beer» · «que la gente pueda imprimir gráficas en ese panel» · «que sea 100% hablado contigo».
 *
 * Un cuarto que se ilumina con lo que importa. Arriba el negocio habla primero (una palabra y una frase); debajo corre el
 * cauce con su cuello; luego se le pregunta en español y la respuesta llega dibujándose; si sirve, se fija y vive en el
 * tablero, donde cada gráfica es una pregunta que se vuelve a hacer sola al abrir. En calma todo respira al mismo ritmo
 * lento. Cuando un número se sale de su corredor, se prende UNA lámpara sobre él (oro si es placer, rojo si es dolor), sube
 * la excepción con qué pasó, por qué creemos y qué propone Levy, y el resto del cuarto baja la luz.
 *
 * Datos: fuente.tsx (API o banco simulado). Lectura: modelo.ts (puro). Contrato de Levy: arbrain/docs/bi/README.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowUp, BadgeInfo, Check, ChevronRight, Headphones, MessageCircle, Pin, PinOff, Square, X } from 'lucide-react'
import { useDirecto, useModoDirecto } from '@/shared/stores/modo-directo-store'
import { CLAVE_DIRECTO } from '@/lib/modo-directo/cubrir'
import { OcultoPorDirecto } from '@/features/modo-directo/ModoDirecto'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { escalon, mov, prefiereQuieto } from '@/shared/movimiento'
import { CATALOGO, consultaDe, type Consulta } from './catalogo'
import {
  excepcion, fechaCorta, leer, titularDe, diaYMes, type Excepcion, type Grafica, type Leida, type Lectura, type RespuestaConsulta,
} from './modelo'
import { leerPendiente, usePendiente, useFuenteBI, type LecturaBI, type Pendiente } from './fuente'
import { Acumulado, Barras, Boceto, Embudo, Proporcion, SerieCorredor, usePrimeraVez } from './Graficas'
import { Cauce } from './Cauce'
import { narrar, type Tramo } from './voz'
import b from './bi.module.css'

const directoRecordado = () => { try { return typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_DIRECTO) === '1' } catch { return false } }
const hoyCivil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Lo que se lee en voz: sin comillas latinas ni abreviaturas que la voz deletrea. */
export const paraVoz = (t: string) => t.replace(/[«»"]/g, '').replace(/\bUSD\b/g, 'dólares').replace(/(\d)\s?%/g, '$1 por ciento').replace(/\s·\s/g, ', ').replace(/−/g, 'menos ')

type Lecturas = Record<string, LecturaBI<RespuestaConsulta>>

/** Un sensor invisible por gráfica: pide su consulta y avisa al tablero. Así el tablero ve todas a la vez (la excepción). */
function Sensor({ g, activa, avisar }: { g: Grafica; activa: boolean; avisar: (id: string, l: LecturaBI<RespuestaConsulta>) => void }) {
  const l = useFuenteBI().usarConsulta(g.consulta.id, g.consulta.ventana, activa)
  useEffect(() => { avisar(g.id, { data: l.data, error: l.error }) }, [g.id, l.data, l.error, avisar])
  return null
}

export function BusinessIntelligence({ grande }: { grande?: boolean }) {
  const fuente = useFuenteBI()
  const prendido = useDirecto()
  const confirmado = useModoDirecto(st => st.confirmado)
  const directo = prendido || (!confirmado && directoRecordado())
  const archivo = fuente.usarGraficas()
  const embudo = fuente.usarEmbudo()
  const [lecturas, setLecturas] = useState<Lecturas>({})
  const avisar = useCallback((id: string, l: LecturaBI<RespuestaConsulta>) => setLecturas(prev => (prev[id]?.data === l.data && prev[id]?.error === l.error ? prev : { ...prev, [id]: l })), [])
  const [foco, setFoco] = useState<string | null>(null)
  const [narrando, setNarrando] = useState<AbortController | null>(null)
  const [recien, setRecien] = useState<string | null>(null)
  const [pendiente, setPendienteEstado] = useState<Pendiente | null>(null)
  const guardarPendiente = usePendiente()
  const setPendiente = useCallback((p: Pendiente | null) => { guardarPendiente(p); setPendienteEstado(p) }, [guardarPendiente])
  useEffect(() => { setPendienteEstado(leerPendiente()) }, [])

  const datos = archivo.data?.activo ? archivo.data : null
  const graficas = useMemo(() => datos?.graficas ?? [], [datos])
  const fijadas = graficas.filter(g => g.estado === 'fijada')
  const respuesta = [...graficas].reverse().find(g => g.estado === 'respuesta') ?? null

  // La respuesta que llegó después de preguntar apaga el «Levy está leyendo».
  useEffect(() => {
    if (pendiente && respuesta && Date.parse(respuesta.creada) >= pendiente.en - 120_000) setPendiente(null)
  }, [pendiente, respuesta, setPendiente])

  const leidas: Leida[] = useMemo(() => graficas.flatMap(g => {
    const c = consultaDe(g.consulta.id)
    if (!c) return []
    const l = lecturas[g.id]
    return [{ grafica: g, consulta: c, lectura: l?.data ? leer(c, g.tipo, g.consulta.ventana, l.data.datos) : { estado: 'sin-datos', frase: l?.error ? `No se pudo leer: ${l.error}` : 'Leyendo…' } as Lectura }]
  }), [graficas, lecturas])
  const ex = useMemo(() => excepcion(leidas), [leidas])
  const titular = titularDe(leidas, ex)
  const listas = fijadas.every(g => lecturas[g.id]?.data || lecturas[g.id]?.error || (directo && consultaDe(g.consulta.id)?.unidad === 'usd'))
  const clima: 'calma' | 'senal' | 'leyendo' = !listas ? 'leyendo' : ex ? 'senal' : 'calma'
  const tonoEx = ex?.principal.lectura.senal?.tono
  const simulado = archivo.data?.activo && archivo.data.simulado || Object.values(lecturas).some(l => l.data?.simulado)
  // Lo iluminado: lo que suena en «Escúchalo»; si no, en señal, la excepción y su gráfica.
  const luz = foco ?? (ex ? `g:${ex.principal.grafica.id}` : null)
  // La cabeza (el negocio hablando) nunca se apaga en señal: solo mientras «Escúchalo» lee otra cosa.
  const estado = (id: string) => (luz === null ? undefined : id === luz || (!foco && (id === 'excepcion' || id === 'cabeza')) ? 'lit' : 'dim')

  const escuchar = useCallback(async () => {
    if (narrando) { narrando.abort(); return }
    const ctl = new AbortController()
    setNarrando(ctl)
    const tramos: Tramo[] = [{ foco: 'cabeza', texto: `${titular.palabra}. ${titular.frase}` }]
    if (ex) tramos.push({ foco: 'excepcion', texto: `Qué pasó: ${ex.principal.lectura.frase} Por qué creemos: ${ex.porque.join(' ')} Lo que propongo: ${ex.propone}` })
    const cu = embudo.data?.activo ? embudo.data.embudo?.etapas.find(e => e.cuello.es) : null
    if (cu) tramos.push({ foco: 'cuello', texto: `El cuello de tu negocio está en ${cu.nombre}. ${cu.cuello.frase ?? ''}` })
    for (const l of leidas) if (l.grafica.estado === 'fijada' && l.lectura.estado !== 'sin-datos') tramos.push({ foco: `g:${l.grafica.id}`, texto: `${l.grafica.pregunta} ${l.lectura.frase}` })
    try {
      await narrar(tramos.map(t => ({ ...t, texto: paraVoz(t.texto) })), fuente.voz, f => {
        setFoco(f)
        if (f) document.querySelector(`[data-foco-id="${CSS.escape(f)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, ctl.signal)
    } finally { setNarrando(null); setFoco(null) }
  }, [narrando, titular, ex, embudo.data, leidas, fuente.voz])
  useEffect(() => () => narrando?.abort(), [narrando])

  // Una sola respiración para todo el cuarto (8 s, ~7 por minuto): la luna, el pulso y el «ahora» de cada línea van en
  // fase porque leen la misma variable. En señal la respiración se detiene y solo late lo que se salió.
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    if (clima === 'senal' || prefiereQuieto()) { el.style.setProperty('--aliento', '0.5'); return }
    let raf = 0, ultimo = 0
    const paso = (t: number) => {
      if (t - ultimo > 40) { ultimo = t; el.style.setProperty('--aliento', (0.5 - 0.5 * Math.cos((t / 8000) * 2 * Math.PI)).toFixed(3)) }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [clima, archivo.data])

  const fijar = async (g: Grafica) => { setRecien(g.id); await fuente.accion({ accion: 'fijar', id: g.id }); setTimeout(() => setRecien(r => (r === g.id ? null : r)), 2400) }
  const preguntar = (texto: string) => { setPendiente({ texto, en: Date.now() }); fuente.preguntar(texto) }

  if (!archivo.data && !archivo.error) return <div className={b.bi} data-clima="leyendo" aria-busy="true"><p className={b.leyendo}>Abriendo Business Intelligence…</p></div>
  if (archivo.error) return <div className={b.bi}><p className={b.leyendo}>No se pudo abrir: {archivo.error}</p></div>
  if (!datos) return <div className={b.bi}><section className={b.apagado}><p className={b.ceja}>Business Intelligence</p><p>Este panel lee el negocio del dueño de la instalación. Está apagado aquí.</p></section></div>

  const hoy = hoyCivil()
  return <div ref={raiz} className={`${b.bi} ${grande ? b.grande : ''}`} data-clima={clima} data-tono={tonoEx} data-narrando={narrando ? '' : undefined} data-testid="business-intelligence">
    <div className={b.luna} aria-hidden />
    {fijadas.map(g => <Sensor key={g.id} g={g} activa={!(directo && consultaDe(g.consulta.id)?.unidad === 'usd')} avisar={avisar} />)}
    {respuesta && <Sensor key={respuesta.id} g={respuesta} activa={!(directo && consultaDe(respuesta.consulta.id)?.unidad === 'usd')} avisar={avisar} />}

    <header className={`${b.cabeza} ${mov.entra}`} style={escalon(0)} data-foco-id="cabeza" data-luz={estado('cabeza')}>
      <div className={b.cejaFila}>
        <p className={b.ceja}>Business Intelligence · <b>{fechaCorta(hoy)}</b></p>
        <span className={b.pulso} data-clima={clima} aria-live="polite"><i aria-hidden />{clima === 'leyendo' ? 'leyendo' : clima === 'senal' ? 'una señal' : 'en calma'}</span>
      </div>
      <h3 className={b.palabra}>{clima === 'leyendo' ? 'Leyendo tu negocio' : titular.palabra}</h3>
      <p className={b.frase}>{clima === 'leyendo' ? 'Cada gráfica se vuelve a preguntar sola. Un momento.' : titular.frase}</p>
      <div className={b.acciones}>
        <button type="button" className={b.escucha} onClick={escuchar} disabled={clima === 'leyendo'} aria-pressed={!!narrando}>
          {narrando ? <Square size={13} aria-hidden /> : <Headphones size={14} aria-hidden />}{narrando ? 'Detener' : 'Escúchalo'}
        </button>
        {simulado && <span className={b.simulado}>Datos simulados</span>}
      </div>
    </header>

    {ex && <Excepcion ex={ex} estado={estado('excepcion')} ver={() => document.querySelector(`[data-foco-id="g:${CSS.escape(ex.principal.grafica.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} conversar={fuente.conversar} />}

    <div className={`${mov.entra}`} style={escalon(2)} data-foco-id="cuello" data-luz={estado('cuello')}>
      <Cauce embudo={embudo.data?.activo ? embudo.data.embudo : null} abrir={fuente.banco ? undefined : () => abrirSeccion({ vista: 'negocio', seccion: 'embudo' })} />
    </div>

    <Preguntar fijadas={fijadas} pendiente={pendiente} preguntar={preguntar} cancelar={() => setPendiente(null)} hayRespuesta={!!respuesta} />

    {respuesta && <TarjetaGrafica key={`r-${respuesta.id}`} g={respuesta} lectura={leidas.find(l => l.grafica === respuesta)?.lectura} meta={lecturas[respuesta.id]?.data} error={lecturas[respuesta.id]?.error}
      directo={directo} esRespuesta luz={estado(`g:${respuesta.id}`)} conversar={fuente.conversar}
      fijar={() => fijar(respuesta)} descartar={() => fuente.accion({ accion: 'descartar', id: respuesta.id })} />}

    <section className={b.tablero} aria-label="Gráficas fijadas">
      {fijadas.length ? <div className={b.rejilla}>
        {fijadas.map((g, i) => <TarjetaGrafica key={g.id} g={g} indice={i} lectura={leidas.find(l => l.grafica === g)?.lectura} meta={lecturas[g.id]?.data} error={lecturas[g.id]?.error}
          directo={directo} recien={recien === g.id} luz={estado(`g:${g.id}`)} conversar={fuente.conversar} lampara={ex?.principal.grafica.id === g.id}
          soltar={() => fuente.accion({ accion: 'soltar', id: g.id })} />)}
      </div> : <p className={b.vacio}>Todavía no hay gráficas fijadas. Pregunta algo arriba: la respuesta se queda aquí y se vuelve a preguntar sola cada vez que abras.</p>}
    </section>

    <footer className={b.pie}>
      <p>Lo normal de cada número sale de sus 28 días anteriores (sin los extremos). Las gráficas no guardan cifras: guardan la pregunta, y se recalculan al abrir.</p>
      {datos.errores.length > 0 && <details className={b.errores}><summary>{datos.errores.length === 1 ? 'Una gráfica no se pudo leer' : `${datos.errores.length} gráficas no se pudieron leer`}: Levy las corrige</summary><ul>{datos.errores.map(e => <li key={e}>{e}</li>)}</ul></details>}
    </footer>
  </div>
}

// ── La excepción ──

function Excepcion({ ex, estado, ver, conversar }: { ex: Excepcion; estado?: string; ver: () => void; conversar: (t: string) => void }) {
  const s = ex.principal.lectura.senal!, c = ex.principal.consulta
  const hablar = () => conversar([
    `Business Intelligence subió una señal: «${c.nombre}» ${s.lado === 'arriba' ? 'se salió hacia arriba' : 'se salió hacia abajo'} el ${fechaCorta(s.fecha)}.`,
    ex.principal.lectura.frase, `Lo que vemos al lado: ${ex.porque.join(' ')}`, `Lo que propone el panel: ${ex.propone}`,
    '¿Qué crees que pasó y qué hacemos? Si necesitas otra gráfica para saberlo, escríbela con la CLI de bi.',
  ].join('\n'))
  return <section className={`${b.excepcion} ${mov.entra}`} style={escalon(1)} data-tono={s.tono} data-foco-id="excepcion" data-luz={estado} aria-label="La excepción" role="alert">
    <div className={b.lampara} aria-hidden />
    <p className={b.exCeja}><i aria-hidden />{s.tono === 'dolor' ? 'Señal de dolor' : s.tono === 'placer' ? 'Señal de placer' : 'Señal'} · {c.nombre}</p>
    <h4 className={b.exQue}>{ex.principal.lectura.frase}</h4>
    <div className={b.exCuerpo}>
      <div>
        <p className={b.exEtiqueta}>Por qué creemos</p>
        <ul className={b.exPorque}>{ex.porque.map(p => <li key={p}>{p}</li>)}</ul>
      </div>
      <div className={b.exPropone}>
        <p className={b.exEtiqueta}>Qué propone Levy</p>
        <p>{ex.propone}</p>
      </div>
    </div>
    <div className={b.exAcciones}>
      <button type="button" className={b.exHablar} onClick={hablar}><MessageCircle size={14} aria-hidden />Hablarlo con Levy</button>
      <button type="button" className={b.enlace} onClick={ver}>Ver la gráfica<ChevronRight size={13} aria-hidden /></button>
      {ex.otras.length > 0 && <span className={b.exOtras}>y {ex.otras.length === 1 ? 'otra' : ex.otras.length} en silencio: {ex.otras.map(o => o.consulta.nombre.toLocaleLowerCase('es')).join(', ')}</span>}
    </div>
  </section>
}

// ── Preguntar ──

function Preguntar({ fijadas, pendiente, preguntar, cancelar, hayRespuesta }: { fijadas: Grafica[]; pendiente: Pendiente | null; preguntar: (t: string) => void; cancelar: () => void; hayRespuesta: boolean }) {
  const [texto, setTexto] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { if (!pendiente) return; const t = setInterval(() => setAhora(Date.now()), 5000); return () => clearInterval(t) }, [pendiente])
  const usadas = new Set(fijadas.map(g => g.consulta.id))
  const sugerencias = CATALOGO.filter(c => !usadas.has(c.id)).slice(0, 3).map(c => c.ejemplos[0])
  const enviar = (e?: FormEvent) => { e?.preventDefault(); const t = texto.trim(); if (t.length < 3) return; preguntar(t); setTexto('') }
  const largo = pendiente && ahora - pendiente.en > 4 * 60_000
  return <section className={`${b.preguntar} ${mov.entra}`} style={escalon(3)} aria-label="Pregúntale a tu negocio">
    <form className={b.barra} onSubmit={enviar}>
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pregúntale a tu negocio…" aria-label="Pregúntale a tu negocio" maxLength={200} enterKeyHint="send" />
      <button type="submit" className={b.enviar} disabled={texto.trim().length < 3} aria-label="Preguntar a Levy"><ArrowUp size={17} strokeWidth={2.4} aria-hidden /></button>
    </form>
    {!pendiente && !hayRespuesta && sugerencias.length > 0 && <div className={b.sugerencias}>
      {sugerencias.map(s => <button key={s} type="button" onClick={() => preguntar(s)}>{s}</button>)}
    </div>}
    {pendiente && <div className={b.pensando} aria-live="polite">
      <Boceto />
      <div>
        <p className={b.pensandoPregunta}>«{pendiente.texto}»</p>
        <p className={b.pensandoEstado}>{largo ? 'Levy te contestó en el chat. Si la pregunta no cabe en el catálogo, ahí te dice qué consulta faltaría.' : 'Levy está eligiendo la consulta y leyendo los números. La respuesta se dibuja aquí.'}</p>
      </div>
      <button type="button" className={b.icono} onClick={cancelar} aria-label="Dejar de esperar"><X size={14} aria-hidden /></button>
    </div>}
  </section>
}

// ── Una gráfica ──

function TarjetaGrafica(p: {
  g: Grafica; lectura?: Lectura; meta?: RespuestaConsulta; error?: string; directo: boolean; luz?: string; indice?: number
  esRespuesta?: boolean; recien?: boolean; lampara?: boolean; conversar: (t: string) => void; fijar?: () => void; descartar?: () => void; soltar?: () => void
}) {
  const { g, lectura, meta, directo } = p
  const c = consultaDe(g.consulta.id) as Consulta
  const [sello, setSello] = useState(false)
  const [seguro, setSeguro] = useState(false)
  const oculto = directo && c.unidad === 'usd'
  const listo = !!meta && !!lectura && lectura.estado !== 'sin-datos'
  const dibuja = usePrimeraVez(`${g.id}:${g.consulta.ventana}:${meta?.hasta ?? ''}`, listo)
  const tono = lectura?.senal?.tono
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { if (p.esRespuesta) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [p.esRespuesta, g.id])
  const hablar = () => p.conversar(`Sobre la gráfica «${g.pregunta}» (consulta ${c.id}, ${g.consulta.ventana} días): ${lectura?.frase ?? ''}\n¿Qué ves y qué harías?`)
  return <article ref={ref} className={`${b.tarjeta} ${mov.entra}`} style={escalon(4 + (p.indice ?? 0))} data-foco-id={`g:${g.id}`} data-luz={p.luz} data-estado={lectura?.estado}
    data-tono={lectura?.estado === 'fuera' && (p.lampara || p.esRespuesta) ? tono : undefined} data-silencio={lectura?.estado === 'fuera' && !p.lampara && !p.esRespuesta ? '' : undefined} data-respuesta={p.esRespuesta || undefined} data-recien={p.recien || undefined} data-sello={sello || undefined}>
    {lectura?.estado === 'fuera' && (p.lampara || p.esRespuesta) && <div className={b.lampara} aria-hidden />}
    {p.esRespuesta && <p className={b.respuestaCeja}><i aria-hidden />Levy contestó · {g.por === 'Levy' ? 'nueva' : g.por}</p>}
    <h4 className={b.pregunta}>{g.pregunta}</h4>
    {sello ? <Sello g={g} c={c} meta={meta} /> : oculto ? <OcultoPorDirecto que="Esta gráfica de dinero" compacto /> : <>
      <div className={b.respuesta}>
        {lectura?.cifra && listo && <p className={b.cifra}><b>{lectura.cifra}</b>{lectura.sub && <small>{lectura.sub}</small>}</p>}
        <p className={b.lectura} data-dibuja={dibuja || undefined}>{(lectura?.cifra && listo ? lectura.detalle : null) ?? lectura?.frase ?? 'Leyendo…'}</p>
      </div>
      <div className={b.grafica} aria-busy={!meta && !p.error}>
        {!meta ? (p.error ? <p className={b.falla}>No se pudo leer: {p.error}</p> : <div className={b.esqueleto}><Boceto /></div>)
          : lectura?.estado === 'sin-datos' ? <p className={b.falla}>{lectura.frase}</p>
          : g.tipo === 'linea' ? <SerieCorredor c={c} lectura={lectura!} dibuja={dibuja} />
          : g.tipo === 'acumulado' ? <Acumulado lectura={lectura!} dibuja={dibuja} />
          : g.tipo === 'embudo' ? <Embudo c={c} lectura={lectura!} dibuja={dibuja} />
          : g.tipo === 'proporcion' ? <Proporcion c={c} lectura={lectura!} dibuja={dibuja} />
          : <Barras c={c} lectura={lectura!} dibuja={dibuja} />}
      </div>
      {lectura?.estado === 'aprendiendo' && lectura.aprendiendo && <p className={b.aprendiendo}><span style={{ '--p': lectura.aprendiendo.tiene / 14 } as CSSProperties} />Aprendiendo lo normal · {lectura.aprendiendo.tiene} de 14 días</p>}
      {(g.lectura || g.propone) && <div className={b.levy}>
        {g.lectura && <p><b>Levy</b> <small>{diaYMes(g.creada.slice(0, 10))}</small> {g.lectura}</p>}
        {g.propone && <p className={b.levyPropone}><b>Haría:</b> {g.propone}</p>}
      </div>}
      {c.nota && <p className={b.nota}>{c.nota}</p>}
      {meta?.aviso && <p className={b.nota}>{meta.aviso}</p>}
    </>}
    <footer className={b.tarjetaPie}>
      <span className={b.fuente}>{g.fuente}{meta?.hasta ? ` · al ${diaYMes(meta.hasta)}` : ''}</span>
      <span className={b.botones}>
        {p.esRespuesta ? <>
          <button type="button" className={b.fijar} onClick={p.fijar}><Pin size={13} aria-hidden />Fijar al tablero</button>
          <button type="button" className={b.icono} onClick={p.descartar} aria-label="Descartar la respuesta" title="Descartar"><X size={14} aria-hidden /></button>
        </> : seguro ? <>
          <span className={b.seguro}>¿Soltarla?</span>
          <button type="button" className={b.icono} onClick={() => { setSeguro(false); p.soltar?.() }} aria-label="Sí, soltar"><Check size={14} aria-hidden /></button>
          <button type="button" className={b.icono} onClick={() => setSeguro(false)} aria-label="No"><X size={14} aria-hidden /></button>
        </> : <>
          <button type="button" className={b.icono} onClick={() => setSello(s => !s)} aria-pressed={sello} aria-label="¿De dónde sale?" title="¿De dónde sale?"><BadgeInfo size={14} aria-hidden /></button>
          <button type="button" className={b.icono} onClick={hablar} aria-label="Hablarlo con Levy" title="Hablarlo con Levy"><MessageCircle size={14} aria-hidden /></button>
          {p.soltar && <button type="button" className={b.icono} onClick={() => setSeguro(true)} aria-label="Soltar del tablero" title="Soltar"><PinOff size={14} aria-hidden /></button>}
        </>}
      </span>
    </footer>
  </article>
}

/** El sello de procedencia: la especificación tal cual vive en el archivo. */
function Sello({ g, c, meta }: { g: Grafica; c: Consulta; meta?: RespuestaConsulta }) {
  const filas: [string, string][] = [
    ['Pregunta', g.pregunta],
    ['Consulta', `${c.id} · ${c.nombre} · ${g.consulta.ventana} días`],
    ['Qué mide', c.que],
    ['Tipo', g.tipo],
    ['Fuente', g.fuente],
    ['Creada', `${fechaCorta(g.creada.slice(0, 10))}, por ${g.por}`],
    ...(c.alarma ? [['Lo normal', 'p10–p90 de los 28 días anteriores a cada punto; mínimo 14 medidos'] as [string, string]] : []),
    ...(meta ? [['Leída', `${new Date(meta.leidoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}${meta.simulado ? ' · simulada' : ''}`] as [string, string]] : []),
  ]
  return <dl className={b.sello}>{filas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
}
