'use client'
/**
 * Ideas (v2, 15 nov 2026). El dueño, al ver la v1: «esta sección de ideas no la entiendo tan bien… me da la sensación
 * que se volverán parte de museo», «acá por ejemplo no cambia la miniatura por video» y «quizá entender ok cuál sería el
 * tipo de contenido que más me interesaría a mí hacer?».
 *
 * Así que esta pestaña es una herramienta de decisión, no una vitrina:
 *  - Arriba, «Tu tipo de contenido»: la HIPÓTESIS de Levy con su evidencia, para que él la firme, la ajuste o la tire.
 *  - Cada idea se lee en una línea y se decide con tres botones que dicen lo que hacen: a su backlog (tarea sin fecha en
 *    Todoist › YouTube con su brief, de donde la toma `youtube-os`), guardar o fuera.
 *  - Pocas a la vez, de su nicho y recientes; lo que no decide se va solo (nadie cura nada).
 *  - Cada título trae SU miniatura: al cambiar de título cambia la imagen. Desde el 19 nov es la miniatura REAL (Sunburst con
 *    su cara: «en lugar de tener un monillo ahí te doy permiso…»); el boceto solo queda mientras la imagen no exista.
 *  - Las ideas parten primero de sus referentes de estudio (marcados en su universo) y cada una dice qué video de ellos
 *    la inspira.
 * Lee su propio banco (`/api/cuartel/cerebro/ideas`); de la lectura del cuartel solo usa los videos para abrir el original.
 *
 * «Tus ideas» (19 nov): «delegas el tema de las ideas, se me han ocurrido algunas a lo largo del tiempo». Arriba van las
 * que él dijo o escribió (su backlog, Todoist, su diario, lo que le dijo a Levy), cada una con su fuente y su fecha, y un
 * «+ Idea» para escribir o dictar una en una línea. Abajo, «Del mercado»: las que salen de videos ajenos que funcionaron.
 * Misma tarjeta; las suyas no caducan ni ocupan el cupo del mercado.
 */
