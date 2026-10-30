'use client'
/**
 * Memoria y contexto (4 oct 2026, Daniel: «Debería poder ver mis memorias en algún punto de esta interfaz. Quiero
 * saber qué acumulas de mí como contexto cada que tenemos una conversación. Igual entiende las reglas de cómo luce
 * el system prompt y todo lo que entra en la ventana de contexto del proveedor que tenemos.»).
 *
 *  · «Lo que sé de ti»: toda `.claude/memory/` por capa, con buscador, fecha del último commit y lectura. Solo
 *    lectura: escribir memoria es de Levy (memory-manager); «Corregir esto» deja la cita en la caja del chat.
 *  · «Lo que entra en la ventana»: la barra de la ventana con sus capas apiladas y «qué se mandó en tu último
 *    mensaje». Todo medido o contado por el SDK; lo calculado dice «por diferencia» o «estimado».
 * Desde el 5 oct 2026 vive en Taller › Memoria (fuera del «+»; /memoria redirige ahí), fundida con los archivos del cerebro.
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Lock, PenLine, RefreshCw, Search } from 'lucide-react'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { releer, useFuente } from '../datos'
import { useConversacionActiva, useTituloConversacion } from '../conversaciones'
import { escalon } from '../movimiento'
import l from '../luz.module.css'
import m from './memoria.module.css'
import {
  CAPAS_MEMORIA, capas, diferidas, estimar, filtrar, fmtPct, fmtTokens, pct,
  type Anatomia, type ArchivoMemoria, type Capa, type FotoMemoria, type Segmento,
} from './contexto-capas'

export const URL_MEMORIA = '/api/cabina/memoria'
export const urlContexto = (conversacion?: string | null, medir?: boolean) =>
  `/api/cabina/contexto${conversacion || medir ? '?' : ''}${conversacion ? `conversacion=${encodeURIComponent(conversacion)}` : ''}${conversacion && medir ? '&' : ''}${medir ? 'medir=1' : ''}`

type Pestana = 'memoria' | 'ventana'
const LLAVE = 'arbrain:memoria:pestana'

const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: '2-digit' }) : 'sin commit'
const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const miles = (n: number) => n.toLocaleString('es-MX')

/** Deja un texto en la caja del chat sin enviarlo (Daniel termina la corrección con sus palabras). */
function redactar(texto: string) {
  if (window.location.pathname.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto } })); return }
  try { sessionStorage.setItem('cabina:redactar', texto) } catch { /* modo privado */ }
  window.location.assign('/chat')
}

export function VistaMemoria({ grande, pestana: inicial }: { grande?: boolean; pestana?: Pestana }) {
  const [pestana, setPestana] = useState<Pestana>(() => {
    if (inicial) return inicial
    try { return (localStorage.getItem(LLAVE) as Pestana) || 'memoria' } catch { return 'memoria' }
  })
  const cambiar = (p: Pestana) => { setPestana(p); try { localStorage.setItem(LLAVE, p) } catch { /* sin almacenamiento */ } }
  return <div className={m.vista} data-grande={grande || undefined}>
    {!grande && <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>Memoria y contexto · <b>lo que sé de ti y lo que entra en cada conversación</b></p>}
    <div className={m.pestanas} role="tablist" aria-label="Qué ver">
      <button role="tab" aria-selected={pestana === 'memoria'} onClick={() => cambiar('memoria')}>Lo que sé de ti</button>
      <button role="tab" aria-selected={pestana === 'ventana'} onClick={() => cambiar('ventana')}>Lo que entra en la ventana</button>
    </div>
    {pestana === 'memoria' ? <Memoria grande={grande} /> : <Ventana grande={grande} />}
  </div>
}

// ───────────────────────── A · la memoria ─────────────────────────

