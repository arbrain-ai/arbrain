'use client'
import { useState, type CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Lock, Send, Undo2 } from 'lucide-react'
import { DRIP, type Cuadrante } from './drip'
import { useGobierno } from './gobierno'
import type { PlanEvent } from './types'
import s from './drip.module.css'

/** Arriba lo que te paga, abajo lo que paga poco; a la izquierda lo que te drena, a la derecha lo que te enciende. */
const MATRIZ: Cuadrante[] = ['reemplazar', 'producir', 'delegar', 'invertir']
const sinEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()

/** El encargo que «Delegar a Levy» deja en el chat: Levy arma el plan y pregunta; no ejecuta nada por su cuenta. */
export function encargoDeDelegar(e: PlanEvent, c: Cuadrante): string {
  const cuando = e.allDay ? format(parseISO(e.start), "EEEE d 'de' MMMM", { locale: es }) : `${format(parseISO(e.start), "EEEE d 'de' MMMM, HH:mm", { locale: es })} – ${format(parseISO(e.end), 'HH:mm')}`
  const contexto = (e.description ?? '').replace(/\[(?:protegido|delegado[^\]]*)\]/gi, '').trim()
  return [`Levy, te delego «${sinEmoji(e.title)}» (${DRIP[c].nombre}: ${DRIP[c].lema.toLowerCase()}).`, `En mi calendario: ${cuando}${e.recurringEventId ? ', se repite' : ''}.`,
    contexto ? `Contexto: ${contexto.slice(0, 600)}` : '',
    'Arma el encargo: cómo lo harías tú, qué necesitas de mí y qué me entregas. No ejecutes nada hasta que te lo confirme.'].filter(Boolean).join('\n')
}

/**
 * DRIP en la hoja del evento (24 oct 2026): la matriz con el cuadrante de este evento, un toque para corregirlo (se recuerda por
 * serie y título, en el almacén), la etiqueta «delegable» con «Delegar a Levy» (deja el encargo en el chat y lo marca como de
 * Levy) y, en Producir, proteger el bloque (por la pluma, con ⌘Z).
 */
export function HojaDrip({ evento, onListo }: { evento: PlanEvent; onListo?: () => void }) {
  const g = useGobierno()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (!g) return null
  const l = g.lectura(evento)
  const correr = async (f: () => Promise<unknown>) => { setOcupado(true); setError(null); try { await f() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setOcupado(false) } }
  const conOtros = Boolean(evento.meetUrl) || (evento.attendees ?? []).some(a => !a.self)
  const delegarALevy = () => correr(async () => {
    await g.delegar(evento, true)
    g.conversar?.(encargoDeDelegar(evento, l.cuadrante))
    if (g.conversar) onListo?.()
  })
  return <section className={s.hojaDrip} aria-label="DRIP" style={{ '--c': DRIP[l.cuadrante].color } as CSSProperties}>
    <header className={s.hojaCabeza}>
      <span className={s.rotulo}>DRIP</span>
      <span className={s.origen}>{l.origen === 'corregido'
        ? <>{l.porque}{l.inferido !== l.cuadrante && <> · <button className={s.enlace} disabled={ocupado} onClick={() => correr(() => g.corregir(evento, null))}>volver a lo de Levy ({DRIP[l.inferido].nombre})</button></>}</>
        : <>Levy: {l.porque}</>}</span>
    </header>
    <div className={s.matrizHoja} role="radiogroup" aria-label="Cuadrante DRIP de este evento">
      <span className={s.ejeY} aria-hidden><span>te paga</span><span>paga poco</span></span>
      <div className={s.cuatro}>{MATRIZ.map(c => { const d = DRIP[c]
        return <button key={c} role="radio" aria-checked={l.cuadrante === c} disabled={ocupado} style={{ '--c': d.color } as CSSProperties} title={d.lema}
          onClick={() => l.cuadrante !== c && correr(() => g.corregir(evento, c === l.inferido && l.origen === 'corregido' ? null : c))}>
          <i aria-hidden /><b>{d.nombre}</b><small>{d.paga ? 'paga' : 'paga poco'} · {d.enciende ? 'enciende' : 'drena'}</small></button> })}</div>
      <span className={s.ejeX} aria-hidden><span>te drena</span><span>te enciende</span></span>
    </div>
    <p className={s.alcance}>Un toque lo corrige para {evento.recurringEventId ? 'toda la serie' : 'todo lo que se llame así'}.</p>
    {l.delegable && <div className={s.delegableFila}>
      <span className={s.etiquetaDelegable}>{l.delegadoA ? `de ${l.delegadoA}` : 'delegable'}</span>
      {l.delegadoA
        ? <button className={s.boton} disabled={ocupado} onClick={() => correr(() => g.delegar(evento, false))}><Undo2 size={13} aria-hidden />Vuelve a ser mío</button>
        : <button className={`${s.boton} ${s.botonFuerte}`} disabled={ocupado} onClick={() => void delegarALevy()} title="Deja el encargo en el chat y lo marca como de Levy. Levy no ejecuta nada sin tu sí."><Send size={13} aria-hidden />Delegar a Levy</button>}
    </div>}
    {l.cuadrante === 'producir' && g.proteger && evento.editable && !conOtros && <button className={s.proteger} aria-pressed={l.protegido} disabled={ocupado}
      onClick={() => correr(() => g.proteger!(evento, !l.protegido))} title="Se escribe en Google por la misma pluma; ⌘Z lo deshace">
      <Lock size={13} aria-hidden />{l.protegido ? 'Protegido: nada nuevo entra encima' : 'Proteger este bloque'}</button>}
    {error && <p className={s.error} role="alert">{error}</p>}
  </section>
}