import { useCallback, useMemo, useState } from 'react'
import { Bookmark, Check, ChevronDown, Lightbulb, ListPlus, Loader2, PenLine, Play, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { VoiceInput } from '@/features/chat/components/VoiceInput'
import { compacto, edad } from './modelo'
import { avisoVence, escenaDe, fechaOrigen, ladoDe, lineasVeredicto, miniaturaDe, MOTIVOS, normalizarBanco, rendimientoOrigen, semilla, textoFuente, textoInspira, tintaDe, urlImagen, variantesPorEscena, type Banco, type Escena, type IdeaBanco, type MiniaturaIdea, type PiezaEvidencia, type Tinta, type TipoContenido } from './ideas-modelo'
import type { LecturaCuartel, VideoCuartel } from './tipos'
import type { EnSala } from './Sala'
import s from './ideas.module.css'

type Vista = 'decidir' | 'guardadas' | 'backlog'
type Decision = 'backlog' | 'guardada' | 'fuera'
type Local = { estado?: string; decision?: Decision; ocupada?: boolean; error?: string | null; motivo?: string | null; todoist?: IdeaBanco['todoist']; todoist_error?: string | null; titulo?: number }

async function pedir<T = unknown>(cuerpo: unknown, ms = 60000): Promise<T> {
  const r = await fetch('/api/cuartel/cerebro/ideas', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(ms), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `El Studio respondió ${r.status}.`)
  return j as T
}

export function Ideas({ lectura, abrir, produccion }: { lectura: LecturaCuartel; abrir: (e: EnSala) => void; releer: () => void; produccion: React.ReactNode }) {
  const { data, error, loading, refresh } = useReading<unknown>('/api/cuartel/cerebro/ideas', false, 30000)
  const banco = useMemo(() => normalizarBanco(data), [data])
  const [vista, setVista] = useState<Vista>('decidir')
  const [local, setLocal] = useState<Record<string, Local>>({})
  const [trayendo, setTrayendo] = useState<string | null>(null)
  const porId = useMemo(() => new Map([...lectura.outliers, ...lectura.videos].map(v => [v.video_id, v])), [lectura])
  const parche = useCallback((id: string, p: Local | null) => setLocal(m => { const n = { ...m }; if (p) n[id] = { ...n[id], ...p }; else delete n[id]; return n }), [])

  const ideas = useMemo(() => banco.ideas.map(i => { const l = local[i.id]; return l ? { ...i, estado: l.estado ?? i.estado, motivo: l.motivo ?? i.motivo, todoist: l.todoist ?? i.todoist, todoist_error: l.todoist_error !== undefined ? l.todoist_error : i.todoist_error, titulo_elegido: l.titulo ?? i.titulo_elegido } : i }), [banco.ideas, local])
  const cuenta = { decidir: ideas.filter(i => i.estado === 'nueva' && i.procedencia !== 'tuya').length, tuyas: ideas.filter(i => i.estado === 'nueva' && i.procedencia === 'tuya').length, guardadas: ideas.filter(i => i.estado === 'guardada').length, backlog: ideas.filter(i => i.estado === 'a_guion' || i.estado === 'aplicada').length }
  // En «por decidir» se quedan, hechas una línea, las que acaba de decidir: ve que se fueron y puede deshacer.
  const visibles = ideas.filter(i => vista === 'decidir' ? i.estado === 'nueva' || !!local[i.id]?.decision : vista === 'guardadas' ? i.estado === 'guardada' && !local[i.id]?.decision : i.estado === 'a_guion' || i.estado === 'aplicada')

  const decidir = useCallback(async (idea: IdeaBanco, decision: Decision, titulo: number) => {
    const estado = decision === 'backlog' ? 'a_guion' : decision === 'guardada' ? 'guardada' : 'descartada'
    parche(idea.id, { estado, decision, ocupada: true, error: null, titulo })
    try {
      const r = await pedir<{ todoist?: IdeaBanco['todoist']; todoist_error?: string | null }>(decision === 'backlog' ? { accion: 'backlog', id: idea.id, titulo } : { accion: 'estado', id: idea.id, estado })
      parche(idea.id, { ocupada: false, todoist: r.todoist ?? null, todoist_error: r.todoist_error ?? null })
    } catch (e) { parche(idea.id, { estado: idea.estado, decision: undefined, ocupada: false, error: (e as Error).message }) }
  }, [parche])
  const deshacer = useCallback(async (idea: IdeaBanco) => {
    parche(idea.id, { ocupada: true })
    try { await pedir({ accion: 'estado', id: idea.id, estado: 'nueva' }); parche(idea.id, null); refresh() } catch (e) { parche(idea.id, { ocupada: false, error: (e as Error).message }) }
  }, [parche, refresh])
  const motivo = useCallback((idea: IdeaBanco, m: string) => { parche(idea.id, { motivo: m }); pedir({ accion: 'estado', id: idea.id, estado: 'descartada', motivo: m }).catch(() => parche(idea.id, { motivo: null })) }, [parche])
  const cambiarVista = (v: Vista) => { setVista(v); if (Object.values(local).some(l => l.decision)) { setLocal({}); refresh() } }
  const traer = async () => {
    setTrayendo('Levy está leyendo a tus referentes y tu nicho, y haciendo sus miniaturas… tarda unos minutos.')
    try { await pedir({ accion: 'refrescar' }, 295000); setLocal({}); refresh(); setTrayendo(null) } catch (e) { setTrayendo((e as Error).message) }
  }
  const faltan = Math.max(0, banco.reglas.tope_por_decidir - cuenta.decidir)
  // Vocabulario de bocetos: cada escena tiene varias formas; a la n-ésima idea con la misma escena le toca la forma n.
  const variantes = useMemo(() => variantesPorEscena(visibles), [visibles])
  // En «por decidir», las tuyas arriba y las del mercado abajo; en las otras vistas, juntas.
  const tuyas = vista === 'decidir' ? visibles.filter(i => i.procedencia === 'tuya') : []
  const mercado = vista === 'decidir' ? visibles.filter(i => i.procedencia !== 'tuya') : visibles
  const [todasTuyas, setTodasTuyas] = useState(false)
  // «+ Idea»: entra al banco al instante; los títulos y su boceto los pone Levy después (tarda lo que tarda el modelo).
  const [titulando, setTitulando] = useState<Set<string>>(new Set())
  const nuevaIdea = useCallback(async (texto: string) => {
    const r = await pedir<IdeaBanco & { repetida?: boolean }>({ accion: 'tuya', texto })
    refresh()
    if (!r.titulos?.length) {
      setTitulando(x => new Set(x).add(r.id))
      pedir({ accion: 'titular', id: r.id }, 210000).catch(() => null).finally(() => { setTitulando(x => { const n = new Set(x); n.delete(r.id); return n }); refresh() })
    }
    return r
  }, [refresh])
  const tarjeta = (i: IdeaBanco, k: number) => {
    const l = local[i.id]
    if (l?.decision && vista !== 'backlog') return <Decidida key={i.id} idea={i} l={l} deshacer={() => deshacer(i)} motivo={m => motivo(i, m)} reintentar={() => decidir(i, 'backlog', i.titulo_elegido ?? 0)} />
    if (vista === 'backlog') return <EnBacklog key={i.id} idea={i} l={l} regresar={() => deshacer(i)} reintentar={() => decidir(i, 'backlog', i.titulo_elegido ?? 0)} />
    return <Tarjeta key={i.id} idea={i} k={k} variante={variantes.get(i.id) ?? 0} tipo={banco.tipo} reglas={banco.reglas} error={l?.error ?? null} decidir={(d, t) => decidir(i, d, t)} origen={i.origen?.video_id ? porId.get(i.origen.video_id) ?? null : null} abrir={abrir} titulando={titulando.has(i.id)} />
  }

  return <div className={s.raiz} data-testid="ideas">
    <Tipo banco={banco} cargando={loading && !data} porId={porId} abrir={abrir} refrescar={refresh} />

    {vista === 'decidir' && <section className={s.banco} data-testid="tus-ideas">
      <header className={s.bancoCabeza}>
        <h2 className={s.bancoTitulo}><Lightbulb size={16} className={s.bancoIcono} /> Tus ideas{data ? <em className={s.cuantas}> · {cuenta.tuyas}</em> : null}
          <small>{data ? (cuenta.tuyas ? 'Las que dijiste o escribiste: tu backlog, Todoist, tu diario y lo que le has dicho a Levy. No caducan.' : 'Las que digas o escribas, aquí; no caducan.') : 'Leyendo…'}</small></h2>
      </header>
      <NuevaIdea guardar={nuevaIdea} />
      {tuyas.length > 0 && <div className={s.rejilla} data-vista="tuyas">{(todasTuyas ? tuyas : tuyas.slice(0, TOPE_TUYAS)).map(tarjeta)}</div>}
      {tuyas.length > TOPE_TUYAS && <button className={s.enlace} onClick={() => setTodasTuyas(!todasTuyas)} aria-expanded={todasTuyas}>{todasTuyas ? 'Ver menos' : `Ver las ${tuyas.length}`} <ChevronDown size={12} data-abierto={todasTuyas || undefined} /></button>}
    </section>}

    <section className={s.banco} data-testid="del-mercado">
      <header className={s.bancoCabeza}>
        <h2 className={s.bancoTitulo}>{vista === 'decidir' ? (data ? <>Del mercado<em className={s.cuantas}> · {cuenta.decidir ? `${cuenta.decidir} por decidir` : 'nada por decidir'}</em></> : 'Leyendo tus ideas…') : vista === 'guardadas' ? 'Guardadas' : 'En tu backlog de YouTube'}
          {vista === 'decidir' && <small>{banco.referentes.length ? `Primero de tus ${banco.referentes.length} referentes (${banco.referentes.map(r => r.split(' ')[0]).join(', ').replace(/, ([^,]*)$/, ' y $1')}), luego de tu nicho.` : 'De outliers recientes de tu nicho.'} Lo que no decidas se va solo en {banco.reglas.caduca_dias} días.</small>}
          {vista === 'guardadas' && <small>Se quedan {banco.reglas.guardada_dias} días y se van solas.</small>}</h2>
        {/* Lo ya decidido no estorba: son enlaces chicos, y solo existen si hay algo dentro. */}
        <nav className={s.vistas} aria-label="Lo ya decidido">
          {vista !== 'decidir' && <button onClick={() => cambiarVista('decidir')}>← Por decidir{cuenta.decidir ? ` (${cuenta.decidir})` : ''}</button>}
          {vista !== 'guardadas' && cuenta.guardadas > 0 && <button onClick={() => cambiarVista('guardadas')}><Bookmark size={12} /> Guardadas ({cuenta.guardadas})</button>}
          {vista !== 'backlog' && cuenta.backlog > 0 && <button onClick={() => cambiarVista('backlog')}><ListPlus size={12} /> En tu backlog ({cuenta.backlog})</button>}
        </nav>
      </header>
      {error && !data && <p className={s.aviso} role="alert">{error}</p>}

      {mercado.length ? <div className={s.rejilla} data-vista={vista}>{mercado.map(tarjeta)}</div>
        : !!data && <p className={s.vacio}>{vista === 'decidir' ? 'Ya decidiste todas. Levy trae más de tu nicho cada mañana.' : vista === 'guardadas' ? 'No tienes ideas guardadas.' : 'Todavía no mandas ninguna idea a tu backlog.'}</p>}

      {vista === 'decidir' && !!data && faltan > 0 && <div className={s.traer}>
        <button className={s.botonSuave} onClick={traer} disabled={!!trayendo && !trayendo.startsWith('El ')}>{trayendo && trayendo.startsWith('Levy') ? <Loader2 size={13} className={s.gira} /> : <Sparkles size={13} />} Traer {faltan === 1 ? 'una idea más' : `${faltan} ideas más`}</button>
        {trayendo && <small role="status">{trayendo}</small>}
      </div>}
      {vista === 'backlog' && <div className={s.produccion}>
        <h3><PenLine size={13} /> Ya en producción <small>lo que está en Todoist como video en curso</small></h3>
        {produccion}
      </div>}
    </section>
  </div>
}

const TOPE_TUYAS = 6

// ── + Idea: una línea, escrita o dictada ─────────────────────────────────────

function NuevaIdea({ guardar }: { guardar: (texto: string) => Promise<IdeaBanco & { repetida?: boolean }> }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<{ ocupado?: boolean; error?: string; listo?: string }>({})
  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    setEstado({ ocupado: true })
    try {
      const r = await guardar(t)
      setTexto(''); setAbierta(false)
      setEstado({ listo: r.repetida ? 'Ya la tenías: le sumé esta fuente.' : 'Guardada en tus ideas.' })
    } catch (e) { setEstado({ error: (e as Error).message }) }
  }
  if (!abierta) return <div className={s.nuevaFila}>
    <button className={s.botonOro} onClick={() => { setAbierta(true); setEstado({}) }} data-testid="mas-idea"><Plus size={14} /> Idea</button>
    {estado.listo && <small role="status" className={s.nuevaListo}><Check size={12} /> {estado.listo}</small>}
  </div>
  return <form className={s.nueva} onSubmit={e => { e.preventDefault(); void enviar() }} data-testid="nueva-idea">
    <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus maxLength={600} disabled={estado.ocupado} aria-label="Tu idea de video, en una línea"
      placeholder="Tu idea en una línea. Ej.: «la escalera de los cinco verbos como experimento»"
      onKeyDown={e => { if (e.key === 'Escape') { setAbierta(false); setTexto('') } }} />
    <VoiceInput soloTexto etiqueta="Dictar la idea" onVoiceNote={t => setTexto(x => (x ? `${x} ${t}` : t))} disabled={estado.ocupado} />
    <button type="submit" className={s.botonOro} disabled={estado.ocupado || !texto.trim()}>{estado.ocupado ? <Loader2 size={13} className={s.gira} /> : <Check size={13} />} Guardar</button>
    <button type="button" className={s.enlace} onClick={() => { setAbierta(false); setTexto(''); setEstado({}) }} disabled={estado.ocupado}>Cancelar</button>
    {estado.error && <p className={s.aviso} role="alert">{estado.error}</p>}
  </form>
}

