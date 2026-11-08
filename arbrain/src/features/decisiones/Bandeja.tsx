'use client'
/**
 * Bandeja de decisiones única (autonomía v2, 3 nov 2026). Una tarjeta por decisión con la recomendación de Levy y tres
 * botones: Sí · No · Otro. Una por una, en lote (Sí a las que Levy recomienda) o todas en orden, la más vieja primero.
 * Debajo, «Lo que hice solo» (una línea por acción, con Deshacer cuando se puede), los minutos que el sistema esperó por
 * ti y la política (Cauteloso · Equilibrado · Piloto automático). Si no contestas, nada irreversible sale.
 * Vive en el panel (Lo que espera tu decisión) y a pantalla completa en el teléfono (/telefono/decisiones).
 */
import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, CornerUpLeft, ExternalLink, MessageSquare, Repeat, X } from 'lucide-react'
import { zonaDueno } from '@/shared/lib/zona-dueno'
import { useBandeja } from './useBandeja'
import { deshacible, enOrden, estadoDecidida, etiquetaCategoria, fraseEspera, hora, lineaRecomendacion, recomendadas, urlVistaPrevia, type HechoSolo, type Tarjeta } from './lib/bandeja'
import s from './bandeja.module.css'

export function Bandeja({ donde = 'panel', enfocar }: { donde?: 'panel' | 'telefono'; enfocar?: string | null }) {
  const b = useBandeja()
  const [uno, setUno] = useState(donde === 'telefono')
  const [verAyer, setVerAyer] = useState(false)
  const v = b.vista
  if (!v) return <section className={s.bandeja} data-donde={donde} aria-label="Decisiones"><p className={s.nota}>{b.error ? `La bandeja no responde: ${b.error}` : 'Cargando decisiones…'}</p></section>
  const lista = enOrden(v.pendientes)
  // Lo que pidió el push va primero.
  const ordenadas = enfocar && lista.some(t => t.id === enfocar) ? [lista.find(t => t.id === enfocar)!, ...lista.filter(t => t.id !== enfocar)] : lista
  const rec = recomendadas(lista)
  const zona = zonaDueno()
  return <section className={s.bandeja} data-donde={donde} aria-label="Decisiones" data-bandeja>
    <header className={s.cabeza}>
      <h3>Esperan tu toque <small>{lista.length}</small></h3>
      <p className={s.espera} data-espera>{fraseEspera(v.espera.hoy)}{v.espera.ayer.tarjetas ? ` Ayer: ${v.espera.ayer.minutos} min.` : ''}</p>
    </header>

    {lista.length > 1 && <div className={s.barra}>
      <button className={s.secundario} onClick={() => setUno(!uno)}>{uno ? 'Ver todas' : 'Una por una'}</button>
      {rec.length > 1 && <button className={s.secundario} disabled={!!b.ocupado} onClick={() => void b.lote(rec.map(t => t.id), 'si')} title="Solo las que recomiendo y no contactan personas ni pagan: esas van una por una">Sí a todas · {rec.length}</button>}
    </div>}

    {lista.length === 0
      ? <p className={s.vacio}>Nada espera tu decisión. Lo irreversible te llega aquí antes de salir.</p>
      : <div className={s.tarjetas}>{(uno ? ordenadas.slice(0, 1) : ordenadas).map(t => <TarjetaDecision key={t.id} t={t} ocupado={b.ocupado === t.id} onResponder={(r, c) => b.resolver(t.id, r, c)} />)}
        {uno && lista.length > 1 && <p className={s.nota}>Faltan {lista.length - 1} después de esta.</p>}
      </div>}
    {b.error && <p className={s.error} role="alert">{b.error}</p>}

    <HechoSoloLista titulo="Lo que hice solo" filas={v.hechoSolo.hoy} dia={v.espera.hoy.dia} zona={zona} ocupado={b.ocupado} onDeshacer={b.deshacer} vacio="Hoy no he hecho nada solo todavía." />
    {v.hechoSolo.ayer.length > 0 && <>
      <button className={s.plegar} onClick={() => setVerAyer(!verAyer)}>{verAyer ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Ayer ({v.hechoSolo.ayer.length})</button>
      {verAyer && <HechoSoloLista filas={v.hechoSolo.ayer} dia={v.espera.ayer.dia} zona={zona} ocupado={b.ocupado} onDeshacer={b.deshacer} />}
    </>}

    {(v.decididasHoy.length > 0 || (v.vencidasHoy?.length ?? 0) > 0) && <details className={s.decididas}>
      <summary>Decidiste hoy ({v.decididasHoy.length}){v.vencidasHoy?.length ? ` · ${v.vencidasHoy.length} ya no aplica${v.vencidasHoy.length === 1 ? '' : 'n'}` : ''}</summary>
      <ul>{[...v.decididasHoy, ...(v.vencidasHoy ?? [])].map(t => <li key={t.id}><span>{t.titulo}</span><b data-respuesta={t.respuesta ?? t.estado}>{estadoDecidida(t)}</b></li>)}</ul>
    </details>}

    <Politica politica={v.politica} ocupado={b.ocupado === 'politica'} onElegir={p => void b.politica(p, v.politica.ajustes ?? {})} />
  </section>
}

/** Una tarjeta Sí · No · Otro. También la pinta «Revisar» de los loops de negocio (la misma tarjeta, la misma tienda). */
export function TarjetaDecision({ t, ocupado, onResponder }: { t: Tarjeta; ocupado: boolean; onResponder: (r: 'si' | 'no' | 'otro', comentario?: string) => Promise<boolean> }) {
  const [otro, setOtro] = useState(false)
  const [texto, setTexto] = useState('')
  const [ver, setVer] = useState(false)
  const rec = lineaRecomendacion(t)
  const exacto = t.detalle ?? t.literal, vista = urlVistaPrevia(t)
  return <article className={s.tarjeta} data-decision={t.id} data-recomienda={t.recomienda ?? ''}>
    <div className={s.tarjetaCabeza}>
      <span className={s.categoria} data-categoria={t.categoria}>{etiquetaCategoria(t.categoria)}</span>
      {t.irreversible && <span className={s.irreversible}>irreversible</span>}
      {t.de && <span className={s.de} title="La subió un loop de negocio: revisó solo y esto pide tu decisión"><Repeat size={11} aria-hidden />{t.de}</span>}
      <time>{new Date(t.creada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
    </div>
    <p className={s.titulo}>{t.titulo}</p>
    {vista && <img className={s.vista} src={vista} alt="Vista previa de lo que se publica" loading="lazy" />}
    {rec && <p className={s.recomendacion} data-tono={t.recomienda === 'no' ? 'no' : 'si'}><b>Levy</b> {rec}</p>}
    {exacto && <>
      <button className={s.plegar} onClick={() => setVer(!ver)}>{ver ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Qué sale exactamente</button>
      {ver && <pre className={s.exacto}>{exacto}</pre>}
    </>}
    {t.tipo === 'manos'
      ? <p className={s.nota}>Esto lo corres tú desde su tarjeta en el chat.</p>
      : otro
        ? <form className={s.otro} onSubmit={e => { e.preventDefault(); if (texto.trim()) void onResponder('otro', texto.trim()).then(ok => { if (ok) { setOtro(false); setTexto('') } }) }}>
          <textarea autoFocus rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="¿Qué quieres en su lugar?" aria-label="Qué quieres en su lugar" />
          <div className={s.botones}>
            <button type="button" className={s.secundario} onClick={() => setOtro(false)}>Cancelar</button>
            <button type="submit" className={s.si} disabled={!texto.trim() || ocupado}>Mandar a Levy</button>
          </div>
        </form>
        : <div className={s.botones}>
          <button className={s.si} disabled={ocupado} onClick={() => void onResponder('si')} aria-label="Sí" data-respuesta="si"><Check size={15} aria-hidden /> {t.botonSi ?? 'Sí'}</button>
          <button className={s.no} disabled={ocupado} onClick={() => void onResponder('no')} aria-label="No" data-respuesta="no"><X size={15} aria-hidden /> No</button>
          <button className={s.secundario} disabled={ocupado} onClick={() => setOtro(true)} aria-label="Otro" data-respuesta="otro"><MessageSquare size={14} aria-hidden /> Otro</button>
        </div>}
  </article>
}

function HechoSoloLista({ titulo, filas, dia, zona, ocupado, onDeshacer, vacio }: { titulo?: string; filas: HechoSolo[]; dia: string; zona: string; ocupado: string | null; onDeshacer: (ts: string, dia: string) => Promise<boolean>; vacio?: string }) {
  return <div className={s.hechoSolo} data-hecho-solo>
    {titulo && <h4>{titulo} <small>{filas.length}</small></h4>}
    {!filas.length && vacio ? <p className={s.nota}>{vacio}</p> : <ul>
      {filas.map(h => <li key={h.ts}>
        <time>{hora(h.ts, zona)}</time>
        <span className={s.que}>{h.que}</span>
        {h.enlace && <a className={s.deshacer} href={h.enlace} target="_blank" rel="noreferrer" title={h.enlace}><ExternalLink size={13} aria-hidden /> Ver</a>}
        {deshacible(h)
          ? <button className={s.deshacer} disabled={ocupado === `deshacer:${h.ts}`} onClick={() => void onDeshacer(h.ts, dia)} title={h.deshacer ? `Levy lo deshace: ${h.deshacer}` : 'Levy lo deshace'}><CornerUpLeft size={13} aria-hidden /> Deshacer</button>
          : h.deshacer ? <span className={s.comoDeshacer} title={h.deshacer}>se deshace {h.deshacer}</span> : null}
      </li>)}
    </ul>}
  </div>
}

function Politica({ politica, ocupado, onElegir }: { politica: import('./lib/bandeja').PoliticaApp; ocupado: boolean; onElegir: (p: import('./lib/bandeja').Preset) => void }) {
  const actual = politica.presets.find(p => p.id === politica.preset)
  const irreversibles = politica.clases.filter(c => c.irreversible).map(c => c.nombre.toLowerCase())
  return <details className={s.politica} data-politica>
    <summary>Autonomía: <b>{actual?.nombre ?? politica.preset}</b></summary>
    <div className={s.presets} role="radiogroup" aria-label="Política de autonomía">
      {politica.presets.map(p => <button key={p.id} role="radio" aria-checked={p.id === politica.preset} disabled={ocupado} className={s.preset} data-activo={p.id === politica.preset || undefined} onClick={() => onElegir(p.id)}>
        <b>{p.nombre}</b><span>{p.que}</span>
      </button>)}
    </div>
    <p className={s.nota}>Siempre espera tu toque: {irreversibles.join(', ')}. Siempre tuyo: {politica.siempreTuyo.join(', ')}.</p>
  </details>
}
