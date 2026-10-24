'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import { Check, Lock } from 'lucide-react'
import { DRIP } from './drip'
import { useGobierno } from './gobierno'
import type { Bloque } from './dia-vivo'
import { hora } from './vivo-piezas'
import s from './drip.module.css'

/** Hasta qué hora del día de hoy se ofrece el toque (Martell, p. 136: la revisión de 15 min es cada mañana). */
export const HORA_LIMITE_MANANA = 12

const sinEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()

/** El bloque de Producir del día que se propone proteger: el más largo que aún no termina (sin invitados: esos no se tocan). */
export function bloqueDelDia<B extends Pick<Bloque, 'inicio' | 'fin'>>(producir: readonly B[], ahora: number): B | null {
  return [...producir].filter(b => b.fin > ahora).sort((a, b) => (b.fin - b.inicio) - (a.fin - a.inicio) || a.inicio - b.inicio)[0] ?? null
}

/**
 * Un toque cada mañana (24 oct 2026, Daniel: «un toque cada mañana»). En el Día de hoy, antes de las 12, una tarjeta breve con el
 * día que tu semana ya decidió: tu bloque de Producir (se protege al aceptar), si el objetivo ya está fijado y dónde están tus
 * 3 casillas. No repite el objetivo (está justo arriba) ni cuenta casillas (eso es de Hábitos). Aceptado, desaparece.
 */
export function ToqueManana({ dia, bloques, objetivoFijado, ahora }: { dia: string; bloques: Bloque[]; objetivoFijado: boolean; ahora: number }) {
  const g = useGobierno()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const producir = useMemo(() => g ? bloques.filter(b => g.lectura(b.evento).cuadrante === 'producir') : [], [g, bloques])
  if (!g || !g.doc || g.doc.mananas[dia] || new Date(ahora).getHours() >= HORA_LIMITE_MANANA) return null
  const b = bloqueDelDia(producir, ahora)
  const l = b ? g.lectura(b.evento) : null
  const conOtros = b ? Boolean(b.evento.meetUrl) || (b.evento.attendees ?? []).some(a => !a.self) : false
  const protegible = Boolean(b && l && !l.protegido && b.evento.editable && !conOtros && g.proteger)
  const aceptar = async () => {
    setOcupado(true); setError(null)
    try {
      if (b && protegible) await g.proteger!(b.evento, true)
      await g.aceptarManana(dia)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setOcupado(false) }
  }
  return <section className={s.manana} aria-label="Tu día, propuesto" style={{ '--c': DRIP.producir.color } as CSSProperties}>
    <p className={s.mananaCeja}>Tu día, propuesto por tu semana</p>
    <ol className={s.mananaFilas}>
      <li data-tipo="producir">{b ? <><Lock size={12} aria-hidden /><span><b>{hora(b.inicio)}–{hora(b.fin)}</b> {sinEmoji(b.titulo)}</span><small>{l?.protegido ? 'protegido' : protegible ? 'se protege al aceptar' : 'Producir'}</small></>
        : <><i className={s.puntoVacio} aria-hidden /><span>Sin bloque de Producir hoy</span><small>ábrele un hueco</small></>}</li>
      <li>{objetivoFijado ? <><Check size={12} aria-hidden /><span>Objetivo fijado</span><small>en su caja</small></> : <><i className={s.puntoVacio} aria-hidden /><span>Falta el objetivo del día</span><small>fíjalo en su caja</small></>}</li>
      <li><i className={s.puntoVacio} aria-hidden /><span>Tus 3 casillas</span><small>en Hábitos de hoy</small></li>
    </ol>
    <button className={s.aceptar} disabled={ocupado} onClick={() => void aceptar()}>{ocupado ? 'Guardando…' : 'Acepto mi día'}</button>
    {error && <p className={s.error} role="alert">{error}</p>}
  </section>
}