// ── Tu tipo de contenido ─────────────────────────────────────────────────────

function Tipo({ banco, cargando, porId, abrir, refrescar }: { banco: Banco; cargando: boolean; porId: Map<string, VideoCuartel>; abrir: (e: EnSala) => void; refrescar: () => void }) {
  const t = banco.tipo
  const [modo, setModo] = useState<null | 'ajustar' | 'no'>(null)
  const [nota, setNota] = useState('')
  const [estado, setEstado] = useState<{ ocupado?: string; error?: string }>({})
  const [abierta, setAbierta] = useState(false)
  const armar = async () => {
    setEstado({ ocupado: 'Levy está cruzando tu canal, los outliers de tu nicho y lo que has dicho… tarda cerca de un minuto.' })
    try { await pedir({ accion: 'tipo' }, 290000); setEstado({}); refrescar() } catch (e) { setEstado({ error: (e as Error).message }) }
  }
  if (!t) return <section className={s.tipo} data-estado="vacio" data-testid="tipo-contenido">
    <div className={s.tipoCabeza}>
      <p className={s.ceja}>Tu tipo de contenido</p>
      {!cargando && <button className={s.botonOro} onClick={armar} disabled={!!estado.ocupado}>{estado.ocupado ? <Loader2 size={13} className={s.gira} /> : <Sparkles size={13} />} Armar mi hipótesis (1 min)</button>}
    </div>
    <p className={s.tipoVacio}>{cargando ? 'Leyendo…' : estado.ocupado ?? 'La hipótesis del contenido que más te interesaría hacer, sacada de lo que mejor le funciona a tu canal, los outliers de tu nicho, tus «me sirvió» y lo que has dicho. Tú la firmas.'}</p>
    {estado.error && <p className={s.aviso} role="alert">{estado.error}</p>}
  </section>

  const firmar = async (decision: 'si' | 'ajustar' | 'no') => {
    setEstado({ ocupado: decision === 'si' ? 'Firmando…' : 'Levy la está reescribiendo con lo que dijiste… tarda cerca de un minuto.' })
    try {
      await pedir({ accion: 'firmar', decision, nota: nota.trim() || undefined })
      if (decision !== 'si') await pedir({ accion: 'tipo' }, 290000)
      setModo(null); setNota(''); setEstado({}); refrescar()
    } catch (e) { setEstado({ error: (e as Error).message }) }
  }
  const firmada = t.estado === 'firmada'
  const f = t.fuentes
  return <section className={s.tipo} data-estado={t.estado} data-abierta={abierta || undefined} data-testid="tipo-contenido">
    <div className={s.tipoCabeza}>
      <p className={s.ceja}>Tu tipo de contenido <b data-firmada={firmada || undefined}>{firmada ? `firmado por ti${t.firma?.cuando ? ` · ${edad(t.firma.cuando)}` : ''}` : t.autor === 'levy' ? 'borrador de Levy · sin firmar' : 'hipótesis · sin firmar'}</b></p>
      {!firmada && !modo && <div className={s.tipoFirma}>
        <button className={s.botonOro} onClick={() => firmar('si')} disabled={!!estado.ocupado}><Check size={13} /> Sí, es esto</button>
        <button className={s.botonSuave} onClick={() => setModo('ajustar')} disabled={!!estado.ocupado}>Casi: ajustar</button>
        <button className={s.botonSuave} onClick={() => setModo('no')} disabled={!!estado.ocupado}>No es esto</button>
      </div>}
    </div>
    <h2 className={s.tipoFrase}>{t.frase}</h2>
    {!firmada && t.de_donde_sale.length > 0 && <p className={s.tipoOrigen} data-testid="tipo-de-donde-sale"><b>De dónde sale:</b> {t.de_donde_sale.map((d, i) => <q key={i}>{d.texto}</q>)}<small>{t.de_donde_sale[0].fecha ? `lo dijiste tú, ${t.de_donde_sale[0].fecha}` : 'lo dijiste tú'}</small></p>}
    <div className={s.tipoChips}>
      {!abierta && t.formatos.map((x, n) => <span key={x.id} title={x.que_es ?? undefined}><i>{n + 1}</i>{x.nombre}</span>)}
      <button className={s.enlace} onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>{abierta ? 'Cerrar' : <>Ver <em>los {t.formatos.length} formatos y </em>de dónde sale</>} <ChevronDown size={12} data-abierto={abierta || undefined} /></button>
      {firmada && !modo && <button className={s.enlace} onClick={() => setModo('ajustar')}>Cambiarla</button>}
    </div>
    {modo && <div className={s.tipoNota}>
      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} autoFocus maxLength={600}
        placeholder={modo === 'ajustar' ? 'Dile a Levy qué cambiar, con tus palabras. Ej.: «menos tutorial de herramienta, más operar un negocio real».' : 'Opcional: ¿qué sí sería? Levy propone otra lectura con esto.'} />
      <div><button className={s.botonOro} onClick={() => firmar(modo)} disabled={!!estado.ocupado || (modo === 'ajustar' && !nota.trim())}>{estado.ocupado ? <Loader2 size={13} className={s.gira} /> : null} {modo === 'ajustar' ? 'Reescribirla así' : 'Tirarla y proponer otra'}</button>
        <button className={s.enlace} onClick={() => { setModo(null); setEstado({}) }} disabled={!!estado.ocupado}>Cancelar</button></div>
    </div>}
    {estado.ocupado && <p className={s.tipoEstado} role="status">{estado.ocupado}</p>}
    {estado.error && <p className={s.aviso} role="alert">{estado.error}</p>}
    {abierta && <>
      {t.para_quien && <p className={s.tipoPara}>Para: {t.para_quien}</p>}
      <ol className={s.formatos}>{t.formatos.map((x, n) => <li key={x.id} className={s.formato}>
        <h3><span>{n + 1}</span>{x.nombre}</h3>
        {x.que_es && <p>{x.que_es}</p>}
        {x.ejemplo && <p className={s.formatoEjemplo}>«{x.ejemplo}»</p>}
        <ul className={s.evidencia}>{x.evidencia.slice(0, 4).map(id => <Evidencia key={id} e={t.evidencia[id]} video={t.evidencia[id]?.video_id ? porId.get(t.evidencia[id].video_id!) ?? null : null} abrir={abrir} />)}</ul>
      </li>)}</ol>
      <div className={s.tipoPie}>
        {t.no_es.length > 0 && <p><b>No es:</b> {t.no_es.join(' · ')}</p>}
        {t.duda && <p><b>Lo que aún no sé:</b> {t.duda.replace(/\s*\((?:[cnsd]\d+(?:,\s*)?)+\)/g, '')}</p>}
        <p className={s.tipoFuentes}>Sale de {f.canal} videos tuyos, {f.nicho} outliers de tu nicho y {f.dichos} frases tuyas. {f.sirvio ? `Y de tus ${f.sirvio} «me sirvió».` : 'Aún no hay «me sirvió»: cuando votes en Aprender, se afina.'}</p>
      </div>
    </>}
  </section>
}