/** «Lo que sé de ti»: también la pinta el Taller › Memoria (5 oct 2026). */
export function Memoria({ grande }: { grande?: boolean }) {
  const { data, error } = useFuente<FotoMemoria>(URL_MEMORIA)
  const [q, setQ] = useState('')
  const [capa, setCapa] = useState<Capa | 'todo'>('todo')
  const [abierta, setAbierta] = useState<ArchivoMemoria | null>(null)
  const [tope, setTope] = useState(40)
  const lista = useMemo(() => data ? filtrar(data.archivos, q, capa) : [], [data, q, capa])
  if (!data) return <div className={m.cargando} aria-busy="true">{error ? <p className={l.aviso}>{error}</p> : 'Leyendo tu memoria…'}</div>
  if (abierta) return <Lector archivo={abierta} volver={() => setAbierta(null)} />
  const cuenta = (c: Capa) => data.archivos.filter(f => f.capa === c).length
  const enIndice = data.archivos.filter(f => f.indice === 'indice' || f.indice === 'user').length
  const rotadas = data.archivos.filter(f => f.indice === 'archivo').length
  return <>
    <ol className={`${m.capasMemoria} ${l.entra}`} style={escalon(1)}>
      <li><b>Esencia · siempre.</b> <code>MEMORY.md</code> entra en todas las conversaciones, junto a <code>CLAUDE.md</code> y tu agenda.</li>
      <li><b>Índice · lo usa el recall.</b> {enIndice} memorias tienen una línea con disparadores; si tu mensaje toca uno, esa línea se inyecta.</li>
      <li><b>Archivo · a demanda.</b> El detalle completo solo entra cuando abro el archivo{rotadas ? `; ${rotadas} viejas están rotadas a MEMORY-archivo.md` : ''}.</li>
    </ol>
    <label className={m.buscar}><Search size={14} aria-hidden /><input value={q} onChange={e => { setQ(e.target.value); setTope(40) }} placeholder={`Buscar en ${data.archivos.length} memorias`} aria-label="Buscar en la memoria" /></label>
    <div className={m.chips} role="group" aria-label="Filtrar por tipo">
      <button aria-pressed={capa === 'todo'} onClick={() => setCapa('todo')}>Todo <small>{data.archivos.length}</small></button>
      {CAPAS_MEMORIA.map(c => <button key={c.id} aria-pressed={capa === c.id} onClick={() => { setCapa(c.id); setTope(40) }} title={c.nota}>{c.nombre} <small>{cuenta(c.id)}</small></button>)}
    </div>
    {capa !== 'todo' && <p className={l.fuente}>{CAPAS_MEMORIA.find(c => c.id === capa)?.nota}.</p>}
    {lista.length === 0 ? <p className={l.vacio}>Nada coincide con «{q}».</p> : <ul className={m.archivos}>
      {lista.slice(0, tope).map(f => <li key={f.ruta}>
        <button className={m.archivo} onClick={() => setAbierta(f)}>
          <span className={m.archivoTitulo}>{f.oculto && <Lock size={12} aria-label="contenido oculto" />}{f.titulo}</span>
          {f.descripcion && <span className={m.archivoDesc}>{f.descripcion}</span>}
          <span className={m.archivoMeta}>{CAPAS_MEMORIA.find(c => c.id === f.capa)?.nombre} · {fecha(f.fecha)}{f.indice === 'archivo' ? ' · rotada' : !f.indice && f.capa !== 'esencia' && f.capa !== 'indice' ? ' · sin línea en el índice' : ''}{grande ? <> · <code>{f.ruta}</code></> : null}</span>
        </button>
      </li>)}
    </ul>}
    {lista.length > tope && <button className={m.mas} onClick={() => setTope(t => t + 80)}>Ver {Math.min(80, lista.length - tope)} más de {lista.length - tope}</button>}
    <p className={l.fuente}>Lee <code>.claude/memory/</code> del Studio en vivo; la fecha es el último commit de cada archivo. Solo lectura: la memoria la escribo yo cuando me lo pides (o el hipocampo de noche, que solo crea). Las credenciales nunca se muestran.</p>
  </>
}

