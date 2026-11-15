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
import { zonaDueno } from '@/shared/lib/zona-dueno'
import { localeIntl, tr, trn, trNodos } from '@/shared/i18n'

export const URL_MEMORIA = '/api/cabina/memoria'
export const urlContexto = (conversacion?: string | null, medir?: boolean) =>
  `/api/cabina/contexto${conversacion || medir ? '?' : ''}${conversacion ? `conversacion=${encodeURIComponent(conversacion)}` : ''}${conversacion && medir ? '&' : ''}${medir ? 'medir=1' : ''}`

type Pestana = 'memoria' | 'ventana'
const LLAVE = 'arbrain:memoria:pestana'

const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(localeIntl(), { timeZone: zonaDueno(), day: 'numeric', month: 'short', year: '2-digit' }) : tr('sin commit')
const hora = (iso: string) => new Date(iso).toLocaleString(localeIntl(), { timeZone: zonaDueno(), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const miles = (n: number) => n.toLocaleString(localeIntl())

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
    {!grande && <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>{trNodos('Memoria y contexto · {detalle}', { detalle: <b>{tr('lo que sé de ti y lo que entra en cada conversación')}</b> })}</p>}
    <div className={m.pestanas} role="tablist" aria-label={tr('Qué ver')}>
      <button role="tab" aria-selected={pestana === 'memoria'} onClick={() => cambiar('memoria')}>{tr('Lo que sé de ti')}</button>
      <button role="tab" aria-selected={pestana === 'ventana'} onClick={() => cambiar('ventana')}>{tr('Lo que entra en la ventana')}</button>
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
  if (!data) return <div className={m.cargando} aria-busy="true">{error ? <p className={l.aviso}>{error}</p> : tr('Leyendo tu memoria…')}</div>
  if (abierta) return <Lector archivo={abierta} volver={() => setAbierta(null)} />
  const cuenta = (c: Capa) => data.archivos.filter(f => f.capa === c).length
  const enIndice = data.archivos.filter(f => f.indice === 'indice' || f.indice === 'user').length
  const rotadas = data.archivos.filter(f => f.indice === 'archivo').length
  return <>
    <ol className={`${m.capasMemoria} ${l.entra}`} style={escalon(1)}>
      <li><b>{tr('Esencia · siempre.')}</b> {trNodos('{memory} entra en todas las conversaciones, junto a {claude} y tu agenda.', { memory: <code>MEMORY.md</code>, claude: <code>CLAUDE.md</code> })}</li>
      <li><b>{tr('Índice · lo usa el recall.')}</b> {tr('{n} memorias tienen una línea con disparadores; si tu mensaje toca uno, esa línea se inyecta.', { n: enIndice })}</li>
      <li><b>{tr('Archivo · a demanda.')}</b> {rotadas ? tr('El detalle completo solo entra cuando abro el archivo; {n} viejas están rotadas a MEMORY-archivo.md.', { n: rotadas }) : tr('El detalle completo solo entra cuando abro el archivo.')}</li>
    </ol>
    <label className={m.buscar}><Search size={14} aria-hidden /><input value={q} onChange={e => { setQ(e.target.value); setTope(40) }} placeholder={tr('Buscar en {n} memorias', { n: data.archivos.length })} aria-label={tr('Buscar en la memoria')} /></label>
    <div className={m.chips} role="group" aria-label={tr('Filtrar por tipo')}>
      <button aria-pressed={capa === 'todo'} onClick={() => setCapa('todo')}>{tr('Todo')} <small>{data.archivos.length}</small></button>
      {CAPAS_MEMORIA.map(c => <button key={c.id} aria-pressed={capa === c.id} onClick={() => { setCapa(c.id); setTope(40) }} title={tr(c.nota)}>{tr(c.nombre)} <small>{cuenta(c.id)}</small></button>)}
    </div>
    {capa !== 'todo' && <p className={l.fuente}>{tr(CAPAS_MEMORIA.find(c => c.id === capa)?.nota ?? '')}.</p>}
    {lista.length === 0 ? <p className={l.vacio}>{tr('Nada coincide con «{consulta}».', { consulta: q })}</p> : <ul className={m.archivos}>
      {lista.slice(0, tope).map(f => <li key={f.ruta}>
        <button className={m.archivo} onClick={() => setAbierta(f)}>
          <span className={m.archivoTitulo}>{f.oculto && <Lock size={12} aria-label={tr('contenido oculto')} />}{f.titulo}</span>
          {f.descripcion && <span className={m.archivoDesc}>{f.descripcion}</span>}
          <span className={m.archivoMeta}>{tr(CAPAS_MEMORIA.find(c => c.id === f.capa)?.nombre ?? '')} · {fecha(f.fecha)}{f.indice === 'archivo' ? ` · ${tr('rotada')}` : !f.indice && f.capa !== 'esencia' && f.capa !== 'indice' ? ` · ${tr('sin línea en el índice')}` : ''}{grande ? <> · <code>{f.ruta}</code></> : null}</span>
        </button>
      </li>)}
    </ul>}
    {lista.length > tope && <button className={m.mas} onClick={() => setTope(t => t + 80)}>{tr('Ver {n} más de {total}', { n: Math.min(80, lista.length - tope), total: lista.length - tope })}</button>}
    <p className={l.fuente}>{trNodos('Lee {ruta} del Studio en vivo; la fecha es el último commit de cada archivo. Solo lectura: la memoria la escribo yo cuando me lo pides (o el hipocampo de noche, que solo crea). Las credenciales nunca se muestran.', { ruta: <code>.claude/memory/</code> })}</p>
  </>
}

function Lector({ archivo, volver }: { archivo: ArchivoMemoria; volver: () => void }) {
  const { data, error } = useFuente<{ ruta: string; texto: string; oculto: boolean; bytes: number }>(`${URL_MEMORIA}?leer=${encodeURIComponent(archivo.ruta)}`)
  return <div className={m.lector}>
    <div className={m.lectorBarra}>
      <button onClick={volver}><ArrowLeft size={14} aria-hidden />{tr('Memoria')}</button>
      {!archivo.oculto && <button onClick={() => redactar(tr('Sobre la memoria {ruta} («{titulo}»): ', { ruta: `\`.claude/memory/${archivo.ruta}\``, titulo: archivo.titulo }))} title={tr('Deja la cita en la caja del chat para que escribas qué está mal')}><PenLine size={14} aria-hidden />{tr('Corregir esto')}</button>}
    </div>
    <p className={m.lectorMeta}><code>{archivo.ruta}</code> · {fecha(archivo.fecha)} · {miles(archivo.bytes)} bytes</p>
    {archivo.triggers.length > 0 && <p className={m.lectorMeta}>{tr('Se recuerda cuando dices: {lista}', { lista: archivo.triggers.join(', ') })}</p>}
    {!data ? <div className={m.cargando}>{error ? <p className={l.aviso}>{error}</p> : tr('Abriendo…')}</div>
      : data.oculto ? <p className={m.oculto}><Lock size={14} aria-hidden />{tr('Contenido oculto: guarda credenciales. Aquí solo se ve el nombre.')}</p>
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
  if (!data) return <div className={m.cargando} aria-busy="true">{error ? <p className={l.aviso}>{error}</p> : tr('Midiendo la ventana… (la primera vez tarda unos segundos)')}</div>
  const medir = async () => {
    setMidiendo(true); setFallo(null)
    try {
      const r = await fetch(urlContexto(activa, true), { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? tr('respondió {estado}', { estado: r.status }))
      await releer(url)
    } catch (e) { setFallo(e instanceof Error ? e.message : tr('no se pudo medir')) } finally { setMidiendo(false) }
  }
  const { ventana, usado, fuenteUsado, segmentos } = capas(data)
  const c = data.conversacion
  const d = data.desglose?.datos
  const dif = diferidas(data)
  return <>
    <Conversacion id={c?.id ?? null} activa={activa} />
    <div className={`${m.heroe} ${l.entra}`} style={escalon(1)}>
      <p className={`${l.serif} ${m.titular}`}>{ventana ? trNodos('Esta conversación ocupa {usado} de {ventana}', { usado: <b>{fmtTokens(usado)}</b>, ventana: fmtTokens(ventana) }) : trNodos('Esta conversación ocupa {usado} tokens', { usado: <b>{fmtTokens(usado)}</b> })}</p>
      <p className={m.sub}>{ventana ? `${tr('{pct} de la ventana', { pct: fmtPct(usado, ventana) })} · ` : ''}{data.ventana.modelo ?? c?.modelo ?? tr('modelo sin dato')}{c ? ` · ${tr('{turnos} mensajes tuyos · {llamadas} llamadas al modelo', { turnos: c.turnos, llamadas: c.llamadas })}` : ''}{c?.compactaciones.length ? ` · ${trn(c.compactaciones.length, 'compactada 1 vez', 'compactada {n} veces')}` : ` · ${tr('sin compactar')}`}</p>
      <Barra segmentos={segmentos} ventana={ventana ?? usado} />
      <ul className={m.leyenda}>{segmentos.filter(s => s.id !== 'libre' || ventana).map(s => <li key={s.id}>
        <i style={{ background: COLOR[s.id] }} data-id={s.id} aria-hidden />
        <span className={m.leyendaNombre}>{s.nombre}</span>
        <span className={m.leyendaCifra}>{fmtTokens(s.tokens)} <small>{fmtPct(s.tokens, ventana)}</small></span>
        <span className={m.fuenteTag} data-fuente={s.fuente}>{tr(s.fuente)}</span>
      </li>)}</ul>
      <p className={l.fuente}>{c?.ultima ? tr('Lo usado sale de la última llamada al modelo ({fuente}: entrada + caché creada + caché leída, {hora}).', { fuente: tr(fuenteUsado), hora: hora(c.ultima.en) }) : tr('Lo usado sale de la última llamada al modelo ({fuente}: entrada + caché creada + caché leída).', { fuente: tr(fuenteUsado) })}</p>
    </div>

    {c?.ultimoTurno && <UltimoMensaje a={data} />}

    <section aria-label={tr('Las capas')}>
      <div className={l.seccion}><h4>{tr('Qué entra, de lo fijo a lo que crece')}</h4></div>
      <ol className={m.capas}>
        <Capa n={1} titulo={tr('System prompt del proveedor')} cifra={segmentos[0]} grande={grande}>
          <p>{tr('Lo escribe Anthropic (Claude Code / Agent SDK), no nosotros: quién es el agente, cómo usa herramientas, el entorno. Va primero en cada llamada.')}</p>
          {d?.secciones?.length ? <Detalle resumen={tr('{n} secciones contadas por el SDK', { n: d.secciones.length })}>{d.secciones.map(x => <Fila key={x.nombre} nombre={x.nombre} tokens={x.tokens} />)}</Detalle> : null}
          {d?.herramientasSistema?.length ? <Detalle resumen={tr('{n} herramientas internas', { n: d.herramientasSistema.length })}>{d.herramientasSistema.map(x => <Fila key={x.nombre} nombre={x.nombre} tokens={x.tokens} />)}</Detalle> : null}
        </Capa>
        <Capa n={2} titulo={tr('CLAUDE.md y sus imports')} cifra={segmentos[1]} grande={grande}>
          <p>{trNodos('Las reglas que gobiernan siempre, más {memory} (la esencia de mi memoria sobre ti) y {now} (tu agenda generada).', { memory: <code>@MEMORY.md</code>, now: <code>@now.md</code> })}</p>
          {d?.memoria.map(f => <Fila key={f.ruta} nombre={f.ruta} tokens={f.tokens} extra={(() => { const a = data.archivos.find(x => f.ruta.endsWith(x.ruta)); return a ? tr('{n} car.', { n: miles(a.caracteres) }) : undefined })()} />)}
        </Capa>
        <Capa n={3} titulo={tr('Skills y herramientas')} cifra={{ ...segmentos[2], tokens: segmentos[2].tokens + segmentos[3].tokens }} grande={grande}>
          <p>{tr('De cada skill entra solo su nombre y descripción ({n} skills); el cuerpo se lee cuando la uso. De las herramientas MCP entran las que ya están cargadas.', { n: d?.skills.length ?? '—' })}</p>
          {dif > 0 && <p className={m.nota}>{trNodos('Otras {tokens} de herramientas existen pero {noEntran}: quedan diferidas hasta que las busco (ToolSearch).', { tokens: fmtTokens(dif), noEntran: <b>{tr('no entran')}</b> })}</p>}
          {d?.skills.length ? <Detalle resumen={tr('Skills · {tokens}', { tokens: fmtTokens(segmentos[2].tokens) })}>{d.skills.slice(0, 80).map(x => <Fila key={x.nombre + x.origen} nombre={x.nombre} tokens={x.tokens} extra={x.origen === 'projectSettings' ? tr('tuya') : x.origen === 'userSettings' ? tr('usuario') : x.origen} />)}</Detalle> : null}
          {d?.mcp.length ? <Detalle resumen={tr('Servidores MCP · {n}', { n: d.mcp.length })}>{d.mcp.map(x => <Fila key={x.servidor} nombre={x.servidor.replace(/^claude_ai_/, '').replace(/_/g, ' ')} tokens={x.tokens} extra={tr('{n} herr.', { n: x.herramientas })} />)}</Detalle> : null}
        </Capa>
        <Capa n={4} titulo={tr('Lo que se inyecta en cada mensaje')} cifra={c?.inyeccion ? { id: 'historial', nombre: '', tokens: estimar(c.inyeccion.caracteres, data.tokensPorCaracter), fuente: 'estimado', nota: '' } : null} grande={grande}>
          <p>{trNodos('Antes de que yo lea tu mensaje, el hook {hook} ({script}) le pega: rutas por intención, las memorias cuyo disparador tocaste y la agenda del turno. Se queda en el historial.', { hook: <code>UserPromptSubmit</code>, script: <code>memory-recall.py</code> })}</p>
          <Detalle resumen={tr('Ganchos configurados · {n}', { n: data.ganchos.length })}>{data.ganchos.map((g, i) => <p key={i} className={m.gancho}><b>{g.evento}</b> <code>{g.comando}</code></p>)}</Detalle>
        </Capa>
        <Capa n={5} titulo={tr('El historial de esta conversación')} cifra={segmentos[4]} grande={grande}>
          <p>{tr('Cada mensaje tuyo, mi respuesta, lo que leen las herramientas y lo inyectado. Crece con cada turno; al acercarse a la reserva, el SDK lo resume (compacta) y sigue.')}</p>
          {d?.mensajes && <Detalle resumen={tr('De qué está hecho (contado por el SDK)')}>
            <Fila nombre={tr('Resultados de herramientas')} tokens={d.mensajes.resultados} /><Fila nombre={tr('Llamadas a herramientas')} tokens={d.mensajes.llamadas} />
            <Fila nombre={tr('Mis respuestas')} tokens={d.mensajes.asistente} /><Fila nombre={tr('Tus mensajes')} tokens={d.mensajes.usuario} />
            <Fila nombre={tr('Adjuntos e inyecciones')} tokens={d.mensajes.adjuntos} />
            {d.mensajes.adjuntosPorTipo.slice(0, 8).map(x => <Fila key={x.nombre} nombre={`· ${x.nombre}`} tokens={x.tokens} />)}
          </Detalle>}
          {c?.compactaciones.map((k, i) => <p key={i} className={m.nota}>{tr('Compactada {hora} ({modo}): {antes} → {despues}.', { hora: hora(k.en), modo: k.disparo === 'manual' ? tr('a mano') : tr('sola'), antes: k.antes != null ? fmtTokens(k.antes) : '—', despues: k.despues != null ? fmtTokens(k.despues) : '—' })}</p>)}
        </Capa>
      </ol>
    </section>

    {(error || fallo) && <p className={l.aviso}>{fallo ? tr('No pude medir: {fallo}.', { fallo }) : tr('{error} Se muestra la última medición.', { error })}</p>}
    <p className={l.fuente}>
      {data.desglose ? <>{tr('Desglose por capa: {fuente} ({hora}).', { fuente: data.desglose.fuente === 'turno' ? tr('getContextUsage del SDK guardado en un turno de esta conversación') : tr('/context del SDK en una sesión vacía con la misma configuración del proyecto (aún no hay desglose guardado de esta conversación)'), hora: hora(data.desglose.en) })} </> : `${tr('Sin desglose por capa todavía.')} `}
      {data.tokensPorCaracter ? tr('Totales: usage de cada llamada en el transcript del SDK. Ventana: {fuente}. Lo «estimado» usa la razón tokens/carácter que el SDK midió en CLAUDE.md ({razon}).', { fuente: data.ventana.fuente, razon: data.tokensPorCaracter.toFixed(2) }) : tr('Totales: usage de cada llamada en el transcript del SDK. Ventana: {fuente}. Lo «estimado» usa la razón tokens/carácter que el SDK midió en CLAUDE.md.', { fuente: data.ventana.fuente })}
      <button className={m.medir} onClick={medir} disabled={midiendo} aria-busy={midiendo}><RefreshCw size={12} aria-hidden className={midiendo ? m.gira : undefined} />{midiendo ? tr('Midiendo…') : tr('Medir ahora')}</button>
    </p>
  </>
}

function Conversacion({ id, activa }: { id: string | null; activa: string | null }) {
  const titulo = useTituloConversacion(id ?? '')
  if (!id) return <p className={l.aviso}>{tr('Aún no hay una conversación de Arbrain medida: abre una en el chat.')}</p>
  return <p className={m.conversacion}>{activa ? tr('Esta conversación') : tr('La conversación más reciente')} · <b>{titulo}</b></p>
}

function Barra({ segmentos, ventana }: { segmentos: Segmento[]; ventana: number }) {
  return <div className={m.barra} role="img" aria-label={segmentos.map(s => `${s.nombre}: ${fmtTokens(s.tokens)}`).join('; ')}>
    {segmentos.filter(s => s.tokens > 0).map(s => <span key={s.id} data-id={s.id} title={`${s.nombre}: ${fmtTokens(s.tokens)} (${tr(s.fuente)})`}
      style={{ width: `${Math.max(pct(s.tokens, ventana), s.id === 'libre' || s.id === 'reserva' ? 0 : 0.6)}%`, background: COLOR[s.id] }} />)}
  </div>
}

function UltimoMensaje({ a }: { a: Anatomia }) {
  const t = a.conversacion!.ultimoTurno!
  const iny = a.conversacion!.inyeccion
  const p = t.primera
  return <section aria-label={tr('Tu último mensaje')} className={m.ultimo}>
    <div className={l.seccion}><h4>{tr('Qué se mandó en tu último mensaje')}</h4><small>{hora(t.en)}</small></div>
    <ul className={m.mandado}>
      <li><span>{tr('Tu mensaje')}</span><b>{tr('{n} car.', { n: miles(t.caracteres) })}</b><small>{tr('≈ {n} tokens · estimado', { n: fmtTokens(estimar(t.caracteres, a.tokensPorCaracter)) })}</small></li>
      {iny && <li><span>{tr('Inyectado por el hook')}</span><b>{tr('{n} car.', { n: miles(iny.caracteres) })}</b><small>{tr('≈ {n} tokens · estimado', { n: fmtTokens(estimar(iny.caracteres, a.tokensPorCaracter)) })} · {iny.partes.map(x => `${x.nombre.toLowerCase()} ${miles(x.caracteres)}`).join(' · ')}</small></li>}
      {p && <li><span>{tr('Releído de caché')}</span><b>{fmtTokens(p.uso.cacheLectura)}</b><small>{tr('todo lo anterior, sin volver a procesarlo · medido')}</small></li>}
      {p && <li><span>{tr('Nuevo en esta llamada')}</span><b>{fmtTokens(p.uso.cacheCreacion + p.uso.input)}</b><small>{tr('mi respuesta anterior + tu mensaje + la inyección · medido')}</small></li>}
      {p && <li><span>{tr('Total que vio el modelo')}</span><b>{fmtTokens(p.total)}</b><small>{t.llamadas > 2 ? tr('y {n} llamadas más con herramientas en ese turno', { n: t.llamadas - 1 }) : t.llamadas === 2 ? tr('y una llamada más con herramientas en ese turno') : tr('una sola llamada en ese turno')} · {tr('medido')}</small></li>}
    </ul>
    {iny && <details className={m.inyectado}><summary><ChevronRight size={12} aria-hidden />{tr('Ver el bloque inyectado tal cual')}</summary><pre>{iny.texto}</pre></details>}
  </section>
}

function Capa({ n, titulo, cifra, children, grande }: { n: number; titulo: string; cifra: Segmento | null; children: React.ReactNode; grande?: boolean }) {
  return <li className={m.capa} data-grande={grande || undefined}>
    <div className={m.capaCab}><span className={m.capaN}>{n}</span><h5>{titulo}</h5>{cifra && <span className={m.capaCifra}>{fmtTokens(cifra.tokens)} <span className={m.fuenteTag} data-fuente={cifra.fuente}>{tr(cifra.fuente)}</span></span>}</div>
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
  return d ? tr('{n} memorias', { n: d.archivos.length }) : null
}