const FUENTE: Record<PiezaEvidencia['fuente'], string> = { canal: 'Tu canal', nicho: 'Tu nicho', sirvio: 'Te sirvió', dichos: 'Tú' }

function Evidencia({ e, video, abrir }: { e: PiezaEvidencia | undefined; video: VideoCuartel | null; abrir: (e: EnSala) => void }) {
  if (!e) return null
  const cuerpo = <><b data-fuente={e.fuente}>{FUENTE[e.fuente]}</b><span>«{e.texto}»</span><small>{e.detalle.replace(/^(tu canal|lo dijiste tú|te sirvió) · /, '')}</small></>
  return <li>{video ? <button onClick={() => abrir({ video, desde: 'radar' })} title="Abrir el video">{cuerpo}</button> : <div>{cuerpo}</div>}</li>
}

// ── Una idea ─────────────────────────────────────────────────────────────────

function Tarjeta({ idea, k, variante, tipo, reglas, error, decidir, origen, abrir, titulando }: { idea: IdeaBanco; k: number; variante: number; tipo: TipoContenido | null; reglas: Banco['reglas']; error: string | null; decidir: (d: Decision, titulo: number) => void; origen: VideoCuartel | null; abrir: (e: EnSala) => void; titulando?: boolean }) {
  const [n, setN] = useState(idea.titulo_elegido ?? 0)
  const [detalle, setDetalle] = useState(false)
  const titulo = idea.titulos[n]?.texto ?? idea.idea
  const mini = miniaturaDe(idea, n)
  const formato = tipo?.formatos.find(f => f.id === idea.formato)
  const o = idea.origen
  const vence = avisoVence(idea)
  const fecha = fechaOrigen(o?.publicado)
  const rinde = rendimientoOrigen(o)
  const guardada = idea.estado === 'guardada'
  const tuya = idea.procedencia === 'tuya'
  const fuente = tuya ? textoFuente(idea.fuente) : null
  return <article className={`${s.idea} mov-entra`} style={{ ['--i' as string]: Math.min(k, 10) }} data-estado={idea.estado} data-procedencia={idea.procedencia} data-testid="idea">
    <div className={s.cuerpo}>
      <figure className={s.boceto}>
        {mini ? <Miniatura m={mini.m} clave={`${idea.id}:${mini.indice}`} tinta={tintaDe(idea.id, mini.indice)} variante={variante + mini.indice} titulo={titulo} /> : <div className={s.bocetoVacio}>{titulando ? <span><Loader2 size={13} className={s.gira} /> Levy le pone títulos…</span> : 'sin miniatura'}</div>}
        {idea.titulos.length > 1 && <figcaption className={s.paso} role="group" aria-label="Título y su miniatura">
          <small>Título</small>{idea.titulos.map((t, i) => <button key={i} data-activo={i === n || undefined} aria-pressed={i === n} aria-label={`Título ${i + 1}: ${t.texto}`} title={t.texto} onClick={() => setN(i)}>{i + 1}</button>)}
        </figcaption>}
      </figure>
      <div className={s.lectura}>
        {fuente && <p className={s.fuente} title={fuente.detalle ?? undefined} data-testid="idea-fuente"><b>Tuya</b> {fuente.texto}</p>}
        {o && <button className={s.origen} onClick={() => origen && abrir({ video: origen, desde: 'radar' })} disabled={!origen} title={origen ? `Ver el original: «${o.titulo ?? ''}»` : `«${o.titulo ?? ''}»`}>
          {rinde.vistas && <b data-vistas>{rinde.vistas}</b>}{rinde.veces && <b title="Veces lo normal de su canal a esa edad">{rinde.veces}</b>}{fecha && <i data-viejo={fecha.viejo || undefined}>{fecha.texto}{fecha.hace && <em> · {fecha.hace}</em>}</i>}<span>{o.canal}</span>{origen && <u><Play size={9} fill="currentColor" /> <em>ver original</em></u>}
        </button>}
        {vence && <small className={s.vence}>{vence}</small>}
        {idea.inspira && <p className={s.inspira} data-testid="idea-inspira" title={idea.inspira.apoyo.length ? `También: ${idea.inspira.apoyo.map(a => `«${a.titulo}» (${a.canal})`).join(' · ')}` : undefined}><Sparkles size={10} /> Te inspira {textoInspira(idea.inspira, o?.outlier)}</p>}
        <h3 className={s.titulo}>{titulo}</h3>
        {(!tuya || idea.titulos.length > 0) && <p className={s.laIdea}>{tuya ? <q>{idea.idea}</q> : idea.idea}</p>}
      </div>
    </div>
    {error && <p className={s.aviso} role="alert">{error}</p>}
    <footer className={s.acciones}>
      <button className={s.botonOro} onClick={() => decidir('backlog', n)} title="Crea la tarea sin fecha en Todoist › YouTube con este título y su brief; de ahí la toma el guion"><ListPlus size={14} /><span>A mi backlog<i> de YouTube</i></span></button>
      {!guardada && !tuya && <button className={s.botonSuave} onClick={() => decidir('guardada', n)} title={`No se va a los ${reglas.caduca_dias} días: se queda ${reglas.guardada_dias}. Guardadas caben pocas; las más viejas se van solas.`}><Bookmark size={13} /> Guardar {reglas.guardada_dias} días</button>}
      <button className={s.botonSuave} onClick={() => decidir('fuera', n)} title={tuya ? 'Ya no la quieres: se va (puedes deshacerlo)' : 'Se va, y Levy aprende qué no es lo tuyo'}><X size={13} /> Fuera</button>
      <button className={s.enlace} onClick={() => setDetalle(!detalle)} aria-expanded={detalle}>Detalle <ChevronDown size={12} data-abierto={detalle || undefined} /></button>
    </footer>
    {detalle && <div className={s.detalle}>
      {idea.titulos.length > 1 && <ol className={s.titulos} aria-label="Títulos: cada uno con su miniatura">{idea.titulos.map((t, i) => <li key={i}>
        <button data-activo={i === n || undefined} aria-pressed={i === n} onClick={() => setN(i)}><span>{i + 1}</span><em>{t.texto}</em>{t.patron && <small>{t.patron}</small>}</button>
      </li>)}</ol>}
      <dl className={s.brief}>
        {tuya && <><dt>Tus palabras</dt><dd>«{idea.idea}»{fuente?.detalle ? <small className={s.fuenteDetalle}>{fuente.detalle}</small> : null}</dd></>}
        {formato && <><dt>Encaja con</dt><dd>{formato.nombre} <small>(tu tipo de contenido)</small></dd></>}
        {idea.solo_tu && <><dt>Solo tú</dt><dd>{idea.solo_tu}</dd></>}
        {idea.promesa && <><dt>Se lleva</dt><dd>{idea.promesa}</dd></>}
        {o?.titulo && <><dt>{idea.inspira ? 'La inspira' : 'Viene de'}</dt><dd>«{o.titulo}»{o.canal ? ` de ${o.canal}` : ''}{o.vistas ? ` · ${compacto(o.vistas)} vistas` : ''}{idea.base === 'empaque' ? ' · Levy la armó con su título y sus números; aún no lo lee.' : ''}</dd></>}
        {!!idea.inspira?.apoyo.length && <><dt>Convergen</dt><dd>{idea.inspira.apoyo.map(a => `«${a.titulo}» de ${a.canal}${a.veces && a.veces >= 1.5 ? ` (${a.veces}x)` : ''}`).join(' · ')}</dd></>}
      </dl>
      <Brief idea={idea} mini={mini?.m ?? null} />
    </div>}
  </article>
}