function Lector({ archivo, volver }: { archivo: ArchivoMemoria; volver: () => void }) {
  const { data, error } = useFuente<{ ruta: string; texto: string; oculto: boolean; bytes: number }>(`${URL_MEMORIA}?leer=${encodeURIComponent(archivo.ruta)}`)
  return <div className={m.lector}>
    <div className={m.lectorBarra}>
      <button onClick={volver}><ArrowLeft size={14} aria-hidden />Memoria</button>
      {!archivo.oculto && <button onClick={() => redactar(`Sobre la memoria \`.claude/memory/${archivo.ruta}\` («${archivo.titulo}»): `)} title="Deja la cita en la caja del chat para que escribas qué está mal"><PenLine size={14} aria-hidden />Corregir esto</button>}
    </div>
    <p className={m.lectorMeta}><code>{archivo.ruta}</code> · {fecha(archivo.fecha)} · {miles(archivo.bytes)} bytes</p>
    {archivo.triggers.length > 0 && <p className={m.lectorMeta}>Se recuerda cuando dices: {archivo.triggers.join(', ')}</p>}
    {!data ? <div className={m.cargando}>{error ? <p className={l.aviso}>{error}</p> : 'Abriendo…'}</div>
      : data.oculto ? <p className={m.oculto}><Lock size={14} aria-hidden />Contenido oculto: guarda credenciales. Aquí solo se ve el nombre.</p>
      : <div className={m.texto}><MarkdownMessage content={data.texto} /></div>}
  </div>
}

// ───────────────────────── B · la ventana ─────────────────────────

const COLOR: Record<Segmento['id'], string> = {
  proveedor: 'var(--muted)', memoria: 'rgb(var(--gold-rgb))', skills: 'var(--l-tinta-azul, var(--info, #6aa5ff))', mcp: 'var(--l-tinta-morado, #a78bfa)',
  historial: 'var(--success)', reserva: 'transparent', libre: 'transparent',
}