function Brief({ idea, mini }: { idea: IdeaBanco; mini: MiniaturaIdea | null }) {
  const g = idea.para_guion
  return <dl className={s.brief}>
    {idea.origen?.por_que_funciono && <><dt>Por qué funcionó el original</dt><dd>{idea.origen.por_que_funciono}</dd></>}
    {idea.angulo && idea.angulo !== idea.idea && <><dt>Ángulo</dt><dd>{idea.angulo}</dd></>}
    {mini?.composicion && <><dt>Miniatura</dt><dd>{mini.composicion}</dd></>}
    {g?.gancho && <><dt>Gancho</dt><dd>{g.gancho}</dd></>}
    {g?.demostracion && <><dt>Se ve en pantalla</dt><dd>{g.demostracion}</dd></>}
    {g?.cta && <><dt>Cierre</dt><dd>{g.cta}</dd></>}
    {idea.voz_cliente.length > 0 && <><dt>Tu cliente dice</dt><dd>{idea.voz_cliente.slice(0, 3).map((c, i) => <q key={i}>{c.texto}</q>)}</dd></>}
  </dl>
}

/** La idea ya decidida, en una línea: qué pasó con ella y cómo deshacerlo. */
function Decidida({ idea, l, deshacer, motivo, reintentar }: { idea: IdeaBanco; l: Local; deshacer: () => void; motivo: (m: string) => void; reintentar: () => void }) {
  const titulo = idea.titulos[idea.titulo_elegido ?? 0]?.texto ?? idea.idea
  return <article className={s.decidida} data-decision={l.decision} data-testid="idea-decidida">
    <span className={s.decididaMarca}>{l.ocupada ? <Loader2 size={13} className={s.gira} /> : l.decision === 'backlog' ? <ListPlus size={13} /> : l.decision === 'guardada' ? <Bookmark size={13} /> : <X size={13} />}</span>
    <p><strong>{titulo}</strong>
      <small>{l.decision === 'backlog' ? (l.ocupada ? 'Mandándola a tu backlog…' : idea.todoist?.id ? `En tu backlog: tarea creada en Todoist › ${idea.todoist.proyecto ?? 'YouTube'}, con su brief.` : idea.todoist_error ? `Brief listo, pero la tarea no se creó (${idea.todoist_error}).` : 'En tu backlog, con su brief.')
        : l.decision === 'guardada' ? 'Guardada. Está en «Guardadas».' : 'Fuera.'}</small></p>
    {l.decision === 'fuera' && !l.ocupada && <span className={s.motivos}>{idea.motivo ? <small>Anotado: {MOTIVOS.find(([k]) => k === idea.motivo)?.[1]}</small>
      : <><small>¿Por qué?</small>{MOTIVOS.map(([k, n]) => <button key={k} onClick={() => motivo(k)}>{n}</button>)}</>}</span>}
    {l.decision === 'backlog' && !l.ocupada && idea.todoist_error && <button className={s.enlace} onClick={reintentar}>Reintentar</button>}
    {!l.ocupada && <button className={s.enlace} onClick={deshacer}><RotateCcw size={12} /> Deshacer</button>}
  </article>
}

function EnBacklog({ idea, l, regresar, reintentar }: { idea: IdeaBanco; l: Local | undefined; regresar: () => void; reintentar: () => void }) {
  const [brief, setBrief] = useState(false)
  const n = idea.titulo_elegido ?? 0
  const mini = miniaturaDe(idea, n)
  return <article className={s.enBacklog} data-testid="idea-backlog">
    <div className={s.enBacklogFila}>
      {mini && <span className={s.enBacklogMini}><Miniatura m={mini.m} clave={`${idea.id}:${mini.indice}`} tinta={tintaDe(idea.id, mini.indice)} titulo={idea.titulos[n]?.texto ?? idea.idea} /></span>}
      <p><strong>{idea.titulos[n]?.texto ?? idea.idea}</strong>
        <small>{idea.todoist?.id ? `Tarea en Todoist › ${idea.todoist.proyecto ?? 'YouTube'} · dile a Levy «escribe el guion de esta idea»` : idea.todoist_error ? `Sin tarea en Todoist: ${idea.todoist_error}` : 'Brief listo · dile a Levy «escribe el guion de esta idea»'}</small></p>
      {l?.ocupada ? <Loader2 size={13} className={s.gira} /> : <>
        {!idea.todoist?.id && idea.todoist_error && <button className={s.enlace} onClick={reintentar}>Crear la tarea</button>}
        <button className={s.enlace} onClick={() => setBrief(!brief)} aria-expanded={brief}>Brief <ChevronDown size={12} data-abierto={brief || undefined} /></button>
        <button className={s.enlace} onClick={regresar} title={idea.todoist?.id ? 'Regresa aquí; la tarea de Todoist se queda allá' : undefined}><RotateCcw size={12} /> Regresar</button>
      </>}
    </div>
    {brief && <Brief idea={idea} mini={mini?.m ?? null} />}
  </article>
}

// ── La miniatura: la real si ya existe; si no (o si no carga), el boceto ────

function Miniatura({ m, clave, tinta, variante = 0, titulo }: { m: MiniaturaIdea; clave: string; tinta: Tinta; variante?: number; titulo: string }) {
  const url = urlImagen(m)
  const [fallo, setFallo] = useState<string | null>(null)
  if (url && fallo !== url) return <img className={s.miniaturaImg} src={url} alt={`Miniatura de «${titulo}»: ${m.texto}`} loading="lazy" decoding="async" onError={() => setFallo(url)} data-testid="miniatura-real" />
  return <Boceto m={m} clave={clave} tinta={tinta} variante={variante} />
}

// ── El boceto de miniatura: se dibuja del contenido de ESA miniatura ─────────

const PALETA: Record<Tinta, [string, string, string]> = {
  oro: ['#f5c451', '#1d1608', '#0b0905'], violeta: ['#a995ff', '#191433', '#0a0816'], coral: ['#ff8f70', '#2b1410', '#110807'],
  verde: ['#5fe0a0', '#0c2219', '#06100c'], azul: ['#74b6ff', '#0e1d33', '#060c16'], ambar: ['#ffb24d', '#27190a', '#0f0a05'],
}