/** «Lo que entra en la ventana»: también la pinta el Taller › Memoria (5 oct 2026). */
export function Ventana({ grande }: { grande?: boolean }) {
  const activa = useConversacionActiva()
  const url = urlContexto(activa)
  const { data, error } = useFuente<Anatomia>(url, 60_000)
  const [midiendo, setMidiendo] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  if (!data) return <div className={m.cargando} aria-busy="true">{error ? <p className={l.aviso}>{error}</p> : 'Midiendo la ventana… (la primera vez tarda unos segundos)'}</div>
  const medir = async () => {
    setMidiendo(true); setFallo(null)
    try {
      const r = await fetch(urlContexto(activa, true), { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `respondió ${r.status}`)
      await releer(url)
    } catch (e) { setFallo(e instanceof Error ? e.message : 'no se pudo medir') } finally { setMidiendo(false) }
  }
  const { ventana, usado, fuenteUsado, segmentos } = capas(data)
  const c = data.conversacion
  const d = data.desglose?.datos
  const dif = diferidas(data)
  return <>
    <Conversacion id={c?.id ?? null} activa={activa} />
    <div className={`${m.heroe} ${l.entra}`} style={escalon(1)}>
      <p className={`${l.serif} ${m.titular}`}>{ventana ? <>Esta conversación ocupa <b>{fmtTokens(usado)}</b> de {fmtTokens(ventana)}</> : <>Esta conversación ocupa <b>{fmtTokens(usado)}</b> tokens</>}</p>
      <p className={m.sub}>{ventana ? `${fmtPct(usado, ventana)} de la ventana · ` : ''}{data.ventana.modelo ?? c?.modelo ?? 'modelo sin dato'}{c ? ` · ${c.turnos} mensajes tuyos · ${c.llamadas} llamadas al modelo` : ''}{c?.compactaciones.length ? ` · compactada ${c.compactaciones.length} ${c.compactaciones.length === 1 ? 'vez' : 'veces'}` : ' · sin compactar'}</p>
      <Barra segmentos={segmentos} ventana={ventana ?? usado} />
      <ul className={m.leyenda}>{segmentos.filter(s => s.id !== 'libre' || ventana).map(s => <li key={s.id}>
        <i style={{ background: COLOR[s.id] }} data-id={s.id} aria-hidden />
        <span className={m.leyendaNombre}>{s.nombre}</span>
        <span className={m.leyendaCifra}>{fmtTokens(s.tokens)} <small>{fmtPct(s.tokens, ventana)}</small></span>
        <span className={m.fuenteTag} data-fuente={s.fuente}>{s.fuente}</span>
      </li>)}</ul>
      <p className={l.fuente}>Lo usado sale de la última llamada al modelo ({fuenteUsado}: entrada + caché creada + caché leída{c?.ultima ? `, ${hora(c.ultima.en)}` : ''}).</p>
    </div>

    {c?.ultimoTurno && <UltimoMensaje a={data} />}

    <section aria-label="Las capas">
      <div className={l.seccion}><h4>Qué entra, de lo fijo a lo que crece</h4></div>
      <ol className={m.capas}>
        <Capa n={1} titulo="System prompt del proveedor" cifra={segmentos[0]} grande={grande}>
          <p>Lo escribe Anthropic (Claude Code / Agent SDK), no nosotros: quién es el agente, cómo usa herramientas, el entorno. Va primero en cada llamada.</p>
          {d?.secciones?.length ? <Detalle resumen={`${d.secciones.length} secciones contadas por el SDK`}>{d.secciones.map(x => <Fila key={x.nombre} nombre={x.nombre} tokens={x.tokens} />)}</Detalle> : null}
          {d?.herramientasSistema?.length ? <Detalle resumen={`${d.herramientasSistema.length} herramientas internas`}>{d.herramientasSistema.map(x => <Fila key={x.nombre} nombre={x.nombre} tokens={x.tokens} />)}</Detalle> : null}
        </Capa>
        <Capa n={2} titulo="CLAUDE.md y sus imports" cifra={segmentos[1]} grande={grande}>
          <p>Las reglas que gobiernan siempre, más <code>@MEMORY.md</code> (la esencia de mi memoria sobre ti) y <code>@now.md</code> (tu agenda generada).</p>
          {d?.memoria.map(f => <Fila key={f.ruta} nombre={f.ruta} tokens={f.tokens} extra={(() => { const a = data.archivos.find(x => f.ruta.endsWith(x.ruta)); return a ? `${miles(a.caracteres)} car.` : undefined })()} />)}
        </Capa>
        <Capa n={3} titulo="Skills y herramientas" cifra={{ ...segmentos[2], tokens: segmentos[2].tokens + segmentos[3].tokens }} grande={grande}>
          <p>De cada skill entra solo su nombre y descripción ({d?.skills.length ?? '—'} skills); el cuerpo se lee cuando la uso. De las herramientas MCP entran las que ya están cargadas.</p>
          {dif > 0 && <p className={m.nota}>Otras {fmtTokens(dif)} de herramientas existen pero <b>no entran</b>: quedan diferidas hasta que las busco (ToolSearch).</p>}
          {d?.skills.length ? <Detalle resumen={`Skills · ${fmtTokens(segmentos[2].tokens)}`}>{d.skills.slice(0, 80).map(x => <Fila key={x.nombre + x.origen} nombre={x.nombre} tokens={x.tokens} extra={x.origen === 'projectSettings' ? 'tuya' : x.origen === 'userSettings' ? 'usuario' : x.origen} />)}</Detalle> : null}
          {d?.mcp.length ? <Detalle resumen={`Servidores MCP · ${d.mcp.length}`}>{d.mcp.map(x => <Fila key={x.servidor} nombre={x.servidor.replace(/^claude_ai_/, '').replace(/_/g, ' ')} tokens={x.tokens} extra={`${x.herramientas} herr.`} />)}</Detalle> : null}
        </Capa>
        <Capa n={4} titulo="Lo que se inyecta en cada mensaje" cifra={c?.inyeccion ? { id: 'historial', nombre: '', tokens: estimar(c.inyeccion.caracteres, data.tokensPorCaracter), fuente: 'estimado', nota: '' } : null} grande={grande}>
          <p>Antes de que yo lea tu mensaje, el hook <code>UserPromptSubmit</code> (<code>memory-recall.py</code>) le pega: rutas por intención, las memorias cuyo disparador tocaste y la agenda del turno. Se queda en el historial.</p>
          <Detalle resumen={`Ganchos configurados · ${data.ganchos.length}`}>{data.ganchos.map((g, i) => <p key={i} className={m.gancho}><b>{g.evento}</b> <code>{g.comando}</code></p>)}</Detalle>
        </Capa>
        <Capa n={5} titulo="El historial de esta conversación" cifra={segmentos[4]} grande={grande}>
          <p>Cada mensaje tuyo, mi respuesta, lo que leen las herramientas y lo inyectado. Crece con cada turno; al acercarse a la reserva, el SDK lo resume (compacta) y sigue.</p>
          {d?.mensajes && <Detalle resumen="De qué está hecho (contado por el SDK)">
            <Fila nombre="Resultados de herramientas" tokens={d.mensajes.resultados} /><Fila nombre="Llamadas a herramientas" tokens={d.mensajes.llamadas} />
            <Fila nombre="Mis respuestas" tokens={d.mensajes.asistente} /><Fila nombre="Tus mensajes" tokens={d.mensajes.usuario} />
            <Fila nombre="Adjuntos e inyecciones" tokens={d.mensajes.adjuntos} />
            {d.mensajes.adjuntosPorTipo.slice(0, 8).map(x => <Fila key={x.nombre} nombre={`· ${x.nombre}`} tokens={x.tokens} />)}
          </Detalle>}
          {c?.compactaciones.map((k, i) => <p key={i} className={m.nota}>Compactada {hora(k.en)} ({k.disparo === 'manual' ? 'a mano' : 'sola'}): {k.antes != null ? fmtTokens(k.antes) : '—'} → {k.despues != null ? fmtTokens(k.despues) : '—'}.</p>)}
        </Capa>
      </ol>
    </section>

    {(error || fallo) && <p className={l.aviso}>{fallo ? `No pude medir: ${fallo}.` : `${error} Se muestra la última medición.`}</p>}
    <p className={l.fuente}>
      {data.desglose ? <>Desglose por capa: {data.desglose.fuente === 'turno' ? 'getContextUsage del SDK guardado en un turno de esta conversación' : '/context del SDK en una sesión vacía con la misma configuración del proyecto (aún no hay desglose guardado de esta conversación)'} ({hora(data.desglose.en)}). </> : 'Sin desglose por capa todavía. '}
      Totales: usage de cada llamada en el transcript del SDK. Ventana: {data.ventana.fuente}. Lo «estimado» usa la razón tokens/carácter que el SDK midió en CLAUDE.md{data.tokensPorCaracter ? ` (${data.tokensPorCaracter.toFixed(2)})` : ''}.
      <button className={m.medir} onClick={medir} disabled={midiendo} aria-busy={midiendo}><RefreshCw size={12} aria-hidden className={midiendo ? m.gira : undefined} />{midiendo ? 'Midiendo…' : 'Medir ahora'}</button>
    </p>
  </>
}

function Conversacion({ id, activa }: { id: string | null; activa: string | null }) {
  const titulo = useTituloConversacion(id ?? '')
  if (!id) return <p className={l.aviso}>Aún no hay una conversación de Arbrain medida: abre una en el chat.</p>
  return <p className={m.conversacion}>{activa ? 'Esta conversación' : 'La conversación más reciente'} · <b>{titulo}</b></p>
}

function Barra({ segmentos, ventana }: { segmentos: Segmento[]; ventana: number }) {
  return <div className={m.barra} role="img" aria-label={segmentos.map(s => `${s.nombre}: ${fmtTokens(s.tokens)}`).join('; ')}>
    {segmentos.filter(s => s.tokens > 0).map(s => <span key={s.id} data-id={s.id} title={`${s.nombre}: ${fmtTokens(s.tokens)} (${s.fuente})`}
      style={{ width: `${Math.max(pct(s.tokens, ventana), s.id === 'libre' || s.id === 'reserva' ? 0 : 0.6)}%`, background: COLOR[s.id] }} />)}
  </div>
}

function UltimoMensaje({ a }: { a: Anatomia }) {
  const t = a.conversacion!.ultimoTurno!
  const iny = a.conversacion!.inyeccion
  const p = t.primera
  return <section aria-label="Tu último mensaje" className={m.ultimo}>
    <div className={l.seccion}><h4>Qué se mandó en tu último mensaje</h4><small>{hora(t.en)}</small></div>
    <ul className={m.mandado}>
      <li><span>Tu mensaje</span><b>{miles(t.caracteres)} car.</b><small>≈ {fmtTokens(estimar(t.caracteres, a.tokensPorCaracter))} tokens · estimado</small></li>
      {iny && <li><span>Inyectado por el hook</span><b>{miles(iny.caracteres)} car.</b><small>≈ {fmtTokens(estimar(iny.caracteres, a.tokensPorCaracter))} tokens · estimado · {iny.partes.map(x => `${x.nombre.toLowerCase()} ${miles(x.caracteres)}`).join(' · ')}</small></li>}
      {p && <li><span>Releído de caché</span><b>{fmtTokens(p.uso.cacheLectura)}</b><small>todo lo anterior, sin volver a procesarlo · medido</small></li>}
      {p && <li><span>Nuevo en esta llamada</span><b>{fmtTokens(p.uso.cacheCreacion + p.uso.input)}</b><small>mi respuesta anterior + tu mensaje + la inyección · medido</small></li>}
      {p && <li><span>Total que vio el modelo</span><b>{fmtTokens(p.total)}</b><small>{t.llamadas > 2 ? `y ${t.llamadas - 1} llamadas más con herramientas en ese turno` : t.llamadas === 2 ? 'y una llamada más con herramientas en ese turno' : 'una sola llamada en ese turno'} · medido</small></li>}
    </ul>
    {iny && <details className={m.inyectado}><summary><ChevronRight size={12} aria-hidden />Ver el bloque inyectado tal cual</summary><pre>{iny.texto}</pre></details>}
  </section>
}

function Capa({ n, titulo, cifra, children, grande }: { n: number; titulo: string; cifra: Segmento | null; children: React.ReactNode; grande?: boolean }) {
  return <li className={m.capa} data-grande={grande || undefined}>
    <div className={m.capaCab}><span className={m.capaN}>{n}</span><h5>{titulo}</h5>{cifra && <span className={m.capaCifra}>{fmtTokens(cifra.tokens)} <span className={m.fuenteTag} data-fuente={cifra.fuente}>{cifra.fuente}</span></span>}</div>
    <div className={m.capaCuerpo}>{children}</div>
  </li>
}

function Detalle({ resumen, children }: { resumen: string; children: React.ReactNode }) {
  return <details className={m.detalle}><summary><ChevronRight size={12} aria-hidden />{resumen}</summary><div>{children}</div></details>
}

function Fila({ nombre, tokens, extra }: { nombre: string; tokens: number; extra?: string }) {
  return <p className={m.fila}><span>{nombre}</span>{extra && <small>{extra}</small>}<b>{fmtTokens(tokens)}</b></p>
}

export function resumenMemoria(d: FotoMemoria | undefined) {
  return d ? `${d.archivos.length} memorias` : null
}