export function Boceto({ m, clave, tinta, variante = 0 }: { m: MiniaturaIdea; clave: string; tinta: Tinta; variante?: number }) {
  const [a, b1, b2] = PALETA[tinta]
  const lado = ladoDe(m, clave), escena = escenaDe(m)
  const sem = semilla(`${clave}|${m.texto}|${m.objeto ?? ''}`)
  const izq = lado === 'izq'
  const cx = izq ? 56 : 264, ox = izq ? 122 : 14, ow = 184
  const lineas = lineasVeredicto(m.texto.toUpperCase())
  const largo = Math.max(...lineas.map(x => x.length), 1)
  const cuerpo = Math.max(13, Math.min(lineas.length > 1 ? 25 : 30, ow / (0.63 * largo)))
  const gid = `b${sem.toString(36)}`
  const y0 = lineas.length > 1 ? 14 + cuerpo : 22 + cuerpo
  const oy = Math.min(84, y0 + (lineas.length > 1 ? cuerpo : 0) + 12), oh = 168 - oy
  return <svg className={s.bocetoSvg} viewBox="0 0 320 180" role="img" aria-label={`Boceto de miniatura: ${m.texto}${m.objeto ? `. Se ve: ${m.objeto}` : ''}`} data-escena={escena} data-variante={variante % 3} data-lado={lado} data-tinta={tinta}>
    <defs>
      <linearGradient id={`${gid}f`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={b1} /><stop offset="1" stopColor={b2} /></linearGradient>
      <radialGradient id={`${gid}l`} cx={izq ? 0.16 : 0.84} cy="0.62" r="0.6"><stop offset="0" stopColor={a} stopOpacity="0.4" /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient>
      <linearGradient id={`${gid}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3ede4" /><stop offset="1" stopColor="#b9ada0" /></linearGradient>
    </defs>
    <rect width="320" height="180" fill={`url(#${gid}f)`} /><rect width="320" height="180" fill={`url(#${gid}l)`} />
    {/* El dueño: el lugar de su cara y hombros (boceto, no retrato) */}
    <g>
      <path d={`M${cx - 50} 180 C${cx - 50} 138 ${cx - 28} 126 ${cx} 126 C${cx + 28} 126 ${cx + 50} 138 ${cx + 50} 180 Z`} fill={`url(#${gid}p)`} opacity="0.92" />
      <circle cx={cx} cy="94" r="27" fill={`url(#${gid}p)`} /><circle cx={cx} cy="94" r="31" fill="none" stroke={a} strokeWidth="2" opacity="0.85" />
    </g>
    <EscenaSvg tipo={escena} x={ox} y={oy} w={ow} h={oh} a={a} sem={sem} v={variante} />
    <text x={izq ? ox : ox + ow} y={y0} textAnchor={izq ? 'start' : 'end'} fontSize={cuerpo} fontWeight="900" fill="#fff" stroke="#000" strokeWidth={cuerpo / 6} strokeLinejoin="round" paintOrder="stroke" style={{ fontFamily: 'var(--font-sans, system-ui), "Helvetica Neue", Arial, sans-serif', letterSpacing: '-0.025em' }}>
      {lineas.map((t, i) => <tspan key={i} x={izq ? ox : ox + ow} dy={i ? cuerpo * 1.02 : 0} fill={i === lineas.length - 1 ? a : '#fff'}>{t}</tspan>)}
    </text>
  </svg>
}

function EscenaSvg({ tipo, x, y, w, h, a, sem, v }: { tipo: Escena; x: number; y: number; w: number; h: number; a: string; sem: number; v: number }) {
  const r = (i: number, min: number, max: number) => min + (((sem >>> (i * 3)) % 97) / 96) * (max - min)
  const marco = <rect x={x} y={y} width={w} height={h} rx="8" fill="#0b0e14" stroke="rgba(255,255,255,0.22)" />
  const tenue = 'rgba(255,255,255,0.32)'
  switch (tipo) {
    case 'terminal': {
      if (v % 2 === 1) {
        // forma 2: una orden grande y su resultado (un bloque), no un listado
        return <g>{marco}<rect x={x} y={y} width={w} height="15" rx="8" fill="rgba(255,255,255,0.08)" /><rect x={x + 10} y={y + 5.5} width={w * 0.3} height="4" rx="2" fill={tenue} />
          <text x={x + 12} y={y + 38} fontSize="15" fontWeight="800" fill={a} style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{'>'}_</text>
          <rect x={x + 40} y={y + 27} width={r(1, 0.35, 0.6) * (w - 54)} height="9" rx="3" fill="#fff" opacity="0.85" />
          <rect x={x + 12} y={y + 50} width={w - 24} height={Math.max(14, h - 60)} rx="5" fill={a} opacity="0.16" stroke={a} strokeOpacity="0.5" />
          {[0, 1].map(i => <rect key={i} x={x + 20} y={y + 57 + i * 9} width={r(i + 2, 0.4, 0.8) * (w - 44)} height="4" rx="2" fill={a} opacity="0.85" />)}</g>
      }
      const filas = Math.max(3, Math.floor((h - 24) / 11))
      const destacada = sem % filas
      return <g>{marco}{[0, 1, 2].map(i => <circle key={i} cx={x + 11 + i * 9} cy={y + 9} r="2.6" fill={['#ff5f57', '#febc2e', '#28c840'][i]} />)}
        {Array.from({ length: filas }, (_, i) => <g key={i}><rect x={x + 10} y={y + 20 + i * 11} width="5" height="4" rx="1" fill={a} opacity={i === destacada ? 1 : 0.55} />
          <rect x={x + 19} y={y + 20 + i * 11} width={r(i, 0.3, 0.82) * (w - 30)} height="4" rx="2" fill={i === destacada ? a : tenue} /></g>)}</g>
    }
    case 'archivo': {
      if (v % 3 === 1) {
        // forma 2: el archivo abierto en el editor (pestaña, números de línea, un bloque resaltado)
        const filas = Math.max(4, Math.floor((h - 26) / 10)), marcada = 1 + (sem % (filas - 2))
        return <g>{marco}<rect x={x + 8} y={y + 5} width={w * 0.36} height="11" rx="3" fill="rgba(255,255,255,0.14)" /><rect x={x + 13} y={y + 9} width={w * 0.24} height="3.5" rx="1.75" fill="#fff" opacity="0.8" />
          <rect x={x} y={y + 21 + marcada * 10} width={w} height="20" fill={a} opacity="0.2" />
          {Array.from({ length: filas }, (_, i) => <g key={i}><rect x={x + 8} y={y + 24 + i * 10} width="6" height="3.5" rx="1" fill="rgba(255,255,255,0.22)" />
            <rect x={x + 20 + (i % 3 === 1 ? 10 : 0)} y={y + 24 + i * 10} width={r(i, 0.25, 0.7) * (w - 40)} height="3.5" rx="1.75" fill={i === marcada || i === marcada + 1 ? a : tenue} /></g>)}</g>
      }
      if (v % 3 === 2) {
        // forma 3: dos hojas apiladas y un sello (el entregable ya hecho)
        const pw2 = w * 0.56, px2 = x + w * 0.12
        return <g><rect x={px2 + 22} y={y + 2} width={pw2} height={h - 8} rx="5" fill="#cfc8bc" transform={`rotate(5 ${px2 + 22 + pw2 / 2} ${y + h / 2})`} />
          <rect x={px2} y={y + 4} width={pw2} height={h - 6} rx="5" fill="#f5f1e8" /><rect x={px2 + 9} y={y + 13} width={pw2 * 0.5} height="6" rx="2" fill="#2a2420" />
          {Array.from({ length: Math.max(3, Math.floor((h - 34) / 10)) }, (_, i) => <rect key={i} x={px2 + 9} y={y + 27 + i * 10} width={r(i, 0.5, 0.9) * (pw2 - 18)} height="3.6" rx="1.8" fill="#6f665d" />)}
          <circle cx={px2 + pw2 + 14} cy={y + h - 26} r="17" fill={a} stroke="#0b0e14" strokeWidth="3" /><path d={`M${px2 + pw2 + 6} ${y + h - 26} l6 6 l10 -12`} stroke="#111" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
      }
      const pw = w * 0.64, px = x + (w - pw) / 2, filas = Math.max(4, Math.floor((h - 26) / 10)), t1 = 1 + (sem % (filas - 2)), t2 = (t1 + 2) % filas
      return <g transform={`rotate(${sem % 2 ? 2.5 : -2.5} ${x + w / 2} ${y + h / 2})`}><rect x={px} y={y} width={pw} height={h} rx="5" fill="#f5f1e8" /><rect x={px + 10} y={y + 9} width={pw * 0.45} height="6" rx="2" fill="#2a2420" />
        {Array.from({ length: filas }, (_, i) => { const lw = r(i, 0.5, 0.92) * (pw - 20); const tachada = i === t1 || i === t2; return <g key={i}><rect x={px + 10} y={y + 23 + i * 10} width={lw} height="3.6" rx="1.8" fill={tachada ? '#b8afa3' : '#6f665d'} />
          {tachada && <rect x={px + 7} y={y + 24 + i * 10} width={lw + 6} height="1.8" fill="#e5484d" />}</g> })}
        <rect x={px + pw - 26} y={y + 7} width="16" height="9" rx="2" fill={a} /></g>
    }
    case 'versus': {
      if (v % 2 === 1) {
        // forma 2: antes → después (uno apagado y chico, el otro encendido), con flecha
        const aw = w * 0.34, bw2 = w * 0.48
        return <g><rect x={x} y={y + h * 0.18} width={aw} height={h * 0.64} rx="6" fill="#0b0e14" stroke="rgba(255,255,255,0.2)" />
          {[0, 1, 2].map(i => <rect key={i} x={x + 8} y={y + h * 0.18 + 10 + i * 10} width={r(i, 0.4, 0.8) * (aw - 16)} height="4" rx="2" fill={tenue} />)}
          <path d={`M${x + aw + 6} ${y + h / 2} h${w - aw - bw2 - 16} m-6 -6 l6 6 l-6 6`} stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x={x + w - bw2} y={y} width={bw2} height={h} rx="7" fill="#0b0e14" stroke={a} strokeWidth="1.8" />
          <rect x={x + w - bw2 + 9} y={y + 9} width={bw2 - 18} height={h * 0.3} rx="4" fill={a} opacity="0.9" />
          {[0, 1, 2].map(i => <rect key={`d${i}`} x={x + w - bw2 + 9} y={y + h * 0.3 + 18 + i * 10} width={r(i + 3, 0.45, 0.9) * (bw2 - 18)} height="4" rx="2" fill={a} opacity={0.75 - i * 0.15} />)}</g>
      }
      const mw = (w - 10) / 2
      return <g>{[0, 1].map(k => <g key={k}><rect x={x + k * (mw + 10)} y={y} width={mw} height={h} rx="7" fill="#0b0e14" stroke={k ? a : 'rgba(255,255,255,0.22)'} strokeWidth={k ? 1.6 : 1} />
        {Array.from({ length: Math.max(3, Math.floor((h - 16) / 11)) }, (_, i) => <rect key={i} x={x + k * (mw + 10) + 9} y={y + 11 + i * 11} width={r(i + k * 4, 0.35, 0.85) * (mw - 18)} height="4" rx="2" fill={k ? a : tenue} opacity={k ? 0.9 - i * 0.08 : 1} />)}</g>)}
        <circle cx={x + w / 2} cy={y + h / 2} r="13" fill="#fff" /><text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="#111">VS</text></g>
    }
    case 'grafica': {
      const n = 7, pts = Array.from({ length: n }, (_, i) => [x + 12 + (i * (w - 24)) / (n - 1), y + h - 12 - ((i / (n - 1)) ** 1.7) * (h - 30) - r(i, -5, 5) * (i > 0 && i < n - 1 ? 1 : 0)] as const)
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
      return <g>{marco}{[0.33, 0.66].map(f => <line key={f} x1={x + 8} x2={x + w - 8} y1={y + h * f} y2={y + h * f} stroke="rgba(255,255,255,0.1)" />)}
        <path d={`${d} L${x + w - 12} ${y + h - 8} L${x + 12} ${y + h - 8} Z`} fill={a} opacity="0.16" /><path d={d} fill="none" stroke={a} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="5" fill="#fff" stroke={a} strokeWidth="2.5" /></g>
    }
    case 'chat': {
      const bh = Math.min(20, (h - 16) / 3 - 4)
      return <g>{[0, 1, 2].map(i => { const mio = i === 1, bw = r(i, 0.45, 0.72) * w; return <rect key={i} x={mio ? x + w - bw : x} y={y + 4 + i * (bh + 7)} width={bw} height={bh} rx={bh / 2} fill={mio ? a : '#1b2029'} stroke={mio ? 'none' : 'rgba(255,255,255,0.2)'} /> })}
        {[0, 1, 2].map(i => { const mio = i === 1, bw = r(i, 0.45, 0.72) * w; return <rect key={`t${i}`} x={(mio ? x + w - bw : x) + 10} y={y + 4 + i * (bh + 7) + bh / 2 - 2} width={bw - 22} height="4" rx="2" fill={mio ? 'rgba(0,0,0,0.5)' : tenue} /> })}</g>
    }
    case 'video': {
      const vh = h - 22
      return <g><rect x={x} y={y} width={w} height={vh} rx="7" fill="#0b0e14" stroke="rgba(255,255,255,0.22)" /><circle cx={x + w / 2} cy={y + vh / 2} r={Math.min(15, vh / 3)} fill={a} />
        <path d={`M${x + w / 2 - 4} ${y + vh / 2 - 6} L${x + w / 2 + 7} ${y + vh / 2} L${x + w / 2 - 4} ${y + vh / 2 + 6} Z`} fill="#111" />
        {(() => { let px = x; return Array.from({ length: 6 }, (_, i) => { const bw = r(i, 0.1, 0.24) * w; const el = px + bw <= x + w ? <rect key={i} x={px} y={y + vh + 8} width={bw - 3} height="10" rx="2.5" fill={i === sem % 6 ? a : tenue} /> : null; px += bw; return el }) })()}</g>
    }
    case 'lista': {
      const filas = Math.max(3, Math.min(5, Math.floor((h - 10) / 17))), mala = sem % filas
      return <g>{marco}{Array.from({ length: filas }, (_, i) => <g key={i}><rect x={x + 10} y={y + 9 + i * 17} width="10" height="10" rx="2.5" fill={i === mala ? '#e5484d' : a} />
        <path d={i === mala ? `M${x + 12.5} ${y + 11.5 + i * 17} l5 5 m0 -5 l-5 5` : `M${x + 12} ${y + 14 + i * 17} l2.4 2.6 l4 -5`} stroke="#111" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <rect x={x + 27} y={y + 12 + i * 17} width={r(i, 0.4, 0.85) * (w - 40)} height="4" rx="2" fill={i === mala ? 'rgba(255,255,255,0.2)' : tenue} /></g>)}</g>
    }
    case 'persona': {
      const px = x + w * 0.3
      return <g>{marco}<circle cx={px} cy={y + h * 0.4} r={h * 0.2} fill="#3a4150" /><path d={`M${px - h * 0.36} ${y + h} C${px - h * 0.36} ${y + h * 0.66} ${px + h * 0.36} ${y + h * 0.66} ${px + h * 0.36} ${y + h} Z`} fill="#3a4150" />
        <rect x={x + w * 0.56} y={y + 12} width={w * 0.38} height={h * 0.42} rx="8" fill={a} />{[0, 1].map(i => <rect key={i} x={x + w * 0.56 + 9} y={y + 22 + i * 10} width={w * 0.38 - 18 - i * 14} height="4" rx="2" fill="rgba(0,0,0,0.5)" />)}</g>
    }
    default: {
      if (v % 2 === 1) {
        // forma 2 del panel: tablero de columnas con tarjetas (quién hace qué), no cifras
        const cw = (w - 20 - 12) / 3
        return <g>{marco}{[0, 1, 2].map(c => <g key={c}><rect x={x + 10 + c * (cw + 6)} y={y + 8} width={cw * 0.55} height="4" rx="2" fill={tenue} />
          {Array.from({ length: 1 + ((sem >>> (c * 2)) % 3) }, (_, i) => { const mia = c === sem % 3 && i === 0; return <rect key={i} x={x + 10 + c * (cw + 6)} y={y + 18 + i * ((h - 30) / 3)} width={cw} height={(h - 30) / 3 - 5} rx="4" fill={mia ? a : '#1b2029'} stroke={mia ? 'none' : 'rgba(255,255,255,0.16)'} /> })}</g>)}</g>
      }
      const bw = (w - 20 - 12) / 3, n = 6, bx = (w - 20) / n
      return <g>{marco}{[0, 1, 2].map(i => <g key={i}><rect x={x + 10 + i * (bw + 6)} y={y + 9} width={bw} height={Math.min(24, h * 0.3)} rx="5" fill={i === sem % 3 ? a : '#1b2029'} opacity={i === sem % 3 ? 0.95 : 1} />
        <rect x={x + 16 + i * (bw + 6)} y={y + 15} width={bw * 0.5} height="4" rx="2" fill={i === sem % 3 ? 'rgba(0,0,0,0.55)' : tenue} /></g>)}
        {Array.from({ length: n }, (_, i) => { const bh = r(i, 0.2, 1) * (h - Math.min(24, h * 0.3) - 30); return <rect key={`b${i}`} x={x + 10 + i * bx + 2} y={y + h - 9 - bh} width={bx - 5} height={bh} rx="2.5" fill={i === n - 1 ? a : tenue} /> })}</g>
    }
  }
}
